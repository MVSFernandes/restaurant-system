import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { createId } from '@paralleldrive/cuid2';
import { confirmInstallation, InstallationCheckError } from '../config/installation';
import type { InstallationIdentity, MarkerReadResult } from '../config/installation';
import type { AppEnvironment } from '../config/env';
import { toUserInsert } from '../mappers/user.mapper';

/**
 * Provisionamento de uma instalação (Etapa 1B.3).
 *
 * Torna operável um projeto Supabase novo, criado pelo responsável, sem dados de
 * outro restaurante: marcador da instalação, linha inicial de restaurant_config,
 * bucket "branding" e primeiro administrador. Roteiro: backend/PROVISIONING.md.
 *
 * Regras comuns a todos os comandos, conferidas ANTES de qualquer escrita:
 * - o destino é o esperado: a ref do projeto digitada pelo operador é a mesma do
 *   SUPABASE_URL do arquivo de ambiente da instalação e a mesma do vínculo da
 *   Supabase CLI (os dois canais usados aqui);
 * - INSTALLATION_ID e APP_ENV do arquivo de ambiente são os esperados;
 * - as migrations estão aplicadas e registradas (db:migrations:check = up_to_date);
 * - o marcador do banco é o da instalação esperada (exceto no comando `marker`,
 *   que grava o marcador de uma instalação nova).
 *
 * Nada aqui sobrescreve recurso existente: o que já existe é relatado e preservado.
 * Este módulo não lê process.env nem importa src/lib/supabase.ts (que carregaria
 * o .env do diretório atual); todo acesso externo passa pelo ProvisioningGateway.
 */

// Mesmas regras de src/config/env.ts, repetidas para não importar aquele módulo
// (ele carrega o .env do diretório atual). O teste confere que são iguais.
export const INSTALLATION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
export const APP_ENVIRONMENTS: readonly AppEnvironment[] = ['development', 'test', 'staging', 'production'];

/** Ref de um projeto Supabase (subdomínio de *.supabase.co). */
export const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

/** Mesmo custo de src/routes/user.routes.ts; o login usa bcrypt.compare (auth.service.ts). */
export const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Bucket usado por src/services/branding.service.ts: público (a aplicação grava
 * a URL pública da imagem), PNG/JPEG/WebP, até 4 MB (limite do banner; o logo
 * tem 2 MB, conferido pela aplicação). Sem políticas em storage.objects: só o
 * backend (service_role) envia e remove arquivos.
 */
