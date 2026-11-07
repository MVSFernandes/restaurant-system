# Configuração do frontend por instalação

Uma imagem do frontend por versão serve todas as instalações. O destino não entra no build: vem de `/runtime-config.json`, gerado quando o container sobe e carregado pelo navegador antes de criar os clientes da API e do Supabase.

## Variáveis

Todas são obrigatórias e **públicas**, pois qualquer visitante pode ler `/runtime-config.json`.

| Variável do container | Campo no arquivo | Valor |
| --- | --- | --- |
| `PUBLIC_API_URL` | `apiUrl` | `/api` (Nginx do próprio container) ou URL `https` do backend |
| `PUBLIC_SUPABASE_URL` | `supabaseUrl` | URL `https` do projeto, sem caminho |
| `PUBLIC_SUPABASE_ANON_KEY` | `supabaseAnonKey` | Chave pública do mesmo projeto: `anon` ou `sb_publishable_` |

`http` só é aceito em `localhost` e `127.0.0.1`.

**Nunca use aqui** `SUPABASE_SERVICE_ROLE_KEY`, chaves `sb_secret_` ou `JWT_SECRET`. O container só lê as três variáveis acima e recusa uma chave que não seja pública. Em URLs `*.supabase.co`, também recusa uma chave JWT de outro projeto.

## Publicar uma instalação

Com Docker Compose:

```sh
cp frontend/.env.docker.example frontend/.env.docker   # preencher com os valores da instalação
docker compose up -d
```

Com a imagem direto:

```sh
docker run -d -p 8080:80 \
  --add-host backend:<ip-do-backend> \
  -e PUBLIC_API_URL=/api \
  -e PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
  -e PUBLIC_SUPABASE_ANON_KEY=<chave-publica> \
  restaurant-frontend:<versao>
```

Para mudar o destino, altere as variáveis e **recrie** o container (`docker compose up -d`, pois um `restart` não relê o `env_file`). Não há novo build. O navegador lê a configuração ao abrir a página, então abas já abertas precisam ser recarregadas.

No backend, `FRONTEND_URL` continua precisando apontar para o domínio deste frontend.

## Como conferir

```sh
curl -s https://<dominio>/runtime-config.json
```

A resposta deve trazer os valores desta instalação e nenhum outro campo.

O container registra `runtime-config: configuração da instalação gerada.` ao subir. Se algo estiver errado, ele **não sobe** e o log (`docker logs <container>`) cita as variáveis com problema, nunca os valores.

Se o arquivo faltar ou estiver inválido fora do container, a página mostra "Esta instalação não está configurada corretamente", lista o que corrigir e não inicia a aplicação. Não existe destino padrão.

## Desenvolvimento local

`npm run dev` continua usando `frontend/.env` e `frontend/.env.development`, com as variáveis `VITE_API_URL`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O servidor do Vite valida esses valores com as mesmas regras e os entrega em `/runtime-config.json`; o build os ignora. Valores recusados não aparecem na resposta nem no terminal: a resposta é um erro 500 que lista só o que corrigir.

As três passaram a ser obrigatórias também aqui: sem elas, a tela de erro aponta o que falta. Copie `frontend/.env.example` e preencha.

`vite preview` e `server.mjs` servem o build como ele é. Para usá-los, coloque um `runtime-config.json` válido em `dist/`, sem versioná-lo.

## Verificações

| Comando | O que confere |
| --- | --- |
| `npx vitest run tests/runtime-config.test.ts` | Regras do navegador e do script do container contra os mesmos casos; ordem de inicialização. O script precisa de `sh` e `jq`; sem eles, esses testes são pulados, exceto no CI, onde falham |
| `npx vitest run tests/vite-runtime-config.test.ts` | Endpoint real do Vite: chaves recusadas fora da resposta e dos logs |
| `npm run build && npm run check:bundle` | Nenhum valor de instalação no build. Também roda no build da imagem |
| `sh frontend/scripts/verify-runtime-image.sh <imagem>` | Mesma imagem com duas configurações e recusas. Precisa de Docker; roda no CI |

## Limitações

- O Nginx da imagem precisa resolver o host `backend` ao subir, mesmo com `PUBLIC_API_URL` externo. No Compose, ele é o serviço `backend`; fora dele, use `--add-host` ou um alias de rede.
- A imagem precisa de escrita em `/usr/share/nginx/html` ao subir. Não funciona com `--read-only` sem um volume nesse caminho.
- A validação confere formato e declarações da chave (`role` e `ref` do nível principal). Ela não confere a assinatura nem se o projeto existe.
