import type { OrderStatus, OrderType } from '../types';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Novo',
  IN_PROGRESS: 'Em Preparo',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  FINISHED: 'Finalizado',
  CANCELED: 'Cancelado',
};

export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  NEW: 'badge-blue',
  IN_PROGRESS: 'badge-yellow',
  READY: 'badge-teal',
  DELIVERED: 'badge-green',
  FINISHED: 'badge-gray',
  CANCELED: 'badge-red',
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  DINE_IN: 'Mesa',
  TAKE_AWAY: 'Retirada',
  DELIVERY: 'Entrega',
};

type OrderTypeLabelInput = {
  type: OrderType | string;
  tableNumber?: number | null;
  table?: { number?: number | null } | null;
  customerName?: string | null;
};

export const getOrderStatusLabel = (status: OrderStatus | string) =>
  ORDER_STATUS_LABELS[status as OrderStatus] ?? status;

export const getOrderStatusBadgeClass = (status: OrderStatus | string) =>
  ORDER_STATUS_BADGE_CLASSES[status as OrderStatus] ?? 'badge-gray';

export const getOrderTypeLabel = (order: OrderTypeLabelInput) => {
  if (order.type === 'DINE_IN') {
    const tableNumber = order.tableNumber ?? order.table?.number;
    return tableNumber ? `Mesa ${tableNumber}` : 'Mesa';
  }

  if (order.type === 'TAKE_AWAY') return ORDER_TYPE_LABELS.TAKE_AWAY;
  if (order.type === 'DELIVERY') return ORDER_TYPE_LABELS.DELIVERY;

  return order.type;
};
