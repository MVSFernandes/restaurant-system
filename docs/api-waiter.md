# API do app do garçom

Esta etapa entrega somente o contrato de backend. As telas móveis serão
implementadas separadamente.

## Visão de mesas

`GET /api/tables/overview?view=all|mine|free`

Retorna todas as mesas em uma consulta em lote. Cada mesa mantém `id`, `number`
e `status` e acrescenta:

- `openBalance`: saldo ainda não pago das comandas abertas;
- `openTabCount`: quantidade de comandas abertas;
- `openedAt`: abertura da comanda aberta mais antiga, ou `null`;
- `openForMinutes`: minutos desde essa abertura, ou `null`;
- `hasCurrentWaiterTab`: indica se o usuário autenticado abriu ao menos uma
  comanda ainda aberta nessa mesa.

`view=mine` usa `hasCurrentWaiterTab`; é um filtro de visualização, não uma
restrição de acesso. Um garçom pode ver todas as comandas e todos os pedidos de
uma mesa. `view=free` retorna as mesas `AVAILABLE`.

## Comandas

`GET /api/tables/:tableId/tabs` mantém `total` como soma bruta das comandas
abertas por compatibilidade e acrescenta `balance`, que é o saldo em aberto que
a tela deve exibir. Cada resumo inclui `itemCount`, `lastOrderAt` e, por envio,
`createdAt`, `updatedAt` e `itemCount`.

`GET /api/table-tabs/:tabId` devolve o detalhe agregado. Cada envio em `orders`
inclui situação, horários e a lista de itens com o nome capturado no momento da
venda.

`GET /api/table-tabs/:tabId/receipt` gera um PDF único da comanda, agrupado por
envio e com total e saldo.

`POST /api/tables/:tableId/tabs` aceita mesa `AVAILABLE` ou `OCCUPIED`. A RPC
`open_table_tab` ocupa a mesa livre e insere a primeira comanda na mesma
transação. A migration é versionada e precisa ser aplicada antes de publicar o
backend desta branch.

## Pedidos e disponibilidade

`GET /api/orders?tableTabId=:tabId` filtra por comanda. Quando `tableId` ou
`tableTabId` define o escopo, o perfil `WAITER` recebe os pedidos completos
desse escopo, inclusive os lançados por outro garçom. Sem escopo, a listagem
legada do garçom continua pessoal; `myOrders=true` também força o filtro pelo
usuário atual.

As respostas de `GET /api/products` e `GET /api/categories` passam a incluir
`availableUnits`. O valor é o menor número inteiro de unidades que os insumos
vinculados ainda cobrem, usando as mesmas proporções da baixa de estoque. O
valor é `null` quando o produto não tem vínculo e, nesse caso, `available`
continua verdadeiro. Produtos vendidos por peso podem usar apenas o booleano
`available` na interface.

## Tempo real

A abertura e as alterações de comandas continuam publicando Broadcast pelo
backend no canal `table-tab-events`, usando a chave de serviço já configurada.
Leituras não publicam eventos.
