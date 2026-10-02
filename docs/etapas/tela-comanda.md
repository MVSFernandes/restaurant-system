# Tela 3 — Comanda

Especificação com valores exatos. Rota `/waiter/tables/:tableId/tabs/:tabId`.

A tela responde uma pergunta: **o que esta pessoa já pediu, e quanto ela
deve.**

É a tela que o garçom abre quando o cliente pergunta "o que eu já pedi?" ou
"quanto deu até agora?". Ela tem que responder sem o garçom rolar, pensar
ou somar nada de cabeça.

---

## Antes de construir: confere a API

Eu já errei isso uma vez, na Mesa aberta — descrevi a tela sem conferir o
que a API devolvia, e você teve que fazer duas chamadas onde eu disse uma.

Esta tela precisa de:

- o nome da comanda, quando abriu, o saldo e o total
- o número da mesa, para o cabeçalho
- **os itens lançados, agrupados por lançamento**, com a hora de cada
  lançamento, e para cada item: nome do produto, quantidade, observação e
  valor

**Confere o que existe hoje antes de escrever a tela.** Se os itens não
vierem agrupados, ou não vierem com observação, **para e me fala** em vez
de inventar um agrupamento no frontend. Agrupamento por lançamento é dado
do servidor, não enfeite de tela.

---

## Cabeçalho

Fixo no topo, `bg-surface`, borda inferior `border-default`, padding 20px
nas laterais, 20px em cima e 18px embaixo.

Em linha, 12px de espaço:

- **Voltar:** 44×44, `bg-surface`, borda `border-default`, raio 12px,
  ícone 20px. Aponta para `/waiter/tables/:tableId`, por link de verdade.
- **Bloco de título**, ocupando o resto:
  - o nome da comanda — 24px / 30px, peso 700, letter-spacing −0,3px.
    Corta com reticências numa linha só.
  - abaixo, 2px: "Mesa 01 · aberta às 20:34" — 13px / 18px, `text-muted`.
- **Sem pílula de situação.** Comanda fechada tem tratamento próprio, mais
  abaixo.

---

## Bloco de saldo

Card, padding 18px, raio 16px, `bg-surface`, borda `border-default`. 18px
abaixo do cabeçalho.

Primeira linha, alinhada pela base:

- **Esquerda:**
  - "Em aberto" — 13px / 18px, `text-muted`
  - abaixo, 4px: o `balance` — 30px / 36px, peso 700, letter-spacing
    −0,6px, tabular. Mesma regra de encolher do cartão de mesa.
- **Direita**, 6px acima da base: a contagem de itens — 13px / 18px,
  `text-muted`.

Segunda linha, só **quando já houve pagamento parcial** (`paidTotal` maior
que zero): 12px acima, separada por uma borda `border-default` em cima com
12px de respiro, em 13px / 18px `text-muted`:

"Consumo R$ 45,00 · pago R$ 20,00"

Sem pagamento nenhum, essa linha não aparece. Não mostre "pago R$ 0,00".

---

## Lista de itens

Rótulo: "ITENS" — 13px / 18px, peso 600, letter-spacing 0,4px,
`text-muted`. 10px até o primeiro grupo.

**Agrupados por lançamento, do mais recente para o mais antigo.** O garçom
acabou de lançar e quer conferir; o que ele lançou agora é o que importa.

Cada grupo:

- **Cabeçalho do grupo:** "20:36" — 12px / 16px, peso 600, `text-muted`,
  letter-spacing 0,3px. 8px abaixo dele começa o card.
- **Card do grupo:** padding 16px, raio 16px, `bg-surface`, borda
  `border-default`. 16px entre grupos.

Dentro do card, cada item em linha, com 12px entre itens e uma borda
`border-default` separando, com 12px de respiro de cada lado:

1. **Quantidade**, à esquerda: "2×" — 15px / 20px, peso 700, tabular,
   largura fixa de 32px, alinhada à esquerda.
2. **Bloco central**, ocupando o espaço:
   - nome do produto — 15px / 20px, peso 500. Quebra em duas linhas se
     precisar; não corta.
   - observação, quando houver — 13px / 18px, `text-muted`, 2px abaixo.
     **A observação nunca é cortada.** É ela que diz "sem cebola".
3. **Valor**, à direita: 15px / 20px, peso 600, tabular. É o valor da
   linha, quantidade já multiplicada.

---

## Comanda fechada

Quando `status` for `CLOSED`, a tela continua abrindo — o garçom pode
precisar conferir o que foi consumido depois de pago.

Muda:

- o bloco de saldo mostra "Paga" em `text-success-strong`, 30px / 36px,
  peso 700, no lugar do valor em aberto. Abaixo, 4px, o total consumido em
  13px / 18px `text-muted`.
- aparece uma faixa acima da lista: card padding 12px 16px, raio 14px,
  `bg-surface`, borda `border-default`, texto 13px / 19px `text-muted`:
  "Comanda fechada às 21:14. Não aceita novos pedidos."
- **a barra inferior some inteira.** Nada de lançar pedido numa comanda
  paga.

---

## Barra inferior

Fixa, `bg-surface`, borda superior `border-default`, padding 12px 20px
20px.

Duas ações em linha, 10px entre elas, altura 56px, raio 14px:

- **"Lançar pedido"**, ocupando o espaço que sobrar: fundo `primary`,
  texto `text-primary-fg`, 17px peso 600, ícone 20px com 10px de espaço.
  Leva para `/waiter/tables/:tableId/tabs/:tabId/order`.
- **Imprimir**, 56×56 fixo: `bg-surface`, borda `border-default`, ícone
  20px. Só o ícone, com rótulo acessível "Imprimir comanda".

A ação principal é lançar. Imprimir é ocasional e fica do tamanho de um
ícone.

**Imprimir mora aqui**, não na tela da Mesa: o garçom imprime a conta de
uma pessoa, não a da mesa inteira.

---

## O que a tela NÃO faz

- **Não fecha nem recebe.** A API permite só para ADMIN e CASHIER.
- **Não cancela item lançado.** Isso mexe em estoque e em dinheiro; é
  decisão de caixa, não de garçom.
- **Não renomeia a comanda.** Fica para depois, se precisar.

---

## Dados e falha

- carregando: `Skeleton` no bloco de saldo e em dois grupos de itens
- falhou: saldo e lista mostram "Não disponível" com "Tentar de novo".
  **Nunca R$ 0,00, nunca lista vazia.**
- respondeu sem item nenhum: `EmptyState` com "Nenhum item lançado" e
  "Lance o primeiro pedido desta comanda."
- comanda que não existe: "Comanda não encontrada", com link para a mesa

Tempo real pelos mesmos canais da Mesa aberta. Item lançado por outro
garçom aparece sem recarregar a mão.

---

## Também nesta etapa: a rota que mente

Hoje, rota que não existe joga o usuário no Dashboard em silêncio. Para um
admin é esquisito; para um garçom é pior — ele cai numa tela que não é
dele, no meio do salão, sem entender o que houve.

Rota desconhecida passa a mostrar a tela de erro de rota, com o caminho de
volta para a home do papel de quem está logado. Commit próprio.

---

## Validação

- 390px é a largura principal; confere também em 360px
- nos dois temas
- rolagem horizontal é defeito
- nome de produto longo quebra em duas linhas e não empurra o valor
- observação longa aparece inteira
- comanda com 20 itens em 6 lançamentos continua legível
- voltar leva para a mesa, não para a grade

Me mostra a captura a 390px nos dois temas: uma comanda com dois
lançamentos e observação em pelo menos um item, e uma comanda fechada.

Constrói e me mostra antes de ir para a Tela 4.
