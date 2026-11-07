#!/bin/sh
# Gera o runtime-config.json quando o container sobe, a partir das variáveis da
# instalação. O entrypoint do Nginx executa este arquivo antes de iniciar; se ele
# falhar, o container não sobe. Assim a mesma imagem serve qualquer instalação.
#
# O arquivo gerado é público: qualquer visitante pode baixá-lo. Por isso só as
# três variáveis abaixo são lidas, e a chave é recusada se não for pública.
# As mesmas regras estão em src/config/runtimeConfig.ts, e
# tests/runtime-config.test.ts roda as duas implementações contra os mesmos casos.
#
# As mensagens citam os nomes das variáveis, nunca os valores.

set -u
export LC_ALL=C

OUTPUT="${RUNTIME_CONFIG_OUTPUT:-/usr/share/nginx/html/runtime-config.json}"
API_URL="${PUBLIC_API_URL:-}"
SUPABASE_URL="${PUBLIC_SUPABASE_URL:-}"
ANON_KEY="${PUBLIC_SUPABASE_ANON_KEY:-}"

FAILED=0
fail() {
  echo "runtime-config: $1" >&2
  FAILED=1
}

is_absolute_url() {
  case "$1" in
    *[!A-Za-z0-9._~:/-]*) return 1 ;;
  esac
  printf '%s' "$1" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$'
}

# http só em localhost; o resto precisa de https.
uses_allowed_scheme() {
  case "$1" in
    https://*) return 0 ;;
  esac
  host="${1#http://}"
  host="${host%%/*}"
  host="${host%%:*}"
  [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]
}

check_api_url() {
  [ -n "$API_URL" ] || { fail "PUBLIC_API_URL é obrigatória."; return; }
  case "$API_URL" in
    *[!A-Za-z0-9._~:/-]*) ;;
    *) if printf '%s' "$API_URL" | grep -Eq '^/[A-Za-z0-9._~-][A-Za-z0-9._~/-]*$'; then return; fi ;;
  esac
  if ! is_absolute_url "$API_URL"; then
    fail "PUBLIC_API_URL deve ser um caminho como /api ou uma URL http(s), sem parâmetros."
  elif ! uses_allowed_scheme "$API_URL"; then
    fail "PUBLIC_API_URL só pode usar http em localhost; use https."
  fi
}

