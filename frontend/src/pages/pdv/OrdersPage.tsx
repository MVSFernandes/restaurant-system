import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../services/api';
import type {
  Order,
  Product,
  Category,
  Table,
  User,
  MarmitaMenuItem,
  RestaurantConfig,
  CashRegisterSession,
  Customer,
} from '../../types';
import { clsx } from 'clsx';
import {
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle,
  ShoppingCart,
  FileText,
  Edit,
  Search,
  X,
  AlertTriangle,
  DollarSign,
  CreditCard,
  QrCode,
  Wallet,
  Loader2,
} from 'lucide-react';
import { EditOrderModal } from '../../components/modals/EditOrderModal';
import { MarmitaBuilderModal } from '../../components/modals/MarmitaBuilderModal';
import { ORDER_STATUS_BADGE_CLASSES, ORDER_STATUS_LABELS } from '../../constants/orders';
import { useAuth } from '../../hooks/useAuth';
import { NfceReceiptPanel } from '../../components/fiscal/NfceReceiptPanel';

const statusColors = ORDER_STATUS_BADGE_CLASSES;
const statusLabels = ORDER_STATUS_LABELS;

interface CartItem {
  product: Product;
  quantity: number;
  weight?: number;
  notes: string;
  saleType?: 'UNIT' | 'WEIGHT' | 'SELF_SERVICE';
  unitPrice?: number;
  manualPrice?: number | '';
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const getPayloadWeight = (item: Pick<CartItem, 'saleType' | 'weight'>) => {
  const weight = Number(item.weight);
  if (item.saleType === 'UNIT' || !Number.isFinite(weight) || weight <= 0) {
    return undefined;
  }
  return weight;
};

const createIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getCurrentWeekDay = () => {
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[day] ?? 1;
};

const parseNotesAndExtras = (originalNotes: string) => {
  const lines = (originalNotes || '').split('\n');
  const extras: { id: string; name: string; price: number }[] = [];
  const cleanLines: string[] = [];

  for (let line of lines) {
    const trimmedLine = line.trim();

    const newFormatMatch = trimmedLine.match(/^\[EXTRA\]\s*(.+?)\s*\|\s*([\d.,]+)$/i);
    if (newFormatMatch) {
      extras.push({
        id: Math.random().toString(36).substring(2, 10),
        name: newFormatMatch[1].trim(),
        price: parseFloat(newFormatMatch[2].replace(',', '.')),
      });
      continue;
    }

    const oldFormatMatch =
      trimmedLine.match(/^[-+]?\s*Extra:\s*(.+?)\s*\(?\s*R\$\s*([\d.,]+)\s*\)?$/i) ||
      trimmedLine.match(/^[-+]?\s*(.+?):\s*R\$\s*([\d.,]+)$/i);

    if (oldFormatMatch) {
      extras.push({
        id: Math.random().toString(36).substring(2, 10),
        name: oldFormatMatch[1].trim(),
        price: parseFloat(oldFormatMatch[2].replace(',', '.')),
      });
      continue;
    }

    if (!trimmedLine.toLowerCase().includes('extras manuais:') && trimmedLine !== '') {
      cleanLines.push(line);
    }
  }

  return { cleanNotes: cleanLines.join('\n').trim(), extras };
};

const OrdersPage: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [waiters, setWaiters] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [confirmDiscardNewOrder, setConfirmDiscardNewOrder] = useState(false);
  const [manualPriceEditors, setManualPriceEditors] = useState<Record<number, boolean>>({});
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [paymentSubmittingKey, setPaymentSubmittingKey] = useState<string | null>(null);
  const [newOrderIdempotencyKey, setNewOrderIdempotencyKey] = useState('');
  const [selectedWaiterId, setSelectedWaiterId] = useState('');
  const [orderType, setOrderType] = useState('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [searchCustomer, setSearchCustomer] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryType, setDeliveryType] = useState<'URBAN' | 'RURAL' | ''>('');
  const [config, setConfig] = useState<RestaurantConfig | null>(null);
  const [currentCash, setCurrentCash] = useState<CashRegisterSession | null>(null);

  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const [marmitaProduct, setMarmitaProduct] = useState<Product | null>(null);
  const [marmitaMenuItems, setMarmitaMenuItems] = useState<MarmitaMenuItem[]>([]);

  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyCnpj, setCompanyCnpj] = useState('');
  const [creditOrder, setCreditOrder] = useState<Order | null>(null);
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const orderSubmittingRef = useRef(false);
  const paymentSubmittingRef = useRef<string | null>(null);

  const canEditManualPrice = user?.role === 'ADMIN' || user?.role === 'CASHIER';
  const getPaymentSubmittingKey = (orderId: string, method: string) => `${orderId}:${method}`;

  const getCategoryForProduct = (product: Product) =>
    categories.find((cat) => cat.id === product.categoryId);

  const buildCartItem = (product: Product): CartItem => {
    const category = getCategoryForProduct(product);
    const isMealByWeight = !!(product.isByWeight && category?.isMealCategory);
    const saleType = isMealByWeight ? 'WEIGHT' : product.isByWeight ? 'WEIGHT' : 'UNIT';
    const unitPrice = isMealByWeight
      ? Number(category?.pricePerKg ?? product.price)
      : Number(product.price);

    return {
      product,
      quantity: 1,
      weight: product.isByWeight ? 0 : undefined,
      notes: '',
      saleType,
      unitPrice,
      manualPrice: '',
    };
  };

  const getItemUnitPrice = (item: CartItem) => {
    if (item.unitPrice !== undefined) return Number(item.unitPrice);

    const category = getCategoryForProduct(item.product);

    if (item.product.isByWeight && category?.isMealCategory) {
      return item.saleType === 'SELF_SERVICE'
        ? Number(category.selfServicePricePerKg ?? item.product.price)
        : Number(category.pricePerKg ?? item.product.price);
    }

    return Number(item.product.price);
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);

