import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import type { PayableAccount, Supplier } from '../../types';
import {
  Plus,
  CheckCircle,
  AlertTriangle,
  CalendarDays,
  Wallet,
  Receipt,
  X,
  Search,
  Pencil,
  Trash2,
  Filter,
} from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';

type FilterStatus = 'ALL' | 'PENDING' | 'PAID' | 'OVERDUE';

const emptyForm = {
  description: '',
  amount: '',
  dueDate: '',
  supplierId: '',
};

const PayablesPage: React.FC = () => {
  const [payables, setPayables] = useState<PayableAccount[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingPayable, setEditingPayable] = useState<PayableAccount | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [payableToDelete, setPayableToDelete] = useState<PayableAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    try {
      const [payablesRes, suppliersRes] = await Promise.all([
        api.get('/finance/payables'),
        api.get('/suppliers'),
      ]);
      setPayables(payablesRes.data);
      setSuppliers(suppliersRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const isOverdue = (dueDate: string, paid?: boolean) => {
    if (paid) return false;

    const today = new Date();
    const due = new Date(dueDate);

    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);

    return due < today;
  };

  const handleOpenModal = (payable?: PayableAccount) => {
    if (payable) {
      setEditingPayable(payable);
      setForm({
        description: payable.description || '',
        amount: String(payable.amount ?? ''),
        dueDate: payable.dueDate ? new Date(payable.dueDate).toISOString().split('T')[0] : '',
        supplierId: payable.supplierId || '',
      });
    } else {
      setEditingPayable(null);
      setForm(emptyForm);
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount || !form.dueDate) return;

    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        supplierId: form.supplierId || null,
      };

      if (editingPayable) {
        await api.put(`/finance/payables/${editingPayable.id}`, payload);
      } else {
        await api.post('/finance/payables', payload);
      }

      setShowModal(false);
      setEditingPayable(null);
      setForm(emptyForm);
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleMarkAsPaid = async (id: string) => {
    try {
      await api.patch(`/finance/payables/${id}/pay`);
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleOpenDeleteModal = (payable: PayableAccount) => {
    setPayableToDelete(payable);
    setDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setPayableToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!payableToDelete) return;

    try {
      setDeleting(true);
      await api.delete(`/finance/payables/${payableToDelete.id}`);
      setDeleteModalOpen(false);
      setPayableToDelete(null);
      fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  const pending = payables.filter((p) => !p.paid);
  const paid = payables.filter((p) => p.paid);
  const overdue = payables.filter((p) => isOverdue(p.dueDate, p.paid));

  const totalPending = pending.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const totalPaid = paid.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const totalOverdue = overdue.reduce((acc, item) => acc + Number(item.amount || 0), 0);

  const filteredPayables = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return payables
      .filter((item) => {
        if (statusFilter === 'PENDING') return !item.paid;
        if (statusFilter === 'PAID') return !!item.paid;
        if (statusFilter === 'OVERDUE') return isOverdue(item.dueDate, item.paid);
        return true;
      })
      .filter((item) => {
        if (!normalizedSearch) return true;

        const description = normalizeText(item.description || '');
        const supplierName = normalizeText(item.supplier?.name || '');

        return (
          description.includes(normalizedSearch) ||
          supplierName.includes(normalizedSearch)
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.dueDate).getTime();
        const dateB = new Date(b.dueDate).getTime();
        return dateA - dateB;
      });
  }, [payables, search, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas a Pagar</h1>
          <p className="text-gray-500">
            Cadastre canhotos, boletos, cobranças e despesas do estabelecimento
          </p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Nova Conta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Receipt className="text-amber-600" size={22} />
            </div>
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              Pendentes
            </span>
          </div>
          <p className="text-sm text-gray-500">Total em aberto</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrencyBRL(totalPending)}
          </p>
          <p className="text-xs text-gray-400 mt-2">{pending.length} conta(s)</p>
        </div>

        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center">
              <AlertTriangle className="text-red-600" size={22} />
            </div>
            <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
              Vencidas
            </span>
          </div>
          <p className="text-sm text-gray-500">Precisam de atenção</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrencyBRL(totalOverdue)}
          </p>
          <p className="text-xs text-gray-400 mt-2">{overdue.length} conta(s)</p>
        </div>

        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="w-11 h-11 rounded-2xl bg-green-100 flex items-center justify-center">
              <Wallet className="text-green-600" size={22} />
            </div>
            <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              Pagas
            </span>
          </div>
          <p className="text-sm text-gray-500">Total já quitado</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrencyBRL(totalPaid)}
          </p>
          <p className="text-xs text-gray-400 mt-2">{paid.length} conta(s)</p>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Lançamentos financeiros
              </h2>
              <p className="text-sm text-gray-500">
                Filtre, pesquise, edite, exclua e marque contas como pagas
              </p>
            </div>

            <span className="text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-full px-3 py-1.5">
              {filteredPayables.length} resultado(s)
            </span>
          </div>

          <div className="mt-4 flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Buscar por descrição ou fornecedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 mr-1">
                <Filter size={16} />
                Filtro:
              </span>

              <button
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-xl px-3 py-2 text-sm font-medium border transition ${
                  statusFilter === 'ALL'
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Todas
              </button>

              <button
                onClick={() => setStatusFilter('PENDING')}
                className={`rounded-xl px-3 py-2 text-sm font-medium border transition ${
                  statusFilter === 'PENDING'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Pendentes
              </button>

              <button
                onClick={() => setStatusFilter('PAID')}
                className={`rounded-xl px-3 py-2 text-sm font-medium border transition ${
                  statusFilter === 'PAID'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Pagas
              </button>

              <button
                onClick={() => setStatusFilter('OVERDUE')}
                className={`rounded-xl px-3 py-2 text-sm font-medium border transition ${
                  statusFilter === 'OVERDUE'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Vencidas
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="bg-white border-b">
              <tr>
                <th className="text-left px-5 py-4 text-sm font-semibold text-gray-600">
                  Descrição
                </th>
                <th className="text-left px-5 py-4 text-sm font-semibold text-gray-600">
                  Fornecedor
                </th>
                <th className="text-left px-5 py-4 text-sm font-semibold text-gray-600">
                  Vencimento
                </th>
                <th className="text-left px-5 py-4 text-sm font-semibold text-gray-600">
                  Status
                </th>
                <th className="text-left px-5 py-4 text-sm font-semibold text-gray-600">
                  Pago em
                </th>
                <th className="text-right px-5 py-4 text-sm font-semibold text-gray-600">
                  Valor
                </th>
                <th className="text-right px-5 py-4 text-sm font-semibold text-gray-600">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredPayables.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-gray-400">
                    Nenhuma conta encontrada com esse filtro.
                  </td>
                </tr>
              )}

              {filteredPayables.map((p) => {
                const overdueItem = isOverdue(p.dueDate, p.paid);

                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-gray-50 transition ${
                      overdueItem ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            p.paid
                              ? 'bg-green-100'
                              : overdueItem
                              ? 'bg-red-100'
                              : 'bg-primary-50'
                          }`}
                        >
                          {p.paid ? (
                            <CheckCircle className="text-green-600" size={18} />
                          ) : overdueItem ? (
                            <AlertTriangle className="text-red-600" size={18} />
                          ) : (
                            <Receipt className="text-primary-600" size={18} />
                          )}
                        </div>

                        <div>
                          <p
                            className={`font-semibold ${
                              p.paid ? 'text-gray-700 line-through' : 'text-gray-900'
                            }`}
                          >
                            {p.description}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Lançamento financeiro
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {p.supplier?.name || 'Sem fornecedor'}
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={14} />
                        {new Date(p.dueDate).toLocaleDateString('pt-BR')}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {p.paid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 text-xs font-medium">
                          <CheckCircle size={12} /> Paga
                        </span>
                      ) : overdueItem ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 text-xs font-medium">
                          <AlertTriangle size={12} /> Vencida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 text-xs font-medium">
                          <Receipt size={12} /> Pendente
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {p.paidAt
                        ? new Date(p.paidAt).toLocaleDateString('pt-BR')
                        : '-'}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <span className="font-bold text-gray-900">
                        {formatCurrencyBRL(p.amount)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {!p.paid && (
                          <button
                            onClick={() => handleMarkAsPaid(p.id)}
                            className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-white font-medium hover:bg-green-700 transition"
                            title="Marcar como paga"
                          >
                            <CheckCircle size={16} />
                            Pagar
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenModal(p)}
                          className="btn-secondary p-2"
                          title="Editar conta"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleOpenDeleteModal(p)}
                          className="btn-danger p-2"
                          title="Excluir conta"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100">
            <div className="flex items-start justify-between p-6 border-b bg-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingPayable ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Cadastre boletos, canhotos e cobranças manuais
                </p>
              </div>

              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingPayable(null);
                  setForm(emptyForm);
                }}
                className="rounded-xl p-2 text-gray-400 hover:bg-white hover:text-gray-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Descrição *
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input"
                  placeholder="Ex: Canhoto da distribuidora, boleto de bebidas..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Valor (R$) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="input"
                    placeholder="0,00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Vencimento *
                  </label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Fornecedor
                </label>
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  className="input"
                >
                  <option value="">Nenhum</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  Use esta área para cadastrar contas que chegam em papel,
                  canhoto, boleto ou cobrança manual.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button onClick={handleSave} className="btn-primary flex-1">
                {editingPayable ? 'Salvar alterações' : 'Salvar conta'}
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingPayable(null);
                  setForm(emptyForm);
                }}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-red-100 overflow-hidden">
            <div className="flex items-start justify-between p-6 pb-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
                  <AlertTriangle className="text-red-600" size={28} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900">Excluir conta</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Esta ação não poderá ser desfeita.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseDeleteModal}
                disabled={deleting}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 pb-2">
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                <p className="text-sm text-gray-700">
                  Você está prestes a excluir a conta{' '}
                  <span className="font-semibold text-gray-900">
                    {payableToDelete?.description}
                  </span>
                  .
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-5">
              <button
                onClick={handleCloseDeleteModal}
                disabled={deleting}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayablesPage;
