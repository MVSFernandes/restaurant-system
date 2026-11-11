const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://payables-supplier.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const { supabase } = require('../src/lib/supabase');
const { getPayables } = require('../src/controllers/finance.controller');

const originalFrom = supabase.from.bind(supabase);
afterEach(() => { supabase.from = originalFrom; });

const row = (id, description, supplierId, supplier) => ({
  id,
  description,
  amount: 100,
  due_date: '2026-11-20T00:00:00.000Z',
  paid: false,
  paid_at: null,
  supplier_id: supplierId,
  created_at: '2026-11-11T12:00:00.000Z',
  updated_at: '2026-11-11T12:00:00.000Z',
  supplier,
});

function fakeQuery(rows) {
  const calls = [];
  const builder = {
    select: (...args) => { calls.push(['select', ...args]); return builder; },
    order: (...args) => {
      calls.push(['order', ...args]);
      // A segunda ordenação encerra a consulta, como no supabase-js (thenable).
      return calls.filter(([method]) => method === 'order').length === 2
        ? Promise.resolve({ data: rows, error: null })
        : builder;
    },
  };
  supabase.from = (table) => { calls.push(['from', table]); return builder; };
  return calls;
}

const response = () => ({
  code: 200,
  body: undefined,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
});

test('GET /finance/payables returns the linked supplier name in a single query', async () => {
  const calls = fakeQuery([
    row('payable-linked', 'Hortifruti', 'supplier-1', { id: 'supplier-1', name: 'Distribuidora Aurora' }),
    row('payable-unlinked', 'Manutenção', null, null),
    // PostgREST pode devolver a relação como lista; o primeiro item vale.
    row('payable-array', 'Bebidas', 'supplier-2', [{ id: 'supplier-2', name: 'Bebidas Sul' }]),
  ]);

  const res = response();
  await getPayables({}, res);

  assert.equal(res.code, 200);
  assert.deepEqual(calls.filter(([method]) => method === 'from'), [['from', 'payable_accounts']]);
  assert.deepEqual(calls.find(([method]) => method === 'select'), ['select', '*, supplier:suppliers(id,name)']);
  assert.deepEqual(calls.filter(([method]) => method === 'order'), [
    ['order', 'paid', { ascending: true }],
    ['order', 'due_date', { ascending: true }],
  ]);

  const [linked, unlinked, fromArray] = res.body;
  assert.equal(linked.supplierId, 'supplier-1');
  assert.deepEqual(linked.supplier, { id: 'supplier-1', name: 'Distribuidora Aurora' });
  assert.equal(unlinked.supplierId, null);
  assert.equal(unlinked.supplier, null);
  assert.deepEqual(fromArray.supplier, { id: 'supplier-2', name: 'Bebidas Sul' });
  // O vencimento continua o instante gravado (o PR #77 formata no fuso da instalação).
  assert.equal(new Date(linked.dueDate).toISOString(), '2026-11-20T00:00:00.000Z');
});
