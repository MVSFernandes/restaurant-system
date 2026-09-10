import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import type { StockItem } from '../../types';
import { Plus, Pencil, Trash2, AlertTriangle, Bell, X, RefreshCw } from 'lucide-react';

import { useStockEvents } from '../../hooks/useStockEvents';

type StockLevel = 'NORMAL' | 'LOW' | 'CRITICAL';

const StockItemsPage: React.FC = () => {
  const [items, setItems] = useState<StockItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    quantity: '',
    unit: 'un',
    minQuantity: '0',
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestVersion = useRef(0);
  const fetchItems = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const [itemsRes, lowRes] = await Promise.all([
        api.get('/stock'),
        api.get('/stock/low'),
      ]);

      if (version === requestVersion.current) {
        setItems(itemsRes.data);
        setLowStockItems(lowRes.data);
      }
    } catch (error) {
      console.error('Erro ao buscar estoque:', error);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useStockEvents(fetchItems);

  useEffect(() => {
    fetchItems();
    return () => { requestVersion.current += 1; };
  }, [fetchItems]);

  const handleOpenModal = (item?: StockItem) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        quantity: String(item.quantity),
        unit: item.unit,
        minQuantity: String(item.minQuantity),
      });
    } else {
      setEditingItem(null);
      setForm({
        name: '',
        quantity: '',
        unit: 'un',
        minQuantity: '0',
      });
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.quantity) return;

    try {
      const payload = {
        ...form,
        quantity: parseFloat(form.quantity),
        minQuantity: parseFloat(form.minQuantity),
      };

      if (editingItem) {
        await api.put(`/stock/${editingItem.id}`, payload);
      } else {
        await api.post('/stock', payload);
      }

      setShowModal(false);
      fetchItems();
    } catch (error) {
      console.error('Erro ao salvar item de estoque:', error);
    }
  };

  const handleOpenDeleteModal = (item: StockItem) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      setDeleting(true);
      await api.delete(`/stock/${itemToDelete.id}`);
      setDeleteModalOpen(false);
      setItemToDelete(null);
      fetchItems();
    } catch (error) {
      console.error('Erro ao excluir item de estoque:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const getStockLevel = (item: StockItem): StockLevel => {
    const minimum = Number(item.minQuantity || 0);
    const quantity = Number(item.quantity || 0);

    if (minimum <= 0) {
      return quantity <= 0 ? 'CRITICAL' : 'NORMAL';
    }

    if (quantity <= minimum / 2) {
      return 'CRITICAL';
    }

    if (quantity <= minimum) {
      return 'LOW';
    }

    return 'NORMAL';
  };

  const getStockBadge = (item: StockItem) => {
    const level = getStockLevel(item);

    if (level === 'CRITICAL') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 text-xs font-medium">
          <AlertTriangle size={12} /> Crítico
        </span>
      );
    }

    if (level === 'LOW') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 px-2.5 py-1 text-xs font-medium">
          <AlertTriangle size={12} /> Baixo
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 text-xs font-medium">
        Normal
      </span>
    );
  };

  const criticalItems = items.filter((item) => getStockLevel(item) === 'CRITICAL');
  const warningItems = items.filter((item) => getStockLevel(item) === 'LOW');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
          <p className="text-gray-500">Controle de insumos e materiais</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => void fetchItems()} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={18} /> Atualizar
          </button>
          <div className="bg-white border rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
            <div className="relative">
              <Bell size={18} className="text-orange-600" />
              {lowStockItems.length > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] text-[11px] rounded-full bg-red-600 text-white flex items-center justify-center px-1">
                  {lowStockItems.length}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Alertas de estoque</p>
              <p className="text-xs text-gray-500">
                {lowStockItems.length === 0
                  ? 'Nenhum item em nível baixo'
                  : `${lowStockItems.length} item(ns) com atenção`}
              </p>
            </div>
          </div>

          <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Novo Insumo
          </button>
        </div>
      </div>

      {(criticalItems.length > 0 || warningItems.length > 0) && (
        <div className="mb-6 space-y-3">
          {criticalItems.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} className="text-red-600" />
                <h2 className="font-semibold text-red-700">Itens em nível crítico</h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {criticalItems.map((item) => (
                  <span
                    key={item.id}
                    className="px-3 py-1.5 rounded-full bg-white border border-red-200 text-sm text-red-700"
                  >
                    {item.name} ({item.quantity} {item.unit})
                  </span>
                ))}
              </div>
            </div>
          )}

          {warningItems.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} className="text-yellow-600" />
                <h2 className="font-semibold text-yellow-700">Itens com estoque baixo</h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {warningItems.map((item) => (
                  <span
                    key={item.id}
                    className="px-3 py-1.5 rounded-full bg-white border border-yellow-200 text-sm text-yellow-700"
                  >
                    {item.name} ({item.quantity} {item.unit})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Quantidade</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Unidade</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Mínimo</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Status</th>
              <th className="text-right px-4 py-3 text-sm font-semibold text-gray-600">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  Nenhum insumo cadastrado.
                </td>
              </tr>
            )}

            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                <td className="px-4 py-3 text-gray-600">{item.quantity}</td>
                <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                <td className="px-4 py-3 text-gray-600">{item.minQuantity}</td>
                <td className="px-4 py-3">{getStockBadge(item)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => handleOpenModal(item)} className="btn-secondary p-1.5">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleOpenDeleteModal(item)} className="btn-danger p-1.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingItem ? 'Editar Insumo' : 'Novo Insumo'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="input"
                  >
                    <option value="un">un</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="cx">cx</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estoque Mínimo
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minQuantity}
                  onChange={(e) => setForm({ ...form, minQuantity: e.target.value })}
                  className="input"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Quando a quantidade chegar nesse valor, o sistema começa a alertar.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={handleSave} className="btn-primary flex-1">
                Salvar
              </button>
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-red-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between p-6 pb-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
                  <AlertTriangle className="text-red-600" size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Excluir insumo</h2>
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
                  Você está prestes a excluir o insumo{' '}
                  <span className="font-semibold text-gray-900">
                    {itemToDelete?.name}
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

export default StockItemsPage;