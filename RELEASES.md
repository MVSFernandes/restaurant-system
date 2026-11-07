# Releases e atualização das instalações

Cada restaurante tem a própria instalação e o próprio banco, com o mesmo código
(`backend/PROVISIONING.md`). Este roteiro leva uma versão a uma instalação
**já provisionada**. Para uma instalação nova, comece pelo provisionamento.

Referências: `backend/supabase/migrations/README.md` (verificador de migrations)
e `frontend/RUNTIME_CONFIG.md` (configuração do frontend).

| Arquivo | Função |
| --- | --- |
| `releases/TEMPLATE.md` | Modelo das notas de release |
| `releases/<versão>.md` | Notas de cada versão |
| `deploy/docker-compose.release.yml` | Sobe uma instalação com imagens de uma versão, sem build |
| `deploy/release.env.example` | Modelo do arquivo que escolhe imagens e destino |
| `deploy/INVENTARIO_INSTALACOES.modelo.md` | Modelo do inventário privado |

## 1. Versões, tags e notas

### Versão

A tag Git é a única fonte da versão. Os campos `version` dos `package.json` não
são lidos em execução e não acompanham a release.

| Parte | Quando sobe |
| --- | --- |
| `MAJOR` (`v2.0.0`) | Há migration `M2` (seção 2): a versão anterior não funciona no banco novo |
| `MINOR` (`v1.2.0`) | Há funcionalidade, migration `M1` ou mudança de configuração exigida da instalação |
| `PATCH` (`v1.1.1`) | Só correção, sem migration e sem mudança de configuração |
| `-rc.N` (`v1.2.0-rc.1`) | Candidata para ensaio. Só vai a desenvolvimento e homologação |

### Tags

- Anotada, no formato `vMAJOR.MINOR.PATCH` ou `vMAJOR.MINOR.PATCH-rc.N`.
- Só em commit da `main`, com o CI verde.
- Imutável: nunca é movida nem recriada. Candidata reprovada dá lugar à
  `-rc.N+1`.
- A versão final aponta para o **mesmo commit** da última candidata aprovada e
  usa as **mesmas imagens**, sem novo build.

**Base de comparação (`$BASE`):** a tag da versão anterior. Ainda não existe
nenhuma tag: no primeiro ensaio, a base é o commit `7ec3412`, citado pelo hash.
Não crie uma tag retroativa para ele.

### Imagens

- `restaurant-backend:<tag>` e `restaurant-frontend:<tag>`. O nome pode ter o
  prefixo de um registro.
- Construídas uma vez, de um clone limpo na tag, com os rótulos abaixo. A mesma
  imagem serve todas as instalações.
- Uma instalação nunca usa `:latest`. Com um registro, use o digest
  (`imagem@sha256:…`).

```powershell
$TAG = 'v1.1.0-rc.1'; $SHA = git rev-parse HEAD
docker build --label "org.opencontainers.image.version=$TAG" --label "org.opencontainers.image.revision=$SHA" -t "restaurant-backend:$TAG" backend
docker build --label "org.opencontainers.image.version=$TAG" --label "org.opencontainers.image.revision=$SHA" -t "restaurant-frontend:$TAG" frontend
```

### Notas

Um arquivo por versão, `releases/vMAJOR.MINOR.PATCH.md`, criado do modelo e
presente no commit da tag. As candidatas usam as notas da versão que preparam.
O resultado em cada instalação vai para o inventário, não para as notas.

## 2. Compatibilidade das migrations

**Regra:** a versão anterior da aplicação precisa continuar funcionando depois
que as migrations da nova forem aplicadas. É isso que permite voltar a aplicação
sem mexer no banco. As migrations sobem **antes** das imagens.

| Classe | O que é | Janela | Como voltar a aplicação |
| --- | --- | --- | --- |
| `M0` | Sem migration: o banco não muda | Não | Trocar as imagens (seção 6, caso B) |
| `M1` | Expansiva: a versão anterior funciona igual | Não | Trocar as imagens. O banco fica à frente (seção 6, caso D) |
| `M2` | Incompatível: a versão anterior falha ou corrompe dados | Sim, com escritas suspensas | Só pelo plano das notas (seção 6, caso E) |

A classe da release é a da sua migration mais restritiva.

