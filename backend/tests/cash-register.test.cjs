const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://cash-audit.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const { cashRegisterService } = require('../src/services/cashRegister.service');
const { orderService } = require('../src/services/order.service');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { orderRepository } = require('../src/repositories/order.repository');
const { userRepository } = require('../src/repositories/user.repository');
const { auditLogRepository } = require('../src/repositories/auditLog.repository');
const { invoiceRepository } = require('../src/repositories/invoice.repository');

const openedAt = new Date('2026-09-21T12:00:00.000Z');
const baseSession = {
  id: 'session-1',
  status: 'OPEN',
  openingAmount: 100,
  closingAmount: null,
  withdrawalTotal: 0,
  notes: null,
  openedById: 'user-open',
  closedById: null,
  openedAt,
  closedAt: null,
};

beforeEach(() => {
  cashRegisterRepository.findOpenSession = async () => ({ ...baseSession });
  cashRegisterRepository.findRecentSessions = async () => [{ ...baseSession }];
  cashRegisterRepository.findWithdrawalsBySession = async () => [{
    id: 'withdrawal-1',
    sessionId: 'session-1',
    amount: 20,
    reason: 'Fornecedor',
    createdById: 'user-withdrawal',
    createdAt: new Date('2026-09-21T13:00:00.000Z'),
  }];
  paymentRepository.findBySession = async () => [
    { orderId: 'order-1', status: 'PAID', method: 'CASH', amount: 120 },
    { orderId: 'order-1', status: 'PAID', method: 'PIX', amount: 40 },
    { orderId: 'order-3', status: 'PAID', method: 'DEBIT_CARD', amount: 30 },
    { orderId: 'order-3', status: 'PAID', method: 'CREDIT_CARD', amount: 50 },
    { orderId: 'order-3', status: 'PAID', method: 'CREDIT', amount: 60 },
    { orderId: 'order-2', status: 'PENDING', method: 'CASH', amount: 999 },
  ];
  paymentRepository.cancelPendingByOrder = async () => undefined;
  orderRepository.findBySession = async () => [
    { id: 'order-1', status: 'FINISHED', total: 125.5 },
    { id: 'order-2', status: 'CANCELED', total: 999 },
    { id: 'order-3', status: 'FINISHED', total: 80.25 },
  ];
  invoiceRepository.findAllForOrders = async (orderIds) => [
    { orderId: 'order-1', model: '65', status: 'authorized' },
    { orderId: 'order-3', model: '55', status: 'authorized' },
    { orderId: 'order-3', model: '55', status: 'error' },
    { orderId: 'order-1', model: '65', status: 'processing' },
    { orderId: 'order-2', model: '65', status: 'error' },
  ].filter((invoice) => orderIds.includes(invoice.orderId));
  userRepository.findById = async (id) => ({
    id,
    name: {
      'user-open': 'Ana',
      'user-close': 'Bruno',
      'user-withdrawal': 'Carla',
    }[id] || 'Operador',
  });
  cashRegisterRepository.findPendingOrdersForClose = async () => [];
  auditLogRepository.log = async () => undefined;
});

test('session summaries identify operators and separate drawer cash from digital movement', async () => {
  const summary = await cashRegisterService.getCurrentSession();

  assert.equal(summary.openedBy.name, 'Ana');
  assert.equal(summary.closedBy, null);
  assert.equal(summary.withdrawals[0].createdBy.name, 'Carla');
  assert.equal(summary.totalEntries, 120);
  assert.equal(summary.totalWithdrawals, 20);
  assert.equal(summary.expectedBalance, 200);
  assert.equal(summary.pixTotal, 40);
  assert.equal(summary.debitTotal, 30);
  assert.equal(summary.creditTotal, 50);
  assert.equal(summary.onAccountTotal, 60);
  assert.equal(summary.totalRevenue, 300);
  assert.equal(summary.orderCount, 2);
  assert.deepEqual(summary.fiscalDocuments, {
    authorizedNfceCount: 1,
    authorizedNfceTotal: 125.5,
    authorizedNfeCount: 1,
    authorizedNfeTotal: 80.25,
    pendingOrRejectedCount: 2,
  });
});

test('withdrawal suggestion preserves the opening fund and reports when there is nothing to remove', async () => {
  const suggestion = await cashRegisterService.suggestWithdrawal();
  assert.equal(suggestion.suggestedAmount, 100);
  assert.equal(suggestion.openingAmount, 100);

  paymentRepository.findBySession = async () => [];
  cashRegisterRepository.findWithdrawalsBySession = async () => [];
  const zero = await cashRegisterService.suggestWithdrawal();
  assert.equal(zero.suggestedAmount, 0);
  assert.match(zero.message, /apenas o fundo/);
});

