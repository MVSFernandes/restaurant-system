# Etapa — O fiado tem que dizer o que faz

Duas correções na tela de Fiado. As duas são de honestidade da interface,
não de regra: o comportamento do sistema está certo e vai continuar como
está.

---

## 1. O botão de pagamento está no lugar errado

Hoje, dentro do card de cada pedido em aberto, existe um botão "Registrar
pagamento", e ele já abre o modal com o valor **daquele pedido**
preenchido.

Mas o sistema não abate aquele pedido. A `pay_customer_credit` distribui o
valor entre as **dívidas mais antigas primeiro**. Então o caixa clica no
pedido de hoje, de R$ 4,25, e o valor vai abater uma conta de três semanas
atrás.

O modal até mostra a verdade — "Saldo em aberto R$ 22,50", que é a dívida
inteira, não a do pedido. Mas aí já é tarde: a pessoa clicou achando que
estava pagando aquele pedido.

**O comportamento fica.** Abater da mais antiga é a convenção certa para
fiado de restaurante: é um saldo que corre, não contas separadas.

**A tela é que muda:**

- **Tira o "Registrar pagamento" de dentro do card de cada pedido.** Já
  existe um, no rodapé da lista, que pertence ao cliente — é esse que vale.
- Os outros botões do card continuam: "Cobrar no WhatsApp" e "Emitir NF-e"
  são por pedido mesmo, e fazem sentido ali.
- **No modal, abaixo do campo de valor**, uma linha em 13px / 18px,
  `text-muted`: "O valor abate as dívidas mais antigas primeiro."

Uma frase. Sem caixa de aviso, sem ícone — é informação de rodapé, não
alerta.

---

## 2. Nada confirma que deu certo

Lançar fiado e registrar pagamento não avisam nada. O valor muda na tela e
pronto.

Em dinheiro isso é pior do que parecer desleixo: o caixa clica, não vê
resposta, acha que não pegou, e clica de novo. Dívida lançada em dobro no
nome do cliente.

**Toast de sucesso nas duas ações**, com o valor dentro:

- lançar fiado: "Fiado de R$ 70,00 lançado"
- registrar pagamento: "Pagamento de R$ 4,25 registrado"

E **o botão fica desabilitado enquanto a requisição está em curso**, com o
texto mudando para "Lançando…" e "Registrando…". É isso que impede o
clique duplo de virar dívida duplicada, mais do que o aviso.

**Falha:** a mensagem do servidor aparece, o valor digitado **não se
perde**, e o botão volta ao normal. Mesma regra da tela de lançar pedido do
garçom.

---

## Confere antes de mexer

Olha se existe mais alguma ação de dinheiro nessa tela ou nas vizinhas que
acontece em silêncio — emitir nota, cancelar, estornar. Se achar, me fala
em vez de corrigir junto: eu quero decidir o alcance antes.

---

## Validação

- lançar fiado mostra o aviso e o valor sobe na tela
- clicar duas vezes rápido no botão lança **uma** dívida só
- registrar pagamento mostra o aviso e a dívida desce
- o modal explica de onde o valor é abatido
- nenhum card de pedido tem mais o botão de pagamento
- "Cobrar no WhatsApp" e "Emitir NF-e" continuam onde estão
- falha de rede mantém o valor digitado

Me mostra a captura da tela de um cliente com dívida, e do modal aberto.
