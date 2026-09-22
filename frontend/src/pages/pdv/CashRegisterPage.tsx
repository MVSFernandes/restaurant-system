import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BanknoteArrowDown,
  Loader2,
  Lock,
  Unlock,
  WalletCards,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CashDifferenceBadge, CashSessionSummary } from '../../components/cash/CashSessionSummary';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CurrencyInput,
  EmptyState,
  Field,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  useToast,
} from '../../components/ui';
import api from '../../services/api';
import type { CashRegisterSession, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from '../../types';
import { getOperatorName } from '../../utils/cashAudit';
import { formatCurrencyBRL } from '../../utils/currency';

interface PendingCloseOrder {
  id: string;
  type: OrderType;
  orderStatus: OrderStatus;
  total: number;
  paymentStatus: PaymentStatus | null;
  paymentMethod: PaymentMethod | null;
}

type ApiError = {
  response?: {
    data?: {
      message?: string;
      code?: string;
      details?: { pendingOrders?: PendingCloseOrder[] };
    };
  };
};

const orderStatusLabels: Record<OrderStatus, string> = {
  NEW: 'Novo',
  IN_PROGRESS: 'Em preparo',
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
  CANCELED: 'Cancelado',
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

const getErrorMessage = (error: unknown, fallback: string) =>
  (error as ApiError).response?.data?.message || fallback;

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function CashRegisterPage() {
  const [current, setCurrent] = useState<CashRegisterSession | null>(null);
  const [history, setHistory] = useState<CashRegisterSession[]>([]);
  const [lastClosed, setLastClosed] = useState<CashRegisterSession | null>(null);
  const [openingAmount, setOpeningAmount] = useState<number | null>(null);
  const [closingAmount, setClosingAmount] = useState<number | null>(null);
  const [closingNotes, setClosingNotes] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState<number | null>(null);
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [pendingCloseOrders, setPendingCloseOrders] = useState<PendingCloseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [currentResponse, historyResponse] = await Promise.all([
        api.get('/cash-register/current'),
        api.get('/cash-register/history'),
      ]);
      const currentSession = currentResponse.data || null;
      const closedSessions = (historyResponse.data || []).filter(
        (session: CashRegisterSession) => session.status === 'CLOSED'
      );
      setCurrent(currentSession);
      setHistory(historyResponse.data || []);
      setLastClosed((previous) => currentSession ? null : closedSessions[0] || previous);
    } catch (error) {
      toast({
        title: 'Não foi possível carregar o caixa',
        description: getErrorMessage(error, 'Tente novamente em alguns instantes.'),
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const expectedBalance = Number(current?.expectedBalance || 0);
  const closingDifference = useMemo(
    () => (closingAmount === null ? null : closingAmount - expectedBalance),
    [closingAmount, expectedBalance]
  );
  const requiresJustification =
    closingDifference !== null && Math.abs(closingDifference) >= 0.005;

  const handleOpen = async () => {
    if (openingAmount === null) return;
    try {
      setSaving(true);
      const { data } = await api.post('/cash-register/open', { openingAmount });
      setCurrent(data);
      setOpeningAmount(null);
      await fetchData();
      toast({ title: 'Caixa aberto com sucesso', variant: 'success' });
    } catch (error) {
      toast({ title: 'Erro ao abrir caixa', description: getErrorMessage(error, 'Revise os dados e tente novamente.'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (closingAmount === null || (requiresJustification && !closingNotes.trim())) return;
    try {
      setSaving(true);
      const { data } = await api.post('/cash-register/close', {
        closingAmount,
        notes: closingNotes.trim() || null,
      });
      setLastClosed(data);
      setClosingAmount(null);
      setClosingNotes('');
      await fetchData();
      toast({ title: 'Caixa fechado com sucesso', variant: 'success' });
    } catch (error) {
      const response = (error as ApiError).response?.data;
      const pendingOrders = response?.details?.pendingOrders;
      if (response?.code === 'CASH_REGISTER_PENDING_ORDERS' && Array.isArray(pendingOrders)) {
        setPendingCloseOrders(
          pendingOrders.filter((order) => order.orderStatus !== 'CANCELED')
        );
      }
      toast({ title: 'Erro ao fechar caixa', description: response?.message || 'Revise os dados e tente novamente.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleWithdrawal = async () => {
    if (withdrawalAmount === null || withdrawalAmount <= 0 || !withdrawalReason.trim()) return;
    try {
      setSaving(true);
      await api.post('/cash-register/withdrawals', {
        amount: withdrawalAmount,
        reason: withdrawalReason.trim(),
      });
      setWithdrawalAmount(null);
      setWithdrawalReason('');
      setSuggestionMessage(null);
      await fetchData();
      toast({ title: 'Sangria registrada com sucesso', variant: 'success' });
    } catch (error) {
      toast({ title: 'Erro ao registrar sangria', description: getErrorMessage(error, 'Revise os dados e tente novamente.'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const loadSuggestedAmount = async () => {
    try {
      setLoadingSuggestion(true);
      const { data } = await api.get('/cash-register/suggest-withdrawal');
      const suggestion = Number(data.suggestedAmount || 0);
      setWithdrawalAmount(suggestion > 0 ? suggestion : null);
      setSuggestionMessage(data.message || null);
    } catch (error) {
      toast({ title: 'Erro ao calcular sangria', description: getErrorMessage(error, 'Tente novamente.'), variant: 'error' });
    } finally {
      setLoadingSuggestion(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted">
        <Loader2 className="animate-spin" aria-label="Carregando caixa" />
      </div>
    );
  }

  const closedHistory = history
    .filter((session) => session.status === 'CLOSED')
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Gestão de caixa"
        description="Abertura, sangrias, conferência da gaveta e auditoria do turno."
      />

      {current ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-token-lg bg-success-subtle p-3 text-success"><Unlock aria-hidden="true" /></span>
                  <div>
                    <CardTitle>Caixa aberto</CardTitle>
                    <p className="text-body text-muted">
                      Desde {formatDateTime(current.openedAt)} por {getOperatorName(current.openedBy)}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-success-subtle px-3 py-1 text-label font-semibold text-success">
                  Turno ativo
                </span>
              </div>
            </CardHeader>
          </Card>

          <CashSessionSummary session={current} showClosing={false} />

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Registrar sangria</CardTitle>
                <p className="text-body text-muted">Toda retirada registra valor, motivo, data e operador.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Valor da retirada" required>
                  <CurrencyInput value={withdrawalAmount} onValueChange={setWithdrawalAmount} aria-label="Valor da sangria" />
                </Field>
                <Field label="Motivo" required>
                  <Textarea value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)} placeholder="Ex.: pagamento de fornecedor" />
                </Field>
                {suggestionMessage && (
                  <p role="status" className="rounded-token-md bg-info-subtle p-3 text-body text-info">{suggestionMessage}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={loadSuggestedAmount} loading={loadingSuggestion}>
                    Sugerir valor a retirar
                  </Button>
                  <Button
                    onClick={handleWithdrawal}
                    loading={saving}
                    disabled={withdrawalAmount === null || withdrawalAmount <= 0 || !withdrawalReason.trim()}
                    leftIcon={<BanknoteArrowDown aria-hidden="true" />}
                  >
                    Registrar sangria
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sangrias do turno</CardTitle>
              </CardHeader>
              <CardContent>
                {!current.withdrawals?.length ? (
                  <EmptyState title="Nenhuma sangria registrada" description="As retiradas aparecerão aqui com o operador responsável." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Motivo e responsável</TableHead>
                        <TableHead numeric>Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {current.withdrawals.map((withdrawal) => (
                        <TableRow key={withdrawal.id}>
                          <TableCell>{formatDateTime(withdrawal.createdAt)}</TableCell>
                          <TableCell>
                            <p>{withdrawal.reason}</p>
                            <p className="text-caption text-muted">{getOperatorName(withdrawal.createdBy)}</p>
                          </TableCell>
                          <TableCell numeric className="font-semibold text-danger">
                            {formatCurrencyBRL(withdrawal.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-strong shadow-token-md">
            <CardHeader>
              <CardTitle>Fechar caixa</CardTitle>
              <p className="text-body text-muted">Conte apenas o dinheiro físico que ficou na gaveta.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Valor contado na gaveta" required>
                  <CurrencyInput value={closingAmount} onValueChange={setClosingAmount} aria-label="Valor contado no fechamento" />
                </Field>
                <div className="flex items-end">
                  {closingDifference === null ? (
                    <p className="pb-2 text-body text-muted">Saldo esperado: {formatCurrencyBRL(expectedBalance)}</p>
                  ) : (
                    <CashDifferenceBadge difference={closingDifference} />
                  )}
                </div>
              </div>
              {requiresJustification && (
                <Field
                  label="Justificativa da diferença"
                  required
                  error={!closingNotes.trim() ? 'Informe por que o valor contado diverge do saldo esperado.' : undefined}
                >
                  <Textarea value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} placeholder="Descreva a causa da sobra ou falta." />
                </Field>
              )}
              <Button
                variant="danger"
                solid
                onClick={handleClose}
                loading={saving}
                disabled={closingAmount === null || (requiresJustification && !closingNotes.trim())}
              >
                Fechar caixa
              </Button>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card className="border-primary bg-primary-subtle shadow-token-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="rounded-token-lg bg-surface p-3 text-primary"><Lock aria-hidden="true" /></span>
                <div>
                  <CardTitle>Abrir caixa</CardTitle>
                  <p className="text-body text-muted">Informe o fundo inicial para começar um novo turno.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field label="Fundo de abertura">
                <CurrencyInput value={openingAmount} onValueChange={setOpeningAmount} aria-label="Fundo de abertura" />
              </Field>
              <Button onClick={handleOpen} disabled={openingAmount === null} loading={saving} leftIcon={<Unlock aria-hidden="true" />}>
                Abrir caixa
              </Button>
            </CardContent>
          </Card>

          {lastClosed && (
            <section>
              <div className="mb-3">
                <h2 className="text-heading text-default">Resumo do fechamento concluído</h2>
                <p className="mt-1 text-body text-muted">
                  {formatDateTime(lastClosed.openedAt)} a {lastClosed.closedAt ? formatDateTime(lastClosed.closedAt) : '—'} ·
                  aberto por {getOperatorName(lastClosed.openedBy)} · fechado por {getOperatorName(lastClosed.closedBy)} ·
                  {' '}{lastClosed.orderCount || 0} pedido(s)
                </p>
              </div>
              <CashSessionSummary session={lastClosed} />
            </section>
          )}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <WalletCards aria-hidden="true" className="text-muted" />
                <h2 className="text-heading text-default">Fechamentos recentes</h2>
              </div>
              <Link to="/pdv/history" className="text-body font-semibold text-primary hover:underline">
                Ver histórico completo
              </Link>
            </div>
            {!closedHistory.length ? (
              <EmptyState title="Nenhum fechamento registrado" />
            ) : (
              <Card className="p-0">
                <div className="divide-y divide-[rgb(var(--color-border-default))]">
                  {closedHistory.map((session) => (
                    <div key={session.id} className="flex flex-col gap-2 px-card py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-default">{formatDateTime(session.openedAt)}</p>
                        <p className="text-caption text-muted">
                          {getOperatorName(session.openedBy)} → {getOperatorName(session.closedBy)} · {session.orderCount || 0} pedido(s)
                        </p>
                      </div>
                      {session.closingAmount !== null && session.closingAmount !== undefined && (
                        <CashDifferenceBadge difference={Number(session.closingAmount) - Number(session.expectedBalance || 0)} />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>
        </>
      )}

      <Modal open={pendingCloseOrders.length > 0} onClose={() => setPendingCloseOrders([])} size="lg">
        <ModalHeader>
          <ModalTitle>Não é possível fechar o caixa</ModalTitle>
          <ModalDescription>Finalize ou cancele os pedidos pendentes antes de fechar o turno.</ModalDescription>
        </ModalHeader>
        <ModalContent>
          <div className="space-y-3">
            {pendingCloseOrders.map((order) => (
              <Card key={order.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-default">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                  <p className="text-body text-muted">
                    {orderTypeLabels[order.type]} · {orderStatusLabels[order.orderStatus]} · {formatCurrencyBRL(order.total)}
                  </p>
                </div>
                <div className="text-body sm:text-right">
                  <p>{order.paymentStatus ? paymentStatusLabels[order.paymentStatus] || order.paymentStatus : 'Sem pagamento'}</p>
                  {order.paymentMethod && <p className="text-muted">{paymentMethodLabels[order.paymentMethod] || order.paymentMethod}</p>}
                </div>
              </Card>
            ))}
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setPendingCloseOrders([])}>Entendi</Button>
          <Link to="/pdv/orders" className="inline-flex h-10 items-center justify-center gap-2 rounded-token-md border border-transparent bg-primary px-4 text-body font-medium text-primary-fg hover:bg-primary-hover">
            <AlertTriangle aria-hidden="true" />
            Resolver pedidos
          </Link>
        </ModalFooter>
      </Modal>
    </div>
  );
}
