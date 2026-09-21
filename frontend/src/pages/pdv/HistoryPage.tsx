import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, History, Loader2, RotateCcw, Search, ShoppingBag, UserRound } from 'lucide-react';
import { CashSessionSummary } from '../../components/cash/CashSessionSummary';
import { OrderFiscalDocumentPanel } from '../../components/fiscal/OrderFiscalDocumentPanel';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '../../components/ui';
import api from '../../services/api';
import type { CashRegisterSession, Order, OrderItem, RestaurantConfig } from '../../types';
import { getOperatorName } from '../../utils/cashAudit';
import { formatCurrencyBRL } from '../../utils/currency';

interface HistorySession extends CashRegisterSession {
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
  CREDIT: 'Fiado',
  ON_DELIVERY: 'Na entrega',
  ON_PICKUP: 'Na retirada',
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'não registrado';

const parseNotesAndExtras = (originalNotes: string) => {
  const extras: { name: string; price: number }[] = [];
  const cleanLines: string[] = [];

  for (const line of (originalNotes || '').split(String.fromCharCode(10))) {
    const trimmed = line.trim();
    const match =
      trimmed.match(/^[-+]?[ ]*Extra:[ ]*(.+?)[ ]*[(]?[ ]*R[$][ ]*([0-9.,]+)[ ]*[)]?$/i) ||
      trimmed.match(/^[-+]?[ ]*(.+?):[ ]*R[$][ ]*([0-9.,]+)$/i);

    if (match) {
      extras.push({ name: match[1].trim(), price: Number.parseFloat(match[2].replace(',', '.')) });
    } else if (trimmed && !trimmed.toLocaleLowerCase('pt-BR').includes('extras manuais:')) {
      cleanLines.push(line);
    }
  }

  return { cleanNotes: cleanLines.join(String.fromCharCode(10)).trim(), extras };
};

const quantityLabel = (item: OrderItem) => {
  if (item.saleType === 'WEIGHT' || item.saleType === 'SELF_SERVICE' || Number(item.weight || 0) > 0) {
    return `${Number(item.weight || 0).toLocaleString('pt-BR')} g`;
  }
  return `${item.quantity}x`;
};

const apiMessage = (error: unknown) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message;

export default function HistoryPage() {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [config, setConfig] = useState<RestaurantConfig | null>(null);
  const { toast } = useToast();

  const fetchHistory = useCallback(async (filters?: {
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
      const { data } = await api.get('/cash-register/orders-history', { params });
      setSessions(data || []);
    } catch (error) {
      toast({
        title: 'Erro ao carregar o histórico',
        description: apiMessage(error) || 'Tente novamente em alguns instantes.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchHistory();
    api.get('/config')
      .then(({ data }) => setConfig(data))
      .catch(() => setConfig(null));
  }, [fetchHistory]);

  const totalOrdersFound = useMemo(
    () => sessions.reduce((sum, session) => sum + Number(session.matchedOrdersCount || 0), 0),
    [sessions]
  );

  const handleSearch = () => {
    void fetchHistory({ customerName: customerName.trim(), startDate, endDate });
  };

  const handleReset = () => {
    setCustomerName('');
    setStartDate('');
    setEndDate('');
    void fetchHistory();
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted">
        <Loader2 className="animate-spin" aria-label="Carregando histórico" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico"
        description="Pedidos por fechamento de caixa, com responsáveis e valores preservados no momento da venda."
        actions={
          <Badge variant="info">
            {totalOrdersFound} pedido(s) em {sessions.length} fechamento(s)
          </Badge>
        }
      />

      <Card>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto_auto] lg:items-end">
            <Field label="Nome do cliente">
              <Input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                placeholder="Ex.: Maria"
              />
            </Field>
            <Field label="Data inicial">
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label="Data final">
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
            <Button onClick={handleSearch} loading={searching} leftIcon={<Search aria-hidden="true" />}>Pesquisar</Button>
            <Button variant="secondary" onClick={handleReset} disabled={searching} leftIcon={<RotateCcw aria-hidden="true" />}>Limpar</Button>
          </div>
        </CardContent>
      </Card>

      {!sessions.length ? (
        <EmptyState
          icon={<History />}
          title="Nenhum pedido encontrado"
          description="Ajuste os filtros ou feche um caixa para que os pedidos apareçam aqui."
        />
      ) : (
        <div className="space-y-6">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardHeader>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <Badge variant="neutral">Caixa fechado</Badge>
                    <CardTitle className="mt-3">
                      {formatDateTime(session.openedAt)} até {formatDateTime(session.closedAt)}
                    </CardTitle>
                    <p className="mt-1 text-body text-muted">
                      Aberto por {getOperatorName(session.openedBy)} · fechado por {getOperatorName(session.closedBy)} ·
                      {' '}{session.totalOrdersInSession} pedido(s) no turno
                    </p>
                  </div>
                  <p className="text-body text-muted">{session.matchedOrdersCount} pedido(s) exibido(s)</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <CashSessionSummary session={session} />

                <Card className="bg-surface-sunken">
                  <CardHeader>
                    <CardTitle>Sangrias do turno</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!session.withdrawals?.length ? (
                      <EmptyState title="Nenhuma sangria registrada" />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Motivo</TableHead>
                            <TableHead>Responsável</TableHead>
                            <TableHead numeric>Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {session.withdrawals.map((withdrawal) => (
                            <TableRow key={withdrawal.id}>
                              <TableCell>{formatDateTime(withdrawal.createdAt)}</TableCell>
                              <TableCell>{withdrawal.reason}</TableCell>
                              <TableCell>{getOperatorName(withdrawal.createdBy)}</TableCell>
                              <TableCell numeric>{formatCurrencyBRL(withdrawal.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {!session.orders.length ? (
                  <EmptyState title="Nenhum pedido vinculado a este fechamento" />
                ) : (
                  <div className="space-y-4">
                    {session.orders.map((order) => (
                      <Card key={order.id} className="bg-surface-sunken">
                        <CardHeader>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle>Pedido #{order.id.slice(-6).toUpperCase()}</CardTitle>
                                <Badge variant="neutral">{orderTypeLabels[order.type] || order.type}</Badge>
                                {order.payment?.method && (
                                  <Badge variant="info">{paymentMethodLabels[order.payment.method] || order.payment.method}</Badge>
                                )}
                              </div>
                              <div className="mt-3 grid gap-2 text-body text-muted md:grid-cols-2 xl:grid-cols-4">
                                <p className="flex items-center gap-2"><CalendarDays aria-hidden="true" />{formatDateTime(order.createdAt)}</p>
                                <p className="flex items-center gap-2"><UserRound aria-hidden="true" />Cliente: {order.customerName || order.customer?.name || 'não informado'}</p>
                                <p><strong className="text-default">Responsável:</strong> {order.waiter?.name || order.user?.name || 'não registrado'}</p>
                                <p><strong className="text-default">Mesa:</strong> {order.table?.number ?? 'não informada'}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-caption text-muted">Total do pedido</p>
                              <p className="text-title font-bold tabular-nums text-default">{formatCurrencyBRL(order.total)}</p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center gap-2">
                            <ShoppingBag aria-hidden="true" className="text-primary" />
                            <h4 className="font-semibold text-default">Itens do pedido</h4>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Quantidade</TableHead>
                                <TableHead>Produto vendido</TableHead>
                                <TableHead numeric>Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {order.items.map((item) => {
                                const { cleanNotes, extras } = parseNotesAndExtras(item.notes || '');
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell>{quantityLabel(item)}</TableCell>
                                    <TableCell>
                                      <p className="font-medium">{item.productName || item.product?.name || 'Produto removido'}</p>
                                      {cleanNotes && <p className="mt-1 whitespace-pre-line text-caption text-muted">{cleanNotes}</p>}
                                      {extras.map((extra, index) => (
                                        <p key={`${extra.name}-${index}`} className="text-caption text-muted">
                                          + {extra.name} ({formatCurrencyBRL(extra.price)})
                                        </p>
                                      ))}
                                    </TableCell>
                                    <TableCell numeric>{formatCurrencyBRL(item.price)}</TableCell>
                                  </TableRow>
                                );
                              })}
                              {Number(order.deliveryFee || 0) > 0 && (
                                <TableRow>
                                  <TableCell>1x</TableCell>
                                  <TableCell>Taxa de entrega</TableCell>
                                  <TableCell numeric>{formatCurrencyBRL(Number(order.deliveryFee))}</TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>

                          {order.status === 'FINISHED' && order.payment?.status === 'PAID' && (
                            <OrderFiscalDocumentPanel
                              orderId={order.id}
                              phone={order.deliveryPhone}
                              nfceEnabled={Boolean(config?.nfceEnabled) && order.payment.method !== 'CREDIT'}
                            />
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