| Mudança | Classe |
| --- | --- |
| Tabela, coluna anulável ou com padrão, índice criado sem bloqueio longo | `M1` |
| Função nova, sem alterar as que a versão anterior chama | `M1` |
| Remover ou renomear tabela, coluna ou função que a versão anterior usa | `M2` |
| Mudar assinatura, retorno ou `EXECUTE` de função que a versão anterior chama | `M2` |
| Coluna nova `NOT NULL` sem padrão; restrição que recusa o que a versão anterior grava | `M2` |
| Gatilho ou guarda que muda o efeito das escritas da versão anterior | `M2` |

Precedentes neste repositório: `20261105120000` e `20261106120000` são `M1`
(a versão anterior ignora os objetos novos); `20261104221000` é `M2`, pois tirou
da versão anterior as funções legadas de estoque e exigiu janela na Etapa 1A.

**Expandir, migrar, contrair.** Prefira dividir uma mudança incompatível:

1. Release A (`M1`): adiciona o novo, e o código passa a usá-lo.
2. Release B ou posterior: remove o antigo. Só depois que o inventário mostrar
   **todas** as instalações em A ou além, e o rollback de B não precisar de uma
   versão anterior a A.

**Toda migration também precisa:**

- ter recuperação própria em `backend/supabase/rollbacks/`, testada;
- deixar efeito visível no catálogo. Uma migration só de dados, sem rastro, deixa
  o verificador `ambiguous` onde não houver histórico da CLI (README das migrations);
- não trazer dado nem ajuste de um cliente.

**Como provar a classe `M1`:** no passo 9 da seção 4, a versão anterior continua
no ar depois das migrations. Onde o inventário permitir escrita de negócio, ela
passa pelo teste com escrita da seção 5 antes de as imagens novas subirem.

## 3. Destino: confirmar antes de atualizar

Um valor errado aqui atinge o banco de um restaurante. Leia o valor esperado
**no inventário**, não no arquivo testado. Uma linha do inventário com
"a confirmar" impede qualquer atualização dessa instalação.

### 3.1 Conferência antes de qualquer `up`

Vale para o **primeiro** `docker compose up` de uma instalação e para cada troca
de imagens. Nada aqui altera o ambiente, e só os campos necessários são exibidos.

```powershell
# 1. Overrides no shell, só nomes. Esperado: nenhuma linha (ver abaixo).
Get-ChildItem Env: | Where-Object Name -Match '^(RS_|COMPOSE_|SUPABASE_)|^DOCKER_(HOST|CONTEXT)$' | ForEach-Object Name
docker context show

# 2. Clone e vínculo da CLI.
git -C $ROOT describe --tags --exact-match
git -C $ROOT status --porcelain
Get-Content "$ROOT\backend\supabase\.temp\project-ref"

# 3. O que o Compose realmente selecionou.
$cfg = docker @DC config --no-env-resolution --format json | ConvertFrom-Json
$be = @($cfg.services.backend.env_file).path; $fe = @($cfg.services.frontend.env_file).path
"projeto: $($cfg.name)"
"imagens: $($cfg.services.backend.image) | $($cfg.services.frontend.image)"
"publicado: $($cfg.services.frontend.ports.host_ip):$($cfg.services.frontend.ports.published)"
"arquivos: $be | $fe"
"iguais aos da pasta privada: $((Resolve-Path $be).Path -eq (Resolve-Path "$PRIV\backend.env").Path) | $((Resolve-Path $fe).Path -eq (Resolve-Path "$PRIV\frontend.env").Path)"

# 4. Só estes campos dos arquivos efetivos, nunca o arquivo inteiro.
Select-String -LiteralPath $be -Pattern '^(INSTALLATION_ID|APP_ENV|FRONTEND_URL|SUPABASE_URL|FOCUS_NFE_ENABLED|FOCUS_NFE_ENVIRONMENT)=' | ForEach-Object Line
Select-String -LiteralPath $fe -Pattern '^PUBLIC_(API|SUPABASE)_URL=' | ForEach-Object Line
```

