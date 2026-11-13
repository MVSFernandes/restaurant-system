/**
 * Código curto do pedido, no mesmo formato que o PDV mostra nos cartões, no
 * histórico e no cupom: os 6 últimos caracteres do id, em maiúsculas
 * (`order.id.slice(-6).toUpperCase()`). Sem id utilizável, devolve null e a
 * tela mostra a confirmação sem código.
 */
export const orderShortCode = (id: unknown): string | null =>
  typeof id === 'string' && id.trim() ? id.slice(-6).toUpperCase() : null;
