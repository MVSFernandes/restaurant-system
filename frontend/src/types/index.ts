// --- Tipos de Usuário ---
export type Role = 'ADMIN' | 'CASHIER' | 'WAITER' | 'FINANCE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
  updatedAt?: string;
}

// --- Tipos de Produto e Categoria ---
export interface Category {
  id: string;
  name: string;
  isMealCategory?: boolean;
  pricePerKg?: number | null;
  selfServicePricePerKg?: number | null;
  products?: Product[];
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  isByWeight: boolean;
  imageUrl?: string;
  categoryId: string;
  category?: Category;
  stockItems?: ProductStockLink[];
  available?: boolean;
  ncm?: string | null;
  cfop?: string | null;
  origin?: string | null;
  taxCode?: string | null;
}

export interface ProductStockLink {
  id: string;
  productId: string;
  stockItemId: string;
  quantity: number;
  stockItem?: StockItem;
}

// --- Tipos de Mesa e Pedido ---
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'CLOSED';
export type OrderType = 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY';
export type OrderStatus = 'NEW' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELED' | 'FINISHED';
export type PaymentMethod = 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'CREDIT' | 'ON_DELIVERY' | 'ON_PICKUP';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface Table {
  id: string;
  number: number;
  status: TableStatus;
  orders?: Order[];
}

export type OrderItemSaleType = 'UNIT' | 'WEIGHT' | 'SELF_SERVICE';

export interface OrderItem {
  id: string;
  quantity: number;
  weight?: number;
  price: number;
  unitPrice?: number;
  saleType?: OrderItemSaleType;
  notes?: string;
  productId: string;
  product?: Product;
  orderId: string;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  transactionId?: string;
  orderId: string;
}

export interface Order {
  id: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  createdAt: string;
  updatedAt: string;

  tableId?: string;
  table?: Table;

  userId: string;
  user?: User;

  waiterId?: string;
  waiter?: User;

  customerId?: string;
  customer?: Customer;

  customerName?: string;

  items: OrderItem[];
  payment?: Payment;

  deliveryStreet?: string;
  deliveryNumber?: string;
  deliveryNeighborhood?: string;
  deliveryReference?: string;
  deliveryPhone?: string;
  deliveryNotes?: string;
  deliveryFee?: number;
  deliveryType?: 'URBAN' | 'RURAL' | string;
}

// --- Tipos de Cliente e Fiado ---
export interface CreditTransaction {
  id: string;
  type: 'CHARGE' | 'PAYMENT' | string;
  amount: number;
  description?: string;
  orderId?: string | null;
  status?: 'OPEN' | 'PARTIAL' | 'PAID';
  settledAmount?: number;
  settledAt?: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  customerId?: string | null;
  orderId?: string | null;
  creditTransactionId?: string | null;
  model: '55' | '65';
  consumerDocument?: string | null;
  focusRef: string;
  environment: 'homologation' | 'production';
  status: 'pending' | 'processing' | 'authorized' | 'error' | 'canceled';
  sefazStatus?: string | null;
  sefazMessage?: string | null;
  accessKey?: string | null;
  number?: string | null;
  series?: string | null;
  danfeUrl?: string | null;
  xmlUrl?: string | null;
  qrcodeUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditEntryItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  notes?: string | null;
}

export interface CreditEntry {
  id: string;
  orderId?: string | null;
  desc: string;
  date: string;
  amount: number;
  settledAmount: number;
  openAmount: number;
  status: 'OPEN' | 'PARTIAL' | 'PAID';
  settledAt?: string | null;
  items: CreditEntryItem[];
  invoice?: Invoice | null;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  creditLimit: number;
  creditUsed: number;
  openTotal?: number;
  personType?: 'PF' | 'PJ';
  document?: string | null;
  legalName?: string | null;
  stateRegistration?: string | null;
  fiscalZipCode?: string | null;
  fiscalStreet?: string | null;
  fiscalNumber?: string | null;
  fiscalNeighborhood?: string | null;
  fiscalCity?: string | null;
  fiscalCityIbgeCode?: string | null;
  fiscalState?: string | null;
  openRows?: CreditEntry[];
  paidRows?: CreditEntry[];
  creditTxs?: CreditTransaction[];
  createdAt: string;
  updatedAt: string;
}

// --- Tipos de Estoque ---
export interface StockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
}

// --- Tipos de Financeiro ---
export interface PayableAccount {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt?: string;
  supplierId?: string;
  supplier?: Supplier;
}

// --- Tipos de Configuração ---
export interface RestaurantConfig {
  id: string;
  name: string;
  logoUrl?: string;
  bannerUrl?: string;
  address?: string;
  phone?: string;
  openingHours?: string;
  openingDays?: string;
  deliveryFee?: number;
  urbanDeliveryFee?: number;
  ruralDeliveryFee?: number;
  enabledPayments?: string;
  cnpj?: string | null;
  legalName?: string | null;
  stateRegistration?: string | null;
  taxRegime?: string | null;
  fiscalCityIbgeCode?: string | null;
  fiscalZipCode?: string | null;
  fiscalStreet?: string | null;
  fiscalNumber?: string | null;
  fiscalNeighborhood?: string | null;
  fiscalCity?: string | null;
  fiscalState?: string | null;
  defaultCfop?: string | null;
  defaultNcm?: string | null;
  defaultOrigin?: string | null;
  defaultTaxCode?: string | null;
  nfceEnabled?: boolean;
  nfceGroupItems?: boolean;
  nfceGroupedItemDescription?: string;
}

export type MarmitaGroup = 'GUARNICAO' | 'CARNE' | 'EXTRA';

export interface MarmitaMenuItem {
  id: string;
  dayOfWeek: number;
  name: string;
  group: MarmitaGroup;
  price: number;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CashWithdrawal {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  createdBy?: User;
}

export interface CashRegisterSession {
  id: string;
  status: string;
  openingAmount: number;
  closingAmount?: number | null;
  withdrawalTotal?: number;
  notes?: string;
  openedAt: string;
  closedAt?: string | null;
  openedBy?: User;
  closedBy?: User;
  withdrawals?: CashWithdrawal[];
  
  // --- Campos calculados/enriquecidos pelo backend ---
  totalEntries?: number;
  totalWithdrawals?: number;
  expectedBalance?: number;
  pixTotal?: number;
  creditTotal?: number;
  debitTotal?: number;
}
