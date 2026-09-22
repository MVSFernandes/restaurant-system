import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, Loader2, RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CashDifferenceBadge, CashSessionSummary } from '../../components/cash/CashSessionSummary';
import {
  Badge, Button, Card, CardContent, EmptyState, Field, Input, PageHeader,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useToast,
} from '../../components/ui';
import api from '../../services/api';
import type { CashRegisterSession } from '../../types';
import { getCashDifference, getOperatorName } from '../../utils/cashAudit';
import { formatCurrencyBRL } from '../../utils/currency';

interface ClosuresResponse {
  data: CashRegisterSession[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'não registrado';
const apiMessage = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message;

export default function CashClosuresPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedDates, setAppliedDates] = useState({ startDate: '', endDate: '' });
  const [result, setResult] = useState<ClosuresResponse>({ data: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async (page: number, dates: { startDate: string; endDate: string }) => {
    try {
      setLoading(true);
      const { data } = await api.get<ClosuresResponse>('/cash-register/closures-history', {
        params: { page, pageSize: 10, ...(dates.startDate ? { startDate: dates.startDate } : {}), ...(dates.endDate ? { endDate: dates.endDate } : {}) },
      });
      setResult(data);
    } catch (error) {
      toast({ title: 'Erro ao carregar fechamentos', description: apiMessage(error) || 'Tente novamente em alguns instantes.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(1, { startDate: '', endDate: '' }); }, [load]);

  const search = () => {
    const dates = { startDate, endDate };
    setAppliedDates(dates);
    void load(1, dates);
  };
  const clear = () => {
    setStartDate(''); setEndDate('');
    const dates = { startDate: '', endDate: '' };
    setAppliedDates(dates);
    void load(1, dates);
  };
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="space-y-6">
    <PageHeader title="Fechamentos de caixa" description="Confira turnos, responsáveis, movimentações e diferenças de caixa." actions={<Badge variant="info">{result.total} turno(s)</Badge>} />
    <Card><CardContent><div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"><Field label="Data inicial"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field><Field label="Data final"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field><Button onClick={search} leftIcon={<Search />}>Pesquisar</Button><Button variant="secondary" onClick={clear} leftIcon={<RotateCcw />}>Limpar</Button></div></CardContent></Card>

    {loading ? <div className="flex min-h-48 items-center justify-center text-muted"><Loader2 className="animate-spin" aria-label="Carregando fechamentos" /></div> : !result.data.length ? <EmptyState icon={<Clock3 />} title="Nenhum turno encontrado" description="Ajuste o período para ampliar a busca." /> : <div className="space-y-3">
      {result.data.map((session) => {
        const open = expanded.has(session.id);
        const difference = getCashDifference(session);
        return <Card key={session.id}>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto_auto_auto] lg:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-default">{formatDateTime(session.openedAt)}</p>{session.status === 'OPEN' ? <Badge variant="success">Em andamento</Badge> : <Badge variant="neutral">Fechado</Badge>}</div><p className="text-caption text-muted">Fechamento: {session.closedAt ? formatDateTime(session.closedAt) : 'em andamento'}</p></div>
              <div className="text-body"><p>Abriu: {getOperatorName(session.openedBy)}</p><p className="text-muted">Fechou: {getOperatorName(session.closedBy)}</p></div>
              <div><p className="font-semibold text-default">{session.orderCount || 0} pedido(s)</p><p className="text-caption text-muted">{formatCurrencyBRL(Number(session.totalRevenue || 0))} faturados</p></div>
              <div>{session.status === 'OPEN' || difference === null ? <span className="text-body text-muted">Sem conferência</span> : <CashDifferenceBadge difference={difference} />}</div>
              <Button size="sm" variant="secondary" iconOnly aria-label={`${open ? 'Recolher' : 'Expandir'} turno ${session.id}`} onClick={() => toggle(session.id)}>{open ? <ChevronUp /> : <ChevronDown />}</Button>
            </div>
            {open && <div className="space-y-5 border-t border-default pt-5">
              <CashSessionSummary session={session} showClosing={session.status === 'CLOSED'} />
              <Card className="bg-surface-sunken"><CardContent className="space-y-3"><h3 className="font-semibold text-default">Sangrias do turno</h3>{!session.withdrawals?.length ? <EmptyState title="Nenhuma sangria registrada" /> : <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Motivo</TableHead><TableHead>Operador</TableHead><TableHead numeric>Valor</TableHead></TableRow></TableHeader><TableBody>{session.withdrawals.map((withdrawal) => <TableRow key={withdrawal.id}><TableCell>{formatDateTime(withdrawal.createdAt)}</TableCell><TableCell>{withdrawal.reason}</TableCell><TableCell>{getOperatorName(withdrawal.createdBy)}</TableCell><TableCell numeric>{formatCurrencyBRL(withdrawal.amount)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
              <div><Link to={`/pdv/orders-history?sessionId=${encodeURIComponent(session.id)}`} className="font-semibold text-primary hover:underline">Ver pedidos deste turno no Histórico de pedidos</Link></div>
            </div>}
          </CardContent>
        </Card>;
      })}
    </div>}

    {result.totalPages > 1 && <div className="flex items-center justify-between"><Button variant="secondary" disabled={result.page <= 1 || loading} onClick={() => void load(result.page - 1, appliedDates)}>Anterior</Button><p className="text-body text-muted">Página {result.page} de {result.totalPages}</p><Button variant="secondary" disabled={result.page >= result.totalPages || loading} onClick={() => void load(result.page + 1, appliedDates)}>Próxima</Button></div>}
  </div>;
}
