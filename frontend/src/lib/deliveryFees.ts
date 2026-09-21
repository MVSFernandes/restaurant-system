export type DeliveryFeeType = 'URBAN' | 'RURAL' | 'CUSTOM' | 'NONE';

export function normalizeDeliveryFee(value: number | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function deliveryFeeForSelection(
  type: DeliveryFeeType,
  fees: { urbanDeliveryFee?: number | null; ruralDeliveryFee?: number | null },
  customFee: number | null
): number | null {
  if (type === 'NONE') return 0;
  if (type === 'CUSTOM') return customFee;
  return type === 'RURAL'
    ? normalizeDeliveryFee(fees.ruralDeliveryFee)
    : normalizeDeliveryFee(fees.urbanDeliveryFee);
}
