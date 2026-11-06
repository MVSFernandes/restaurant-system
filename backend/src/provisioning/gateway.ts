import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readInstallationMarker } from '../config/installation';
import type { InstallationIdentity, MarkerClient, MarkerReadResult } from '../config/installation';
import {
  BRANDING_BUCKET,
  BucketInfo,
  ConfigRowSummary,
  CountedTable,
  markerInsertSql,
  MigrationState,
  ProvisioningError,
  ProvisioningGateway,
  TargetSummary,
  UserCounts,
  UserInsertRow,
} from './provision';

/** backend/, tanto em src/provisioning quanto em dist/provisioning. */
export const BACKEND_DIR = path.resolve(__dirname, '..', '..');

export interface TargetEnvironment {
  summary: TargetSummary;
  serviceRoleKey: string;
}

/**
 * Lê o arquivo de ambiente DA INSTALAÇÃO informado pelo operador, sem tocar em
 * process.env (o .env do diretório atual pode ser de outra instalação).
 */
export function loadTargetEnvironment(envFile: string, backendDir: string = BACKEND_DIR): TargetEnvironment {
  let text: string;
  try {
    text = fs.readFileSync(envFile, 'utf8');
  } catch {
    throw new ProvisioningError('USAGE', `Não foi possível ler o arquivo de ambiente ${envFile}.`);
  }
  const values = dotenv.parse(text);
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((name) => !values[name]);
  if (missing.length) throw new ProvisioningError('USAGE', `O arquivo de ambiente não define ${missing.join(' e ')}.`);
  return {
    summary: {
      supabaseUrl: values.SUPABASE_URL,
      installationId: values.INSTALLATION_ID || undefined,
      appEnv: values.APP_ENV || undefined,
      linkedProjectRef: readLinkedProjectRef(backendDir),
    },
    serviceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** Ref gravada por `supabase link` em backend/supabase/.temp/project-ref. */
export function readLinkedProjectRef(backendDir: string = BACKEND_DIR): string | null {
  try {
    const value = fs.readFileSync(path.join(backendDir, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

const supabaseBinary = (backendDir: string) =>
  path.join(backendDir, 'node_modules', 'supabase', 'bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase');

/** Mensagem de erro sem URL, chave ou valores enviados. */
const describe = (what: string, error: { code?: string | null; message?: string | null; statusCode?: string | number } | null) =>
  `${what} falhou${error?.code ? ` (código ${error.code})` : ''}${error?.statusCode ? ` (HTTP ${error.statusCode})` : ''}: ${error?.message ?? 'erro desconhecido'}`;

/**
 * Acesso real a um projeto Supabase.
 * - Tabelas e storage: API do projeto com a chave de serviço do arquivo de
 *   ambiente da instalação (o mesmo canal do backend). A chave nunca é impressa.
 * - Marcador: SQL pela Supabase CLI vinculada (a tabela só pode ser lida pela
 *   chave de serviço, por desenho da migration 20261105120000).
 * - Migrations: o verificador versionado (db:migrations:check --linked).
 */
export class SupabaseProvisioningGateway implements ProvisioningGateway {
  private readonly client: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string, private readonly backendDir: string = BACKEND_DIR) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async migrationState(): Promise<MigrationState> {
    const run = spawnSync(
      process.execPath,
      [path.join(this.backendDir, 'scripts', 'migrations', 'check-migration-state.cjs'), '--linked', '--json'],
      { cwd: this.backendDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
    try {
      return { verdict: String(JSON.parse(run.stdout).verdict), exitCode: run.status };
    } catch {
      return { verdict: 'error', exitCode: run.status };
    }
  }

  readMarker(): Promise<MarkerReadResult> {
    return readInstallationMarker(this.client as unknown as MarkerClient);
  }

  async insertMarkerIfAbsent(identity: InstallationIdentity, emptyTables: readonly string[]): Promise<void> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-provision-'));
    try {
      // O arquivo temporário só contém o id da instalação, o ambiente e nomes de tabela.
      const file = path.join(tempDir, 'marker.sql');
      fs.writeFileSync(file, markerInsertSql(identity, emptyTables), 'utf8');
      const run = spawnSync(
        supabaseBinary(this.backendDir),
        ['db', 'query', '--linked', '--agent', 'yes', '-o', 'json', '-f', file],
        { cwd: this.backendDir, encoding: 'utf8' }
      );
      if (run.error) throw new ProvisioningError('VERIFICATION_FAILED', `Não foi possível executar a Supabase CLI (${(run.error as NodeJS.ErrnoException).code ?? 'erro'}).`);
      if (run.status !== 0) {
        const detail = String(run.stderr || '').split('\n').filter((line) => line.trim() && !/new version|recommend updating/i.test(line)).join('\n');
        throw new ProvisioningError('VERIFICATION_FAILED', `supabase db query falhou (exit ${run.status})${detail ? `:\n${detail}` : ''}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async countRows(table: CountedTable): Promise<number> {
    const { count, error } = await this.client.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new ProvisioningError('VERIFICATION_FAILED', describe(`Contagem de ${table}`, error));
    return count ?? 0;
  }

  async countUsers(): Promise<UserCounts> {
    const total = await this.countRows('users');
    const { count, error } = await this.client.from('users').select('*', { count: 'exact', head: true }).eq('role', 'ADMIN');
    if (error) throw new ProvisioningError('VERIFICATION_FAILED', describe('Contagem de administradores', error));
    return { total, admins: count ?? 0 };
  }

  async createFirstAdmin(row: UserInsertRow): Promise<'created' | 'users-exist'> {
    // O hash vai só no corpo da chamada (HTTPS), nunca em argumento, arquivo ou
    // log; a função devolve apenas o id e nenhuma mensagem repete o hash.
    const { error } = await this.client.rpc('create_first_admin', {
      p_id: row.id,
      p_name: row.name,
      p_email: row.email,
      p_password_hash: row.password,
    });
    if (!error) return 'created';
    if (String(error.message).includes('FIRST_ADMIN_USERS_ALREADY_EXIST')) return 'users-exist';
    const known = ['FIRST_ADMIN_INVALID_INPUT', 'FIRST_ADMIN_INVALID_HASH'].find((code) => String(error.message).includes(code));
    throw new ProvisioningError(
      'VERIFICATION_FAILED',
      describe('Criação do administrador', { code: error.code, message: known ?? (error.code === '23505' ? 'e-mail já cadastrado' : 'o banco recusou a gravação') })
    );
  }

  async readConfigRows(): Promise<ConfigRowSummary[]> {
    const { data, error } = await this.client.from('restaurant_config').select('id, name');
    if (error) throw new ProvisioningError('VERIFICATION_FAILED', describe('Leitura de restaurant_config', error));
    return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
  }

  async insertConfig(row: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from('restaurant_config').insert(row);
    if (error) throw new ProvisioningError('VERIFICATION_FAILED', describe('Criação de restaurant_config', error));
  }

  async getBucket(id: string): Promise<BucketInfo | null> {
    const { data, error } = await this.client.storage.listBuckets();
    if (error) throw new ProvisioningError('VERIFICATION_FAILED', describe('Leitura dos buckets', error as { message: string }));
    const bucket = (data ?? []).find((item) => item.id === id);
    if (!bucket) return null;
    return {
      id: bucket.id,
      public: bucket.public === true,
      fileSizeLimit: bucket.file_size_limit == null ? null : Number(bucket.file_size_limit),
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
    };
  }

  async createBucket(spec: typeof BRANDING_BUCKET): Promise<void> {
    const { error } = await this.client.storage.createBucket(spec.id, {
      public: spec.public,
      fileSizeLimit: spec.fileSizeLimit,
      allowedMimeTypes: [...spec.allowedMimeTypes],
    });
    if (error) throw new ProvisioningError('VERIFICATION_FAILED', describe('Criação do bucket branding', error as { message: string }));
  }
}
