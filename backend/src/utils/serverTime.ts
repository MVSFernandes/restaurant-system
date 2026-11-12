import type { Response } from 'express';

/**
 * Horário do servidor no momento da resposta, em ISO 8601 com milissegundos.
 *
 * Vai num cabeçalho, não no corpo, para o formato de GET /orders continuar o
 * mesmo. A tela de Pedidos compara promisedAt com este horário (e não com o
 * relógio do computador do caixa) para dizer se um pedido está atrasado.
 *
 * Precisa estar em exposedHeaders do CORS (app.ts): no desenvolvimento a API
 * fica em outra origem e o navegador esconde cabeçalhos não listados.
 */
export const SERVER_TIME_HEADER = 'X-Server-Time';

export const setServerTimeHeader = (res: Response) => {
  res.setHeader(SERVER_TIME_HEADER, new Date().toISOString());
};
