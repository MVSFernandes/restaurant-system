import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { StockItem, Supplier } from '../../types';
import { TrendingDown, Plus } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';

interface SupplierPrice {
  supplierId: string;
  supplierName: string;
  price: number;
  isCheapest: boolean;
}

interface StockItemWithPrices extends StockItem {
  supplierPrices: SupplierPrice[];
}

const SupplierComparisonPage: React.FC = () => {
  const [items, setItems] = useState<StockItemWithPrices[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ stockItemId: '', supplierId: '', price: '' });

  const fetchData = async () => {
    try {
      const [compRes, suppRes, stockRes] = await Promise.all([
        api.get('/suppliers/comparison'),
        api.get('/suppliers'),
        api.get('/stock'),
      ]);
      setItems(compRes.data);
      setSuppliers(suppRes.data);
      setStockItems(stockRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    if (!form.stockItemId || !form.supplierId || !form.price) return;
    try {
      await api.post('/suppliers/price', { ...form, price: parseFloat(form.price) });
      setShowModal(false);
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comparação de Fornecedores</h1>
          <p className="text-gray-500">Veja qual fornecedor oferece o menor preço por insumo</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Registrar Preço
        </button>
      </div>

      <div className="space-y-4">
        {items.length === 0 && (
          <div className="card text-center py-12 text-gray-400">
            <TrendingDown size={48} className="mx-auto mb-3 opacity-50" />
            <p>Nenhum preço registrado. Comece adicionando preços de fornecedores.</p>
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="card">
            <h3 className="font-bold text-gray-900 mb-3">{item.name} ({item.unit})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {item.supplierPrices.map((sp) => (
                <div key={sp.supplierId} className={`p-3 rounded-xl border-2 ${sp.isCheapest ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                  <p className="text-sm font-medium text-gray-700">{sp.supplierName}</p>
                  <p className={`text-xl font-bold mt-1 ${sp.isCheapest ? 'text-green-600' : 'text-gray-900'}`}>
                    {formatCurrencyBRL(sp.price)}
                  </p>
                  {sp.isCheapest && (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1 mt-1">
                      <TrendingDown size={12} /> Mais barato
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Registrar Preço de Fornecedor</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insumo *</label>
                <select value={form.stockItemId} onChange={(e) => setForm({ ...form, stockItemId: e.target.value })} className="input">
                  <option value="">Selecione...</option>
                  {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor *</label>
                <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="input">
                  <option value="">Selecione...</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
                <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleSave} className="btn-primary flex-1">Salvar</button>
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierComparisonPage;
