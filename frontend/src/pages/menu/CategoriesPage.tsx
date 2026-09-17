import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { Category } from '../../types';
import { Plus, Pencil, Trash2, Tag, AlertTriangle, X } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';

const emptyForm = {
  name: '',
  isMealCategory: false,
  pricePerKg: '',
  selfServicePricePerKg: '',
};

const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCategories = async () => {
    try {
      const { data } = await api.get('/categories');
      setCategories(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setForm({
        name: category.name,
        isMealCategory: !!category.isMealCategory,
        pricePerKg: category.pricePerKg != null ? String(category.pricePerKg) : '',
        selfServicePricePerKg:
          category.selfServicePricePerKg != null ? String(category.selfServicePricePerKg) : '',
      });
    } else {
      setEditingCategory(null);
      setForm(emptyForm);
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;

    try {
      const payload = {
        name: form.name,
        isMealCategory: form.isMealCategory,
        pricePerKg:
          form.isMealCategory && form.pricePerKg !== '' ? Number(form.pricePerKg) : null,
        selfServicePricePerKg:
          form.isMealCategory && form.selfServicePricePerKg !== ''
            ? Number(form.selfServicePricePerKg)
            : null,
      };

      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, payload);
      } else {
        await api.post('/categories', payload);
      }

      setShowModal(false);
      fetchCategories();
    } catch (error) {
      console.error(error);
    }
  };

  const handleOpenDeleteModal = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;

    try {
      setDeleting(true);
      await api.delete(`/categories/${categoryToDelete.id}`);
      setDeleteModalOpen(false);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (error) {
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setCategoryToDelete(null);
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
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
          <p className="text-gray-500">Gerencie as categorias do cardápio</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nova Categoria
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {categories.length === 0 && (
          <div className="col-span-full card text-center py-12 text-gray-400">
            <Tag size={48} className="mx-auto mb-3 opacity-50" />
            <p>Nenhuma categoria cadastrada.</p>
          </div>
        )}

        {categories.map((category) => (
          <div key={category.id} className="card flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                <Tag className="text-primary-600" size={20} />
              </div>

              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{category.name}</p>

                {category.isMealCategory ? (
                  <div className="text-xs text-gray-500 mt-1 space-y-1">
                    <p>Categoria de refeição por peso</p>
                    <p>
                      Preço/kg:{' '}
                      <span className="font-semibold text-gray-700">
                        {formatCurrencyBRL(category.pricePerKg)}
                      </span>
                    </p>
                    <p>
                      Self-service/kg:{' '}
                      <span className="font-semibold text-gray-700">
                        {formatCurrencyBRL(category.selfServicePricePerKg)}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Categoria comum</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button onClick={() => handleOpenModal(category)} className="btn-secondary p-2">
                <Pencil size={16} />
              </button>
              <button
                onClick={() => handleOpenDeleteModal(category)}
                className="btn-danger p-2"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="Ex: Refeição por peso, Bebidas..."
                />
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isMealCategory}
                  onChange={(e) => setForm({ ...form, isMealCategory: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-gray-900">Categoria de refeição por peso</p>
                  <p className="text-sm text-gray-500">
                    Ative para cadastrar preço por kg e preço de self-service.
                  </p>
                </div>
              </label>

              {form.isMealCategory && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Preço por kg
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.pricePerKg}
                      onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })}
                      className="input"
                    placeholder="0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Preço self-service/kg
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.selfServicePricePerKg}
                      onChange={(e) =>
                        setForm({ ...form, selfServicePricePerKg: e.target.value })
                      }
                      className="input"
                    placeholder="0,00"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
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
                  <h2 className="text-xl font-bold text-gray-900">Excluir categoria</h2>
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
                  Você está prestes a excluir a categoria{' '}
                  <span className="font-semibold text-gray-900">
                    {categoryToDelete?.name}
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

export default CategoriesPage;