| Saída | Precisa ser | Por quê |
| --- | --- | --- |
| Overrides | Nenhum nome. `SUPABASE_ACCESS_TOKEN` pode ficar, pois só autentica. Para os demais: `Remove-Item Env:<nome>` | `RS_*` no shell **vence** o `release.env`: troca imagem e arquivo de ambiente sem aviso. `COMPOSE_PROJECT_NAME` troca o projeto. `SUPABASE_WORKDIR` pode desviar a CLI de pasta. `DOCKER_*` troca o daemon |
| `docker context show` | O contexto desta máquina | Outro contexto subiria os containers em outro lugar |
| Tag e Git | Tag exata; `status` sem linhas | |
| `project-ref` | Ref do inventário | |
| `projeto` | `installation_id` do inventário | Um nome diferente mostra um override no shell ou um `COMPOSE_PROJECT_NAME` no `release.env`. Nunca use `-p`: `up` e `down` agem sobre o projeto com esse nome |
| `imagens` | Da versão pretendida. Nunca `:latest` | |
| `publicado` | Endereço do inventário, coerente com `FRONTEND_URL` | |
| `arquivos`, `iguais` | `True \| True` | O `provision` lê a pasta privada, e o container lê o que o Compose selecionou. Precisam ser os mesmos arquivos, senão a conferência vale para outro destino |
| `INSTALLATION_ID`, `APP_ENV` | Inventário. Cada campo aparece **uma vez** | Campo repetido ou ausente: pare |
| `SUPABASE_URL`, `PUBLIC_SUPABASE_URL` | A mesma ref do inventário | |
| `FOCUS_NFE_*` | Inventário. Em desenvolvimento e homologação, `FOCUS_NFE_ENABLED=false` no ensaio | |

Com `--env-file` e `-f` explícitos, um `.env` ao lado do compose, `COMPOSE_FILE` e
`COMPOSE_ENV_FILES` não têm efeito. Mesmo assim, o filtro os aponta.

Em produção, confira também nome e ref do projeto no painel do Supabase.

**Nunca use com os arquivos de uma instalação**, pois imprimem segredos:

- `docker compose config` sem `--images`, `--services` ou `--no-env-resolution`;
- `docker inspect` sem `--format`;
- `Get-Content` do arquivo de ambiente.

### 3.2 Marcador e dry-run

O passo 3.1 confere arquivos, não o banco. A conferência do destino só termina
com os passos 4 e 5 da seção 4, **antes** do `up`.

`provision status` confere a ref digitada contra o `SUPABASE_URL` e o vínculo da
CLI, e `installation_id` e ambiente contra o arquivo. Mas ele **recusa com
migrations pendentes**, antes de ler o marcador:

| Situação | Resultado esperado de `provision status` |
| --- | --- |
| Banco em dia | Exit 0, `Marcador: <id> (<env>) confere.` |
| Migrations pendentes (`M1`, `M2`) | Exit 1, linha `Destino: projeto <ref>…` seguida de `MIGRATIONS_NOT_READY` com `pending`. Destino conferido; o marcador vem de `db:migrations:check` |
| `DESTINATION_MISMATCH` | Pare, em qualquer caso |

## 4. Atualizar uma instalação

**Ordem das instalações:** desenvolvimento, homologação, piloto, demais clientes.
Marcado com ✎ o que altera algo. O resto é conferência.

Prepare em PowerShell:

```powershell
$ROOT = '<clone desta instalação e versão>'; $PRIV = '<pasta privada da instalação, fora do repositório>'
$REF = '<ref do inventário>'; $ID = '<installation_id>'; $ENVNAME = '<ambiente>'
$TAG = '<tag>'; $BASE = '<tag anterior; no primeiro ensaio, 7ec3412>'
$P = '--target-env', "$PRIV\backend.env", '--project-ref', $REF, '--installation-id', $ID, '--environment', $ENVNAME
$DC = 'compose', '--env-file', "$PRIV\release.env", '-f', "$ROOT\deploy\docker-compose.release.yml"
```

### Antes

