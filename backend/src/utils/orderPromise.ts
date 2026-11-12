import { OrderType } from '../types/domain';
import { ValidationError } from '../types/errors';

/**
 * Prazo prometido por tipo de pedido (primeiro lote).
 *
 * O restaurante configura, opcionalmente, quantos minutos promete para cada
 * tipo de pedido. null = tipo sem prazo (padrão de todos). Quem grava
 * orders.promised_at é o banco, na inserção do pedido
 * (create_order_with_stock, migration 20261112120000), com o relógio do
 * servidor e os minutos vigentes naquele momento.
 */
export const ORDER_TYPES = ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'] as const satisfies readonly OrderType[];

export type OrderPromiseMinutes = Record<OrderType, number | null>;

/** Limite da coluna integer do Postgres. */
const MAX_PROMISE_MINUTES = 2_147_483_647;

const FIELD = 'orderPromiseMinutes';

export const EMPTY_ORDER_PROMISE_MINUTES: OrderPromiseMinutes = Object.freeze({
  DINE_IN: null,
  TAKE_AWAY: null,
  DELIVERY: null,
}) as OrderPromiseMinutes;

/**
 * Valida o campo orderPromiseMinutes do PUT /config.
 *
 * - undefined: campo omitido, a configuração salva fica como está.
 * - null: limpa todos os tipos.
 * - objeto: só as chaves enviadas mudam; cada valor é null (limpa o tipo) ou
 *   um inteiro positivo. Chave que não é tipo de pedido é recusada.
 */
export function validatedOrderPromiseMinutes(
  value: unknown
): Partial<OrderPromiseMinutes> | undefined {
  if (value === undefined) return undefined;
  if (value === null) return { ...EMPTY_ORDER_PROMISE_MINUTES };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(FIELD, 'Informe os minutos por tipo de pedido');
  }

  const result: Partial<OrderPromiseMinutes> = {};
  for (const [key, minutes] of Object.entries(value as Record<string, unknown>)) {
    if (!(ORDER_TYPES as readonly string[]).includes(key)) {
      throw new ValidationError(`${FIELD}.${key}`, 'Tipo de pedido desconhecido');
    }
    if (minutes === null) {
      result[key as OrderType] = null;
      continue;
    }
    if (
      typeof minutes !== 'number' ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > MAX_PROMISE_MINUTES
    ) {
      throw new ValidationError(
        `${FIELD}.${key}`,
        'Informe os minutos como número inteiro maior que zero, ou deixe sem prazo'
      );
    }
    result[key as OrderType] = minutes;
  }
  return result;
}
