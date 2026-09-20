import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { Supplier } from '../../types';
import { Plus, Pencil, Trash2, Truck } from 'lucide-react';
import { EmailIcon, PhoneIcon } from '../../components/ui/icons';

const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', contact: '', phone: '', email: '' });

  const fetchSuppliers = async () => {
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setForm({ name: supplier.name, contact: supplier.contact || '', phone: supplier.phone || '', email: supplier.email || '' });
    } else {
      setEditingSupplier(null);
      setForm({ name: '', contact: '', phone: '', email: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, form);
      } else {
        await api.post('/suppliers', form);
      }
      setShowModal(false);
      fetchSuppliers();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este fornecedor?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      fetchSuppliers();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fornecedores</h1>
          <p className="text-gray-500">Gerencie seus fornecedores</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Novo Fornecedor
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.length === 0 && (
          <div className="col-span-full card text-center py-12 text-gray-400">
            <Truck size={48} className="mx-auto mb-3 opacity-50" />
            <p>Nenhum fornecedor cadastrado.</p>
          </div>
        )}
        {suppliers.map((supplier) => (
          <div key={supplier.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Truck className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{supplier.name}</p>
                  {supplier.contact && <p className="text-xs text-gray-500">{supplier.contact}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleOpenModal(supplier)} className="btn-secondary p-1.5"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(supplier.id)} className="btn-danger p-1.5"><Trash2 size={14} /></button>
              </div>
            </div>
            {supplier.phone && <p className="text-sm text-gray-600"><PhoneIcon aria-hidden="true" className="mr-1 inline-block align-text-bottom" size={16} /> {supplier.phone}</p>}
            {supplier.email && <p className="text-sm text-gray-600"><EmailIcon aria-hidden="true" className="mr-1 inline-block align-text-bottom" size={16} /> {supplier.email}</p>}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contato</label>
                <input type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
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

export default SuppliersPage;
