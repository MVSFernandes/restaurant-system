// Provisionamento (Etapa 1B.3) sobre o schema REAL, num PostgreSQL LOCAL descartável.
//
// O que este ensaio prova:
// - as migrations ativas, aplicadas por `supabase db push`, deixam o banco
//   "up_to_date" para o verificador versionado (o mesmo usado pelo comando);
// - o SQL do marcador grava uma vez e não grava de novo;
// - a linha de restaurant_config e o administrador passam pelas constraints e
//   pelos grants reais, gravados COMO service_role (o papel da API);
// - a aplicação lê o resultado (mappers) e o login aceita a senha (bcrypt.compare);
// - reexecução não duplica nada; dados e configuração existentes não mudam;
// - depois do provisionamento só existem as linhas esperadas (sem dados de outro restaurante).
//
// O que ele NÃO prova (fica para um projeto Supabase descartável, ver
// backend/PROVISIONING.md): API REST/PostgREST real, Storage (o
// bucket é simulado aqui), login HTTP e o fluxo caixa → pedido → cancelamento.
//
// Segurança: só localhost; cada cenário cria e apaga o próprio banco
// (rs_provisioning_<aleatório>); papéis da API criados só se faltarem.
// Requer servidor com ssl=on (Supabase CLI) e o driver pg (ver tests/migration-control-pg.cjs).
//
//   PROVISIONING_PG_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres \
//     node -r ts-node/register/transpile-only tests/provisioning-pg.cjs        (de backend/)
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bcrypt = require('bcrypt');

const lib = require('../scripts/migrations/lib.cjs');
const provision = require('../src/provisioning/provision');
const { toUserDomain } = require('../src/mappers/user.mapper');
const { toRestaurantConfigDomain } = require('../src/mappers/restaurantConfig.mapper');

const serverUrl = process.env.PROVISIONING_PG_URL;
if (!serverUrl) {
  console.log('NOT RUN: set PROVISIONING_PG_URL to a local PostgreSQL server with ssl=on.');
  process.exit(2);
}
if (!lib.isLocalUrl(serverUrl)) {
  console.error(`REFUSED: ${new URL(serverUrl).hostname} is not a local host.`);
  process.exit(2);
}

const { Client } = lib.loadPg();
const BACKEND = lib.BACKEND_DIR;
const SUPABASE = path.join(BACKEND, 'node_modules', 'supabase', 'bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase');
const CHECK = path.join(BACKEND, 'scripts', 'migrations', 'check-migration-state.cjs');
const API_ROLES = ['anon', 'authenticated', 'service_role'];

const REF = 'abcdefghijklmnopqrst';
const INSTALLATION = 'cantina-nova-hml';
const ENVIRONMENT = 'staging';
const PASSWORD = 'correct horse battery staple 42';
const expect = { projectRef: REF, installationId: INSTALLATION, environment: ENVIRONMENT };
const summary = { supabaseUrl: `https://${REF}.supabase.co`, installationId: INSTALLATION, appEnv: ENVIRONMENT, linkedProjectRef: REF };

const urlFor = (database) => {
  const copy = new URL(serverUrl);
  copy.pathname = `/${database}`;
  return copy.toString();
};

async function query(url, sql, params = [], { role = null } = {}) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (role) await client.query(`set role ${role}`);
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/**
 * O gateway real troca "API com service_role" por SQL com `set role service_role`
 * (mesmos grants e mesmo BYPASSRLS) e "CLI vinculada" por SQL como postgres.
 * O Storage não existe no PostgreSQL puro: o bucket fica em memória.
 */
