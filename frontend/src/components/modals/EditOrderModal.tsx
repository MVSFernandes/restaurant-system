import React, { useState, useEffect, useMemo } from 'react';
import api from '../../services/api';
import type { Order, Product, Category, RestaurantConfig } from '../../types';
import { X, Plus, Minus, Tag, Trash2, DollarSign, Package } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';
import { DeliveryIcon, PickupIcon, TableIcon } from '../ui/icons';

interface EditOrderModalProps {
  order: Order;
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
}

interface ExtraItem {
  id: string;
  name: string;
  price: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  weight?: number;
  cleanNotes: string;
  extras: ExtraItem[];
  saleType?: 'UNIT' | 'WEIGHT' | 'SELF_SERVICE';
  baseUnitPrice: number;
  manualPrice?: number | ''; 
}

const getPayloadWeight = (item: Pick<CartItem, 'saleType' | 'weight'>) => {
  const weight = Number(item.weight);
  if (item.saleType === 'UNIT' || !Number.isFinite(weight) || weight <= 0) {
    return undefined;
  }
  return weight;
};

const parseNotesAndExtras = (originalNotes: string) => {
  const lines = (originalNotes || '').split('\n');
  const extras: ExtraItem[] = [];
  const cleanLines: string[] = [];

  for (let line of lines) {
    const trimmedLine = line.trim();
    
    // Novo formato padrão: [EXTRA] Nome | Valor
    const newFormatMatch = trimmedLine.match(/^\[EXTRA\]\s*(.+?)\s*\|\s*([\d.,]+)$/i);
    if (newFormatMatch) {
      extras.push({
        id: Math.random().toString(36).substring(2, 10),
        name: newFormatMatch[1].trim(),
        price: parseFloat(newFormatMatch[2].replace(',', '.')),
      });
      continue;
    }
    
    // Compatibilidade com formatos antigos
    const oldFormatMatch = trimmedLine.match(/^[-+]?\s*Extra:\s*(.+?)\s*\(?\s*R\$\s*([\d.,]+)\s*\)?$/i) || 
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

export const EditOrderModal: React.FC<EditOrderModalProps> = ({ order, categories, onClose, onSave }) => {
  const getCategoryForProduct = (product: Product) => categories.find((cat) => cat.id === product.categoryId);

  const [config, setConfig] = useState<RestaurantConfig | null>(null);
  
  const [cart, setCart] = useState<CartItem[]>(
    order.items.map((item) => {
      const { cleanNotes, extras } = parseNotesAndExtras(item.notes || '');
      const extraTotal = extras.reduce((sum, e) => sum + e.price, 0);
      const baseUnitPrice = extraTotal > 0 
        ? (item.unitPrice ?? item.price ?? 0) - extraTotal
        : (item.unitPrice ?? item.price ?? 0);

      return {
        product: item.product!,
        quantity: item.quantity,
        weight: item.weight,
        cleanNotes,
        extras,
        saleType: item.saleType || (item.product?.isByWeight ? 'WEIGHT' : 'UNIT'),
        baseUnitPrice: baseUnitPrice,
        manualPrice: (item as any).manualPrice !== null && (item as any).manualPrice !== undefined ? (item as any).manualPrice : '',
      };
    })
  );
  
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id || '');
  const [customerName, setCustomerName] = useState(order.customerName || '');
  const [deliveryType, setDeliveryType] = useState<'URBAN' | 'RURAL' | ''>((order.deliveryType as 'URBAN' | 'RURAL') || '');
  
  const [deliveryData, setDeliveryData] = useState({
    deliveryStreet: order.deliveryStreet || '',
    deliveryNumber: order.deliveryNumber || '',
    deliveryNeighborhood: order.deliveryNeighborhood || '',
    deliveryReference: order.deliveryReference || '',
    deliveryPhone: order.deliveryPhone || '',
    deliveryNotes: order.deliveryNotes || '',
  });
  
  const [loading, setLoading] = useState(false);
  const [extraForms, setExtraForms] = useState<Record<number, { name: string; price: string }>>({});

  useEffect(() => {
    api.get('/config')
      .then(res => setConfig(res.data))
      .catch(console.error);
  }, []);

  const currentCategoryProducts = categories.find((c) => c.id === selectedCategory)?.products || [];

  const buildCartItem = (product: Product): CartItem => {
    const category = getCategoryForProduct(product);
    const isMealByWeight = !!(product.isByWeight && category?.isMealCategory);
    
    let basePrice = Number(product.price);
    if (isMealByWeight) {
      basePrice = Number(category?.pricePerKg ?? product.price);
    }

    return {
      product,
      quantity: 1,
      weight: product.isByWeight ? 0 : undefined,
      cleanNotes: '',
      extras: [],
      saleType: isMealByWeight ? 'WEIGHT' : product.isByWeight ? 'WEIGHT' : 'UNIT',
      baseUnitPrice: basePrice,
      manualPrice: '',
    };
  };

  const getItemTotalWithExtras = (item: CartItem) => {
    const extraTotalPerUnit = item.extras.reduce((sum, e) => sum + e.price, 0);
    const isByWeight = !!item.product?.isByWeight;
    const multiplier = isByWeight ? (Number(item.weight || 0) / 1000) : Number(item.quantity || 1);

    let baseItemTotal = item.baseUnitPrice * multiplier;
    let extraItemTotal = extraTotalPerUnit * multiplier;

    if (item.manualPrice !== undefined && item.manualPrice !== null && item.manualPrice !== '') {
      baseItemTotal = Number(item.manualPrice);
      extraItemTotal = extraTotalPerUnit * (isByWeight ? 1 : item.quantity);
    }

    return baseItemTotal + extraItemTotal;
  };

  const updateCartItem = (index: number, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id && !i.cleanNotes && i.extras.length === 0 && i.manualPrice === '');
      if (existing && !product.isByWeight) {
        return prev.map((i) => (i.product.id === product.id && !i.cleanNotes && i.extras.length === 0 && i.manualPrice === '' ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, buildCartItem(product)];
    });
  };

  const removeFromCart = (productId: string, index?: number) => {
    setCart((prev) => {
      if (typeof index === 'number') {
        const target = prev[index];
        if (!target) return prev;
        if (target.quantity > 1 && !target.cleanNotes && target.extras.length === 0 && !target.product.isByWeight && target.manualPrice === '') {
          return prev.map((item, i) => (i === index ? { ...item, quantity: item.quantity - 1 } : item));
        }
        return prev.filter((_, i) => i !== index);
      }
      return prev.filter((i) => i.product.id !== productId);
    });
  };

  // Correção do Bug de Duplicar Extras
  const handleAddExtra = (index: number) => {
    const form = extraForms[index];
    if (!form || !form.name.trim()) return;

    const parsedPrice = form.price ? parseFloat(form.price.replace(',', '.')) : 0;
    if (isNaN(parsedPrice) || parsedPrice < 0) return;

    setCart((prevCart) =>
      prevCart.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          extras: [
            ...item.extras,
            {
              id: Math.random().toString(36).substring(2, 10),
              name: form.name.trim(),
              price: parsedPrice,
            },
          ],
        };
      })
    );

    setExtraForms((prevForms) => ({ ...prevForms, [index]: { name: '', price: '' } }));
  };

  const handleRemoveExtra = (itemIndex: number, extraId: string) => {
    setCart((prev) => prev.map((item, i) => {
      if (i !== itemIndex) return item;
      return {
        ...item,
        extras: item.extras.filter(e => e.id !== extraId)
      };
    }));
  };

  const currentDeliveryFee = useMemo(() => {
    if (order.type !== 'DELIVERY') return 0;
    if (deliveryType === 'URBAN') return Number(config?.urbanDeliveryFee || 1);
    if (deliveryType === 'RURAL') return Number(config?.ruralDeliveryFee || 3);
    return 0;
  }, [order.type, deliveryType, config]);

  const cartTotal = useMemo(() => {
    const itemsTotal = cart.reduce((sum, item) => sum + getItemTotalWithExtras(item), 0);
    return itemsTotal + currentDeliveryFee;
  }, [cart, currentDeliveryFee]);

  const handleSave = async () => {
    if (cart.length === 0) return alert('Adicione pelo menos um item no pedido.');
    if (order.type === 'DELIVERY' && (!customerName.trim() || !deliveryData.deliveryStreet.trim() || !deliveryData.deliveryNumber.trim() || !deliveryData.deliveryNeighborhood.trim() || !deliveryData.deliveryPhone.trim())) {
      return alert('Para entrega, preencha nome do cliente, rua, número, bairro e telefone.');
    }

    try {
      setLoading(true);
      await api.patch(`/orders/${order.id}`, {
        customerName: order.type === 'DELIVERY' || order.type === 'DINE_IN' || order.type === 'TAKE_AWAY' ? customerName : undefined,
        items: cart.map((item) => {
          const extraLines = item.extras.map(e => `[EXTRA] ${e.name} | ${e.price.toFixed(2)}`);
          const finalNotes = [
            item.cleanNotes,
            ...extraLines
          ].filter(Boolean).join('\n').trim();

          const weight = getPayloadWeight(item);

          return {
            productId: item.product.id,
            quantity: item.quantity,
            ...(weight !== undefined ? { weight } : {}),
            notes: finalNotes,
            unitPrice: item.baseUnitPrice + item.extras.reduce((sum, e) => sum + e.price, 0),
            manualPrice: item.manualPrice !== '' ? item.manualPrice : null,
            saleType: item.saleType,
          };
        }),
        ...deliveryData,
        deliveryType: order.type === 'DELIVERY' && deliveryType !== '' ? deliveryType : null,
        deliveryFee: order.type === 'DELIVERY' ? currentDeliveryFee : 0,
      });
      onSave();
      onClose();
    } catch (error) {
      console.error(error);
      alert('Erro ao atualizar pedido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh] relative">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-5 flex items-center justify-between rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Editar Pedido #{order.id.slice(-6).toUpperCase()}
            </h2>
            <p className="text-primary-100 mt-0.5 text-sm">
              {order.type === 'DINE_IN' ? <><TableIcon aria-hidden="true" className="mr-1 inline-block align-text-bottom" size={16} /> Consumo na Mesa</> : order.type === 'TAKE_AWAY' ? <><PickupIcon aria-hidden="true" className="mr-1 inline-block align-text-bottom" size={16} /> Retirada no Balcão</> : <><DeliveryIcon aria-hidden="true" className="mr-1 inline-block align-text-bottom" size={16} /> Entrega Delivery</>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-black/10 hover:bg-black/20 rounded-lg transition-colors text-white">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-gray-50/50">
          
          {/* Identificação Cliente/Mesa/Entrega (CORRIGIDO PARA NÃO FICAR BRANCO NO TAKE_AWAY) */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            {(order.type === 'DINE_IN' || order.type === 'TAKE_AWAY') && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  {order.type === 'DINE_IN' ? 'Nome na Mesa' : 'Nome do Cliente'}
                </label>
                <input
                  type="text"
                  placeholder={order.type === 'DINE_IN' ? 'Opcional. Ex: João da mesa 4' : 'Obrigatório. Ex: Maria'}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="input max-w-sm"
                />
              </div>
            )}

            {order.type === 'DELIVERY' && (
              <div className="space-y-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-2">
                  <Package size={16} className="text-primary-600" />
                  Dados da Entrega
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-md">
                  <button
                    onClick={() => setDeliveryType((prev) => (prev === 'URBAN' ? '' : 'URBAN'))}
                    className={`p-3 rounded-lg border transition-all text-left flex justify-between items-center ${
                      deliveryType === 'URBAN' ? 'border-primary-600 bg-primary-50 shadow-sm text-primary-800' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <span className="text-sm font-semibold">Urbana</span>
                    <span className="font-bold">{formatCurrencyBRL(config?.urbanDeliveryFee || 1)}</span>
                  </button>

                  <button
                    onClick={() => setDeliveryType((prev) => (prev === 'RURAL' ? '' : 'RURAL'))}
                    className={`p-3 rounded-lg border transition-all text-left flex justify-between items-center ${
                      deliveryType === 'RURAL' ? 'border-primary-600 bg-primary-50 shadow-sm text-primary-800' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <span className="text-sm font-semibold">Rural</span>
                    <span className="font-bold">{formatCurrencyBRL(config?.ruralDeliveryFee || 3)}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input type="text" placeholder="Nome do cliente *" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="input lg:col-span-2" />
                  <input type="tel" placeholder="Telefone *" value={deliveryData.deliveryPhone} onChange={(e) => setDeliveryData({ ...deliveryData, deliveryPhone: e.target.value })} className="input lg:col-span-2" />
                  <input type="text" placeholder="Rua *" value={deliveryData.deliveryStreet} onChange={(e) => setDeliveryData({ ...deliveryData, deliveryStreet: e.target.value })} className="input lg:col-span-2" />
                  <div className="grid grid-cols-2 gap-2 lg:col-span-2">
                    <input type="text" placeholder="Número *" value={deliveryData.deliveryNumber} onChange={(e) => setDeliveryData({ ...deliveryData, deliveryNumber: e.target.value })} className="input" />
                    <input type="text" placeholder="Bairro *" value={deliveryData.deliveryNeighborhood} onChange={(e) => setDeliveryData({ ...deliveryData, deliveryNeighborhood: e.target.value })} className="input" />
                  </div>
                  <input type="text" placeholder="Referência" value={deliveryData.deliveryReference} onChange={(e) => setDeliveryData({ ...deliveryData, deliveryReference: e.target.value })} className="input lg:col-span-2" />
                  <input type="text" placeholder="Observações da entrega" value={deliveryData.deliveryNotes} onChange={(e) => setDeliveryData({ ...deliveryData, deliveryNotes: e.target.value })} className="input lg:col-span-2" />
                </div>
              </div>
            )}
          </div>

          {/* Adicionar Produtos */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Plus size={16} className="text-primary-600" />
              Catálogo de Produtos
            </h3>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map((cat) => (
                <button 
                  key={cat.id} 
                  onClick={() => setSelectedCategory(cat.id)} 
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id 
                      ? 'bg-gray-800 text-white' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {currentCategoryProducts.map((product) => {
                const category = getCategoryForProduct(product);
                return (
                  <button 
                    key={product.id} 
                    onClick={() => addToCart(product)} 
                    className="bg-white border border-gray-200 p-3 rounded-xl hover:border-primary-400 hover:shadow-md transition-all text-left group flex flex-col justify-between"
                  >
                    <div>
                      <p className="font-bold text-gray-800 text-sm leading-tight group-hover:text-primary-700">{product.name}</p>
                    </div>
                    <p className="text-primary-600 font-bold mt-3 text-sm bg-primary-50 w-fit px-2 py-0.5 rounded-md">
                      {product.isByWeight && category?.isMealCategory 
                        ? `${formatCurrencyBRL(category.pricePerKg || product.price)}/kg`
                        : `${formatCurrencyBRL(product.price)}${product.isByWeight ? '/kg' : ''}`
                      }
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Carrinho (Itens do Pedido) */}
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Tag size={16} className="text-primary-600" />
              Itens no Pedido ({cart.length})
            </h3>
            
            {cart.length === 0 ? (
              <div className="text-center py-10 bg-white border border-gray-200 rounded-xl">
                <Package size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-400 text-sm font-medium">O pedido está vazio.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item, index) => {
                  const category = getCategoryForProduct(item.product);
                  return (
                    <div key={`${item.product.id}-${index}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                      
                      <div className="flex items-start justify-between mb-4 border-b border-gray-100 pb-3">
                        <div className="flex-1 pr-4">
                          <p className="font-bold text-gray-900 text-base">{item.product.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Base: <span className="font-medium text-gray-700">{formatCurrencyBRL(item.baseUnitPrice)}</span>
                            {item.product.isByWeight && <span>/kg</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block leading-none mb-1">Total Item</span>
                            <span className="text-lg font-black text-primary-600 leading-none">{formatCurrencyBRL(getItemTotalWithExtras(item))}</span>
                          </div>
                          <div className="w-px h-8 bg-gray-200"></div>
                          <button 
                            onClick={() => removeFromCart(item.product.id, index)} 
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                            title="Remover item"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-4 mb-4">
                        {item.product.isByWeight ? (
                          <>
                            {category?.isMealCategory && (
                              <div className="w-32">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Venda</label>
                                <select 
                                  className="input py-1.5 text-sm h-10" 
                                  value={item.saleType || 'WEIGHT'} 
                                  onChange={(e) => {
                                    const saleType = e.target.value as 'WEIGHT' | 'SELF_SERVICE';
                                    updateCartItem(index, { saleType, baseUnitPrice: saleType === 'SELF_SERVICE' ? Number(category.selfServicePricePerKg ?? item.product.price) : Number(category.pricePerKg ?? item.product.price) });
                                  }}
                                >
                                  <option value="WEIGHT">Por Peso</option>
                                  <option value="SELF_SERVICE">Self-Service</option>
                                </select>
                              </div>
                            )}
                            <div className="w-28">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Peso (g)</label>
                              <input 
                                type="number" 
                                placeholder="0" 
                                value={item.weight || ''} 
                                onChange={(e) => updateCartItem(index, { weight: parseFloat(e.target.value) || 0, manualPrice: '' })} 
                                className="input py-1.5 text-sm font-bold h-10"
                              />
                            </div>
                          </>
                        ) : (
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Quantidade</label>
                            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md h-10">
                              <button onClick={() => removeFromCart(item.product.id, index)} className="w-10 h-full flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded-l-md transition-colors"><Minus size={16} /></button>
                              <span className="w-12 text-center font-bold text-sm text-gray-900">{item.quantity}</span>
                              <button onClick={() => addToCart(item.product)} className="w-10 h-full flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded-r-md transition-colors"><Plus size={16} /></button>
                            </div>
                          </div>
                        )}

                        <div className="w-36">
                          <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Valor Fixo (R$)</label>
                          <input 
                            type="number" 
                            placeholder="Opcional" 
                            value={item.manualPrice !== undefined ? item.manualPrice : ''} 
                            onChange={(e) => {
                              const val = e.target.value ? parseFloat(e.target.value) : '';
                              updateCartItem(index, { manualPrice: val, weight: val !== '' ? 0 : item.weight });
                            }} 
                            className="input py-1.5 text-sm font-bold bg-orange-50 border-orange-200 focus:border-orange-400 placeholder:text-orange-400 text-orange-800 h-10"
                          />
                        </div>
                      </div>

                      {/* Observações e Extras lado a lado com respiro melhorado */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 border border-gray-100">
                        
                        <div className="flex flex-col h-full">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Observações</label>
                          <textarea 
                            placeholder="Ex: Sem cebola, caprichar no molho..." 
                            value={item.cleanNotes} 
                            onChange={(e) => updateCartItem(index, { cleanNotes: e.target.value })} 
                            className="input w-full resize-y text-sm p-3 flex-1 min-h-[140px] leading-relaxed"
                          />
                        </div>

                        <div className="flex flex-col h-full">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <DollarSign size={14} className="text-primary-500" /> Extras Manuais
                          </label>
                          
                          <div className="flex-1 overflow-y-auto space-y-1.5 mb-3 pr-1 max-h-[150px] min-h-[100px] scrollbar-hide">
                            {item.extras.length === 0 ? (
                              <div className="flex items-center justify-center h-full border-2 border-dashed border-gray-200 rounded-lg">
                                 <p className="text-[12px] text-gray-400 italic">Nenhum extra adicionado.</p>
                              </div>
                            ) : (
                              item.extras.map(extra => (
                                <div key={extra.id} className="flex justify-between items-center bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200">
                                  <span className="text-xs font-semibold text-gray-700 truncate mr-2">+ {extra.name}</span>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs font-bold text-primary-600">{formatCurrencyBRL(extra.price)}</span>
                                    <button onClick={() => handleRemoveExtra(index, extra.id)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded">
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          <form onSubmit={(e) => { e.preventDefault(); handleAddExtra(index); }} className="flex gap-2 mt-auto">
                            <input 
                              type="text" 
                              placeholder="Nome (ex: Ovo frito)" 
                              className="input py-2 px-3 text-xs flex-1 h-10" 
                              value={extraForms[index]?.name || ''} 
                              onChange={(e) => setExtraForms(prev => ({ ...prev, [index]: { ...(prev[index] || {}), name: e.target.value } }))} 
                            />
                            <input 
                              type="text" 
                              inputMode="decimal" 
                              placeholder="R$ 0,00"
                              className="input py-2 px-3 text-xs w-20 text-center h-10 font-medium" 
                              value={extraForms[index]?.price || ''} 
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d.,]/g, '');
                                setExtraForms(prev => ({ ...prev, [index]: { ...(prev[index] || {}), price: val } }));
                              }} 
                            />
                            <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white px-3 rounded-lg transition-colors h-10 flex items-center justify-center shrink-0 shadow-sm" title="Adicionar">
                              <Plus size={16} />
                            </button>
                          </form>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé Fixo */}
        <div className="bg-white border-t border-gray-200 p-5 shrink-0 rounded-b-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)]">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Total do Pedido</span>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-gray-900 leading-none">{formatCurrencyBRL(cartTotal)}</span>
              {currentDeliveryFee > 0 && <span className="text-xs text-primary-600 font-bold bg-primary-50 px-2 py-1 rounded-md border border-primary-100">(+ {formatCurrencyBRL(currentDeliveryFee)} taxa)</span>}
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button 
              onClick={onClose} 
              className="btn-secondary px-6 py-3 font-bold flex-1 sm:flex-none"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave} 
              disabled={loading} 
              className="btn-primary px-8 py-3 font-bold shadow-md flex-1 sm:flex-none disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
