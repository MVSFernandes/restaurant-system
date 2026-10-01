import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useWaiterTableEvents } from '../../hooks/useWaiterTableEvents';
import { ROLE_LABELS } from '../../constants/roles';
import { formatCurrencyBRL } from '../../utils/currency';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import {
  Button,
  EmptyState,
  LogoutIcon,
  OfflineIcon,
  Skeleton,
  TableIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui';
import type { TableOverviewView, WaiterTableOverview } from '../../types';
import {
  FREE_TABLE_BORDER,
  displayNumber,
  fitAmountFontSize,
  formatOpenFor,
  splitCurrency,
  spokenOpenFor,
  tabCountLabel,
} from './tableFormat';

const VIEWS: { value: TableOverviewView; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'mine', label: 'Minhas' },
  { value: 'free', label: 'Livres' },
];

const isView = (value: string | null): value is TableOverviewView =>
  VIEWS.some((view) => view.value === value);

type CashState = 'loading' | 'open' | 'closed' | 'unknown';

// Cada resultado guarda o filtro a que pertence: trocar de filtro mostra
// carregamento até a resposta nova chegar, nunca a grade do filtro anterior.
type Overview =
  | { state: 'loading' }
  | { state: 'error'; view: TableOverviewView }
  // receivedAt: relógio local na chegada. O tempo de mesa soma o que passou
  // desde então ao openForMinutes do servidor, sem depender do fuso do aparelho.
  | { state: 'ready'; view: TableOverviewView; tables: WaiterTableOverview[]; receivedAt: number };

// O saldo é 16px sempre que cabe. Onde não cabe (cartão estreito, valor
// grande), desce até 12px em vez de separar o "R$" do valor. O "R$" com o
// espaço ocupa 16px; 17px dá 1px de folga.
const amountFontSize = (amount: string) => fitAmountFontSize(amount, { max: 16, min: 12, reserve: 17 });

// Peso visual por situação: a mesa ocupada é cheia e colorida; a livre fica
// quieta. Num salão quase vazio, as ocupadas precisam saltar.
const cardTone = {
  OCCUPIED: { card: 'border-primary bg-primary-subtle', label: 'text-primary-strong', text: 'Ocupada' },
  // A borda da mesa livre é um remendo provisório; ver FREE_TABLE_BORDER.
  AVAILABLE: {
    card: clsx(FREE_TABLE_BORDER, 'bg-surface hover:bg-surface-hover'),
    label: 'text-success-strong',
    text: 'Livre',
  },
} as const;

const cardBase =
  'flex h-32 min-w-0 flex-col rounded-token-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';
const numberText = 'text-[26px] font-bold leading-[30px] tabular-nums';
const statusText = 'mt-1 text-[10px] font-bold uppercase leading-[13px] tracking-[0.4px]';
const metaText = 'text-[11px] leading-[14px] text-muted';

const TableCard: React.FC<{ table: WaiterTableOverview; elapsedMinutes: number }> = ({ table, elapsedMinutes }) => {
  const href = `/waiter/tables/${encodeURIComponent(table.id)}`;

  if (table.status === 'AVAILABLE') {
    const tone = cardTone.AVAILABLE;
    // O convite discreto no rodapé equilibra o cartão, que sem ele fica oco.
    return (
      <Link to={href} aria-label={`Mesa ${table.number}, livre. Abrir mesa.`} className={clsx(cardBase, tone.card)}>
        <span className={numberText}>{displayNumber(table.number)}</span>
        <span className={clsx(statusText, tone.label)}>{tone.text}</span>
        <span className="mt-auto text-caption text-muted">Abrir mesa</span>
      </Link>
    );
  }

  const tone = cardTone.OCCUPIED;

  // Ocupada sem comanda aberta: pedido lançado fora de comanda (pelo caixa).
  // Não há saldo de comanda para mostrar, e zero seria inventado.
  const hasTabs = table.openTabCount > 0;
  const minutes = table.openForMinutes === null ? null : table.openForMinutes + elapsedMinutes;
  const [currency, amount] = splitCurrency(formatCurrencyBRL(table.openBalance));

  const spoken = [
    `Mesa ${table.number}, ocupada`,
    minutes !== null && `aberta há ${spokenOpenFor(minutes)}`,
    hasTabs ? `${formatCurrencyBRL(table.openBalance)} em aberto, ${tabCountLabel(table.openTabCount)}` : 'sem comanda aberta',
  ].filter(Boolean).join(', ');

  return (
    <Link
      to={href}
      aria-label={spoken}
      className={clsx(cardBase, '[container-type:inline-size]', tone.card)}
    >
      <span className="flex items-baseline gap-1">
        <span className={numberText}>{displayNumber(table.number)}</span>
        {minutes !== null && (
          <span className="ml-auto whitespace-nowrap text-[11px] leading-[14px] tabular-nums text-muted">
            {formatOpenFor(minutes)}
          </span>
        )}
      </span>
      <span className={clsx(statusText, tone.label)}>{tone.text}</span>

      {hasTabs ? (
        <span className="mt-auto">
          {/* Símbolo e valor são uma coisa só: nunca quebram entre si. */}
          <span className="flex items-baseline gap-x-0.5 whitespace-nowrap">
            <span className="text-[11px] leading-[14px] text-muted">{currency}</span>
            <span className="font-bold leading-5 tabular-nums" style={{ fontSize: amountFontSize(amount) }}>
              {amount}
            </span>
          </span>
          <span className={clsx('block', metaText)}>{tabCountLabel(table.openTabCount)}</span>
        </span>
      ) : (
        <span className={clsx('mt-auto', metaText)}>Sem comanda</span>
      )}
    </Link>
  );
};

