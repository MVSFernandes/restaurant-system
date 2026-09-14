/**
 * Erros tipados de domínio.
 *
 * Cada erro representa uma situação de negócio que o middleware
 * errorHandler vai converter no status HTTP correto.
 *
 * Convenção:
 *  - Services lançam essas classes (throw new ...).
 *  - Controllers usam try/catch + next(err).
 *  - errorHandler.middleware mapeia classe → HTTP status + payload.
 */

export class DomainError extends Error {
  /**
   * Código curto e estável usado pelo frontend para tradução de mensagens.
   * Ex: 'NOT_FOUND', 'INSUFFICIENT_CREDIT', 'INVALID_TRANSITION'.
   */
  readonly code: string;

  /**
   * Status HTTP que o middleware deve retornar.
   * 400 = bad request (regra de negócio violada)
   * 404 = not found
   * 409 = conflict (duplicado, etc.)
   */
  readonly status: number;

  /**
   * Detalhes opcionais (campo invalido, valor que falhou, etc.).
   */
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      details?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? 'DOMAIN_ERROR';
    this.status = options.status ?? 400;
    this.details = options.details;

    // Mantém o stack trace correto em V8 (Node).
    if (typeof (Error as unknown as { captureStackTrace?: Function }).captureStackTrace === 'function') {
      (Error as unknown as { captureStackTrace: Function }).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Recurso não encontrado (registro inexistente).
 * Mapeia para HTTP 404.
 *
 * Ex: NotFoundError('Customer', 'cust_001')
 *     → "Customer not found: cust_001"
 */
export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    const message = id
      ? `${entity} not found: ${id}`
      : `${entity} not found`;
    super(message, {
      code: 'NOT_FOUND',
      status: 404,
      details: { entity, id },
    });
  }
}

/**
 * Violação de unicidade (campo único duplicado).
 * Mapeia para HTTP 409 (conflict).
 *
 * Ex: UniqueConstraintError('users.email', 'casarao@admin.com')
 */
export class UniqueConstraintError extends DomainError {
  constructor(field: string, value?: string) {
    const message = value
      ? `Duplicate value for ${field}: ${value}`
      : `Duplicate value for ${field}`;
    super(message, {
      code: 'UNIQUE_CONSTRAINT',
      status: 409,
      details: { field, value },
    });
  }
}

/**
 * Violação de foreign key (referência a registro inexistente).
 * Mapeia para HTTP 400.
 *
 * Ex: ForeignKeyError('product.category_id', 'cat_xyz')
 */
export class ForeignKeyError extends DomainError {
  constructor(reference: string, value?: string) {
    const message = value
      ? `Invalid reference for ${reference}: ${value}`
      : `Invalid reference for ${reference}`;
    super(message, {
      code: 'FOREIGN_KEY_VIOLATION',
      status: 400,
      details: { reference, value },
    });
  }
}

/**
 * Limite de crédito (fiado) excedido.
 * Disparado pela RPC pay_order_with_credit / add_credit_charge.
 * Mapeia para HTTP 400.
 */
export class InsufficientCreditError extends DomainError {
  constructor(customerId: string, requested: number, available: number) {
    super(
      `Customer ${customerId} has insufficient credit. Requested: ${requested}, available: ${available}.`,
      {
        code: 'INSUFFICIENT_CREDIT',
        status: 400,
        details: { customerId, requested, available },
      }
    );
  }
}

/**
 * Estoque insuficiente para o consumo solicitado.
 * Disparado pela RPC consume_order_stock.
 * Mapeia para HTTP 400.
 */
export class InsufficientStockError extends DomainError {
  constructor(stockItemName: string, productName?: string) {
    const message = productName
      ? `Estoque insuficiente de "${stockItemName}" para o produto "${productName}".`
      : `Estoque insuficiente de "${stockItemName}".`;
    super(message, {
      code: 'INSUFFICIENT_STOCK',
      status: 400,
      details: { stockItemName, productName },
    });
  }
}

/**
 * Tentativa de operação financeira sem caixa aberto.
 * Mapeia para HTTP 400.
 */
export class CashRegisterClosedError extends DomainError {
  constructor() {
    super('No cash register session is currently open.', {
      code: 'CASH_REGISTER_CLOSED',
      status: 400,
    });
  }
}

export class PendingCashRegisterOrdersError extends DomainError {
  constructor(pendingOrders: unknown[]) {
    super(
      `Não é possível fechar o caixa. Existem ${pendingOrders.length} pedido(s) pendente(s) de finalização/pagamento.`,
      {
        code: 'CASH_REGISTER_PENDING_ORDERS',
        status: 409,
        details: { pendingOrders },
      }
    );
  }
}

/**
 * Transição de status inválida.
 * Ex: tentar passar pedido de NEW direto para DELIVERED.
 * Mapeia para HTTP 400.
 */
export class InvalidStatusTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Invalid status transition: ${from} -> ${to}.`, {
      code: 'INVALID_STATUS_TRANSITION',
      status: 400,
      details: { from, to },
    });
  }
}

/**
 * Tentativa de operação não autorizada para o usuário atual.
 * Mapeia para HTTP 403 (forbidden).
 *
 * Não é o mesmo que falta de autenticação (401, tratado no auth middleware).
 */
export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, {
      code: 'FORBIDDEN',
      status: 403,
    });
  }
}

/**
 * Validação de input (DTO) falhou.
 * Mapeia para HTTP 400.
 *
 * Ex: ValidationError('email', 'must be a valid email address')
 */
export class ValidationError extends DomainError {
  constructor(field: string, reason: string) {
    super(`Validation failed for "${field}": ${reason}.`, {
      code: 'VALIDATION_ERROR',
      status: 400,
      details: { field, reason },
    });
  }
}
