# Etapa — As telas do garçom

Segunda parte do app do garçom. A API já existe e está documentada em
`docs/api-waiter.md`. Esta etapa é só frontend.

**Leia primeiro:** `docs/api-waiter.md`, `docs/design-system.md` e
`docs/backlog.md`.

**Use a skill `frontend-design`.** O visual importa aqui tanto quanto o
comportamento.

---

## Quem usa e como

O garçom trabalha **em pé, andando pelo salão, com o celular numa mão
só**, com o cliente esperando na frente dele.

- **Quatro toques do salão até o pedido enviado.** Mesas → Mesa →
  Comanda → Lançar.
- **Nada que ele não use com o cliente na frente.** Sem Dashboard, sem
  relatório, sem configuração.
- **Alvo de toque nunca menor que 44px.**
- **Nunca rolar na horizontal.** É a reclamação principal da tela atual.

O que ele precisa responder rápido: quais mesas estão ocupadas, quanto
tem em aberto em cada uma, de quem é cada conta, e se tal produto está
disponível antes de prometer ao cliente.

---

## Construa em etapas, e me mostre a primeira

A tela de Mesas define o vocabulário visual do app inteiro. Construa ela
primeiro, valide, e **me relate antes de seguir para as outras três.**

Já aconteceu neste projeto de sair tudo correto e sem caráter nenhum.
Prefiro corrigir o rumo numa tela do que em quatro.

---

## Tela 1 — Mesas

Cabeçalho com "Mesas" e, abaixo, o nome do garçom e o papel. À direita,
sair.

Filtro em três abas: **Todas · Minhas · Livres**. Elas correspondem ao
`view=all|mine|free` de `GET /api/tables/overview`.

Grade de **três colunas**. Nunca rolagem horizontal.

Cada cartão de mesa ocupada mostra:
- o número, grande, com numeral tabular; **na mesma linha, à direita, o
  tempo desde a abertura**
- a situação, pequena, em maiúsculas
- espaço
- o saldo em aberto, em destaque
- quantas comandas

Mesa livre mostra o número, a situação e um convite curto para abrir.

**Cuidado com o espaço:** num celular de 390px com três colunas, a célula
útil tem cerca de 85px. Metadado precisa caber em uma linha. Foi por isso
que o tempo subiu para a linha do número, em vez de ficar junto da
contagem de comandas.

Barra inferior com **Mesas** e **Cardápio**.

---

## Tela 2 — Mesa aberta

Cabeçalho com voltar, "Mesa N", horário de abertura e tempo decorrido, e
a situação.

Bloco com o **saldo em aberto** em destaque e a contagem de comandas.
Use o `balance`, não o `total`: o primeiro é o que falta receber.

Lista de comandas. Cada linha: iniciais do nome, o nome, contagem de
itens e horário do último lançamento, o saldo à direita, e uma seta.

Botão **Nova comanda**, visivelmente diferente das comandas existentes.

Um aviso explicando que cada comanda fecha a conta separada e que a mesa
só libera quando todas forem pagas. É regra nova para o garçom.

Abrir comanda em mesa livre funciona: a API ocupa a mesa e cria a comanda
na mesma transação.

---

## Tela 3 — Comanda

Cabeçalho com voltar, o nome da comanda, a mesa, e imprimir — que usa
`GET /api/table-tabs/:tabId/receipt`.

Itens **agrupados por envio**, com horário e situação daquele envio. O
garçom precisa saber o que já saiu da cozinha para responder ao cliente.

Cada item: quantidade, nome, observação quando houver, valor.

Total da comanda em destaque, no fim.

Barra inferior fixa: **Adicionar itens**, grande.

---

## Tela 4 — Lançar pedido

A mais importante. Tela cheia, sem a navegação inferior.

Cabeçalho com fechar, "Adicionar itens", e abaixo o nome da comanda e a
mesa — ele precisa ver em que conta está lançando.

**Busca no topo, sempre visível.** É o caminho mais rápido para "tem tal
marmita?".

Abas de categoria em pílulas.

Lista de produtos. Cada linha: nome, preço, e **etiqueta de
disponibilidade** a partir do `availableUnits`:
- `null` → disponível, sem número
- maior que zero e baixo → "últimas N"
- zero → **esgotado**
- **produto vendido por peso nunca mostra número**, só disponível ou
  esgotado

