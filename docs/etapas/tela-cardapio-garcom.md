# Tela 6 — Cardápio do garçom

Rota `/waiter/menu`. É o segundo item da barra de baixo, e hoje ele está
quebrado: leva para a tela de rota desconhecida.

A tela responde uma pergunta só: **"tem tal coisa, e quanto custa?"**

O garçom está na mesa, o cliente ainda está decidindo, e ninguém abriu
comanda nenhuma. Ele precisa conferir sem entrar num fluxo de pedido e sem
ir até a cozinha.

---

## Antes de construir

A lista de produtos da Tela 4 já faz quase tudo isto: busca, categorias,
produto com preço e disponibilidade, "Sem estoque" apagando só o nome e o
preço. **Reaproveita.**

Extrai o que já existe em `WaiterOrderPage` para um componente comum, e as
duas telas passam a usá-lo. Se o jeito mais limpo for outro, segue o seu,
mas **não duplica a lista.** Duas listas de cardápio em telas diferentes é
garantia de uma envelhecer.

Depois de extrair, **mede a Tela 4 de novo** e confirma que nada mudou
nela.

---

## O que muda em relação à Tela 4

**Tira:**

- a barra de baixo com "Ver pedido" — não tem pedido aqui
- a folha do item com quantidade e observação
- o botão de voltar no cabeçalho

**Mantém:**

- busca, com os mesmos valores (48px, fonte 16px, limpar 44×44)
- categorias, com as mesmas pílulas
- a linha do produto, igual
- produto sem estoque na lista, apagado, com "Sem estoque" em contraste
  cheio

**Põe:**

- cabeçalho simples: "Cardápio" — 24px / 30px, peso 700, ls −0,3px, com o
  mesmo padding das outras telas. Sem voltar: esta tela é raiz da
  navegação, igual à de Mesas.
- a navegação inferior do app continua aparecendo, como na tela de Mesas.

---

## O toque no produto

Aqui está a única decisão de desenho desta tela.

**O produto não é tocável.** A tela é de consulta; não existe comanda
escolhida, e qualquer caminho que leve a lançar pedido daqui vai exigir
escolher mesa e comanda no meio — que é exatamente a confusão que o app do
garçom foi feito para evitar.

Se o cliente pediu, o garçom vai para Mesas, abre ou escolhe a comanda, e
lança. É um toque a mais, e vale: lançar na comanda errada é o erro mais
caro do salão.

**Sem efeito de toque, sem seta, sem `hover` que pareça clicável.** Um
produto que parece botão e não faz nada é pior que um que não parece.

---

## Dados e falha

Mesma fonte da Tela 4.

- carregando: `Skeleton` em seis linhas
- falhou: "Cardápio não disponível" com "Tentar de novo". **Nunca lista
  vazia.**
- categoria sem produto: "Nenhum produto nesta categoria"
- busca sem resultado: "Nada encontrado para «coca»"

A disponibilidade é a mesma do servidor, com as mesmas limitações já
registradas no backlog (itens 32 e 33): produto sem vínculo de insumo
aparece sempre disponível, e não existe "esgotado" manual. Não inventa
nada no frontend.

---

## Validação

- 390px e 360px, nos dois temas
- rolagem horizontal é defeito
- nome longo quebra e não empurra o preço
- a navegação inferior não cobre o último produto da lista
- o item "Cardápio" da barra fica marcado como ativo quando a tela está
  aberta
- a Tela 4 continua idêntica depois da extração

Me mostra a captura a 390px nos dois temas, com um produto sem estoque e
um por peso na lista.
