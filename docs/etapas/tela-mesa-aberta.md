# Tela 2 — Mesa aberta

Especificação com valores exatos. Rota `/waiter/tables/:tableId`.

A tela responde uma pergunta: **de quem é cada conta desta mesa, e
quanto cada uma deve.**

---

## Dois estados da tela

Ela é alcançada tanto por um cartão de mesa ocupada quanto por um cartão
de mesa livre. Precisa funcionar nos dois.

**Mesa ocupada:** cabeçalho com o tempo, bloco de saldo, lista de
comandas.

**Mesa livre:** cabeçalho sem tempo, sem bloco de saldo, estado vazio no
lugar da lista. A ação de baixo abre a primeira comanda, e a API ocupa a
mesa na mesma transação.

---

## Cabeçalho

Fixo no topo, fundo `bg-surface`, borda inferior `border-default`,
padding 20px nas laterais, 20px em cima e 18px embaixo.

Em linha, com 12px de espaço:

- **Voltar:** 44×44, `bg-surface`, borda `border-default`, raio 12px,
  ícone de seta 20px. Aponta para `/waiter/tables`, por link de verdade,
  para funcionar quando a URL é aberta direto.
- **Bloco de título**, ocupando o espaço restante:
  - "Mesa 07" — 24px / 30px, peso 700, letter-spacing −0,3px. Dois
    dígitos, como na grade.
  - abaixo, 2px de espaço: "Aberta às 19:38 · 42 min" — 13px / 18px,
    `text-muted`. Mesa livre: "Livre".
- **Pílula de situação**, à direita: padding 6px 12px, raio total,
  texto 12px / 16px, peso 700, letter-spacing 0,4px.
  - ocupada: `bg-primary-subtle`, borda `border-primary`, texto
    `text-primary-strong`, "OCUPADA"
  - livre: `bg-surface`, mesma borda do cartão livre, texto
    `text-success-strong`, "LIVRE"

---

## Bloco de saldo — só com a mesa ocupada

Card, padding 18px, raio 16px, `bg-surface`, borda `border-default`.
Margem de 18px abaixo do cabeçalho.

Em linha, alinhado pela base:

- **Esquerda:**
  - "Total em aberto" — 13px / 18px, `text-muted`
  - abaixo, 4px: o valor — 30px / 36px, peso 700, letter-spacing
    −0,6px, numeral tabular. É a **soma dos `balance`** das comandas
    abertas, não dos `total`.
- **Direita**, 6px acima da base: "2 comandas" — 13px / 18px,
  `text-muted`.

O valor cresce; aplica a mesma regra do cartão de mesa, encolhendo onde
não couber.

---

## Lista de comandas

Rótulo da seção: "COMANDAS" — 13px / 18px, peso 600, letter-spacing
0,4px, `text-muted`. 10px de espaço até a primeira linha.

Cada comanda é um link para
`/waiter/tables/:tableId/tabs/:tabId`. Card, padding 16px, raio 16px,
`bg-surface`, borda `border-default`. 10px entre as linhas.

Em linha, 14px de espaço:

1. **Iniciais**, 44×44, raio 12px, `bg-primary-subtle`, texto 16px peso
   700 em `text-primary-strong`. Duas letras: primeira do primeiro nome
   e primeira do último. Um nome só: as duas primeiras letras.
2. **Bloco central**, ocupando o espaço:
   - nome — 17px / 22px, peso 600
   - abaixo, 3px: "4 itens · último às 20:05" — 13px / 18px,
     `text-muted`. Usa `itemCount` e `lastOrderAt` da API. Sem nenhum
     lançamento: "sem itens".
3. **Bloco de valor**, alinhado à direita:
   - o `balance` — 17px / 22px, peso 700, tabular
   - abaixo, 3px: "Em aberto" — 12px / 16px, `text-muted`
   - `balance` zero: o valor some e fica só "Pago", 12px / 16px, em
     `text-success-strong`
4. **Seta** de 20px, `text-subtle`.

---

## Estado vazio

Mesa livre, ou ocupada sem comanda: usa o `EmptyState` do kit.

"Nenhuma comanda aberta" com a explicação "Abra a primeira comanda no
nome do cliente."

---

## Aviso sobre a regra da mesa

Depois da lista, com 18px de espaço. Card, padding 14px 16px, raio 14px,
`bg-warning-subtle`, borda `border-warning`.

Em linha, 12px de espaço: ícone de 20px em `text-warning-strong`,
alinhado ao topo com 1px de ajuste, e o texto em 13px / 19px.

Texto: "Cada comanda fecha a conta separada. A mesa só libera quando
todas forem pagas."

Só aparece com a mesa ocupada. Na mesa livre não faz sentido.

---

## Barra inferior

Fixa, `bg-surface`, borda superior `border-default`, padding 12px 20px
20px.

**Uma ação só, largura inteira, altura 56px, raio 14px**, fundo
`primary`, texto `text-primary-fg`, 17px peso 600, com ícone de 20px e
10px de espaço:

- mesa ocupada: "Nova comanda"
- mesa livre: "Abrir comanda"

Leva para `/waiter/tables/:tableId/tabs/new`.

**A lista não repete esse botão.** A ação principal mora embaixo, ao
alcance do polegar.

**Imprimir não fica aqui.** A conta da mesa inteira não é documento
deste app: o garçom imprime a comanda, não a mesa. Impressão aparece na
tela da Comanda.

---

## O que a tela NÃO faz

- **Não fecha nem recebe comanda.** A API permite só para ADMIN e
  CASHIER. Nenhum botão de pagamento nesta tela.
- **Não edita o nome da comanda.** Isso fica na tela da Comanda.
- **Não lança pedido direto.** Pedido pertence a uma comanda; o garçom
  escolhe a comanda primeiro.

---

## Dados e falha

Uma chamada: `GET /api/tables/:tableId/tabs`. Use `balance`, não
`total`.

- carregando: `Skeleton` no bloco de saldo e em três linhas de comanda
- falhou: o bloco de saldo e a lista mostram "Não disponível", com
  "Tentar de novo". **Nunca R$ 0,00, nunca lista vazia.**
- respondeu vazia: o estado vazio acima

Tempo real pelo `table-tab-events` e `order-events`, com o mesmo hook da
tela de Mesas: eventos próximos viram uma recarga só.

O tempo decorrido avança sozinho entre as consultas, partindo do valor
do servidor, como na tela de Mesas.

---

## Validação

- 390px é a largura principal; confere também em 360px
- nos dois temas
- rolagem horizontal é defeito
- nome longo de comanda não pode empurrar o valor para fora
- saldo de seis dígitos não pode vazar
- voltar do navegador tem que levar para `/waiter/tables`
- com a rede desligada, nada pode afirmar ausência de dado

Me mostra a captura a 390px nos dois temas, com uma mesa de duas
comandas e uma mesa livre.
