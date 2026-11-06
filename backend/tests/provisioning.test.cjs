// Provisionamento de instalação (Etapa 1B.3) com um projeto SIMULADO em memória:
// criação inicial, reexecução, destino divergente, identidade divergente,
// preservação de recursos existentes, senha (entrada oculta, sem argumento,
// sem log) e coerência com as regras da aplicação.
//
// Estes testes não provam login, storage ou fluxo reais num projeto Supabase;
// isso fica no roteiro (backend/PROVISIONING.md), em projeto descartável.
//
//   node --test -r ts-node/register/transpile-only tests/provisioning.test.cjs   (de backend/)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const bcrypt = require('bcrypt');

// Só para importar branding.service na conferência de limites (ele cria um
// cliente no import). O provisionamento não lê process.env.
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const provision = require('../src/provisioning/provision');
const { main, parseArgs } = require('../src/provisioning/cli');
const { loadTargetEnvironment, readLinkedProjectRef } = require('../src/provisioning/gateway');
const { promptHidden } = require('../src/provisioning/prompt');

const REF = 'abcdefghijklmnopqrst';
const OTHER_REF = 'zyxwvutsrqponmlkjihg';
const INSTALLATION = 'cantina-nova-hml';
const ENVIRONMENT = 'staging';
const PASSWORD = 'correct horse battery staple 42';

// ---------------------------------------------------------------------------
// Projeto simulado
// ---------------------------------------------------------------------------
class FakeProject {
  constructor({ migrations = 'up_to_date', marker = null, markerTable = true, users = [], config = [], buckets = [], counts = {}, markerWriteVisible = true, concurrentUser = null, dataAppearsBeforeMarker = null } = {}) {
    Object.assign(this, { migrations, marker, markerTable, users, config, buckets, counts, markerWriteVisible, concurrentUser, dataAppearsBeforeMarker });
    this.calls = [];
    this.writes = [];
  }
  async migrationState() { this.calls.push('migrationState'); return { verdict: this.migrations, exitCode: this.migrations === 'up_to_date' ? 0 : 10 }; }
  async readMarker() {
    this.calls.push('readMarker');
    if (!this.markerTable) return { kind: 'table-missing' };
    return this.marker ? { kind: 'found', marker: { ...this.marker } } : { kind: 'missing' };
  }
  // Como o SQL real: grava só sem marcador e com todas as tabelas informadas vazias.
  async insertMarkerIfAbsent(identity, emptyTables) {
    this.calls.push('insertMarkerIfAbsent');
    this.markerTables = emptyTables;
    if (this.dataAppearsBeforeMarker) Object.assign(this.counts, this.dataAppearsBeforeMarker);
    const empty = emptyTables.every((table) => this.rowsIn(table) === 0);
    if (!this.marker && this.markerWriteVisible && empty) {
      this.writes.push(['marker', identity]);
      this.marker = { installationId: identity.installationId, environment: identity.environment };
    }
  }
  rowsIn(table) {
    if (table === 'users') return this.users.length;
    if (table === 'restaurant_config') return this.config.length;
    return this.counts[table] ?? 0;
  }
  async countRows(table) { this.calls.push(`count:${table}`); return this.rowsIn(table); }
  async countUsers() { this.calls.push('countUsers'); return { total: this.users.length, admins: this.users.filter((u) => u.role === 'ADMIN').length }; }
  // Como public.create_first_admin: confere e grava de uma vez.
  async createFirstAdmin(row) {
    this.calls.push('createFirstAdmin');
    if (this.concurrentUser) this.users.push({ ...this.concurrentUser }); // outra execução venceu a corrida
    if (this.users.length) return 'users-exist';
    this.writes.push(['user', row]);
    this.users.push({ ...row });
    return 'created';
  }
  async readConfigRows() { this.calls.push('readConfigRows'); return this.config.map((row) => ({ id: row.id, name: row.name })); }
  async insertConfig(row) { this.calls.push('insertConfig'); this.writes.push(['config', row]); this.config.push({ ...row }); }
  async getBucket(id) { this.calls.push('getBucket'); const found = this.buckets.find((b) => b.id === id); return found ? { ...found } : null; }
  async createBucket(spec) {
    this.calls.push('createBucket');
    this.writes.push(['bucket', spec]);
    this.buckets.push({ id: spec.id, public: spec.public, fileSizeLimit: spec.fileSizeLimit, allowedMimeTypes: [...spec.allowedMimeTypes], files: [] });
  }
}

