import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import type { Order, Role, User } from '../../types';
import { clsx } from 'clsx';
import {
  Search,
  UserPlus,
  ClipboardList,
  Users,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ORDER_STATUS_BADGE_CLASSES, ORDER_STATUS_LABELS } from '../../constants/orders';
import { formatCurrencyBRL } from '../../utils/currency';

const statusLabels = ORDER_STATUS_LABELS;
const statusColors = ORDER_STATUS_BADGE_CLASSES;

const roleOptions: Array<{ value: Role; label: string; description: string }> = [
  {
    value: 'WAITER',
    label: 'Garçom',
    description: 'Pode lançar pedidos e visualizar apenas o histórico dos pedidos feitos por ele.',
  },
  {
    value: 'CASHIER',
    label: 'Caixa',
    description: 'Responsável por pagamentos e conferência dos pedidos no atendimento.',
  },
  {
    value: 'FINANCE',
    label: 'Financeiro',
    description: 'Pode acompanhar informações financeiras e relatórios do sistema.',
  },
  {
    value: 'ADMIN',
    label: 'Administrador',
    description: 'Acesso total para gerenciar o sistema, os usuários e acompanhar todos os pedidos.',
  },
];

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const roleLabel = (role: Role) => roleOptions.find((item) => item.value === role)?.label || role;

const WaitersManagementPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterWaiterId, setFilterWaiterId] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'WAITER' as Role });
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', role: 'WAITER' as Role });

  const selectedRole = roleOptions.find((role) => role.value === form.role) || roleOptions[0];
  const selectedEditRole = roleOptions.find((role) => role.value === editForm.role) || roleOptions[0];

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch (error) {
      console.error(error);
      showToast('error', 'Não foi possível carregar os logins criados.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams();
      if (filterWaiterId) params.set('waiterId', filterWaiterId);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString();
      const { data } = await api.get(`/orders${qs ? `?${qs}` : ''}`);
      setOrders(data);
    } catch (error) {
      console.error(error);
      showToast('error', 'Não foi possível carregar o log de pedidos.');
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    setLoadingOrders(true);
    fetchOrders();
  }, [filterWaiterId]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;

    return orders.filter((order) => {
      const waiterName = order.waiter?.name?.toLowerCase() || '';
      const cashierName = order.user?.name?.toLowerCase() || '';
      const customerName = order.customerName?.toLowerCase() || '';
      const tableNumber = order.table?.number ? `mesa ${order.table.number}` : '';
      const items = order.items.map((item) => item.product?.name?.toLowerCase() || '').join(' ');
      return [waiterName, cashierName, customerName, tableNumber, items].some((value) => value.includes(term));
    });
  }, [orders, search]);

  const waiterUsers = useMemo(() => users.filter((user) => user.role === 'WAITER'), [users]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/users', form);
      setForm({ name: '', email: '', password: '', role: 'WAITER' });
      await fetchUsers();
      showToast('success', 'Login criado com sucesso.');
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || 'Erro ao criar usuário.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (user: User) => {
    setEditingUserId(user.id);
    setEditForm({ name: user.name, email: user.email, password: '', role: user.role });
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditForm({ name: '', email: '', password: '', role: 'WAITER' });
  };

  const handleUpdateUser = async (userId: string) => {
    try {
      await api.put(`/users/${userId}`, editForm);
      await fetchUsers();
      cancelEditing();
      showToast('success', 'Login atualizado com sucesso.');
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || 'Erro ao atualizar usuário.');
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmed = window.confirm(`Deseja realmente excluir o login de ${user.name}?`);
    if (!confirmed) return;

    setDeleteLoadingId(user.id);
    try {
      await api.delete(`/users/${user.id}`);
      await fetchUsers();
      showToast('success', 'Login excluído com sucesso.');
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || 'Erro ao excluir usuário.');
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const waiterOrderTotals = useMemo(() => {
    return filteredOrders.reduce<Record<string, { count: number; total: number }>>((acc, order) => {
      const key = order.waiter?.name || 'Sem garçom';
      if (!acc[key]) acc[key] = { count: 0, total: 0 };
      acc[key].count += 1;
      acc[key].total += order.total || 0;
      return acc;
    }, {});
  }, [filteredOrders]);

  const topWaiters = Object.entries(waiterOrderTotals)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="space-y-6">
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
              {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-current/70 hover:text-current">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Garçons e log de pedidos</h1>
        <p className="text-gray-500">Cadastre funcionários, veja os logins criados e acompanhe com clareza quem lançou cada pedido.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="space-y-6 xl:col-span-1">
          <div className="card">
            <div className="flex items-center gap-2 mb-5">
              <UserPlus size={20} className="text-primary-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Criar login</h2>
                <p className="text-sm text-gray-500">Preencha os dados do funcionário.</p>
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: João Silva"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="joao@empresa.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo de 4 caracteres"
                  required
                  minLength={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de acesso</label>
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>

                <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50 p-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck size={18} className="text-primary-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{selectedRole.label}</p>
                      <p className="text-sm text-gray-600">{selectedRole.description}</p>
                    </div>
                  </div>
                </div>
              </div>

              <button disabled={submitting} className="btn-primary w-full">
                {submitting ? 'Salvando...' : 'Criar login'}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-primary-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Logins criados</h3>
                <p className="text-sm text-gray-500">Edite ou exclua os usuários cadastrados.</p>
              </div>
            </div>

            {loadingUsers ? (
              <p className="text-sm text-gray-500">Carregando...</p>
            ) : (
              <div className="space-y-3 max-h-[34rem] overflow-y-auto pr-1">
                {users.length === 0 && <p className="text-sm text-gray-500">Nenhum login cadastrado.</p>}

                {users.map((user) => {
                  const isEditing = editingUserId === user.id;

                  return (
                    <div key={user.id} className="rounded-2xl border border-gray-200 p-3 bg-white space-y-3">
                      {isEditing ? (
                        <div className="space-y-3">
                          <input
                            className="input"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            placeholder="Nome"
                          />
                          <input
                            type="email"
                            className="input"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            placeholder="Email"
                          />
                          <input
                            type="password"
                            className="input"
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                            placeholder="Nova senha (opcional)"
                          />
                          <select
                            className="input"
                            value={editForm.role}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                          >
                            {roleOptions.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500">{selectedEditRole.description}</p>
                          <div className="flex gap-2">
                            <button type="button" className="btn-primary flex-1" onClick={() => handleUpdateUser(user.id)}>
                              Salvar
                            </button>
                            <button type="button" className="btn-secondary flex-1" onClick={cancelEditing}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-gray-900">{user.name}</p>
                                <p className="text-sm text-gray-500 break-all">{user.email}</p>
                              </div>
                              <span className="badge badge-gray">{roleLabel(user.role)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" className="btn-secondary flex-1 inline-flex items-center justify-center gap-2" onClick={() => startEditing(user)}>
                              <Pencil size={16} />
                              Editar
                            </button>
                            <button
                              type="button"
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                              onClick={() => handleDeleteUser(user)}
                              disabled={deleteLoadingId === user.id}
                            >
                              <Trash2 size={16} />
                              {deleteLoadingId === user.id ? 'Excluindo...' : 'Excluir'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card xl:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={20} className="text-primary-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Log de pedidos</h2>
              <p className="text-sm text-gray-500">Busque por garçom e veja exatamente quem lançou cada pedido.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div className="md:col-span-2 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-10"
                placeholder="Buscar por garçom, mesa, cliente ou item"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input" value={filterWaiterId} onChange={(e) => setFilterWaiterId(e.target.value)}>
              <option value="">Todos os garçons</option>
              {waiterUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {topWaiters.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {topWaiters.map(([name, info]) => (
                <div key={name} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Garçom</p>
                  <p className="text-lg font-semibold text-gray-900 truncate">{name}</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{info.count}</p>
                      <p className="text-xs text-gray-500">pedidos</p>
                    </div>
                    <p className="text-sm font-semibold text-primary-600">{formatCurrencyBRL(info.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loadingOrders ? (
            <p className="text-sm text-gray-500">Carregando pedidos...</p>
          ) : (
            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {filteredOrders.length === 0 && (
                <div className="text-center py-10 text-gray-400">Nenhum pedido encontrado para este filtro.</div>
              )}

              {filteredOrders.map((order) => (
                <div key={order.id} className="border border-gray-200 rounded-2xl p-5 bg-white">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div>
                        <p className="text-lg font-bold text-gray-900">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                        <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <p className="text-gray-500">Garçom</p>
                          <p className="font-semibold text-gray-900">{order.waiter?.name || 'Não informado'}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <p className="text-gray-500">Lançado por</p>
                          <p className="font-semibold text-gray-900">{order.user?.name || 'Sistema'}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <p className="text-gray-500">Mesa</p>
                          <p className="font-semibold text-gray-900">{order.table ? `Mesa ${order.table.number}` : 'Sem mesa'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start md:items-end gap-3">
                      <span className={`badge ${statusColors[order.status]}`}>{statusLabels[order.status]}</span>
                      <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-left md:text-right min-w-[130px]">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
                        <p className="text-xl font-bold text-gray-900">{formatCurrencyBRL(order.total)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Itens do pedido</p>
                    <div className="space-y-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl bg-gray-50 px-3 py-2 text-sm">
                          <div>
                            <p className="font-medium text-gray-900">{item.quantity}x {item.product?.name}</p>
                            {item.notes && <p className="text-gray-500 mt-1">{item.notes}</p>}
                          </div>
                          <span className="font-semibold text-gray-700 whitespace-nowrap">{formatCurrencyBRL(item.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WaitersManagementPage;
