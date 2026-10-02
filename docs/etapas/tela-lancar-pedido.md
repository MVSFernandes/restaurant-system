# Tela 4 — Lançar pedido

Especificação com valores exatos.
Rota `/waiter/tables/:tableId/tabs/:tabId/order`.

É a tela onde o garçom passa o tempo dele. As outras três ele olha; esta
ele usa, de pé, com o cliente esperando, segurando o celular numa mão só.

Ela responde duas perguntas, nesta ordem:

1. **"Tem tal coisa?"** — o cliente pergunta antes de pedir.
2. **"Então manda."** — e o pedido tem que chegar na cozinha certo.

---

## Antes de construir: confere a API

Esta tela precisa de:

- **o cardápio com disponibilidade**: produto, categoria, preço, e se está
  disponível agora. Sem isso, o garçom promete uma coisa que a cozinha não
  tem.
- **o tipo de venda**: item por unidade e item por peso são preenchidos de
  jeitos diferentes.
- **o envio do pedido**, com `tableTabId`, itens, quantidade, peso e
  **observação por item**, com chave de idempotência.

**Confere o que existe antes de escrever a tela.** Se a disponibilidade não
vier, ou vier por outro caminho, **para e me fala.** Disponibilidade
inventada no frontend é pior que nenhuma: o garçom confia e erra.

Já sei de uma coisa: **o `notes` existe no banco e na API, e nenhuma tela
do sistema escreve nele hoje.** Esta vai ser a primeira. Confirma que o
caminho de criação aceita `notes` por item.

---

## A regra que governa a tela

**Nada vai para a cozinha até o garçom mandar.**

O que ele monta é um rascunho que vive só no celular dele. Um toque errado
não vira comida. Só o botão de enviar cria o pedido, e ele cria **um
lançamento com todos os itens**, não um pedido por item — é assim que a
Tela 3 agrupa, e é assim que a cozinha recebe.

---

## Cabeçalho

Fixo no topo, `bg-surface`, borda inferior `border-default`, padding 20px
nas laterais, 20px em cima e 18px embaixo.

- **Voltar:** 44×44, igual às outras telas. Aponta para
  `/waiter/tables/:tableId/tabs/:tabId`.
- **Título:** "Lançar pedido" — 24px / 30px, peso 700, ls −0,3px.
- abaixo, 2px: o nome da comanda e a mesa — "joao · Mesa 01" — 13px / 18px,
  `text-muted`, cortando com reticências.

**O nome da comanda tem que estar visível o tempo todo.** Lançar na comanda
errada é o erro mais caro desta tela: cobra do cliente errado.

---

## Busca

Logo abaixo do cabeçalho, grudada nele, `bg-surface`, borda inferior
`border-default`, padding 12px 20px.

Campo de 48px, raio 12px, `bg-surface-sunken`, borda `border-default`,
ícone de lupa 20px à esquerda com 12px de respiro, texto 16px.

Placeholder: "Buscar no cardápio".

**16px é o mínimo**: abaixo disso o iPhone dá zoom sozinho ao focar o
campo, e a tela pula na mão do garçom.

Busca por nome, sem diferenciar acento nem maiúscula. Com texto digitado, a
lista ignora a categoria selecionada e busca no cardápio inteiro — "coca"
tem que achar a Coca estando em Bebidas ou não.

Com texto, aparece um botão de limpar 44×44 à direita.

---

## Categorias

Faixa rolável na horizontal, padding 12px 20px, 8px entre as pílulas.

Cada pílula: altura 36px, padding lateral 14px, raio total, 14px / 18px
peso 500.

- não selecionada: `bg-surface-sunken`, `text-muted`
- selecionada: `bg-primary-subtle`, borda `border-primary`,
  `text-primary-strong`, peso 600

A primeira é "Todos".

---

## Lista de produtos

Padding lateral 20px. Cada produto é um botão de linha inteira, não um
card: card para 60 produtos vira um desfile de caixas.

Altura mínima 64px, padding vertical 12px, borda inferior
`border-default`. A última linha não tem borda.

Em linha:

- **Bloco central**, ocupando o espaço:
  - nome — 16px / 21px, peso 500. Quebra em duas linhas; não corta.
  - abaixo, 2px, quando indisponível: "Sem estoque" — 13px / 18px,
    `text-warning-strong`, peso 600.
- **Preço**, à direita: 16px / 21px, peso 600, tabular. Item por peso
  mostra "R$ 54,90 / kg" com o "/ kg" em 13px `text-muted`.

**Produto indisponível aparece na lista, apagado, e não é tocável.**
`opacity-50`, sem ação. Não some.

Isso é de propósito e é a pergunta número 1 da tela. O garçom precisa poder
responder "acabou" sem voltar na cozinha. Produto escondido obriga ele a
procurar para descobrir que não existe.

---

## A folha do item

Tocar num produto disponível abre uma folha subindo de baixo
(`bottom sheet`), `bg-surface`, cantos de cima 20px, padding 20px, com o
fundo escurecido atrás.

Conteúdo:

- **Nome do produto** — 20px / 26px, peso 700. Abaixo, 2px, o preço
  unitário em 14px / 19px `text-muted`.