const target = (overrides = {}) => ({
  supabaseUrl: `https://${REF}.supabase.co`,
  installationId: INSTALLATION,
  appEnv: ENVIRONMENT,
  linkedProjectRef: REF,
  ...overrides,
});
const commonArgs = ['--target-env', 'instalacao.env', '--project-ref', REF, '--installation-id', INSTALLATION, '--environment', ENVIRONMENT];
const ARGS = {
  status: ['status', ...commonArgs],
  marker: ['marker', ...commonArgs, '--new-installation'],
  config: ['config', ...commonArgs, '--restaurant-name', 'Cantina Nova'],
  storage: ['storage', ...commonArgs],
  admin: ['admin', ...commonArgs, '--admin-name', 'Responsável', '--admin-email', 'responsavel@cantina.example'],
};
const WRITE_COMMANDS = ['marker', 'config', 'storage', 'admin'];

async function run(project, argv, { summary = target(), passwords = [PASSWORD, PASSWORD] } = {}) {
  const out = [];
  const err = [];
  const prompts = [];
  const queue = [...passwords];
  const code = await main(argv, {
    log: (line) => out.push(line),
    error: (line) => err.push(line),
    loadTarget: () => ({ summary, gateway: project }),
    promptPassword: async (question) => { prompts.push(question); return queue.shift() ?? ''; },
  });
  return { code, out: out.join('\n'), err: err.join('\n'), prompts };
}

