import { Database } from '../types/database';
import { Order, OrderSource, OrderStatus, OrderType, DeliveryType } from '../types/domain';

type OrderRow = Database['public']['Tables']['orders']['Row'] & { source?: string };
type OrderInsert = Database['public']['Tables']['orders']['Insert'] & { source: string };
type OrderUpdate = Database['public']['Tables']['orders']['Update'];

export function toOrderDomain(row: OrderRow): Order {
  return {
    id: row.id,
    type: row.type as OrderType,
    source: (row.source ?? 'PDV') as OrderSource,
    status: row.status as OrderStatus,
    total: row.total,
    deliveryFee: row.delivery_fee,
    customerName: row.customer_name,
    customerId: row.customer_id,
    tableId: row.table_id,
    userId: row.user_id,
    waiterId: row.waiter_id,
    cashRegisterSessionId: row.cash_register_session_id,
    deliveryType: row.delivery_type as DeliveryType | null,
    deliveryStreet: row.delivery_street,
    deliveryNumber: row.delivery_number,
    deliveryNeighborhood: row.delivery_neighborhood,
    deliveryReference: row.delivery_reference,
    deliveryPhone: row.delivery_phone,
    deliveryNotes: row.delivery_notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function toOrderInsert(domain: Order): OrderInsert {
  return {
    id: domain.id,
    type: domain.type,
    source: domain.source,
    status: domain.status,
    total: domain.total,
    delivery_fee: domain.deliveryFee,
    customer_name: domain.customerName,
    customer_id: domain.customerId,
    table_id: domain.tableId,
    user_id: domain.userId,
    waiter_id: domain.waiterId,
    cash_register_session_id: domain.cashRegisterSessionId,
    delivery_type: domain.deliveryType,
    delivery_street: domain.deliveryStreet,
    delivery_number: domain.deliveryNumber,
    delivery_neighborhood: domain.deliveryNeighborhood,
    delivery_reference: domain.deliveryReference,
    delivery_phone: domain.deliveryPhone,
    delivery_notes: domain.deliveryNotes,
  };
}

export function toOrderUpdate(patch: Partial<Order>): OrderUpdate {
  const update: OrderUpdate = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.total !== undefined) update.total = patch.total;
  if (patch.deliveryFee !== undefined) update.delivery_fee = patch.deliveryFee;
  if (patch.customerName !== undefined) update.customer_name = patch.customerName;
  if (patch.customerId !== undefined) update.customer_id = patch.customerId;
  if (patch.tableId !== undefined) update.table_id = patch.tableId;
  if (patch.waiterId !== undefined) update.waiter_id = patch.waiterId;
  if (patch.cashRegisterSessionId !== undefined) update.cash_register_session_id = patch.cashRegisterSessionId;
  if (patch.deliveryType !== undefined) update.delivery_type = patch.deliveryType;
  if (patch.deliveryStreet !== undefined) update.delivery_street = patch.deliveryStreet;
  if (patch.deliveryNumber !== undefined) update.delivery_number = patch.deliveryNumber;
  if (patch.deliveryNeighborhood !== undefined) update.delivery_neighborhood = patch.deliveryNeighborhood;
  if (patch.deliveryReference !== undefined) update.delivery_reference = patch.deliveryReference;
  if (patch.deliveryPhone !== undefined) update.delivery_phone = patch.deliveryPhone;
  if (patch.deliveryNotes !== undefined) update.delivery_notes = patch.deliveryNotes;
  return update;
}