# Backlog

Problemas encontrados durante o trabalho visual e **deliberadamente não
corrigidos** no PR em que foram vistos, porque mexem em regra, dado ou
comportamento. Cada item diz onde está e o que acontece. As linhas são as de
quando o item foi registrado (2026-09-22, branch
`feat/premium-screens-migration`) e podem ter mudado.

---

## Mais graves

### 1. Dashboard mostra zeros como se fossem dados reais para o perfil Caixa

- **Onde:** `frontend/src/pages/DashboardPage.tsx:120-124`, com o estado
  inicial em `:78` e o `catch` em `:137-138`. A restrição fica em
  `backend/src/routes/finance.routes.ts:15`.
- **O que acontece:** para perfis que não são garçom, o Dashboard busca
  `/finance/reports`, `/tables` e `/stock` num único `Promise.all`. O backend
  só aceita `/finance/reports` para ADMIN e FINANCE. Para o Caixa, a chamada
  falha, o `Promise.all` inteiro falha, o erro vai só para o console e os
  cartões ficam com o estado inicial: "0" pedidos, "0" mesas ocupadas, "0"
  alertas e "R$ 0,00" de faturamento.
- **Por que é grave:** fere o princípio 5 do design system ("nada de
  informação inventada"). O operador lê um zero que não foi medido como se
  fosse o movimento do dia. Mesas ocupadas, que o Caixa poderia ver, também
  some.

### 2. Tela de Mesas quebra com situação de mesa desconhecida

> **Resolvido** na branch `fix/frontend-integrity` (`b2253d7`). A mesa com
> situação desconhecida aparece neutra, como "Situação desconhecida", sem
> ações além de Cancelar.

- **Onde:** `frontend/src/pages/pdv/TablesPage.tsx:137` e `:144`.
- **O que acontece:** a tela procura a situação da mesa num mapa com só três
  chaves (`AVAILABLE`, `OCCUPIED`, `CLOSED`). Se o backend devolver qualquer
  outra situação, `config` fica `undefined` e `config.color` lança erro: a
  tela inteira cai, não só aquela mesa.
- **Por que é grave:** Mesas é tela de operação. Uma situação nova no banco
  (ou um dado inconsistente) derruba o salão para o caixa.

---

## Demais

### 3. Dashboard: link de alertas de estoque aponta para rota inexistente

> **Resolvido** pelo redesenho do Dashboard (PR #29): o link foi para
> `/stock/items`. Conferido no navegador na branch `fix/frontend-integrity`;
> `/inventory/stock` não aparece mais no código.

- **Onde:** `frontend/src/pages/DashboardPage.tsx:320`.
- **O que acontece:** "Alertas de Estoque" leva a `/inventory/stock`, que não
  existe. A rota coringa redireciona para o Dashboard. A rota certa é
  `/stock/items`.

### 4. Dashboard: cartões apontam para rotas que o perfil não acessa

> **Resolvido** pelo redesenho do Dashboard (PR #29): todo link depende do
> perfil (`canOperate`, `canSeeFinance`). Conferido no navegador na branch
> `fix/frontend-integrity`: com todos os blocos preenchidos, os 14 links de
> Administrador, Caixa e Financeiro abrem a tela certa; Garçom não recebe
> link.

- **Onde:** `frontend/src/pages/DashboardPage.tsx:306`, `:313` e `:327`.
- **O que acontece:** Caixa clica em "Faturamento Hoje" (`/finance/reports`)
  e Financeiro clica em "Pedidos Hoje" ou "Mesas Ocupadas" (`/pdv/*`). A rota
  protegida devolve os dois para o Dashboard, sem explicar por quê.

### 5. Mesas: alerta de caixa fechado nunca aparece

> **Resolvido** na branch `fix/frontend-integrity` (`bbe8538`). O `alert()`
> saiu; a proteção continua (botão desabilitado e retorno no início da
> função).

- **Onde:** `frontend/src/pages/pdv/TablesPage.tsx:62`, com o botão em `:165`.
- **O que acontece:** o `alert()` só roda se o caixa estiver fechado, mas o
  botão "Abrir Mesa" já fica desabilitado nesse caso. É código inalcançável.
  O texto também está sem acento ("Nao e possivel").

### 6. Mesas: "Adicionar Pedido" recarrega o app inteiro

> **Resolvido** na branch `fix/frontend-integrity` (`279466b`). Navega pelo
> React Router para a mesma URL. Ver item 17: o destino ignora o `tableId`.

- **Onde:** `frontend/src/pages/pdv/TablesPage.tsx:173`.
- **O que acontece:** usa `window.location.href` em vez de navegar pelo React
  Router. O app recarrega do zero: estado perdido, identidade e sessão
  buscadas de novo, conexão de tempo real refeita.

### 7. Mesas: falhas ao abrir, fechar ou liberar mesa são silenciosas

- **Onde:** `frontend/src/pages/pdv/TablesPage.tsx:70`, `:88` e `:95`.
- **O que acontece:** o erro vai só para o console. O operador não recebe
  nenhum retorno e não sabe se a mesa mudou ou não. No caso de `:88`, a mesa
  pode ficar presa como "Fechada", porque a liberação automática roda num
  `setTimeout` de 2 segundos sem aviso de falha.

### 8. Arquivo morto: `pdv/HistoryPage.tsx`

> **Resolvido** na branch `fix/frontend-integrity` (`e930f87`). O arquivo foi
> removido junto com o único teste que o renderizava (ver item 19).

- **Onde:** `frontend/src/pages/pdv/HistoryPage.tsx` (336 linhas). A rota fica
  em `frontend/src/App.tsx:65`.
- **O que acontece:** o arquivo não é importado em lugar nenhum. A rota
  `/pdv/history` redireciona para `OrderHistoryPage`. Ele engana quem procura
  a tela de histórico e continua aparecendo em buscas por cor literal.

---

## Backend: prioridade alta

Registrados no mapeamento de dados para o Dashboard (2026-09-22). Não são
bugs de tela: afetam números que o restaurante usa para decidir.

### 9. PRIORIDADE ALTA: fuso do "hoje" pode estar errado

> **Resolvido** na branch `fix/restaurant-timezone`: os limites são calculados
> no fuso IANA configurado e enviados ao banco como instantes UTC, sem depender
> do fuso do processo.

- **Onde:** `backend/src/services/finance.service.ts:20-37`
  (`periodToDates`).
- **O que acontece:** o início do período é calculado com `new Date()` e
  `setHours(0, 0, 0, 0)` na hora **do servidor**. Se o servidor roda em UTC,
  o "hoje" começa às 21h do dia anterior no horário de Brasília, e "semana",
  "mês" e "ano" ficam deslocados em 3 horas.
- **Por que é prioridade:** afeta o **relatório financeiro** e tudo que usa
  esses períodos, não só o Dashboard. Vendas das 21h às 24h caem no dia
  seguinte. Precisa ser conferido também no fechamento de caixa e em
  qualquer outro cálculo de data feito no servidor.
- **Não verificado:** em que fuso o servidor de produção roda. Primeiro
  passo é conferir isso.

### 10. PRIORIDADE ALTA: consultas que multiplicam com o uso real

> **Resolvido** na branch `perf/query-fanout`. Com o volume real medido, `/tables`
> caiu de 121 para 2 consultas, `/orders` de 7 para 3 e `/customers/credit`
> de 8 para 1. As respostas antes e depois foram idênticas, inclusive os 9
> lançamentos de fiado dos 4 clientes.

Pioram conforme o restaurante tem mais mesas, pedidos e clientes, e várias
são chamadas em intervalos (a cada 30s ou por evento de tempo real).

- **`GET /tables`** (`backend/src/controllers/table.controller.ts`,
  `getTables`): para **cada mesa**, faz 4 consultas `findByStatus` e filtra
  em memória — e essas consultas trazem pedidos de **todas as sessões**,
  não só do turno. Com 20 mesas, 80 consultas por chamada.
- **`GET /orders`** (`backend/src/controllers/order.controller.ts`,
  `getOrders`): para cada pedido busca os itens, e para cada item busca o
  produto, uma consulta por vez (N+1 em dois níveis).
- **`GET /customers/credit`** (`backend/src/services/credit.service.ts`,
  `listCustomerCredits`): uma consulta por cliente cadastrado.

---

## Backend: dados que faltam

Do mapeamento para o Dashboard. Nenhum foi criado; o Dashboard mostra só o
que já existe.

### 11. Série por hora do turno e do dia

Faturamento e número de pedidos por hora, agregados no banco. Atende
"faturamento por hora" e "horário de pico". Derivar no navegador a partir de
`/orders` não serve: é caro (item 10) e usa a hora do pedido, não a do
pagamento.

### 12. Comparação com período equivalente

"Ontem até esta hora" ou "mesmo dia da semana passada". Hoje
`/finance/reports` só aceita `today`, `week`, `month` e `year`, sem datas
livres. O que existe é comparar com o turno anterior **completo**
(`/cash-register/history`).

### 13. Ticket médio consistente

Dividir `totalRevenue` por `orderCount` de `/cash-register/current` dá
número errado: o faturamento soma só pagamentos **pagos**, a contagem inclui
pedidos **ainda não pagos**. No meio do turno, o ticket sai subestimado. O
backend precisa devolver as duas grandezas sobre o mesmo conjunto.

### 14. Versionar a função `finance_report`

A RPC `finance_report`, chamada por `getFinanceReports`
(`backend/src/controllers/finance.controller.ts`), só existe no banco
Supabase; não está no repositório. Não dá para auditar como faturamento,
mais vendidos e divisão por pagamento são calculados, nem saber o limite de
`topProducts` ou se cancelados entram. Deve virar migração versionada.

### 15. Horário de abertura da mesa

A mesa só tem `id`, `number` e `status` (`backend/src/types/domain.ts`,
`Table`). Sem `openedAt`, a tela do garçom mostra o tempo desde o pedido
ativo mais antigo, que é aproximação.

### 16. Dashboard do Caixa (ver item 1)

Continua valendo: `/finance/reports` bloqueia o Caixa. O Dashboard novo
passa a usar `/cash-register/current` para os números do turno, mas
"produtos mais vendidos" segue restrito.

---

## Encontrados na branch `fix/frontend-integrity` (2026-09-28)

Vistos durante a correção; nenhum foi corrigido nela.

### 17. Pedidos: `tableId` da URL é ignorado

- **Onde:** `frontend/src/pages/pdv/OrdersPage.tsx`; o link sai de
  `TablesPage.tsx` ("Adicionar Pedido").
- **O que acontece:** Mesas abre `/pdv/orders?tableId=…`, mas a tela de
  Pedidos não lê esse parâmetro. A mesa não vem selecionada: o caixa escolhe
  de novo. Era assim também antes da troca do `window.location.href`.

### 18. Teste da sidebar de Configurações falhando na `main`

- **Onde:** `frontend/tests/settings-pages.test.tsx` ("expands like other
  groups and highlights the active settings child").
- **O que acontece:** o teste procura o link "Documentos Fiscais"; a sidebar
  (`MainLayout.tsx`) diz "Documentos fiscais", seguindo a regra de só a
  primeira letra maiúscula. O teste está desatualizado, não a tela. Também
  há 10 erros de lint anteriores (`no-explicit-any`, `prefer-const`) em
  `EditOrderModal`, `WaitersManagementPage`, `OrdersPage` e outras.

### 19. Cobertura que só existia contra o `HistoryPage` morto

- **Onde:** o teste removido de `frontend/tests/cash-register-audit.test.tsx`.
- **O que acontece:** ele verificava mesa, garçom responsável, autor da
  sangria e "aberto por / fechado por" num histórico. As telas vivas
  (`OrderHistoryPage`, `CashClosuresPage`) mostram esses dados, mas
  `history-pages.test.tsx` só confere nome gravado do produto e taxa de
  entrega. Vale portar essas asserções para as telas vivas.

### 20. Telas abertas sem internet pela primeira vez

- **Onde:** rotas lazy em `frontend/src/App.tsx`.
- **O que acontece:** o código de cada tela só é baixado na primeira visita.
  Sem conexão, uma tela ainda não visitada mostra a tela de erro de rota
  ("Esta tela não carregou"), não os dados. Só o Dashboard é carregado de
  antemão. Carregar as telas de operação (Pedidos, Mesas, Caixa) de antemão
  é uma decisão de produto: mais download no login, em troca de operar com a
  conexão instável.

---

## Encontrados no teste com banco real (2026-09-29)

Todos são da mesma classe do item 1: a tela afirma um estado que não
conseguiu medir. Os itens 21 e 22 foram vistos em Pedidos sem conexão e
corrigidos; o 23 é a limitação que ficou dessa correção.

### 21. Pedidos: "Nenhum pedido encontrado" depois de falhar ao carregar

> **Resolvido** na branch `fix/frontend-integrity` (`b7ae8c8`). Com a carga
> falhando, o corpo diz "Não foi possível carregar os pedidos."; a lista
> carregada vazia continua "Nenhum pedido encontrado.". Conferido no
> navegador, nos dois temas e no celular.

- **Onde:** `frontend/src/pages/pdv/OrdersPage.tsx:447-449` (`catch` da
  carga) e `:1329-1335` (estado vazio).
- **O que acontece:** a carga falha, o toast diz "Erro ao carregar
  pedidos." e a lista fica vazia. O corpo então mostra "Nenhum pedido
  encontrado.", que é afirmar ausência de pedidos sabendo que não foi
  possível buscá-los. O estado vazio não distingue "sem pedidos" de "não
  carregou".

### 22. Pedidos: faixa diz que o caixa está fechado sem saber

> **Resolvido** na branch `fix/frontend-integrity` (`b61a4a6`). A tela
> distingue aberto, fechado (o backend respondeu sem sessão) e desconhecido
> (a chamada falhou). No desconhecido, pedido novo continua bloqueado e a
> faixa diz que não foi possível confirmar a situação do caixa. Conferido no
> navegador, nos dois temas e no celular, inclusive com o caixa fechado de
> verdade. Ver item 23.

- **Onde:** `frontend/src/pages/pdv/OrdersPage.tsx:432` (a falha de
  `/cash-register/current` vira `null`), `:1216` (`isCashOpen =
  !!currentCash`) e `:1320-1326` (a faixa).
- **O que acontece:** com `/cash-register/current` falhando, `currentCash`
  fica `null` e a faixa mostra "O caixa está fechado. Abra o caixa para
  liberar novos pedidos." A situação do caixa é desconhecida, não fechada.
  O Dashboard, na mesma condição, diz "Situação do turno não disponível."
  (`frontend/src/pages/DashboardPage.tsx:625`).
- **Por que é grave:** o operador pode tentar abrir um caixa que já está
  aberto.

### 23. Pedidos: queda de rede com a tela aberta mantém o último estado do caixa

- **Onde:** `frontend/src/pages/pdv/OrdersPage.tsx`,
  `refreshOperationalData` (a atualização em segundo plano).
- **O que acontece:** com a tela já aberta e o caixa confirmado como
  aberto, se a rede cai, a atualização busca pedidos, mesas e caixa num
  único `Promise.all`. A falha de qualquer chamada descarta tudo, e o `catch`
  só registra no console. O estado do caixa fica como o último confirmado, e
  o botão "Novo Pedido" segue liberado, embora a situação do caixa não possa
  mais ser confirmada. Só a carga completa (ao abrir a tela ou depois de uma
  ação) passa a "desconhecido" quando a chamada do caixa falha.
- **Resta decidir:** se uma falha em segundo plano deve levar o caixa a
  "desconhecido" e bloquear pedido novo, sabendo que uma instabilidade curta
  bloquearia o operador até a próxima atualização que der certo.

---

## Pendências visuais relacionadas

- `CreditPage` e `DesignSystemPage`: vão branco nas laterais, anterior à casca
  nova (ver `design-system.md`, seção 4).
- Preço ajustado de Pedidos continua `<input type="number">` em vez de
  `CurrencyInput`, por risco operacional (ver `design-system.md`, seção 3,
  "Exceções em aberto").
- Mesas (`TablesPage`) segue com cor literal e não foi migrada: no tema
  escuro o título "Mesas" some. Os textos do aviso de caixa fechado e da
  confirmação de fechamento estão sem acento ("Nao e possivel", "sera").

---

## Encontrados no levantamento de fuso horário (2026-09-29)

Ficaram fora da branch `fix/restaurant-timezone` por dependerem de decisão de
produto ou por não terem chamador.

### 24. Períodos financeiros maiores são móveis

- **Onde:** `backend/src/services/finance.service.ts` (`periodToDates`).
- **O que acontece:** "semana", "mês" e "ano" significam os últimos 7 dias,
  1 mês e 1 ano contados do instante atual. Não são semana, mês ou ano de
  calendário.
- **Pergunta em aberto:** os rótulos e números devem continuar móveis ou devem
  passar a representar o período de calendário atual? A mudança altera números
  já exibidos e precisa de decisão de produto.

### 25. O frontend decide "hoje" pelo relógio do terminal

- **Onde:** `frontend/src/pages/DashboardPage.tsx` (título, vencimentos, duração
  do turno e virada do dia), `frontend/src/pages/finance/PayablesPage.tsx`
  (conta vencida), `frontend/src/pages/pdv/OrdersPage.tsx` e
  `frontend/src/pages/menu/MarmitaMenuPage.tsx` (dia do cardápio de marmita).
- **O que acontece:** os cálculos usam o relógio ou o fuso do navegador. Se o
  terminal do balcão estiver configurado com outro fuso, a interface pode mudar
  de dia antes ou depois do restaurante, mesmo com o backend correto.
- **Resta decidir:** quais datas devem vir prontas do backend e qual contrato
  deve expor o dia civil do restaurante sem duplicar a regra no frontend.

### 26. `findOverdue` não tem chamador e sua regra de "vencido hoje" é indefinida

- **Onde:** `backend/src/repositories/payableAccount.repository.ts`
  (`findOverdue`).
- **O que acontece:** o método não é chamado e compara `due_date` com o instante
  atual. Antes de reutilizá-lo, é preciso decidir se uma conta com vencimento no
  dia atual já está vencida desde 00:00, só após o fim do dia do restaurante ou
  conforme outra regra. Hoje ele é código morto.
---

## Encontrados no levantamento de consultas (2026-09-29)

### 27. Outros endpoints com consultas que multiplicam

Ficaram deliberadamente fora da branch `perf/query-fanout`. A varredura estática
localizou consulta dentro de laço ou fan-out por registro em 17 rotas. A contagem
de consultas dessas rotas ainda não foi medida contra o banco real; nesta etapa,
só foram medidos os três endpoints do item 10.

**Próxima etapa — caminho mais quente do app do garçom (2):**

- `GET /categories`
- `GET /products`

Essas duas rotas devem ser as primeiras da próxima etapa: a disponibilidade de
produto fará o app do garçom consultá-las continuamente.

**Alta prioridade — leituras operacionais e relatórios (8):**

- `GET /customers`
- `GET /suppliers/comparison`
- `GET /cash-register/current`
- `GET /cash-register/history`
- `GET /cash-register/closures-history`
- `GET /cash-register/orders-history`
- `GET /orders/:id`
- `GET /orders/:id/receipt`

**Alto risco de regressão — escritas e emissão fiscal (7):**

- `POST /orders`
- `POST /orders/public`
- `PATCH /orders/:id`
- `DELETE /orders/:id`
- `POST /invoices`
- `POST /invoices/nfe`
- `POST /invoices/nfce`

Os caminhos de escrita precisam de uma etapa própria por envolverem atomicidade,
idempotência e estoque. Os três caminhos fiscais também precisam de validação
específica, pois alteram emissão de documento e uma falha não é reversível como
uma leitura incorreta.

### 28. PRIORIDADE ALTA: o esquema versionado não reproduz o banco atual

O catálogo real do Supabase contém índices que não são criados pelas migrations
em `backend/supabase/migrations/`. A comparação considera tanto comandos
`CREATE INDEX` explícitos quanto índices implícitos de `PRIMARY KEY` e `UNIQUE`.
Os seguintes índices do catálogo não têm definição versionada:

- **`cash_register_sessions` (7):**
  `cash_register_sessions_pkey`, `idx_cash_sessions_closed_at`,
  `idx_cash_sessions_closed_by_id`, `idx_cash_sessions_only_one_open`,
  `idx_cash_sessions_opened_at`, `idx_cash_sessions_opened_by_id` e
  `idx_cash_sessions_status`.
- **`credit_transactions` (3):** `credit_transactions_pkey`,
  `idx_credit_tx_created_at` e `idx_credit_tx_customer_id`.
- **`customers` (5):** `customers_email_unique`, `customers_phone_unique`,
  `customers_pkey`, `idx_customers_name` e `idx_customers_name_trgm`.
- **`order_items` (3):** `idx_order_items_order_id`,
  `idx_order_items_product_id` e `order_items_pkey`.
- **`orders` (11):** `idx_orders_cash_session_id`, `idx_orders_created_at`,
  `idx_orders_customer_id`, `idx_orders_customer_name_trgm`,
  `idx_orders_session_status`, `idx_orders_status`, `idx_orders_table_id`,
  `idx_orders_type`, `idx_orders_user_id`, `idx_orders_waiter_id` e
  `orders_pkey`.
- **`payments` (5):** `idx_payments_created_at`, `idx_payments_method`,
  `idx_payments_status`, `payments_order_unique` e `payments_pkey`.
- **`products` (3):** `idx_products_category_id`, `idx_products_name` e
  `products_pkey`.
- **`tables` (2):** `tables_number_unique` e `tables_pkey`.

Os seis índices de `invoices`, os dois índices versionados de
`credit_transactions` e `orders_idempotency_key_idx` encontrados no catálogo
já estão cobertos explícita ou implicitamente pelas migrations atuais e, por
isso, não entram na lista acima.

O item 14 registra o mesmo problema para a RPC `finance_report`: a função existe
no Supabase, mas sua definição não está no repositório. Em conjunto, esses casos
mostram que executar apenas as migrations versionadas em uma instalação nova não
reproduz o banco atual. Um segundo restaurante pode nascer sem índices usados
pelos fluxos mais acessados e sem a função do relatório financeiro, causando
diferenças de desempenho ou falha funcional sem aviso durante a instalação.

A correção exige uma etapa própria para decidir como reconstruir e versionar o
esquema-base antes de adicionar uma baseline ou migrations de reconciliação.

---

## Encontrados na modelagem de comandas (2026-09-29)

### 29. Consequências e débitos técnicos da introdução de comandas

1. **Situação de mesa divergente entre camadas — parcialmente resolvido nesta
   etapa.** O backend declarava `RESERVED`, a tela de Mesas usava `CLOSED` e o
   banco não restringia o valor. A migration de comandas passa a aceitar somente
   `AVAILABLE` e `OCCUPIED`, e o backend usa o mesmo conjunto. A tela de Mesas
   ainda precisa de uma tarefa própria para remover o estado transitório
   `CLOSED` e fazer uma única transição para `AVAILABLE`.
2. **Mesa liberada ao pagar apenas um de vários pedidos — resolvido nesta
   etapa.** `releaseTableIfEmpty` liberava sem procurar outro pedido ativo. O
   serviço agora considera `NEW`, `IN_PROGRESS`, `READY` e `DELIVERED`, com teste
   para dois pedidos na mesma mesa.
3. **`DELIVERED` ignorado no fechamento manual — resolvido nesta etapa.** Entregue
   e não pago continua sendo conta ativa tanto no serviço quanto nos gatilhos do
   banco.
4. **Caixa fechava com comanda aberta vazia — resolvido nesta etapa.** O serviço
   e `block_cash_close_with_pending_orders` bloqueiam qualquer comanda `OPEN` da
   sessão, mesmo sem pedidos.
5. **Documento fiscal continua pertencendo ao pedido — decisão temporária.** Uma
   comanda com três pedidos gera até três NFC-e/NF-e. Cada documento continua
   batendo com a venda do pedido e não há irregularidade, mas o cliente recebe
   três documentos em vez de um. Consolidar emissão por comanda exige uma etapa
   fiscal própria.
6. **Pagamento continua pertencendo ao pedido — decisão temporária.** Fechar uma
   comanda com três pedidos cria três pagamentos, um por pedido. Um único PIX de
   R$ 106,00 no extrato pode aparecer como três registros no sistema; a soma
   confere, mas a conciliação é mais trabalhosa. Representar uma transação por
   comanda exige remodelar pagamentos em outra etapa.

### 30. CONTRATO: projeções de `GET /api/config` por papel

`GET /api/config` mantém uma única URL, mas aplica projeção por papel para não
misturar configuração operacional com identidade fiscal. `ADMIN` recebe a
configuração completa. Os demais usuários autenticados recebem somente `name`,
`logoUrl`, `urbanDeliveryFee`, `ruralDeliveryFee` e `nfceEnabled`, necessários
no PDV e no fluxo atual do garçom. Campos fiscais como CNPJ, razão social, IE,
regime tributário, endereço fiscal, CFOP e NCM nunca aparecem nessa projeção.

A variação é intencional para preservar os consumidores existentes sem criar
uma segunda URL nem expor dados fiscais ao caixa e ao garçom. O repository usa
listas explícitas de colunas para as projeções administrativa, operacional e
pública; não usar `select('*')`. `GET /api/config/branding` continua público e
limitado a `name`, `logoUrl`, `bannerUrl`, `openingHours`, `openingDays`,
`deliveryFee` e `enabledPayments`.

As páginas `/settings/restaurant`, `/settings/fiscal` e `/design-system` ainda
precisam de guard de frontend para `ADMIN`. O backend já impede escrita por
outros papéis e a projeção operacional impede a leitura de identidade fiscal;
a correção da navegação pertence à etapa das telas do garçom.

---

## Encontrados nas telas do garçom (2026-10-01)

### 31. Tokens de borda não chegam a 3:1 em nenhum tema

- **Onde:** `frontend/src/index.css` (`--color-border-default` e
  `--color-border-strong`, nos dois temas). `border-default` aparece em 39
  pontos de `frontend/src` (contagem de 2026-10-01), incluindo `Card`,
  `Table`, `Input` e a casca.
- **O que acontece:** o design system exige 3:1 para elemento de interface
  (seção 6), e borda é elemento de interface. Nenhuma das duas bordas chega
  perto. Contraste calculado a partir dos valores dos tokens; no escuro, a
  borda translúcida foi composta sobre o `surface`, que é o que fica por
  baixo dela:

  | Token | Tema | contra `surface` | contra `canvas` |
  |---|---|---|---|
  | `border-default` | claro | 1,23 | 1,13 |
  | `border-default` | escuro | 1,24 | 1,40 |
  | `border-strong` | claro | 2,56 | 2,34 |
  | `border-strong` | escuro | 1,51 | 1,70 |

  Vale para **todo cartão do sistema**, não só para o app do garçom: cartão
  branco sobre fundo quase branco, com a borda praticamente invisível. Foi
  visto no cartão de mesa livre do garçom, que depende só da borda para
  existir na grade.
- **Por que importa:** `border-strong` se define como "divisória que precisa
  ser vista" e também não passa. Campo de formulário (`Input`, `Select`) usa
  `border-default` em repouso: ali a borda é o único contorno do controle,
  que é o caso mais claro do critério de 3:1.
- **Correção provável:** no token, e não tela a tela. Pode ser ajustar
  `border-strong` para passar de 3:1 e decidir onde cada borda é decorativa
  (agrupamento, que pode continuar leve) e onde é contorno de controle (que
  precisa de 3:1). Precisa de medição no navegador nos quatro fundos, como as
  cores `-strong` (seção 2).
- **Nesta etapa:** a correção fica só no cartão de mesa livre, na própria
  tela. O token não foi alterado.
- **Segunda correção pontual na mesma borda (2026-10-01):** o cartão livre
  passou primeiro a usar o token de texto `text-subtle` como borda (4,76 no
  claro, 3,75 no escuro). No claro ficou pesado, e a borda passou a ter
  **dois valores por tema**: `text-subtle` com 79% de opacidade no claro
  (3,19 contra o cartão) e `text-subtle` cheio no escuro. Duas correções
  pontuais na mesma borda são sinal de que o conserto certo é no token.
  Contra a página (`canvas`), o valor do claro fica em **2,91**: nenhum valor
  entre 3,0 e 3,2 contra o cartão passa de 3:1 contra a página, que é mais
  escura. O token novo precisa resolver os dois fundos.

---

## Encontrados na tela de lançar pedido do garçom (2026-10-01)

Vistos ao conferir a API para a Tela 4 (`docs/etapas/tela-lancar-pedido.md`).
A tela usa o que existe; nada disto foi alterado.

### 32. Produto sem vínculo de insumo aparece sempre disponível

- **Onde:** `backend/src/services/productAvailability.service.ts`
  (`productStockAvailability`), usado por `GET /api/products` e
  `GET /api/categories`.
- **O que acontece:** a disponibilidade é calculada pelos insumos vinculados
  ao produto. Sem vínculo, o serviço devolve `available: true` com
  `availableUnits: null`. Prato que a cozinha não vinculou a insumo nenhum
  (prato do dia, por exemplo) aparece como disponível na tela do garçom
  mesmo depois de acabar.
- **Por que importa:** a tela de lançar responde "tem tal coisa?" com esse
  dado. O garçom confia, promete ao cliente, e a cozinha não tem.
- **Relacionado:** item 33. Com produto por peso a conta também é fraca: ela
  é feita em unidades, e o produto só fica indisponível quando um insumo
  vinculado zera.

### 33. FUNCIONALIDADE DE PRODUTO: não existe "esgotado" manual

- **Onde:** `Product` (`backend/src/types/domain.ts`) não tem campo de
  ativo ou indisponível; a disponibilidade vem só do estoque (item 32).
- **O que acontece:** quando um prato acaba antes do estoque registrar, a
  cozinha não tem como marcar "acabou". O garçom continua vendo o prato
  como disponível.
- **É funcionalidade, não ajuste:** precisa de campo no banco, de quem pode
  marcar e desmarcar, de onde isso aparece no PDV e na cozinha, e de como
  combina com a disponibilidade por estoque. Etapa própria.

### 34. A API não devolve o preço efetivo por kg

- **Onde:** `backend/src/services/order.service.ts` (`resolveItemPricing`).
  A regra está duplicada em
  `frontend/src/pages/waiter/WaiterOrderPage.tsx` (`effectivePricePerKg`).
- **O que acontece:** para produto por peso em categoria de refeição
  (`isMealCategory`), o servidor cobra o `pricePerKg` da categoria, não o
  `price` do produto. O cardápio não devolve esse preço pronto, então a tela
  do garçom repete a regra para mostrar "R$ / kg" e o valor da linha.
- **Por que importa:** se o servidor mudar a regra e ninguém lembrar da
  tela, o garçom passa um preço e o caixa cobra outro, na frente do cliente.
- **Correção:** `GET /api/products` e `GET /api/categories` devolverem o
  preço efetivo por kg (e o modo de venda), e a tela deixar de calcular.

### 35. FUNCIONALIDADE DE PRODUTO: montagem de marmita e complementos no app do garçom

- **Onde:** a tela de lançar pedido do garçom (Tela 4) não monta marmita nem
  escolhe complementos. A montagem existe só no PDV.
- **O que acontece:** o garçom não consegue lançar marmita, que é parte
  grande do que o restaurante vende. Pedido de marmita na mesa continua
  dependendo do caixa.
- **É funcionalidade, não ajuste:** etapa própria, depois da Tela 4. O
  `docs/etapas/etapa-telas-garcom.md` já listava montagem e complementos
  entre o que não pode se perder da tela antiga.
