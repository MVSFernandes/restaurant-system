import { Request, Response, NextFunction } from 'express';
import { PostgrestError } from '@supabase/supabase-js';
import {
  DomainError,
  NotFoundError,
  UniqueConstraintError,
  ForeignKeyError,
  InsufficientCreditError,
  InsufficientStockError,
  PendingCashRegisterOrdersError,
  OpenCashRegisterTabsError,
} from '../types/errors';

/**
 * Middleware de tratamento de erros.
 *
 * Recebe TODOS os erros lançados/encadeados via next(err) nas rotas.
 * Mapeia DomainError -> resposta HTTP estruturada.
 * Erros não-tratados viram 500.
 *
 * Deve ser registrado por ÚLTIMO no app.ts (após todas as rotas).
 *
 * Importante: por convenção do Express, error middlewares
 * têm 4 parâmetros (err, req, res, next).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // 1. Erros de domínio (lançados pelos services)
  if (err instanceof DomainError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. Erros não tratados (bug, falha de rede, etc.)
  // Loga no servidor e devolve mensagem genérica para o cliente.
  // Em produção, pode-se integrar com Winston/Sentry aqui.
  console.error('[errorHandler] Untreated error:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    },
  });
}

/**
 * Traduz um erro do Supabase/Postgres em uma das nossas classes
 * de domínio (DomainError e suas subclasses).
 *
 * Os services usam esta função após cada chamada Supabase:
 *
 *   const { data, error } = await supabase.rpc(...);
 *   if (error) throw mapSupabaseError(error, { entity: 'Customer' });
 *
 * Códigos tratados:
 *   - P0001 -> regra de negócio (ex: limite de fiado, estoque)
 *   - P0002 -> recurso não encontrado
 *   - 23505 -> unique constraint violation
 *   - 23503 -> foreign key violation
 *   - 23514 -> check constraint violation
 *   - PGRST116 -> not found (PostgREST)
 *   - default -> DomainError genérico
 */
export function mapSupabaseError(
  err: PostgrestError | { code?: string; message?: string; details?: string | null } | null,
  context: { entity?: string; field?: string } = {}
): DomainError {
  if (!err) {
    return new DomainError('Unknown Supabase error');
  }

  const code = err.code ?? '';
  const message = err.message ?? 'Unknown error';
  const details = err.details ?? undefined;

  // P0001 — Regra de negócio violada (raised pelas RPCs)
  // A mensagem da RPC já é específica (ex: "Estoque insuficiente do insumo X")
  // Aqui tentamos detectar o subtipo pela mensagem.
  if (code === 'P0001') {
    const lower = message.toLowerCase();
    if (message.includes('CASH_REGISTER_OPEN_TABS')) {
      try {
        return new OpenCashRegisterTabsError(JSON.parse(details ?? '[]'));
      } catch {
        return new OpenCashRegisterTabsError([]);
      }
    }
    if (message.includes('TABLE_HAS_OPEN_TABS')) {
      return new DomainError('Não é possível liberar a mesa enquanto existir comanda aberta.', {
        code: 'TABLE_HAS_OPEN_TABS', status: 409,
      });
    }
    if (message.includes('TABLE_TAB_ALREADY_CLOSED')) {
      return new DomainError('A comanda já está fechada.', {
        code: 'TABLE_TAB_ALREADY_CLOSED', status: 409,
      });
    }
    if (message.includes('CASH_REGISTER_PENDING_ORDERS')) {
      try {
        return new PendingCashRegisterOrdersError(JSON.parse(details ?? '[]'));
      } catch {
        return new PendingCashRegisterOrdersError([]);
      }
    }
    if (lower.includes('estoque insuficiente') || lower.includes('insufficient stock')) {
      // Extrai nome do insumo se possível (entre aspas)
      const match = message.match(/"([^"]+)"/);
      const stockItemName = match?.[1] ?? 'unknown';
      return new InsufficientStockError(stockItemName);
    }
    if (lower.includes('limite') || lower.includes('credit') || lower.includes('fiado')) {
      // Sem dados estruturados aqui — service deve enriquecer se quiser
      return new InsufficientCreditError(
        context.entity ?? 'unknown',
        0,
        0
      );
    }
    // Fallback: regra de negócio genérica
    return new DomainError(message, { code: 'BUSINESS_RULE', status: 400 });
  }

  // P0002 — Recurso não encontrado (raised pelas RPCs)
  if (code === 'P0002') {
    return new NotFoundError(context.entity ?? 'Resource');
  }

  // 23505 — Unique constraint violation (Postgres)
  if (code === '23505') {
    return new UniqueConstraintError(context.field ?? 'field');
  }

  // 23503 — Foreign key violation (Postgres)
  if (code === '23503') {
    return new ForeignKeyError(context.field ?? 'reference');
  }

  // 23514 — Check constraint violation (Postgres)
  // Geralmente significa estoque negativo, role inválido, etc.
  if (code === '23514') {
    return new DomainError(message, { code: 'CHECK_VIOLATION', status: 400, details: { details } });
  }

  // PGRST116 — PostgREST: row not found (quando .single() não encontra)
  if (code === 'PGRST116') {
    return new NotFoundError(context.entity ?? 'Resource');
  }

  // Default — erro desconhecido vira DomainError genérico
  return new DomainError(message, {
    code: code || 'SUPABASE_ERROR',
    status: 500,
    details: details ? { details } : undefined,
  });
}
