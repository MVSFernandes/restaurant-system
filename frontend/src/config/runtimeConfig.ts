// Public configuration of the installation, read when the page loads, so one
// build can serve every installation. Only public values belong here: the
// backend's service_role key and JWT secrets must never reach the browser.
//
// The Vite dev server reuses this validator. The same rules are enforced when
// the container starts, in docker/40-runtime-config.sh.
// tests/runtime-config.test.ts runs the browser and container rules against the
// same cases, so a rule changed in one place must change in the other.

export interface RuntimeConfig {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export const RUNTIME_CONFIG_PATH = '/runtime-config.json';

/** Messages name the fields and never carry their values. */
export class RuntimeConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Configuração pública inválida: ${problems.join(' ')}`);
    this.name = 'RuntimeConfigError';
    this.problems = problems;
  }
}

const ABSOLUTE_URL = /^(https?):\/\/([A-Za-z0-9.-]+)(:[0-9]{1,5})?(\/[A-Za-z0-9._~/-]*)?$/;
const RELATIVE_PATH = /^\/[A-Za-z0-9._~-][A-Za-z0-9._~/-]*$/;
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]+$/;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SUPABASE_HOST = /^([a-z0-9]+)\.supabase\.co$/;
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];

const stripTrailingSlash = (value: string) => value.replace(/\/$/, '');

function isUsableAbsoluteUrl(match: RegExpExecArray) {
  return match[1] === 'https' || LOOPBACK_HOSTS.includes(match[2]);
}

function checkApiUrl(value: string): string | null {
  if (RELATIVE_PATH.test(value)) return null;
  const match = ABSOLUTE_URL.exec(value);
  if (!match) return 'apiUrl (PUBLIC_API_URL) deve ser um caminho como /api ou uma URL http(s), sem parâmetros.';
  if (!isUsableAbsoluteUrl(match)) return 'apiUrl (PUBLIC_API_URL) só pode usar http em localhost; use https.';
  return null;
}

function checkSupabaseUrl(value: string): string | null {
  const match = ABSOLUTE_URL.exec(value);
  if (!match || (match[4] && match[4] !== '/')) {
    return 'supabaseUrl (PUBLIC_SUPABASE_URL) deve ser a URL http(s) do projeto, sem caminho.';
  }
  if (!isUsableAbsoluteUrl(match)) return 'supabaseUrl (PUBLIC_SUPABASE_URL) só pode usar http em localhost; use https.';
  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const parsed: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function checkAnonKey(key: string, supabaseUrl: string): string | null {
  const field = 'supabaseAnonKey (PUBLIC_SUPABASE_ANON_KEY)';
  if (PUBLISHABLE_KEY.test(key)) return null;
  if (key.startsWith('sb_secret_')) return `${field} recebeu uma chave secreta; use a chave pública do projeto.`;
  if (!JWT.test(key)) return `${field} não tem o formato de uma chave pública do Supabase.`;

  const payload = decodeJwtPayload(key);
  if (!payload) return `${field} não tem o formato de uma chave pública do Supabase.`;
  if (payload.role !== 'anon') return `${field} deve ter o papel anon; nunca use a service_role no frontend.`;

  // Catches the key of one project next to the URL of another. Custom domains
  // do not carry the project ref, so they are not compared.
  const host = ABSOLUTE_URL.exec(supabaseUrl)?.[2];
  const urlRef = host ? SUPABASE_HOST.exec(host)?.[1] : undefined;
  if (urlRef && typeof payload.ref === 'string' && payload.ref !== urlRef) {
    return `${field} é de outro projeto: não corresponde a supabaseUrl (PUBLIC_SUPABASE_URL).`;
  }
  return null;
}

export function parseRuntimeConfig(raw: unknown): RuntimeConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RuntimeConfigError(['o arquivo deve conter um objeto JSON.']);
  }

  const source = raw as Record<string, unknown>;
  const problems: string[] = [];
  const allowed = ['apiUrl', 'supabaseUrl', 'supabaseAnonKey'];
  const unknownFields = Object.keys(source).filter((name) => !allowed.includes(name));
  if (unknownFields.length > 0) {
    problems.push(`campos não permitidos: ${unknownFields.join(', ')}.`);
  }

  const read = (name: string, variable: string) => {
    const value = source[name];
    if (typeof value === 'string' && value !== '') return value;
    problems.push(`${name} (${variable}) é obrigatório.`);
    return null;
  };
  const apiUrl = read('apiUrl', 'PUBLIC_API_URL');
  const supabaseUrl = read('supabaseUrl', 'PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = read('supabaseAnonKey', 'PUBLIC_SUPABASE_ANON_KEY');

  const urlProblem = supabaseUrl === null ? null : checkSupabaseUrl(supabaseUrl);
  for (const problem of [
    apiUrl === null ? null : checkApiUrl(apiUrl),
    urlProblem,
    // A key can only be compared with a URL that is itself valid.
    supabaseAnonKey === null ? null : checkAnonKey(supabaseAnonKey, urlProblem ? '' : (supabaseUrl ?? '')),
  ]) {
    if (problem) problems.push(problem);
  }

  if (problems.length > 0 || apiUrl === null || supabaseUrl === null || supabaseAnonKey === null) {
    throw new RuntimeConfigError(problems);
  }
  return {
    apiUrl: stripTrailingSlash(apiUrl),
    supabaseUrl: stripTrailingSlash(supabaseUrl),
    supabaseAnonKey,
  };
}

let current: RuntimeConfig | null = null;

/** Must finish before the modules that create the API and Supabase clients are imported. */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  let response: Response;
  try {
    response = await fetch(RUNTIME_CONFIG_PATH, { cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch {
    throw new RuntimeConfigError([`não foi possível baixar ${RUNTIME_CONFIG_PATH}.`]);
  }
  if (!response.ok) {
    // The dev server explains what is wrong; any other server just gets the status.
    const body = (await response.json().catch(() => null)) as { problems?: unknown } | null;
    const details = body?.problems;
    const problems = Array.isArray(details) && details.every((item) => typeof item === 'string') ? details : [];
    throw new RuntimeConfigError(
      problems.length > 0 ? problems : [`${RUNTIME_CONFIG_PATH} respondeu com status ${response.status}.`],
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    // A server that falls back to index.html for unknown paths ends up here.
    throw new RuntimeConfigError([`${RUNTIME_CONFIG_PATH} não contém JSON válido.`]);
  }

  current = parseRuntimeConfig(raw);
  return current;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!current) throw new RuntimeConfigError(['a configuração foi usada antes de ser carregada.']);
  return current;
}