Produto esgotado aparece apagado e **não pode ser lançado**: no lugar do
botão de adicionar, diz que não dá para lançar.

Produto disponível tem botão de adicionar; depois de adicionado, vira
contador com menos e mais.

Barra inferior fixa com contagem de itens, total e **Enviar para a
cozinha**. Sem item nenhum, a barra explica o que fazer em vez de mostrar
um botão morto.

---

## O que não pode ser perdido da tela atual

A `WaiterTablesPage.tsx` vai ser substituída. Tudo isto precisa
continuar funcionando:

- produto por peso, com a pesagem
- montagem de marmita e seus complementos
- observação por item
- aumentar, reduzir e remover item antes de enviar
- nome da pessoa no pedido
- **editar e cancelar pedido `NEW` lançado pelo próprio garçom**
- bloqueio quando o caixa está fechado
- mensagem de estoque insuficiente
- **chave de idempotência** no corpo e no cabeçalho, e proteção contra
  envio duplo

O pedido passa a enviar `tableTabId` junto com `tableId`.

---

## Navegação

O garçom **não vê o Dashboard**. Depois do login cai direto nas mesas, e
o Dashboard deixa de aceitar `WAITER`.

Implemente a função única que o levantamento anterior propôs —
`getHomePath(role)` — usada no login, na raiz, no fallback e nos
redirecionamentos de acesso negado.

As rotas `/waiter/*` usam casca própria, sem a sidebar administrativa.

Rotas aprovadas:

```
/waiter/tables
/waiter/tables/:tableId
/waiter/tables/:tableId/tabs/:tabId
/waiter/tables/:tableId/tabs/:tabId/items/new
/waiter/menu
/waiter/tables/:tableId/tabs/new
/waiter/tables/:tableId/tabs/:tabId/orders/:orderId/edit
```

Cada tela é rota de verdade, não estado de modal: **o botão voltar do
Android tem que percorrer Lançar → Comanda → Mesa → Mesas.** Os botões de
voltar do cabeçalho apontam para a rota pai conhecida, para funcionar
também quando a pessoa abre a URL direto.

### Guards que estão abertos

`/settings/restaurant`, `/settings/fiscal` e `/design-system` estão sob o
guard genérico e abrem pela URL para quem não deveria. O dado já está
protegido — a API responde 403 desde a etapa anterior — mas a página
carrega quebrada.

Restrinja essas rotas por papel. Está registrado no backlog.

---

## Tempo real

Os canais existem: `table-tab-events`, `order-events` e `stock-events`.
Broadcast sai do backend; o frontend **não** usa `postgres_changes`.

Agrupe eventos próximos e faça uma recarga só. Reconexão refaz a
consulta.

---

## Regras do projeto

- **Nada de informação inventada.** Chamada que falhou mostra "Não
  disponível", nunca zero, nunca "nenhum item". Vale também para dado
  velho que não pode mais ser confirmado.
- **Ausência só se afirma com a fonte respondendo.**
- Nenhuma cor literal do Tailwind. Tudo por token.
- Nenhum emoji.
- `CurrencyInput` em todo campo de dinheiro; `formatCurrencyBRL` para
  exibir.
- Situação sempre por extenso em português.
- Nenhuma regra de negócio alterada.

---

## Fora desta etapa

- PWA instalável e funcionamento sem internet.
- Fechar e receber a comanda pela tela do garçom. A API já recusa: só
  ADMIN e CASHIER podem.
- Chamar garçom e QR por mesa.

---

## Validação

Build e lint passando não provam nada aqui.

- **390px é a largura principal**, não a de desktop.
- Nos dois temas.
- Rolagem horizontal em qualquer tela é defeito.
- Texto encostando ou vazando da borda é defeito — já aconteceu no
  protótipo com o cartão de mesa.
- Navegue pelo teclado e confira o foco.
- Com a rede desligada, nenhuma tela pode afirmar ausência de dado.
- Confira o caminho de voltar do navegador nas quatro telas.

Me diga o que validou olhando e o que só compilou, separado.

---

## Git

- Branch a partir da `main` atualizada: `feat/waiter-screens`
- Commits em inglês, Conventional Commits, um commit por tela ou assunto
- **Não abra PR e não faça merge.** Eu abro, testo e mergeio.
