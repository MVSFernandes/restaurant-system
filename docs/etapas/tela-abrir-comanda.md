# Tela 5 — Abrir comanda, e a rota `/waiter`

Dois consertos. O primeiro é uma tela que eu esqueci de especificar; o
segundo é uma rota que não existe.

---

## 1. A tela que faltou

Rota `/waiter/tables/:tableId/tabs/new`.

As Telas 2 e 3 mandam o garçom para cá — "Nova comanda" e "Abrir comanda"
— e não tem nada do outro lado. Pior: o `new` está sendo lido como id de
comanda, e a tela da Comanda procura uma comanda chamada "new". Por isso
aparece "Comanda não encontrada" em vez de um erro que faça sentido.

**A rota nova tem que vir antes da rota com `:tabId`**, senão o `new`
continua sendo capturado como id.

### O que ela faz

Uma coisa só: **pergunta o nome e abre a comanda.**

É a tela mais curta do app e tem que ser a mais rápida. O garçom está de
pé, com o cliente sentando. Um campo, um botão.

### Cabeçalho

Igual ao das Telas 2 e 3 — usa o mesmo componente.

- Voltar 44×44, apontando para `/waiter/tables/:tableId`
- Título: "Abrir comanda" — 24px / 30px, peso 700, ls −0,3px
- abaixo, 2px: "Mesa 01" — 13px / 18px, `text-muted`. Se a mesa estiver
  ocupada, "Mesa 01 · 2 comandas abertas"

### O corpo

Padding 20px. Um campo só, 18px abaixo do cabeçalho:

- rótulo "Nome do cliente" — 13px / 18px, `text-muted`, peso 600
- campo de 56px, raio 12px, borda `border-default`, texto **16px**
  (abaixo disso o iPhone dá zoom e a tela pula)
- placeholder: "Ex.: João"
- foco automático ao abrir, para o teclado já subir
- Enter envia

Abaixo, 10px, em 13px / 18px `text-muted`:

"O nome aparece na comanda e na conta. Pode ser o apelido."

**Quando a mesa já tiver comandas abertas**, 18px abaixo do campo, a lista
dos nomes que já estão lá, para o garçom não repetir sem querer:

- rótulo "JÁ ABERTAS" — 12px / 16px, peso 600, ls 0,4px, `text-muted`
- os nomes em linha, separados por " · ", 13px / 18px, `text-muted`

### Barra inferior

Fixa, igual às outras. Um botão de largura inteira, 56px, raio 14px, fundo
`primary`, `text-primary-fg`, 17px peso 600: **"Abrir comanda"**.

Desabilitado enquanto o campo estiver vazio.

### O envio

`POST /api/tables/:tableId/tabs`, que já existe e já aceita WAITER. Ele
chama o `open_table_tab`: trava a linha da mesa, confere o caixa aberto,
recusa nome repetido e ocupa a mesa se ela estiver livre, tudo na mesma
transação. **Não reimplemente nada disso aqui.**

Enquanto envia, o botão vira "Abrindo…" e fica desabilitado.

**Deu certo:** vai direto para a comanda recém-criada,
`/waiter/tables/:tableId/tabs/:tabId`, substituindo esta tela na história
do navegador. O voltar de lá leva para a mesa, não para cá.

**Nome repetido:** a mensagem aparece abaixo do campo, em
`text-warning-strong`, 13px / 18px, e o campo fica em foco com o texto
selecionado, pronto para corrigir. A mensagem é a do servidor, em
português.

**Caixa fechado:** a mesma faixa de aviso das outras telas, e o botão
desabilitado. Não adianta deixar ele digitar para falhar depois.

**Falhou por outro motivo:** a mensagem aparece, o nome digitado **não se
perde**, e o botão volta ao normal.

### Validação

- 390px e 360px, nos dois temas
- com o teclado aberto, o botão continua alcançável
- nome com 40 caracteres não vaza
- nome repetido mostra a mensagem certa, não um erro genérico
- abrir a primeira comanda numa mesa livre deixa a mesa ocupada

---

## 2. A rota `/waiter`

`/waiter` sozinho não leva a lugar nenhum. Hoje cai na tela de rota
desconhecida, o que está tecnicamente certo e na prática errado: é o
endereço que qualquer pessoa digita.

`/waiter` passa a redirecionar para `/waiter/tables`.

E já que o `getHomePath` existe e só a tela de erro usa: **a raiz também
passa a usá-lo.** Hoje `/` manda todo mundo para `/dashboard`, inclusive o
garçom, que não tem o que fazer lá. Um garçom que entra pela raiz tem que
cair nas mesas.

Commit próprio para essa parte.

---

## Me mostra

A tela de abrir comanda a 390px nos dois temas: uma com a mesa livre, e
uma com a mesa que já tem duas comandas abertas, mostrando a lista de
nomes.