const provisioned = () => new FakeProject({
  marker: { installationId: INSTALLATION, environment: ENVIRONMENT },
  config: [{ id: 'cfg', name: 'Cantina Nova' }],
  users: [{ id: 'u1', role: 'ADMIN', email: 'responsavel@cantina.example', password: 'hash' }],
  buckets: [{ id: 'branding', public: true, fileSizeLimit: 4194304, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'], files: [] }],
});

// ---------------------------------------------------------------------------
// Criação inicial
// ---------------------------------------------------------------------------
test('instalação nova: status, marcador, configuração, storage e administrador, nesta ordem', async () => {
  const project = new FakeProject();

  const status = await run(project, ARGS.status);
  assert.equal(status.code, 0, status.err);
  assert.match(status.out, /Marcador: ausente \(instalação nova\?\)/);
  assert.match(status.out, /Bucket branding: ausente/);
  assert.deepEqual(project.writes, [], 'status é somente leitura');

  const marker = await run(project, ARGS.marker);
  assert.equal(marker.code, 0, marker.err);
  assert.deepEqual(project.marker, { installationId: INSTALLATION, environment: ENVIRONMENT });
  assert.match(marker.out, /Marcador gravado: cantina-nova-hml \(staging\)/);

  const config = await run(project, ARGS.config);
  assert.equal(config.code, 0, config.err);
  assert.equal(project.config.length, 1);
  const row = project.config[0];
  assert.deepEqual(Object.keys(row).sort(), ['id', 'name', 'nfce_enabled', 'rural_delivery_fee', 'urban_delivery_fee']);
  assert.equal(row.name, 'Cantina Nova');
  assert.equal(row.urban_delivery_fee, null);
  assert.equal(row.rural_delivery_fee, null);
  assert.equal(row.nfce_enabled, false);

  const storage = await run(project, ARGS.storage);
  assert.equal(storage.code, 0, storage.err);
  assert.deepEqual(project.buckets.map(({ files, ...b }) => b), [{ id: 'branding', public: true, fileSizeLimit: 4194304, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] }]);

  const admin = await run(project, ARGS.admin);
  assert.equal(admin.code, 0, admin.err);
  assert.equal(admin.prompts.length, 2, 'senha e confirmação');
  assert.equal(project.users.length, 1);
  const user = project.users[0];
  assert.equal(user.role, 'ADMIN');
  assert.equal(user.email, 'responsavel@cantina.example');
  assert.match(user.id, /^[a-z0-9]{20,}$/, 'id cuid2, como POST /api/users');
  assert.notEqual(user.password, PASSWORD);
  assert.match(user.password, /^\$2[aby]\$10\$/, 'bcrypt com custo 10, como a aplicação');
  assert.equal(await bcrypt.compare(PASSWORD, user.password), true, 'o login (bcrypt.compare) aceita a senha');

  const everything = [status, marker, config, storage, admin].map((r) => `${r.out}\n${r.err}\n${r.prompts.join('\n')}`).join('\n');
  assert.ok(!everything.includes(PASSWORD), 'a senha não aparece em nenhuma saída');
  assert.ok(!everything.includes(user.password), 'o hash não aparece em nenhuma saída');
});

// ---------------------------------------------------------------------------
// Reexecução
// ---------------------------------------------------------------------------
test('reexecução: nada é duplicado nem sobrescrito', async () => {
  const project = new FakeProject();
  for (const command of WRITE_COMMANDS) assert.equal((await run(project, ARGS[command])).code, 0);
  const snapshot = JSON.stringify({ marker: project.marker, config: project.config, buckets: project.buckets, users: project.users });
  const writes = project.writes.length;

  assert.match((await run(project, ARGS.marker)).out, /Marcador já gravado.*Nada a fazer/);
  assert.match((await run(project, ARGS.config)).out, /restaurant_config já existe \("Cantina Nova"\): preservada/);
  assert.match((await run(project, ARGS.storage)).out, /Bucket branding já existe com a configuração esperada/);
  const admin = await run(project, ARGS.admin);
  assert.equal(admin.code, 1);
  assert.match(admin.err, /USERS_ALREADY_EXIST/);
  assert.equal(admin.prompts.length, 0, 'a senha nem é pedida');

  assert.equal(project.writes.length, writes, 'nenhuma escrita nova');
  assert.equal(JSON.stringify({ marker: project.marker, config: project.config, buckets: project.buckets, users: project.users }), snapshot);
});

// ---------------------------------------------------------------------------
// Destino divergente
// ---------------------------------------------------------------------------
const WRONG_DESTINATIONS = {
  'SUPABASE_URL de outro projeto': { supabaseUrl: `https://${OTHER_REF}.supabase.co` },
  'SUPABASE_URL fora de *.supabase.co': { supabaseUrl: 'https://db.example.com' },
  'SUPABASE_URL sem https': { supabaseUrl: `http://${REF}.supabase.co` },
  'CLI vinculada a outro projeto': { linkedProjectRef: OTHER_REF },
  'CLI sem vínculo': { linkedProjectRef: null },
  'INSTALLATION_ID de outra instalação': { installationId: 'mesa-farta-dev' },
  'INSTALLATION_ID ausente': { installationId: undefined },
  'APP_ENV diferente': { appEnv: 'development' },
};

for (const [label, overrides] of Object.entries(WRONG_DESTINATIONS)) {
  test(`destino divergente (${label}): todos os comandos recusam antes de qualquer acesso`, async () => {
    for (const command of [...WRITE_COMMANDS, 'status']) {
      const project = new FakeProject();
      const result = await run(project, ARGS[command], { summary: target(overrides) });
      assert.equal(result.code, 1, `${command}: ${result.err}`);
      assert.match(result.err, /DESTINATION_MISMATCH/);
      assert.deepEqual(project.calls, [], `${command}: nem o banco nem as migrations foram consultados`);
      assert.equal(result.prompts.length, 0);
    }
  });
}

test('--env-file é recusado (é opção do próprio Node e carregaria o arquivo em process.env)', () => {
  assert.throws(() => parseArgs(['status', '--env-file', 'x.env']), /Use --target-env/);
});

test('argumentos esperados inválidos são erro de uso', async () => {
  const project = new FakeProject();
  const badRef = await run(project, ['status', '--target-env', 'x.env', '--project-ref', 'NOT-A-REF', '--installation-id', INSTALLATION, '--environment', ENVIRONMENT]);
  assert.equal(badRef.code, 2);
  const badEnv = await run(project, ['status', '--target-env', 'x.env', '--project-ref', REF, '--installation-id', INSTALLATION, '--environment', 'prod']);
  assert.equal(badEnv.code, 2);
  assert.deepEqual(project.calls, []);
});

test('migrations fora de dia: recusa antes de ler o marcador e sem escrita', async () => {
  for (const verdict of ['pending', 'needs_recording', 'divergent', 'ambiguous', 'error']) {
    for (const command of WRITE_COMMANDS) {
      const project = new FakeProject({ migrations: verdict });
      const result = await run(project, ARGS[command]);
      assert.equal(result.code, 1);
      assert.match(result.err, /MIGRATIONS_NOT_READY/);
      assert.deepEqual(project.calls, ['migrationState']);
      assert.equal(result.prompts.length, 0);
    }
  }
});

// ---------------------------------------------------------------------------
// Identidade: instalação nova x existente
// ---------------------------------------------------------------------------
test('marcador de outra instalação: nenhum comando grava e o marcador não muda', async () => {
  for (const other of [{ installationId: 'mesa-farta-dev', environment: 'development' }, { installationId: INSTALLATION, environment: 'production' }]) {
    for (const command of WRITE_COMMANDS) {
      const project = new FakeProject({ marker: other });
      const result = await run(project, ARGS[command]);
      assert.equal(result.code, 1, command);
      assert.match(result.err, /IDENTITY_NOT_CONFIRMED/);
      assert.deepEqual(project.writes, []);
      assert.deepEqual(project.marker, other);
      assert.equal(result.prompts.length, 0);
    }
  }
});

test('sem marcador: config, storage e admin exigem a identidade gravada antes', async () => {
  for (const command of ['config', 'storage', 'admin']) {
    const project = new FakeProject();
    const result = await run(project, ARGS[command]);
    assert.equal(result.code, 1);
    assert.match(result.err, /IDENTITY_NOT_CONFIRMED[\s\S]*ainda não tem identidade/);
    assert.deepEqual(project.writes, []);
  }
});

test('marker sem --new-installation não grava; instalação existente sem marcador não é tratada', async () => {
  const project = new FakeProject();
  const result = await run(project, ARGS.marker.filter((arg) => arg !== '--new-installation'));
  assert.equal(result.code, 1);
  assert.match(result.err, /NOT_A_NEW_INSTALLATION[\s\S]*--new-installation/);
  assert.deepEqual(project.writes, []);
});

test('--new-installation recusado quando o banco já tem dados de aplicação', async () => {
  const cases = [
    { users: [{ id: 'x', role: 'CASHIER' }] },
    { config: [{ id: 'c', name: 'Outro Restaurante' }] },
    { counts: { orders: 3 } },
    { counts: { products: 1 } },
  ];
  for (const state of cases) {
    const project = new FakeProject(state);
    const result = await run(project, ARGS.marker);
    assert.equal(result.code, 1);
    assert.match(result.err, /NOT_A_NEW_INSTALLATION[\s\S]*já tem dados de aplicação/);
    assert.deepEqual(project.writes, []);
    assert.equal(project.marker, null);
  }
});

// Tabelas que a primeira versão (sete tabelas fixas) deixava de fora.
const PREVIOUSLY_IGNORED = [
  'audit_logs', 'cash_withdrawals', 'credit_settlements', 'credit_transactions', 'invoices', 'marmita_menu_items',
  'order_items', 'order_stock_legacy_reviews', 'order_stock_movements', 'payable_accounts', 'payments',
  'product_stock_items', 'stock_items', 'supplier_stock_items', 'suppliers', 'table_tabs', 'tables',
];

test('tabelas de negócio vêm do schema versionado: todas, menos as de controle documentadas', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'checks', 'migration_catalog.json'), 'utf8'));
  const all = provision.schemaTablesFromManifest(manifest);
  const business = provision.newInstallationEmptyTables();
  assert.deepEqual([...provision.CONTROL_TABLES].sort(), ['app_installation', 'order_stock_ledger_rollout']);
  assert.deepEqual([...business, ...provision.CONTROL_TABLES].sort(), all, 'nenhuma tabela do schema fica de fora');
  for (const table of [...PREVIOUSLY_IGNORED, 'users', 'restaurant_config', 'categories', 'products', 'orders', 'customers', 'cash_register_sessions']) {
    assert.ok(business.includes(table), `${table} é conferida`);
  }
  // Tabela nova numa migration futura entra sozinha; tabela de controle sumida é erro.
  const future = { migrations: [...manifest.migrations, { added: { 'tables:loyalty_points': 'x' }, removed: [] }] };
  assert.ok(provision.businessTablesFromManifest(future).includes('loyalty_points'));
  const withoutControl = { migrations: [...manifest.migrations, { added: {}, removed: ['tables:order_stock_ledger_rollout'] }] };
  assert.throws(() => provision.businessTablesFromManifest(withoutControl), /Revise CONTROL_TABLES/);
  // O roteiro documenta as exceções.
  const runbook = fs.readFileSync(path.join(__dirname, '..', 'PROVISIONING.md'), 'utf8');
  for (const table of provision.CONTROL_TABLES) assert.match(runbook, new RegExp(table));
});

