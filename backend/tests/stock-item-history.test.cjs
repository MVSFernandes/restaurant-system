// Excluir um insumo não pode apagar o histórico de movimentações de pedidos.
// O banco recusa (order_stock_movements.stock_item_id ON DELETE RESTRICT,
// comprovado em tests/order-cancel-sql.cjs); aqui fica a resposta da API.
const { test, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://stock-history.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const jwt = require('jsonwebtoken');
const { supabase } = require('../src/lib/supabase');
const { stockItemRepository } = require('../src/repositories/stockItem.repository');
const app = require('../src/app').default;

// PostgREST answer for the DELETE, as supabase-js returns it.
let deleteResult;
let deletedIds;
beforeEach(() => {
  deletedIds = [];
  supabase.from = (table) => {
    assert.equal(table, 'stock_items');
    return {
      delete: () => ({
        eq: async (_column, id) => {
          deletedIds.push(id);
          return deleteResult;
        },
      }),
    };
  };
});

// Exact error PostgreSQL 17 raises for ON DELETE RESTRICT (observed in PGlite
// on the real migrations): code 23001, not 23503.
const fkViolation = {
  error: {
    code: '23001',
    message: 'update or delete on table "stock_items" violates RESTRICT setting of foreign key constraint "order_stock_movements_stock_item_id_fkey" on table "order_stock_movements"',
    details: 'Key (id)=(bun) is referenced from table "order_stock_movements".',
  },
  count: null,
};

test('a stock item with order history is refused with a clear 409', async () => {
  deleteResult = fkViolation;
  await assert.rejects(
    stockItemRepository.delete('bun'),
    (error) => error.status === 409
      && error.code === 'STOCK_ITEM_HAS_ORDER_HISTORY'
      && /não pode ser excluído, para preservar o histórico/.test(error.message)
  );
});

test('a stock item without history is still deleted', async () => {
  deleteResult = { error: null, count: 1 };
  await stockItemRepository.delete('salt');
  assert.deepEqual(deletedIds, ['salt']);
});

test('other foreign key errors keep the previous mapping', async () => {
  deleteResult = { error: { code: '23503', message: 'violates foreign key constraint "other_fkey"' }, count: null };
  await assert.rejects(stockItemRepository.delete('x'), (error) => error.code === 'FOREIGN_KEY_VIOLATION');
});

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const del = (id) => fetch(`${baseUrl}/stock/${id}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${jwt.sign({ id: 'admin-1', role: 'ADMIN' }, process.env.JWT_SECRET)}` },
});

test('DELETE /api/stock/:id answers 409 with the message when there is history', async () => {
  deleteResult = fkViolation;
  const response = await del('bun');
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(JSON.stringify(body), /preservar o histórico/);
});

test('DELETE /api/stock/:id still answers 204 without history', async () => {
  deleteResult = { error: null, count: 1 };
  const response = await del('salt');
  assert.equal(response.status, 204);
});