| # | Comando ou ação | Esperado |
| --- | --- | --- |
| 1 | Ler as notas: classe, migrations, versão mínima de origem, configuração, janela, recuperação. Abrir a linha da instalação no inventário | Versão atual ≥ mínima de origem; nenhum campo "a confirmar" |
| 2 | ✎ local: `git clone <repo> $ROOT`, `git -C $ROOT checkout $TAG`, `npm ci` em `backend/`, `npx supabase link --project-ref $REF` em `backend/` | Grava só na pasta do clone. Não altera o banco |
| 3 | Conferência da seção 3.1 | Tudo conforme a tabela |
| 4 | Em `$ROOT\backend`: `npm run db:migrations:check -- --linked`, depois `npm run provision -- status @P` | Marcador do inventário e veredito previsto (tabela abaixo) |
| 5 | Em `$ROOT\backend`: `npx supabase db push --linked --dry-run`. Depois, de qualquer pasta: `git -C $ROOT diff --name-status $BASE $TAG -- 'backend/supabase/migrations/*.sql' backend/supabase/checks/migration_catalog.json` | `M0`: `Remote database is up to date` e **nenhuma linha** no diff. `M1`/`M2`: exatamente as migrations das notas, com `A` nos `.sql` e, no máximo, `M` no manifesto |
| 6 | `docker image inspect <imagem> --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.version"}} {{index .Config.Labels "org.opencontainers.image.revision"}}'`, para as duas imagens novas e as duas atuais, se houver | Rótulos da versão certa; IDs anotados. As imagens atuais existem localmente, pois são o caminho de volta |
| 7 | Backup conforme a seção 7. ✎ Abrir a janela, se as notas exigirem | Horário e local anotados no inventário |

O diff precisa usar `git -C $ROOT` ou rodar na raiz. **Dentro de `backend/`, o
caminho não casa e o resultado vem vazio, o que parece "sem migrations".** O
filtro `*.sql` existe porque o `README.md` da mesma pasta pode mudar sem ser
migration.

| Veredito no passo 4 | Quando é normal | Ação |
| --- | --- | --- |
| `UP_TO_DATE` (exit 0) | Release `M0`, ou migrations já aplicadas | Seguir sem o passo 8 |
| `PENDING` (exit 20) | Release `M1` ou `M2`, com **só** as versões das notas pendentes. Em `M0`, nunca | Seguir, ou **parar** em `M0` |
| `NEEDS_RECORDING`, `AMBIGUOUS`, `DIVERGENT`, erro | Nunca, numa atualização | **Parar** |

### Aplicar

| # | Comando | Esperado |
| --- | --- | --- |
| 8 | ✎ Só com `PENDING`, em `backend/`: `npx supabase db push --linked` (leia a lista; `[Y/n]` aceita Enter como sim; nunca automatize a resposta). Depois `npm run db:migrations:check -- --linked`, `npx supabase migration list --linked` e `npx supabase db push --linked --dry-run` | `UP_TO_DATE`; versões iguais em Local e Remote; `Remote database is up to date` |
| 9 | Só depois do passo 8: `npm run provision -- status @P`; `curl.exe -fsS <url>/health` | Marcador confere; a versão **anterior** ainda responde (prova de compatibilidade) |
| 10 | ✎ Copiar o `release.env` atual para `release.env.anterior`, se existir, e trocar as imagens para a nova tag. Repetir a seção 3.1 | As duas imagens novas; o resto igual |
| 11 | ✎ `docker @DC up -d --no-build --wait --wait-timeout 180` | Exit 0; os dois serviços saudáveis. Se falhar: seção 6, caso C |

### Depois

Siga a seção 5 e atualize o inventário: versão, IDs ou digests das imagens,
última migration, data e responsável. Registre também a **tag dos checkouts de
conferência**: a próxima conferência deste banco usa essa tag ou uma mais nova.

## 5. Verificações após a atualização

### Conferência (não grava)

| # | Comando | Esperado |
| --- | --- | --- |
| a | `docker @DC ps --format '{{.Service}} {{.Image}} {{.State}} {{.Health}}'` | Imagens da tag, `running`, `healthy` |
| b | `docker inspect (docker @DC ps -q backend) --format '{{.Image}}'`, e o mesmo para `frontend` | IDs anotados no passo 6. O `/health` não informa a versão: é aqui que ela se comprova |
| c | `docker @DC logs backend \| Select-String 'Instalação confirmada'` | `Instalação confirmada: <id> (<env>).` |
| d | `curl.exe -fsS <url>/health` | HTTP 200, `status: ok`, passando pelo Nginx |
| e | `$c = Invoke-RestMethod <url>/runtime-config.json; $c.PSObject.Properties.Name; $c.apiUrl; $c.supabaseUrl` | Só `apiUrl`, `supabaseUrl`, `supabaseAnonKey`; URL com a ref do inventário. A chave não é impressa |
| f | Em `backend/`: `npm run db:migrations:check -- --linked`; `npx supabase db push --linked --dry-run`; `npm run provision -- status @P` | `UP_TO_DATE`, exit 0; `Remote database is up to date`; marcador confere; bucket conforme; contagem de usuários coerente |