test('--new-installation recusado com dados em QUALQUER tabela antes ignorada; nada é gravado nem apagado', async () => {
  for (const table of PREVIOUSLY_IGNORED) {
    const project = new FakeProject({ counts: { [table]: 2 } });
    const result = await run(project, ARGS.marker);
    assert.equal(result.code, 1, table);
    assert.match(result.err, new RegExp(`NOT_A_NEW_INSTALLATION[\\s\\S]*${table} \\(2\\)`));
    assert.match(result.err, /nada foi gravado nem apagado/);
    assert.equal(project.marker, null);
    assert.deepEqual(project.writes, []);
    assert.equal(project.counts[table], 2, 'dados preservados');
    assert.ok(!project.calls.includes('insertMarkerIfAbsent'));
  }
});

test('marker: dados que surgem entre a contagem e a gravação também impedem o marcador (condição no SQL)', async () => {
  const project = new FakeProject({ dataAppearsBeforeMarker: { stock_items: 1 } });
  const result = await run(project, ARGS.marker);
  assert.equal(result.code, 1);
  assert.match(result.err, /NOT_A_NEW_INSTALLATION[\s\S]*no momento da gravação/);
  assert.equal(project.marker, null);
  assert.deepEqual(project.markerTables, provision.newInstallationEmptyTables(), 'o SQL recebe todas as tabelas de negócio');
});

