import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import type { MarmitaMenuItem } from '../../types';
import { Plus, Trash2, Pencil, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { clsx } from 'clsx';

const days = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

const groups = [
  { value: 'GUARNICAO', label: 'Guarnições' },
  { value: 'CARNE', label: 'Opções de Carnes' },
  { value: 'EXTRA', label: 'Extras / Adicionais' },
];

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const emptyForm = {
  name: '',
  group: 'GUARNICAO',
};

// Puxa o dia atual de acordo com o fuso de SP, retornando de 0 a 6
const getCurrentWeekDay = () => {
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[day] ?? 1;
};

const MarmitaMenuPage: React.FC = () => {
  // Inicia o estado no dia atual
  const [selectedDay, setSelectedDay] = useState(getCurrentWeekDay());
  const [items, setItems] = useState<MarmitaMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchItems = useCallback(async (day: number) => {
    try {
      setLoading(true);
      const res = await api.get(`/marmita-menu/day/${day}`);
      setItems(res.data || []);
    } catch (error) {
      console.error('Erro ao carregar itens da marmita:', error);
      showToast('error', 'Erro ao carregar itens da marmita.');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchItems(selectedDay);
  }, [fetchItems, selectedDay]);

  const groupedItems = useMemo(() => {
    return groups.map((group) => ({
      ...group,
      items: items.filter((item) => item.group === group.value && item.isActive !== false),
    }));
  }, [items]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingItemId(null);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showToast('error', 'Digite o nome do item.');
      return;
    }

    try {
      const payload = {
        dayOfWeek: selectedDay,
        name: form.name.trim(),
        group: form.group,
        price: 0,
        sortOrder: 0,
      };

      if (editingItemId) {
        await api.patch(`/marmita-menu/${editingItemId}`, payload);
        showToast('success', 'Item atualizado com sucesso.');
      } else {
        await api.post('/marmita-menu', payload);
        showToast('success', 'Item adicionado com sucesso.');
      }

      resetForm();
      fetchItems(selectedDay);
    } catch (error) {
      console.error('Erro ao salvar item:', error);
      showToast('error', 'Erro ao salvar item.');
    }
  };

  const handleEdit = (item: MarmitaMenuItem) => {
    setEditingItemId(item.id);
    setForm({
      name: item.name,
      group: item.group,
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/marmita-menu/${id}`);
      showToast('success', 'Item removido com sucesso.');
      fetchItems(selectedDay);
    } catch (error) {
      console.error('Erro ao excluir item:', error);
      showToast('error', 'Erro ao excluir item.');
    }
  };

  return (
    <div>
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
              {toast.type === 'success' ? (
                <CheckCircle size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-current/70 hover:text-current"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cardápio da Marmita</h1>
          <p className="text-gray-500">Cadastre os alimentos disponíveis por dia da semana</p>
        </div>

        <div className="w-full md:w-72">
          <select
            value={selectedDay}
            onChange={(e) => {
              setSelectedDay(Number(e.target.value));
              resetForm();
            }}
            className="input"
          >
            {days.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {editingItemId ? 'Editar item' : 'Novo item'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Nome do item (ex: Arroz Branco, Filé de Frango...)"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="input"
          />

          <select
            value={form.group}
            onChange={(e) => setForm((prev) => ({ ...prev, group: e.target.value }))}
            className="input"
          >
            {groups.map((group) => (
              <option key={group.value} value={group.value}>
                {group.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={handleSubmit} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            {editingItemId ? 'Salvar Alterações' : 'Adicionar Item'}
          </button>

          {editingItemId && (
            <button onClick={resetForm} className="btn-secondary">
              Cancelar Edição
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12 text-gray-500">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groupedItems.map((group) => (
            <div key={group.value} className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">{group.label}</h3>

              {group.items.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum item nessa categoria.</p>
              ) : (
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="border rounded-xl px-4 py-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarmitaMenuPage;