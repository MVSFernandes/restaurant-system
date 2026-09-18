import { orderErrorMessage } from '../../lib/orderErrors';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../services/api';
import type { Table, Order, Product, Category, MarmitaMenuItem, CashRegisterSession } from '../../types';
import { clsx } from 'clsx';
import { Plus, Minus, Trash2, Send, Edit, XCircle, Loader2 } from 'lucide-react';
import { MarmitaBuilderModal } from '../../components/modals/MarmitaBuilderModal';
import { EditOrderModal } from '../../components/modals/EditOrderModal';
import { ORDER_STATUS_BADGE_CLASSES, ORDER_STATUS_LABELS } from '../../constants/orders';
import { formatCurrencyBRL } from '../../utils/currency';

interface CartItem {
  product: Product;
  quantity: number;
  weight?: number;
  notes: string;
  saleType?: 'UNIT' | 'WEIGHT' | 'SELF_SERVICE';
  unitPrice?: number;
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

const statusLabels = ORDER_STATUS_LABELS;
const statusColors = ORDER_STATUS_BADGE_CLASSES;

const WaiterTablesPage: React.FC = () => {
  const [tables, setTables] = useState<Table[]>([]);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableOrders, setTableOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddItems, setShowAddItems] = useState(false);
  const [confirmDiscardOrder, setConfirmDiscardOrder] = useState(false);
  const [marmitaProduct, setMarmitaProduct] = useState<Product | null>(null);
  const [marmitaMenuItems, setMarmitaMenuItems] = useState<MarmitaMenuItem[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [currentCash, setCurrentCash] = useState<CashRegisterSession | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [orderIdempotencyKey, setOrderIdempotencyKey] = useState('');
  const orderSubmittingRef = useRef(false);

  
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

  const getItemTotal = (item: CartItem) => {
    const unitPrice = getItemUnitPrice(item);
    if (item.product.isByWeight) {
      return (unitPrice * Number(item.weight || 0)) / 1000;
    }
    return unitPrice * Number(item.quantity || 1);
  };

  const updateCartItem = (index: number, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3000);
  };