test('admin: outra execução que cria um usuário depois da contagem faz esta ser recusada, sem segunda conta', async () => {
  const other = { id: 'outro', role: 'ADMIN', email: 'outro@cantina.example', password: 'hash-de-outra-execucao' };
  const project = new FakeProject({ marker: { installationId: INSTALLATION, environment: ENVIRONMENT }, concurrentUser: other });
  const result = await run(project, ARGS.admin);
  assert.equal(result.code, 1);
  assert.match(result.err, /USERS_ALREADY_EXIST[\s\S]*outra execução simultânea/);
  assert.deepEqual(project.users, [other], 'só a conta da outra execução existe');
  assert.deepEqual(project.writes, []);
  assert.ok(!`${result.out}${result.err}`.includes(PASSWORD));
});

test('marker: tabela ausente é recusada (migrations não aplicadas de fato)', async () => {
  const project = new FakeProject({ markerTable: false });
  const result = await run(project, ARGS.marker);
  assert.equal(result.code, 1);
  assert.match(result.err, /IDENTITY_NOT_CONFIRMED[\s\S]*app_installation não existe/);
  assert.deepEqual(project.writes, []);
});

test('marker: se a API não enxerga o marcador gravado pela CLI, para com erro (canais divergentes)', async () => {
  const project = new FakeProject({ markerWriteVisible: false });
  const result = await run(project, ARGS.marker);
  assert.equal(result.code, 1);
  assert.match(result.err, /VERIFICATION_FAILED[\s\S]*mesmo projeto/);
});

