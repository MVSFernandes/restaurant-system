# Provisionamento de uma instalação (Etapa 1B.3)

Cada restaurante tem a própria instalação e o próprio projeto Supabase, com o
mesmo código-base. Este roteiro torna operável um projeto Supabase **novo**,
criado pelo responsável, sem dados de outro restaurante e sem SQL manual fora
dele.

Ferramentas (de `backend/`):

- `npm run db:migrations:check` e `npx supabase db push`: schema
  (ver `supabase/migrations/README.md`);
- `npm run provision -- <comando>`: marcador, configuração inicial, bucket e
  primeiro administrador (`src/provisioning/`).

Não há rota HTTP de bootstrap. O seed do Prisma (`prisma/seed.ts`) é legado e
**não** deve ser usado.

## Regras do `provision`

Todo comando recebe o destino e a identidade esperados, digitados pelo
operador, e confere **antes de qualquer escrita**:

| Conferência | Recusa quando |
| --- | --- |
| `--project-ref` = ref do `SUPABASE_URL` do arquivo da instalação | URL de outro projeto, fora de `https://<ref>.supabase.co` |
| `--project-ref` = projeto vinculado da CLI (`backend/supabase/.temp/project-ref`) | CLI sem vínculo ou vinculada a outro projeto |
| `--installation-id` / `--environment` = `INSTALLATION_ID` / `APP_ENV` do arquivo | valores diferentes ou ausentes |
| `db:migrations:check --linked` | qualquer veredito diferente de `UP_TO_DATE` |
| marcador do banco (`app_installation`) | marcador de outra instalação ou ambiente; marcador ausente (exceto no comando `marker`) |

Uso comum:

```
npm run provision -- <comando> --target-env <arquivo da instalação> \
  --project-ref <ref> --installation-id <id> --environment <development|test|staging|production>
```

- `--target-env` é o arquivo de ambiente **da instalação** (o mesmo que o
  backend dela usará). Mantenha-o fora do repositório. Ele é lido só pelo
  comando, sem alterar variáveis do processo; o `.env` do diretório atual é
  ignorado. Não use `--env-file`: é opção do próprio Node.
- A chave de serviço é usada só para a API do projeto e nunca é impressa.
- Nenhuma senha é aceita por argumento.

| Comando | Faz | Quando o recurso já existe |
| --- | --- | --- |
| `status` | Só leitura: destino, migrations, marcador, contagens, configuração, usuários, bucket | — |
| `marker --new-installation` | Grava o marcador (SQL pela CLI vinculada) e relê pela API | Igual: nada a fazer. Diferente: recusa |
| `config --restaurant-name "<nome>"` | Cria `restaurant_config` só com o nome; taxas de entrega vazias; NFC-e desligada; sem logo, banner, contatos, endereço ou dados fiscais | Preserva a existente, sem alterar nada |
| `storage` | Cria o bucket `branding`: público, PNG/JPEG/WebP, até 4 MB, sem políticas adicionais | Preserva arquivos e configuração; relata divergências (saída 3) |
| `admin --admin-name "<nome>" --admin-email <email>` | Pede a senha duas vezes, com entrada oculta (mínimo 12 caracteres), e grava só o hash bcrypt, como a aplicação | Recusa se houver **qualquer** usuário, inclusive um criado por execução simultânea (conferência e gravação atômicas no banco). Não substitui nem promove contas |

Saída: `0` feito ou já existente; `3` recurso existente divergente (preservado);
`1` recusado; `2` uso incorreto.

### Banco vazio para `marker --new-installation`

Uma instalação nova nasce vazia. O marcador só é gravado se **todas** as
tabelas de negócio estiverem sem linhas. A lista vem do schema versionado: são
todas as tabelas de `public` no estado esperado após a última migration
(`supabase/checks/migration_catalog.json`, o manifesto do
`db:migrations:check`). Uma tabela criada por migration futura entra
automaticamente.

