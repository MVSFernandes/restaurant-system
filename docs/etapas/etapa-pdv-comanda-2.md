# Etapa — O PDV e a comanda: implementação

Segunda parte. O levantamento está feito e me corrigiu em três pontos; as
correções estão incorporadas abaixo. Não repita o levantamento.

---

## A decisão que governa o resto

**Mesa ocupada e comanda aberta são o mesmo evento.**

Uma mesa não fica ocupada porque alguém apertou um botão. Ela fica ocupada
porque uma pessoa sentou e uma conta começou a correr. Hoje o sistema
permite separar as duas coisas, e o resultado é uma mesa marcada como
ocupada sem nada acontecendo nela: ninguém deve, nada fecha, o salão mente
para quem olha.

Então:

- **ocupar uma mesa passa a ser consequência de abrir a primeira comanda.**
  Não existe mais ocupar sozinho.
- liberar continua sendo consequência de fechar a última comanda, que já
  funciona pelo `release_table_after_last_tab`.

Isso é regra de negócio, e vai nas duas camadas.

---

## 1. Backend: o pedido de mesa carrega a comanda

`POST /api/orders` passa a aceitar `tableTabId` quando `type` é `DINE_IN`,
e passa a **exigir**.

Validações no serviço, antes de gravar:

- `tableTabId` presente em pedido `DINE_IN`. Ausente, recusa.
- a comanda existe, está `OPEN`, e pertence à `tableId` enviada. A chave
  estrangeira composta já garante o vínculo no banco; o serviço recusa
  antes, com mensagem que diz o que houve.
- comanda fechada, recusa com erro próprio. O caixa precisa saber que a
  conta já foi paga, não receber um erro genérico.

**O `customerName` do pedido de mesa passa a vir da comanda.** Não do
formulário. O serviço preenche `customer_name` com o nome da comanda
escolhida, e o campo de texto livre sai do modal.

Isso mantém as cinco telas que já usam `customer_name` funcionando sem
mudança, e acaba com a possibilidade de o pedido dizer um nome e a comanda
dizer outro.

Dois acertos pequenos que o levantamento achou, no mesmo lugar:

- `trim()` no nome antes de gravar, aqui e na criação de comanda
- nome vazio vira `null`, não string vazia

Delivery e balcão não mudam. A recusa que já existe para `tableId` e
`tableTabId` fora de `DINE_IN` continua como está.

---

## 2. Banco: a mesa só fica ocupada com comanda

Migration versionada em `backend/supabase/migrations/`. **Eu aplico à mão.**

A regra: `tables.status` não pode ser `OCCUPIED` sem pelo menos uma comanda
`OPEN` naquela mesa.

**Não escreva o gatilho antes de me responder uma coisa.** O
`open_table_tab` ocupa a mesa e insere a comanda na mesma transação. Se a
ordem lá dentro for ocupar primeiro, um gatilho `BEFORE UPDATE` que procura
comanda aberta vai recusar a própria RPC.

Me diz qual dos caminhos é limpo no Postgres, com o motivo:

- inverter a ordem dentro do `open_table_tab` — inserir a comanda e depois
  ocupar — e um `BEFORE UPDATE` simples
- uma constraint `DEFERRABLE INITIALLY DEFERRED`, avaliada no fim da
  transação
- outro mecanismo que você conheça e que eu não listei

Se nenhum sair limpo, **para e me fala.** A validação no serviço entra
assim mesmo, a regra do banco vai para o backlog como item próprio, e eu
decido depois. Não quero um gatilho remendado para fechar esta etapa.

E some com o caminho que criou o problema: `PATCH /tables/:id/status` não
aceita mais `OCCUPIED`. Os outros estados que ele trata continuam.

---

## 3. PDV: o modal escolhe a comanda

No `OrdersPage`, tipo Mesa.

O seletor de mesa passa a listar **mesas livres também**. Hoje ele filtra e
mantém só as ocupadas, e por isso o caixa não consegue começar uma mesa
pelo pedido.

Escolhida a mesa, aparece a escolha da comanda:

- **mesa ocupada:** as comandas abertas dela, cada uma com nome e saldo, e
  mais a opção de abrir uma nova dando o nome.
- **mesa livre:** só a nova, com o nome obrigatório.

O campo "Nome da pessoa na mesa" sai. Quem tem nome é a comanda.

Abrir comanda nova usa o `POST /api/tables/:tableId/tabs`, que já existe e
já aceita CASHIER. Ele chama o `open_table_tab`, que trava a linha da mesa,
confere o caixa aberto, recusa nome repetido na mesma mesa e ocupa. **Não
reimplemente nada disso no frontend nem no serviço.**

Quando o nome for recusado por já existir aberto naquela mesa, o modal diz
isso com essas palavras. Não pode virar "erro ao criar pedido".

---

## 4. Tela de Mesas do PDV: "Abrir Mesa" vira abrir comanda

Hoje ela manda `PATCH status: OCCUPIED` e pronto. Depois da mudança acima
isso não funciona mais, e nem deveria.

O botão continua onde está — a Priscila já sabe onde ele fica — mas agora
pede o nome e abre a primeira comanda. A mesa ocupa como consequência.

---

## 5. Duas limpezas

**O `WaiterTablesPage.tsx` sai.** É código morto fora da navegação e ainda
cria pedido sem comanda. Código morto que sabe fazer a coisa errada volta
em algum copiar-e-colar.

**O `OrdersPage` passa a ler `?tableId`.** A tela de Mesas manda esse
parâmetro desde sempre e ninguém lê (item 17 do backlog). Com ele, a mesa
vem pré-selecionada e o modal abre. Commit próprio.

---

## Ordem e commits

Um commit por item, nesta ordem. Backend antes de frontend, para a branch
nunca passar por um estado onde a tela pede algo que a API não aceita.

1. backend aceita e exige `tableTabId`
2. migration da regra da mesa — **depois da sua resposta sobre o mecanismo**
3. `PATCH status` não aceita mais `OCCUPIED`
4. modal com escolha de comanda
5. "Abrir Mesa" abre comanda
6. remoção do `WaiterTablesPage.tsx`
7. `OrdersPage` lê `?tableId`

---

## Regras de sempre

- Branch própria, commits em inglês no padrão Conventional Commits.
- **Você não abre PR e não faz merge.** Eu abro e eu mergeio.
- Migration versionada; **eu aplico à mão** no Supabase.
- Regra crítica em duas camadas.
- Nada de `.env`, nada de reescrever histórico.

---

## O roteiro de teste que eu vou rodar

Escreve no retorno o que você espera de cada um destes. Se algum não for
testável pelo que você entregou, me fala antes.

1. Mesa livre, abrir comanda pelo modal: a mesa fica ocupada e o pedido
   nasce na comanda certa.
2. Mesma mesa, segunda comanda em outro nome: duas linhas na tela do
   garçom, e o total somando as duas. **É o teste que eu não consegui
   fazer até hoje.**
3. Nome repetido aberto na mesma mesa: recusa com a mensagem certa.
4. Caixa fechado: recusa ao abrir comanda.
5. Pagar uma das duas comandas: a mesa continua ocupada.
6. Pagar a segunda: a mesa libera sozinha.
7. Pedido de delivery e de balcão: nada mudou.
8. "Abrir Mesa" pela tela de Mesas: pede nome, abre comanda, ocupa.
