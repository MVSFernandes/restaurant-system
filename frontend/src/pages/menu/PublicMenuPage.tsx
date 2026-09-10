import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import type { Category, Product, RestaurantConfig } from '../../types';
import { ShoppingCart, Plus, Minus, Trash2, X, UtensilsCrossed, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useMenuViewers } from '../../hooks/useMenuViewers';

interface CartItem { product: Product; quantity: number; }

const createIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const PublicMenuPage: React.FC = () => {
  useMenuViewers(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [config, setConfig] = useState<RestaurantConfig | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState('TAKE_AWAY');
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState('');
  const checkoutSubmittingRef = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, configRes] = await Promise.all([
          api.get('/categories?includeProducts=true'),
          api.get('/config'),
        ]);
        setCategories(catRes.data);
        setConfig(configRes.data);
        if (catRes.data.length > 0) setActiveCategory(catRes.data[0].id);
      } catch (error) {
        console.error(error);
      }
    };
    fetchData();
  }, []);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === productId);
      if (existing && existing.quantity > 1) return prev.map((i) => i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i);
      return prev.filter((i) => i.product.id !== productId);
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCheckout = async () => {
    if (checkoutSubmittingRef.current) return;
    if (cart.length === 0 || !customerName) return;
    try {
      checkoutSubmittingRef.current = true;
      setCheckoutSubmitting(true);
      const idempotencyKey = checkoutIdempotencyKey || createIdempotencyKey();
      // Cria ou busca o cliente
      await api.post('/orders/public', {
        idempotencyKey,
        customerName,
        customerPhone,
        type: orderType,
        paymentMethod,
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      }, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      });
      setOrderPlaced(true);
      setCart([]);
      setCheckoutIdempotencyKey('');
    } catch (error) {
      console.error(error);
    } finally {
      checkoutSubmittingRef.current = false;
      setCheckoutSubmitting(false);
    }
  };

  const currentProducts = categories.find(c => c.id === activeCategory)?.products || [];

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UtensilsCrossed className="text-green-600" size={40} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Pedido Realizado!</h2>
          <p className="text-gray-500 mb-6">Seu pedido foi enviado para a cozinha. Aguarde!</p>
          <button onClick={() => setOrderPlaced(false)} className="btn-primary w-full py-3">Fazer Novo Pedido</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="text-primary-600" size={28} />
            <div>
              <h1 className="font-bold text-gray-900">{config?.name || 'Restaurante'}</h1>
            </div>
          </div>
          <button
            onClick={() => {
              setCheckoutIdempotencyKey(createIdempotencyKey());
              setShowCart(true);
            }}
            className="relative btn-primary p-3"
          >
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Banner */}
      {config?.bannerUrl && (
        <div className="w-full h-48 overflow-hidden">
          <img src={config.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Categories */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={clsx('px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0',
                activeCategory === cat.id ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 border hover:border-primary-400')}>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products */}
      <div className="max-w-4xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentProducts.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400">
              <UtensilsCrossed size={48} className="mx-auto mb-3 opacity-20" />
              <p>Nenhum produto nesta categoria.</p>
            </div>
          ) : (
            currentProducts.map((product) => {
              const cartItem = cart.find((i) => i.product.id === product.id);
              return (
                <div key={product.id} className="bg-white rounded-xl shadow-sm overflow-hidden flex hover:shadow-md transition-shadow duration-200">
                  <div className="w-28 h-28 bg-gray-100 flex-shrink-0">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <UtensilsCrossed size={32} />
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 leading-tight">{product.name}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-primary-600 font-bold">R$ {product.price.toFixed(2)}{product.isByWeight ? '/kg' : ''}</span>
                      {cartItem ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => removeFromCart(product.id)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"><Minus size={14} /></button>
                          <span className="font-bold w-5 text-center text-sm">{cartItem.quantity}</span>
                          <button onClick={() => addToCart(product)} className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 transition-colors"><Plus size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(product)} className="btn-primary py-1.5 px-4 text-sm flex items-center gap-1 rounded-full shadow-sm">
                          <Plus size={14} /> Adicionar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Cart Drawer */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md flex flex-col h-full">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Seu Pedido</h2>
              <button onClick={() => setShowCart(false)}><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 && <p className="text-center text-gray-400 mt-8">Carrinho vazio</p>}
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-sm text-gray-500">R$ {(item.product.price * item.quantity).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => removeFromCart(item.product.id)} className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center"><Minus size={14} /></button>
                    <span className="font-bold">{item.quantity}</span>
                    <button onClick={() => addToCart(item.product)} className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center"><Plus size={14} /></button>
                    <button onClick={() => setCart(c => c.filter(i => i.product.id !== item.product.id))} className="w-7 h-7 text-red-500 hover:bg-red-50 rounded-full flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}

              {cart.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Seu nome *</label>
                    <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input" placeholder="João Silva" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                    <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="input" placeholder="(11) 99999-9999" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo do pedido</label>
                    <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="input">
                      <option value="TAKE_AWAY">Retirada no local</option>
                      <option value="DELIVERY">Entrega</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input">
                      <option value="PIX">PIX</option>
                      <option value="ON_PICKUP">Pagar na Retirada</option>
                      <option value="ON_DELIVERY">Pagar na Entrega</option>
                      <option value="CREDIT_CARD">Cartão de Crédito</option>
                      <option value="DEBIT_CARD">Cartão de Débito</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t">
                <div className="flex justify-between font-bold text-xl mb-4">
                  <span>Total</span>
                  <span>R$ {cartTotal.toFixed(2)}</span>
                </div>
                <button onClick={handleCheckout} disabled={!customerName || checkoutSubmitting} className="btn-primary w-full py-4 text-lg">
                  {checkoutSubmitting ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 size={18} className="animate-spin" />
                      Confirmando...
                    </span>
                  ) : (
                    'Finalizar Pedido'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicMenuPage;