### Na aplicação, sem escrita de negócio

Vale em toda instalação. Pela leitura do código, a subida do backend, o login e a
renovação de sessão só leem o banco. Em janela anônima:

1. Senha errada recusada; senha certa aceita; `GET /api/auth/me` com o papel esperado.
2. Sessão renovada: `POST /api/auth/refresh-token` 200 depois de recarregar.
3. Logo e cardápio público sem login.
4. Telas abertas só para leitura, sem salvar nada.

### Na aplicação, com escrita de negócio

Só onde o inventário disser **"Teste com escrita de negócio: permitido"**. O
padrão é proibido, inclusive em desenvolvimento e produção.

1. Abrir o caixa, criar um pedido com produto vinculado a estoque, cancelar,
   conferir a devolução e fechar o caixa.
2. Realtime: uma segunda janela recebe o pedido e o cancelamento sem recarregar.

Registre no inventário o que ficou sem verificar naquela instalação.

Abas abertas antes da troca precisam ser recarregadas.

## 6. Critérios para interromper e recuperação

**Pare e não siga para a próxima etapa** se:

1. a tag, a ref, o `installation_id`, o ambiente, o nome do projeto Compose ou um
   arquivo efetivo divergirem do inventário, ou houver override no shell;
2. o clone tiver alteração local ou a tag não for exata;
3. o veredito for `NEEDS_RECORDING`, `AMBIGUOUS`, `DIVERGENT` ou erro;
4. numa release `M0`, o veredito for diferente de `UP_TO_DATE`, ou o dry-run ou o
   diff mostrarem qualquer migration;
5. nas demais, `PENDING` ou o dry-run listarem versão diferente das notas, ou o
   diff mostrar arquivo já aplicado alterado;
6. o backup exigido não existir ou o horário não tiver sido registrado;
7. a instalação estiver fora da versão mínima de origem;
8. a versão anterior falhar depois das migrations (passo 9);
9. `up --wait` falhar, ou um container ficar reiniciando;
10. qualquer item da seção 5 aplicável falhar, inclusive login ou sessão;
11. houver erro de estoque, caixa ou fiscal que não existia antes;
12. o tempo combinado para a janela acabar.

**Parar não autoriza improvisar.** Sem as notas prevendo, não rode
`migration repair`, script de `rollbacks/`, SQL manual, `db push --include-all`
nem restauração de backup.

Falha causada pela **release** suspende as próximas instalações. Falha só da
instalação (configuração, rede) não afeta as demais.

### Recuperar a versão anterior

| Caso | Situação | O que fazer |
| --- | --- | --- |
| **A** | Nada foi trocado: parou nas conferências | Encerrar. Investigar antes de tentar de novo |
| **B** | `M0`, banco intacto: a versão nova subiu, mas falhou nas verificações | Voltar as imagens (procedimento abaixo). O banco não entra na recuperação |
| **C** | `up --wait` falhou, em qualquer classe | Procedimento abaixo. O estado pode estar misturado |
| **D** | `M1`, banco já alterado | Voltar as imagens, com o verificador da tag **nova**. O banco fica à frente |
| **E** | `M2` | Plano das notas, na ordem delas. Sem plano testado, a saída é corrigir para frente ou restaurar o backup |
| **F** | `db push` falhou | Cada arquivo roda em sua transação: os anteriores ficam aplicados e o que falhou, não. A aplicação anterior continua no ar. Rode o verificador: `PENDING` com a versão que falhou é o esperado. **Não repita o push** antes de entender o erro |

**Voltar as imagens (casos B e D):**

