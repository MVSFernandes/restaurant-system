export const REALTIME_CHANNELS = {
  menuViewers: 'menu-viewers',
  stockEvents: 'stock-events',
  orderEvents: 'order-events',
} as const;

export const STOCK_EVENTS = {
  updated: 'stock_updated',
  low: 'stock_low',
} as const;

export const ORDER_EVENTS = {
  created: 'order_created',
  updated: 'order_updated',
  canceled: 'order_canceled',
} as const;
