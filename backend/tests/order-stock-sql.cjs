// Isolated PostgreSQL integration test. From the repository root:
// npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite
// node backend/tests/order-stock-sql.cjs
const { PGlite } = require('../node_modules/.stock-validation/node_modules/@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const db = new PGlite();
  try {
    // Match every column/type used by the repository's generated DB types.
    // The existing consume RPC isn't versioned here; this fixture consumes
    // shared ingredients and raises mid-transaction to test the new wrapper.
    const types = fs.readFileSync(path.join(__dirname, '../src/types/database.ts'), 'utf8');
    for (const table of ['orders', 'order_items', 'payments', 'stock_items', 'product_stock_items', 'tables']) {
      const block = types.split(`      ${table}: {`)[1].split('        Row: {')[1].split('        }')[0];
      const columns = block.trim().split(/\r?\n/).map(line => {
        const [name, type] = line.trim().split(': ');
        const sqlType = type.includes('number') ? 'numeric' : type.includes('boolean') ? 'boolean'
          : name.endsWith('_at') ? 'timestamptz' : 'text';
        return `${name} ${sqlType}${name === 'id' ? ' primary key' : ''}`;
      });
      await db.exec(`create table public.${table} (${columns.join(',')});`);
    }
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      alter table order_items add constraint item_price check(price >= 0);
      alter table payments add constraint valid_method check(method in ('PIX', 'CASH'));
      create function public.consume_order_stock(p_items jsonb) returns jsonb language plpgsql as $$
      declare r record;
      begin
        for r in
          select l.stock_item_id, sum(l.quantity * coalesce((i->>'weight')::numeric / 1000, (i->>'quantity')::numeric)) needed
          from jsonb_array_elements(p_items) i join product_stock_items l on l.product_id = i->>'product_id'
          group by l.stock_item_id order by l.stock_item_id
        loop
          update stock_items set quantity = quantity - r.needed where id = r.stock_item_id;
          if (select quantity < 0 from stock_items where id = r.stock_item_id) then
            raise exception 'Insufficient stock of "Coca Lata".';
          end if;
        end loop;
        return '{}'::jsonb;
      end; $$;
      insert into stock_items(id, name, quantity) values ('coca', 'Coca Lata', 2);
      insert into product_stock_items(id,product_id,stock_item_id,quantity) values ('link','drink','coca',1);
      insert into tables(id,status) values ('table','AVAILABLE');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260914200000_atomic_order_creation.sql'), 'utf8'));
    await db.exec("insert into orders(id,status) values (repeat('a',64),'NEW')");
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260915150000_separate_order_idempotency_key.sql'), 'utf8'));
    assert.equal((await db.query("select idempotency_key from orders where id=repeat('a',64)")).rows[0].idempotency_key, 'a'.repeat(64));
    await db.exec("delete from orders where id=repeat('a',64)");
    const order = id => ({ id, type: 'DINE_IN', status: 'NEW', total: 10, delivery_fee: 0, table_id: 'table', user_id: 'operator' });
    const item = (id, patch = {}) => ({ id: `item-${id}`, order_id: id, product_id: 'drink', quantity: 1, price: 10, weight: null, ...patch });
    const issue = (id, items = [item(id)], payment = null, key = null) => db.query(
      'select public.create_order_with_stock($1::jsonb,$2::jsonb,$3::jsonb) result',
      [JSON.stringify({ ...order(id), idempotency_key: key }), JSON.stringify(items), payment && JSON.stringify(payment)],
    );
    const state = async () => (await db.query(`select
      (select count(*)::int from orders) orders,
      (select count(*)::int from order_items) items,
      (select count(*)::int from payments) payments,
      (select quantity::int from stock_items where id='coca') quantity,
      (select status from tables where id='table') table_status`)).rows[0];
    const initial = await state();
    for (let retry = 0; retry < 2; retry++) {
      await assert.rejects(issue('insufficient', [item('insufficient', { quantity: 3 })]), /Insufficient stock/);
      assert.deepEqual(await state(), initial);
    }
    console.log('PASS: insufficient stock and retries leave no order, items or stock changes');
    await assert.rejects(issue('bad-item', [item('bad-item', { price: -1 })]), /item_price/);
    assert.deepEqual(await state(), initial);
    await assert.rejects(issue('bad-payment', [item('bad-payment')], { id: 'payment', order_id: 'bad-payment', method: 'INVALID' }), /valid_method/);
    assert.deepEqual(await state(), initial);
    console.log('PASS: item/payment failure rolls back stock, order, items and table occupancy');
    await issue('success', [item('success')], { id: 'payment', order_id: 'success', method: 'PIX', status: 'PENDING' });
    await Promise.all([issue('success'), issue('success')]);
    assert.deepEqual(await state(), { orders: 1, items: 1, payments: 1, quantity: 1, table_status: 'OCCUPIED' });
    console.log('PASS: database replay creates one order and consumes stock once');
    const outcomes = await Promise.allSettled([issue('last-a'), issue('last-b')]);
    assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await state()).quantity, 0);
    assert.equal((await state()).orders, 2);
    await issue('uncontrolled', [item('uncontrolled', { product_id: 'no-stock-links' })]);
    assert.equal((await state()).orders, 3);
    assert.equal((await state()).quantity, 0);
    console.log('PASS: last unit cannot be oversold; unlinked products remain sellable');
    const beforeReplay = await state();
    const [first, second] = await Promise.all([
      issue('short-a', [item('short-a', { product_id: 'no-stock-links' })], null, 'scoped-key'),
      issue('short-b', [item('short-b', { product_id: 'no-stock-links' })], null, 'scoped-key'),
    ]);
    assert.equal(first.rows[0].result.id, second.rows[0].result.id);
    assert.equal((await state()).orders, beforeReplay.orders + 1);
    assert.equal((await state()).items, beforeReplay.items + 1);
    assert.equal((await state()).quantity, beforeReplay.quantity);
    console.log('PASS: independent candidate IDs with the same key replay one atomic order');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