A condição é conferida duas vezes: pela API, para mostrar quais tabelas têm
dados, e no próprio `insert` do marcador (`… and not exists (select 1 from
public.<tabela>)` para cada uma), que é o que vale no momento da gravação.
Nada é apagado para permitir o provisionamento.

Exceções, só tabelas de controle técnico, sem dados de restaurante:

| Tabela | Por que fica de fora |
| --- | --- |
| `app_installation` | É o próprio marcador; o comando confere à parte que ele está ausente (ou igual ao esperado). |
| `order_stock_ledger_rollout` | A migration `20261104221000` grava nela a linha de controle da transição do livro de estoque; o conteúdo exato dessa linha já é conferido pelo catálogo (categoria `data`) no `db:migrations:check`. |

A lista de exceções fica em `CONTROL_TABLES` (`src/provisioning/provision.ts`).
Se uma tabela de controle sumir do schema, o comando para e pede revisão.

### Primeiro administrador atômico

`admin` chama a função `public.create_first_admin` (migration
`20261106120000_create_first_admin.sql`). Ela trava `public.users`, confere
que a tabela está vazia e grava o administrador na mesma transação. Uma
segunda execução simultânea espera o lock, encontra a conta criada e é
recusada (`USERS_ALREADY_EXIST`) sem criar outra. Só `service_role` executa
a função. Ela recebe apenas o hash bcrypt e nenhuma mensagem de erro o repete.

A criação de outros usuários pela aplicação, inclusive outros
administradores, não muda: não há limite de um único `ADMIN`.

## 0. Antes de começar (responsável)

1. Criar o projeto Supabase do cliente e do ambiente (região, plano com backup).
   Anotar a ref (`<ref>`, 20 caracteres).
2. Escolher o `installation_id` (ex.: `cantina-nova-prod`: minúsculas, números
   e hífens) e o ambiente.
3. Criar o arquivo de ambiente da instalação **fora do repositório**, a partir
   de `backend/.env.example`:
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do projeto novo;
   - `INSTALLATION_ID` e `APP_ENV` escolhidos;
   - `JWT_SECRET` e `JWT_REFRESH_SECRET` novos, nunca reutilizados de outra instalação;
   - `FRONTEND_URL` e `RESTAURANT_TIMEZONE`;
   - `FOCUS_NFE_ENABLED=false` até a etapa fiscal da instalação.
4. Registrar a instalação no inventário privado: ref, `installation_id`,
   ambiente e **nomes** dos segredos, nunca os valores.

## 1. Projeto e migrations

Em `backend/`:

```
npx supabase login
npx supabase link --project-ref <ref>
npm run db:migrations:check -- --linked     # PENDING, com todas as versões pendentes (catálogo vazio)
npx supabase db push --linked --dry-run     # lista as migrations ativas, nada de history/
npx supabase db push --linked
npm run db:migrations:check -- --linked     # UP_TO_DATE (exit 0)
```

O `link` troca o vínculo de `backend/supabase/.temp/` (ignorado pelo Git).
Ao terminar, vincule de novo o projeto em que você trabalha no dia a dia.

Se o primeiro check não for `PENDING` desde zero, **pare**: o projeto não é novo.
Siga `supabase/migrations/README.md` ("Existing database") ou investigue.

```
npm run provision -- status --target-env <arquivo> --project-ref <ref> --installation-id <id> --environment <env>
```

Esperado: `Migrations: UP_TO_DATE`, marcador ausente, `Tabelas de negócio
(<n>): todas vazias`, `restaurant_config` ausente, 0 usuários, bucket ausente.

## 2. Identidade da instalação

```
npm run provision -- marker --new-installation --target-env <arquivo> --project-ref <ref> --installation-id <id> --environment <env>
npm run provision -- status --target-env <arquivo> --project-ref <ref> --installation-id <id> --environment <env>   # "Marcador: <id> (<env>) confere."
```

