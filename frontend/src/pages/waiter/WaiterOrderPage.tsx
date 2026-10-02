import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import api from '../../services/api';
import { formatCurrencyBRL } from '../../utils/currency';
import { orderErrorMessage } from '../../lib/orderErrors';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import {
  AddIcon,
  Button,
  CloseIcon,
  DeleteIcon,
  EmptyState,
  Modal,
  ModalTitle,
  RemoveOneIcon,
  useToast,
} from '../../components/ui';
import type { Category, Table, WaiterTabDetail } from '../../types';
import { buildMenu, useMenuFilter, type MenuProduct } from './waiterMenu';
import { MenuBody, MenuListSkeleton, MenuSearchBar } from './WaiterMenuParts';
import { displayNumber } from './tableFormat';
import { BOTTOM_BAR_CLEARANCE, BottomBar, DetailHeader, cardBase, focusRing, primaryActionClasses } from './detailLayout';
import { createId, draftItemCount, lineTotal, useOrderDraft, type DraftLine } from './useOrderDraft';

// Tela 4 — Lançar pedido (docs/etapas/tela-lancar-pedido.md).
// Responde, nesta ordem: "tem tal coisa?" e "então manda".

type Loaded = { tab: WaiterTabDetail; tableNumber: number; categories: Category[] };

type ScreenState =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'not-found' }
  | ({ state: 'ready' } & Loaded);

const isNotFound = (reason: unknown) =>
  (reason as { response?: { status?: number } })?.response?.status === 404;

// Status HTTP da resposta de erro; null quando não houve resposta (rede).
const responseStatus = (error: unknown): number | null =>
  (error as { response?: { status?: number } })?.response?.status ?? null;

type SendError = { message: string; checkTab: boolean };

// "0,450" ou "0.450" -> 450 gramas. Inválido ou zero -> null.
function parseKg(text: string): number | null {
  const kg = Number(text.replace(',', '.').trim());
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const grams = Math.round(kg * 1000);
  return grams > 0 ? grams : null;
}

