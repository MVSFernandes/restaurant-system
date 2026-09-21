const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://cash-audit.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const { cashRegisterService } = require('../src/services/cashRegister.service');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { orderRepository } = require('../src/repositories/order.repository');
const { userRepository } = require('../src/repositories/user.repository');
const { auditLogRepository } = require('../src/repositories/auditLog.repository');

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
    { status: 'PAID', method: 'CASH', amount: 120 },
    { status: 'PAID', method: 'PIX', amount: 40 },
    { status: 'PAID', method: 'DEBIT_CARD', amount: 30 },
    { status: 'PAID', method: 'CREDIT_CARD', amount: 50 },
    { status: 'PAID', method: 'CREDIT', amount: 60 },
    { status: 'PENDING', method: 'CASH', amount: 999 },
  ];
  orderRepository.findBySession = async () => [
    { id: 'order-1', status: 'FINISHED' },
    { id: 'order-2', status: 'CANCELED' },
  ];
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
  assert.equal(summary.orderCount, 1);
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