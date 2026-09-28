import React from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { useMenuViewers } from '../hooks/useMenuViewers';
import { useOrderEvents } from '../hooks/useOrderEvents';
import api from '../services/api';
import type { CashRegisterSession, Order, Table as RestaurantTable } from '../types';
import { formatCurrencyBRL } from '../utils/currency';
import {
  buttonClasses,
  Card,
  CashClosedIcon,
  ChevronRightIcon,
  OrderIcon,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui';

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

type Resource<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const LOADING = { status: 'loading' } as const;

interface Payable {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  paid: boolean;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

function useResource<T>(load: () => Promise<T>) {
  const [resource, setResource] = React.useState<Resource<T>>(LOADING);

  // Só troca o estado depois da resposta: uma nova busca não pisca a tela.
  const refresh = React.useCallback(async () => {
    try {
      const data = await load();
      setResource({ status: 'ready', data });
    } catch (error) {
      console.error(error);
      setResource({ status: 'error' });
    }
  }, [load]);

  return [resource, refresh] as const;
}

const UNAVAILABLE = 'Não disponível';

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

// Mesma regra de PayablesPage (isOverdue): compara a data local do vencimento.
const dueDay = (dueDate: string) => {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due;
};

function todayTitle() {
  const text = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

function shiftDescription(session: CashRegisterSession) {
  const opened = new Date(session.openedAt);
  const time = opened.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = opened.toDateString() === new Date().toDateString();
  const when = sameDay ? `às ${time}` : `em ${opened.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`;
  return `Turno aberto ${when} por ${session.openedBy?.name || 'responsável não registrado'}.`;
}

function splitCurrency(formatted: string) {
  const match = formatted.match(/^(R\$)\s(.+)$/);
  return match ? { symbol: match[1], amount: match[2] } : { symbol: '', amount: formatted };
}

const count = (value: number) => value.toLocaleString('pt-BR');

// ---------------------------------------------------------------------------
// Fita de números (padrão documentado em design-system.md, seção 4)
// ---------------------------------------------------------------------------

type LoadState = 'loading' | 'error' | 'ready';

type RibbonCell = {
  label: string;
  value: string;
  money?: boolean;
  caption?: string;
  attention?: boolean;
  link?: string;
  /** Estado próprio, quando a célula vem de outra fonte que o resto da fita. */
  state?: LoadState;
};

// Divisórias entre células. A primeira célula, quando é principal, ocupa a
// linha inteira no celular; as demais dividem a linha de baixo.
function cellBorder(total: number, index: number, lead: boolean) {
  if (index === 0) return lead ? 'col-span-full border-b border-default lg:col-span-1 lg:border-b-0' : '';
  if (lead) return index === 1 ? 'lg:border-l lg:border-default' : 'border-l border-default';
  // Sem célula principal: 2×2 no celular, uma linha no desktop.
  if (total === 4) {
    return [
      '',
      'border-l border-default',
      'border-t border-default lg:border-l lg:border-t-0',
      'border-l border-t border-default lg:border-t-0',
    ][index];
  }
  return 'border-l border-default';
}

const gridColumns: Record<string, string> = {
  'lead-3': 'grid-cols-2 lg:grid-cols-[1.75fr_1fr_1fr]',
  'lead-4': 'grid-cols-3 lg:grid-cols-[1.75fr_1fr_1fr_1fr]',
  'even-4': 'grid-cols-2 lg:grid-cols-4',
};

const NumberRibbon: React.FC<{
  cells: RibbonCell[];
  state: LoadState;
  lead?: boolean;
  className?: string;
}> = ({ cells, state: ribbonState, lead = false, className }) => (
  // !p-0: o p-card do Card é gerado depois de p-0 e venceria.
  <Card className={clsx('overflow-hidden !p-0', className)}>
    <ul className={clsx('grid', gridColumns[`${lead ? 'lead' : 'even'}-${cells.length}`])}>
      {cells.map((cell, index) => {
        const isLead = lead && index === 0;
        const state = cell.state ?? ribbonState;
        const attention = state === 'ready' && cell.attention;
        const { symbol, amount } = cell.money ? splitCurrency(cell.value) : { symbol: '', amount: cell.value };

        const body = (
          <>
            <span className="flex items-center gap-2 text-label text-muted">
              {cell.label}
              {attention && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
            </span>

            {state === 'loading' ? (
              <Skeleton className={clsx('self-end', isLead ? 'h-9 w-44' : 'h-7 w-12')} />
            ) : state === 'error' ? (
              <span className="self-baseline text-body text-muted">{UNAVAILABLE}</span>
            ) : (
              <span
                className={clsx(
                  'flex items-baseline gap-1.5 self-baseline tabular-nums tracking-tight',
                  attention ? 'text-warning-strong' : 'text-default'
                )}
              >
                {symbol && <span className="text-heading font-semibold text-muted">{symbol}</span>}
                <span className={isLead ? 'text-display' : 'text-title'}>{amount}</span>
              </span>
            )}

            <span className="-mt-1 text-caption tabular-nums text-muted">
              {state === 'ready' ? cell.caption : null}
            </span>
          </>
        );

        const cellClass = 'row-span-3 grid grid-rows-subgrid gap-y-3 px-card py-5 lg:px-6 lg:py-6';

        return (
          <li key={cell.label} className={clsx('row-span-3 grid grid-rows-subgrid', cellBorder(cells.length, index, lead))}>
            {cell.link ? (
              <Link
                to={cell.link}
                className={clsx(cellClass, 'transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-offset-[-2px]')}
              >
                {body}
              </Link>
            ) : (
              <div className={cellClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  </Card>
);

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

const SectionTitle: React.FC<{ children: React.ReactNode; className?: string; id?: string }> = ({ children, className, id }) => (
  <h2 id={id} className={clsx('text-heading text-default', className)}>{children}</h2>
);

const Unavailable: React.FC = () => <p className="text-body text-muted">{UNAVAILABLE}</p>;

const ShiftClosed: React.FC<{ canOpen: boolean }> = ({ canOpen }) => (
  <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-token-lg bg-surface-sunken text-muted">
      <CashClosedIcon size={22} strokeWidth={1.75} aria-hidden="true" />
    </span>
    <div className="flex-1">
      <SectionTitle>Nenhum turno aberto</SectionTitle>
      <p className="mt-1 text-body text-muted">
        Faturamento, pedidos em andamento e pagamentos aparecem aqui quando o caixa for aberto.
      </p>
    </div>
    {canOpen && (
      <Link to="/pdv/cash-register" className={buttonClasses({ variant: 'secondary' })}>
        Abrir caixa
      </Link>
    )}
  </Card>
);

const PAYMENT_GROUPS = (session: CashRegisterSession) => [
  { destination: 'Gaveta', rows: [{ label: 'Dinheiro', amount: Number(session.totalEntries || 0) }] },
  {
    destination: 'Banco',
    rows: [
      { label: 'PIX', amount: Number(session.pixTotal || 0) },
      { label: 'Débito', amount: Number(session.debitTotal || 0) },
      { label: 'Crédito', amount: Number(session.creditTotal || 0) },
    ],
  },
  { destination: 'A receber', rows: [{ label: 'Fiado', amount: Number(session.onAccountTotal || 0) }] },
];

const percent = (part: number, total: number) => (total > 0 ? part / total : 0);

const ShiftPayments: React.FC<{ session: CashRegisterSession }> = ({ session }) => {
  const total = Number(session.totalRevenue || 0);
  const groups = PAYMENT_GROUPS(session);

  return (
    <Card>
      <SectionTitle>Pagamentos do turno</SectionTitle>
      <div className="mt-5 space-y-5">
        {groups.map((group) => {
          const subtotal = group.rows.reduce((sum, row) => sum + row.amount, 0);
          return (
            <section key={group.destination} aria-label={group.destination}>
              <div className="flex items-baseline justify-between gap-4 border-b border-default pb-2">
                <h3 className="text-label text-muted">{group.destination}</h3>
                <span className="text-body font-semibold tabular-nums text-default">{formatCurrencyBRL(subtotal)}</span>
              </div>
              <ul className="mt-2 space-y-1">
                {group.rows.map((row) => {
                  const share = percent(row.amount, total);
                  return (
                    <li
                      key={row.label}
                      className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] items-center gap-3 py-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_3rem_6.5rem]"
                    >
                      <span className="text-body text-default">{row.label}</span>
                      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-fill-neutral">
                        <span
                          className="block h-full rounded-full bg-info"
                          style={{ width: row.amount > 0 ? `max(${(share * 100).toFixed(2)}%, 4px)` : 0 }}
                        />
                      </span>
                      <span className="hidden text-right text-caption tabular-nums text-muted sm:block">
                        {Math.round(share * 100)}%
                      </span>
                      <span className="text-right text-body tabular-nums text-default">{formatCurrencyBRL(row.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-4 rounded-token-md bg-surface-sunken px-4 py-3">
        <span className="text-body font-semibold text-default">Total faturado</span>
        <span className="text-heading tabular-nums text-default">{formatCurrencyBRL(total)}</span>
      </div>
      <p className="mt-3 text-caption text-muted">PIX, débito, crédito e fiado não passam pela gaveta física.</p>
    </Card>
  );
};

type AttentionItem = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  link?: { to: string; label: string };
  unavailable?: boolean;
};

const AttentionList: React.FC<{ items: AttentionItem[]; loading: boolean }> = ({ items, loading }) => (
  <Card>
    <SectionTitle>Precisa de atenção</SectionTitle>
    {loading ? (
      <div role="status" className="mt-4 space-y-4">
        <span className="sr-only">Carregando pendências</span>
        {[0, 1, 2].map((row) => (
          <div key={row} className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-28" /></div>
        ))}
      </div>
    ) : items.length === 0 ? (
      <p className="mt-3 text-body text-muted">Nada pendente agora.</p>
    ) : (
      <ul className="mt-2 divide-y divide-default">
        {items.map((item) => (
          <li key={item.key} className="py-3.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-body text-default">{item.label}</span>
              {item.unavailable ? (
                <span className="text-body text-muted">{UNAVAILABLE}</span>
              ) : (
                <span className="flex items-center gap-2 text-body font-semibold tabular-nums text-warning-strong">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {item.value}
                </span>
              )}
            </div>
            {item.detail && <p className="mt-1 truncate text-caption text-muted">{item.detail}</p>}
            {item.link && (
              <Link
                to={item.link.to}
                className="mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-token-sm text-label text-default hover:underline"
              >
                {item.link.label}
                <ChevronRightIcon size={14} aria-hidden="true" className="text-subtle" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    )}
  </Card>
);

const TopProducts: React.FC<{ resource: Resource<TopProduct[]> }> = ({ resource }) => (
  <Card>
    <SectionTitle>Mais vendidos hoje</SectionTitle>
    <div className="mt-4">
      {resource.status === 'loading' ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Carregando mais vendidos</span>
          {[0, 1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-5 w-full" />)}
        </div>
      ) : resource.status === 'error' ? (
        <Unavailable />
      ) : resource.data.length === 0 ? (
        <p className="text-body text-muted">Nenhuma venda registrada hoje.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead numeric>Quantidade</TableHead>
              <TableHead numeric>Receita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resource.data.slice(0, 5).map((product, index) => (
              <TableRow key={`${product.name}-${index}`}>
                <TableCell>
                  <span className="mr-3 inline-block w-4 tabular-nums text-muted">{index + 1}</span>
                  {product.name}
                </TableCell>
                <TableCell numeric>{count(Number(product.quantity || 0))}</TableCell>
                <TableCell numeric>{formatCurrencyBRL(Number(product.revenue || 0))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  </Card>
);

const LiveViewers: React.FC<{ count: number }> = ({ count: viewers }) => (
  <span
    role="status"
    aria-live="polite"
    className="inline-flex h-10 items-center gap-2.5 rounded-full border border-default bg-surface px-4 text-body text-muted"
  >
    <span aria-hidden="true" className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
    </span>
    <span>
      <span className="font-semibold tabular-nums text-default">{count(viewers)}</span> no cardápio digital
    </span>
  </span>
);

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

const fetchCurrent = async () => (await api.get<CashRegisterSession | null>('/cash-register/current')).data ?? null;
const fetchOrders = async () => (await api.get<Order[]>('/orders')).data ?? [];
const fetchTables = async () => (await api.get<RestaurantTable[]>('/tables')).data ?? [];
const fetchLowStock = async () => (await api.get<{ id: string; name: string }[]>('/stock/low')).data ?? [];
const fetchTopProducts = async () =>
  ((await api.get<{ topProducts?: TopProduct[] }>('/finance/reports?period=today')).data?.topProducts ?? []);
const fetchPayables = async () => (await api.get<Payable[]>('/finance/payables')).data ?? [];

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role;
  const canOperate = role === 'ADMIN' || role === 'CASHIER';
  const canSeeFinance = role === 'ADMIN' || role === 'FINANCE';
  const viewers = useMenuViewers();

  const [current, refreshCurrent] = useResource(fetchCurrent);
  const [orders, refreshOrders] = useResource(fetchOrders);
  const [tables, refreshTables] = useResource(fetchTables);
  const [lowStock, refreshLowStock] = useResource(fetchLowStock);
  const [topProducts, refreshTopProducts] = useResource(fetchTopProducts);
  const [payables, refreshPayables] = useResource(fetchPayables);

  const refreshLive = React.useCallback(() => {
    void refreshCurrent();
    void refreshOrders();
    void refreshTables();
  }, [refreshCurrent, refreshOrders, refreshTables]);

  React.useEffect(() => {
    refreshLive();
    void refreshLowStock();
    if (canSeeFinance) {
      void refreshTopProducts();
      void refreshPayables();
    }
  }, [refreshLive, refreshLowStock, refreshTopProducts, refreshPayables, canSeeFinance]);

  // Turno, pedidos e mesas acompanham os eventos de pedido (com reforço a cada 30s).
  useOrderEvents(refreshLive);

  const session = current.status === 'ready' ? current.data : null;
  const shiftClosed = current.status === 'ready' && current.data === null;

  // --- Fita do turno -------------------------------------------------------
  const occupied = tables.status === 'ready' ? tables.data.filter((t) => t.status === 'OCCUPIED').length : 0;
  const openOnTables =
    tables.status === 'ready'
      ? tables.data.reduce((sum, t) => sum + (t.orders ?? []).reduce((acc, o) => acc + Number(o.total || 0), 0), 0)
      : 0;

  const shiftCells: RibbonCell[] = [
    {
      label: 'Faturamento do turno',
      value: formatCurrencyBRL(Number(session?.totalRevenue || 0)),
      money: true,
      link: canOperate ? '/pdv/cash-register' : undefined,
    },
    {
      label: 'Pedidos do turno',
      value: count(Number(session?.orderCount || 0)),
      link: canOperate && session ? `/pdv/orders-history?sessionId=${encodeURIComponent(session.id)}` : undefined,
    },
    {
      label: 'Mesas ocupadas',
      value: tables.status === 'ready' ? `${count(occupied)} de ${count(tables.data.length)}` : '',
      caption: tables.status === 'ready' ? `${formatCurrencyBRL(openOnTables)} em aberto` : undefined,
      link: canOperate ? '/pdv/tables' : undefined,
      state: tables.status,
    },
  ];

  // --- Agora: pedidos ativos por situação ---------------------------------
  const byStatus = (status: Order['status']) =>
    orders.status === 'ready' ? orders.data.filter((o) => o.status === status).length : 0;
  const ready = byStatus('READY');
  const awaitingPayment = byStatus('DELIVERED');
  const flowCells: RibbonCell[] = [
    { label: 'Novos', value: count(byStatus('NEW')) },
    { label: 'Em preparo', value: count(byStatus('IN_PROGRESS')) },
    { label: 'Prontos', value: count(ready), attention: ready > 0 },
    { label: 'Entregues, aguardando pagamento', value: count(awaitingPayment), attention: awaitingPayment > 0 },
  ].map((cell) => ({ ...cell, link: canOperate ? '/pdv/orders' : undefined }));

  // --- Precisa de atenção --------------------------------------------------
  const attention: AttentionItem[] = [];
  const attentionLoading =
    current.status === 'loading' || lowStock.status === 'loading' || (canSeeFinance && payables.status === 'loading');

  if (current.status === 'error') {
    attention.push({ key: 'fiscal', label: 'Notas fiscais pendentes ou rejeitadas', value: '', unavailable: true });
  } else if (session) {
    const fiscal = Number(session.fiscalDocuments?.pendingOrRejectedCount || 0);
    if (fiscal > 0) {
      attention.push({
        key: 'fiscal',
        label: 'Notas fiscais pendentes ou rejeitadas',
        value: count(fiscal),
        detail: 'Neste turno.',
        link: canOperate ? { to: '/pdv/orders-history?fiscalStatus=REJECTED', label: 'Ver rejeitadas no histórico' } : undefined,
      });
    }
  }

  if (lowStock.status === 'error') {
    attention.push({ key: 'stock', label: 'Insumos em falta', value: '', unavailable: true });
  } else if (lowStock.status === 'ready' && lowStock.data.length > 0) {
    const names = lowStock.data.map((item) => item.name);
    const extra = names.length > 3 ? ` e mais ${names.length - 3}` : '';
    attention.push({
      key: 'stock',
      label: 'Insumos em falta',
      value: count(names.length),
      detail: names.slice(0, 3).join(', ') + extra,
      link: canSeeFinance ? { to: '/stock/items', label: 'Ver insumos' } : undefined,
    });
  }

  if (canSeeFinance) {
    if (payables.status === 'error') {
      attention.push({ key: 'payables', label: 'Contas vencendo hoje', value: '', unavailable: true });
    } else if (payables.status === 'ready') {
      const today = startOfToday().getTime();
      const open = payables.data.filter((p) => !p.paid);
      const dueToday = open.filter((p) => dueDay(p.dueDate).getTime() === today);
      const overdue = open.filter((p) => dueDay(p.dueDate).getTime() < today);
      if (dueToday.length > 0 || overdue.length > 0) {
        const names = dueToday.map((p) => p.description);
        const detailParts = [];
        if (names.length > 0) detailParts.push(names.slice(0, 2).join(', ') + (names.length > 2 ? ` e mais ${names.length - 2}` : ''));
        if (overdue.length > 0) detailParts.push(overdue.length === 1 ? '1 conta atrasada' : `${overdue.length} contas atrasadas`);
        attention.push({
          key: 'payables',
          label: 'Contas vencendo hoje',
          value: formatCurrencyBRL(dueToday.reduce((sum, p) => sum + Number(p.amount || 0), 0)),
          detail: detailParts.join('. ') + '.',
          link: { to: '/finance/payables', label: 'Ver contas a pagar' },
        });
      }
    }
  }

  const description =
    current.status === 'ready'
      ? session
        ? shiftDescription(session)
        : 'Nenhum turno aberto.'
      : current.status === 'error'
        ? 'Situação do turno não disponível.'
        : 'Resumo do turno.';

  return (
    <div>
      <PageHeader
        title={todayTitle()}
        description={description}
        actions={
          <>
            <LiveViewers count={viewers} />
            {canOperate && (
              <Link to="/pdv/orders" className={buttonClasses()}>
                <OrderIcon aria-hidden="true" />
                Novo pedido
              </Link>
            )}
          </>
        }
      />

      {shiftClosed ? (
        <ShiftClosed canOpen={canOperate} />
      ) : (
        <NumberRibbon lead state={current.status} cells={shiftCells} />
      )}

      {!shiftClosed && (
        <section className="mt-section" aria-labelledby="dashboard-now">
          <SectionTitle id="dashboard-now" className="mb-3">Agora</SectionTitle>
          <NumberRibbon state={orders.status} cells={flowCells} />
        </section>
      )}

      {/* "Precisa de atenção" vem antes no código para ficar acima no celular
          (ordem de urgência); no desktop vai para a coluna da direita. */}
      <div className="mt-section grid items-start gap-section lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="lg:col-start-2 lg:row-start-1">
          <AttentionList items={attention} loading={attentionLoading} />
        </div>
        <div className="space-y-section lg:col-start-1 lg:row-start-1">
          {!shiftClosed &&
            (current.status === 'loading' ? (
              <Card>
                <SectionTitle>Pagamentos do turno</SectionTitle>
                <div role="status" className="mt-5 space-y-4">
                  <span className="sr-only">Carregando pagamentos</span>
                  {[0, 1, 2, 3, 4].map((row) => <Skeleton key={row} className="h-5 w-full" />)}
                </div>
              </Card>
            ) : current.status === 'error' ? (
              <Card>
                <SectionTitle>Pagamentos do turno</SectionTitle>
                <div className="mt-3"><Unavailable /></div>
              </Card>
            ) : (
              session && <ShiftPayments session={session} />
            ))}
          {canSeeFinance && <TopProducts resource={topProducts} />}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