const formatKg = (grams: number) =>
  `${(grams / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

// ---------------------------------------------------------------------------
// Folha do item

const fieldLabel = 'block text-[13px] font-semibold leading-[18px] text-muted';

type ItemSheetProps = {
  product: MenuProduct;
  line: DraftLine | null;
  onClose: () => void;
  onConfirm: (line: DraftLine) => void;
};

const ItemSheet: React.FC<ItemSheetProps> = ({ product, line, onClose, onConfirm }) => {
  const ids = useId();
  const [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const [weightText, setWeightText] = useState(
    line?.weightGrams ? (line.weightGrams / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3 }) : ''
  );
  const [notes, setNotes] = useState(line?.notes ?? '');

  const grams = product.isByWeight ? parseKg(weightText) : null;
  const valid = product.isByWeight ? grams !== null : quantity >= 1;
  const total = lineTotal({ byWeight: product.isByWeight, unitPrice: product.unitPrice, quantity, weightGrams: grams });

  const confirm = () => {
    if (!valid) return;
    onConfirm({
      id: line?.id ?? createId(),
      productId: product.id,
      name: product.name,
      byWeight: product.isByWeight,
      unitPrice: product.unitPrice,
      quantity: product.isByWeight ? 1 : quantity,
      weightGrams: product.isByWeight ? grams : null,
      notes: notes.trim(),
    });
  };

  return (
    <Modal open onClose={onClose} placement="bottom">
      <form
        className="p-5 pb-0"
        onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <ModalTitle className="!text-[20px] !font-bold !leading-[26px] break-words">{product.name}</ModalTitle>
            <p className="mt-0.5 text-[14px] leading-[19px] text-muted tabular-nums">
              {formatCurrencyBRL(product.unitPrice)}
              {product.isByWeight && ' / kg'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar sem adicionar"
            className={clsx('-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-token-lg text-muted hover:bg-surface-hover', focusRing)}
          >
            <CloseIcon size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {product.isByWeight ? (
          <div className="mt-[18px]">
            <label htmlFor={`${ids}-weight`} className={fieldLabel}>
              Peso (kg)
            </label>
            <div className="relative mt-1.5">
              <input
                id={`${ids}-weight`}
                inputMode="decimal"
                autoComplete="off"
                value={weightText}
                onChange={(event) => setWeightText(event.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="0,000"
                aria-describedby={`${ids}-weight-total`}
                className={clsx('h-12 w-full rounded-token-lg border border-default bg-surface pl-3 pr-10 text-[16px] tabular-nums text-default placeholder:text-subtle', focusRing)}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[16px] text-muted">
                kg
              </span>
            </div>
            <p id={`${ids}-weight-total`} className="mt-1.5 text-[13px] leading-[18px] text-muted tabular-nums">
              {grams !== null
                ? `${formatKg(grams)} × ${formatCurrencyBRL(product.unitPrice)} = ${formatCurrencyBRL(total)}`
                : 'Informe o peso para calcular o valor.'}
            </p>
          </div>
        ) : (
          <div className="mt-[18px]">
            <span id={`${ids}-qty-label`} className={fieldLabel}>
              Quantidade
            </span>
            <div className="mt-1.5 flex items-center gap-2" role="group" aria-labelledby={`${ids}-qty-label`}>
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                disabled={quantity <= 1}
                aria-label="Diminuir quantidade"
                className={clsx('flex size-12 items-center justify-center rounded-token-lg border border-default bg-surface text-default hover:bg-surface-hover disabled:opacity-40', focusRing)}
              >
                <RemoveOneIcon size={20} strokeWidth={2} aria-hidden="true" />
              </button>
              <output aria-live="polite" className="min-w-14 text-center text-[22px] font-bold tabular-nums">
                {quantity}
              </output>
              <button
                type="button"
                onClick={() => setQuantity((current) => current + 1)}
                aria-label="Aumentar quantidade"
                className={clsx('flex size-12 items-center justify-center rounded-token-lg border border-default bg-surface text-default hover:bg-surface-hover', focusRing)}
              >
                <AddIcon size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <div className="mt-[18px]">
          <label htmlFor={`${ids}-notes`} className={fieldLabel}>
            Observação
          </label>
          <textarea
            id={`${ids}-notes`}
            rows={3}
            maxLength={200}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: sem cebola, bem passado"
            className={clsx('mt-1.5 block w-full resize-none rounded-token-lg border border-default bg-surface p-3 text-[16px] leading-6 text-default placeholder:text-subtle', focusRing)}
          />
        </div>

        {/* Preso ao pé da folha: com o teclado aberto, o botão continua alcançável. */}
        <div className="sticky bottom-0 -mx-5 mt-[18px] bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
          <button type="submit" disabled={!valid} className={clsx(primaryActionClasses, 'w-full disabled:opacity-50')}>
            {line ? 'Salvar' : 'Adicionar'} · {formatCurrencyBRL(total)}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Pedido em montagem (no código, "bag": o garçom só vê "pedido")

type BagSheetProps = {
  lines: DraftLine[];
  sending: boolean;
  online: boolean;
  error: SendError | null;
  tabPath: string;
  onClose: () => void;
  onEdit: (line: DraftLine) => void;
  onRemove: (id: string) => void;
  onSend: () => void;
};

const BagSheet: React.FC<BagSheetProps> = ({ lines, sending, online, error, tabPath, onClose, onEdit, onRemove, onSend }) => {
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  return (
    <Modal open onClose={sending ? () => {} : onClose} placement="bottom" closeOnOverlay={!sending}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <ModalTitle className="!text-[20px] !font-bold !leading-[26px]">Pedido</ModalTitle>
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          aria-label="Fechar pedido"
          className={clsx('-mr-2 flex size-11 items-center justify-center rounded-token-lg text-muted hover:bg-surface-hover disabled:opacity-40', focusRing)}
        >
          <CloseIcon size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <ul className="px-5">
        {lines.map((line) => (
          <li key={line.id} className="flex items-start gap-2 border-b border-default py-[14px] last:border-b-0">
            <button
              type="button"
              onClick={() => onEdit(line)}
              disabled={sending}
              aria-label={`Corrigir ${line.name}`}
              className={clsx('flex min-w-0 flex-1 items-start gap-3 text-left', focusRing)}
            >
              <span className="min-w-0 flex-1">
                <span className="block break-words text-[15px] leading-5">
                  <span className="font-bold tabular-nums">{line.byWeight ? formatKg(line.weightGrams ?? 0) : `${line.quantity}×`}</span>{' '}
                  {line.name}
                </span>
                {/* A observação aparece inteira: é ela que diz "sem cebola". */}
                {line.notes && (
                  <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] leading-[18px] text-muted">{line.notes}</span>
                )}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[15px] font-semibold leading-5 tabular-nums">
                {formatCurrencyBRL(lineTotal(line))}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(line.id)}
              disabled={sending}
              aria-label={`Remover ${line.name}`}
              className={clsx('-my-3 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-token-lg text-muted hover:bg-surface-hover disabled:opacity-40', focusRing)}
            >
              <DeleteIcon size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {/* Rodapé preso: com muitos itens a lista rola e o botão de enviar fica. */}
      <div className="sticky bottom-0 border-t border-default bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
        <p className="flex items-baseline justify-between">
          <span className="text-[15px] text-muted">Total</span>
          <span className="text-[20px] font-bold tabular-nums">{formatCurrencyBRL(total)}</span>
        </p>
        {error && (
          <div role="alert" className="mt-3 rounded-token-lg border border-warning bg-warning-subtle px-3 py-2.5 text-[13px] leading-[19px] text-default">
            <p>{error.message}</p>
            {/* O pedido montado fica guardado na sessão: dá para ir à comanda e voltar sem perder nada. */}
            {error.checkTab && (
              <Link
                to={tabPath}
                className={clsx('mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4', focusRing)}
              >
                Conferir a comanda
              </Link>
            )}
          </div>
        )}
        {!online && (
          <p role="status" className="mt-3 text-[13px] leading-[19px] text-warning-strong">
            Sem conexão — o pedido não pode ser enviado agora.
          </p>
        )}
        <button
          type="button"
          onClick={onSend}
          disabled={sending || !online}
          className={clsx(primaryActionClasses, 'mt-3 w-full disabled:opacity-50')}
        >
          {sending ? 'Enviando…' : 'Enviar pedido'}
        </button>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Tela

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

const WaiterOrderPage: React.FC = () => {
  const { tableId = '', tabId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const online = useOnline();
  const tabPath = `/waiter/tables/${encodeURIComponent(tableId)}/tabs/${encodeURIComponent(tabId)}`;

  const [screen, setScreen] = useState<ScreenState>({ state: 'loading' });
  const [sheet, setSheet] = useState<{ product: MenuProduct; line: DraftLine | null } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const { draft, upsertLine, removeLine, renewKey, clear } = useOrderDraft(tabId);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    return Promise.allSettled([
      api.get<WaiterTabDetail>(`/table-tabs/${encodeURIComponent(tabId)}`),
      api.get<Table>(`/tables/${encodeURIComponent(tableId)}`),
      // Categorias com os produtos e a disponibilidade de cada um, numa chamada.
      api.get<Category[]>('/categories'),
    ]).then(([tabResult, tableResult, menuResult]) => {
      if (id !== requestId.current) return;
      const missing = [tabResult, tableResult].some((result) => result.status === 'rejected' && isNotFound(result.reason));
      if (missing || (tabResult.status === 'fulfilled' && tabResult.value.data.tableId !== tableId)) {
        setScreen({ state: 'not-found' });
      } else if (tabResult.status === 'rejected' || tableResult.status === 'rejected' || menuResult.status === 'rejected') {
        setScreen({ state: 'error' });
      } else {
        setScreen({
          state: 'ready',
          tab: tabResult.value.data,
          tableNumber: tableResult.value.data.number,
          categories: menuResult.value.data,
        });
      }
    });
  }, [tabId, tableId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = screen.state === 'ready' ? screen : null;

  const categories = ready?.categories;
  const menu = useMemo(() => (categories ? buildMenu(categories) : []), [categories]);
  const filter = useMenuFilter(menu);

  const total = draft.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const itemCount = draftItemCount(draft.lines);

  const pickProduct = (product: MenuProduct) => setSheet({ product, line: null });

  const editLine = (line: DraftLine) => {
    const product = menu.find((candidate) => candidate.id === line.productId);
    if (!product) return;
    setBagOpen(false);
    setSheet({ product, line });
  };

  const confirmLine = (line: DraftLine) => {
    const reopenBag = sheet?.line !== null && sheet?.line !== undefined;
    upsertLine(line);
    setSendError(null);
    setSheet(null);
    if (reopenBag) setBagOpen(true);
  };

  const removeFromBag = (id: string) => {
    removeLine(id);
    setSendError(null);
    if (draft.lines.length <= 1) setBagOpen(false);
  };

  const send = async () => {
    if (!ready || sending || !online || draft.lines.length === 0) return;
    const idempotencyKey = draft.idempotencyKey ?? createId();
    setSending(true);
    setSendError(null);
    try {
      // Um lançamento com todos os itens: é assim que a comanda agrupa e a cozinha recebe.
      await api.post(
        '/orders',
        {
          type: 'DINE_IN',
          tableId,
          tableTabId: tabId,
          idempotencyKey,
          items: draft.lines.map((line) => ({
            productId: line.productId,
            quantity: line.byWeight ? 1 : line.quantity,
            ...(line.byWeight ? { weight: line.weightGrams } : {}),
            notes: line.notes || null,
          })),
        },
        { headers: { 'X-Idempotency-Key': idempotencyKey } }
      );
      clear();
      setBagOpen(false);
      toast({ title: 'Pedido enviado', variant: 'success' });
      navigate(tabPath, { replace: true });
    } catch (error) {
      // O pedido montado não se perde em nenhum caso: o garçom não pode ter
      // que lembrar de cabeça o que o cliente pediu.
      const status = responseStatus(error);
      if (status !== null && status >= 400 && status < 500) {
        // Recusa de regra de negócio (estoque, caixa fechado, comanda fechada):
        // o pedido não foi criado. O próximo envio é uma tentativa nova, com
        // chave nova.
        setSendError({ message: orderErrorMessage(error), checkTab: false });
        renewKey();
      } else if (status !== null) {
        // Erro do servidor (5xx): a chave NÃO troca. Um 500 pode acontecer
        // depois de o pedido já estar gravado; com chave nova, o reenvio criaria
        // um segundo pedido e o cliente pagaria duas vezes. Com a mesma chave,
        // o servidor reconhece o pedido que já criou. O custo é o garçom receber
        // o mesmo erro por até 5 minutos se reenviar (o cache de idempotência
        // guarda o 5xx; docs/backlog.md, item 36). Cobrança dupla é erro
        // invisível em dinheiro; garçom travado é erro visível. Entre os dois,
        // o visível ganha sempre.
        setSendError({
          message: 'O pedido pode já ter sido registrado. Confira a comanda antes de tentar de novo: se ele estiver lá, não reenvie.',
          checkTab: true,
        });
      } else {
        // Sem resposta: não se sabe se o pedido chegou. A mesma chave impede a
        // duplicata se ele tiver chegado.
        setSendError({ message: orderErrorMessage(error), checkTab: false });
      }
    } finally {
      setSending(false);
    }
  };

  const tabClosed = ready?.tab.status === 'CLOSED';
  const showBar = Boolean(ready) && !tabClosed && draft.lines.length > 0;

  return (
    <div className="min-h-screen bg-canvas text-default">
      {/* Cabeçalho e busca grudados no topo: o nome da comanda fica visível o
          tempo todo. Lançar na comanda errada cobra do cliente errado. */}
      <div className="sticky top-0 z-20">
        <DetailHeader
          backTo={tabPath}
          backLabel="Voltar para a comanda"
          loading={screen.state === 'loading'}
          title="Lançar pedido"
          subtitle={
            ready ? (
              <>
                <span aria-hidden="true">
                  {ready.tab.name} · Mesa {displayNumber(ready.tableNumber)}
                </span>
                <span className="sr-only">
                  Comanda {ready.tab.name}, mesa {ready.tableNumber}
                </span>
              </>
            ) : null
          }
        />
        {ready && !tabClosed && <MenuSearchBar filter={filter} />}
      </div>

      <main className={clsx(WAITER_COLUMN, showBar ? BOTTOM_BAR_CLEARANCE : 'pb-8')} aria-busy={screen.state === 'loading'}>
        {screen.state === 'loading' && (
          <div className="px-5 pt-3">
            <MenuListSkeleton />
          </div>
        )}

        {screen.state === 'error' && (
          <div className="px-5 pt-[18px]">
            <div className={clsx(cardBase, 'flex flex-col items-center px-6 py-8 text-center')}>
              <p className="text-body-lg font-semibold">Cardápio não disponível</p>
              <p className="mt-1 max-w-xs text-body text-muted">Não foi possível carregar o cardápio desta comanda.</p>
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
          </div>
        )}

        {screen.state === 'not-found' && (
          <div className="px-5 pt-[18px]">
            <EmptyState
              title="Comanda não encontrada"
              description="Esta comanda não existe nesta mesa ou o endereço está errado."
              action={
                <Link
                  to={`/waiter/tables/${encodeURIComponent(tableId)}`}
                  className={clsx('text-body font-semibold text-default underline underline-offset-4', focusRing)}
                >
                  Voltar para a mesa
                </Link>
              }
            />
          </div>
        )}

        {ready && tabClosed && (
          <div className="px-5 pt-[18px]">
            <EmptyState
              title="Comanda fechada"
              description="Esta comanda já foi paga e não aceita novos pedidos."
              action={
                <Link to={tabPath} className={clsx('text-body font-semibold text-default underline underline-offset-4', focusRing)}>
                  Voltar para a comanda
                </Link>
              }
            />
          </div>
        )}

        {ready && !tabClosed && <MenuBody categories={ready.categories} filter={filter} onPick={pickProduct} />}
      </main>

      {/* Pedido vazio: a barra não existe e a lista usa a tela inteira. */}
      {showBar && (
        <BottomBar>
          <div className="w-full">
            {!online && (
              <p role="status" className="mb-2 text-center text-[13px] leading-[18px] text-warning-strong">
                Sem conexão — o pedido não pode ser enviado agora
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setSendError(null);
                setBagOpen(true);
              }}
              className={clsx(primaryActionClasses, 'w-full justify-between px-5')}
            >
              <span className="text-[14px] font-semibold leading-[18px]">
                {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              </span>
              <span>Ver pedido</span>
              <span className="font-bold tabular-nums">{formatCurrencyBRL(total)}</span>
            </button>
          </div>
        </BottomBar>
      )}

      {sheet && (
        <ItemSheet
          key={sheet.line?.id ?? sheet.product.id}
          product={sheet.product}
          line={sheet.line}
          onClose={() => {
            const editing = Boolean(sheet.line);
            setSheet(null);
            if (editing) setBagOpen(true);
          }}
          onConfirm={confirmLine}
        />
      )}

      {bagOpen && showBar && (
        <BagSheet
          lines={draft.lines}
          sending={sending}
          online={online}
          error={sendError}
          tabPath={tabPath}
          onClose={() => setBagOpen(false)}
          onEdit={editLine}
          onRemove={removeFromBag}
          onSend={() => void send()}
        />
      )}
    </div>
  );
};

export default WaiterOrderPage;
