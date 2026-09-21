import { Database } from '../types/database';
import { OrderItem, SaleType } from '../types/domain';

type OrderItemRow = Database['public']['Tables']['order_items']['Row'];
type OrderItemInsert = Database['public']['Tables']['order_items']['Insert'];
type OrderItemUpdate = Database['public']['Tables']['order_items']['Update'];

export function toOrderItemDomain(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    weight: row.weight,
    price: row.price,
    unitPrice: row.unit_price,
    manualPrice: row.manual_price,
    saleType: row.sale_type as SaleType | null,
    notes: row.notes,
  };
}

export function toOrderItemInsert(domain: OrderItem): OrderItemInsert {
  return {
    id: domain.id,
    order_id: domain.orderId,
    product_id: domain.productId,
    product_name: domain.productName,
    quantity: domain.quantity,
    weight: domain.weight,
    price: domain.price,
    unit_price: domain.unitPrice,
    manual_price: domain.manualPrice,
    sale_type: domain.saleType,
    notes: domain.notes,
  };
}

export function toOrderItemUpdate(patch: Partial<OrderItem>): OrderItemUpdate {
  const update: OrderItemUpdate = {};
  if (patch.productName !== undefined) update.product_name = patch.productName;
  if (patch.quantity !== undefined) update.quantity = patch.quantity;
  if (patch.weight !== undefined) update.weight = patch.weight;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.unitPrice !== undefined) update.unit_price = patch.unitPrice;
  if (patch.manualPrice !== undefined) update.manual_price = patch.manualPrice;
  if (patch.saleType !== undefined) update.sale_type = patch.saleType;
  if (patch.notes !== undefined) update.notes = patch.notes;
  return update;
}