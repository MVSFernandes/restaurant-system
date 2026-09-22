import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, History, Loader2, Printer, RotateCcw, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  Badge, Button, Card, CardContent, EmptyState, Field, Input, PageHeader, Select,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useToast,
} from '../../components/ui';
import api from '../../services/api';
import type { Invoice, Order, Payment } from '../../types';
import { formatCurrencyBRL } from '../../utils/currency';

interface HistoryOrder extends Omit<Order, 'payment' | 'table' | 'waiter' | 'user'> {
  payment: Payment | null;
  invoice: Invoice | null;
  table?: { id: string; number: number } | null;
  waiter?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
  cashRegisterSessionId?: string | null;
}

interface HistoryResponse {
  data: HistoryOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type Filters = {
  startDate: string; endDate: string; customerName: string; code: string; type: string;
  paymentMethod: string; paymentStatus: string; orderStatus: string; source: string; fiscalStatus: string;
};

const emptyFilters: Filters = {
  startDate: '', endDate: '', customerName: '', code: '', type: '', paymentMethod: '',
  paymentStatus: '', orderStatus: '', source: '', fiscalStatus: '',
};

const orderTypeLabels: Record<string, string> = { DINE_IN: 'Mesa', TAKE_AWAY: 'Retirada', DELIVERY: 'Entrega' };
const sourceLabels: Record<string, string> = { PDV: 'Balcão', PUBLIC_MENU: 'Cardápio digital', WAITER: 'Garçom' };
const paymentMethodLabels: Record<string, string> = {
  CASH: 'Dinheiro', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito', PIX: 'PIX',
  CREDIT: 'Fiado',
};
const paymentStatusLabels: Record<string, string> = { PAID: 'Pago', PENDING: 'A receber', CANCELED: 'Cancelado', FAILED: 'Falhou', REFUNDED: 'Estornado' };
const invoiceStatusLabels: Record<string, string> = {
  authorized: 'Nota autorizada', pending: 'Nota pendente', processing: 'Nota em processamento',
  error: 'Nota rejeitada', canceled: 'Nota cancelada',
};
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'não registrado';
const apiMessage = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message;
const quantityLabel = (item: HistoryOrder['items'][number]) =>
  item.saleType === 'WEIGHT' || item.saleType === 'SELF_SERVICE' || Number(item.weight || 0) > 0
    ? `${Number(item.weight || 0).toLocaleString('pt-BR')} g`
    : `${item.quantity}x`;

export default function OrderHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = useRef<Filters>({
    ...emptyFilters,
    startDate: searchParams.get('startDate') || '', endDate: searchParams.get('endDate') || '',
    customerName: searchParams.get('customerName') || '', code: searchParams.get('code') || '',
    type: searchParams.get('type') || '', paymentMethod: searchParams.get('paymentMethod') || '',
    paymentStatus: searchParams.get('paymentStatus') || '', orderStatus: searchParams.get('orderStatus') || '',
    source: searchParams.get('source') || '', fiscalStatus: searchParams.get('fiscalStatus') || '',
  }).current;
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [result, setResult] = useState<HistoryResponse>({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const sessionId = searchParams.get('sessionId') || '';

  const load = useCallback(async (page: number, active: Filters) => {
    try {
      setLoading(true);
      const params = Object.fromEntries(Object.entries(active).filter(([, value]) => value));
      const { data } = await api.get<HistoryResponse>('/orders/history', {
        params: { ...params, page, pageSize: 20, ...(sessionId ? { sessionId } : {}) },
      });
      setResult(data);
    } catch (error) {
      toast({ title: 'Erro ao carregar pedidos', description: apiMessage(error) || 'Tente novamente em alguns instantes.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast]);

  useEffect(() => { void load(1, initialFilters); }, [load, initialFilters]);

  const applyFilters = () => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) next.set(key, value); });
    if (sessionId) next.set('sessionId', sessionId);
    setSearchParams(next);
    void load(1, filters);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setSearchParams(sessionId ? { sessionId } : {});
    void load(1, emptyFilters);
  };

  const updateFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const changePage = (page: number) => void load(page, filters);
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const printOrder = async (order: HistoryOrder) => {
    try {
      const { data } = await api.get(`/orders/${order.id}/receipt`, { responseType: 'blob' });
      const url = URL.createObjectURL(data as Blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast({ title: 'Erro ao abrir a comanda', description: apiMessage(error) || 'Tente novamente.', variant: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de pedidos"
        description="Consulte vendas finalizadas e canceladas sem depender do fechamento do caixa."
        actions={<Badge variant="info">{result.total} pedido(s)</Badge>}
      />

      {sessionId && <Card className="bg-info-subtle"><CardContent>Filtro ativo: pedidos do turno #{sessionId.slice(-6).toUpperCase()}.</CardContent></Card>}

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Data inicial"><Input type="date" value={filters.startDate} onChange={(e) => updateFilter('startDate', e.target.value)} /></Field>
            <Field label="Data final"><Input type="date" value={filters.endDate} onChange={(e) => updateFilter('endDate', e.target.value)} /></Field>
            <Field label="Nome do cliente"><Input value={filters.customerName} onChange={(e) => updateFilter('customerName', e.target.value)} placeholder="Ex.: Maria" /></Field>
            <Field label="Código do pedido"><Input value={filters.code} onChange={(e) => updateFilter('code', e.target.value)} placeholder="#TN5LUK" /></Field>
            <Field label="Tipo"><Select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)}><option value="">Todos</option><option value="DINE_IN">Mesa</option><option value="TAKE_AWAY">Retirada</option><option value="DELIVERY">Entrega</option></Select></Field>
            <Field label="Forma de pagamento"><Select value={filters.paymentMethod} onChange={(e) => updateFilter('paymentMethod', e.target.value)}><option value="">Todas</option>{Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Situação do pagamento"><Select value={filters.paymentStatus} onChange={(e) => updateFilter('paymentStatus', e.target.value)}><option value="">Todas</option><option value="PAID">Pago</option><option value="PENDING">A receber</option><option value="CANCELED">Cancelado</option></Select></Field>
            <Field label="Situação do pedido"><Select value={filters.orderStatus} onChange={(e) => updateFilter('orderStatus', e.target.value)}><option value="">Todas</option><option value="FINISHED">Finalizado</option><option value="CANCELED">Cancelado</option></Select></Field>
            <Field label="Origem"><Select value={filters.source} onChange={(e) => updateFilter('source', e.target.value)}><option value="">Todas</option><option value="PDV">Balcão</option><option value="PUBLIC_MENU">Cardápio digital</option><option value="WAITER">Garçom</option></Select></Field>
            <Field label="Situação fiscal"><Select value={filters.fiscalStatus} onChange={(e) => updateFilter('fiscalStatus', e.target.value)}><option value="">Todas</option><option value="AUTHORIZED">Com nota autorizada</option><option value="WITHOUT">Sem nota</option><option value="REJECTED">Rejeitada</option></Select></Field>
          </div>
          <div className="flex flex-wrap gap-2"><Button onClick={applyFilters} leftIcon={<Search aria-hidden="true" />}>Pesquisar</Button><Button variant="secondary" onClick={clearFilters} leftIcon={<RotateCcw aria-hidden="true" />}>Limpar filtros</Button></div>
        </CardContent>
      </Card>

      {loading ? <div className="flex min-h-48 items-center justify-center text-muted"><Loader2 className="animate-spin" aria-label="Carregando pedidos" /></div> : !result.data.length ? (
        <EmptyState icon={<History />} title="Nenhum pedido encontrado" description="Ajuste os filtros para ampliar a busca." />
      ) : <div className="space-y-3">
        {result.data.map((order) => {
          const open = expanded.has(order.id);
          const responsible = order.waiter?.name || order.user?.name || 'não registrado';
          return <Card key={order.id} className={order.status === 'CANCELED' ? 'border-danger bg-danger-subtle' : undefined}>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[auto_1.2fr_1fr_1fr_auto_auto] lg:items-center">
                <div><p className="font-bold text-default">#{order.id.slice(-6).toUpperCase()}</p><p className="text-caption text-muted">{formatDateTime(order.createdAt)}</p></div>
                <div><p className="font-medium text-default">{order.customerName || 'Cliente não informado'}</p><p className="text-caption text-muted">{orderTypeLabels[order.type]} · {sourceLabels[order.source || 'PDV']}</p></div>
                <div><p>{order.payment ? paymentMethodLabels[order.payment.method] : 'Sem pagamento'}</p><p className="text-caption text-muted">{order.payment ? paymentStatusLabels[order.payment.status] : 'não registrado'}</p></div>
                <div>{order.invoice ? <Badge variant={order.invoice.status === 'authorized' ? 'success' : order.invoice.status === 'error' || order.invoice.status === 'canceled' ? 'danger' : 'warning'}>{invoiceStatusLabels[order.invoice.status]}</Badge> : <Badge variant="neutral">Sem nota</Badge>}</div>
                <p className="font-bold tabular-nums text-default">{formatCurrencyBRL(order.total)}</p>
                <div className="flex gap-2"><Button size="sm" variant="secondary" iconOnly aria-label={`Imprimir pedido ${order.id}`} onClick={() => void printOrder(order)}><Printer /></Button><Button size="sm" variant="secondary" iconOnly aria-label={`${open ? 'Recolher' : 'Expandir'} pedido ${order.id}`} onClick={() => toggle(order.id)}>{open ? <ChevronUp /> : <ChevronDown />}</Button></div>
              </div>
              {order.status === 'CANCELED' && <Badge variant="danger">Pedido cancelado</Badge>}
              {open && <div className="space-y-4 border-t border-default pt-4">
                <div className="grid gap-2 text-body text-muted md:grid-cols-3"><p><strong className="text-default">Mesa:</strong> {order.table?.number ?? 'não informada'}</p><p><strong className="text-default">Responsável:</strong> {responsible}</p><p><strong className="text-default">Taxa de entrega:</strong> {formatCurrencyBRL(Number(order.deliveryFee || 0))}</p></div>
                <Table><TableHeader><TableRow><TableHead>Quantidade</TableHead><TableHead>Produto vendido</TableHead><TableHead numeric>Valor</TableHead></TableRow></TableHeader><TableBody>{order.items.map((item) => <TableRow key={item.id}><TableCell>{quantityLabel(item)}</TableCell><TableCell><p className="font-medium">{item.productName || 'Produto removido'}</p>{item.notes && <p className="text-caption text-muted whitespace-pre-line">{item.notes}</p>}</TableCell><TableCell numeric>{formatCurrencyBRL(item.price)}</TableCell></TableRow>)}</TableBody></Table>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void printOrder(order)} leftIcon={<Printer />}>Imprimir comanda</Button>{order.invoice?.danfeUrl && <a href={order.invoice.danfeUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded-token-md bg-primary px-3 text-label font-semibold text-primary-fg"><FileText />Ver documento fiscal</a>}{order.invoice?.xmlUrl && <a href={order.invoice.xmlUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-token-md border border-default px-3 text-label font-semibold text-default">Baixar XML</a>}</div>
              </div>}
            </CardContent>
          </Card>;
        })}
      </div>}

      {result.totalPages > 1 && <div className="flex items-center justify-between"><Button variant="secondary" disabled={result.page <= 1 || loading} onClick={() => changePage(result.page - 1)}>Anterior</Button><p className="text-body text-muted">Página {result.page} de {result.totalPages}</p><Button variant="secondary" disabled={result.page >= result.totalPages || loading} onClick={() => changePage(result.page + 1)}>Próxima</Button></div>}
    </div>
  );
}