export const BRANDING_BUCKET = {
  id: 'branding',
  public: true,
  fileSizeLimit: 4 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/**
 * Tabelas de controle técnico, as ÚNICAS fora da exigência de "banco vazio"
 * para uma instalação nova:
 * - app_installation: é o próprio marcador; o comando marker confere à parte
 *   que ele está ausente (ou igual ao esperado);
 * - order_stock_ledger_rollout: a migration 20261104221000 grava nela a linha
 *   de controle da transição do livro de estoque; o conteúdo exato dessa linha
 *   já é conferido pelo catálogo (categoria `data`) no db:migrations:check.
 * Nenhuma delas guarda dados de um restaurante.
 */
export const CONTROL_TABLES: readonly string[] = ['app_installation', 'order_stock_ledger_rollout'];

const MANIFEST_FILE = path.resolve(__dirname, '..', '..', 'supabase', 'checks', 'migration_catalog.json');
const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

/**
 * Tabelas de public no schema versionado: as do estado esperado depois da
 * última migration ativa (supabase/checks/migration_catalog.json, o mesmo
 * manifesto do db:migrations:check). Uma tabela criada por migration futura
 * entra sozinha, sem lista manual para esquecer.
 */
export function schemaTablesFromManifest(manifest: { migrations: Array<{ added: Record<string, string>; removed: string[] }> }): string[] {
  const tables = new Set<string>();
  for (const migration of manifest.migrations) {
    for (const key of Object.keys(migration.added)) if (key.startsWith('tables:')) tables.add(key.slice('tables:'.length));
    for (const key of migration.removed) if (key.startsWith('tables:')) tables.delete(key.slice('tables:'.length));
  }
  for (const table of tables) {
    if (!TABLE_NAME_PATTERN.test(table)) throw new ProvisioningError('INVALID_INPUT', `Nome de tabela inesperado no manifesto: ${table}.`);
  }
  return [...tables].sort();
}

/** Tabelas de negócio: todas as do schema versionado, menos as de controle técnico. */
export function businessTablesFromManifest(manifest: Parameters<typeof schemaTablesFromManifest>[0]): string[] {
  const all = schemaTablesFromManifest(manifest);
  const missingControl = CONTROL_TABLES.filter((table) => !all.includes(table));
  if (missingControl.length) {
    throw new ProvisioningError('INVALID_INPUT', `Tabelas de controle ausentes do manifesto: ${missingControl.join(', ')}. Revise CONTROL_TABLES.`);
  }
  return all.filter((table) => !CONTROL_TABLES.includes(table));
}

let cachedEmptyTables: readonly string[] | null = null;

/** Tabelas que precisam estar vazias para tratar o banco como instalação nova (do manifesto versionado). */
export function newInstallationEmptyTables(): readonly string[] {
  if (!cachedEmptyTables) cachedEmptyTables = businessTablesFromManifest(JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')));
  return cachedEmptyTables;
}
export type CountedTable = string;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ProvisioningExpectation {
  projectRef: string;
  installationId: string;
  environment: string;
}

/** O que o arquivo de ambiente da instalação diz (sem a chave de serviço). */
export interface TargetSummary {
  supabaseUrl: string;
  installationId: string | undefined;
  appEnv: string | undefined;
  /** Ref do vínculo da Supabase CLI (backend/supabase/.temp/project-ref), se houver. */
  linkedProjectRef: string | null;
}

export interface MigrationState {
  verdict: string;
  exitCode: number | null;
}

export interface BucketInfo {
  id: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
}

export interface ConfigRowSummary {
  id: string;
  name: string;
}

export interface UserCounts {
  total: number;
  admins: number;
}

export interface UserInsertRow {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
}

/** Todo acesso ao projeto passa por aqui; os testes usam uma versão em memória. */
export interface ProvisioningGateway {
  migrationState(): Promise<MigrationState>;
  readMarker(): Promise<MarkerReadResult>;
  /** Grava o marcador só se a tabela estiver vazia (SQL pela CLI vinculada). */
  insertMarkerIfAbsent(identity: InstallationIdentity, emptyTables: readonly string[]): Promise<void>;
  countRows(table: CountedTable): Promise<number>;
  countUsers(): Promise<UserCounts>;
  /**
   * Cria o primeiro administrador de forma ATÔMICA no banco
   * (public.create_first_admin, migration 20261106120000): confere e grava na
   * mesma transação, sob lock. 'users-exist' quando já havia usuário, inclusive
   * criado por outra execução simultânea; nesse caso nada é gravado.
   */
  createFirstAdmin(row: UserInsertRow): Promise<'created' | 'users-exist'>;
  readConfigRows(): Promise<ConfigRowSummary[]>;
  insertConfig(row: Record<string, unknown>): Promise<void>;
  /** null quando o bucket não existe. */
  getBucket(id: string): Promise<BucketInfo | null>;
  createBucket(spec: typeof BRANDING_BUCKET): Promise<void>;
}

export type ProvisioningErrorCode =
  | 'USAGE'
  | 'DESTINATION_MISMATCH'
  | 'MIGRATIONS_NOT_READY'
  | 'IDENTITY_NOT_CONFIRMED'
  | 'NOT_A_NEW_INSTALLATION'
  | 'USERS_ALREADY_EXIST'
  | 'INVALID_INPUT'
  | 'VERIFICATION_FAILED';

export class ProvisioningError extends Error {
  readonly code: ProvisioningErrorCode;
  constructor(code: ProvisioningErrorCode, message: string) {
    super(message);
    this.name = 'ProvisioningError';
    this.code = code;
  }
}

/** Resultado de cada comando. `diverged` = recurso existente diferente do esperado, preservado. */
export type StepOutcome = 'created' | 'already' | 'preserved' | 'diverged' | 'report';

export interface ProvisioningDeps {
  gateway: ProvisioningGateway;
  log: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Destino e identidade
// ---------------------------------------------------------------------------

/** Ref do projeto a partir de https://<ref>.supabase.co; null para qualquer outro formato. */
export function projectRefFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = parsed.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  return parsed.protocol === 'https:' && match ? match[1] : null;
}

export function validateExpectation(expect: ProvisioningExpectation): void {
  const problems: string[] = [];
  if (!PROJECT_REF_PATTERN.test(expect.projectRef)) problems.push('--project-ref deve ser a ref do projeto (20 letras minúsculas e números).');
  if (!INSTALLATION_ID_PATTERN.test(expect.installationId)) problems.push('--installation-id deve ter de 3 a 64 caracteres: letras minúsculas, números e hífens.');
  if (!APP_ENVIRONMENTS.includes(expect.environment as AppEnvironment)) problems.push(`--environment deve ser um de: ${APP_ENVIRONMENTS.join(', ')}.`);
  if (problems.length) throw new ProvisioningError('USAGE', problems.join('\n'));
}

/** Problemas de destino. Nenhuma mensagem inclui URL completa, chave ou senha. */
export function findDestinationProblems(expect: ProvisioningExpectation, target: TargetSummary): string[] {
  const problems: string[] = [];
  const urlRef = projectRefFromUrl(target.supabaseUrl);
  if (!urlRef) problems.push('SUPABASE_URL do arquivo de ambiente não é https://<ref>.supabase.co.');
  else if (urlRef !== expect.projectRef) problems.push(`SUPABASE_URL aponta para o projeto ${urlRef}, não para ${expect.projectRef}.`);
  if (!target.linkedProjectRef) problems.push('A Supabase CLI não está vinculada em backend/ (npx supabase link --project-ref <ref>).');
  else if (target.linkedProjectRef !== expect.projectRef) problems.push(`A Supabase CLI está vinculada ao projeto ${target.linkedProjectRef}, não a ${expect.projectRef}.`);
  if (target.installationId !== expect.installationId) problems.push('INSTALLATION_ID do arquivo de ambiente é diferente de --installation-id.');
  if (target.appEnv !== expect.environment) problems.push(`APP_ENV do arquivo de ambiente (${target.appEnv ?? 'ausente'}) é diferente de --environment (${expect.environment}).`);
  return problems;
}

async function checkDestinationAndMigrations(expect: ProvisioningExpectation, target: TargetSummary, deps: ProvisioningDeps) {
  validateExpectation(expect);
  const problems = findDestinationProblems(expect, target);
  if (problems.length) {
    throw new ProvisioningError('DESTINATION_MISMATCH', `Destino não confirmado; nada foi gravado:\n- ${problems.join('\n- ')}`);
  }
  deps.log(`Destino: projeto ${expect.projectRef}, instalação ${expect.installationId} (${expect.environment}).`);
  const migrations = await deps.gateway.migrationState();
  if (migrations.verdict !== 'up_to_date') {
    throw new ProvisioningError(
      'MIGRATIONS_NOT_READY',
      `As migrations não estão em dia (db:migrations:check: ${migrations.verdict}, exit ${migrations.exitCode ?? '?'}). ` +
        'Siga backend/supabase/migrations/README.md até UP_TO_DATE; nada foi gravado.'
    );
  }
  deps.log('Migrations: UP_TO_DATE.');
}

const identityOf = (expect: ProvisioningExpectation): InstallationIdentity => ({
  installationId: expect.installationId,
  environment: expect.environment as AppEnvironment,
});

/** Destino, migrations e marcador iguais aos esperados. Usado antes de qualquer escrita. */
export async function confirmTarget(expect: ProvisioningExpectation, target: TargetSummary, deps: ProvisioningDeps): Promise<void> {
  await checkDestinationAndMigrations(expect, target, deps);
  try {
    const marker = confirmInstallation(identityOf(expect), await deps.gateway.readMarker());
    deps.log(`Marcador: ${marker.installationId} (${marker.environment}) confere.`);
  } catch (error) {
    if (error instanceof InstallationCheckError) {
      throw new ProvisioningError('IDENTITY_NOT_CONFIRMED', `${error.message}\nNada foi gravado.`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Construtores (também usados pelo teste em PostgreSQL local)
// ---------------------------------------------------------------------------

/**
 * SQL do marcador: grava só se não houver marcador E se todas as tabelas de
 * negócio estiverem vazias, no mesmo comando (a contagem prévia pela API serve
 * para a mensagem; esta condição é a que vale no momento da gravação). Os
 * valores já passaram pela validação (padrão do id, lista de ambientes, nomes
 * de tabela do manifesto), então não há como injetar SQL; a constraint da
 * tabela confere de novo.
 */
export function markerInsertSql(identity: InstallationIdentity, emptyTables: readonly string[] = newInstallationEmptyTables()): string {
  if (!INSTALLATION_ID_PATTERN.test(identity.installationId) || !APP_ENVIRONMENTS.includes(identity.environment)) {
    throw new ProvisioningError('INVALID_INPUT', 'Identidade inválida para o marcador.');
  }
  if (!emptyTables.length || emptyTables.some((table) => !TABLE_NAME_PATTERN.test(table))) {
    throw new ProvisioningError('INVALID_INPUT', 'Lista de tabelas de negócio inválida para o marcador.');
  }
  return [
    'insert into public.app_installation (installation_id, environment)',
    `select '${identity.installationId}', '${identity.environment}'`,
    'where not exists (select 1 from public.app_installation)',
    ...emptyTables.map((table) => `  and not exists (select 1 from public.${table})`),
    'returning installation_id, environment',
  ].join('\n');
}

/**
 * Linha inicial de restaurant_config: só o nome informado pelo operador.
 * Sem marca (logo, banner), contato, endereço, horários, dados fiscais ou
 * comerciais. As taxas de entrega ficam vazias de propósito (a coluna tem
 * padrão 1,00/3,00, que seria um valor comercial não escolhido pelo cliente);
 * NFC-e desligada. O administrador completa o resto pela tela de configurações.
 */
export function buildInitialConfigRow(restaurantName: string, id: string = createId()): Record<string, unknown> {
  const name = restaurantName.trim();
  if (name.length < 2 || name.length > 120) {
    throw new ProvisioningError('INVALID_INPUT', 'O nome do restaurante deve ter entre 2 e 120 caracteres.');
  }
  return {
    id,
    name,
    urban_delivery_fee: null,
    rural_delivery_fee: null,
    nfce_enabled: false,
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAdminInput(name: string, email: string): { name: string; email: string } {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const problems: string[] = [];
  if (trimmedName.length < 2 || trimmedName.length > 120) problems.push('O nome do administrador deve ter entre 2 e 120 caracteres.');
  if (!EMAIL_PATTERN.test(trimmedEmail) || trimmedEmail.length > 254) problems.push('Informe um e-mail válido para o administrador.');
  if (problems.length) throw new ProvisioningError('INVALID_INPUT', problems.join('\n'));
  return { name: trimmedName, email: trimmedEmail };
}

/** A mensagem nunca repete a senha. */
export function validateNewPassword(password: string, confirmation: string): void {
  if (password !== confirmation) throw new ProvisioningError('INVALID_INPUT', 'As senhas digitadas não são iguais. Nada foi gravado.');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ProvisioningError('INVALID_INPUT', `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres. Nada foi gravado.`);
  }
  if (password.trim() !== password) throw new ProvisioningError('INVALID_INPUT', 'A senha não pode começar nem terminar com espaço. Nada foi gravado.');
}

/** Mesma forma de POST /api/users: id cuid2, hash bcrypt, papel ADMIN. */
export async function buildAdminRow(name: string, email: string, password: string, id: string = createId()): Promise<UserInsertRow> {
  const now = new Date();
  const row = toUserInsert({
    id,
    name,
    email,
    password: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: 'ADMIN',
    createdAt: now,
    updatedAt: now,
  });
  return { id: row.id, name: row.name, email: row.email, password: row.password, role: row.role };
}

/** Diferenças entre um bucket existente e o que a aplicação espera. */
export function compareBrandingBucket(bucket: BucketInfo): string[] {
  const problems: string[] = [];
  if (!bucket.public) problems.push('não é público: a aplicação grava a URL pública do logo e do banner, que não abririam.');
  if (bucket.fileSizeLimit == null) problems.push('sem limite de tamanho (a aplicação limita a 4 MB; esperado 4194304 bytes).');
  else if (bucket.fileSizeLimit !== BRANDING_BUCKET.fileSizeLimit) {
    problems.push(`limite de tamanho ${bucket.fileSizeLimit} bytes, esperado ${BRANDING_BUCKET.fileSizeLimit}` +
      `${bucket.fileSizeLimit < BRANDING_BUCKET.fileSizeLimit ? ' (banners aceitos pela aplicação seriam recusados).' : '.'}`);
  }
  const expected = [...BRANDING_BUCKET.allowedMimeTypes].sort();
  const actual = bucket.allowedMimeTypes && bucket.allowedMimeTypes.length ? [...bucket.allowedMimeTypes].sort() : null;
  if (!actual) problems.push(`aceita qualquer tipo de arquivo (esperado ${expected.join(', ')}).`);
  else if (actual.join(',') !== expected.join(',')) problems.push(`tipos aceitos ${actual.join(', ')}, esperado ${expected.join(', ')}.`);
  return problems;
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

/** Somente leitura: estado da instalação, sem exigir o marcador. */
export async function runStatus(expect: ProvisioningExpectation, target: TargetSummary, deps: ProvisioningDeps): Promise<StepOutcome> {
  await checkDestinationAndMigrations(expect, target, deps);
  const { gateway, log } = deps;
  const marker = await gateway.readMarker();
  if (marker.kind === 'found') {
    const same = marker.marker.installationId === expect.installationId && marker.marker.environment === expect.environment;
    log(`Marcador: ${marker.marker.installationId} (${marker.marker.environment})${same ? ' confere.' : ' DIFERENTE do esperado.'}`);
  } else {
    log(`Marcador: ${marker.kind === 'missing' ? 'ausente (instalação nova?)' : marker.kind}.`);
  }
  const tables = newInstallationEmptyTables();
  const occupied: string[] = [];
  for (const table of tables) {
    const count = await gateway.countRows(table);
    if (count > 0) occupied.push(`${table} (${count})`);
  }
  log(`Tabelas de negócio (${tables.length}): ${occupied.length ? `com dados em ${occupied.join(', ')}` : 'todas vazias'}.`);
  const users = await gateway.countUsers();
  log(`Usuários: ${users.total} (${users.admins} administrador(es)).`);
  const config = await gateway.readConfigRows();
  log(`restaurant_config: ${config.length === 0 ? 'ausente' : config.map((row) => `"${row.name}"`).join(', ')}.`);
  const bucket = await gateway.getBucket(BRANDING_BUCKET.id);
  if (!bucket) log('Bucket branding: ausente.');
  else {
    const problems = compareBrandingBucket(bucket);
    log(`Bucket branding: existe${problems.length ? `, com divergências:\n  - ${problems.join('\n  - ')}` : ', configuração conforme.'}`);
  }
  return 'report';
}

/**
 * Grava o marcador de uma instalação NOVA. Exige --new-installation e um banco
 * sem dados de aplicação. Marcador igual: nada a fazer. Diferente: recusa.
 * Depois de gravar pela CLI vinculada, relê pela API do arquivo de ambiente:
 * os dois canais precisam ver o mesmo marcador.
 */
export async function runMarker(
  expect: ProvisioningExpectation,
  target: TargetSummary,
  deps: ProvisioningDeps,
  options: { newInstallation: boolean }
): Promise<StepOutcome> {
  await checkDestinationAndMigrations(expect, target, deps);
  const { gateway, log } = deps;
  const identity = identityOf(expect);
  const current = await gateway.readMarker();

  if (current.kind === 'found') {
    try {
      confirmInstallation(identity, current);
    } catch (error) {
      if (error instanceof InstallationCheckError) throw new ProvisioningError('IDENTITY_NOT_CONFIRMED', `${error.message}\nO marcador não foi alterado.`);
      throw error;
    }
    log(`Marcador já gravado: ${current.marker.installationId} (${current.marker.environment}). Nada a fazer.`);
    return 'already';
  }
  if (current.kind !== 'missing') {
    // Tabela ausente, leitura recusada ou banco inacessível: confirmInstallation explica.
    try {
      confirmInstallation(identity, current);
    } catch (error) {
      if (error instanceof InstallationCheckError) throw new ProvisioningError('IDENTITY_NOT_CONFIRMED', `${error.message}\nNada foi gravado.`);
      throw error;
    }
  }

  if (!options.newInstallation) {
    throw new ProvisioningError(
      'NOT_A_NEW_INSTALLATION',
      'Este banco não tem marcador. Se for uma instalação NOVA, repita com --new-installation. ' +
        'Uma instalação existente sem marcador não é tratada por este comando; nada foi gravado.'
    );
  }
  const tables = newInstallationEmptyTables();
  const occupied: string[] = [];
  for (const table of tables) {
    const count = await gateway.countRows(table);
    if (count > 0) occupied.push(`${table} (${count})`);
  }
  if (occupied.length) {
    throw new ProvisioningError(
      'NOT_A_NEW_INSTALLATION',
      `--new-installation recusado: o banco já tem dados de aplicação em ${occupied.join(', ')}. ` +
        'Uma instalação nova nasce vazia; nada foi gravado nem apagado.'
    );
  }

  // O SQL repete a exigência de banco vazio no mesmo comando da gravação.
  await gateway.insertMarkerIfAbsent(identity, tables);
  const after = await gateway.readMarker();
  if (after.kind === 'missing') {
    const appeared: string[] = [];
    for (const table of tables) if ((await gateway.countRows(table)) > 0) appeared.push(table);
    if (appeared.length) {
      throw new ProvisioningError(
        'NOT_A_NEW_INSTALLATION',
        `O marcador não foi gravado: no momento da gravação o banco já tinha dados de aplicação em ${appeared.join(', ')} ` +
          '(gravados durante este comando?). Nada foi gravado nem apagado; rode status para conferir.'
      );
    }
  }
  try {
    confirmInstallation(identity, after);
  } catch (error) {
    if (error instanceof InstallationCheckError) {
      throw new ProvisioningError(
        'VERIFICATION_FAILED',
        `O marcador foi enviado pela CLI vinculada, mas a releitura pela API não confere:\n${error.message}\n` +
          'Pare e confira se SUPABASE_URL e o vínculo da CLI são do mesmo projeto.'
      );
    }
    throw error;
  }
  log(`Marcador gravado: ${expect.installationId} (${expect.environment}).`);
  return 'created';
}

/** Cria a linha inicial de restaurant_config se não existir; uma existente é preservada. */
export async function runConfig(
  expect: ProvisioningExpectation,
  target: TargetSummary,
  deps: ProvisioningDeps,
  options: { restaurantName: string }
): Promise<StepOutcome> {
  const row = buildInitialConfigRow(options.restaurantName);
  await confirmTarget(expect, target, deps);
  const { gateway, log } = deps;
  const existing = await gateway.readConfigRows();
  if (existing.length) {
    log(`restaurant_config já existe ("${existing[0].name}"): preservada, nada foi alterado.`);
    if (existing[0].name !== row.name) log('  O nome informado agora não foi aplicado; altere-o pela tela de configurações, se quiser.');
    return 'preserved';
  }
  await gateway.insertConfig(row);
  const after = await gateway.readConfigRows();
  if (after.length !== 1 || after[0].id !== row.id) {
    throw new ProvisioningError('VERIFICATION_FAILED', 'A configuração inicial não foi encontrada depois da gravação.');
  }
  log(`restaurant_config criada: "${row.name}" (taxas de entrega vazias, NFC-e desligada, sem logo, banner, contatos ou dados fiscais).`);
  return 'created';
}

/** Cria o bucket branding se não existir; um existente é preservado e comparado. */
export async function runStorage(expect: ProvisioningExpectation, target: TargetSummary, deps: ProvisioningDeps): Promise<StepOutcome> {
  await confirmTarget(expect, target, deps);
  const { gateway, log } = deps;
  const existing = await gateway.getBucket(BRANDING_BUCKET.id);
  if (existing) {
    const problems = compareBrandingBucket(existing);
    if (!problems.length) {
      log('Bucket branding já existe com a configuração esperada. Nada a fazer.');
      return 'already';
    }
    log(`Bucket branding já existe e foi PRESERVADO (arquivos e configuração intocados), mas diverge do esperado:\n  - ${problems.join('\n  - ')}`);
    log('Ajuste no painel do Supabase, se for o caso, e rode este comando de novo para conferir.');
    return 'diverged';
  }
  await gateway.createBucket(BRANDING_BUCKET);
  const created = await gateway.getBucket(BRANDING_BUCKET.id);
  if (!created || compareBrandingBucket(created).length) {
    throw new ProvisioningError('VERIFICATION_FAILED', 'O bucket branding não confere depois da criação.');
  }
  log('Bucket branding criado: público, PNG/JPEG/WebP, até 4 MB, sem políticas adicionais.');
  return 'created';
}

/**
 * Cria o primeiro administrador. Só roda com a tabela users VAZIA: não
 * substitui, não altera e não promove nenhuma conta. A senha é pedida depois
 * de todas as conferências, com entrada oculta, e só o hash é gravado, pela
 * função atômica public.create_first_admin (migration 20261106120000).
 * Administradores seguintes continuam sendo criados pela aplicação.
 */
export async function runAdmin(
  expect: ProvisioningExpectation,
  target: TargetSummary,
  deps: ProvisioningDeps & { promptPassword: (question: string) => Promise<string> },
  options: { name: string; email: string }
): Promise<StepOutcome> {
  const admin = validateAdminInput(options.name, options.email);
  await confirmTarget(expect, target, deps);
  const { gateway, log } = deps;
  const before = await gateway.countUsers();
  if (before.total > 0) {
    throw new ProvisioningError(
      'USERS_ALREADY_EXIST',
      `A instalação já tem ${before.total} usuário(s) (${before.admins} administrador(es)). ` +
        'O primeiro administrador só é criado num banco sem usuários; nenhuma conta foi criada, alterada ou promovida. ' +
        'Novos usuários são criados por um administrador na aplicação.'
    );
  }
  const password = await deps.promptPassword(`Senha do administrador ${admin.email} (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `);
  const confirmation = await deps.promptPassword('Repita a senha: ');
  validateNewPassword(password, confirmation);
  const row = await buildAdminRow(admin.name, admin.email, password);
  // Conferência e gravação atômicas no banco: uma execução simultânea que tenha
  // criado um usuário depois da contagem acima faz esta ser recusada.
  const result = await gateway.createFirstAdmin(row);
  if (result === 'users-exist') {
    throw new ProvisioningError(
      'USERS_ALREADY_EXIST',
      'Outro usuário foi criado enquanto este comando rodava (outra execução simultânea?). ' +
        'Nenhuma conta foi criada, alterada ou promovida por esta execução; rode status para conferir.'
    );
  }
  log(`Primeiro administrador criado: ${admin.email} (ADMIN). Teste o login na aplicação.`);
  return 'created';
}