## 3. Configuração inicial, storage e primeiro administrador

```
npm run provision -- config --restaurant-name "<nome do restaurante>" --target-env <arquivo> --project-ref <ref> --installation-id <id> --environment <env>
npm run provision -- storage --target-env <arquivo> --project-ref <ref> --installation-id <id> --environment <env>
npm run provision -- admin --admin-name "<nome>" --admin-email <email> --target-env <arquivo> --project-ref <ref> --installation-id <id> --environment <env>
```

O comando `admin` pede a senha só depois de todas as conferências. Digite-a no
terminal; ela não aparece, não é registrada e não pode vir de arquivo ou pipe.
Entregue-a ao responsável por um canal seguro e recomende a troca no primeiro acesso.

Os demais usuários (caixa, garçom, financeiro, outros administradores) são
criados por esse administrador na aplicação.

## 4. Verificação da instalação

1. `npm run provision -- status …`: marcador confere, `restaurant_config`
   presente, 1 usuário (1 administrador), bucket conforme.
2. Subir o backend com o arquivo da instalação: o container com
   `--env-file <arquivo>` ou, localmente, `npm run build` e
   `node --env-file=<arquivo> <caminho>/backend/dist/server.js` executado a
   partir de uma pasta **sem `.env`**. O backend chama `dotenv.config()`, que
   completaria variáveis ausentes com o `.env` do diretório atual (o de
   desenvolvimento, se for `backend/`). Esperado no log:
   `Instalação confirmada: <id> (<env>).`
3. Subir o frontend da instalação apontando para esse backend, com as variáveis
   `PUBLIC_*` de `frontend/RUNTIME_CONFIG.md`.
4. **Login:** entrar com o administrador criado. Conferir `GET /api/auth/me`
   com papel `ADMIN`.
5. **Configurações:** completar dados do restaurante. Enviar um logo PNG pela
   tela de configurações e abrir a URL pública gerada (prova o bucket real).
   Remover ou trocar o logo e conferir que o arquivo antigo some do bucket.
6. **Cardápio:** criar uma categoria e um produto. Conferir o produto no
   cardápio digital público.
7. **Operação básica:** abrir o caixa, criar um pedido de teste e cancelá-lo
   (com estoque vinculado, conferir a devolução). Depois fechar o caixa.
8. Em produção, combine com o responsável o que fazer com os registros do
   teste. O pedido cancelado e o caixa ficam no histórico; prefira fazer este
   passo numa instalação de homologação ou usar um produto de teste que será
   removido.

Registre o resultado no inventário: versão, migrations, data e responsável.

## 5. Reexecução

Todos os comandos podem ser repetidos:

- `marker`: com o mesmo marcador, "nada a fazer";
- `config`: configuração existente preservada; o nome não é sobrescrito;
- `storage`: bucket existente preservado, conferido e com divergências relatadas;
- `admin`: recusado quando já há usuário, sem pedir senha;
- `status`: sempre só leitura.

Se um passo falhar no meio, corrija a causa e repita o mesmo comando: ele
continua do ponto em que o recurso ainda não existe.

## 6. Instalação existente

Para um banco que já tem marcador, dados ou usuários (por exemplo, o
desenvolvimento ou o Mesa Farta):

- use apenas `status` para conferir;
- `marker` recusa um marcador diferente e não trata bancos com dados sem marcador;
- `config` e `storage` preservam o que existe e só relatam diferenças;
- `admin` recusa sempre. Contas novas são criadas por um administrador na
  aplicação; nenhuma conta é promovida por script.

## 7. Limites conhecidos

- O bucket é comparado em público, limite e tipos. Políticas extras em
  `storage.objects` criadas por alguém não são verificadas; a aplicação não
  precisa de nenhuma.
- `SUPABASE_URL` precisa ser `https://<ref>.supabase.co`. Domínio próprio da
  API não é aceito por este roteiro.
