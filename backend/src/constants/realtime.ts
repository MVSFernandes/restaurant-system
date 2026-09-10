// Keep this protocol in sync with frontend/src/constants/realtime.ts.
export const REALTIME_CHANNELS = {
  menuViewers: 'menu-viewers',
  stockEvents: 'stock-events',
} as const;

export const STOCK_EVENTS = {
  updated: 'stock_updated',
  low: 'stock_low',
} as const;