    if (!digits) return '';

    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.replace(/^(\d{2})(\d+)/, '$1.$2');
    if (digits.length <= 8) return digits.replace(/^(\d{2})(\d{3})(\d+)/, '$1.$2.$3');
    if (digits.length <= 12) {
      return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4');
    }

    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})$/,
      '$1.$2.$3/$4-$5'
    );
  };

  const getOnlyDigits = (value: string) => value.replace(/\D/g, '');

  const formatMoneyBR = (value: number | string | null | undefined) =>
    `R$ ${Number(value || 0).toFixed(2)}`;

  const escapeHtml = (value: string | null | undefined) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const normalizeText = (value: string | null | undefined) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

  const printHtmlContent = (html: string) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.style.overflow = 'hidden';

    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframeWindow?.document;

    if (!iframeWindow || !iframeDocument) {
      document.body.removeChild(iframe);
      showToast('error', 'Não foi possível abrir a impressão.');
      return;
    }

    iframeDocument.open();
    iframeDocument.write(html);
    iframeDocument.close();

    const tryPrint = () => {
      try {
        iframeWindow.focus();
        iframeWindow.print();
      } catch (error) {
        console.error('Erro ao imprimir:', error);
        showToast('error', 'Não foi possível abrir a impressão.');
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }
    };

    setTimeout(tryPrint, 400);
  };

  const buildCompanyReceiptHtml = (
    order: Order,
    companyNameValue: string,
    companyCnpjValue: string
  ) => {
    const storeName = escapeHtml(config?.name || 'Restaurante');
    const storePhone = escapeHtml((config as any)?.phone || '');
    const storeAddress = escapeHtml(
      [
        (config as any)?.street,
        (config as any)?.number,
        (config as any)?.neighborhood,
        (config as any)?.city,
        (config as any)?.state,
      ]
        .filter(Boolean)
        .join(' - ')
    );

    const orderCode = order.id.slice(-6).toUpperCase();
    const totalValue = formatMoneyBR(order.total);
    const companyNameEscaped = escapeHtml(companyNameValue);
    const companyCnpjEscaped = escapeHtml(companyCnpjValue);
    const createdAt = new Date(order.createdAt).toLocaleString('pt-BR');

    let calculatedSubtotal = 0;

    const itemsHtml = order.items
      .map((item) => {
        const { extras } = parseNotesAndExtras(item.notes || '');
        const isByWeight = !!item.product?.isByWeight;
        const weightInKg = Number(item.weight || 0) / 1000;
        const multiplier = isByWeight ? weightInKg : Number(item.quantity || 1);

        const extraTotalPerUnit = extras.reduce((sum, e) => sum + e.price, 0);
        const baseUnitPrice = Number(item.unitPrice ?? item.price ?? 0) - extraTotalPerUnit;

        let baseItemTotal = baseUnitPrice * multiplier;
        const manualPrice = (item as any).manualPrice;

        if (manualPrice !== undefined && manualPrice !== null) {
          baseItemTotal = Number(manualPrice);
        }

        calculatedSubtotal += baseItemTotal;

        const extrasHtml = extras
          .map((extra) => {
            const extraTotal =
              extra.price *
              (manualPrice !== null && manualPrice !== undefined
                ? isByWeight
                  ? 1
                  : Number(item.quantity || 1)
                : multiplier);
            calculatedSubtotal += extraTotal;
            return `
            <div class="item-row" style="margin-left: 12px; margin-top: 3px;">
              <div class="item-left">
                <div class="item-main" style="font-size: 11px; color: #444;">+ EXTRA: ${escapeHtml(
                  normalizeText(extra.name)
                )}</div>
              </div>
              <div class="item-price" style="font-size: 11px; color: #444;">${formatMoneyBR(
                extraTotal
              )}</div>
            </div>
          `;
          })
          .join('');

        return `
          <div class="item-block">
            <div class="item-row">
              <div class="item-left">
                <div class="item-main">
                  ${
                    isByWeight
                      ? `${
                          manualPrice !== null && manualPrice !== undefined
                            ? 'FIXO'
                            : weightInKg.toFixed(3) + 'KG'
                        }&nbsp;&nbsp;&nbsp;${escapeHtml(normalizeText(item.product?.name))}`
                      : `${Number(item.quantity || 0)}&nbsp;&nbsp;&nbsp;${escapeHtml(
                          normalizeText(item.product?.name)
                        )}`
                  }
                </div>
              </div>
              <div class="item-price">${formatMoneyBR(baseItemTotal)}</div>
            </div>
            ${extrasHtml}
          </div>
        `;
      })
      .join('');

    const deliveryFee = Number(order.deliveryFee || 0);

    return `
      <html>
        <head>
          <title>Recibo #${orderCode}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 2mm;
            }

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            html, body {
              margin: 0;
              padding: 0;
              width: 80mm;
              background: #fff;
            }

            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #000;
              font-size: 12px;
              line-height: 1.35;
              font-weight: 400;
            }

            .receipt {
              width: 72mm;
              margin: 0 auto;
              padding: 2mm 0;
            }

            .center {
              text-align: center;
            }

            .title {
              font-size: 20px;
              font-weight: 800;
              text-transform: uppercase;
              margin-bottom: 8px;
              letter-spacing: 0.4px;
            }

            .subtitle {
              font-size: 11px;
              margin-bottom: 10px;
            }

            .divider {
              border: 0;
              border-top: 1px dashed #000;
              margin: 10px 0;
            }

            .section {
              margin-bottom: 10px;
            }

            .section-title {
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              margin-bottom: 4px;
            }

            .line {
              margin-bottom: 2px;
              word-break: break-word;
              overflow-wrap: anywhere;
            }

            .strong {
              font-weight: 800;
            }

            .total-box {
              margin-top: 12px;
              text-align: center;
            }

            .total-label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              margin-bottom: 4px;
            }

            .total-value {
              font-size: 22px;
              font-weight: 800;
            }

            .order-ref {
              margin-top: 12px;
              text-align: center;
              font-size: 12px;
            }

            .signature {
              margin-top: 28px;
              text-align: center;
            }

            .signature-line {
              width: 48mm;
              margin: 0 auto 6px;
              border-top: 1px solid #000;
            }

            .footer {
              margin-top: 14px;
              text-align: center;
              font-size: 10px;
            }
            
            .table-head {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              margin-top: 4px;
              margin-bottom: 4px;
            }

            .item-block {
              margin-bottom: 6px;
            }

            .item-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 8px;
              margin-bottom: 2px;
            }

            .item-left {
              flex: 1;
              min-width: 0;
            }

            .item-main {
              font-size: 11px;
              font-weight: 400;
              word-break: break-word;
            }

            .item-price {
              min-width: 70px;
              text-align: right;
              font-size: 11px;
              font-weight: 400;
              white-space: nowrap;
            }
            
            .total-row {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              gap: 8px;
              margin-bottom: 2px;
            }

            .total-row .total-label {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
            }

            .total-row .total-value {
              font-size: 11px;
              font-weight: 800;
              white-space: nowrap;
              text-align: right;
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center title">RECIBO</div>
            <div class="center subtitle">Comprovante para empresa</div>

            <hr class="divider" />

            <div class="section">
              <div class="section-title">Emitente</div>
              <div class="line strong">${storeName}</div>
              ${storeAddress ? `<div class="line">${storeAddress}</div>` : ''}
              ${storePhone ? `<div class="line">Telefone: ${storePhone}</div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">Destinatário</div>
              <div class="line"><span class="strong">Empresa:</span> ${companyNameEscaped}</div>
              <div class="line"><span class="strong">CNPJ:</span> ${companyCnpjEscaped}</div>
            </div>

            <div class="section">
              <div class="section-title">Pedido</div>
              <div class="line"><span class="strong">Código:</span> #${orderCode}</div>
              <div class="line"><span class="strong">Data:</span> ${createdAt}</div>
            </div>

            <div class="section">
              <div class="section-title">ITENS ADQUIRIDOS</div>
              <div class="table-head">
                <span>QTD&nbsp;&nbsp;ITEM</span>
                <span>PRECO</span>
              </div>
              ${itemsHtml}
            </div>

            ${deliveryFee > 0 ? `
              <hr class="divider" />
              <div class="total-row" style="margin-top: 6px;">
                <span class="total-label">SubTotal</span>
                <span class="total-value">${formatMoneyBR(calculatedSubtotal)}</span>
              </div>
              <div class="total-row">
                <span class="total-label">Taxa de Entrega</span>
                <span class="total-value">${formatMoneyBR(deliveryFee)}</span>
              </div>
            ` : ''}

            <div class="total-box">
              <div class="total-label">Valor Total</div>
              <div class="total-value">${totalValue}</div>
            </div>

            <div class="order-ref">
              Referente ao pedido <span class="strong">#${orderCode}</span>
            </div>

            <div class="signature">
              <div class="signature-line"></div>
              <div>Assinatura do Responsável</div>
            </div>

            <div class="footer">
              Documento emitido pelo sistema
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintCompanyReceipt = async (
    order: Order,
    companyNameValue: string,
    companyCnpjValue: string
  ) => {
    try {
      const cleanCnpj = getOnlyDigits(companyCnpjValue);

      if (!companyNameValue.trim()) {
        showToast('error', 'Informe o nome da empresa.');
        return;
      }

      if (cleanCnpj.length !== 14) {
        showToast('error', 'Informe um CNPJ válido com 14 números.');
        return;
      }

      const receiptHtml = buildCompanyReceiptHtml(
        order,
        companyNameValue.trim(),
        formatCnpj(cleanCnpj)
      );

      printHtmlContent(receiptHtml);
    } catch (error) {
      console.error('Erro ao imprimir recibo da empresa:', error);
      showToast('error', 'Não foi possível gerar o recibo da empresa.');
    }
  };

  const fetchData = async () => {
    try {
      const [
        ordersRes,
        categoriesRes,
        tablesRes,
        usersRes,
        customersRes,
        marmitaMenuRes,
        configRes,
        cashRes,
      ] = await Promise.all([
        api.get('/orders?status=NEW,IN_PROGRESS,READY,DELIVERED,FINISHED,CANCELED'),
        api.get('/categories?includeProducts=true'),
        api.get('/tables'),
        api.get('/auth/me').then(() => api.get('/users')).catch(() => ({ data: [] })),
        api.get('/customers').catch(() => ({ data: [] })),
        api.get(`/marmita-menu/day/${getCurrentWeekDay()}`).catch(() => ({ data: [] })),
        api.get('/config').catch(() => ({ data: null })),
        api.get('/cash-register/current').catch(() => ({ data: null })),
      ]);

      setOrders(ordersRes.data);
      setCategories(categoriesRes.data);
      setTables(tablesRes.data.filter((t: Table) => t.status === 'OCCUPIED'));
      setWaiters(usersRes.data.filter((u: User) => u.role === 'WAITER' || u.role === 'ADMIN'));
      setCustomers(customersRes.data || []);
      setMarmitaMenuItems(marmitaMenuRes.data || []);
      setConfig(configRes.data || null);
      setCurrentCash(cashRes.data || null);

      if (categoriesRes.data.length > 0) {
        setSelectedCategory(categoriesRes.data[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      showToast('error', 'Erro ao carregar pedidos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const todaysMarmitaOptions = useMemo(() => marmitaMenuItems, [marmitaMenuItems]);

  const isMarmitaProduct = (product: Product) => {
    const category = categories.find((cat) => cat.id === product.categoryId);
    const categoryName = category?.name?.toUpperCase() || '';
    const productName = product.name?.toUpperCase() || '';

    return categoryName.includes('MARMITA') || productName.includes('MARMITA');
  };

  const addToCart = async (product: Product) => {
    if (isMarmitaProduct(product)) {
      try {
        const res = await api.get(`/marmita-menu/day/${getCurrentWeekDay()}`);
        setMarmitaMenuItems(res.data || []);
        setMarmitaProduct(product);
      } catch (error) {
        console.error('Erro ao carregar cardápio da marmita do dia:', error);
        showToast('error', 'Erro ao carregar cardápio da marmita do dia.');
      }
      return;
    }

    setCart((prev) => {
      const existing = prev.find(
        (i) => i.product.id === product.id && i.notes === '' && i.manualPrice === ''
      );

      if (existing && !product.isByWeight) {
        return prev.map((i) =>
          i.product.id === product.id && i.notes === '' && i.manualPrice === ''
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }

      return [...prev, buildCartItem(product)];
    });
  };

  const addMarmitaToCart = ({
    notes,
    extraTotal: _extraTotal,
  }: {
    notes: string;
    extraTotal: number;
  }) => {
    if (!marmitaProduct) return;
    void _extraTotal;

    const customProduct: Product = {
      ...marmitaProduct,
      price: marmitaProduct.price,
    };

    setCart((prev) => [
      ...prev,
      {
        product: customProduct,
        quantity: 1,
        notes,
        saleType: 'UNIT',
        unitPrice: customProduct.price,
        manualPrice: '',
      },
    ]);

    setMarmitaProduct(null);
    showToast('success', 'Marmita adicionada ao pedido.');
  };

  const removeFromCart = (productId: string, index?: number) => {
    setManualPriceEditors({});
    setCart((prev) => {
      if (typeof index === 'number') {
        const target = prev[index];
        if (!target) return prev;

        if (target.quantity > 1 && !target.notes && target.manualPrice === '') {
          return prev.map((item, i) =>
            i === index ? { ...item, quantity: item.quantity - 1 } : item
          );
        }

        return prev.filter((_, i) => i !== index);
      }

      const existing = prev.find((i) => i.product.id === productId);

      if (existing && existing.quantity > 1 && !existing.notes && existing.manualPrice === '') {
        return prev.map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i
        );
      }

      return prev.filter((i) => i.product.id !== productId);
    });
  };

  const currentDeliveryFee = useMemo(() => {
    if (orderType !== 'DELIVERY') return 0;
    if (deliveryType === 'URBAN') return Number(config?.urbanDeliveryFee || 1);
    if (deliveryType === 'RURAL') return Number(config?.ruralDeliveryFee || 3);
    return 0;
  }, [orderType, deliveryType, config]);

  const cartTotal =
    cart.reduce((sum, item) => {
      const unitPrice = getItemUnitPrice(item);
      const { extras } = parseNotesAndExtras(item.notes || '');
      const extraTotalPerUnit = extras.reduce((s, e) => s + e.price, 0);

      const isByWeight = !!item.product?.isByWeight;
      const weightInKg = Number(item.weight || 0) / 1000;
      const multiplier = isByWeight ? weightInKg : Number(item.quantity || 1);

      let baseItemTotal = unitPrice * multiplier;
      let extraItemTotal = extraTotalPerUnit * multiplier;

      if (
        item.manualPrice !== undefined &&
        item.manualPrice !== null &&
        item.manualPrice !== ''
      ) {
        baseItemTotal = Number(item.manualPrice);
        extraItemTotal = extraTotalPerUnit * (isByWeight ? 1 : Number(item.quantity || 1));
      }

      return sum + baseItemTotal + extraItemTotal;
    }, 0) + currentDeliveryFee;

  const resetOrderForm = () => {
    setCart([]);
    setManualPriceEditors({});
    orderSubmittingRef.current = false;
    setOrderSubmitting(false);
    setNewOrderIdempotencyKey('');
    setShowNewOrder(false);
    setConfirmDiscardNewOrder(false);
    setSelectedWaiterId('');
    setSelectedTableId('');
    setOrderType('DINE_IN');
    setCustomerName('');
    setDeliveryStreet('');
    setDeliveryNumber('');
    setDeliveryNeighborhood('');
    setDeliveryReference('');
    setDeliveryPhone('');
    setDeliveryNotes('');
    setDeliveryType('');
    setMarmitaProduct(null);
  };

  const handleCloseNewOrder = () => {
    if (cart.length > 0) {
      setConfirmDiscardNewOrder(true);
      return;
    }

    resetOrderForm();
  };

  const openNewOrderModal = () => {
    setNewOrderIdempotencyKey(createIdempotencyKey());
    setShowNewOrder(true);
  };

  const handleCreateOrder = async () => {
    if (orderSubmittingRef.current) return;

    if (!currentCash) {
      showToast('error', 'Abra o caixa antes de criar um pedido.');
      return;
    }

    if (cart.length === 0) return;

    if (orderType === 'DINE_IN' && !selectedTableId) {
      showToast('error', 'Selecione uma mesa.');
      return;
    }

    if (!selectedWaiterId) {
      showToast('error', 'Selecione o responsável pelo pedido.');
      return;
    }

    if (orderType === 'TAKE_AWAY' && !customerName.trim()) {
      showToast('error', 'Informe o nome do cliente para retirada.');
      return;
    }

    if (orderType === 'DELIVERY') {
      if (
        !customerName.trim() ||
        !deliveryStreet.trim() ||
        !deliveryNumber.trim() ||
        !deliveryNeighborhood.trim() ||
        !deliveryPhone.trim()
      ) {
        showToast(
          'error',
          'Para entrega, preencha nome do cliente, rua, número, bairro e telefone.'
        );
        return;
      }
    }

    try {
      orderSubmittingRef.current = true;
      setOrderSubmitting(true);
      const idempotencyKey = newOrderIdempotencyKey || createIdempotencyKey();
      await api.post('/orders', {
        idempotencyKey,
        type: orderType,
        customerName:
          orderType === 'DELIVERY' || orderType === 'TAKE_AWAY' || orderType === 'DINE_IN'
            ? customerName
            : undefined,
        deliveryStreet: orderType === 'DELIVERY' ? deliveryStreet : undefined,
        deliveryNumber: orderType === 'DELIVERY' ? deliveryNumber : undefined,
        deliveryNeighborhood: orderType === 'DELIVERY' ? deliveryNeighborhood : undefined,
        deliveryReference: orderType === 'DELIVERY' ? deliveryReference : undefined,
        deliveryPhone: orderType === 'DELIVERY' ? deliveryPhone : undefined,
        deliveryNotes: orderType === 'DELIVERY' ? deliveryNotes : undefined,
        tableId: orderType === 'DINE_IN' ? selectedTableId : undefined,
        waiterId: selectedWaiterId || undefined,
        deliveryFee: currentDeliveryFee,
        deliveryType: orderType === 'DELIVERY' && deliveryType !== '' ? deliveryType : undefined,
        items: cart.map((item) => {
          const weight = getPayloadWeight(item);
          return {
            productId: item.product.id,
            quantity: item.quantity,
            ...(weight !== undefined ? { weight } : {}),
            notes: item.notes,
            unitPrice: getItemUnitPrice(item),
            manualPrice:
              item.manualPrice !== '' && item.manualPrice !== undefined ? item.manualPrice : null,
            saleType: item.saleType,
          };
        }),
      }, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });

      resetOrderForm();
      fetchData();
      showToast('success', 'Pedido criado com sucesso.');
    } catch (error) {
      console.error('Erro ao criar pedido:', error);
      showToast('error', 'Erro ao criar pedido.');
    } finally {
      orderSubmittingRef.current = false;
      setOrderSubmitting(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      fetchData();
      showToast('success', 'Status do pedido atualizado.');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      showToast('error', 'Erro ao atualizar status do pedido.');
    }
  };

  const handleProcessPayment = async (
    orderId: string,
    method: string,
    extraPayload?: Record<string, unknown>
  ): Promise<boolean> => {
    const submitKey = getPaymentSubmittingKey(orderId, method);
    if (paymentSubmittingRef.current) return false;

    try {
      paymentSubmittingRef.current = submitKey;
      setPaymentSubmittingKey(submitKey);
      await api.post(`/orders/${orderId}/payment`, {
        method,
        amount: null,
        ...(extraPayload || {}),
      });
      fetchData();
      showToast(
        'success',
        method === 'CREDIT'
          ? 'Pedido lançado no fiado com sucesso!'
          : 'Pagamento recebido e pedido finalizado!'
      );
      return true;
    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      showToast('error', 'Erro ao processar pagamento.');
      return false;
    } finally {
      paymentSubmittingRef.current = null;
      setPaymentSubmittingKey(null);
    }
  };

  const confirmCreditPayment = async () => {
    if (!creditOrder || !selectedCreditCustomerId) {
      showToast('error', 'Selecione um cliente para lançar no fiado.');
      return;
    }

    const success = await handleProcessPayment(creditOrder.id, 'CREDIT', {
      customerId: selectedCreditCustomerId,
    });

    if (success) {
      setCreditOrder(null);
      setSelectedCreditCustomerId('');
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelingOrderId) return;

    try {
      setCancelLoading(true);
      await api.patch(`/orders/${cancelingOrderId}/status`, { status: 'CANCELED' });
      setCancelingOrderId(null);
      fetchData();
      showToast('success', 'Pedido cancelado com sucesso.');
    } catch (error) {
      console.error('Erro ao cancelar pedido:', error);
      showToast('error', 'Erro ao cancelar pedido.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handlePrint = (order: Order) => {
    const orderTypeLabel =
      order.type === 'DELIVERY'
        ? 'DELIVERY ABERTO'
        : order.type === 'TAKE_AWAY'
        ? 'RETIRADA'
        : 'CONSUMO NO LOCAL';

    const paymentMethodLabel: Record<string, string> = {
      CASH: 'DINHEIRO',
      CRED_CARD: 'CARTAO DE CREDITO',
      DEBIT_CARD: 'CARTAO DE DEBITO',
      PIX: 'PIX',
      ON_DELIVERY: 'PAGAR NA ENTREGA',
      ON_PICKUP: 'PAGAR NA RETIRADA',
      CREDIT: 'FIADO',
    };

    let calculatedSubtotal = 0;

    const itemsHtml = order.items
      .map((item) => {
        const { cleanNotes, extras } = parseNotesAndExtras(item.notes || '');
        const isByWeight = !!item.product?.isByWeight;
        const weightInKg = Number(item.weight || 0) / 1000;
        const multiplier = isByWeight ? weightInKg : Number(item.quantity || 1);

        const extraTotalPerUnit = extras.reduce((sum, e) => sum + e.price, 0);
        const baseUnitPrice = Number(item.unitPrice ?? item.price ?? 0) - extraTotalPerUnit;

        let baseItemTotal = baseUnitPrice * multiplier;
        const manualPrice = (item as any).manualPrice;

        if (manualPrice !== undefined && manualPrice !== null) {
          baseItemTotal = Number(manualPrice);
        }

        calculatedSubtotal += baseItemTotal;

        const extrasHtml = extras
          .map((extra) => {
            const extraTotal =
              extra.price *
              (manualPrice !== null && manualPrice !== undefined
                ? isByWeight
                  ? 1
                  : Number(item.quantity || 1)
                : multiplier);
            calculatedSubtotal += extraTotal;
            return `
            <div class="item-row" style="margin-left: 12px; margin-top: 3px;">
              <div class="item-left">
                <div class="item-main" style="font-size: 11px; color: #444;">+ EXTRA: ${escapeHtml(
                  normalizeText(extra.name)
                )}</div>
              </div>
              <div class="item-price" style="font-size: 11px; color: #444;">${formatMoneyBR(
                extraTotal
              )}</div>
            </div>
          `;
          })
          .join('');

        return `
          <div class="item-block">
            <div class="item-row">
              <div class="item-left">
                <div class="item-main">
                  ${
                    isByWeight
                      ? `${
                          manualPrice !== null && manualPrice !== undefined
                            ? 'FIXO'
                            : weightInKg.toFixed(3) + 'KG'
                        }&nbsp;&nbsp;&nbsp;${escapeHtml(normalizeText(item.product?.name))}`
                      : `${Number(item.quantity || 0)}&nbsp;&nbsp;&nbsp;${escapeHtml(
                          normalizeText(item.product?.name)
                        )}`
                  }
                </div>

                  ${
                    cleanNotes
                      ? `
                        <div class="obs-line">
                          <span class="obs-text">${escapeHtml(normalizeText(cleanNotes))
                            .replace(
                              /COMPOSICAO DA MARMITA:/g,
                              '<span class="label-strong">COMPOSICAO DA MARMITA:</span>'
                            )
                            .replace(/\n/g, '<br/>')}</span>
                        </div>
                      `
                      : ''
                  }
              </div>

              <div class="item-price">${formatMoneyBR(baseItemTotal)}</div>
            </div>
            ${extrasHtml}
          </div>
        `;
      })
      .join('');

    const deliveryFee = Number(order.deliveryFee || 0);
    const additionalFee = 0;
    const discount = 0;
    const changeValue = 0;
    const totalToCharge = Number(
      order.total || calculatedSubtotal + deliveryFee + additionalFee - discount
    );

    const deliveryAddress = [order.deliveryStreet, order.deliveryNumber]
      .filter(Boolean)
      .join(', ');

    const storeName = escapeHtml(normalizeText(config?.name || 'RESTAURANTE'));
    const customerNameValue = escapeHtml(normalizeText(order.customerName || ''));
    const neighborhood = escapeHtml(normalizeText(order.deliveryNeighborhood || ''));
    const reference = escapeHtml(normalizeText(order.deliveryReference || ''));
    const phone = escapeHtml(order.deliveryPhone || '');
    const paymentLabel = paymentMethodLabel[order.payment?.method || ''] || 'NAO INFORMADO';

    const printContent = `
      <html>
        <head>
          <title>Pedido #${order.id.slice(-6).toUpperCase()}</title>
          <style>
  @page {
    size: 80mm auto;
    margin: 2mm;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  html, body {
    margin: 0;
    padding: 0;
    width: 80mm;
    max-width: 80mm;
    overflow-x: hidden;
    background: #fff;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 11px;
    line-height: 1.25;
    font-weight: 400;
  }

  .receipt {
    width: 72mm;
    margin: 0 auto;
    padding: 2mm 0;
  }

  .center {
    text-align: center;
  }

  .title {
    text-align: center;
    font-size: 16px;
    font-weight: 800;
    text-transform: uppercase;
    margin-bottom: 8px;
    letter-spacing: 0.3px;
  }

  .line {
    margin-bottom: 2px;
    word-break: break-word;
    overflow-wrap: anywhere;
    font-size: 11px;
  }

  .label-strong,
  .strong {
    font-weight: 800;
  }

  .spacer-sm {
    height: 6px;
  }

  .section-title,
  .subsection-title {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    margin-top: 8px;
    margin-bottom: 4px;
  }

  .table-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    margin-top: 4px;
    margin-bottom: 4px;
  }

  .item-block {
    margin-bottom: 6px;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 2px;
  }

  .item-left {
    flex: 1;
    min-width: 0;
  }

  .item-main {
    font-size: 11px;
    font-weight: 400;
    word-break: break-word;
  }

  .item-price {
    min-width: 70px;
    text-align: right;
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
  }

  .obs-line {
    margin-top: 2px;
    font-size: 10px;
    line-height: 1.25;
    word-break: break-word;
  }

  .obs-text {
    display: inline;
    font-weight: 400;
  }

  hr {
    border: 0;
    border-top: 1px solid #000;
    margin: 8px 0;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }

  .total-row .total-label {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .total-row .total-value {
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
    text-align: right;
  }

  .grand-total {
    margin-top: 4px;
  }

  .grand-total .total-label {
    font-size: 12px;
  }

  .grand-total .total-value {
    font-size: 16px;
  }

  .footer {
    margin-top: 10px;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
  }
</style>
        </head>
        <body>
          <div class="receipt">
            <div class="center title">${orderTypeLabel}</div>
            <div class="line"><span class="label-strong">LOJA:</span> ${storeName}</div>
            <div class="line"><span class="label-strong">PEDIDO:</span> #${order.id
              .slice(-6)
              .toUpperCase()}</div>
            <div class="line"><span class="label-strong">DATA:</span> ${new Date(
              order.createdAt
            ).toLocaleString('pt-BR')}</div>

            <div class="spacer-sm"></div>
            <div class="section-title">DADOS DO CLIENTE</div>

            ${
              customerNameValue
                ? `<div class="line"><span class="label-strong">NOME:</span> ${customerNameValue}</div>`
                : ''
            }
            ${
              deliveryAddress
                ? `<div class="line"><span class="label-strong">ENDERECO:</span> ${escapeHtml(
                    normalizeText(deliveryAddress)
                  )}</div>`
                : ''
            }
            <div class="line"><span class="label-strong">COMPLEMENTO:</span> ${
              reference || 'NAO INFORMADO'
            }</div>
            ${
              neighborhood
                ? `<div class="line"><span class="label-strong">BAIRRO:</span> ${neighborhood}</div>`
                : ''
            }
            ${
              phone
                ? `<div class="line"><span class="label-strong">TELEFONE:</span> ${phone}</div>`
                : ''
            }

            <div class="section-title">ITENS DO PEDIDO</div>
            <div class="table-head">
              <span>QTD&nbsp;&nbsp;ITEM</span>
              <span>PRECO</span>
            </div>

            ${itemsHtml}

            <hr />

            <div class="total-row">
              <span class="total-label">SubTotal</span>
              <span class="total-value">${formatMoneyBR(calculatedSubtotal)}</span>
            </div>

            <div class="total-row">
              <span class="total-label">Taxa de Entrega</span>
              <span class="total-value">${formatMoneyBR(deliveryFee)}</span>
            </div>

            <div class="total-row">
              <span class="total-label">Taxa Adicional</span>
              <span class="total-value">${formatMoneyBR(additionalFee)}</span>
            </div>

            <div class="total-row">
              <span class="total-label">Desconto</span>
              <span class="total-value">${formatMoneyBR(discount)}</span>
            </div>

            <div class="total-row">
              <span class="total-label strong">Troco</span>
              <span class="total-value strong">${formatMoneyBR(changeValue)}</span>
            </div>

            <div class="total-row grand-total">
              <span class="total-label">Cobrar do Cliente</span>
              <span class="total-value">${formatMoneyBR(totalToCharge)}</span>
            </div>

            <hr />

            <div class="subsection-title">Forma de pagamento</div>
            <div class="line strong">${paymentLabel}</div>

            ${
              paymentLabel === 'DINHEIRO'
                ? `<div class="line">Valor a receber em dinheiro: ${formatMoneyBR(totalToCharge)}</div>`
                : ''
            }

            <div class="footer">OBRIGADO E VOLTE SEMPRE</div>
          </div>
        </body>
      </html>
    `;

    printHtmlContent(printContent);
  };

  const currentCategoryProducts =
    categories.find((c) => c.id === selectedCategory)?.products || [];

  const filteredOrders = useMemo(() => {
    const term = searchCustomer.trim().toLowerCase();

    if (!term) return orders;

    return orders.filter((order) => (order.customerName || '').toLowerCase().includes(term));
  }, [orders, searchCustomer]);

  const isCashOpen = !!currentCash;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-[80]">
          <div
            className={clsx(
              'min-w-[280px] max-w-sm rounded-2xl shadow-2xl px-4 py-3 border flex items-start gap-3',
              toast.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            )}
          >
            <div className="mt-0.5">
              {toast.type === 'success' ? (
                <CheckCircle size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-current/70 hover:text-current"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-gray-500">Gerencie os pedidos do restaurante</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-80">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={searchCustomer}
              onChange={(e) => setSearchCustomer(e.target.value)}
              placeholder="Buscar por nome do cliente..."
              className="input pl-9"
            />
          </div>

          <button
            onClick={() => {
              if (!isCashOpen) {
                showToast('error', 'Abra o caixa antes de criar um novo pedido.');
                return;
              }
              openNewOrderModal();
            }}
            disabled={!isCashOpen}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!isCashOpen ? 'Abra o caixa para criar pedidos' : 'Novo Pedido'}
          >
            <Plus size={18} /> Novo Pedido
          </button>
        </div>
      </div>

      {!isCashOpen && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            O caixa está fechado. Abra o caixa para liberar novos pedidos.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.length === 0 && (
          <div className="col-span-full card text-center py-12 text-gray-400">
            <ShoppingCart size={48} className="mx-auto mb-3 opacity-50" />
            <p>
              {searchCustomer.trim()
                ? 'Nenhum pedido encontrado para esse cliente.'
                : 'Nenhum pedido encontrado.'}
            </p>
          </div>
        )}

        {filteredOrders.map((order) => (
          <div key={order.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold">#{order.id.slice(-6).toUpperCase()}</p>

                  <div className="flex gap-1">
                    {order.status === 'NEW' && (
                      <button
                        onClick={() => setEditingOrder(order)}
                        className="p-1 text-orange-600 hover:bg-orange-50 rounded"
                        title="Editar Pedido"
                      >
                        <Edit size={14} />
                      </button>
                    )}

                    <button
                      onClick={() => handlePrint(order)}
                      className="p-1 text-primary-600 hover:bg-primary-50 rounded"
                      title="Imprimir Cupom"
                    >
                      <Printer size={14} />
                    </button>

                    <button
                      onClick={() => {
                        setReceiptOrder(order);
                        setCompanyName('');
                        setCompanyCnpj('');
                      }}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title="Recibo Empresa"
                    >
                      <FileText size={14} />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-500">
                  {new Date(order.createdAt).toLocaleString('pt-BR')}
                </p>

                <p className="text-xs font-bold tracking-wide text-orange-600 uppercase">
                  {order.type === 'DINE_IN' && 'MESA'}
                  {order.type === 'TAKE_AWAY' && 'RETIRADA'}
                  {order.type === 'DELIVERY' && 'ENTREGA'}
                </p>

                {order.customerName && (
                  <p className="text-sm font-medium text-primary-600">
                    Cliente: {order.customerName}
                  </p>
                )}

                {order.type === 'DELIVERY' && order.deliveryStreet && (
                  <p className="text-xs text-gray-500">
                    {order.deliveryStreet}, {order.deliveryNumber || ''} -{' '}
                    {order.deliveryNeighborhood || ''}
                  </p>
                )}

                {order.waiter && (
                  <p className="text-xs text-gray-500">
                    Responsável: {order.waiter.name}
                  </p>
                )}
              </div>

              <span className={`badge ${statusColors[order.status]}`}>
                {statusLabels[order.status]}
              </span>
            </div>

            <div className="space-y-1.5 mb-3 mt-2">
              {order.items.map((item) => {
                const { cleanNotes, extras } = parseNotesAndExtras(item.notes || '');
                const isByWeight = !!item.product?.isByWeight;
                const weightInKg = Number(item.weight || 0) / 1000;
                const multiplier = isByWeight ? weightInKg : Number(item.quantity || 1);

                const extraTotalPerUnit = extras.reduce((sum, e) => sum + e.price, 0);
                const baseUnitPrice = Number(item.unitPrice ?? item.price ?? 0) - extraTotalPerUnit;

                let baseItemTotal = baseUnitPrice * multiplier;
                let extraItemTotal = extraTotalPerUnit * multiplier;

                const manualPrice = (item as any).manualPrice;

                if (manualPrice !== undefined && manualPrice !== null) {
                  baseItemTotal = Number(manualPrice);
                  extraItemTotal =
                    extraTotalPerUnit * (isByWeight ? 1 : Number(item.quantity || 1));
                }

                const totalWithExtras = baseItemTotal + extraItemTotal;

                return (
                  <div
                    key={item.id}
                    className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-semibold text-gray-800 text-sm leading-tight">
                                {isByWeight
                                  ? `${
                                      manualPrice !== null && manualPrice !== undefined
                                        ? 'Fixo'
                                        : weightInKg.toFixed(3) + 'kg'
                                    }`
                                  : `${item.quantity}x`}{' '}
                                {item.product?.name}
                              </span>

                              <span className="text-[11px] text-gray-500 whitespace-nowrap">
                                ({isByWeight
                                  ? `R$ ${baseUnitPrice.toFixed(2)}/kg`
                                  : `R$ ${baseUnitPrice.toFixed(2)}`})
                              </span>
                            </div>

                            {extras.length > 0 && (
                              <div className="mt-1 text-[11px] text-gray-500 leading-snug">
                                <span className="font-medium text-gray-600">Extras:</span>{' '}
                                {extras.map((extra, idx) => {
                                  const extraValue =
                                    extra.price *
                                    (manualPrice !== null && manualPrice !== undefined
                                      ? isByWeight
                                        ? 1
                                        : Number(item.quantity || 1)
                                      : multiplier);

                                  return (
                                    <span key={extra.id}>
                                      + {extra.name} (R$ {extraValue.toFixed(2)})
                                      {idx < extras.length - 1 ? ' • ' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {cleanNotes && (
                              <div className="mt-1 text-[11px] text-gray-500 leading-snug whitespace-pre-line">
                                {cleanNotes.includes('Composição da marmita:') ? (
                                  <>
                                    <span className="font-medium text-primary-600">Composição da marmita:</span>
                                    {'\n'}
                                    {cleanNotes.replace('Composição da marmita:', '').replace(/^\s*[\r\n]+/, '')}
                                  </>
                                ) : (
                                  cleanNotes
                                )}
                              </div>
                            )}
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="font-bold text-gray-900 text-sm whitespace-nowrap">
                              R$ {totalWithExtras.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-dashed pt-3 space-y-3">
              {order.deliveryFee ? (
                <p className="text-xs text-blue-700 font-medium">
                  Taxa de entrega: R$ {Number(order.deliveryFee).toFixed(2)}
                </p>
              ) : null}

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-lg">
                    R$ {order.total.toFixed(2)}
                  </span>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePrint(order)}
                      className="btn-secondary p-2"
                      title="Imprimir"
                    >
                      <Printer size={16} />
                    </button>

                    {order.status !== 'CANCELED' && order.status !== 'FINISHED' && (
                      <button
                        onClick={() => setCancelingOrderId(order.id)}
                        className="btn-secondary p-2 text-red-600"
                        title="Cancelar Pedido"
                      >
                        <X size={16} />
                      </button>
                    )}

                    {order.status === 'NEW' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'IN_PROGRESS')}
                        className="btn-primary p-2"
                        title="Iniciar Preparo"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}

                    {order.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'READY')}
                        className="btn-primary p-2"
                        title="Marcar Pronto"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}

                    {order.status === 'READY' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'DELIVERED')}
                        className="btn-primary p-2"
                        title="Marcar Entregue"
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {order.status === 'DELIVERED' && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed">
                    <p className="w-full text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Registrar Pagamento
                    </p>
                    <button
                      onClick={() => handleProcessPayment(order.id, 'CASH')}
                      disabled={paymentSubmittingKey !== null}
                      className="flex-1 min-w-[80px] flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors"
                      title="Receber em Dinheiro"
                    >
                      {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'CASH') ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <DollarSign size={18} />
                      )}
                      <span className="text-xs font-bold">
                        {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'CASH')
                          ? 'Confirmando...'
                          : 'Dinheiro'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleProcessPayment(order.id, 'PIX')}
                      disabled={paymentSubmittingKey !== null}
                      className="flex-1 min-w-[80px] flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-colors"
                      title="Receber no PIX"
                    >
                      {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'PIX') ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <QrCode size={18} />
                      )}
                      <span className="text-xs font-bold">
                        {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'PIX')
                          ? 'Confirmando...'
                          : 'PIX'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleProcessPayment(order.id, 'CREDIT_CARD')}
                      disabled={paymentSubmittingKey !== null}
                      className="flex-1 min-w-[80px] flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                      title="Receber no Cartão de Crédito"
                    >
                      {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'CREDIT_CARD') ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <CreditCard size={18} />
                      )}
                      <span className="text-xs font-bold">
                        {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'CREDIT_CARD')
                          ? 'Confirmando...'
                          : 'Crédito'}
                      </span>
                    </button>

                    <button
                      onClick={() => handleProcessPayment(order.id, 'DEBIT_CARD')}
                      disabled={paymentSubmittingKey !== null}
                      className="flex-1 min-w-[80px] flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                      title="Receber no Cartão de Débito"
                    >
                      {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'DEBIT_CARD') ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <CreditCard size={18} />
                      )}
                      <span className="text-xs font-bold">
                        {paymentSubmittingKey === getPaymentSubmittingKey(order.id, 'DEBIT_CARD')
                          ? 'Confirmando...'
                          : 'Débito'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setCreditOrder(order);
                        setSelectedCreditCustomerId(order.customerId || '');
                      }}
                      disabled={paymentSubmittingKey !== null}
                      className="flex-1 min-w-[80px] flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
                      title="Lançar no fiado"
                    >
                      <Wallet size={18} />
                      <span className="text-xs font-bold">Fiado</span>
                    </button>
                  </div>
                )}

                {order.status === 'FINISHED' && order.payment?.method && (
                  <div className="pt-2 border-t border-dashed">
                    <p className="text-xs text-gray-500 font-medium">Pago via:</p>
                    <p className="text-sm font-bold text-gray-800 mt-0.5">
                      {order.payment.method === 'CASH' && '💵 Dinheiro'}
                      {order.payment.method === 'PIX' && '💠 PIX'}
                      {order.payment.method === 'CREDIT_CARD' && '💳 Cartão de Crédito'}
                      {order.payment.method === 'DEBIT_CARD' && '💳 Cartão de Débito'}
                      {order.payment.method === 'CREDIT' && '🧾 Fiado'}
                    </p>
                  </div>
                )}

                {config?.nfceEnabled &&
                  (user?.role === 'ADMIN' || user?.role === 'CASHIER') &&
                  order.status === 'FINISHED' &&
                  order.payment?.status === 'PAID' &&
                  order.payment.method !== 'CREDIT' && (
                    <NfceReceiptPanel orderId={order.id} phone={order.deliveryPhone} />
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {creditOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-1">Lançar no Fiado</h2>
            <p className="text-gray-500 mb-4">
              Pedido #{creditOrder.id.slice(-6).toUpperCase()} • Total R$ {Number(creditOrder.total || 0).toFixed(2)}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente responsável
              </label>
              <select
                value={selectedCreditCustomerId}
                onChange={(e) => setSelectedCreditCustomerId(e.target.value)}
                className="input"
              >
                <option value="">Selecione um cliente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} {customer.phone ? `- ${customer.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {!customers.length && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Cadastre um cliente na tela de Fiado antes de usar essa opção.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={confirmCreditPayment}
                disabled={
                  !selectedCreditCustomerId ||
                  paymentSubmittingKey === getPaymentSubmittingKey(creditOrder.id, 'CREDIT')
                }
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {paymentSubmittingKey === getPaymentSubmittingKey(creditOrder.id, 'CREDIT') ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Confirmando...
                  </span>
                ) : (
                  'Confirmar Fiado'
                )}
              </button>
              <button
                onClick={() => {
                  setCreditOrder(null);
                  setSelectedCreditCustomerId('');
                }}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Novo Pedido</h2>
              <button
                onClick={handleCloseNewOrder}
                className="btn-secondary p-2"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 border-r">
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-4 py-2 rounded-full whitespace-nowrap font-medium transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'bg-white text-gray-700 border border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentCategoryProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="text-left p-3 border rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                        {product.description}
                      </p>
                      <p className="text-primary-600 font-bold mt-1">
                        R$ {product.price.toFixed(2)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex flex-col bg-white">
                <div className="flex-1 overflow-y-auto flex flex-col">
                  <div className="p-4 border-b flex-shrink-0">
                    <select
                      value={orderType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setOrderType(newType);

                        if (newType !== 'DINE_IN') {
                          setSelectedTableId('');
                        }
                      }}
                      className="input mb-2"
                    >
                      <option value="DINE_IN">Mesa</option>
                      <option value="TAKE_AWAY">Retirada</option>
                      <option value="DELIVERY">Entrega</option>
                    </select>

                    {orderType === 'DINE_IN' && (
                      <>
                        <select
                          value={selectedTableId}
                          onChange={(e) => setSelectedTableId(e.target.value)}
                          className="input mb-2"
                        >
                          <option value="">Selecione a mesa</option>
                          {tables.map((t) => (
                            <option key={t.id} value={t.id}>
                              Mesa {t.number}
                            </option>
                          ))}
                        </select>

                        <div className="mb-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nome da pessoa na mesa
                          </label>
                          <input
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="input w-full"
                            placeholder="Ex.: João da mesa 4"
                          />
                        </div>
                      </>
                    )}

                    <select
                      value={selectedWaiterId}
                      onChange={(e) => setSelectedWaiterId(e.target.value)}
                      className="input"
                    >
                      <option value="">Responsável pelo Pedido</option>
                      {waiters.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>

                    {(orderType === 'TAKE_AWAY' || orderType === 'DELIVERY') && (
                      <div className="mb-4 mt-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nome do cliente
                        </label>
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="input w-full"
                          placeholder={
                            orderType === 'DELIVERY'
                              ? 'Cliente da entrega'
                              : 'Cliente da retirada'
                          }
                        />
                      </div>
                    )}

                    {orderType === 'DELIVERY' && (
                      <div className="mt-3 space-y-2">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Tipo de Entrega
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() =>
                                setDeliveryType((prev) => (prev === 'URBAN' ? '' : 'URBAN'))
                              }
                              className={`p-3 rounded-lg border-2 transition-colors ${
                                deliveryType === 'URBAN'
                                  ? 'border-primary-600 bg-primary-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="font-medium text-sm">Urbana</div>
                              <div className="text-primary-600 font-bold">
                                R$ {Number(config?.urbanDeliveryFee || 1).toFixed(2)}
                              </div>
                            </button>

                            <button
                              onClick={() =>
                                setDeliveryType((prev) => (prev === 'RURAL' ? '' : 'RURAL'))
                              }
                              className={`p-3 rounded-lg border-2 transition-colors ${
                                deliveryType === 'RURAL'
                                  ? 'border-primary-600 bg-primary-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="font-medium text-sm">Rural</div>
                              <div className="text-primary-600 font-bold">
                                R$ {Number(config?.ruralDeliveryFee || 3).toFixed(2)}
                              </div>
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder="Telefone *"
                          value={deliveryPhone}
                          onChange={(e) => setDeliveryPhone(e.target.value)}
                          className="input"
                        />

                        <input
                          type="text"
                          placeholder="Rua *"
                          value={deliveryStreet}
                          onChange={(e) => setDeliveryStreet(e.target.value)}
                          className="input"
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Número *"
                            value={deliveryNumber}
                            onChange={(e) => setDeliveryNumber(e.target.value)}
                            className="input"
                          />
                          <input
                            type="text"
                            placeholder="Bairro *"
                            value={deliveryNeighborhood}
                            onChange={(e) => setDeliveryNeighborhood(e.target.value)}
                            className="input"
                          />
                        </div>

                        <input
                          type="text"
                          placeholder="Referência"
                          value={deliveryReference}
                          onChange={(e) => setDeliveryReference(e.target.value)}
                          className="input"
                        />

                        <textarea
                          placeholder="Observações adicionais"
                          value={deliveryNotes}
                          onChange={(e) => setDeliveryNotes(e.target.value)}
                          className="input min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 flex-1 bg-gray-50/50">
                    {cart.length === 0 && (
                      <p className="text-center text-gray-400 text-sm mt-4">
                        Carrinho vazio
                      </p>
                    )}

                    {cart.map((item, index) => {
                      const { extras } = parseNotesAndExtras(item.notes || '');
                      const isByWeight = !!item.product?.isByWeight;
                      const weightInKg = Number(item.weight || 0) / 1000;
                      const multiplier = isByWeight ? weightInKg : Number(item.quantity || 1);

                      const extraTotalPerUnit = extras.reduce((sum, e) => sum + e.price, 0);
                      const baseUnitPrice =
                        Number(item.unitPrice ?? item.product?.price ?? 0) - extraTotalPerUnit;

                      let baseItemTotal = baseUnitPrice * multiplier;
                      let extraItemTotal = extraTotalPerUnit * multiplier;

                      if (
                        item.manualPrice !== undefined &&
                        item.manualPrice !== null &&
                        item.manualPrice !== ''
                      ) {
                        baseItemTotal = Number(item.manualPrice);
                        extraItemTotal =
                          extraTotalPerUnit * (isByWeight ? 1 : Number(item.quantity || 1));
                      }

                      const totalWithExtras = baseItemTotal + extraItemTotal;
                      const hasManualPrice =
                        item.manualPrice !== undefined &&
                        item.manualPrice !== null &&
                        item.manualPrice !== '';
                      const showManualPriceEditor =
                        canEditManualPrice && (manualPriceEditors[index] || hasManualPrice);

                      return (
                        <div
                          key={`${item.product.id}-${index}`}
                          className="flex flex-col gap-1 border-b border-gray-200 pb-3 mb-2 last:border-0 last:mb-0"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.product.name}</p>
                              <p className="text-xs text-gray-500">
                                {isByWeight
                                  ? `Preço base: R$ ${baseUnitPrice.toFixed(2)}/kg`
                                  : `Valor base: R$ ${baseUnitPrice.toFixed(2)}`}
                              </p>
                              {hasManualPrice && (
                                <span className="mt-1 inline-flex w-fit rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 border border-orange-200">
                                  preço ajustado
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              {!item.product.isByWeight &&
                                !item.notes &&
                                item.manualPrice === '' && (
                                  <>
                                    <button
                                      onClick={() => removeFromCart(item.product.id)}
                                      className="p-1 rounded hover:bg-gray-100"
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="w-6 text-center text-sm font-bold">
                                      {item.quantity}
                                    </span>
                                    <button
                                      onClick={() => addToCart(item.product)}
                                      className="p-1 rounded hover:bg-gray-100"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </>
                                )}
                              <button
                                onClick={() => removeFromCart(item.product.id, index)}
                                className="p-1 rounded hover:bg-red-100 text-red-500"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {item.product.isByWeight ? (
                              <input
                                type="number"
                                placeholder="Peso (g)"
                                className="input py-1.5 text-xs w-full"
                                value={item.weight || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setCart((prev) =>
                                    prev.map((it, i) =>
                                      i === index ? { ...it, weight: val, manualPrice: '' } : it
                                    )
                                  );
                                }}
                              />
                            ) : (
                              <div className="flex-1"></div>
                            )}

                            {showManualPriceEditor && (
                              <div className="flex min-w-[180px] flex-1 items-center gap-2">
                                <input
                                  type="number"
                                  placeholder="Fixo (R$)"
                                  title="Valor Fixo - Ignora peso ou quantidade"
                                  className="input py-1.5 text-xs w-full bg-orange-50 border-orange-200 focus:border-orange-400 placeholder:text-orange-400 text-orange-800 font-bold"
                                  value={item.manualPrice !== undefined ? item.manualPrice : ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseFloat(e.target.value) : '';
                                    setCart((prev) =>
                                      prev.map((it, i) =>
                                        i === index
                                          ? {
                                              ...it,
                                              manualPrice: val,
                                              weight: val !== '' ? 0 : it.weight,
                                            }
                                          : it
                                      )
                                    );
                                  }}
                                />

                                {hasManualPrice && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCart((prev) =>
                                        prev.map((it, i) =>
                                          i === index ? { ...it, manualPrice: '' } : it
                                        )
                                      );
                                      setManualPriceEditors((current) => ({
                                        ...current,
                                        [index]: false,
                                      }));
                                    }}
                                    className="text-xs font-semibold text-orange-700 hover:text-orange-900"
                                  >
                                    Limpar
                                  </button>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-1 whitespace-nowrap min-w-[96px] justify-end ml-auto">
                              <span className="text-sm font-bold text-primary-600 text-right">
                                R$ {totalWithExtras.toFixed(2)}
                              </span>
                              {canEditManualPrice && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setManualPriceEditors((current) => ({
                                      ...current,
                                      [index]: !current[index],
                                    }))
                                  }
                                  className="p-1 rounded hover:bg-orange-50 text-orange-600"
                                  title="editar preço"
                                  aria-label="editar preço"
                                >
                                  <Edit size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {item.notes && (
                            <div className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded-lg leading-relaxed border border-gray-200 whitespace-pre-line">
                              {item.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 border-t flex-shrink-0 bg-white shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)]">
                  <div className="flex justify-between font-bold text-lg mb-3">
                    <span>Total</span>
                    <span>R$ {cartTotal.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={handleCreateOrder}
                    disabled={cart.length === 0 || !isCashOpen || orderSubmitting}
                    className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {orderSubmitting ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 size={18} className="animate-spin" />
                        Confirmando...
                      </span>
                    ) : (
                      'Confirmar Pedido'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDiscardNewOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900">Descartar pedido em andamento?</h3>
            <p className="text-sm text-gray-500 mt-2">
              Os itens e dados preenchidos neste pedido serao removidos.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmDiscardNewOrder(false)}
                className="btn-secondary flex-1 py-3"
              >
                Cancelar
              </button>

              <button
                onClick={resetOrderForm}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {marmitaProduct && (
        <MarmitaBuilderModal
          title={marmitaProduct.name}
          basePrice={marmitaProduct.price}
          options={todaysMarmitaOptions}
          onClose={() => setMarmitaProduct(null)}
          onConfirm={addMarmitaToCart}
        />
      )}

      {cancelingOrderId && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-100 text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Cancelar pedido</h3>
                <p className="text-sm text-gray-500 mt-2">
                  Tem certeza que deseja cancelar este pedido?
                </p>
                <p className="text-sm text-red-600 mt-2 font-medium">
                  Essa ação vai marcar o pedido como cancelado.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCancelingOrderId(null)}
                disabled={cancelLoading}
                className="btn-secondary flex-1 py-3"
              >
                Voltar
              </button>

              <button
                onClick={handleCancelOrder}
                disabled={cancelLoading}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {cancelLoading ? 'Cancelando...' : 'Cancelar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptOrder && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                <FileText size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Recibo para empresa</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Informe os dados para gerar e imprimir o recibo do pedido.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da empresa
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input w-full"
                  placeholder="Ex: Empresa XYZ LTDA"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CNPJ
                </label>
                <input
                  type="text"
                  value={companyCnpj}
                  onChange={(e) => setCompanyCnpj(formatCnpj(e.target.value))}
                  className="input w-full"
                  placeholder="00.000.000/0001-00"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setReceiptOrder(null);
                  setCompanyName('');
                  setCompanyCnpj('');
                }}
                className="btn-secondary flex-1 py-3"
              >
                Cancelar
              </button>

              <button
                onClick={() => {
                  if (!receiptOrder) return;

                  const cleanCnpj = getOnlyDigits(companyCnpj);

                  if (!companyName.trim() || !cleanCnpj) {
                    showToast('error', 'Preencha o nome da empresa e o CNPJ.');
                    return;
                  }

                  if (cleanCnpj.length !== 14) {
                    showToast('error', 'O CNPJ deve ter 14 números.');
                    return;
                  }

                  handlePrintCompanyReceipt(
                    receiptOrder,
                    companyName.trim(),
                    companyCnpj
                  );

                  setReceiptOrder(null);
                  setCompanyName('');
                  setCompanyCnpj('');
                }}
                className="btn-primary flex-1 py-3"
              >
                Imprimir recibo
              </button>
            </div>
          </div>
        </div>
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          categories={categories}
          onClose={() => setEditingOrder(null)}
          onSave={() => {
            setEditingOrder(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
};

export default OrdersPage;
