import type { OrderStatus } from '../types/domain';

export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'NEW',
  'IN_PROGRESS',
  'READY',
  'DELIVERED',
];