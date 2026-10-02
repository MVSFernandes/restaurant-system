import { useCallback, useEffect, useState } from 'react';

// Rascunho do pedido: vive só no celular do garçom até ele mandar.
// Nada vai para a cozinha antes do botão de enviar.

export type DraftLine = {
  id: string;
  productId: string;
  name: string;
  byWeight: boolean;
  /** Preço por unidade, ou por kg no item por peso. Só para mostrar: o servidor recalcula. */
  unitPrice: number;
  quantity: number;
  /** Gramas; só no item por peso. */
  weightGrams: number | null;
  notes: string;
};

export type Draft = {
  lines: DraftLine[];
  /**
   * Chave de idempotência: nasce com o primeiro item e vale até o envio dar
   * certo. Reenviar com a mesma chave não duplica o pedido no servidor.
   */
  idempotencyKey: string | null;
};

const EMPTY: Draft = { lines: [], idempotencyKey: null };

export const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const lineTotal = (line: Pick<DraftLine, 'byWeight' | 'unitPrice' | 'quantity' | 'weightGrams'>) =>
  line.byWeight ? (line.unitPrice * (line.weightGrams ?? 0)) / 1000 : line.unitPrice * line.quantity;

// Item por peso conta como um item no pedido.
export const draftItemCount = (lines: DraftLine[]) =>
  lines.reduce((sum, line) => sum + (line.byWeight ? 1 : line.quantity), 0);

const storageKey = (tabId: string) => `waiter-order-draft:${tabId}`;

// sessionStorage segura o pedido montado numa recarga acidental da página. Pode
// falhar (navegação privada, armazenamento bloqueado): aí ela vive só na memória.
function readDraft(tabId: string): Draft {
  try {
    const raw = sessionStorage.getItem(storageKey(tabId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Draft;
    return Array.isArray(parsed.lines) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeDraft(tabId: string, draft: Draft) {
  try {
    if (draft.lines.length === 0) sessionStorage.removeItem(storageKey(tabId));
    else sessionStorage.setItem(storageKey(tabId), JSON.stringify(draft));
  } catch {
    // Sem armazenamento: o pedido montado continua na memória.
  }
}

export function useOrderDraft(tabId: string) {
  const [draft, setDraft] = useState<Draft>(() => readDraft(tabId));

  useEffect(() => {
    writeDraft(tabId, draft);
  }, [tabId, draft]);

  const upsertLine = useCallback((line: DraftLine) => {
    setDraft((current) => {
      const exists = current.lines.some((candidate) => candidate.id === line.id);
      return {
        lines: exists ? current.lines.map((candidate) => (candidate.id === line.id ? line : candidate)) : [...current.lines, line],
        idempotencyKey: current.idempotencyKey ?? createId(),
      };
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setDraft((current) => {
      const lines = current.lines.filter((line) => line.id !== id);
      return lines.length === 0 ? EMPTY : { ...current, lines };
    });
  }, []);

  /** Depois de uma recusa do servidor, o próximo envio usa uma chave nova. */
  const renewKey = useCallback(() => {
    setDraft((current) => (current.lines.length ? { ...current, idempotencyKey: createId() } : current));
  }, []);

  const clear = useCallback(() => setDraft(EMPTY), []);

  return { draft, upsertLine, removeLine, renewKey, clear };
}