- **Quantidade**, 18px abaixo:
  - rótulo "Quantidade" — 13px / 18px, `text-muted`, peso 600
  - controle: dois botões de 48×48 (menos e mais), raio 12px, borda
    `border-default`, com o número no meio em 22px peso 700 tabular,
    largura mínima 56px, centralizado. 8px entre eles.
  - o menos fica desabilitado em 1.
- **Peso**, quando o produto for vendido por peso, no lugar da quantidade:
  - rótulo "Peso (kg)"
  - campo numérico de 48px, 16px, teclado decimal, com sufixo "kg"
  - abaixo, 6px: o valor calculado — "0,450 kg × R$ 54,90 = R$ 24,71" —
    13px / 18px `text-muted`, atualizando enquanto digita
- **Observação**, 18px abaixo:
  - rótulo "Observação" — 13px / 18px, `text-muted`, peso 600
  - campo de texto de 3 linhas, raio 12px, borda `border-default`, 16px,
    placeholder "Ex.: sem cebola, bem passado"
  - **sem limite de caracteres curto.** Se precisar de um teto, 200.
- **Botão**, 18px abaixo: largura inteira, 56px, raio 14px, fundo
  `primary`, `text-primary-fg`, 17px peso 600:
  "Adicionar · R$ 8,50", com o valor da linha já calculado.

Fechar a folha sem adicionar não guarda nada.

**A observação fica no mesmo lugar do preço e da quantidade, não escondida
atrás de um "mais opções".** Ela é parte de pedir, não um extra.

---

## A sacola

Enquanto o rascunho estiver vazio, a barra de baixo não existe. A lista
usa a tela inteira.

Com pelo menos um item, aparece uma barra fixa, `bg-surface`, borda
superior `border-default`, padding 12px 20px 20px.

Botão único de largura inteira, 56px, raio 14px, fundo `primary`,
`text-primary-fg`. Em linha, com o espaço distribuído:

- esquerda: "3 itens" — 14px / 18px, peso 600
- centro: "Ver sacola" — 17px peso 600
- direita: o total — 17px peso 700 tabular

Tocar abre a sacola, em folha de baixo, ocupando até 85% da altura:

- título "Sacola" — 20px / 26px, peso 700
- cada item em linha, padding vertical 14px, separado por
  `border-default`:
  - quantidade e nome na primeira linha — 15px / 20px
  - observação abaixo, quando houver — 13px / 18px `text-muted`,
    **inteira, sem cortar**
  - valor da linha à direita — 15px / 20px peso 600
  - botão de remover 44×44 à direita, ícone de lixeira 18px
- toque na linha reabre a folha do item, para corrigir
- rodapé da folha: "Total" e o valor em 20px peso 700, e abaixo o botão
  de enviar: largura inteira, 56px, fundo `primary`, 17px peso 600 —
  **"Enviar pedido"**

---

## O envio

Um `POST`, com todos os itens de uma vez, com chave de idempotência gerada
quando a sacola recebe o primeiro item e mantida até o envio dar certo.

Enquanto envia: o botão vira "Enviando…" e fica desabilitado. A folha não
fecha sozinha.

**Deu certo:** a folha fecha, a sacola esvazia e a tela volta para a
comanda, onde o lançamento novo já aparece no topo. Um aviso curto
confirma: "Pedido enviado".

**Deu errado:** a sacola **não esvazia**. A mensagem do servidor aparece
dentro da folha, acima do botão, em `bg-warning-subtle` com borda
`border-warning`, 13px / 19px, e o botão volta a "Enviar pedido" para
tentar de novo.

Perder a sacola montada por causa de uma falha de rede é inaceitável: o
garçom teria que lembrar de cabeça o que o cliente pediu.

**Sem conexão:** o botão de enviar fica desabilitado e a barra diz "Sem
conexão — o pedido não pode ser enviado agora". A sacola continua
montada.

---

## O que a tela NÃO faz

- **Não muda preço.** O lápis do PDV é sobrescrita de preço e é decisão de
  caixa, não de garçom.
- **Não cancela item já lançado.** Isso mexe em estoque e em dinheiro.
- **Não escolhe a comanda.** Ela já veio decidida; trocar aqui é o caminho
  mais curto para cobrar do cliente errado.

---

## Dados e falha

- carregando o cardápio: `Skeleton` em seis linhas
- falhou: "Cardápio não disponível" com "Tentar de novo". **Nunca lista
  vazia** — lista vazia diz que não tem nada para vender.
- categoria sem produto: "Nenhum produto nesta categoria"
- busca sem resultado: "Nada encontrado para «coca»"

---

## Validação

- 390px é a largura principal; confere também em 360px
- nos dois temas
- rolagem horizontal é defeito
- nome de produto longo quebra e não empurra o preço
- a folha do item abre com o teclado e o botão continua alcançável
- observação longa aparece inteira na sacola
- sacola com 10 itens continua rolável e o botão de enviar continua fixo
- enviar com a rede desligada não esvazia a sacola

Me mostra, a 390px nos dois temas: a lista com um produto sem estoque, a
folha do item com observação preenchida, e a sacola com três itens sendo um
deles com observação.

Constrói e me mostra antes de eu aprovar.