test('closing records the responsible operator and requires a reason for a drawer difference', async () => {
  await assert.rejects(
    cashRegisterService.closeSession(190, null, 'user-close'),
    (error) => error.status === 400 && /justificativa/.test(error.message)
  );

  let closePatch;
  cashRegisterRepository.closeOpenSession = async (_id, patch) => {
    closePatch = patch;
    return {
      ...baseSession,
      ...patch,
      closedById: 'user-close',
    };
  };

  const closed = await cashRegisterService.closeSession(190, 'Troco informado incorretamente', 'user-close');

  assert.equal(closePatch.closedById, 'user-close');
  assert.equal(closePatch.notes, 'Troco informado incorretamente');
  assert.equal(closed.closedBy.name, 'Bruno');
  assert.equal(closed.closingAmount - closed.expectedBalance, -10);
});

test('withdrawals persist the acting user and return a safe operator summary', async () => {
  let inserted;
  cashRegisterRepository.addWithdrawal = async (withdrawal) => {
    inserted = withdrawal;
    return withdrawal;
  };

  const result = await cashRegisterService.addWithdrawal(15, '  Compra urgente  ', 'user-withdrawal');

  assert.equal(inserted.createdById, 'user-withdrawal');
  assert.equal(inserted.reason, 'Compra urgente');
  assert.deepEqual(result.createdBy, { id: 'user-withdrawal', name: 'Carla' });
});

test('canceling a public pending order cancels its payment and allows cash close', async () => {
  let order = {
    id: 'public-order',
    type: 'DELIVERY',
    source: 'PUBLIC_MENU',
    status: 'NEW',
    total: 17.75,
    tableId: null,
    waiterId: null,
  };
  let payment = {
    id: 'public-payment',
    orderId: order.id,
    method: 'PIX',
    amount: order.total,
    status: 'PENDING',
  };

  orderRepository.findById = async () => order;
  orderRepository.findItems = async () => [];
  orderRepository.update = async (_id, patch) => {
    order = { ...order, ...patch };
    return order;
  };
  orderRepository.findBySession = async () => [order];
  paymentRepository.cancelPendingByOrder = async (orderId) => {
    if (payment.orderId === orderId && payment.status === 'PENDING') {
      payment = { ...payment, status: 'CANCELED' };
    }
  };
  paymentRepository.findBySession = async () => [payment];
  cashRegisterRepository.findWithdrawalsBySession = async () => [];
  cashRegisterRepository.findPendingOrdersForClose = async () =>
    order.status === 'CANCELED'
      ? []
      : [{
          id: order.id,
          type: order.type,
          orderStatus: order.status,
          total: order.total,
          paymentStatus: payment.status,
          paymentMethod: payment.method,
        }];
  cashRegisterRepository.closeOpenSession = async (_id, patch) => ({
    ...baseSession,
    ...patch,
  });

  await orderService.updateStatus(order.id, 'CANCELED', {
    id: 'user-close',
    role: 'ADMIN',
  });
  const closed = await cashRegisterService.closeSession(100, null, 'user-close');

  assert.equal(order.status, 'CANCELED');
  assert.equal(payment.status, 'CANCELED');
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.totalRevenue, 0);
  assert.equal(closed.orderCount, 0);
});

test('a genuinely pending order still blocks cash close', async () => {
  let closeCalled = false;
  cashRegisterRepository.findPendingOrdersForClose = async () => [{
    id: 'active-order',
    type: 'DELIVERY',
    orderStatus: 'NEW',
    total: 20,
    paymentStatus: 'PENDING',
    paymentMethod: 'PIX',
  }];
  cashRegisterRepository.closeOpenSession = async () => {
    closeCalled = true;
    return baseSession;
  };

  await assert.rejects(
    cashRegisterService.closeSession(100, null, 'user-close'),
    (error) =>
      error.code === 'CASH_REGISTER_PENDING_ORDERS' &&
      error.details.pendingOrders[0].id === 'active-order'
  );
  assert.equal(closeCalled, false);
});

test('canceled paid orders are excluded from cash movement totals', async () => {
  paymentRepository.findBySession = async () => [{
    orderId: 'order-2',
    status: 'PAID',
    method: 'PIX',
    amount: 999,
  }];

  const summary = await cashRegisterService.getCurrentSession();

  assert.equal(summary.pixTotal, 0);
  assert.equal(summary.totalRevenue, 0);
});

test('cash-close migration adds payment cancellation and excludes canceled orders', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20260922120000_cancel_pending_payments_with_orders.sql'),
    'utf8'
  );

  assert.match(sql, /payments_status_check[\s\S]*'CANCELED'/i);
  assert.match(sql, /orders[.]status = 'CANCELED'[\s\S]*payment[.]status = 'PENDING'/i);
  assert.match(sql, /create trigger trg_cancel_pending_payments_with_order/i);
  assert.match(sql, /orders[.]status <> 'CANCELED'/i);
});

test('product-name migration backfills current names and marks missing products explicitly', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20260921150000_add_order_item_product_name.sql'),
    'utf8'
  );

  assert.match(sql, /add column if not exists product_name text/i);
  assert.match(sql, /from public[.]products as product/i);
  assert.match(sql, /where product[.]id = item[.]product_id/i);
  assert.match(sql, /'Produto removido'/);
  assert.match(sql, /alter column product_name set not null/i);
});
