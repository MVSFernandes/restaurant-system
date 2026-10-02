import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '../../services/api';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import { Button, EmptyState } from '../../components/ui';
import type { Table, WaiterTableTab, WaiterTableTabsResponse } from '../../types';
import { displayNumber } from './tableFormat';
import { BOTTOM_BAR_CLEARANCE, BottomBar, DetailHeader, cardBase, focusRing, primaryActionClasses } from './detailLayout';

// Tela 5 — Abrir comanda (docs/etapas/tela-abrir-comanda.md).
// Uma coisa só: pergunta o nome e abre a comanda. A regra toda (trava da
// mesa, caixa aberto, nome repetido, ocupar a mesa livre) está no servidor,
// em open_table_tab; esta tela não repete nada disso.

type CashState = 'loading' | 'open' | 'closed' | 'unknown';

type ScreenState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'not-found' }
  // openTabs null: a lista das comandas abertas não carregou. Não é "nenhuma".
  | { state: 'ready'; tableNumber: number; openTabs: WaiterTableTab[] | null };

type ApiError = {
  response?: { status?: number; data?: { message?: string; code?: string; details?: { field?: string } } };
};

const DUPLICATE_NAME = 'Já existe uma comanda aberta com esse nome nesta mesa.';

/**
 * Lê a recusa do servidor. Dois casos chegam sem texto em português e são
 * traduzidos aqui pelo código (docs/backlog.md, item 37): o caixa fechado
 * ("No cash register session…" ou CASH_REGISTER_CLOSED) e o nome repetido
 * barrado pela função do banco numa corrida entre dois garçons
 * (TABLE_TAB_NAME_ALREADY_OPEN). O nome repetido comum já vem em português.
 */
function readRefusal(error: unknown): { field: 'name' | 'cash' | 'other'; message: string } {
  const data = (error as ApiError)?.response?.data;
  const message = data?.message ?? '';
  if (data?.code === 'CASH_REGISTER_CLOSED' || message === 'CASH_REGISTER_CLOSED') {
    return { field: 'cash', message: 'O caixa está fechado. Não dá para abrir comanda agora.' };
  }
  if (message === 'TABLE_TAB_NAME_ALREADY_OPEN') return { field: 'name', message: DUPLICATE_NAME };
  if (data?.details?.field === 'name' && message) return { field: 'name', message };
  if (!(error as ApiError)?.response) {
    return { field: 'other', message: 'Sem resposta do servidor. Confira a conexão e tente de novo.' };
  }
  return { field: 'other', message: message || 'Não foi possível abrir a comanda. Tente de novo.' };
}

