import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { Table } from '../../types';
import { clsx } from 'clsx';
import { useToast } from '../../components/ui';
import { Users, Plus, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const statusConfig = {
  AVAILABLE: { label: 'Disponível', color: 'bg-green-100 border-green-300 text-green-800', dot: 'bg-green-500' },
  OCCUPIED: { label: 'Ocupada', color: 'bg-yellow-100 border-yellow-300 text-yellow-800', dot: 'bg-yellow-500' },
};

// Situação que a tela não conhece: a mesa aparece, neutra e sem ações, em vez
// de derrubar a tela inteira.
const unknownStatus = { label: 'Situação desconhecida', color: 'bg-surface-sunken border-default text-muted', dot: 'bg-fill-neutral' };

const getStatusConfig = (status: string) =>
  statusConfig[status as keyof typeof statusConfig] ?? unknownStatus;

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

const getErrorMessage = (error: unknown, fallback: string) =>
  (error as ApiError).response?.data?.message || fallback;

const TablesPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingTable, setClosingTable] = useState(false);
  const [cashClosed, setCashClosed] = useState(false);
  const [cashCheckLoading, setCashCheckLoading] = useState(true);

  const fetchTables = async () => {
    try {
      const { data } = await api.get('/tables');
      setTables(data);
    } catch (error) {
      console.error('Erro ao carregar mesas:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkCashStatus = async () => {
    try {
      const { data } = await api.get('/cash-register/current').catch(() => ({ data: null }));
      setCashClosed(!data || data.status !== 'OPEN');
    } catch (error) {
      console.error('Erro ao verificar status do caixa:', error);
      setCashClosed(true);
    } finally {
      setCashCheckLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
    checkCashStatus();
    const interval = setInterval(checkCashStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleTableClick = (table: Table) => {
    setSelectedTable(table);
    setShowCloseConfirm(false);
    setShowModal(true);
  };

  const handleOpenTable = async () => {
    // Com o caixa fechado o botão já fica desabilitado e o aviso aparece no topo.
    if (!selectedTable || cashClosed) return;
    try {
      await api.patch(`/tables/${selectedTable.id}/status`, { status: 'OCCUPIED' });
      await fetchTables();
      setShowModal(false);
    } catch (error) {
      console.error('Erro ao abrir mesa:', error);
    }
  };

  const handleCloseTable = async () => {
    if (!selectedTable) return;

    try {
      setClosingTable(true);

      await api.patch(`/tables/${selectedTable.id}/status`, { status: 'AVAILABLE' });
      await fetchTables();

      setShowCloseConfirm(false);
      setShowModal(false);
    } catch (error) {
      // A recusa do backend (ex.: pedido ativo na mesa) precisa chegar ao operador.
      setShowCloseConfirm(false);
      toast({
        title: 'Não foi possível fechar a mesa',
        description: getErrorMessage(error, 'Tente novamente em alguns instantes.'),
        variant: 'error',
      });
    } finally {
      setClosingTable(false);
    }
  };

  if (loading || cashCheckLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {cashClosed && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <div className="text-red-600 mt-0.5">!</div>
          <div>
            <p className="font-semibold text-red-900">Caixa Fechado</p>
            <p className="text-sm text-red-700">Nao e possivel abrir mesas ou criar pedidos enquanto o caixa estiver fechado. Abra o caixa para continuar.</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mesas</h1>
          <p className="text-gray-500">Gerencie as mesas do restaurante</p>
        </div>
        <div className="flex gap-4 text-sm">
          {Object.entries(statusConfig).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${val.dot}`}></span>
              <span className="text-gray-600">{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {tables.map((table) => {
          const config = getStatusConfig(table.status);
          return (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={clsx(
                'relative p-6 rounded-xl border-2 text-center transition-all hover:shadow-md hover:scale-105',
                config.color
              )}
            >
              <Users size={28} className="mx-auto mb-2 opacity-70" />
              <p className="text-2xl font-bold">Mesa {table.number}</p>
              <p className="text-xs mt-1 font-medium">{config.label}</p>
            </button>
          );
        })}
      </div>

      {showModal && selectedTable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Mesa {selectedTable.number}</h2>
            <p className="text-gray-500 mb-6">
              Status: <span className="font-medium">{getStatusConfig(selectedTable.status).label}</span>
            </p>

            <div className="space-y-3">
              {selectedTable.status === 'AVAILABLE' && (
                <button onClick={handleOpenTable} disabled={cashClosed} className={`btn-primary w-full py-3 flex items-center justify-center gap-2 ${cashClosed ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <Plus size={18} />
                  Abrir Mesa
                </button>
              )}
              {selectedTable.status === 'OCCUPIED' && (
                <>
                  <button
                    onClick={() => { setShowModal(false); navigate(`/pdv/orders?tableId=${encodeURIComponent(selectedTable.id)}`); }}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    Adicionar Pedido
                  </button>
                  <button onClick={() => setShowCloseConfirm(true)} className="btn-danger w-full py-3 flex items-center justify-center gap-2">
                    <CheckCircle size={18} />
                    Fechar Mesa
                  </button>
                </>
              )}
              <button onClick={() => { setShowCloseConfirm(false); setShowModal(false); }} className="btn-secondary w-full py-3 flex items-center justify-center gap-2">
                <XCircle size={18} />
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseConfirm && selectedTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-red-100 overflow-hidden">
            <div className="p-6 border-b border-red-100 bg-gradient-to-r from-red-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Fechar mesa</h3>
                  <p className="text-sm text-gray-500">Confirme para liberar a mesa para novos clientes.</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 mb-5">
                <p className="text-sm text-gray-500 mb-1">Mesa selecionada</p>
                <p className="text-2xl font-bold text-gray-900">Mesa {selectedTable.number}</p>
                <p className="text-sm text-gray-600 mt-1">Ao confirmar, a mesa será liberada para novos clientes.</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  disabled={closingTable}
                  className="btn-secondary flex-1 py-3"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCloseTable}
                  disabled={closingTable}
                  className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {closingTable ? 'Fechando...' : 'Sim, fechar mesa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TablesPage;