// ---------------------------------------------------------------------------
// Preservação de recursos existentes
// ---------------------------------------------------------------------------
test('restaurant_config existente é preservada, mesmo com outro nome', async () => {
  const project = new FakeProject({ marker: { installationId: INSTALLATION, environment: ENVIRONMENT }, config: [{ id: 'old', name: 'Nome Antigo', phone: '123' }] });
  const result = await run(project, ARGS.config);
  assert.equal(result.code, 0);
  assert.match(result.out, /já existe \("Nome Antigo"\): preservada[\s\S]*não foi aplicado/);
  assert.deepEqual(project.config, [{ id: 'old', name: 'Nome Antigo', phone: '123' }]);
  assert.deepEqual(project.writes, []);
});

test('bucket branding existente e divergente: relatado, preservado, saída 3', async () => {
  const existing = { id: 'branding', public: false, fileSizeLimit: null, allowedMimeTypes: null, files: ['logo/1-antigo.png'] };
  const project = new FakeProject({ marker: { installationId: INSTALLATION, environment: ENVIRONMENT }, buckets: [{ ...existing }] });
  const result = await run(project, ARGS.storage);
  assert.equal(result.code, 3);
  assert.match(result.out, /PRESERVADO/);
  assert.match(result.out, /não é público/);
  assert.match(result.out, /sem limite de tamanho/);
  assert.match(result.out, /aceita qualquer tipo/);
  assert.deepEqual(project.buckets, [existing], 'configuração e arquivos intocados');
  assert.ok(!project.calls.includes('createBucket'));
});

test('comparação do bucket: limite menor, maior e tipos diferentes', () => {
  const base = { id: 'branding', public: true, fileSizeLimit: 4194304, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'] };
  assert.deepEqual(provision.compareBrandingBucket(base), []);
  assert.match(provision.compareBrandingBucket({ ...base, fileSizeLimit: 1048576 }).join(), /seriam recusados/);
  assert.match(provision.compareBrandingBucket({ ...base, fileSizeLimit: 52428800 }).join(), /esperado 4194304/);
  assert.match(provision.compareBrandingBucket({ ...base, allowedMimeTypes: ['image/png', 'image/svg+xml'] }).join(), /tipos aceitos/);
});

test('usuários existentes: nenhum administrador é criado e nenhuma conta é promovida', async () => {
  const users = [{ id: 'c1', role: 'CASHIER', email: 'caixa@x.example', password: 'h1' }, { id: 'w1', role: 'WAITER', email: 'garcom@x.example', password: 'h2' }];
  const project = new FakeProject({ marker: { installationId: INSTALLATION, environment: ENVIRONMENT }, users: users.map((u) => ({ ...u })) });
  const result = await run(project, ARGS.admin);
  assert.equal(result.code, 1);
  assert.match(result.err, /USERS_ALREADY_EXIST[\s\S]*0 administrador\(es\)[\s\S]*nem promovida|USERS_ALREADY_EXIST[\s\S]*promovida/);
  assert.deepEqual(project.users, users);
  assert.equal(result.prompts.length, 0);
});

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------
test('senha: nunca por argumento', () => {
  for (const flag of ['--password', '--admin-password', '--pass', '--senha']) {
    assert.throws(() => parseArgs([...ARGS.admin, flag, 'segredo-qualquer']), /não é aceita por argumento/);
  }
});

test('senha: confirmação diferente, curta ou com espaço nas pontas não grava nada', async () => {
  const cases = [
    [[PASSWORD, `${PASSWORD}x`], /não são iguais/],
    [['curta123', 'curta123'], /pelo menos 12/],
    [[` ${PASSWORD}`, ` ${PASSWORD}`], /espaço/],
  ];
  for (const [passwords, message] of cases) {
    const project = new FakeProject({ marker: { installationId: INSTALLATION, environment: ENVIRONMENT } });
    const result = await run(project, ARGS.admin, { passwords });
    assert.equal(result.code, 1);
    assert.match(result.err, message);
    assert.deepEqual(project.users, []);
    for (const value of passwords) assert.ok(!`${result.out}${result.err}`.includes(value.trim()), 'a senha não é repetida na mensagem');
  }
});

test('dados do administrador inválidos são recusados antes de qualquer acesso e antes da senha', async () => {
  const project = new FakeProject({ marker: { installationId: INSTALLATION, environment: ENVIRONMENT } });
  const result = await run(project, ['admin', ...commonArgs, '--admin-name', 'Ana', '--admin-email', 'sem-arroba']);
  assert.equal(result.code, 1);
  assert.match(result.err, /e-mail válido/);
  assert.deepEqual(project.calls, []);
  assert.equal(result.prompts.length, 0);
});

test('entrada oculta: recusa entrada redirecionada', async () => {
  const output = [];
  await assert.rejects(promptHidden('Senha: ', { isTTY: false, resume() {}, pause() {}, setEncoding() {}, on() {}, removeListener() {} }, { write: (t) => output.push(t) }), /terminal interativo/);
  assert.deepEqual(output, []);
});

class FakeTty extends EventEmitter {
  constructor() { super(); this.isTTY = true; this.raw = []; }
  setRawMode(mode) { this.raw.push(mode); }
  resume() {}
  pause() {}
  setEncoding() {}
}

test('entrada oculta: não ecoa, trata apagar e Enter, restaura o terminal', async () => {
  const input = new FakeTty();
  const output = [];
  const pending = promptHidden('Senha: ', input, { write: (t) => output.push(t) });
  input.emit('data', 'segredo');
  input.emit('data', 'X\u007f');
  input.emit('data', '-ok\r');
  assert.equal(await pending, 'segredo-ok');
  assert.deepEqual(output, ['Senha: ', '\n'], 'só a pergunta e a quebra de linha');
  assert.deepEqual(input.raw, [true, false]);
});

test('entrada oculta: Ctrl+C cancela', async () => {
  const input = new FakeTty();
  const pending = promptHidden('Senha: ', input, { write() {} });
  input.emit('data', 'abc\u0003');
  await assert.rejects(pending, /cancelada/);
  assert.deepEqual(input.raw, [true, false]);
});

// ---------------------------------------------------------------------------
// Arquivo de ambiente e segredos
// ---------------------------------------------------------------------------
test('arquivo de ambiente: lido sem alterar process.env; a chave não aparece em nenhuma saída', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-provision-test-'));
  try {
    const KEY = 'service-role-key-de-teste-que-nunca-pode-aparecer';
    const envFile = path.join(dir, 'instalacao.env');
    fs.writeFileSync(envFile, `SUPABASE_URL=https://${REF}.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=${KEY}\nINSTALLATION_ID=${INSTALLATION}\nAPP_ENV=${ENVIRONMENT}\nJWT_SECRET=outro-segredo\n`);
    fs.mkdirSync(path.join(dir, 'supabase', '.temp'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'supabase', '.temp', 'project-ref'), `${REF}\n`);
    const before = JSON.stringify(process.env);

    const loaded = loadTargetEnvironment(envFile, dir);
    assert.equal(JSON.stringify(process.env), before, 'process.env intocado');
    assert.deepEqual(loaded.summary, { supabaseUrl: `https://${REF}.supabase.co`, installationId: INSTALLATION, appEnv: ENVIRONMENT, linkedProjectRef: REF });
    assert.ok(!JSON.stringify(loaded.summary).includes(KEY));
    assert.equal(readLinkedProjectRef(path.join(dir, 'nao-existe')), null);

    const project = new FakeProject();
    const out = [];
    const code = await main(['marker', '--target-env', envFile, '--project-ref', REF, '--installation-id', INSTALLATION, '--environment', ENVIRONMENT, '--new-installation'], {
      log: (l) => out.push(l), error: (l) => out.push(l),
      loadTarget: (file) => ({ summary: loadTargetEnvironment(file, dir).summary, gateway: project }),
      promptPassword: async () => { throw new Error('não deveria pedir senha'); },
    });
    assert.equal(code, 0, out.join('\n'));
    assert.ok(!out.join('\n').includes(KEY));
    assert.ok(!out.join('\n').includes('outro-segredo'));

    fs.writeFileSync(envFile, `SUPABASE_URL=https://${REF}.supabase.co\n`);
    assert.throws(() => loadTargetEnvironment(envFile, dir), /SUPABASE_SERVICE_ROLE_KEY/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Coerência com a aplicação
// ---------------------------------------------------------------------------
test('regras repetidas do provisionamento são as mesmas da aplicação', () => {
  const env = require('../src/config/env');
  assert.equal(provision.INSTALLATION_ID_PATTERN.source, env.INSTALLATION_ID_PATTERN.source);
  assert.deepEqual([...provision.APP_ENVIRONMENTS], [...env.APP_ENVIRONMENTS]);
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'user.routes.ts'), 'utf8');
  assert.match(source, new RegExp(`bcrypt\\.hash\\(password, ${provision.BCRYPT_ROUNDS}\\)`), 'mesmo custo bcrypt de POST /api/users');
});

test('bucket: tipos e limite aceitos pela aplicação cabem exatamente no bucket', () => {
  const { validateBrandingImage } = require('../src/services/branding.service');
  const magic = {
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
    'image/webp': [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')],
  };
  for (const mimetype of provision.BRANDING_BUCKET.allowedMimeTypes) {
    const buffer = Buffer.from(magic[mimetype]);
    assert.equal(validateBrandingImage({ buffer, mimetype, originalname: 'x', size: provision.BRANDING_BUCKET.fileSizeLimit }, 'banner'), mimetype);
    assert.throws(() => validateBrandingImage({ buffer, mimetype, originalname: 'x', size: provision.BRANDING_BUCKET.fileSizeLimit + 1 }, 'banner'), /excede/);
  }
  assert.throws(() => validateBrandingImage({ buffer: Buffer.from('GIF89a'), mimetype: 'image/gif', originalname: 'x', size: 10 }, 'logo'), /Formato inválido/);
});

test('configuração inicial: nome obrigatório e sem dados de outro restaurante', () => {
  assert.throws(() => provision.buildInitialConfigRow(' '), /entre 2 e 120/);
  const row = provision.buildInitialConfigRow('  Cantina Nova  ', 'fixed-id');
  assert.deepEqual(row, { id: 'fixed-id', name: 'Cantina Nova', urban_delivery_fee: null, rural_delivery_fee: null, nfce_enabled: false });
  const text = JSON.stringify(row).toLowerCase();
  for (const forbidden of ['mesa', 'farta', 'cnpj', 'logo', 'banner', 'phone', 'address']) assert.ok(!text.includes(forbidden), forbidden);
});

test('SQL do marcador: só grava em tabela vazia e não aceita valores fora das regras', () => {
  const sql = provision.markerInsertSql({ installationId: INSTALLATION, environment: ENVIRONMENT });
  assert.match(sql, /where not exists \(select 1 from public\.app_installation\)/);
  for (const table of provision.newInstallationEmptyTables()) assert.match(sql, new RegExp(`and not exists \\(select 1 from public\\.${table}\\)`));
  assert.doesNotMatch(sql, /from public\.order_stock_ledger_rollout/);
  assert.throws(() => provision.markerInsertSql({ installationId: INSTALLATION, environment: ENVIRONMENT }, ['users; drop table users']), /tabelas de negócio inválida/);
  assert.throws(() => provision.markerInsertSql({ installationId: INSTALLATION, environment: ENVIRONMENT }, []), /tabelas de negócio inválida/);
  assert.throws(() => provision.markerInsertSql({ installationId: "x'; drop table users; --", environment: ENVIRONMENT }), /inválida/);
  assert.throws(() => provision.markerInsertSql({ installationId: INSTALLATION, environment: 'prod' }), /inválida/);
});