SUPABASE_URL_OK=0
check_supabase_url() {
  [ -n "$SUPABASE_URL" ] || { fail "PUBLIC_SUPABASE_URL é obrigatória."; return; }
  if ! is_absolute_url "$SUPABASE_URL"; then
    fail "PUBLIC_SUPABASE_URL deve ser a URL http(s) do projeto, sem caminho."
    return
  fi
  rest="${SUPABASE_URL#*://}"
  rest="${rest%/}"
  case "$rest" in
    */*)
      fail "PUBLIC_SUPABASE_URL deve ser a URL http(s) do projeto, sem caminho."
      return
      ;;
  esac
  if ! uses_allowed_scheme "$SUPABASE_URL"; then
    fail "PUBLIC_SUPABASE_URL só pode usar http em localhost; use https."
    return
  fi
  SUPABASE_URL_OK=1
}

# Interpreta o payload do JWT com jq e responde ok, role ou ref. Só os campos do
# nível principal contam. Sem saída: não é um único objeto JSON válido.
# Não confere a assinatura. O payload não passa por variável, que perderia bytes.
#
# O parser do jq aceita o que não é JSON, como nan, Infinity, 01 e +1. Por isso o
# texto bruto (-Rs) é conferido antes: da esquerda para a direita, cada string,
# número e literal válidos saem do texto, e assim uma palavra dentro de uma string
# nunca é confundida com um valor. Só pode sobrar pontuação e espaço, e o fromjson
# confere depois a estrutura. O catch impede que o erro repita o conteúdo.
jwt_verdict() {
  segment="$(printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+')"
  case $(( ${#segment} % 4 )) in
    1) return 1 ;;
    2) segment="$segment==" ;;
    3) segment="$segment=" ;;
  esac
  printf '%s' "$segment" | base64 -d 2>/dev/null | jq -Rsj --arg url_ref "$2" '
    def json_string: "\"(?:[^\"\\\\\\x00-\\x1f]|\\\\[\"\\\\/bfnrt]|\\\\u[0-9a-fA-F]{4})*\"";
    def json_scalar: "(?:-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][-+]?[0-9]+)?|true|false|null)(?=[ \\t\\r\\n,\\]}]|\\z)";
    def has_only_json_tokens: gsub(json_string + "|" + json_scalar; "") | test("[^{}\\[\\]:, \\t\\r\\n]") | not;

    (if has_only_json_tokens then (try fromjson catch null) else null end) as $payload
    | if ($payload | type) != "object" then
        "invalid"
      elif $payload.role != "anon" then
        "role"
      elif $url_ref != "" and ($payload.ref | type) == "string" and $payload.ref != $url_ref then
        "ref"
      else
        "ok"
      end
  ' 2>/dev/null
}

check_anon_key() {
  invalid_format="PUBLIC_SUPABASE_ANON_KEY não tem o formato de uma chave pública do Supabase."
  [ -n "$ANON_KEY" ] || { fail "PUBLIC_SUPABASE_ANON_KEY é obrigatória."; return; }
  case "$ANON_KEY" in
    sb_secret_*)
      fail "PUBLIC_SUPABASE_ANON_KEY recebeu uma chave secreta; use a chave pública do projeto."
      return
      ;;
    *[!A-Za-z0-9._-]*)
      fail "$invalid_format"
      return
      ;;
  esac
  if printf '%s' "$ANON_KEY" | grep -Eq '^sb_publishable_[A-Za-z0-9_-]+$'; then
    return
  fi
  if ! printf '%s' "$ANON_KEY" | grep -Eq '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'; then
    fail "$invalid_format"
    return
  fi
  if ! command -v jq > /dev/null 2>&1; then
    fail "jq não encontrado; não é possível conferir PUBLIC_SUPABASE_ANON_KEY."
    return
  fi
  # A chave de um projeto ao lado da URL de outro. Domínio próprio não tem o ref.
  url_ref=""
  if [ "$SUPABASE_URL_OK" = "1" ]; then
    url_ref="$(printf '%s' "${SUPABASE_URL%/}" | sed -n 's#^https\{0,1\}://\([a-z0-9][a-z0-9]*\)\.supabase\.co\(:[0-9]*\)\{0,1\}$#\1#p')"
  fi
  case "$(jwt_verdict "$ANON_KEY" "$url_ref")" in
    ok) ;;
    role) fail "PUBLIC_SUPABASE_ANON_KEY deve ter o papel anon; nunca use a service_role no frontend." ;;
    ref) fail "PUBLIC_SUPABASE_ANON_KEY é de outro projeto: não corresponde a PUBLIC_SUPABASE_URL." ;;
    *) fail "$invalid_format" ;;
  esac
}

# Um arquivo antigo nunca sobrevive a uma configuração recusada.
rm -f "$OUTPUT"

check_api_url
check_supabase_url
check_anon_key

if [ "$FAILED" != "0" ]; then
  echo "runtime-config: configuração recusada; o frontend não vai subir." >&2
  exit 1
fi

TEMP_FILE="$OUTPUT.tmp"
if ! printf '{"apiUrl":"%s","supabaseUrl":"%s","supabaseAnonKey":"%s"}\n' \
  "${API_URL%/}" "${SUPABASE_URL%/}" "$ANON_KEY" > "$TEMP_FILE"; then
  echo "runtime-config: não foi possível escrever a configuração." >&2
  exit 1
fi
chmod 644 "$TEMP_FILE" && mv -f "$TEMP_FILE" "$OUTPUT" || {
  echo "runtime-config: não foi possível publicar a configuração." >&2
  exit 1
}
echo "runtime-config: configuração da instalação gerada."
