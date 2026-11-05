import { createClient } from '@supabase/supabase-js';
import type { AppEnvironment } from './env';

/**
 * Identidade da instalação (Etapa 1B.1).
 *
 * Cada restaurante tem a própria instalação e o próprio banco. Antes de aceitar
 * requisições, o backend confere se o marcador gravado no banco
 * (public.app_installation) é o mesmo de INSTALLATION_ID e APP_ENV. O backend
 * nunca cria nem altera o marcador: um banco conectado por engano não pode
 * passar a ser "o certo" só porque o servidor subiu nele.
 */

export interface InstallationIdentity {
  installationId: string;
  environment: AppEnvironment;
}

export interface InstallationMarker {
  installationId: string;
  environment: string;
}

export type MarkerReadResult =
  | { kind: 'found'; marker: InstallationMarker }
  | { kind: 'missing' }
  | { kind: 'table-missing' }
  | { kind: 'unreachable'; reason: string }
  | { kind: 'refused'; reason: string };

export type InstallationCheckCode =
  | 'DATABASE_UNREACHABLE'
  | 'MARKER_TABLE_MISSING'
  | 'MARKER_MISSING'
  | 'MARKER_READ_REFUSED'
  | 'INSTALLATION_MISMATCH'
  | 'ENVIRONMENT_MISMATCH';

export class InstallationCheckError extends Error {
  readonly code: InstallationCheckCode;

  constructor(code: InstallationCheckCode, detail: string) {
    super([
      'Identidade da instalação não confirmada; o servidor não vai subir.',
      `- ${detail}`,
    ].join('\n'));
    this.name = 'InstallationCheckError';
    this.code = code;
  }
}

/** Erros do PostgREST que significam "a tabela não existe neste banco". */
const TABLE_MISSING_CODES = new Set(['PGRST205', '42P01']);

type PostgrestLikeError = { code?: string | null; message?: string | null } | null;

export interface MarkerQueryResponse {
  data: unknown;
  error: PostgrestLikeError;
  status: number;
}

/** O mínimo do cliente Supabase que a leitura usa; os testes passam um falso. */
export interface MarkerClient {
  from(table: 'app_installation'): {
    select(columns: string): {
      limit(count: number): {
        abortSignal(signal: AbortSignal): PromiseLike<MarkerQueryResponse>;
      };
    };
  };
}

/**
 * Cliente sem tipos gerados e sem sessão, usado só para esta leitura: a tabela
 * é nova e os tipos são regenerados depois da migration (ver docs locais).
 */
export function createMarkerClient(url: string, serviceRoleKey: string): MarkerClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as MarkerClient;
}

/**
 * Lê o marcador e classifica o resultado. Falha de rede, tempo esgotado e
 * erro 5xx contam como banco inacessível; o resto vem do próprio banco.
 * Nenhuma mensagem do resultado inclui URL, chave ou valores de configuração.
 */
export async function readInstallationMarker(
  client: MarkerClient,
  options: { timeoutMs?: number } = {}
): Promise<MarkerReadResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const { data, error, status } = await client
      .from('app_installation')
      .select('installation_id, environment')
      .limit(2)
      .abortSignal(controller.signal);

    if (controller.signal.aborted) {
      return { kind: 'unreachable', reason: 'o banco não respondeu dentro do tempo limite' };
    }
    if (error) {
      if (error.code && TABLE_MISSING_CODES.has(error.code)) return { kind: 'table-missing' };
      if (!status || status >= 500) {
        return { kind: 'unreachable', reason: status ? `o banco respondeu HTTP ${status}` : 'falha de rede' };
      }
      return {
        kind: 'refused',
        reason: `o banco recusou a leitura (HTTP ${status}${error.code ? `, código ${error.code}` : ''})`,
      };
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return { kind: 'missing' };
    if (rows.length > 1) return { kind: 'refused', reason: 'há mais de uma linha de identidade' };
    const row = rows[0] as { installation_id?: unknown; environment?: unknown };
    return {
      kind: 'found',
      marker: { installationId: String(row.installation_id), environment: String(row.environment) },
    };
  } catch {
    return {
      kind: 'unreachable',
      reason: controller.signal.aborted ? 'o banco não respondeu dentro do tempo limite' : 'falha de rede',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Compara o marcador com a configuração. Devolve o marcador conferido ou lança
 * InstallationCheckError. O identificador do banco pode aparecer na mensagem
 * (vem do banco e não é segredo); o valor de INSTALLATION_ID não aparece.
 */
export function confirmInstallation(
  expected: InstallationIdentity,
  result: MarkerReadResult
): InstallationMarker {
  switch (result.kind) {
    case 'unreachable':
      throw new InstallationCheckError(
        'DATABASE_UNREACHABLE',
        `Não foi possível consultar o banco para conferir a instalação (${result.reason}). ` +
          'Isto é falha de conexão, não divergência de identidade; confira SUPABASE_URL e a rede.'
      );
    case 'table-missing':
      throw new InstallationCheckError(
        'MARKER_TABLE_MISSING',
        'A tabela app_installation não existe neste banco: aplique a migration 20261105120000_app_installation.sql.'
      );
    case 'missing':
      throw new InstallationCheckError(
        'MARKER_MISSING',
        'Este banco ainda não tem identidade de instalação. Grave o marcador (installation_id e environment) ' +
          'no banco certo antes de subir o servidor; o servidor não cria o marcador sozinho.'
      );
    case 'refused':
      throw new InstallationCheckError(
        'MARKER_READ_REFUSED',
        `Não foi possível ler a identidade da instalação: ${result.reason}. Confira SUPABASE_SERVICE_ROLE_KEY e as permissões da tabela.`
      );
    case 'found': {
      const { marker } = result;
      if (marker.installationId !== expected.installationId) {
        throw new InstallationCheckError(
          'INSTALLATION_MISMATCH',
          `O banco pertence à instalação "${marker.installationId}", diferente de INSTALLATION_ID. ` +
            'O servidor está apontando para o banco de outra instalação.'
        );
      }
      if (marker.environment !== expected.environment) {
        throw new InstallationCheckError(
          'ENVIRONMENT_MISMATCH',
          `O banco é do ambiente "${marker.environment}", mas APP_ENV=${expected.environment}.`
        );
      }
      return marker;
    }
  }
}

/** Lê e confere a identidade. Usado na inicialização, antes de aceitar requisições. */
export async function verifyInstallation(
  expected: InstallationIdentity,
  read: () => Promise<MarkerReadResult>
): Promise<InstallationMarker> {
  return confirmInstallation(expected, await read());
}
