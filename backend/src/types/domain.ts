/**
 * Tipos do DOMÍNIO interno da aplicação.
 *
 * Convenção:
 *   - camelCase (idiomático em TypeScript)
 *   - timestamps como Date (não string)
 *   - status/role como union types literais
 *
 * Fronteiras:
 *   - Banco (Database.Tables.X.Row, snake_case)  ←→  mapper  ←→  Domínio (camelCase)
 *   - Domínio (camelCase)                          ←→  controller  ←→  HTTP/JSON (camelCase)
 *
 * Importante:
 *   - Domain != DTO. DTOs ficam em src/dtos/ (vamos criar na Onda 6).
 *   - Domain é o "modelo de negócio" puro, sem amarras de transporte HTTP.
 */

// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

export type UserRole = 'ADMIN' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'DELIVERY';

export type OrderStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'READY'
  | 'DELIVERED'
  | 'FINISHED'
  | 'CANCELED';

export type OrderType = 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY';

export type PaymentMethod =
  | 'CASH'
  | 'PIX'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'CREDIT';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export type CreditTransactionType = 'CHARGE' | 'PAYMENT';

export type CreditTransactionStatus = 'OPEN' | 'PARTIAL' | 'PAID';

export type PersonType = 'PF' | 'PJ';

export type InvoiceEnvironment = 'homologation' | 'production';

export type InvoiceStatus = 'pending' | 'processing' | 'authorized' | 'error' | 'canceled';

export type InvoiceModel = '55' | '65';

export type CashSessionStatus = 'OPEN' | 'CLOSED';

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';

export type DeliveryType = 'URBAN' | 'RURAL';

export type SaleType = 'UNIT' | 'WEIGHT';

// ============================================================================
// USERS
// ============================================================================

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CUSTOMERS (clientes do delivery / fiado)
// ============================================================================

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: number;
  creditUsed: number;
  personType: PersonType;
  document: string | null;
  legalName: string | null;
  stateRegistration: string | null;
  fiscalZipCode: string | null;
  fiscalStreet: string | null;
  fiscalNumber: string | null;
  fiscalNeighborhood: string | null;
  fiscalCity: string | null;
  fiscalCityIbgeCode: string | null;
  fiscalState: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CREDIT TRANSACTIONS (lançamentos de fiado)
// ============================================================================

export interface CreditTransaction {
  id: string;
  customerId: string;
  type: CreditTransactionType;
  amount: number;
  description: string | null;
  orderId: string | null;
  status: CreditTransactionStatus;
  settledAmount: number;
  settledAt: Date | null;
  createdAt: Date;
}

export interface CreditSettlement {
  id: string;
  chargeId: string;
  paymentId: string;
  amount: number;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  customerId: string | null;
  orderId: string | null;
  creditTransactionId: string | null;
  model: InvoiceModel;
  consumerDocument: string | null;
  focusRef: string;
  environment: InvoiceEnvironment;
  status: InvoiceStatus;
  sefazStatus: string | null;
  sefazMessage: string | null;
  accessKey: string | null;
  number: string | null;
  series: string | null;
  danfeUrl: string | null;
  xmlUrl: string | null;
  qrcodeUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CATEGORIES (categorias de produto)
// ============================================================================

export interface Category {
  id: string;
  name: string;
  isMealCategory: boolean;
  pricePerKg: number | null;
  selfServicePricePerKg: number | null;
}

// ============================================================================
// PRODUCTS
// ============================================================================

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isByWeight: boolean;
  categoryId: string;
  ncm: string | null;
  cfop: string | null;
  origin: string | null;
  taxCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// PRODUCT STOCK ITEMS (vínculos produto -> insumo)
// ============================================================================

export interface ProductStockItem {
  id: string;
  productId: string;
  stockItemId: string;
  quantity: number;
}

// ============================================================================
// STOCK ITEMS (insumos)
// ============================================================================

export interface StockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SUPPLIERS (fornecedores)
// ============================================================================

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierStockItem {
  id: string;
  supplierId: string;
  stockItemId: string;
  price: number;
  updatedAt: Date;  
}

// ============================================================================
// PAYABLE ACCOUNTS (contas a pagar)
// ============================================================================

export interface PayableAccount {
  id: string;
  description: string;
  amount: number;
  dueDate: Date;
  paid: boolean;
  paidAt: Date | null;
  supplierId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// TABLES (mesas do restaurante)
// ============================================================================

export interface Table {
  id: string;
  number: number;
  status: TableStatus;
}

// ============================================================================
// MARMITA MENU ITEMS (cardápio rotativo de marmita)
// ============================================================================

export interface MarmitaMenuItem {
  id: string;
  name: string;
  group: string;
  price: number;
  dayOfWeek: number; // 0 (domingo) - 6 (sábado)
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CASH REGISTER (caixa)
// ============================================================================

export interface CashRegisterSession {
  id: string;
  status: CashSessionStatus;
  openingAmount: number;
  closingAmount: number | null;
  withdrawalTotal: number;
  notes: string | null;
  openedById: string;
  closedById: string | null;
  openedAt: Date;
  closedAt: Date | null;
}

export interface CashWithdrawal {
  id: string;
  sessionId: string;
  amount: number;
  reason: string;
  createdById: string;
  createdAt: Date;
}

// ============================================================================
// ORDERS (pedidos)
// ============================================================================

export interface Order {
  id: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  deliveryFee: number;
  customerName: string | null;
  customerId: string | null;
  tableId: string | null;
  userId: string;
  waiterId: string | null;
  cashRegisterSessionId: string | null;
  // Delivery
  deliveryType: DeliveryType | null;
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryNeighborhood: string | null;
  deliveryReference: string | null;
  deliveryPhone: string | null;
  deliveryNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  weight: number | null;
  price: number;
  unitPrice: number | null;
  manualPrice: number | null;
  saleType: SaleType | null;
  notes: string | null;
}

// ============================================================================
// PAYMENTS (pagamentos)
// ============================================================================

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  transactionId: string | null;
  createdAt: Date;
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  details: string | null;
  createdAt: Date;
}

// ============================================================================
// RESTAURANT CONFIG (singleton)
// ============================================================================

export interface RestaurantConfig {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  openingHours: string | null;
  openingDays: string | null;
  deliveryFee: number | null;
  urbanDeliveryFee: number | null;
  ruralDeliveryFee: number | null;
  enabledPayments: string | null; // CSV: "CASH,PIX,..."
  cnpj: string | null;
  legalName: string | null;
  stateRegistration: string | null;
  taxRegime: string | null;
  fiscalCityIbgeCode: string | null;
  fiscalZipCode: string | null;
  fiscalStreet: string | null;
  fiscalNumber: string | null;
  fiscalNeighborhood: string | null;
  fiscalCity: string | null;
  fiscalState: string | null;
  defaultCfop: string | null;
  defaultNcm: string | null;
  defaultOrigin: string | null;
  defaultTaxCode: string | null;
  nfceEnabled: boolean;
  nfceGroupItems: boolean;
  nfceGroupedItemDescription: string;
  updatedAt: Date;
}
