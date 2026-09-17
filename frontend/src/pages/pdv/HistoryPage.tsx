import React, { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import type { CashRegisterSession, Order, RestaurantConfig } from '../../types';
import { OrderFiscalDocumentPanel } from '../../components/fiscal/OrderFiscalDocumentPanel';
import { CalendarDays, History, Search, UserRound, ShoppingBag, RotateCcw } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency';

interface HistorySession extends CashRegisterSession {
  totalEntries?: number;
  totalWithdrawals?: number;
  expectedBalance?: number;
  matchedOrdersCount: number;
  totalOrdersInSession: number;
  orders: Order[];
}

const orderTypeLabels: Record<string, string> = {
  DINE_IN: 'Mesa',
  TAKE_AWAY: 'Retirada',
  DELIVERY: 'Entrega',
};

const paymentMethodLabels: Record<string, string> = {
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  PIX: 'PIX',
  ON_DELIVERY: 'Na entrega',
  ON_PICKUP: 'Na retirada',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
};

const parseNotesAndExtras = (originalNotes: string) => {
  const lines = (originalNotes || '').split('\n');
  const extras: { id: string; name: string; price: number }[] = [];
  const cleanLines: string[] = [];

  for (let line of lines) {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^[-+]?\s*Extra:\s*(.+?)\s*\(?\s*R\$\s*([\d.,]+)\s*\)?$/i) || 
                  trimmedLine.match(/^[-+]?\s*(.+?):\s*R\$\s*([\d.,]+)$/i);
    
    if (match) {
      extras.push({
        id: Math.random().toString(36).substring(2, 10),
        name: match[1].trim(),
        price: parseFloat(match[2].replace(',', '.')),
      });
      continue;
    }

    if (!trimmedLine.toLowerCase().includes('extras manuais:') && trimmedLine !== '') {
      cleanLines.push(line);
    }
  }
  return { cleanNotes: cleanLines.join('\n').trim(), extras };
};

