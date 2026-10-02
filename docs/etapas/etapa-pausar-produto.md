# Etapa — Pausar produto

O nome vem da WhatsMenu, onde existe uma aba para **pausar** um produto, e o
cliente passa a ver "Esgotado" no cardápio. É vocabulário que o dono de
restaurante já conhece, e por isso é o que o sistema vai usar.

Duas palavras, cada uma para um lado:

- **Pausar** é o que quem opera o restaurante faz. É a ação, e é o rótulo
  do controle.
- **Esgotado** é o que o garçom e o cliente leem. É o estado, e é o rótulo
  na tela deles.

Hoje o app do garçom escreve "Sem estoque" no produto indisponível. Troca
para **"Esgotado"**: o garçom não precisa saber se foi o estoque ou a
cozinha, só precisa saber que não tem.

## O problema

O app do garçom tem uma tela de cardápio que mostra o que está disponível, e
a tela de lançar pedido deixa de aceitar o que acabou. As duas dependem do
`available` que o servidor calcula.

Esse cálculo olha **só o estoque de insumo vinculado ao produto.** E a
maioria dos produtos não tem vínculo nenhum: o prato do dia, a marmita, o
que a cozinha faz na hora. Para esses, o servidor devolve `available: true`
para sempre.

O resultado prático: o garçom pergunta ao sistema se tem marmita e o
sistema responde que tem, sempre, inclusive às duas da tarde quando acabou.
**Responder "tem" sempre é pior que não responder** — o garçom aprende a
não confiar e volta a ir até a cozinha, e aí a tela de cardápio não serve
para nada.

Vale para qualquer restaurante que usar o sistema, não só o primeiro:
cadastrar insumo para cada prato é trabalho que a maioria não vai fazer, e
exigir isso para a disponibilidade funcionar é exigir o que não vai
acontecer.

Falta a coisa mais simples: alguém poder dizer "acabou".

---

## Antes de implementar: levantamento

**Não escreve código ainda.** Levanta e me reporta:

1. **O cálculo de disponibilidade.** O `productAvailability.service.ts`, de
   ponta a ponta: o que ele consulta, o que devolve, e em quais rotas entra.
   Quero saber exatamente onde um campo novo entraria.

2. **Onde o produto é cadastrado e editado hoje.** Qual tela, qual
   formulário, quais papéis têm acesso. Me diz se existe uma lista de
   produtos onde caberia um interruptor por linha, ou se só existe
   formulário.

3. **Se `products` já tem algum campo de ativo, visível ou publicado.**
   Pode ser que exista algo parecido com outro nome e eu esteja mandando
   criar um campo repetido.

4. **Como o app do garçom recarrega o cardápio hoje.** Quero saber quanto
   tempo um produto marcado como esgotado levaria para sumir da tela do
   garçom.

5. **Se o cardápio público usa o mesmo cálculo.** Se usar, marcar esgotado
   também tira o produto de lá, e isso é efeito desejado — mas eu quero
   saber antes, não depois.

Me manda isso e espera.

---

## O que a correção precisa fazer

Destino, não passo a passo.

### A regra

Um campo novo em `products`, com o sentido de **"está pausado"**, mais a
data em que foi pausado.

A regra que governa tudo:

> **Pausar só consegue tornar um produto indisponível, nunca disponível.**

Se o estoque de insumo já zerou, pausar ou despausar não muda nada. O
`available` final é a conjunção: disponível pelo estoque **e** não pausado.

Isso importa porque o caminho contrário seria um jeito de vender o que não
existe, e aí o sistema passa a mentir com a bênção de alguém.

### Quem pode marcar

ADMIN e CASHIER.

O garçom **não** pausa, nesta etapa. Ele é quem descobre primeiro que
acabou, e eu sei disso — mas um garçom pausando um produto tira ele de
todos os garçons e do cardápio público ao mesmo tempo. Isso é decisão de
quem responde pelo restaurante.

Abrir essa permissão depois é fácil; tirar, depois que a equipe se
acostumou, não é. E como o sistema vai para restaurantes com equipes
diferentes, o padrão tem que ser o mais restrito.

### Onde se marca

Na lista de produtos, com um interruptor na própria linha.

Não dentro do formulário de edição. "Acabou a marmita" acontece no meio do
almoço, com fila no caixa. Se custar abrir um formulário, rolar e salvar,
ninguém pausa — e um recurso que ninguém usa é igual a não ter.

A lista mostra, para cada produto pausado, **desde quando** está assim.
Quem abre o sistema de manhã precisa bater o olho e ver "pausado desde
ontem" para decidir se é para voltar.

### O que NÃO fazer

**Não despausa sozinho.** Nem à meia-noite, nem quando entrar estoque do
produto. É tentador, porque quase sempre é coisa do dia — mas despausar
sozinho significa que, numa terça de manhã, um produto que ainda não voltou
reaparece disponível sem ninguém ter decidido isso. O sistema volta a
mentir, agora por conta própria.

Quem pausou sabe por quê; só quem sabe por quê pode dizer que acabou. Fica
manual, e visível: se acumular produto pausado há dias, a lista mostra a
data e alguém corrige.

### Duas camadas

A regra aqui é de leitura, não de escrita: não tem como gravar um estado
inválido, então não precisa de gatilho no banco. **Me confirma esse
raciocínio no levantamento** — se você vir um jeito de o dado ficar
inconsistente, eu quero saber.

A migration com o campo novo vai versionada em
`backend/supabase/migrations/` e **eu aplico à mão.**

### O garçom tem que ver rápido

De nada adianta marcar às 14h e o garçom só ver às 16h.

A tela de cardápio do garçom passa a recarregar **ao ser aberta**, não só
quando o app volta ao primeiro plano. O garçom abre o cardápio justamente
no momento em que precisa da resposta certa.

Se você achar que isso não basta, me fala no levantamento — mas não cria
canal de tempo real novo sem a gente decidir junto.

---

## Regras de sempre

- Branch própria, commits em inglês no padrão Conventional Commits.
- **Você não abre PR e não faz merge.** Eu abro e eu mergeio.
- Migration versionada; **eu aplico à mão** no Supabase.
- Nada de `.env`, nada de reescrever histórico.

---

## O roteiro de teste que eu vou rodar

- pausar um produto pela lista
- o produto aparece apagado, com "Esgotado", no cardápio do garçom
- o mesmo produto não pode ser lançado na tela de pedido
- despausar devolve o produto
- um produto que já estava indisponível por estoque continua indisponível
  depois de despausar
- entrada de estoque num produto pausado **não** o despausa
- a lista mostra desde quando cada um está pausado
- o garçom não consegue pausar
- o cardápio público reflete o que a gente decidir no levantamento
