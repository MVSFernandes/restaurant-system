import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '../../services/api';
import { useWaiterTableEvents } from '../../hooks/useWaiterTableEvents';
import { formatCurrencyBRL } from '../../utils/currency';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import {
  AddIcon,
  BackIcon,
  Button,
  ChevronRightIcon,
  EmptyState,
  Skeleton,
  WarningIcon,
} from '../../components/ui';
import type { WaiterTableOverview, WaiterTableTab, WaiterTableTabsResponse } from '../../types';
import {
  FREE_TABLE_BORDER,
  displayNumber,
  fitAmountFontSize,
  formatOpenFor,
  splitCurrency,
  spokenOpenFor,
  tabCountLabel,
} from './tableFormat';

// Tela 2 — Mesa aberta (docs/tela-mesa-aberta.md).
// Responde: de quem é cada conta desta mesa, e quanto cada uma deve.

type Loaded = {
  table: WaiterTableOverview;
  tabs: WaiterTableTab[];
  // Relógio local na chegada: o tempo de mesa soma o que passou desde então
  // ao openForMinutes do servidor, como na tela de Mesas.
  receivedAt: number;
};

type ScreenState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'not-found' }
  | ({ state: 'ready' } & Loaded);

const isNotFound = (reason: unknown) =>
  (reason as { response?: { status?: number } })?.response?.status === 404;

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Primeira letra do primeiro nome e do último; um nome só, as duas primeiras.
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
  return letters.toLocaleUpperCase('pt-BR');
}

const itemsParts = (tab: WaiterTableTab): string[] => {
  if (tab.itemCount === 0) return ['sem itens'];
  const items = `${tab.itemCount} ${tab.itemCount === 1 ? 'item' : 'itens'}`;
  return tab.lastOrderAt ? [items, `último às ${formatClock(tab.lastOrderAt)}`] : [items];
};

// Saldo zero (ou centavo de arredondamento) é comanda paga.
const isPaid = (balance: number) => Math.abs(balance) < 0.005;

// O valor do bloco de saldo é 30px sempre que cabe e encolhe até 20px onde
// não cabe. "R$" em 18px com o espaço ocupa 27px; 29px dá folga.
const totalFontSize = (amount: string) =>
  fitAmountFontSize(amount, { max: 30, min: 20, reserve: 29, tracking: -0.6 });

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

const Header: React.FC<{ screen: ScreenState; minutes: number | null }> = ({ screen, minutes }) => {
  const ready = screen.state === 'ready' ? screen : null;
  const occupied = ready?.table.status === 'OCCUPIED';

  let subtitle: React.ReactNode = null;
  if (screen.state === 'error') subtitle = 'Não disponível';
  if (ready) {
    if (!occupied) subtitle = 'Livre';
    else if (ready.table.openedAt && minutes !== null) {
      subtitle = (
        <>
          <span aria-hidden="true">Aberta às {formatClock(ready.table.openedAt)} · {formatOpenFor(minutes)}</span>
          <span className="sr-only">Aberta às {formatClock(ready.table.openedAt)}, há {spokenOpenFor(minutes)}</span>
        </>
      );
    } else subtitle = 'Sem comanda aberta';
  }

  return (
    <header className="sticky top-0 z-20 border-b border-default bg-surface px-5 pb-[18px] pt-5">
      <div className={clsx(WAITER_COLUMN, 'flex items-center gap-3')}>
        <Link
          to="/waiter/tables"
          aria-label="Voltar para as mesas"
          className={clsx(
            'flex size-11 shrink-0 items-center justify-center rounded-token-lg border border-default bg-surface text-default hover:bg-surface-hover',
            focusRing
          )}
        >
          <BackIcon size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <div className="min-w-0 flex-1">
          {screen.state === 'loading' ? (
            <>
              <Skeleton className="h-6 w-28" />
              <Skeleton className="mt-2 h-3.5 w-40" />
            </>
          ) : (
            <>
              <h1 className="truncate text-[24px] font-bold leading-[30px] tracking-[-0.3px]">
                {ready ? (
                  <>
                    <span aria-hidden="true">Mesa {displayNumber(ready.table.number)}</span>
                    <span className="sr-only">Mesa {ready.table.number}</span>
                  </>
                ) : (
                  'Mesa'
                )}
              </h1>
              {subtitle && <p className="mt-0.5 truncate text-[13px] leading-[18px] text-muted">{subtitle}</p>}
            </>
          )}
        </div>

        {ready && (
          <span
            className={clsx(
              'shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-bold uppercase leading-4 tracking-[0.4px]',
              occupied ? 'border-primary bg-primary-subtle text-primary-strong' : clsx(FREE_TABLE_BORDER, 'bg-surface text-success-strong')
            )}
          >
            {occupied ? 'Ocupada' : 'Livre'}
          </span>
        )}
      </div>
    </header>
  );
};

