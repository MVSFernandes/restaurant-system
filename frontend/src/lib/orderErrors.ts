export function orderErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { message?: unknown; error?: { message?: unknown } } } })?.response?.data;
  const message = data?.message ?? data?.error?.message;
  if (typeof message !== 'string') return 'Não foi possível confirmar o pedido. Verifique a conexão e tente novamente.';
  return message.replace(/^Insufficient stock of /i, 'Estoque insuficiente de ').replace(/ for product /i, ' para o produto ');
}