  const fetchTables = async () => {
    try {
      const [tablesRes, categoriesRes, marmitaMenuRes, cashRes] = await Promise.all([
        api.get('/tables'),
        api.get('/categories?includeProducts=true'),
        api.get('/marmita-menu/today').catch(() => ({ data: [] })),
        api.get('/cash-register/current').catch(() => ({ data: null })),
      ]);
      setTables(tablesRes.data);
      setCategories(categoriesRes.data);
      setMarmitaMenuItems(marmitaMenuRes.data || []);
      setCurrentCash(cashRes.data || null);
      if (categoriesRes.data.length > 0 && !selectedCategory) setSelectedCategory(categoriesRes.data[0].id);
    } catch (error) {
      console.error(error);
      showToast('error', 'Erro ao carregar mesas e produtos.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTableOrders = async (table: Table) => {
    if (table.status !== 'OCCUPIED') {
      setTableOrders([]);
      return;
    }

    try {
      const { data } = await api.get(`/orders?tableId=${table.id}&status=NEW,IN_PROGRESS,READY`);
      setTableOrders(data);
    } catch (error) {
      console.error(error);
      showToast('error', 'Erro ao carregar pedidos da mesa.');
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const handleSelectTable = async (table: Table) => {
    setSelectedTable(table);
    await fetchTableOrders(table);
  };

  const isMarmitaProduct = (product: Product) => {
    const category = categories.find((cat) => cat.id === product.categoryId);
    const categoryName = category?.name?.toUpperCase() || '';
    const productName = product.name?.toUpperCase() || '';
    return categoryName.includes('MARMITA') || productName.includes('MARMITA');
  };

  const productAvailable = (product: Product) =>
    (categories.flatMap((category) => category.products ?? []).find((current) => current.id === product.id) ?? product).available !== false;

  const addToCart = (product: Product) => {
    if (!productAvailable(product)) return;
    if (isMarmitaProduct(product)) {
      setMarmitaProduct(product);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id && i.notes === '');
      if (existing && !product.isByWeight) {
        return prev.map((i) => i.product.id === product.id && i.notes === '' ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, buildCartItem(product)];
    });
  };

  const addMarmitaToCart = ({ notes, extraTotal }: { notes: string; extraTotal: number }) => {
    if (!marmitaProduct) return;
    setCart((prev) => [...prev, { product: { ...marmitaProduct, price: marmitaProduct.price + extraTotal }, quantity: 1, notes, saleType: 'UNIT', unitPrice: marmitaProduct.price + extraTotal }]);
    setMarmitaProduct(null);
    showToast('success', 'Marmita adicionada ao pedido.');
  };

  const removeFromCart = (productId: string, index?: number) => {
    setCart((prev) => {
      if (typeof index === 'number') {
        const target = prev[index];
        if (!target) return prev;
        if (target.quantity > 1 && !target.notes) {
          return prev.map((item, i) => i === index ? { ...item, quantity: item.quantity - 1 } : item);
        }
        return prev.filter((_, i) => i !== index);
      }

      const existing = prev.find((i) => i.product.id === productId);
      if (existing && existing.quantity > 1 && !existing.notes) {
        return prev.map((i) => i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter((i) => i.product.id !== productId);
    });
  };

  const openOrderModal = () => {
    if (!currentCash) {
      showToast('error', 'Abra o caixa antes de lançar pedidos.');
      return;
    }
    setCart([]);
    setCustomerName('');
    setMarmitaProduct(null);
    setConfirmDiscardOrder(false);
    setOrderIdempotencyKey(createIdempotencyKey());
    setShowAddItems(true);
  };

  const resetOrderModal = () => {
    setOrderError(null);
    setCart([]);
    setCustomerName('');
    setMarmitaProduct(null);
    setConfirmDiscardOrder(false);
    setShowAddItems(false);
    setOrderIdempotencyKey('');
    orderSubmittingRef.current = false;
  };

  const handleCloseOrderModal = () => {
    if (cart.length > 0) {
      setConfirmDiscardOrder(true);
      return;
    }

    resetOrderModal();
  };

  const handleSendToKitchen = async () => {
    if (orderSubmittingRef.current) return;
    if (!selectedTable || cart.length === 0) return;
    try {
      orderSubmittingRef.current = true;
      setSaving(true);
      setOrderError(null);
      const idempotencyKey = orderIdempotencyKey || createIdempotencyKey();
      setOrderIdempotencyKey(idempotencyKey);
      await api.post('/orders', {
        idempotencyKey,
        type: 'DINE_IN',
        tableId: selectedTable.id,
        customerName: customerName.trim() || undefined,
        items: cart.map((item) => {
          const weight = getPayloadWeight(item);
          return {
            productId: item.product.id,
            quantity: item.quantity,
            ...(weight !== undefined ? { weight } : {}),
            notes: item.notes,
            unitPrice: getItemUnitPrice(item),
            saleType: item.saleType,
          };
        }),
      }, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });
      resetOrderModal();
      await fetchTables();
      const refreshed = selectedTable ? { ...selectedTable, status: 'OCCUPIED' as const } : selectedTable;
      if (refreshed) {
        setSelectedTable(refreshed);
        await fetchTableOrders(refreshed);
      }
      showToast('success', 'Pedido enviado com sucesso.');
    } catch (error) {
      console.error(error);
      setOrderError(orderErrorMessage(error));
      void fetchTables();
    } finally {
      orderSubmittingRef.current = false;
      setSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelingOrderId || !selectedTable) return;
    try {
      setSaving(true);
      await api.patch(`/orders/${cancelingOrderId}/status`, { status: 'CANCELED' });
      setCancelingOrderId(null);
      await fetchTables();
      await fetchTableOrders(selectedTable);
      showToast('success', 'Pedido cancelado com sucesso.');
    } catch (error) {
      console.error(error);
      showToast('error', 'Erro ao cancelar pedido.');
    } finally {
      setSaving(false);
    }
  };

  const currentCategoryProducts = categories.find(c => c.id === selectedCategory)?.products || [];
  const cartTotal = useMemo(() => cart.reduce((sum, item) => {
    if (item.product.isByWeight) return sum + (item.product.price * (item.weight || 0)) / 1000;
    return sum + item.product.price * item.quantity;
  }, 0), [cart]);

  const isCashOpen = !!currentCash;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>;

  return (
    <div className="flex flex-col xl:flex-row h-full gap-6">
      {toast && (
        <div className={clsx('fixed top-4 right-4 z-[70] rounded-xl px-4 py-3 shadow-lg text-white', toast.type === 'success' ? 'bg-green-600' : 'bg-red-600')}>
          {toast.message}
        </div>
      )}

      <div className="xl:w-72 xl:flex-shrink-0 min-w-0">
        {!isCashOpen && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Caixa fechado. O garçom não pode lançar pedidos.</div>}
        <h2 className="text-lg font-bold text-gray-900 mb-4">Mesas</h2>
        <div className="xl:space-y-2 flex xl:block gap-3 overflow-x-auto pb-2 xl:pb-0">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => handleSelectTable(table)}
              className={clsx(
                'text-left px-4 py-3 rounded-xl border-2 transition-all bg-white min-w-[160px] xl:min-w-0 xl:w-full',
                selectedTable?.id === table.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300',
                table.status === 'OCCUPIED' && selectedTable?.id !== table.id && 'border-yellow-300 bg-yellow-50'
              )}
            >
              <p className="font-bold">Mesa {table.number}</p>
              <p className="text-xs text-gray-500">{table.status === 'AVAILABLE' ? 'Disponível' : table.status === 'OCCUPIED' ? 'Ocupada' : 'Fechada'}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {!selectedTable ? (
          <div className="card text-center py-16 text-gray-400">
            <p>Selecione uma mesa para ver os detalhes.</p>
          </div>
        ) : (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold">Mesa {selectedTable.number}</h2>
                <p className="text-sm text-gray-500">
                  {selectedTable.status === 'AVAILABLE' ? 'Mesa disponível' : selectedTable.status === 'OCCUPIED' ? 'Mesa ocupada' : 'Mesa fechada'}
                </p>
              </div>
              {selectedTable.status !== 'CLOSED' && (
                <button onClick={openOrderModal} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto">
                  <Plus size={18} /> {selectedTable.status === 'AVAILABLE' ? 'Novo Pedido' : 'Adicionar Itens'}
                </button>
              )}
            </div>

            {selectedTable.status === 'AVAILABLE' ? (
              <div className="card text-center py-8 text-gray-400 space-y-4">
                <p>Mesa disponível. Você já pode lançar um novo pedido.</p>
                <div>
                  <button onClick={openOrderModal} className="btn-primary w-full sm:w-auto">Novo Pedido</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {tableOrders.length === 0 ? (
                  <div className="card text-center py-8 text-gray-400"><p>Nenhum pedido ativo nesta mesa.</p></div>
                ) : (
                  tableOrders.map((order) => (
                    <div key={order.id} className="card">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                        <div>
                          <p className="font-bold">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                          <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>
                          {order.customerName && (
                            <p className="text-sm text-amber-700 font-medium mt-1">Responsável: {order.customerName}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`badge ${statusColors[order.status]}`}>{statusLabels[order.status]}</span>
                          {order.status === 'NEW' && (
                            <>
                              <button onClick={() => setEditingOrder(order)} className="btn-secondary px-3 py-2 text-sm flex items-center gap-2">
                                <Edit size={14} /> Editar
                              </button>
                              <button onClick={() => setCancelingOrderId(order.id)} className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 flex items-center gap-2">
                                <XCircle size={14} /> Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between gap-3 text-sm py-1 border-b last:border-0">
                          <span className="min-w-0">{item.product?.isByWeight ? `${Number(item.weight || 0).toFixed(0)}g` : `${item.quantity}x`} {item.product?.name}</span>
                          <span className="text-gray-500 shrink-0">{formatCurrencyBRL(item.price)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold mt-2 pt-2">
                        <span>Total</span>
                        <span>{formatCurrencyBRL(order.total)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddItems && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <h2 className="text-lg md:text-xl font-bold">{selectedTable?.status === 'AVAILABLE' ? 'Novo Pedido' : 'Adicionar Itens'} - Mesa {selectedTable?.number}</h2>
              <button onClick={handleCloseOrderModal} className="btn-secondary p-2">✕</button>
            </div>
            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nome da pessoa na mesa
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="input w-full"
                    placeholder="Ex.: João da mesa 4"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Esse nome ajuda a identificar a conta se a mesa ficar com dívida em aberto.
                  </p>
                </div>
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {categories.map((cat) => (
                    <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                      className={clsx('px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap', selectedCategory === cat.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                      {cat.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentCategoryProducts.map((product) => (
                    <button key={product.id} disabled={!productAvailable(product)} onClick={() => addToCart(product)}
                      className="text-left p-3 border rounded-xl enabled:hover:border-primary-400 enabled:hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <p className="font-medium">{product.name}</p>
                      {!productAvailable(product) && <span className="text-xs font-semibold text-red-700">Sem estoque</span>}
                      <p className="text-primary-600 font-bold mt-1">{product.isByWeight && getCategoryForProduct(product)?.isMealCategory ? `Peso ${formatCurrencyBRL(getCategoryForProduct(product)?.pricePerKg || product.price)}/kg` : `${formatCurrencyBRL(product.price)}${product.isByWeight ? '/kg' : ''}`}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex flex-col bg-gray-50">
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[180px] lg:min-h-0">
                  {cart.length === 0 && <p className="text-center text-gray-400 text-sm mt-8">Carrinho vazio</p>}
                  {cart.map((item, index) => (
                    <div key={`${item.product.id}-${index}`} className="flex flex-col gap-2 bg-white rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.product.name}</p>
                          <p className="text-xs text-gray-500">
                            {item.product.isByWeight ? `${formatCurrencyBRL(getItemUnitPrice(item))}/kg` : formatCurrencyBRL(getItemTotal(item))}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!item.product.isByWeight && !item.notes && (
                            <>
                              <button onClick={() => removeFromCart(item.product.id, index)} className="p-1 rounded hover:bg-gray-100"><Minus size={14} /></button>
                              <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                              <button disabled={!productAvailable(item.product)} onClick={() => addToCart(item.product)} className="p-1 rounded hover:bg-gray-100"><Plus size={14} /></button>
                            </>
                          )}
                          <button onClick={() => removeFromCart(item.product.id, index)} className="p-1 rounded hover:bg-red-100 text-red-500"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      {item.product.isByWeight && (
                        <div className="space-y-2">
                          {getCategoryForProduct(item.product)?.isMealCategory && (
                            <select
                              className="input py-1 text-xs"
                              value={item.saleType || 'WEIGHT'}
                              onChange={(e) => {
                                const saleType = e.target.value as 'WEIGHT' | 'SELF_SERVICE';
                                const category = getCategoryForProduct(item.product);
                                updateCartItem(index, {
                                  saleType,
                                  unitPrice: saleType === 'SELF_SERVICE'
                                    ? Number(category?.selfServicePricePerKg ?? item.product.price)
                                    : Number(category?.pricePerKg ?? item.product.price),
                                });
                              }}
                            >
                              <option value="WEIGHT">Por peso</option>
                              <option value="SELF_SERVICE">Self-service</option>
                            </select>
                          )}
                          <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Peso (g)"
                            className="input py-1 text-xs"
                            value={item.weight || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateCartItem(index, { weight: val });
                            }}
                          />
                          <span className="text-xs font-bold text-primary-600 whitespace-nowrap">{formatCurrencyBRL(getItemTotal(item))}</span>
                        </div>
                        </div>
                      )}
                      {item.notes && (
                        <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg leading-relaxed border border-gray-200 whitespace-pre-line">
                          {item.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t bg-white">
                  <div className="flex justify-between font-bold text-lg mb-3">
                    <span>Total</span>
                    <span>{formatCurrencyBRL(cartTotal)}</span>
                  </div>
                  {orderError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{orderError}</p>}
                  <button onClick={handleSendToKitchen} disabled={cart.length === 0 || saving} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    {saving ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Confirmando...
                      </>
                    ) : (
                      <>
                        <Send size={18} /> Enviar para Cozinha
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDiscardOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900">Descartar pedido em andamento?</h3>
            <p className="text-sm text-gray-500 mt-2">
              Os itens e dados preenchidos neste pedido serao removidos.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmDiscardOrder(false)}
                className="btn-secondary flex-1 py-3"
              >
                Cancelar
              </button>

              <button
                onClick={resetOrderModal}
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
          options={marmitaMenuItems}
          onClose={() => setMarmitaProduct(null)}
          onConfirm={addMarmitaToCart}
        />
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          categories={categories}
          onClose={() => setEditingOrder(null)}
          onSave={async () => {
            setEditingOrder(null);
            await fetchTables();
            if (selectedTable) await fetchTableOrders(selectedTable);
            showToast('success', 'Pedido atualizado com sucesso.');
          }}
        />
      )}

      {cancelingOrderId && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900">Cancelar pedido</h3>
            <p className="text-sm text-gray-500 mt-2">Tem certeza que deseja cancelar este pedido? Só pedidos seus e com status novo podem ser cancelados.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCancelingOrderId(null)} disabled={saving} className="btn-secondary flex-1 py-3">Voltar</button>
              <button onClick={handleCancelOrder} disabled={saving} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                {saving ? 'Cancelando...' : 'Cancelar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaiterTablesPage;
