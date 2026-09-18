import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { Order, Category } from '../../types';
import { Edit, XCircle } from 'lucide-react';
import { EditOrderModal } from '../../components/modals/EditOrderModal';
import { ORDER_STATUS_BADGE_CLASSES, ORDER_STATUS_LABELS } from '../../constants/orders';
import { formatCurrencyBRL } from '../../utils/currency';

const statusLabels = ORDER_STATUS_LABELS;
const statusColors = ORDER_STATUS_BADGE_CLASSES;

const WaiterHistoryPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrders = async () => {
    try {
      const [ordersRes, categoriesRes] = await Promise.all([
        api.get('/orders?myOrders=true'),
        api.get('/categories?includeProducts=true'),
      ]);
      setOrders(ordersRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCancelOrder = async () => {
    if (!cancelingOrderId) return;
    try {
      setActionLoading(true);
      await api.patch(`/orders/${cancelingOrderId}/status`, { status: 'CANCELED' });
      setCancelingOrderId(null);
      await fetchOrders();
    } catch (error) {
      console.error(error);
      alert('Erro ao cancelar pedido.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Meu Histórico</h1>
        <p className="text-gray-500">Todos os pedidos que você atendeu</p>
      </div>
      <div className="space-y-4">
        {orders.length === 0 && (
          <div className="card text-center py-12 text-gray-400">
            <p>Nenhum pedido encontrado.</p>
          </div>
        )}
        {orders.map((order) => (
          <div key={order.id} className="card">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="font-bold">#{order.id.slice(-6).toUpperCase()}</p>
                <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>
                {order.waiter && <p className="text-xs font-medium text-primary-600">Garçom: {order.waiter.name}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`badge ${statusColors[order.status]}`}>{statusLabels[order.status]}</span>
                {order.status === 'NEW' && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => setEditingOrder(order)} className="btn-secondary px-3 py-2 text-sm flex items-center gap-2">
                      <Edit size={14} /> Editar
                    </button>
                    <button onClick={() => setCancelingOrderId(order.id)} className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 flex items-center gap-2">
                      <XCircle size={14} /> Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
            {order.table && <p className="text-sm text-gray-600 mb-2">Mesa {order.table.number}</p>}
            <div className="space-y-1">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm text-gray-600">
                  <span>{item.quantity}x {item.product?.name}</span>
                  <span>{formatCurrencyBRL(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span>{formatCurrencyBRL(order.total)}</span>
            </div>
          </div>
        ))}
      </div>
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          categories={categories}
          onClose={() => setEditingOrder(null)}
          onSave={async () => {
            setEditingOrder(null);
            await fetchOrders();
          }}
        />
      )}

      {cancelingOrderId && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900">Cancelar pedido</h3>
            <p className="text-sm text-gray-500 mt-2">Tem certeza que deseja cancelar este pedido? Só pedidos seus e com status novo podem ser cancelados.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setCancelingOrderId(null)} disabled={actionLoading} className="btn-secondary flex-1 py-3">Voltar</button>
              <button onClick={handleCancelOrder} disabled={actionLoading} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                {actionLoading ? 'Cancelando...' : 'Cancelar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaiterHistoryPage;
