import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '../../services/api';
import { useWaiterTableEvents } from '../../hooks/useWaiterTableEvents';
import { formatCurrencyBRL } from '../../utils/currency';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import { AddIcon, Button, EmptyState, PrintIcon, Skeleton, useToast } from '../../components/ui';
import type { Table, WaiterTabDetail, WaiterTabOrder, WaiterTabOrderItem } from '../../types';
import { displayNumber, formatClock, itemCountLabel, splitCurrency, totalFontSize } from './tableFormat';
import {
  BOTTOM_BAR_CLEARANCE,
  BottomBar,
  DetailHeader,
  SectionLabel,
  cardBase,
  focusRing,
  primaryActionClasses,
} from './detailLayout';

// Tela 3 — Comanda (docs/etapas/tela-comanda.md).
// Responde: o que esta pessoa já pediu, e quanto ela deve.

type Loaded = { tab: WaiterTabDetail; tableNumber: number };

type ScreenState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'not-found' }
  | ({ state: 'ready' } & Loaded);

const isNotFound = (reason: unknown) =>
  (reason as { response?: { status?: number } })?.response?.status === 404;

// Lançamentos que contam: o pedido cancelado vem na resposta, mas não entra
// no saldo nem na contagem de itens do servidor, então também não aparece aqui.
// Do mais recente para o mais antigo: o que o garçom acabou de lançar vem primeiro.
const visibleOrders = (tab: WaiterTabDetail): WaiterTabOrder[] =>
  tab.orders
    .filter((order) => order.status !== 'CANCELED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

// Peso vem em gramas; a quantidade de item por peso é sempre 1.
const formatWeight = (grams: number) =>
  `${(grams / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

const BalanceBlock: React.FC<{ tab: WaiterTabDetail }> = ({ tab }) => {
  const closed = tab.status === 'CLOSED';
  const [currency, amount] = splitCurrency(formatCurrencyBRL(tab.balance));
  return (
    <section aria-label={closed ? 'Comanda paga' : 'Em aberto'} className={clsx(cardBase, 'mt-[18px] p-[18px]')}>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1 [container-type:inline-size]">
          {closed ? (
            <>
              <p className="text-[30px] font-bold leading-9 text-success-strong">Paga</p>
              <p className="mt-1 text-[13px] leading-[18px] text-muted">Consumo {formatCurrencyBRL(tab.total)}</p>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-[18px] text-muted">Em aberto</p>
              {/* Símbolo e valor são uma coisa só: nunca quebram entre si. */}
              <p className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-heading font-normal text-muted">{currency}</span>
                <span className="font-bold leading-9 tracking-[-0.6px] tabular-nums" style={{ fontSize: totalFontSize(amount) }}>
                  {amount}
                </span>
              </p>
            </>
          )}
        </div>
        <p className="mb-1.5 shrink-0 text-[13px] leading-[18px] text-muted">{itemCountLabel(tab.itemCount)}</p>
      </div>

      {/* Só quando já houve pagamento parcial; nunca "pago R$ 0,00". */}
      {!closed && tab.paidTotal > 0 && (
        <p className="mt-3 border-t border-default pt-3 text-[13px] leading-[18px] text-muted">
          Consumo {formatCurrencyBRL(tab.total)} · pago {formatCurrencyBRL(tab.paidTotal)}
        </p>
      )}
    </section>
  );
};

const ItemRow: React.FC<{ item: WaiterTabOrderItem }> = ({ item }) => (
  <li className="flex items-start border-t border-default py-3 first:border-t-0 first:pt-0 last:pb-0">
    {/* Coluna fixa de 32px: os nomes alinham entre linhas e entre lançamentos. */}
    <span className="w-8 shrink-0 text-[15px] font-bold leading-5 tabular-nums">{item.quantity}×</span>
    <div className="min-w-0 flex-1">
      {/* Nome quebra em duas linhas se precisar; não corta. */}
      <p className="break-words text-[15px] font-medium leading-5">{item.productName}</p>
      {item.weight !== null && item.weight > 0 && (
        <p className="mt-0.5 text-[13px] leading-[18px] text-muted tabular-nums">{formatWeight(item.weight)}</p>
      )}
      {/* A observação nunca é cortada: é ela que diz "sem cebola". */}
      {item.notes?.trim() && (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-muted">{item.notes.trim()}</p>
      )}
    </div>
    <span className="ml-3 shrink-0 whitespace-nowrap text-[15px] font-semibold leading-5 tabular-nums">
      {formatCurrencyBRL(item.price)}
    </span>
  </li>
);

const OrderGroup: React.FC<{ order: WaiterTabOrder }> = ({ order }) => (
  <li>
    <h3 className="text-[12px] font-semibold leading-4 tracking-[0.3px] text-muted">
      <span className="sr-only">Lançado às </span>
      {formatClock(order.createdAt)}
    </h3>
    <ul className={clsx(cardBase, 'mt-2 p-4')}>
      {order.items.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
    </ul>
  </li>
);

const ClosedNotice: React.FC<{ closedAt: string | null }> = ({ closedAt }) => (
  <p className="mt-[18px] rounded-[14px] border border-default bg-surface px-4 py-3 text-[13px] leading-[19px] text-muted">
    {closedAt ? `Comanda fechada às ${formatClock(closedAt)}.` : 'Comanda fechada.'} Não aceita novos pedidos.
  </p>
);

const LoadingBody: React.FC = () => (
  <div aria-hidden="true">
    <div className={clsx(cardBase, 'mt-[18px] p-[18px]')}>
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="mt-2 h-8 w-40" />
    </div>
    <Skeleton className="mt-[18px] h-3.5 w-16" />
    <div className="mt-2.5 space-y-4">
      {[2, 1].map((lines, index) => (
        <div key={index}>
          <Skeleton className="h-3 w-10" />
          <div className={clsx(cardBase, 'mt-2 space-y-3 p-4')}>
            {Array.from({ length: lines }, (_, line) => (
              <div key={line} className="flex items-center gap-3">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// A chamada falhou: nada aqui pode afirmar saldo nem ausência de item.
const ErrorBody: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <>
    <section aria-label="Em aberto" className={clsx(cardBase, 'mt-[18px] p-[18px]')}>
      <p className="text-[13px] leading-[18px] text-muted">Em aberto</p>
      <p className="mt-1 text-body-lg text-muted">Não disponível</p>
    </section>
    <SectionLabel>Itens</SectionLabel>
    <div className={clsx(cardBase, 'mt-2.5 flex flex-col items-center px-6 py-8 text-center')}>
      <p className="text-body-lg font-semibold">Não disponível</p>
      <p className="mt-1 max-w-xs text-body text-muted">
        Não foi possível carregar os itens desta comanda. A tela tenta de novo sozinha.
      </p>
      <Button variant="secondary" size="lg" className="mt-5" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  </>
);

const PrintButton: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { toast } = useToast();
  const [printing, setPrinting] = useState(false);

  const print = async () => {
    // A janela abre no toque, antes da espera: celular bloqueia janela aberta
    // depois de uma chamada assíncrona.
    const win = window.open('', '_blank');
    setPrinting(true);
    try {
      const { data } = await api.get<Blob>(`/table-tabs/${encodeURIComponent(tabId)}/receipt`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      if (win) win.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      win?.close();
      toast({
        title: 'Não foi possível gerar a comanda',
        description: 'Confira a conexão e tente imprimir de novo.',
        variant: 'error',
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void print()}
      disabled={printing}
      aria-label="Imprimir comanda"
      title="Imprimir comanda"
      className={clsx(
        'flex size-14 shrink-0 items-center justify-center rounded-[14px] border border-default bg-surface text-default hover:bg-surface-hover disabled:opacity-60',
        focusRing
      )}
    >
      <PrintIcon size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
};

const WaiterTabPage: React.FC = () => {
  const { tableId = '', tabId = '' } = useParams();
  const [screen, setScreen] = useState<ScreenState>({ state: 'loading' });
  const requestId = useRef(0);
  const tablePath = `/waiter/tables/${encodeURIComponent(tableId)}`;

  const load = useCallback(() => {
    const id = ++requestId.current;
    return Promise.allSettled([
      api.get<WaiterTabDetail>(`/table-tabs/${encodeURIComponent(tabId)}`),
      // O detalhe da comanda traz só o id da mesa; o número vem daqui.
      api.get<Table>(`/tables/${encodeURIComponent(tableId)}`),
    ]).then(([tabResult, tableResult]) => {
      if (id !== requestId.current) return;
      const missing = [tabResult, tableResult].some((result) => result.status === 'rejected' && isNotFound(result.reason));
      if (missing) {
        setScreen({ state: 'not-found' });
      } else if (tabResult.status === 'rejected' || tableResult.status === 'rejected') {
        // Falhou: o que estava na tela não pode mais ser confirmado e sai.
        setScreen({ state: 'error' });
      } else if (tabResult.value.data.tableId !== tableId) {
        // Comanda de outra mesa: o endereço está errado.
        setScreen({ state: 'not-found' });
      } else {
        setScreen({ state: 'ready', tab: tabResult.value.data, tableNumber: tableResult.value.data.number });
      }
    });
  }, [tabId, tableId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Item lançado por outro garçom aparece sem recarregar a mão.
  useWaiterTableEvents(load);

  const ready = screen.state === 'ready' ? screen : null;
  const open = ready?.tab.status === 'OPEN';
  const orders = ready ? visibleOrders(ready.tab) : [];

  return (
    <div className="min-h-screen bg-canvas text-default">
      <DetailHeader
        backTo={tablePath}
        backLabel="Voltar para a mesa"
        loading={screen.state === 'loading'}
        title={ready ? ready.tab.name : 'Comanda'}
        subtitle={
          ready ? (
            <>
              <span aria-hidden="true">
                Mesa {displayNumber(ready.tableNumber)} · aberta às {formatClock(ready.tab.openedAt)}
              </span>
              <span className="sr-only">
                Mesa {ready.tableNumber}, aberta às {formatClock(ready.tab.openedAt)}
              </span>
            </>
          ) : screen.state === 'error' ? (
            'Não disponível'
          ) : null
        }
      />

      <main
        className={clsx(WAITER_COLUMN, 'px-5', open ? BOTTOM_BAR_CLEARANCE : 'pb-8')}
        aria-busy={screen.state === 'loading'}
      >
        {screen.state === 'loading' && <LoadingBody />}

        {screen.state === 'error' && <ErrorBody onRetry={() => void load()} />}

        {screen.state === 'not-found' && (
          <EmptyState
            className="mt-[18px]"
            title="Comanda não encontrada"
            description="Esta comanda não existe nesta mesa ou o endereço está errado."
            action={
              <Link to={tablePath} className={clsx('text-body font-semibold text-default underline underline-offset-4', focusRing)}>
                Voltar para a mesa
              </Link>
            }
          />
        )}

        {ready && (
          <>
            <BalanceBlock tab={ready.tab} />
            {!open && <ClosedNotice closedAt={ready.tab.closedAt} />}

            <SectionLabel>Itens</SectionLabel>
            {orders.length > 0 ? (
              <ul className="mt-2.5 space-y-4">
                {orders.map((order) => (
                  <OrderGroup key={order.id} order={order} />
                ))}
              </ul>
            ) : (
              <EmptyState
                className="mt-2.5"
                title="Nenhum item lançado"
                description="Lance o primeiro pedido desta comanda."
              />
            )}
          </>
        )}
      </main>

      {/* Comanda fechada: a barra some inteira. Nada de lançar numa comanda paga. */}
      {open && (
        <BottomBar>
          <Link to={`${tablePath}/tabs/${encodeURIComponent(tabId)}/order`} className={primaryActionClasses}>
            <AddIcon size={20} strokeWidth={2} aria-hidden="true" />
            Lançar pedido
          </Link>
          <PrintButton tabId={tabId} />
        </BottomBar>
      )}
    </div>
  );
};

export default WaiterTabPage;
