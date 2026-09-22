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

## Pendências visuais relacionadas

- `CreditPage` e `DesignSystemPage`: vão branco nas laterais, anterior à casca
  nova (ver `design-system.md`, seção 4).
- Preço ajustado de Pedidos continua `<input type="number">` em vez de
  `CurrencyInput`, por risco operacional (ver `design-system.md`, seção 3,
  "Exceções em aberto").