const cardBase = 'rounded-token-xl border border-default bg-surface';

const BalanceBlock: React.FC<{ tabs: WaiterTableTab[] }> = ({ tabs }) => {
  // Soma dos balance (o que falta receber), nunca dos total.
  const balance = tabs.reduce((sum, tab) => sum + tab.balance, 0);
  const [currency, amount] = splitCurrency(formatCurrencyBRL(balance));
  return (
    <section aria-label="Total em aberto" className={clsx(cardBase, 'mt-[18px] flex items-end gap-3 p-[18px]')}>
      <div className="min-w-0 flex-1 [container-type:inline-size]">
        <p className="text-[13px] leading-[18px] text-muted">Total em aberto</p>
        {/* Símbolo e valor são uma coisa só: nunca quebram entre si. */}
        <p className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-heading font-normal text-muted">{currency}</span>
          <span
            className="font-bold leading-9 tracking-[-0.6px] tabular-nums"
            style={{ fontSize: totalFontSize(amount) }}
          >
            {amount}
          </span>
        </p>
      </div>
      <p className="mb-1.5 shrink-0 text-[13px] leading-[18px] text-muted">{tabCountLabel(tabs.length)}</p>
    </section>
  );
};

const TabRow: React.FC<{ tab: WaiterTableTab; tableId: string }> = ({ tab, tableId }) => {
  const paid = isPaid(tab.balance);
  const parts = itemsParts(tab);
  const spoken = `${tab.name}, ${parts.join(', ')}, ${paid ? 'paga' : `${formatCurrencyBRL(tab.balance)} em aberto`}`;
  return (
    <li>
      <Link
        to={`/waiter/tables/${encodeURIComponent(tableId)}/tabs/${encodeURIComponent(tab.id)}`}
        aria-label={spoken}
        className={clsx(cardBase, 'flex items-center gap-[14px] p-4 hover:bg-surface-hover', focusRing)}
      >
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-token-lg bg-primary-subtle text-[16px] font-bold text-primary-strong"
        >
          {initialsOf(tab.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold leading-[22px]">{tab.name}</span>
          {/* Sem espaço numa linha, quebra no "·" e não corta o horário: o garçom
              precisa do "último às" para responder ao cliente. */}
          <span className="mt-[3px] block text-[13px] leading-[18px] text-muted">
            {parts.map((part, index) => (
              <React.Fragment key={part}>
                {index > 0 && ' · '}
                <span className="whitespace-nowrap">{part}</span>
              </React.Fragment>
            ))}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {paid ? (
            <span className="block text-[12px] leading-4 text-success-strong">Pago</span>
          ) : (
            <>
              <span className="block whitespace-nowrap text-[17px] font-bold leading-[22px] tabular-nums">
                {formatCurrencyBRL(tab.balance)}
              </span>
              <span className="mt-[3px] block text-[12px] leading-4 text-muted">Em aberto</span>
            </>
          )}
        </span>
        <ChevronRightIcon size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-subtle" />
      </Link>
    </li>
  );
};

const SectionLabel: React.FC = () => (
  <h2 className="mt-[18px] text-[13px] font-semibold uppercase leading-[18px] tracking-[0.4px] text-muted">Comandas</h2>
);

const LoadingBody: React.FC = () => (
  <div aria-hidden="true">
    <div className={clsx(cardBase, 'mt-[18px] p-[18px]')}>
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="mt-2 h-8 w-40" />
    </div>
    <Skeleton className="mt-[18px] h-3.5 w-24" />
    <div className="mt-2.5 space-y-2.5">
      {[0, 1, 2].map((index) => (
        <div key={index} className={clsx(cardBase, 'flex items-center gap-[14px] p-4')}>
          <Skeleton className="size-11 shrink-0 rounded-token-lg" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  </div>
);

// A chamada falhou: nada aqui pode afirmar saldo nem ausência de comanda.
const ErrorBody: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <>
    <section aria-label="Total em aberto" className={clsx(cardBase, 'mt-[18px] p-[18px]')}>
      <p className="text-[13px] leading-[18px] text-muted">Total em aberto</p>
      <p className="mt-1 text-body-lg text-muted">Não disponível</p>
    </section>
    <SectionLabel />
    <div className={clsx(cardBase, 'mt-2.5 flex flex-col items-center px-6 py-8 text-center')}>
      <p className="text-body-lg font-semibold">Não disponível</p>
      <p className="mt-1 max-w-xs text-body text-muted">
        Não foi possível carregar as comandas desta mesa. A tela tenta de novo sozinha.
      </p>
      <Button variant="secondary" size="lg" className="mt-5" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  </>
);

const RuleNotice: React.FC = () => (
  <div className="mt-[18px] flex gap-3 rounded-[14px] border border-warning bg-warning-subtle px-4 py-[14px]">
    <WarningIcon size={20} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0 text-warning-strong" />
    <p className="text-[13px] leading-[19px] text-default">
      Cada comanda fecha a conta separada. A mesa só libera quando todas forem pagas.
    </p>
  </div>
);

const ActionBar: React.FC<{ tableId: string; occupied: boolean }> = ({ tableId, occupied }) => (
  <div className="fixed inset-x-0 bottom-0 z-30 border-t border-default bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
    <div className={WAITER_COLUMN}>
      <Link
        to={`/waiter/tables/${encodeURIComponent(tableId)}/tabs/new`}
        className={clsx(
          'flex h-14 w-full items-center justify-center gap-2.5 rounded-[14px] bg-primary text-[17px] font-semibold text-primary-fg hover:bg-primary-hover',
          focusRing
        )}
      >
        <AddIcon size={20} strokeWidth={2} aria-hidden="true" />
        {occupied ? 'Nova comanda' : 'Abrir comanda'}
      </Link>
    </div>
  </div>
);

const WaiterTablePage: React.FC = () => {
  const { tableId = '' } = useParams();
  const [screen, setScreen] = useState<ScreenState>({ state: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    return Promise.allSettled([
      // A visão de mesas traz número, situação e tempo de abertura calculado
      // no servidor; a lista de comandas não traz a mesa.
      api.get<WaiterTableOverview[]>('/tables/overview'),
      api.get<WaiterTableTabsResponse>(`/tables/${encodeURIComponent(tableId)}/tabs`, { params: { status: 'OPEN' } }),
    ]).then(([overviewResult, tabsResult]) => {
      if (id !== requestId.current) return;
      if (tabsResult.status === 'rejected' && isNotFound(tabsResult.reason)) {
        setScreen({ state: 'not-found' });
      } else if (overviewResult.status === 'rejected' || tabsResult.status === 'rejected') {
        // Falhou: o que estava na tela não pode mais ser confirmado e sai.
        setScreen({ state: 'error' });
      } else {
        const table = overviewResult.value.data.find((candidate) => candidate.id === tableId);
        setScreen(
          table
            ? { state: 'ready', table, tabs: tabsResult.value.data.tabs, receivedAt: Date.now() }
            : { state: 'not-found' }
        );
      }
      setNow(Date.now());
    });
  }, [tableId]);

  useEffect(() => {
    void load();
  }, [load]);

  useWaiterTableEvents(load);

  // O tempo de mesa anda sozinho entre uma consulta e outra.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const ready = screen.state === 'ready' ? screen : null;
  const occupied = ready?.table.status === 'OCCUPIED';
  const minutes =
    ready && ready.table.openForMinutes !== null
      ? ready.table.openForMinutes + Math.max(0, Math.floor((now - ready.receivedAt) / 60_000))
      : null;

  return (
    <div className="min-h-screen bg-canvas text-default">
      <Header screen={screen} minutes={minutes} />

      {/* Espaço da barra inferior: 12 + 56 + 20px, mais a área segura do aparelho. */}
      <main
        className={clsx(
          WAITER_COLUMN,
          'px-5',
          ready ? 'pb-[calc(88px+24px+env(safe-area-inset-bottom))]' : 'pb-8'
        )}
        aria-busy={screen.state === 'loading'}
      >
        {screen.state === 'loading' && <LoadingBody />}

        {screen.state === 'error' && <ErrorBody onRetry={() => void load()} />}

        {screen.state === 'not-found' && (
          <EmptyState
            className="mt-[18px]"
            title="Mesa não encontrada"
            description="Esta mesa não existe mais ou o endereço está errado."
            action={
              <Link to="/waiter/tables" className={clsx('text-body font-semibold text-default underline underline-offset-4', focusRing)}>
                Voltar para as mesas
              </Link>
            }
          />
        )}

        {ready && (
          <>
            {occupied && ready.tabs.length > 0 && <BalanceBlock tabs={ready.tabs} />}

            <SectionLabel />
            {ready.tabs.length > 0 ? (
              <ul className="mt-2.5 space-y-2.5">
                {ready.tabs.map((tab) => (
                  <TabRow key={tab.id} tab={tab} tableId={tableId} />
                ))}
              </ul>
            ) : (
              <EmptyState
                className="mt-2.5"
                title="Nenhuma comanda aberta"
                description="Abra a primeira comanda no nome do cliente."
              />
            )}

            {occupied && <RuleNotice />}
          </>
        )}
      </main>

      {ready && <ActionBar tableId={tableId} occupied={occupied} />}
    </div>
  );
};

export default WaiterTablePage;