const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-3 gap-3" aria-hidden="true">
    {Array.from({ length: 9 }, (_, index) => (
      <div key={index} className="flex h-32 flex-col rounded-token-lg border border-default bg-surface p-3">
        <Skeleton className="h-7 w-8" />
        <Skeleton className="mt-1.5 h-3 w-12" />
      </div>
    ))}
  </div>
);

const emptyByView: Record<TableOverviewView, { title: string; description?: string }> = {
  all: { title: 'Nenhuma mesa cadastrada.', description: 'As mesas são cadastradas pelo administrador.' },
  mine: { title: 'Você não tem comanda aberta.', description: 'As mesas em que você abrir comanda aparecem aqui.' },
  free: { title: 'Nenhuma mesa livre agora.' },
};

const WaiterTablesOverviewPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view: TableOverviewView = isView(viewParam) ? viewParam : 'all';

  const [result, setResult] = useState<Overview>({ state: 'loading' });
  const [cash, setCash] = useState<CashState>('loading');
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    return Promise.allSettled([
      api.get<WaiterTableOverview[]>('/tables/overview', { params: { view } }),
      api.get('/cash-register/current'),
    ]).then(([tablesResult, cashResult]) => {
      // Resposta de um filtro anterior chegando atrasada não sobrescreve a atual.
      if (id !== requestId.current) return;

      // Falhou: a grade antiga não pode mais ser confirmada e sai da tela.
      setResult(
        tablesResult.status === 'fulfilled'
          ? { state: 'ready', view, tables: tablesResult.value.data, receivedAt: Date.now() }
          : { state: 'error', view }
      );
      setCash(
        cashResult.status === 'fulfilled'
          ? cashResult.value.data?.status === 'OPEN' ? 'open' : 'closed'
          : 'unknown'
      );
      setNow(Date.now());
    });
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  const overview: Overview = result.state !== 'loading' && result.view === view ? result : { state: 'loading' };

  useWaiterTableEvents(load);

  // O tempo de mesa anda sozinho entre uma consulta e outra.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const changeView = (next: string) => {
    if (!isView(next)) return;
    setSearchParams(next === 'all' ? {} : { view: next }, { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const elapsedMinutes =
    overview.state === 'ready' ? Math.max(0, Math.floor((now - overview.receivedAt) / 60_000)) : 0;

  return (
    <div className={clsx(WAITER_COLUMN, 'px-3')}>
      <header className="flex items-start justify-between gap-3 pb-3 pt-5">
        <div className="min-w-0 px-1">
          <h1 className="text-title tracking-tight">Mesas</h1>
          {user && (
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-body text-muted">
              <span className="truncate font-medium text-default">{user.name}</span>
              <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-fill-neutral" />
              <span className="sr-only">,</span>
              <span className="shrink-0">{ROLE_LABELS[user.role] ?? user.role}</span>
            </p>
          )}
        </div>
        <Button variant="ghost" size="lg" iconOnly aria-label="Sair" title="Sair" onClick={handleSignOut}>
          <LogoutIcon strokeWidth={1.75} />
        </Button>
      </header>

      {cash === 'closed' && (
        <p role="status" className="mb-3 rounded-token-md bg-warning-subtle px-3 py-2.5 text-body text-warning-strong">
          Caixa fechado. Não dá para lançar pedidos agora.
        </p>
      )}
      {cash === 'unknown' && (
        <p role="status" className="mb-3 rounded-token-md bg-surface-sunken px-3 py-2.5 text-body text-muted">
          Não foi possível confirmar a situação do caixa.
        </p>
      )}

      <Tabs value={view} onValueChange={changeView}>
        <div className="sticky top-0 z-20 -mx-3 bg-canvas/95 px-3 py-2 backdrop-blur">
          {/* Um grupo só: a aba ativa é um cartão levantado; as outras, texto dentro do contêiner. */}
          <TabsList aria-label="Filtrar mesas" className="grid w-full grid-cols-3 gap-1 rounded-token-lg">
            {VIEWS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-11 rounded-token-md border border-transparent text-body font-medium aria-selected:border-default"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={view} aria-busy={overview.state === 'loading'} className="!mt-0 rounded-token-lg pb-6 pt-2">
          {overview.state === 'loading' && <GridSkeleton />}

          {overview.state === 'error' && (
            <EmptyState
              icon={<OfflineIcon size={28} strokeWidth={1.75} />}
              title="Mesas não disponíveis"
              description="Não foi possível carregar as mesas. A tela tenta de novo sozinha."
              action={<Button variant="secondary" size="lg" onClick={() => void load()}>Tentar de novo</Button>}
            />
          )}

          {overview.state === 'ready' && overview.tables.length === 0 && (
            <EmptyState
              icon={<TableIcon size={28} strokeWidth={1.75} />}
              title={emptyByView[view].title}
              description={emptyByView[view].description}
            />
          )}

          {overview.state === 'ready' && overview.tables.length > 0 && (
            <ul className="grid grid-cols-3 gap-3">
              {[...overview.tables]
                .sort((a, b) => a.number - b.number)
                .map((table) => (
                  <li key={table.id} className="grid min-w-0">
                    <TableCard table={table} elapsedMinutes={elapsedMinutes} />
                  </li>
                ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WaiterTablesOverviewPage;