class LocalPgGateway {
  constructor(url) { this.url = url; this.buckets = []; this.writes = 0; }
  async migrationState() {
    const run = spawnSync(process.execPath, [CHECK, '--db-url', this.url, '--json'], { cwd: BACKEND, encoding: 'utf8' });
    try { return { verdict: JSON.parse(run.stdout).verdict, exitCode: run.status }; } catch { return { verdict: 'error', exitCode: run.status }; }
  }
  async readMarker() {
    try {
      const rows = await query(this.url, 'select installation_id, environment from public.app_installation limit 2', [], { role: 'service_role' });
      if (rows.length === 0) return { kind: 'missing' };
      if (rows.length > 1) return { kind: 'refused', reason: 'mais de uma linha' };
      return { kind: 'found', marker: { installationId: rows[0].installation_id, environment: rows[0].environment } };
    } catch (error) {
      if (error.code === '42P01') return { kind: 'table-missing' };
      return { kind: 'refused', reason: error.code };
    }
  }
  async insertMarkerIfAbsent(identity, emptyTables) { this.writes += 1; await query(this.url, provision.markerInsertSql(identity, emptyTables)); }
  async countRows(table) { return (await query(this.url, `select count(*)::int as n from public.${table}`, [], { role: 'service_role' }))[0].n; }
  async countUsers() {
    const [row] = await query(this.url, "select count(*)::int as total, count(*) filter (where role = 'ADMIN')::int as admins from public.users", [], { role: 'service_role' });
    return row;
  }
  // Mesma chamada que a API faz (rpc create_first_admin), numa conexão própria, como service_role.
  async createFirstAdmin(row) {
    this.writes += 1;
    try {
      await query(this.url, 'select public.create_first_admin($1, $2, $3, $4)', [row.id, row.name, row.email, row.password], { role: 'service_role' });
      return 'created';
    } catch (error) {
      if (String(error.message).includes('FIRST_ADMIN_USERS_ALREADY_EXIST')) return 'users-exist';
      throw error;
    }
  }
  async readConfigRows() { return query(this.url, 'select id, name from public.restaurant_config', [], { role: 'service_role' }); }
  async insertConfig(row) {
    this.writes += 1;
    const columns = Object.keys(row);
    await query(this.url, `insert into public.restaurant_config (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row), { role: 'service_role' });
  }
  async getBucket(id) { const found = this.buckets.find((b) => b.id === id); return found ? { ...found } : null; }
  async createBucket(spec) { this.writes += 1; this.buckets.push({ id: spec.id, public: spec.public, fileSizeLimit: spec.fileSizeLimit, allowedMimeTypes: [...spec.allowedMimeTypes] }); }
}

const silent = (gateway) => ({ gateway, log: () => {}, promptPassword: async () => PASSWORD });

async function withDatabase(run) {
  const database = `rs_provisioning_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`create database ${database}`);
  await admin.end();
  const url = urlFor(database);
  await query(url, lib.SUPABASE_DATABASE_SETUP);
  try {
    const push = spawnSync(SUPABASE, ['db', 'push', '--db-url', url, '--yes'], { cwd: BACKEND, encoding: 'utf8', input: 'y\n' });
    assert.equal(push.status, 0, `${push.stdout}${push.stderr}`);
    await run(url, new LocalPgGateway(url));
  } finally {
    const cleanup = new Client({ connectionString: serverUrl });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${database} with (force)`);
    await cleanup.end();
  }
}

// Linhas de todas as tabelas de public (menos as de controle das migrations).
async function publicRowCounts(url) {
  const tables = (await query(url, "select tablename from pg_tables where schemaname = 'public' order by tablename")).map((r) => r.tablename);
  const counts = {};
  for (const table of tables) counts[table] = (await query(url, `select count(*)::int as n from public.${table}`))[0].n;
  return counts;
}

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });

scenario('instalação nova: marcador, configuração, storage e administrador sobre o schema real; login aceita a senha', () => withDatabase(async (url, gateway) => {
  const deps = silent(gateway);
  assert.equal((await gateway.migrationState()).verdict, 'up_to_date');
  assert.equal(await provision.runMarker(expect, summary, deps, { newInstallation: true }), 'created');
  assert.equal(await provision.runConfig(expect, summary, deps, { restaurantName: 'Cantina Nova' }), 'created');
  assert.equal(await provision.runStorage(expect, summary, deps), 'created');
  assert.equal(await provision.runAdmin(expect, summary, deps, { name: 'Responsável', email: 'responsavel@cantina.example' }), 'created');

  const [marker] = await query(url, 'select installation_id, environment from public.app_installation');
  assert.deepEqual(marker, { installation_id: INSTALLATION, environment: ENVIRONMENT });

  const [configRow] = await query(url, 'select * from public.restaurant_config');
  const config = toRestaurantConfigDomain(configRow);
  assert.equal(config.name, 'Cantina Nova');
  assert.equal(config.urbanDeliveryFee, null);
  assert.equal(config.ruralDeliveryFee, null);
  assert.equal(config.nfceEnabled, false);
  assert.equal(config.nfceGroupItems, false);
  for (const field of ['logoUrl', 'bannerUrl', 'address', 'phone', 'openingHours', 'openingDays', 'deliveryFee', 'enabledPayments', 'cnpj', 'legalName', 'stateRegistration', 'taxRegime', 'fiscalCityIbgeCode', 'defaultCfop', 'defaultNcm']) {
    assert.equal(config[field], null, `${field} vazio`);
  }

  const [userRow] = await query(url, 'select * from public.users');
  const user = toUserDomain(userRow);
  assert.equal(user.role, 'ADMIN');
  assert.equal(await bcrypt.compare(PASSWORD, user.password), true, 'a senha confere como em auth.service');
  assert.equal(await bcrypt.compare('outra senha qualquer', user.password), false);

  const counts = await publicRowCounts(url);
  const nonEmpty = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
  assert.deepEqual(nonEmpty, { app_installation: 1, order_stock_ledger_rollout: 1, restaurant_config: 1, users: 1 },
    'só o marcador, a configuração, o administrador e a linha de controle da migration 1A');
  assert.equal((await gateway.migrationState()).verdict, 'up_to_date', 'o catálogo continua idêntico (nenhum objeto criado)');
}));

scenario('reexecução: nenhum comando grava de novo; linhas idênticas', () => withDatabase(async (url, gateway) => {
  const deps = silent(gateway);
  await provision.runMarker(expect, summary, deps, { newInstallation: true });
  await provision.runConfig(expect, summary, deps, { restaurantName: 'Cantina Nova' });
  await provision.runStorage(expect, summary, deps);
  await provision.runAdmin(expect, summary, deps, { name: 'Responsável', email: 'responsavel@cantina.example' });
  const snapshot = JSON.stringify(await query(url, 'select (select json_agg(m) from public.app_installation m) as m, (select json_agg(c) from public.restaurant_config c) as c, (select json_agg(u) from public.users u) as u'));
  const writes = gateway.writes;

  assert.equal(await provision.runMarker(expect, summary, deps, { newInstallation: true }), 'already');
  assert.equal(await provision.runConfig(expect, summary, deps, { restaurantName: 'Outro Nome' }), 'preserved');
  assert.equal(await provision.runStorage(expect, summary, deps), 'already');
  await assert.rejects(provision.runAdmin(expect, summary, deps, { name: 'Outro', email: 'outro@cantina.example' }), /USERS_ALREADY_EXIST|já tem 1 usuário/);
  // O próprio SQL do marcador, repetido, não grava (where not exists).
  assert.deepEqual(await query(url, provision.markerInsertSql({ installationId: INSTALLATION, environment: ENVIRONMENT })), []);

  assert.equal(gateway.writes, writes);
  assert.equal(JSON.stringify(await query(url, 'select (select json_agg(m) from public.app_installation m) as m, (select json_agg(c) from public.restaurant_config c) as c, (select json_agg(u) from public.users u) as u')), snapshot);
}));

scenario('banco existente de outra instalação: tudo recusado, nada muda', () => withDatabase(async (url, gateway) => {
  await query(url, "insert into public.app_installation (installation_id, environment) values ('mesa-farta-dev', 'development')");
  await query(url, "insert into public.restaurant_config (id, name, phone) values ('1', 'Restaurante Existente', '5555')");
  await query(url, "insert into public.users (id, name, email, password, role) values ('c1', 'Caixa', 'caixa@x.example', 'hash', 'CASHIER')");
  const before = JSON.stringify(await publicRowCounts(url)) + JSON.stringify(await query(url, 'select * from public.restaurant_config')) + JSON.stringify(await query(url, 'select * from public.users'));
  const deps = silent(gateway);

  await assert.rejects(provision.runMarker(expect, summary, deps, { newInstallation: true }), /mesa-farta-dev/);
  await assert.rejects(provision.runConfig(expect, summary, deps, { restaurantName: 'Cantina Nova' }), /IDENTITY_NOT_CONFIRMED|outra instalação|mesa-farta-dev/);
  await assert.rejects(provision.runStorage(expect, summary, deps), /mesa-farta-dev/);
  await assert.rejects(provision.runAdmin(expect, summary, deps, { name: 'Responsável', email: 'r@x.example' }), /mesa-farta-dev/);

  assert.equal(gateway.writes, 0);
  const after = JSON.stringify(await publicRowCounts(url)) + JSON.stringify(await query(url, 'select * from public.restaurant_config')) + JSON.stringify(await query(url, 'select * from public.users'));
  assert.equal(after, before);
}));

scenario('banco sem marcador mas com dados: --new-installation recusado; nenhum usuário promovido', () => withDatabase(async (url, gateway) => {
  await query(url, "insert into public.users (id, name, email, password, role) values ('w1', 'Garçom', 'garcom@x.example', 'hash', 'WAITER')");
  const deps = silent(gateway);
  await assert.rejects(provision.runMarker(expect, summary, deps, { newInstallation: true }), /já tem dados de aplicação em users \(1\)/);
  assert.equal(gateway.writes, 0);
  assert.deepEqual(await query(url, 'select count(*)::int as n from public.app_installation'), [{ n: 0 }]);
  assert.deepEqual(await query(url, 'select id, role from public.users'), [{ id: 'w1', role: 'WAITER' }]);
}));

// ---------- primeiro administrador: concorrência ----------
const fakeHash = async (password) => bcrypt.hash(password, provision.BCRYPT_ROUNDS);
const serviceClient = async (url) => {
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('set role service_role');
  return client;
};
const waitUntilBlocked = async (url, pid) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await query(url, 'select wait_event_type from pg_stat_activity where pid = $1', [pid]);
    if (row && row.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('a segunda conexão não chegou a esperar o lock');
};

scenario('concorrência: duas conexões independentes chamando create_first_admin criam UMA conta; a segunda é recusada', () => withDatabase(async (url) => {
  const first = await serviceClient(url);
  const second = await serviceClient(url);
  try {
    const secondPid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    await first.query('begin');
    await first.query('select public.create_first_admin($1, $2, $3, $4)', ['adm-a', 'Admin A', 'a@cantina.example', await fakeHash('senha-da-execucao-a')]);
    // A primeira transação ainda não terminou: a segunda chamada tem de esperar.
    const pending = second.query('select public.create_first_admin($1, $2, $3, $4)', ['adm-b', 'Admin B', 'b@cantina.example', await fakeHash('senha-da-execucao-b')])
      .then(() => 'created', (error) => error);
    await waitUntilBlocked(url, secondPid);
    await first.query('commit');
    const outcome = await pending;
    assert.ok(outcome instanceof Error, 'a segunda execução não pode criar conta');
    assert.match(outcome.message, /FIRST_ADMIN_USERS_ALREADY_EXIST/);
    assert.doesNotMatch(outcome.message, /\$2[aby]\$/, 'o erro não repete o hash');
  } finally {
    await first.end();
    await second.end();
  }
  assert.deepEqual(await query(url, 'select id, role from public.users'), [{ id: 'adm-a', role: 'ADMIN' }]);
}));

scenario('concorrência: dois `admin` completos em paralelo (gateways e conexões independentes) criam UMA conta', () => withDatabase(async (url) => {
  const deps = silent(new LocalPgGateway(url));
  await provision.runMarker(expect, summary, deps, { newInstallation: true });
  const runA = provision.runAdmin(expect, summary, silent(new LocalPgGateway(url)), { name: 'Admin A', email: 'a@cantina.example' });
  const runB = provision.runAdmin(expect, summary, silent(new LocalPgGateway(url)), { name: 'Admin B', email: 'b@cantina.example' });
  const results = await Promise.allSettled([runA, runB]);
  const created = results.filter((r) => r.status === 'fulfilled');
  const refused = results.filter((r) => r.status === 'rejected');
  assert.equal(created.length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(refused.length, 1);
  assert.match(String(refused[0].reason.message), /USERS_ALREADY_EXIST|já tem 1 usuário|outra execução/);
  assert.deepEqual(await query(url, 'select count(*)::int as n, count(*) filter (where role = \'ADMIN\')::int as admins from public.users'), [{ n: 1, admins: 1 }]);
}));

scenario('contraprova: contagem seguida de insert, em duas transações, cria DOIS administradores (o defeito corrigido)', () => withDatabase(async (url) => {
  const first = await serviceClient(url);
  const second = await serviceClient(url);
  try {
    await first.query('begin');
    await second.query('begin');
    assert.equal((await first.query('select count(*)::int as n from public.users')).rows[0].n, 0);
    assert.equal((await second.query('select count(*)::int as n from public.users')).rows[0].n, 0);
    await first.query("insert into public.users (id, name, email, password, role) values ('a', 'A', 'a@x.example', 'h', 'ADMIN')");
    await second.query("insert into public.users (id, name, email, password, role) values ('b', 'B', 'b@x.example', 'h', 'ADMIN')");
    await first.query('commit');
    await second.query('commit');
  } finally {
    await first.end();
    await second.end();
  }
  assert.equal((await query(url, 'select count(*)::int as n from public.users'))[0].n, 2);
}));

scenario('create_first_admin: não promove nem altera contas, não limita outros ADMIN da aplicação, só service_role executa', () => withDatabase(async (url) => {
  // Usuário existente que não é ADMIN: recusado, nada promovido.
  await query(url, "insert into public.users (id, name, email, password, role) values ('w1', 'Garçom', 'garcom@x.example', 'h', 'WAITER')");
  await assert.rejects(query(url, 'select public.create_first_admin($1, $2, $3, $4)', ['adm', 'Admin', 'adm@x.example', await fakeHash('uma senha qualquer')], { role: 'service_role' }), /FIRST_ADMIN_USERS_ALREADY_EXIST/);
  assert.deepEqual(await query(url, 'select id, role from public.users'), [{ id: 'w1', role: 'WAITER' }]);
  // A aplicação continua criando administradores normalmente (insert como service_role, como POST /api/users).
  await query(url, "insert into public.users (id, name, email, password, role) values ('adm2', 'Outro Admin', 'outro@x.example', 'h', 'ADMIN'), ('adm3', 'Mais Um', 'mais@x.example', 'h', 'ADMIN')", [], { role: 'service_role' });
  assert.equal((await query(url, "select count(*)::int as n from public.users where role = 'ADMIN'"))[0].n, 2);
  // Entradas inválidas e hash que não é bcrypt são recusados sem ecoar o valor.
  await query(url, 'delete from public.users');
  await assert.rejects(query(url, 'select public.create_first_admin($1, $2, $3, $4)', ['adm', 'Admin', 'adm@x.example', 'senha-em-texto-puro'], { role: 'service_role' }), (error) => /FIRST_ADMIN_INVALID_HASH/.test(error.message) && !error.message.includes('senha-em-texto-puro'));
  await assert.rejects(query(url, 'select public.create_first_admin($1, $2, $3, $4)', ['adm', ' ', 'adm@x.example', await fakeHash('uma senha qualquer')], { role: 'service_role' }), /FIRST_ADMIN_INVALID_INPUT/);
  assert.equal((await query(url, 'select count(*)::int as n from public.users'))[0].n, 0);
  // Permissões: só service_role.
  const [grants] = await query(url, `select
    has_function_privilege('anon', 'public.create_first_admin(text,text,text,text)', 'execute') as anon,
    has_function_privilege('authenticated', 'public.create_first_admin(text,text,text,text)', 'execute') as authenticated,
    has_function_privilege('service_role', 'public.create_first_admin(text,text,text,text)', 'execute') as service_role`);
  assert.deepEqual(grants, { anon: false, authenticated: false, service_role: true });
}));

// ---------- instalação nova: todas as tabelas de negócio ----------
// Uma linha mínima válida por tabela (checks respeitadas). As FKs ficam
// desligadas (session_replication_role = replica) só para isolar cada tabela.
const SEED = {
  audit_logs: "insert into public.audit_logs (id, action, entity, entity_id, user_id) values ('t', 'CREATE', 'Order', 'o', 'u')",
  cash_register_sessions: "insert into public.cash_register_sessions (id, opening_amount, opened_by_id) values ('t', 0, 'u')",
  cash_withdrawals: "insert into public.cash_withdrawals (id, amount, reason, session_id, created_by_id) values ('t', 1, 'r', 's', 'u')",
  categories: "insert into public.categories (id, name) values ('t', 'Lanches')",
  credit_settlements: "insert into public.credit_settlements (id, charge_id, payment_id, amount) values ('t', 'c', 'p', 1)",
  credit_transactions: "insert into public.credit_transactions (id, type, amount, customer_id) values ('t', 'CHARGE', 1, 'c')",
  customers: "insert into public.customers (id, name) values ('t', 'Cliente')",
  invoices: "insert into public.invoices (id, focus_ref) values ('t', 'ref')",
  marmita_menu_items: "insert into public.marmita_menu_items (id, day_of_week, name, \"group\") values ('t', 1, 'Prato', 'g')",
  order_items: "insert into public.order_items (id, price, order_id, product_id, product_name) values ('t', 1, 'o', 'p', 'Produto')",
  order_stock_legacy_reviews: "insert into public.order_stock_legacy_reviews (order_ref, status_at_migration, order_created_at, items_snapshot, estimated_return) values ('o', 'NEW', now(), '[]', '[]')",
  order_stock_movements: "insert into public.order_stock_movements (order_ref, stock_item_id, direction, quantity, reason) values ('o', 's', 'OUT', 1, 'ORDER_CREATED')",
  orders: "insert into public.orders (id, type, total, source) values ('t', 'TAKE_AWAY', 0, 'PUBLIC_MENU')",
  payable_accounts: "insert into public.payable_accounts (id, description, amount, due_date) values ('t', 'Conta', 1, now())",
  payments: "insert into public.payments (id, method, amount, order_id) values ('t', 'CASH', 1, 'o')",
  product_stock_items: "insert into public.product_stock_items (id, quantity, product_id, stock_item_id) values ('t', 1, 'p', 's')",
  products: "insert into public.products (id, name, price, category_id) values ('t', 'Produto', 1, 'c')",
  restaurant_config: "insert into public.restaurant_config (id, name) values ('t', 'Outro Restaurante')",
  stock_items: "insert into public.stock_items (id, name, quantity, unit) values ('t', 'Pão', 1, 'un')",
  supplier_stock_items: "insert into public.supplier_stock_items (id, price, supplier_id, stock_item_id) values ('t', 1, 's', 'i')",
  suppliers: "insert into public.suppliers (id, name) values ('t', 'Fornecedor')",
  table_tabs: "insert into public.table_tabs (id, table_id, cash_register_session_id, name, opened_by_id) values ('t', 'm', 's', 'Mesa', 'u')",
  tables: "insert into public.tables (id, number) values ('t', 1)",
  users: "insert into public.users (id, name, email, password, role) values ('t', 'Caixa', 'caixa@x.example', 'h', 'CASHIER')",
};

scenario('instalação nova recusada com dados em CADA tabela de negócio (inclusive as antes ignoradas); dados preservados', () => withDatabase(async (url, gateway) => {
  const business = provision.newInstallationEmptyTables();
  assert.deepEqual(Object.keys(SEED).sort(), [...business].sort(), 'o ensaio cobre exatamente as tabelas de negócio do schema versionado');
  const deps = silent(gateway);
  for (const table of business) {
    await query(url, `set session_replication_role = replica; ${SEED[table]}; set session_replication_role = origin;`);
    const before = JSON.stringify(await query(url, `select * from public.${table}`));

    await assert.rejects(provision.runMarker(expect, summary, deps, { newInstallation: true }), new RegExp(`NOT_A_NEW_INSTALLATION|${table} \\(1\\)`), table);
    // A condição do próprio SQL também barra, mesmo sem a contagem prévia pela API.
    assert.deepEqual(await query(url, provision.markerInsertSql({ installationId: INSTALLATION, environment: ENVIRONMENT })), [], `${table}: SQL não grava`);

    assert.equal((await query(url, 'select count(*)::int as n from public.app_installation'))[0].n, 0, `${table}: sem marcador`);
    assert.equal(JSON.stringify(await query(url, `select * from public.${table}`)), before, `${table}: dados preservados`);
    // Limpeza do próprio ensaio (banco descartável), para isolar a próxima tabela.
    await query(url, `set session_replication_role = replica; delete from public.${table}; set session_replication_role = origin;`);
  }
  assert.equal(gateway.writes, 0, 'o comando não gravou nada em nenhum caso');
  // Com tudo vazio de novo, o marcador é aceito.
  assert.equal(await provision.runMarker(expect, summary, deps, { newInstallation: true }), 'created');
}));

scenario('migrations não registradas: recusa antes de qualquer escrita', async () => {
  const database = `rs_provisioning_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`create database ${database}`);
  await admin.end();
  const url = urlFor(database);
  try {
    await query(url, lib.SUPABASE_DATABASE_SETUP);
    for (const migration of lib.activeMigrations()) await query(url, require('node:fs').readFileSync(migration.path, 'utf8'));
    const gateway = new LocalPgGateway(url);
    assert.equal((await gateway.migrationState()).verdict, 'needs_recording');
    await assert.rejects(provision.runMarker(expect, summary, silent(gateway), { newInstallation: true }), /MIGRATIONS|needs_recording/);
    assert.equal(gateway.writes, 0);
    assert.deepEqual(await query(url, 'select count(*)::int as n from public.app_installation'), [{ n: 0 }]);
  } finally {
    const cleanup = new Client({ connectionString: serverUrl });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${database} with (force)`);
    await cleanup.end();
  }
});

(async () => {
  const admin = new Client({ connectionString: serverUrl });
  await admin.connect();
  const createdRoles = (await admin.query('select unnest($1::text[]) as role except select rolname from pg_roles', [API_ROLES])).rows.map((r) => r.role);
  await admin.query(lib.SUPABASE_ROLE_SETUP);
  await admin.end();
  let failed = 0;
  try {
    for (const { name, run } of scenarios) {
      try {
        await run();
        console.log(`ok - ${name}`);
      } catch (error) {
        failed += 1;
        console.log(`not ok - ${name}\n  ${String(error.stack || error).split('\n').join('\n  ')}`);
      }
    }
  } finally {
    const cleanup = new Client({ connectionString: serverUrl });
    await cleanup.connect();
    for (const role of createdRoles) await cleanup.query(`drop role if exists ${role}`).catch(() => {});
    await cleanup.end();
  }
  console.log(`\n${scenarios.length - failed}/${scenarios.length} scenarios passed`);
  process.exit(failed ? 1 : 0);
})();
