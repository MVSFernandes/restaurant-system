import dotenv from 'dotenv';

dotenv.config();

/**
 * Configuração que o servidor exige para subir. Faltou uma, ele não sobe:
 * não há valor padrão para segredo, ambiente fiscal, origem do CORS ou
 * identidade da instalação (docs/etapas/etapa-ambiente-segredos.md).
 */
export const BASE_REQUIRED_ENV = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRONTEND_URL',
  'INSTALLATION_ID',
  'APP_ENV',
] as const;

/** Exigidas só com a emissão fiscal ativa (FOCUS_NFE_ENABLED diferente de "false"). */
export const FISCAL_REQUIRED_ENV = [
  'FOCUS_NFE_TOKEN',
  'FOCUS_NFE_ENVIRONMENT',
  'FOCUS_NFE_WEBHOOK_SECRET',
] as const;

export const REQUIRED_ENV = [...BASE_REQUIRED_ENV, ...FISCAL_REQUIRED_ENV] as const;

export type RequiredEnv = (typeof REQUIRED_ENV)[number];

export const FOCUS_NFE_ENVIRONMENTS = ['production', 'homologation'] as const;

export type FocusNfeEnvironment = (typeof FOCUS_NFE_ENVIRONMENTS)[number];

export const isFocusNfeEnvironment = (value: unknown): value is FocusNfeEnvironment =>
  FOCUS_NFE_ENVIRONMENTS.includes(value as FocusNfeEnvironment);

/** Ambientes de uma instalação. Só "production" pode emitir documento fiscal de produção. */
export const APP_ENVIRONMENTS = ['development', 'test', 'staging', 'production'] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const isAppEnvironment = (value: unknown): value is AppEnvironment =>
  APP_ENVIRONMENTS.includes(value as AppEnvironment);

/** Mesmo formato aceito pela tabela app_installation. */
export const INSTALLATION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** Endereço da API de produção da Focus NFe. */
export const FOCUS_NFE_PRODUCTION_HOST = 'api.focusnfe.com.br';

/** Endereço padrão de cada ambiente fiscal. */
export const FOCUS_NFE_DEFAULT_BASE_URLS: Record<FocusNfeEnvironment, string> = {
  production: 'https://api.focusnfe.com.br/v2',
  homologation: 'https://homologacao.focusnfe.com.br/v2',
};

/**
 * Endereço efetivamente usado nas chamadas à Focus NFe: FOCUS_NFE_BASE_URL,
 * se definida; senão, o padrão do ambiente fiscal.
 */
export function focusNfeBaseUrl(environment: FocusNfeEnvironment, override?: string): string {
  const configured = override?.trim();
  return configured ? configured.replace(/\/$/, '') : FOCUS_NFE_DEFAULT_BASE_URLS[environment];
}

const FOCUS_NFE_ENABLED_VALUES = ['true', 'false'] as const;

/** A emissão fiscal fica ativa, salvo FOCUS_NFE_ENABLED=false explícito. */
export const isFocusNfeEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.FOCUS_NFE_ENABLED?.trim() !== 'false';

export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(['Configuração inválida; o servidor não vai subir.', ...problems.map((problem) => `- ${problem}`)].join('\n'));
    this.name = 'EnvironmentError';
  }
}

const isBlank = (value: string | undefined) => !value || !value.trim();

