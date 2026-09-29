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
