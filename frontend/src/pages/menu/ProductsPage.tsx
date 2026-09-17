import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { Product, Category, StockItem, ProductStockLink } from '../../types';
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Link2,
  X,
  AlertTriangle,
} from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';

interface LinkFormRow {
  stockItemId: string;
  quantity: string;
}

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    imageUrl: '',
    isByWeight: false,
  });

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingProduct, setLinkingProduct] = useState<Product | null>(null);
  const [linkRows, setLinkRows] = useState<LinkFormRow[]>([]);
  const [savingLinks, setSavingLinks] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, stockRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/stock'),
      ]);

      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setStockItems(stockRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setForm({
        name: product.name,
        description: product.description || '',
        price: String(product.price),
        categoryId: product.categoryId,
        imageUrl: product.imageUrl || '',
        isByWeight: product.isByWeight || false,
      });
    } else {
      setEditingProduct(null);
      setForm({
        name: '',
        description: '',
        price: '',
        categoryId: categories[0]?.id || '',
        imageUrl: '',
        isByWeight: false,
      });
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price || !form.categoryId) return;

    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
      } else {
        await api.post('/products', payload);
      }

      setShowModal(false);
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleOpenDeleteModal = (product: Product) => {
    setProductToDelete(product);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;

    try {
      setDeleting(true);
      await api.delete(`/products/${productToDelete.id}`);
      setDeleteModalOpen(false);
      setProductToDelete(null);
      fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  const handleCloseDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setProductToDelete(null);
  };

  const handleOpenLinkModal = async (product: Product) => {
    try {
      setLinkingProduct(product);

      const { data } = await api.get<ProductStockLink[]>(
        `/product-stock-links/product/${product.id}`
      );

      if (data.length > 0) {
        setLinkRows(
          data.map((link) => ({
            stockItemId: link.stockItemId,
            quantity: String(link.quantity),
          }))
        );
      } else {
        setLinkRows([{ stockItemId: '', quantity: '1' }]);
      }

      setShowLinkModal(true);
    } catch (error) {
      console.error(error);
      setLinkingProduct(product);
      setLinkRows([{ stockItemId: '', quantity: '1' }]);
      setShowLinkModal(true);
    }
  };

  const handleAddLinkRow = () => {
    setLinkRows((prev) => [...prev, { stockItemId: '', quantity: '1' }]);
  };

  const handleRemoveLinkRow = (index: number) => {
    setLinkRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeLinkRow = (
    index: number,
    field: keyof LinkFormRow,
    value: string
  ) => {
    setLinkRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleSaveLinks = async () => {
    if (!linkingProduct) return;

    const cleanedLinks = linkRows
      .filter((row) => row.stockItemId && Number(row.quantity) > 0)
      .map((row) => ({
        stockItemId: row.stockItemId,
        quantity: Number(row.quantity),
      }));

    try {
      setSavingLinks(true);

      await api.put(`/product-stock-links/product/${linkingProduct.id}`, {
        links: cleanedLinks,
      });

      setShowLinkModal(false);
      setLinkingProduct(null);
      setLinkRows([]);
      fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setSavingLinks(false);
    }
  };

  const getStockLinkLabel = (product: Product) => {
    const totalLinks = product.stockItems?.length || 0;

    if (totalLinks > 0) {
      return (
        <p className="text-xs mt-1 font-medium text-green-600">
          🔗 {totalLinks} vínculo{totalLinks > 1 ? 's' : ''} com estoque
        </p>
      );
    }

    return (
      <p className="text-xs mt-1 font-medium text-amber-600">
        ⚠️ Sem vínculo de estoque
      </p>
    );
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          <p className="text-gray-500">Gerencie os produtos do cardápio</p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Novo Produto
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.length === 0 && (
          <div className="col-span-full card text-center py-12 text-gray-400">
            <Package size={48} className="mx-auto mb-3 opacity-50" />
            <p>Nenhum produto cadastrado.</p>
          </div>
        )}

        {products.map((product) => (
          <div key={product.id} className="card overflow-hidden p-0">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-40 object-cover"
              />
            ) : (
              <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                <Package className="text-gray-300" size={48} />
              </div>
            )}

            <div className="p-4">
              <p className="font-semibold text-gray-900">{product.name}</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-2 line-clamp-2">
                {product.description}
              </p>

              <div className="flex items-center justify-between mb-2">
                <span className="text-primary-600 font-bold">
                  {formatCurrencyBRL(product.price)}
                  {product.isByWeight ? '/kg' : ''}
                </span>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(product)}
                    className="btn-secondary p-1.5"
                    title="Editar produto"
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    onClick={() => handleOpenDeleteModal(product)}
                    className="btn-danger p-1.5"
                    title="Excluir produto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-1">{product.category?.name}</p>

              {getStockLinkLabel(product)}

              <button
                onClick={() => handleOpenLinkModal(product)}
                className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <Link2 size={16} />
                Vincular estoque
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingProduct ? 'Editar Produto' : 'Novo Produto'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input"
                  rows={2}
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preço (R$) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="input"
                  />
                </div>

                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isByWeight}
                      onChange={(e) =>
                        setForm({ ...form, isByWeight: e.target.checked })
                      }
                      className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Vendido por KG
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoria *
                </label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="input"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL da Imagem
                </label>
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  className="input"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={handleSave} className="btn-primary flex-1">
                Salvar
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-red-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between p-6 pb-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
                  <AlertTriangle className="text-red-600" size={28} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-gray-900">Excluir produto</h2>
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
                  Você está prestes a excluir o produto{' '}
                  <span className="font-semibold text-gray-900">
                    {productToDelete?.name}
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

      {showLinkModal && linkingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Vincular estoque</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Produto: <span className="font-semibold">{linkingProduct.name}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Defina quais insumos serão baixados a cada venda desse produto.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowLinkModal(false);
                  setLinkingProduct(null);
                  setLinkRows([]);
                }}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {linkRows.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-3 items-end border rounded-xl p-3"
                >
                  <div className="col-span-7">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Insumo
                    </label>
                    <select
                      value={row.stockItemId}
                      onChange={(e) =>
                        handleChangeLinkRow(index, 'stockItemId', e.target.value)
                      }
                      className="input"
                    >
                      <option value="">Selecione um insumo</option>
                      {stockItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.quantity} {item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) =>
                        handleChangeLinkRow(index, 'quantity', e.target.value)
                      }
                      className="input"
                    />
                  </div>

                  <div className="col-span-2">
                    <button
                      onClick={() => handleRemoveLinkRow(index)}
                      className="w-full rounded-xl border border-red-200 text-red-600 px-3 py-2 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddLinkRow}
              className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              + Adicionar vínculo
            </button>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveLinks}
                disabled={savingLinks}
                className="btn-primary flex-1"
              >
                {savingLinks ? 'Salvando...' : 'Salvar vínculos'}
              </button>

              <button
                onClick={() => {
                  setShowLinkModal(false);
                  setLinkingProduct(null);
                  setLinkRows([]);
                }}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