const hostOf = (value: string) => {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Regra única do destino fiscal, usada na partida do servidor e antes de cada
 * chamada à Focus NFe: fora de APP_ENV=production, nem o ambiente fiscal nem o
 * endereço efetivo podem ser os de produção. APP_ENV ausente ou inválido conta
 * como "fora de produção".
 *
 * `focusEnvironment` é o valor configurado (pode estar vazio ou inválido);
 * `baseUrl` é o endereço efetivo, ou FOCUS_NFE_BASE_URL quando o ambiente
 * ainda não é válido.
 */
export function findFiscalTargetProblems(
  appEnvironment: string | undefined,
  focusEnvironment: string | undefined,
  baseUrl: string | undefined
): string[] {
  if (appEnvironment === 'production') return [];
  const label = isAppEnvironment(appEnvironment) ? `APP_ENV=${appEnvironment}` : 'Sem APP_ENV=production, a instalação';
  const problems: string[] = [];
  if (focusEnvironment === 'production') {
    problems.push(
      `${label} não pode usar FOCUS_NFE_ENVIRONMENT=production. ` +
        'Emissão fiscal de produção só com APP_ENV=production.'
    );
  } else if (!isBlank(baseUrl) && hostOf(baseUrl!) === FOCUS_NFE_PRODUCTION_HOST) {
    problems.push(`${label} não pode usar FOCUS_NFE_BASE_URL apontando para a API de produção da Focus NFe.`);
  }
  return problems;
}

/** Endereço efetivo a partir da configuração, quando já for possível calculá-lo. */
const configuredFocusBaseUrl = (env: NodeJS.ProcessEnv) =>
  isFocusNfeEnvironment(env.FOCUS_NFE_ENVIRONMENT)
    ? focusNfeBaseUrl(env.FOCUS_NFE_ENVIRONMENT, env.FOCUS_NFE_BASE_URL)
    : env.FOCUS_NFE_BASE_URL;

/**
 * Descreve o que está errado só pelo nome da variável. O valor nunca entra na
 * mensagem: pode ser um segredo colado no lugar errado. As exceções são os
 * valores já validados contra uma lista fechada (APP_ENV, ambiente fiscal).
 */
export function findEnvironmentProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];

  const enabledValue = env.FOCUS_NFE_ENABLED;
  if (!isBlank(enabledValue) && !FOCUS_NFE_ENABLED_VALUES.includes(enabledValue!.trim() as 'true' | 'false')) {
    problems.push('FOCUS_NFE_ENABLED aceita apenas true ou false. O valor não é exibido porque pode ser um segredo.');
  }
  const fiscalEnabled = isFocusNfeEnabled(env);

  const required = fiscalEnabled ? REQUIRED_ENV : BASE_REQUIRED_ENV;
  problems.push(
    ...required.filter((name) => isBlank(env[name])).map((name) => `${name} não está definida.`)
  );

  const focusEnvironment = env.FOCUS_NFE_ENVIRONMENT;
  if (!isBlank(focusEnvironment) && !isFocusNfeEnvironment(focusEnvironment)) {
    const sameAs = REQUIRED_ENV.filter(
      (name) => name !== 'FOCUS_NFE_ENVIRONMENT' && env[name] === focusEnvironment
    );
    problems.push(
      `FOCUS_NFE_ENVIRONMENT tem um valor fora dos aceitos (${FOCUS_NFE_ENVIRONMENTS.join(' ou ')}).` +
        (sameAs.length ? ` O valor é igual ao de ${sameAs.join(', ')}.` : '') +
        ' O valor não é exibido porque pode ser um segredo.'
    );
  }

  const installationId = env.INSTALLATION_ID;
  if (!isBlank(installationId) && !INSTALLATION_ID_PATTERN.test(installationId!)) {
    problems.push(
      'INSTALLATION_ID deve ter de 3 a 64 caracteres, só letras minúsculas, números e hífens, ' +
        'sem hífen no início ou no fim. O valor não é exibido porque pode ser um segredo.'
    );
  }

  const appEnvironment = env.APP_ENV;
  if (!isBlank(appEnvironment) && !isAppEnvironment(appEnvironment)) {
    problems.push(
      `APP_ENV tem um valor fora dos aceitos (${APP_ENVIRONMENTS.join(', ')}). ` +
        'O valor não é exibido porque pode ser um segredo.'
    );
  }

  // Fora de produção, nenhuma configuração pode levar a emissão fiscal de
  // produção — nem com a emissão desativada, para não ficar pronta para ligar.
  // A mesma regra é conferida no serviço antes de cada chamada.
  if (isAppEnvironment(appEnvironment)) {
    problems.push(...findFiscalTargetProblems(appEnvironment, focusEnvironment, configuredFocusBaseUrl(env)));
  }

  return problems;
}

export function assertEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const problems = findEnvironmentProblems(env);
  if (problems.length) throw new EnvironmentError(problems);
}

/** Lê uma variável obrigatória. Sem ela, falha; nunca devolve um padrão. */
export function requireEnv(name: RequiredEnv): string {
  const value = process.env[name];
  if (isBlank(value)) throw new EnvironmentError([`${name} não está definida.`]);
  return value as string;
}
