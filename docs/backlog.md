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

- **Onde:** `frontend/src/pages/DashboardPage.tsx:320`.
- **O que acontece:** "Alertas de Estoque" leva a `/inventory/stock`, que não
  existe. A rota coringa redireciona para o Dashboard. A rota certa é
  `/stock/items`.

### 4. Dashboard: cartões apontam para rotas que o perfil não acessa

- **Onde:** `frontend/src/pages/DashboardPage.tsx:306`, `:313` e `:327`.
- **O que acontece:** Caixa clica em "Faturamento Hoje" (`/finance/reports`)
  e Financeiro clica em "Pedidos Hoje" ou "Mesas Ocupadas" (`/pdv/*`). A rota
  protegida devolve os dois para o Dashboard, sem explicar por quê.

### 5. Mesas: alerta de caixa fechado nunca aparece

- **Onde:** `frontend/src/pages/pdv/TablesPage.tsx:62`, com o botão em `:165`.
- **O que acontece:** o `alert()` só roda se o caixa estiver fechado, mas o
  botão "Abrir Mesa" já fica desabilitado nesse caso. É código inalcançável.
  O texto também está sem acento ("Nao e possivel").

### 6. Mesas: "Adicionar Pedido" recarrega o app inteiro

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

## Pendências visuais relacionadas

- `CreditPage` e `DesignSystemPage`: vão branco nas laterais, anterior à casca
  nova (ver `design-system.md`, seção 4).
- Preço ajustado de Pedidos continua `<input type="number">` em vez de
  `CurrencyInput`, por risco operacional (ver `design-system.md`, seção 3,
  "Exceções em aberto").
