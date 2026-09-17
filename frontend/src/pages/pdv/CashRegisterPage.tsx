import React, { useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  Lock,
  Unlock,
  Scissors,
  History,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  QrCode
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import type { CashRegisterSession, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';

interface PendingCloseOrder {
  id: string;
  type: OrderType;
  orderStatus: OrderStatus;
  total: number;
  paymentStatus: PaymentStatus | null;
  paymentMethod: PaymentMethod | null;
}

const orderStatusLabels: Record<OrderStatus, string> = {
  NEW: 'Novo',
  IN_PROGRESS: 'Em Preparo',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  FINISHED: 'Finalizado',
  CANCELED: 'Cancelado',
};

const paymentStatusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  FAILED: 'Falhou',
  REFUNDED: 'Estornado',
};

const paymentMethodLabels: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Crédito',
  DEBIT_CARD: 'Débito',
  CREDIT: 'Fiado',
};

const orderTypeLabels: Record<OrderType, string> = {
  DINE_IN: 'Mesa',
  TAKE_AWAY: 'Retirada',
  DELIVERY: 'Entrega',
};

const CashRegisterPage: React.FC = () => {
  const [current, setCurrent] = useState<CashRegisterSession | null>(null);
  const [history, setHistory] = useState<CashRegisterSession[]>([]);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [suggestedAmount, setSuggestedAmount] = useState<number | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [pendingCloseOrders, setPendingCloseOrders] = useState<PendingCloseOrder[]>([]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    try {
      const [currentRes, historyRes] = await Promise.all([
        api.get('/cash-register/current').catch(() => ({ data: null })),
        api.get('/cash-register/history').catch(() => ({ data: [] })),
      ]);

      setCurrent(currentRes.data || null);
      setHistory(historyRes.data || []);
    } catch (error) {
      console.error(error);
      showToast('error', 'Erro ao carregar caixa.');
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestedAmount = async () => {
    try {
      setLoadingSuggestion(true);
      const { data } = await api.get('/cash-register/suggest-withdrawal');
      setSuggestedAmount(Number(data.suggestedAmount || 0));

      if (Number(data.suggestedAmount || 0) > 0) {
        setWithdrawalAmount(String(data.suggestedAmount));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const withdrawalTotal = useMemo(
    () => (current?.withdrawals || []).reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [current]
  );

  const totalEntries = Number((current as any)?.totalEntries || 0);
  const pixTotal = Number((current as any)?.pixTotal || 0);
  const creditTotal = Number((current as any)?.creditTotal || 0);
  const debitTotal = Number((current as any)?.debitTotal || 0);
  const totalWithdrawals = Number((current as any)?.totalWithdrawals ?? withdrawalTotal ?? 0);
  const expectedBalance = Number((current as any)?.expectedBalance || 0);
  const typedClosingAmount = Number(closingAmount || 0);
  const closingDifference = typedClosingAmount - expectedBalance;


  const handleOpen = async () => {
    if (!openingAmount) return;

    try {
      setSaving(true);
      await api.post('/cash-register/open', {
        openingAmount: Number(openingAmount),
      });

      setOpeningAmount('');
      await fetchData();
      showToast('success', 'Caixa aberto com sucesso.');
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || 'Erro ao abrir caixa.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!closingAmount) return;

    try {
      setSaving(true);
      await api.post('/cash-register/close', {
        closingAmount: Number(closingAmount),
      });

      setClosingAmount('');
      await fetchData();
      showToast('success', 'Caixa fechado com sucesso.');
    } catch (error: any) {
      const responseData = error?.response?.data;
      const pendingOrders = responseData?.details?.pendingOrders;
      if (responseData?.code === 'CASH_REGISTER_PENDING_ORDERS' && Array.isArray(pendingOrders)) {
        setPendingCloseOrders(pendingOrders);
        showToast('error', responseData.message);
        return;
      }

      showToast('error', error?.response?.data?.message || 'Erro ao fechar caixa.');
    } finally {
      setSaving(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!withdrawalAmount || !withdrawalReason.trim()) return;

    try {
      setSaving(true);
      await api.post('/cash-register/withdrawals', {
        amount: Number(withdrawalAmount),
        reason: withdrawalReason,
      });

      setWithdrawalAmount('');
      setWithdrawalReason('');
      setSuggestedAmount(null);
      await fetchData();
      showToast('success', 'Sangria registrada com sucesso.');
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || 'Erro ao registrar sangria.');
    } finally {
      setSaving(false);
    }
  };

  const renderDifferenceBadge = (difference: number) => {
    if (difference === 0) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800 uppercase tracking-wide">
          <CheckCircle2 size={14} />
          Fechamento Exato
        </div>
      );
    }

    if (difference > 0) {
      return (
        <div 
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 uppercase tracking-wide"
          title="Dinheiro a mais na gaveta"
        >
          <TrendingUp size={14} />
          Sobra: {formatCurrencyBRL(difference)}
        </div>
      );
    }

    return (
      <div 
        className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800 uppercase tracking-wide"
        title="Dinheiro a menos na gaveta"
      >
        <AlertTriangle size={14} />
        Quebra: {formatCurrencyBRL(Math.abs(difference))}
      </div>
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-xl px-5 py-3.5 shadow-2xl font-medium text-white flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          {toast.message}
        </div>
      )}

      {pendingCloseOrders.length > 0 && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2 text-red-600">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Não é possível fechar o caixa</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Existem {pendingCloseOrders.length} pedido(s) pendente(s) de finalização/pagamento.
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              <div className="space-y-3">
                {pendingCloseOrders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-red-100 bg-red-50/40 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-gray-900">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {orderTypeLabels[order.type]} • {orderStatusLabels[order.orderStatus]} • {formatCurrencyBRL(order.total)}
                        </p>
                      </div>
                      <div className="text-sm sm:text-right">
                        <p className="font-semibold text-gray-800">
                          Pagamento: {order.paymentStatus ? paymentStatusLabels[order.paymentStatus] || order.paymentStatus : 'Sem registro'}
                        </p>
                        {order.paymentMethod && (
                          <p className="text-gray-500">{paymentMethodLabels[order.paymentMethod] || order.paymentMethod}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingCloseOrders([])}
                className="btn-secondary"
              >
                Entendi
              </button>
              <Link
                to="/pdv/orders"
                onClick={() => setPendingCloseOrders([])}
                className="btn-primary text-center"
              >
                Resolver pedidos
              </Link>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestão de Caixa</h1>
        <p className="text-gray-500 text-sm mt-1">
          Controle de abertura, auditoria de gaveta e relatórios de vendas.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* LADO ESQUERDO: CONTROLES DO CAIXA */}
        <div className="xl:col-span-2 space-y-6">
          <div
            className={`rounded-2xl border p-6 shadow-sm transition-colors duration-300 ${
              current ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div
                  className={`inline-flex items-center justify-center w-14 h-14 rounded-full shadow-sm ${
                    current ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {current ? <Unlock size={28} /> : <Lock size={28} />}
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Status do Turno</p>
                  <h2 className={`text-2xl font-bold leading-none ${current ? 'text-green-700' : 'text-gray-800'}`}>
                    Caixa {current ? 'Aberto' : 'Fechado'}
                  </h2>
                  {current?.openedAt && (
                    <p className="text-sm text-gray-500 mt-1.5 font-medium">
                      Aberto hoje às {new Date(current.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {!current ? (
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Iniciar novo turno</h3>
                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Fundo inicial (Troco na gaveta)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={openingAmount}
                        onChange={(e) => setOpeningAmount(e.target.value)}
                        className="input w-full pl-9 font-medium"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleOpen}
                    disabled={!openingAmount || saving}
                    className="btn-primary h-11 px-8 shadow-md disabled:opacity-50 disabled:shadow-none"
                  >
                    Abrir Caixa
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                
                {/* SESSÃO 1 - GAVETA / DINHEIRO */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Auditoria da Gaveta (Dinheiro Físico)</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm hover:border-green-300 transition-colors">
                      <div className="flex items-center gap-2 text-gray-500 mb-1.5">
                        <Wallet size={16} />
                        <span className="text-xs font-semibold uppercase tracking-wide">Fundo</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900 truncate">
                        {formatCurrencyBRL(current.openingAmount)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm hover:border-green-300 transition-colors">
                      <div className="flex items-center gap-2 text-gray-500 mb-1.5">
                        <TrendingUp size={16} className="text-green-500" />
                        <span className="text-xs font-semibold uppercase tracking-wide">Entradas</span>
                      </div>
                      <p className="text-lg font-bold text-gray-900 truncate">
                        {formatCurrencyBRL(totalEntries)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm hover:border-red-300 transition-colors">
                      <div className="flex items-center gap-2 text-gray-500 mb-1.5">
                        <Scissors size={16} className="text-red-400" />
                        <span className="text-xs font-semibold uppercase tracking-wide">Sangrias</span>
                      </div>
                      <p className="text-lg font-bold text-red-600 truncate">
                        -{formatCurrencyBRL(totalWithdrawals)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-green-600 border border-green-700 p-4 shadow-md text-white">
                      <div className="flex items-center gap-2 text-green-100 mb-1.5">
                        <DollarSign size={16} />
                        <span className="text-xs font-bold uppercase tracking-wide">Gaveta Exata</span>
                      </div>
                      <p className="text-xl font-bold truncate">
                        {formatCurrencyBRL(expectedBalance)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SESSÃO 2 - VENDAS BANCÁRIAS */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Vendas Digitais (Vão direto pro banco)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl bg-teal-50 border border-teal-100 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-teal-700">
                        <QrCode size={18} />
                        <span className="text-sm font-semibold">PIX</span>
                      </div>
                      <p className="text-base font-bold text-teal-900">
                        {formatCurrencyBRL(pixTotal)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-blue-700">
                        <CreditCard size={18} />
                        <span className="text-sm font-semibold">Crédito</span>
                      </div>
                      <p className="text-base font-bold text-blue-900">
                        {formatCurrencyBRL(creditTotal)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-indigo-700">
                        <CreditCard size={18} />
                        <span className="text-sm font-semibold">Débito</span>
                      </div>
                      <p className="text-base font-bold text-indigo-900">
                        {formatCurrencyBRL(debitTotal)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SESSÃO 3 - FECHAMENTO */}
                <div className="rounded-2xl border-2 border-gray-100 bg-gray-50 p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Lock size={16} className="text-gray-500" /> 
                    Encerrar Turno Atual
                  </h3>

                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end mb-5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">
                        Quanto dinheiro tem na gaveta agora?
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={closingAmount}
                          onChange={(e) => setClosingAmount(e.target.value)}
                          className="input w-full pl-9 font-bold text-lg text-gray-900 h-12"
                          placeholder="0,00"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleClose}
                      disabled={!closingAmount || saving}
                      className="btn-danger h-12 px-8 font-bold shadow-md disabled:opacity-50 disabled:shadow-none"
                    >
                      Fechar Caixa
                    </button>
                  </div>

                  {typedClosingAmount > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex gap-6">
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Esperado</p>
                            <p className="text-lg font-bold text-gray-800">{formatCurrencyBRL(expectedBalance)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Informado</p>
                            <p className="text-lg font-bold text-gray-800">{formatCurrencyBRL(typedClosingAmount)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Resultado da Auditoria</p>
                          {renderDifferenceBadge(closingDifference)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 bg-red-50 rounded-lg">
                <Scissors size={20} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Retirada (Sangria)</h3>
            </div>

            {current && (
              <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-blue-900">
                      Cálculo de Sangria Inteligente
                    </p>
                    <p className="text-xs text-blue-700/80 mt-0.5 font-medium">
                      Descubra o valor ideal para retirar, deixando apenas o troco inicial na gaveta.
                    </p>
                  </div>

                  <button
                    onClick={loadSuggestedAmount}
                    disabled={loadingSuggestion}
                    className="rounded-lg bg-white shadow-sm border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {loadingSuggestion ? 'Calculando...' : 'Sugerir valor'}
                  </button>
                </div>

                {suggestedAmount !== null && (
                  <div className="mt-3 pt-3 border-t border-blue-200/50 flex items-center justify-between">
                    <span className="text-sm text-blue-800 font-medium">Valor seguro para retirada:</span>
                    <span className="text-lg font-black text-blue-900">{formatCurrencyBRL(suggestedAmount)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Valor (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  className="input w-full"
                  placeholder="0,00"
                  disabled={!current}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Motivo</label>
                <input
                  type="text"
                  value={withdrawalReason}
                  onChange={(e) => setWithdrawalReason(e.target.value)}
                  className="input w-full"
                  placeholder="Ex: Pagamento fornecedor, Retirada excesso..."
                  disabled={!current}
                />
              </div>
              <button
                onClick={handleWithdrawal}
                disabled={!current || !withdrawalAmount || !withdrawalReason.trim() || saving}
                className="btn-secondary h-[42px] disabled:opacity-50 w-full md:w-auto font-bold border-gray-300"
              >
                Salvar
              </button>
            </div>

            {!current && (
              <p className="text-sm font-medium text-amber-600 mt-4 bg-amber-50 p-3 rounded-lg border border-amber-100">
                ⚠️ Abra o caixa para poder registrar sangrias.
              </p>
            )}

            {current && (
              <div className="mt-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Sangrias do turno atual</h4>
                <div className="space-y-2">
                  {(current?.withdrawals || []).length === 0 ? (
                    <p className="text-sm text-gray-400 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      Nenhuma sangria registrada ainda.
                    </p>
                  ) : (
                    current?.withdrawals?.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-red-100 bg-red-50/30 px-4 py-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{item.reason}</p>
                          <p className="text-xs text-gray-500 font-medium mt-0.5">
                            Por {item.createdBy?.name} às {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <p className="font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-md text-sm">
                          - {formatCurrencyBRL(item.amount)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LADO DIREITO: HISTÓRICO (CUPOM FISCAL STYLE) */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-1 shadow-inner h-[calc(100vh-120px)] sticky top-6 flex flex-col">
          <div className="p-5 pb-3 bg-white rounded-t-xl border-b border-gray-100 flex items-center gap-2">
            <History size={20} className="text-gray-700" />
            <h3 className="text-lg font-bold text-gray-900">Relatórios Fechados</h3>
          </div>

          <div className="overflow-y-auto p-3 space-y-4 flex-1">
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10 font-medium">Sem registros anteriores.</p>
            ) : (
              history.map((session: any) => {
                const sessionOpening = Number(session.openingAmount || 0);
                const sessionEntries = Number(session.totalEntries || 0);
                
                const sessionPix = Number(session.pixTotal || 0);
                const sessionCredit = Number(session.creditTotal || 0);
                const sessionDebit = Number(session.debitTotal || 0);

                const sessionWithdrawals = Number(
                  session.totalWithdrawals ?? session.withdrawalTotal ?? 0
                );
                const sessionExpected = Number(
                  session.expectedBalance || sessionOpening + sessionEntries - sessionWithdrawals
                );
                const sessionClosing = Number(session.closingAmount || 0);
                const hasClosed =
                  session.closingAmount !== null &&
                  session.closingAmount !== undefined &&
                  session.status === 'CLOSED';
                const difference = hasClosed ? sessionClosing - sessionExpected : 0;

                return (
                  <div key={session.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
                    {/* Borda decorativa estilo recibo */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-800"></div>
                    
                    <div className="p-4 pl-5">
                      <div className="flex items-center justify-between mb-4 border-b border-dashed border-gray-200 pb-3">
                        <div>
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${session.status === 'OPEN' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                            {session.status === 'OPEN' ? 'Em Andamento' : 'Encerrado'}
                          </span>
                          <p className="text-[11px] font-bold text-gray-400 mt-1.5 uppercase">
                            {new Date(session.openedAt).toLocaleDateString('pt-BR')} • Op: {session.openedBy?.name?.split(' ')[0]}
                          </p>
                        </div>
                      </div>

                      {/* Resumo Gaveta */}
                      <div className="space-y-1.5 mb-4 text-xs font-medium text-gray-600">
                        <div className="flex justify-between">
                          <span>Fundo Inicial:</span>
                          <span className="text-gray-900">{formatCurrencyBRL(sessionOpening)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Vendas (Dinheiro):</span>
                          <span className="text-green-600">+{formatCurrencyBRL(sessionEntries)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sangrias:</span>
                          <span className="text-red-500">-{formatCurrencyBRL(sessionWithdrawals)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center bg-gray-100 p-2 rounded mt-2 text-gray-800 border border-gray-200">
                          <span className="font-bold">GAVETA ESPERADA:</span>
                          <span className="font-black text-sm">{formatCurrencyBRL(sessionExpected)}</span>
                        </div>
                      </div>

                      {/* Resumo Bancário */}
                      {(sessionPix > 0 || sessionCredit > 0 || sessionDebit > 0) && (
                        <div className="mb-4">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Digitais (Banco)</p>
                          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 space-y-1 text-xs font-medium text-blue-900/70">
                            {sessionPix > 0 && (
                              <div className="flex justify-between">
                                <span>PIX:</span>
                                <span className="font-bold text-blue-900">{formatCurrencyBRL(sessionPix)}</span>
                              </div>
                            )}
                            {sessionCredit > 0 && (
                              <div className="flex justify-between">
                                <span>Crédito:</span>
                                <span className="font-bold text-blue-900">{formatCurrencyBRL(sessionCredit)}</span>
                              </div>
                            )}
                            {sessionDebit > 0 && (
                              <div className="flex justify-between">
                                <span>Débito:</span>
                                <span className="font-bold text-blue-900">{formatCurrencyBRL(sessionDebit)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Auditoria final */}
                      {hasClosed && (
                        <div className="border-t border-gray-100 pt-3 mt-1">
                          <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                            <span>Gaveta Real:</span>
                            <span className="font-bold text-gray-900">{formatCurrencyBRL(sessionClosing)}</span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-500 uppercase">Resultado:</span>
                            {renderDifferenceBadge(difference)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashRegisterPage;
