export const REALTIME_CHANNELS = {
  menuViewers: 'menu-viewers',
  stockEvents: 'stock-events',
  orderEvents: 'order-events',
  tableTabEvents: 'table-tab-events',
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


export const TABLE_TAB_EVENTS = {
  created: 'table_tab_created',
  updated: 'table_tab_updated',
  closed: 'table_tab_closed',
  tableUpdated: 'table_updated',
} as const;
