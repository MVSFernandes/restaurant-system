import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { Order } from '../../types';
import { MapPin, Phone, FileText, CheckCircle } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';

const DeliveryPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('READY');

  const fetchOrders = async () => {
    try {
      const { data } = await api.get(`/orders?status=${filter}&type=DELIVERY`);
      setOrders(data);
    } catch (error) {
      console.error('Erro ao carregar pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [filter]);

  const handleMarkDelivered = async (orderId: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'DELIVERED' });
      fetchOrders();
    } catch (error) {
      console.error('Erro ao marcar como entregue:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Entregas</h1>
        <p className="text-gray-500">Gerencie as entregas de delivery</p>
      </div>

      <div className="flex gap-2 mb-6">
        {['READY', 'IN_PROGRESS', 'DELIVERED'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === status
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status === 'READY' ? 'Pronto para Entrega' : status === 'IN_PROGRESS' ? 'Em Entrega' : 'Entregues'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {orders.length === 0 ? (
          <div className="col-span-full card text-center py-12 text-gray-400">
            <FileText size={48} className="mx-auto mb-3 opacity-50" />
            <p>Nenhum pedido para esta situação.</p>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="card border-2 border-primary-200 bg-gradient-to-br from-blue-50 to-white">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</h2>
                  <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  order.status === 'READY' ? 'bg-yellow-100 text-yellow-800' :
                  order.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {order.status === 'READY' ? 'Pronto' : order.status === 'IN_PROGRESS' ? 'Em Entrega' : 'Entregue'}
                </span>
              </div>

              {/* Endereço */}
              <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                <div className="flex items-start gap-3">
                  <MapPin className="text-primary-600 flex-shrink-0 mt-1" size={20} />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {order.deliveryStreet}, {order.deliveryNumber}
                    </p>
                    {order.deliveryNeighborhood && (
                      <p className="text-sm text-gray-600">{order.deliveryNeighborhood}</p>
                    )}
                    {order.deliveryReference && (
                      <p className="text-sm text-gray-500 italic">Ref: {order.deliveryReference}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Telefone */}
              {order.deliveryPhone && (
                <div className="flex items-center gap-3 mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <Phone className="text-green-600" size={20} />
                  <a href={`tel:${order.deliveryPhone}`} className="font-medium text-green-700 hover:underline">
                    {order.deliveryPhone}
                  </a>
                </div>
              )}

              {/* Itens */}
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Itens:</h3>
                <div className="space-y-1">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm text-gray-700">
                      <span>
                        {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.product?.name}
                        {item.weight ? ` (${(item.weight/1000).toFixed(3)}kg)` : ''}
                      </span>
                      <span className="font-medium">{formatCurrencyBRL(item.price)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center mb-4 p-3 bg-primary-50 rounded-lg border border-primary-200">
                <span className="font-bold text-gray-900">Total:</span>
                <span className="text-xl font-bold text-primary-600">{formatCurrencyBRL(order.total)}</span>
              </div>

              {/* Observações */}
              {order.deliveryNotes && (
                <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm font-medium text-yellow-900">Observações:</p>
                  <p className="text-sm text-yellow-800">{order.deliveryNotes}</p>
                </div>
              )}

              {/* Ações */}
              {order.status !== 'DELIVERED' && (
                <button
                  onClick={() => handleMarkDelivered(order.id)}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} />
                  Marcar como Entregue
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DeliveryPage;