1. ✎ Copiar `release.env.anterior` sobre `release.env`.
2. Repetir a seção 3.1: as imagens são as da versão anterior; o resto, igual.
3. ✎ `docker @DC up -d --no-build --wait --wait-timeout 180`.
4. Fazer as conferências a–f da seção 5, com os IDs anotados da versão anterior.
5. **Caso B:** o item f segue em `UP_TO_DATE` e dry-run sem migrations. É a prova
   de que o banco ficou intacto. Qualquer outro resultado é um problema novo: pare.
6. **Caso D:** faça o item f **no checkout da tag nova**, não no da anterior. O
   banco continua na versão nova, e o manifesto da tag anterior não a conhece: o
   verificador daria `DIVERGENT` sem que nada estivesse errado.
7. Registrar no inventário a versão em execução, a última migration e o motivo.
8. Corrigir numa release nova, que sai da `main`. Nunca rode `db push` do
   checkout da tag anterior.

**Falha durante `up --wait` (caso C).** O comando sai com erro, e os serviços
podem ter ficado em versões diferentes. O backend pode ter sido recriado e estar
reiniciando, e o frontend depende dele estar saudável.

1. Não repita o `up` sem entender a causa.
2. Anote o estado, sem imprimir ambiente:
   `docker @DC ps -a --format '{{.Service}} {{.Image}} {{.State}} {{.Health}}'` e
   `docker @DC logs --tail 50 backend`; o mesmo para `frontend`. As recusas de
   configuração citam nomes de variáveis, não valores.
3. **Antes de restaurar imagens, confira se uma migration `M2` já foi aplicada.**
   Leia a classe nas notas e, com o checkout da tag **nova**, em `backend/`, rode
   `npm run db:migrations:check -- --linked`.
   - **Release `M2` com alguma migration `M2` aplicada, ou sem como afirmar que
     não foi** (veredito diferente de `PENDING` com todas as versões `M2` ainda
     pendentes): **não restaure as imagens nem rode `down`.** A versão anterior
     pode falhar ou corromper dados neste banco. Siga direto o plano do caso E.
   - **`M0`, `M1` compatível, ou `M2` ainda não aplicada:** siga os passos abaixo.
     Com `M1` já aplicada, a conferência final segue a regra do caso D.
4. **Havia versão anterior no ar:** siga "Voltar as imagens", passos 1 a 4. Confirme
   que os **dois** serviços voltaram aos IDs anotados, não só o que falhou.
5. **Era a primeira subida:** não há para onde voltar. ✎ `docker @DC down` remove
   containers e rede do projeto. O compose não declara volumes, e o banco não é
   tocado. Confira `projeto` na seção 3.1 antes, pois o `down` age sobre esse nome.
6. Se a volta também falhar: pare, sem SQL e sem `repair`. Nada no banco muda
   por causa de uma falha de container.

Com o banco à frente da aplicação (caso D):

- não rode scripts de `rollbacks/` só para "alinhar versões": o rollback da
  aplicação não exige isso, e o script pode apagar dados;
- dados gravados pela versão nova em objetos novos ficam parados, e a versão
  anterior os ignora. Se a nota da release disser que isso importa, trate como
  caso E;
- não use `migration repair --status reverted` sem ter desfeito de fato a
  migration. Isso registraria um estado falso.

**Quando um script de `rollbacks/` é a saída** (só caso E, ou por decisão explícita):

1. suspender as escritas;
2. voltar a aplicação **antes** do script, salvo instrução contrária no cabeçalho
   dele (um backend novo pode recusar subir sem o objeto removido);
3. ler o cabeçalho e rodar o script;
4. `npx supabase migration repair --status reverted <versão> --linked`;
5. conferir: o verificador da tag **nova** deve dar `PENDING` com essa versão.

**Restaurar backup** é o último recurso: perde as operações posteriores a ele, e
notas fiscais autorizadas continuam existindo na SEFAZ.

## 7. Backup antes de atualizar

| Instalação | `M0` | `M1` ou `M2` |
| --- | --- | --- |
| Desenvolvimento e homologação | Não exigido | Exigido só se a nota disser; registre o estado de partida |
| Produção | Conferir no painel a data do último backup e registrar | **Bloqueado até a Etapa 1B.6** comprovar uma restauração |

O processo de cópia e restauração é da Etapa 1B.6. Até lá, nenhuma instalação de
produção tem recuperação comprovada por backup.
