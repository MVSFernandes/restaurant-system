#!/bin/sh
# Prova que uma única imagem do frontend serve duas instalações, sem novo build,
# e que ela recusa configuração ausente ou chave não pública.
#
# Uso: sh frontend/scripts/verify-runtime-image.sh <imagem já construída>
# Precisa de Docker e curl. Usa só destinos simulados: nada é contatado, e os
# containers são removidos ao final.
#
# O Nginx da imagem precisa encontrar o host "backend" ao subir. Aqui ele é
# resolvido para o próprio container, porque nenhuma chamada à API é feita.

set -eu

IMAGE="${1:?Informe a imagem, por exemplo restaurant-frontend:latest}"
PORT_A="${VERIFY_PORT_A:-18081}"
PORT_B="${VERIFY_PORT_B:-18082}"
NAME_A="rs-runtime-verify-a"
NAME_B="rs-runtime-verify-b"
WORK="$(mktemp -d)"

cleanup() {
  docker rm -f "$NAME_A" "$NAME_B" > /dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

die() {
  echo "FALHOU: $1" >&2
  exit 1
}
ok() {
  echo "ok - $1"
}

base64url() {
  printf '%s' "$1" | base64 | tr -d '=\r\n' | tr '/+' '_-'
}
fake_jwt() {
  echo "$(base64url '{"alg":"none"}').$(base64url "$1").simulated-signature"
}

URL_A="https://instalacao-a.example.test"
URL_B="https://instalacao-b.example.test"
# A nota prova que estas palavras são aceitas dentro de strings, no jq da imagem.
KEY_A="$(fake_jwt '{"role":"anon","ref":"a","note":"nan NaN Infinity -Infinity"}')"
KEY_B="$(fake_jwt '{"role":"anon","ref":"b"}')"

start() { # nome porta api url chave
  docker run -d --name "$1" -p "127.0.0.1:$2:80" --add-host backend:127.0.0.1 \
    -e "PUBLIC_API_URL=$3" -e "PUBLIC_SUPABASE_URL=$4" -e "PUBLIC_SUPABASE_ANON_KEY=$5" \
    "$IMAGE" > /dev/null
}
wait_ready() { # porta
  attempt=0
  until curl -fsS "http://127.0.0.1:$1/runtime-config.json" -o /dev/null 2> /dev/null; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 30 ] || die "o container da porta $1 não respondeu"
    sleep 1
  done
}
tree_hash() { # container
  docker exec "$1" sh -c "cd /usr/share/nginx/html && find . -type f ! -name runtime-config.json | sort | xargs sha256sum | sha256sum"
}

start "$NAME_A" "$PORT_A" /api "$URL_A" "$KEY_A"
start "$NAME_B" "$PORT_B" https://api-b.example.test/api "$URL_B" "$KEY_B"
wait_ready "$PORT_A"
wait_ready "$PORT_B"

[ "$(docker inspect -f '{{.Image}}' "$NAME_A")" = "$(docker inspect -f '{{.Image}}' "$NAME_B")" ] \
  || die "os containers não usam a mesma imagem"
ok "os dois containers usam a mesma imagem"

curl -fsS "http://127.0.0.1:$PORT_A/runtime-config.json" -o "$WORK/a.json"
curl -fsS "http://127.0.0.1:$PORT_B/runtime-config.json" -o "$WORK/b.json"
grep -q "\"supabaseUrl\":\"$URL_A\"" "$WORK/a.json" && grep -q '"apiUrl":"/api"' "$WORK/a.json" \
  || die "a instalação A não recebeu a própria configuração"
grep -q "\"supabaseUrl\":\"$URL_B\"" "$WORK/b.json" && grep -q '"apiUrl":"https://api-b.example.test/api"' "$WORK/b.json" \
  || die "a instalação B não recebeu a própria configuração"
ok "cada instalação serve a própria configuração"

[ "$(tree_hash "$NAME_A")" = "$(tree_hash "$NAME_B")" ] || die "os arquivos da aplicação diferem"
ok "os arquivos da aplicação são idênticos"

