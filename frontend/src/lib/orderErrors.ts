export const PUBLIC_CHECKOUT_CLOSED_MESSAGE =
  'No momento, o restaurante não está aceitando pedidos. Tente novamente mais tarde.';

/**
 * Erro do checkout do cardápio público. O caixa fechado é reconhecido pelo
 * código da resposta (CASH_REGISTER_CLOSED), não pelo texto; falha de rede e
 * as demais recusas seguem a mensagem comum de pedido.
 */
export function publicCheckoutErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { code?: unknown; error?: { code?: unknown } } } })?.response?.data;
  const code = data?.code ?? data?.error?.code;
  if (code === 'CASH_REGISTER_CLOSED') return PUBLIC_CHECKOUT_CLOSED_MESSAGE;
  return orderErrorMessage(error);
}

export function orderErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { message?: unknown; error?: { message?: unknown } } } })?.response?.data;
  const message = data?.message ?? data?.error?.message;
  if (typeof message !== 'string') return 'Não foi possível confirmar o pedido. Verifique a conexão e tente novamente.';
  return message.replace(/^Insufficient stock of /i, 'Estoque insuficiente de ').replace(/ for product /i, ' para o produto ');
}