const WaiterOpenTabPage: React.FC = () => {
  const { tableId = '' } = useParams();
  const navigate = useNavigate();
  const ids = useId();
  const formId = `${ids}-form`;
  const inputRef = useRef<HTMLInputElement>(null);
  const tablePath = `/waiter/tables/${encodeURIComponent(tableId)}`;

  const [screen, setScreen] = useState<ScreenState>({ state: 'loading' });
  const [cash, setCash] = useState<CashState>('loading');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [otherError, setOtherError] = useState<string | null>(null);

  const load = useCallback(() => {
    return Promise.allSettled([
      api.get<Table>(`/tables/${encodeURIComponent(tableId)}`),
      api.get<WaiterTableTabsResponse>(`/tables/${encodeURIComponent(tableId)}/tabs`, { params: { status: 'OPEN' } }),
      api.get('/cash-register/current'),
    ]).then(([tableResult, tabsResult, cashResult]) => {
      if (tableResult.status === 'rejected') {
        const status = (tableResult.reason as ApiError)?.response?.status;
        setScreen({ state: status === 404 ? 'not-found' : 'error' });
      } else {
        setScreen({
          state: 'ready',
          tableNumber: tableResult.value.data.number,
          openTabs: tabsResult.status === 'fulfilled' ? tabsResult.value.data.tabs : null,
        });
      }
      setCash(
        cashResult.status === 'fulfilled'
          ? cashResult.value.data?.status === 'OPEN' ? 'open' : 'closed'
          : 'unknown'
      );
    });
  }, [tableId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = screen.state === 'ready' ? screen : null;
  const trimmed = name.trim();
  // Caixa fechado: não adianta deixar digitar para falhar depois. Com a
  // situação desconhecida, quem decide é o servidor.
  const canSubmit = Boolean(ready) && trimmed.length > 0 && cash !== 'closed' && !sending;

  const submit = async () => {
    if (!canSubmit) return;
    setSending(true);
    setNameError(null);
    setOtherError(null);
    try {
      const { data } = await api.post<{ id: string }>(`/tables/${encodeURIComponent(tableId)}/tabs`, { name: trimmed });
      // Substitui esta tela: o voltar da comanda leva para a mesa, não para cá.
      navigate(`${tablePath}/tabs/${encodeURIComponent(data.id)}`, { replace: true });
    } catch (error) {
      const refusal = readRefusal(error);
      if (refusal.field === 'name') {
        setNameError(refusal.message);
        // Campo em foco com o texto selecionado, pronto para corrigir.
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      } else if (refusal.field === 'cash') {
        setCash('closed');
      } else {
        // O nome digitado não se perde.
        setOtherError(refusal.message);
      }
      setSending(false);
    }
  };

  const openCount = ready?.openTabs?.length ?? 0;
  const subtitle = ready ? (
    <>
      <span aria-hidden="true">
        Mesa {displayNumber(ready.tableNumber)}
        {openCount > 0 && ` · ${openCount} ${openCount === 1 ? 'comanda aberta' : 'comandas abertas'}`}
      </span>
      <span className="sr-only">
        Mesa {ready.tableNumber}
        {openCount > 0 && `, ${openCount} ${openCount === 1 ? 'comanda aberta' : 'comandas abertas'}`}
      </span>
    </>
  ) : null;

  return (
    <div className="min-h-screen bg-canvas text-default">
      <DetailHeader
        backTo={tablePath}
        backLabel="Voltar para a mesa"
        loading={screen.state === 'loading'}
        title="Abrir comanda"
        subtitle={subtitle}
      />

      <main className={clsx(WAITER_COLUMN, 'px-5 pt-[18px]', ready ? BOTTOM_BAR_CLEARANCE : 'pb-8')}>
        {screen.state === 'error' && (
          <div className={clsx(cardBase, 'flex flex-col items-center px-6 py-8 text-center')}>
            <p className="text-body-lg font-semibold">Não disponível</p>
            <p className="mt-1 max-w-xs text-body text-muted">Não foi possível carregar esta mesa.</p>
            <Button
              variant="secondary"
              size="lg"
              className="mt-5"
              onClick={() => {
                setScreen({ state: 'loading' });
                void load();
              }}
            >
              Tentar de novo
            </Button>
          </div>
        )}

        {screen.state === 'not-found' && (
          <EmptyState
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
            {cash === 'closed' && (
              <p role="status" className="mb-[18px] rounded-token-md bg-warning-subtle px-3 py-2.5 text-body text-warning-strong">
                Caixa fechado. Não dá para abrir comanda agora.
              </p>
            )}
            {cash === 'unknown' && (
              <p role="status" className="mb-[18px] rounded-token-md bg-surface-sunken px-3 py-2.5 text-body text-muted">
                Não foi possível confirmar a situação do caixa.
              </p>
            )}

            <form
              id={formId}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label htmlFor={`${ids}-name`} className="block text-[13px] font-semibold leading-[18px] text-muted">
                Nome do cliente
              </label>
              <input
                ref={inputRef}
                id={`${ids}-name`}
                // Teclado sobe ao abrir: o cliente está sentando.
                autoFocus
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="go"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                disabled={sending}
                placeholder="Ex.: João"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={`${ids}-hint${nameError ? ` ${ids}-error` : ''}`}
                className={clsx(
                  'mt-1.5 h-14 w-full rounded-token-lg border bg-surface px-4 text-[16px] text-default placeholder:text-subtle disabled:opacity-60',
                  nameError ? 'border-warning' : 'border-default',
                  focusRing
                )}
              />
              {nameError && (
                <p id={`${ids}-error`} role="alert" className="mt-1.5 text-[13px] leading-[18px] text-warning-strong">
                  {nameError}
                </p>
              )}
              <p id={`${ids}-hint`} className="mt-2.5 text-[13px] leading-[18px] text-muted">
                O nome aparece na comanda e na conta. Pode ser o apelido.
              </p>
            </form>

            {otherError && (
              <p role="alert" className="mt-[18px] rounded-token-lg border border-warning bg-warning-subtle px-3 py-2.5 text-[13px] leading-[19px] text-default">
                {otherError}
              </p>
            )}

            {/* Os nomes que já estão na mesa, para o garçom não repetir sem querer. */}
            {ready.openTabs === null ? (
              <p className="mt-[18px] text-[13px] leading-[18px] text-muted">
                Não foi possível carregar as comandas já abertas nesta mesa.
              </p>
            ) : (
              openCount > 0 && (
                <section aria-labelledby={`${ids}-open`} className="mt-[18px]">
                  <h2 id={`${ids}-open`} className="text-[12px] font-semibold uppercase leading-4 tracking-[0.4px] text-muted">
                    Já abertas
                  </h2>
                  <p className="mt-1 break-words text-[13px] leading-[18px] text-muted">
                    {ready.openTabs.map((tab) => tab.name).join(' · ')}
                  </p>
                </section>
              )
            )}
          </>
        )}
      </main>

      {ready && (
        <BottomBar>
          <button type="submit" form={formId} disabled={!canSubmit} className={clsx(primaryActionClasses, 'w-full disabled:opacity-50')}>
            {sending ? 'Abrindo…' : 'Abrir comanda'}
          </button>
        </BottomBar>
      )}
    </div>
  );
};

export default WaiterOpenTabPage;