curl -fsS -D "$WORK/headers" -o /dev/null "http://127.0.0.1:$PORT_A/runtime-config.json"
grep -qi '^cache-control: no-store' "$WORK/headers" || die "runtime-config.json pode ficar em cache"
grep -qi '^content-type: application/json' "$WORK/headers" || die "runtime-config.json não é servido como JSON"
ok "a configuração é servida como JSON e sem cache"

for value in "$URL_A" "$URL_B" "$KEY_A" "$KEY_B"; do
  # Decide pela saída: o grep devolve erro tanto para "não achou" quanto para falha.
  found="$(docker exec "$NAME_A" find /usr/share/nginx/html -type f ! -name runtime-config.json -exec grep -lF -- "$value" {} +)" || true
  [ -z "$found" ] || die "os arquivos da aplicação contêm um valor de instalação"
done
ok "os arquivos da aplicação não contêm valores das instalações"

if docker image inspect -f '{{json .Config.Env}}' "$IMAGE" | grep -Eq 'VITE_|PUBLIC_'; then
  die "a imagem carrega variáveis de instalação"
fi
ok "a imagem não carrega variáveis de instalação"

refuses() { # descrição, seguida dos argumentos -e
  description="$1"
  shift
  if docker run --rm --add-host backend:127.0.0.1 "$@" "$IMAGE" > "$WORK/refused.log" 2>&1; then
    die "$description: o container deveria recusar"
  fi
  grep -q 'runtime-config: configuração recusada' "$WORK/refused.log" || die "$description: sem mensagem clara"
  ok "$description: recusada"
}

SERVICE_KEY="$(fake_jwt '{"role":"service_role"}')"
refuses "configuração ausente"
refuses "URL do Supabase ausente" -e PUBLIC_API_URL=/api -e "PUBLIC_SUPABASE_ANON_KEY=$KEY_A"
refuses "URL inválida" -e PUBLIC_API_URL=/api -e PUBLIC_SUPABASE_URL=invalida -e "PUBLIC_SUPABASE_ANON_KEY=$KEY_A"
refuses "chave service_role" -e PUBLIC_API_URL=/api -e "PUBLIC_SUPABASE_URL=$URL_A" -e "PUBLIC_SUPABASE_ANON_KEY=$SERVICE_KEY"
if grep -qF -- "$SERVICE_KEY" "$WORK/refused.log"; then
  die "a chave recusada apareceu no log"
fi
ok "a chave recusada não aparece no log"

SUPABASE_REF_URL="https://abcdefghijklmnopqrst.supabase.co"
refuses "service_role com metadata.role anon" -e PUBLIC_API_URL=/api -e "PUBLIC_SUPABASE_URL=$URL_A" \
  -e "PUBLIC_SUPABASE_ANON_KEY=$(fake_jwt '{"role":"service_role","metadata":{"role":"anon"}}')"
refuses "ref de outro projeto com metadata.ref correspondente" -e PUBLIC_API_URL=/api -e "PUBLIC_SUPABASE_URL=$SUPABASE_REF_URL" \
  -e "PUBLIC_SUPABASE_ANON_KEY=$(fake_jwt '{"role":"anon","ref":"zzzzzzzzzzzzzzzzzzzz","metadata":{"ref":"abcdefghijklmnopqrst"}}')"
refuses "payload com JSON malformado" -e PUBLIC_API_URL=/api -e "PUBLIC_SUPABASE_URL=$URL_A" \
  -e "PUBLIC_SUPABASE_ANON_KEY=$(fake_jwt '{"role":"anon"')"
for literal in nan NaN Infinity -Infinity; do
  refuses "payload com o literal $literal" -e PUBLIC_API_URL=/api -e "PUBLIC_SUPABASE_URL=$URL_A" \
    -e "PUBLIC_SUPABASE_ANON_KEY=$(fake_jwt "{\"role\":\"anon\",\"x\":$literal}")"
done

echo "Mesma imagem validada com duas configurações."