const HistoryPage: React.FC = () => {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [config, setConfig] = useState<RestaurantConfig | null>(null);

  const fetchHistory = async (filters?: {
    customerName?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    try {
      setSearching(true);

      const params = {
        ...(filters?.customerName ? { customerName: filters.customerName } : {}),
        ...(filters?.startDate ? { startDate: filters.startDate } : {}),
        ...(filters?.endDate ? { endDate: filters.endDate } : {}),
      };

      const response = await api.get('/cash-register/orders-history', { params });
      setSessions(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar histórico de pedidos:', error);
      alert('Erro ao carregar histórico de pedidos.');
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
    api.get('/config')
      .then(({ data }) => setConfig(data))
      .catch((error) => console.error('Erro ao carregar configuração de NFC-e:', error));
  }, []);

  const handleSearch = () => {
    void fetchHistory({
      customerName: customerName.trim(),
      startDate,
      endDate,
    });
  };

  const handleReset = () => {
    setCustomerName('');
    setStartDate('');
    setEndDate('');
    void fetchHistory();
  };

  const totalOrdersFound = useMemo(
    () => sessions.reduce((sum, session) => sum + Number(session.matchedOrdersCount || 0), 0),
    [sessions]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Histórico</h1>
          <p className="text-gray-500">
            Pedidos movidos para o histórico após o fechamento do caixa, com busca por data e nome do cliente.
          </p>
        </div>

        <div className="rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800">
          <p className="font-semibold">{totalOrdersFound} pedido(s) encontrado(s)</p>
          <p className="text-primary-700">
            {sessions.length} fechamento(s) de caixa listado(s)
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto_auto] lg:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do cliente
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className="input w-full pl-10"
                placeholder="Ex.: Maria ou letra M"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data final</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="input w-full"
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={searching}
            className="btn-primary h-11 px-5 disabled:opacity-50"
          >
            {searching ? 'Pesquisando...' : 'Pesquisar'}
          </button>

          <button
            onClick={handleReset}
            disabled={searching}
            className="btn-secondary h-11 px-5 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RotateCcw size={16} />
            Limpar
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center shadow-sm">
          <History size={40} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-900">Nenhum pedido encontrado</h2>
          <p className="text-sm text-gray-500 mt-2">
            Ajuste os filtros ou feche um caixa para que os pedidos apareçam aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {sessions.map((session) => (
            <section
              key={session.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
                      Caixa fechado
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(session.closedAt)}
                    </span>
                  </div>

                  <h2 className="mt-3 text-lg font-semibold text-gray-900">
                    Fechamento de {formatDateTime(session.openedAt)} até {formatDateTime(session.closedAt)}
                  </h2>

                  <div className="mt-2 grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-3">
                    <p>
                      <strong>Aberto por:</strong> {session.openedBy?.name || '-'}
                    </p>
                    <p>
                      <strong>Fechado por:</strong> {session.closedBy?.name || '-'}
                    </p>
                    <p>
                      <strong>Pedidos neste fechamento:</strong> {session.totalOrdersInSession}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[720px]">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Abertura</p>
                    <p className="mt-1 text-base font-bold text-gray-900">
                      {formatCurrencyBRL(session.openingAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Entradas</p>
                    <p className="mt-1 text-base font-bold text-green-700">
                      {formatCurrencyBRL(session.totalEntries)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Sangrias</p>
                    <p className="mt-1 text-base font-bold text-red-600">
                      {formatCurrencyBRL(session.totalWithdrawals)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Fechamento</p>
                    <p className="mt-1 text-base font-bold text-primary-700">
                      {formatCurrencyBRL(session.closingAmount)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-900 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <p>
                  <strong>{session.matchedOrdersCount}</strong> pedido(s) exibido(s) neste fechamento.
                </p>
                <p>
                  Saldo esperado: <strong>{formatCurrencyBRL(session.expectedBalance)}</strong>
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {session.orders.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                    Nenhum pedido vinculado a este fechamento.
                  </div>
                ) : session.orders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-900">
                            Pedido #{order.id.slice(-6).toUpperCase()}
                          </h3>
                          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-200">
                            {orderTypeLabels[order.type] || order.type}
                          </span>
                          {order.payment?.method && (
                            <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-200">
                              {paymentMethodLabels[order.payment.method] || order.payment.method}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                          <p className="flex items-center gap-2">
                            <CalendarDays size={14} className="text-gray-400" />
                            {formatDateTime(order.createdAt)}
                          </p>
                          <p className="flex items-center gap-2">
                            <UserRound size={14} className="text-gray-400" />
                            Cliente: {order.customerName || order.customer?.name || 'Não informado'}
                          </p>
                          <p>
                            <strong>Responsável:</strong> {order.waiter?.name || order.user?.name || '-'}
                          </p>
                          <p>
                            <strong>Mesa:</strong> {order.table?.number || '-'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl bg-white px-4 py-3 border border-gray-200 min-w-[180px]">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Total do pedido</p>
                        <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrencyBRL(order.total)}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-white bg-white p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ShoppingBag size={16} className="text-primary-600" />
                        <span className="text-sm font-semibold text-gray-900">Itens do pedido</span>
                      </div>

                      <div className="space-y-2">
                        {order.items.map((item) => {
                          const quantityLabel = item.product?.isByWeight
                            ? `${Number(item.weight || 0).toFixed(0)}g`
                            : `${item.quantity}x`;
                          
                          const { cleanNotes, extras } = parseNotesAndExtras(item.notes || '');

                          return (
                            <div
                              key={item.id}
                              className="flex flex-col gap-2 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
                            >
                              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {quantityLabel} {item.product?.name}
                                  </p>
                                  {cleanNotes && (
                                    <div className="mt-1 text-[11px] text-gray-500 leading-snug whitespace-pre-line">
                                      {cleanNotes.includes('Composição da marmita:') ? (
                                        <>
                                          <span className="font-medium text-primary-600">Composição da marmita:</span>
                                          {'\n'}
                                          {cleanNotes.replace('Composição da marmita:', '').replace(/^\s*[\r\n]+/, '')}
                                        </>
                                      ) : (
                                        cleanNotes
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-gray-700">
                                  {formatCurrencyBRL(item.price)}
                                </p>
                              </div>
                              
                              {extras.length > 0 && (
                                <div className="ml-4 space-y-1">
                                  {extras.map(extra => (
                                    <div key={extra.id} className="flex justify-between items-center text-xs text-gray-600 bg-white border border-gray-100 px-2 py-1 rounded-md">
                                      <span>+ {extra.name}</span>
                                      <span className="font-bold text-primary-600">{formatCurrencyBRL(extra.price)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {
                      order.status === 'FINISHED' &&
                      order.payment?.status === 'PAID' && (
                        <OrderFiscalDocumentPanel orderId={order.id} phone={order.deliveryPhone} nfceEnabled={!!config?.nfceEnabled && order.payment.method !== 'CREDIT'} />
                      )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
