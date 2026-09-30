// Isolated PostgreSQL integration test. It calls PostgreSQL directly, without services.
// From the repository root:
// node backend/tests/table-tabs-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../node_modules/.stock-validation/node_modules/@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.users (
        id text primary key, name text not null, email text not null,
        password text not null, role text not null,
        created_at timestamptz default now(), updated_at timestamptz default now()
      );
      create table public.cash_register_sessions (
        id text primary key, status text not null
      );
      create table public.tables (
        id text primary key, number integer not null, status text not null
      );
      create table public.customers (
        id text primary key, credit_used numeric not null default 0,
        credit_limit numeric not null default 0, updated_at timestamptz default now()
      );
      create table public.orders (
        id text primary key,
        type text not null,
        source text not null default 'PDV',
        status text not null,
        total numeric not null,
        delivery_fee numeric not null default 0,
        customer_name text,
        customer_id text references public.customers(id),
        table_id text references public.tables(id),
        user_id text not null references public.users(id),
        waiter_id text references public.users(id),
        cash_register_session_id text references public.cash_register_sessions(id),
        delivery_type text,
        delivery_street text,
        delivery_number text,
        delivery_neighborhood text,
        delivery_reference text,
        delivery_phone text,
        delivery_notes text,
        idempotency_key text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table public.payments (
        id text primary key,
        order_id text not null references public.orders(id),
        method text not null,
        amount numeric not null,
        status text not null,
        transaction_id text,
        created_at timestamptz not null default now(),
        constraint payments_order_unique unique(order_id),
        constraint payments_method_check check(method in ('CASH','PIX','CREDIT_CARD','DEBIT_CARD','CREDIT'))
      );
      create table public.credit_transactions (
        id text primary key,
        type text not null,
        amount numeric not null,
        description text,
        customer_id text not null references public.customers(id),
        order_id text references public.orders(id),
        status text not null,
        settled_amount numeric not null default 0,
        settled_at timestamptz,
        created_at timestamptz not null default now()
      );

      insert into public.users(id,name,email,password,role)
      values ('user','Operador','o@example.test','x','CASHIER');
      insert into public.cash_register_sessions(id,status)
      values ('legacy-session','OPEN'),('tab-session','OPEN'),('empty-session','OPEN'),('compat-session','OPEN');
      insert into public.tables(id,number,status) values
        ('legacy-active',1,'OCCUPIED'),
        ('legacy-empty',2,'OCCUPIED'),
        ('inconsistent-active',3,'AVAILABLE'),
        ('multi-tab',4,'OCCUPIED'),
        ('empty-tab-table',5,'OCCUPIED'),
        ('compat-table',6,'AVAILABLE');
      insert into public.orders(
        id,type,status,total,table_id,user_id,cash_register_session_id,created_at
      ) values
        ('legacy-a','DINE_IN','NEW',10,'legacy-active','user','legacy-session','2026-09-29T10:00:00Z'),
        ('legacy-b','DINE_IN','DELIVERED',15,'legacy-active','user','legacy-session','2026-09-29T10:01:00Z'),
        ('inconsistent','DINE_IN','READY',7,'inconsistent-active','user','legacy-session','2026-09-29T10:02:00Z');
    `);

    const migration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260929180000_add_table_tabs.sql'),
      'utf8'
    );
    await db.exec(migration);

    const migrated = await db.query(`
      select
        (select count(*)::int from orders where status in ('NEW','IN_PROGRESS','READY','DELIVERED') and table_tab_id is null) orphan_orders,
        (select count(*)::int from tables t where status='OCCUPIED' and not exists (select 1 from table_tabs x where x.table_id=t.id and x.status='OPEN')) occupied_without_tab,
        (select status from tables where id='legacy-empty') empty_status,
        (select status from tables where id='inconsistent-active') inconsistent_status,
        (select count(distinct table_tab_id)::int from orders where id in ('legacy-a','legacy-b')) legacy_tabs
    `);
    assert.deepEqual(migrated.rows[0], {
      orphan_orders: 0,
      occupied_without_tab: 0,
      empty_status: 'AVAILABLE',
      inconsistent_status: 'OCCUPIED',
      legacy_tabs: 1,
    });
    console.log('PASS: general migration preserves active accounts and releases empty occupied tables');

    await db.exec(`
      update tables set status='OCCUPIED' where id='multi-tab';
      insert into table_tabs(id,table_id,cash_register_session_id,name,opened_by_id)
      values
        ('tab-a','multi-tab','tab-session','Ana','user'),
        ('tab-b','multi-tab','tab-session','Bruno','user');
      insert into orders(id,type,status,total,table_id,table_tab_id,user_id,cash_register_session_id)
      values
        ('a1','DINE_IN','NEW',12.50,'multi-tab','tab-a','user','tab-session'),
        ('a2','DINE_IN','DELIVERED',7.50,'multi-tab','tab-a','user','tab-session'),
        ('b1','DINE_IN','READY',30,'multi-tab','tab-b','user','tab-session');
    `);
    const totals = await db.query(`
      select table_tab_id, sum(total)::numeric total
      from orders where status <> 'CANCELED' and table_tab_id in ('tab-a','tab-b')
      group by table_tab_id order by table_tab_id
    `);
    assert.deepEqual(totals.rows.map((row) => [row.table_tab_id, Number(row.total)]), [
      ['tab-a', 20], ['tab-b', 30],
    ]);
    assert.equal(totals.rows.reduce((sum, row) => sum + Number(row.total), 0), 50);
    console.log('PASS: each tab has its own total and the table total is their sum');

    await assert.rejects(
      db.exec("insert into table_tabs(id,table_id,cash_register_session_id,name,opened_by_id) values ('duplicate','multi-tab','tab-session','  ANA  ','user')"),
      /table_tabs_open_name_idx/
    );
    console.log('PASS: duplicate open tab names are rejected case-insensitively');

    await db.query("select public.close_table_tab('tab-a','PIX',null,'user')");
    assert.equal((await db.query("select status from tables where id='multi-tab'")).rows[0].status, 'OCCUPIED');
    assert.equal((await db.query("select count(*)::int count from payments where order_id in ('a1','a2')")).rows[0].count, 2);
    console.log('PASS: closing one tab creates one payment per order and keeps the table occupied');

    await assert.rejects(
      db.exec("update tables set status='AVAILABLE' where id='multi-tab'"),
      /TABLE_HAS_OPEN_TABS/
    );
    console.log('PASS: PostgreSQL directly rejects closing a table with an open tab');

    await db.query("select public.close_table_tab('tab-b','CASH',null,'user')");
    assert.equal((await db.query("select status from tables where id='multi-tab'")).rows[0].status, 'AVAILABLE');
    await assert.rejects(
      db.exec("insert into orders(id,type,status,total,table_id,table_tab_id,user_id,cash_register_session_id) values ('late','DINE_IN','NEW',1,'multi-tab','tab-b','user','tab-session')"),
      /TABLE_TAB_REQUIRES_OCCUPIED_TABLE|TABLE_TAB_ALREADY_CLOSED/
    );
    console.log('PASS: closing the last tab releases the table and closed tabs reject new orders');

    await db.exec("update tables set status='OCCUPIED' where id='empty-tab-table'");
    await db.exec("insert into table_tabs(id,table_id,cash_register_session_id,name,opened_by_id) values ('empty-tab','empty-tab-table','empty-session','Vazia','user')");
    await assert.rejects(
      db.exec("update cash_register_sessions set status='CLOSED' where id='empty-session'"),
      /CASH_REGISTER_OPEN_TABS/
    );
    await db.query("select public.close_table_tab('empty-tab',null,null,'user')");
    await db.exec("update cash_register_sessions set status='CLOSED' where id='empty-session'");
    console.log('PASS: even an empty open tab blocks cash close at the database layer');

    await db.exec(`
      insert into orders(id,type,status,total,table_id,user_id,cash_register_session_id)
      values ('compat-dine','DINE_IN','NEW',8,'compat-table','user','compat-session');
      insert into orders(id,type,status,total,user_id,cash_register_session_id)
      values
        ('counter','TAKE_AWAY','NEW',2,'user','compat-session'),
        ('delivery','DELIVERY','NEW',3,'user','compat-session');
    `);
    const compatibility = await db.query(`
      select
        (select table_tab_id is not null from orders where id='compat-dine') dine_has_tab,
        (select table_tab_id is null from orders where id='counter') counter_without_tab,
        (select table_tab_id is null from orders where id='delivery') delivery_without_tab,
        (select status from tables where id='compat-table') table_status
    `);
    assert.deepEqual(compatibility.rows[0], {
      dine_has_tab: true,
      counter_without_tab: true,
      delivery_without_tab: true,
      table_status: 'OCCUPIED',
    });
    console.log('PASS: legacy dine-in gets an implicit tab; takeaway and delivery remain tabless');

    const implicitTab = await db.query("select table_tab_id from orders where id='compat-dine'");
    const implicitTabId = implicitTab.rows[0].table_tab_id;
    await db.exec("delete from orders where id='compat-dine'");
    const deletedLastOrder = await db.query(`
      select
        (select status from table_tabs where id=$1) tab_status,
        (select status from tables where id='compat-table') table_status,
        (select count(*)::int from orders where table_tab_id=$1) remaining_orders
    `, [implicitTabId]);
    assert.deepEqual(deletedLastOrder.rows[0], {
      tab_status: 'CLOSED',
      table_status: 'AVAILABLE',
      remaining_orders: 0,
    });
    console.log('PASS: deleting the last order closes its implicit tab and releases the table');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
