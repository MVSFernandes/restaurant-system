# Etapa — O PDV precisa saber o que é comanda

## O problema

O PR #34 colocou a comanda entre a mesa e o pedido. O banco aprendeu a
regra, o app do garçom aprendeu a mostrar, e o **PDV não aprendeu nada.**

Hoje o modal de Novo Pedido do PDV, no tipo Mesa, pede:

- um seletor "Selecione a mesa"
- um campo de texto livre "Nome da pessoa na mesa"

Ele manda o pedido **sem `table_tab_id`**. Quem salva a jogada é o gatilho
`validate_order_table_tab`, que no `BEFORE INSERT` cria ou reaproveita uma
comanda chamada "Não registrado" naquela mesa.

Esse gatilho foi escrito como **remendo de migração**: ele existe para que
pedidos antigos e chamadas antigas não quebrassem no dia em que a comanda
passou a ser obrigatória. Ele não é regra de negócio.

Enquanto o PDV não for corrigido:

- **nenhuma tela do sistema abre uma segunda comanda numa mesa.** A regra
  central do salão — várias contas na mesma mesa — está no banco e não tem
  porta de entrada.
- todo pedido de mesa lançado pelo caixa cai numa comanda chamada "Não
  registrado", que não é de ninguém. O nome que o caixa digita se perde.
- o fechamento por comanda, que o banco já sabe fazer, não tem como ser
  usado: tudo está numa comanda só.

Isso não pode entrar em produção na Mesa Farta assim.

---

## Antes de implementar: levantamento

**Não escreva código ainda.** Minha última especificação para o app do
garçom estava errada porque eu descrevi a tela sem conferir o que a API
devolvia. Não quero repetir.

Levanta e me reporta:

1. **O caminho do pedido de mesa no PDV, de ponta a ponta.** Qual
   componente monta o modal, qual serviço do backend recebe, o que ele
   grava em `orders`. Me diz o nome dos arquivos e o formato do corpo da
   requisição que sai hoje.

2. **O que acontece hoje com "Nome da pessoa na mesa".** Ele vira
   `customer_name` no pedido? Vira outra coisa? Some? Quero saber se o
   nome que o caixa digita chega em algum lugar.

3. **Se já existe endpoint para listar as comandas abertas de uma mesa que
   o caixa possa chamar.** O app do garçom usa
   `GET /tables/:tableId/tabs`. O caixa tem permissão nele? Se não, o que
   barra.

4. **Como o PDV abre mesa hoje.** Existe um caminho de "ocupar mesa" que
   não passa pelo pedido? Se existe, ele usa `open_table_tab` ou o caminho
   antigo?

5. **Os outros tipos de pedido.** Delivery e balcão não têm mesa nem
   comanda. Confirma que o caminho deles não passa por nada disso, para a
   mudança não respingar.

6. **Onde mais no sistema um pedido de mesa é criado**, fora desse modal.
   Se existe um segundo caminho, ele tem o mesmo buraco.

Me manda isso e espera. Eu decido o desenho em cima do que você achar.

---

## O que a correção precisa fazer

Isto é o destino, não o passo a passo. O passo a passo eu escrevo depois do
levantamento.

**No modal, tipo Mesa:** escolhida a mesa, o caixa escolhe uma comanda. Ou
uma das que já estão abertas naquela mesa, ou uma nova, dando o nome. O
pedido sai com `table_tab_id`.

**Mesa livre:** a primeira comanda tem que usar `open_table_tab`, o RPC que
o PR #34 criou. Ele trava a linha da mesa, confere se o caixa está aberto,
recusa nome repetido e ocupa a mesa na mesma transação. Não reescreva essa
lógica no serviço: ela já existe no banco, e é o banco que garante que duas
pessoas abrindo a mesma mesa ao mesmo tempo não produzam duas mesas
ocupadas.

**O nome vai para a comanda, não para o pedido.** É a comanda que tem dono.
Se o pedido hoje guarda um nome próprio para mesa, me diz no levantamento
que eu decido se ele sai ou fica.

**O gatilho de compatibilidade fica onde está.** Depois dessa correção ele
vira o que deveria ter sido desde o começo: um caminho que nunca é
percorrido. Não remova, não altere.

---

## Regras que continuam valendo

- Branch própria, commits em inglês no padrão Conventional Commits.
- **Você não abre PR e não faz merge.** Eu abro e eu mergeio.
- Migration, se precisar, vai versionada em `backend/supabase/migrations/`
  e **eu aplico à mão** no Supabase. Você não aplica.
- Regra crítica em duas camadas: validação no serviço **e** no banco.
- Nada de `.env`, nada de reescrever histórico.

---

## O que eu não quero nesta etapa

- Tela de gerenciar comanda no PDV (renomear, transferir, juntar). Depois.
- Fechar ou receber comanda pelo PDV. Isso já existe e não é esta etapa.
- Mexer no app do garçom. Ele está em outra frente.
- Arrumar as comandas "Não registrado" que já existem no banco. Elas ficam
  como estão; são histórico.
