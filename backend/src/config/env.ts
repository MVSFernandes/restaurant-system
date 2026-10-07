import dotenv from 'dotenv';

dotenv.config();

/**
 * Configuração que o servidor exige para subir. Faltou uma, ele não sobe:
 * não há valor padrão para segredo, ambiente fiscal ou origem do CORS
 * (docs/etapas/etapa-ambiente-segredos.md).
 */
export const REQUIRED_ENV = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FOCUS_NFE_TOKEN',
  'FOCUS_NFE_ENVIRONMENT',
  'FOCUS_NFE_WEBHOOK_SECRET',
  'FRONTEND_URL',
] as const;

export type RequiredEnv = (typeof REQUIRED_ENV)[number];

export const FOCUS_NFE_ENVIRONMENTS = ['production', 'homologation'] as const;

export type FocusNfeEnvironment = (typeof FOCUS_NFE_ENVIRONMENTS)[number];

export const isFocusNfeEnvironment = (value: unknown): value is FocusNfeEnvironment =>
  FOCUS_NFE_ENVIRONMENTS.includes(value as FocusNfeEnvironment);

export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(['Configuração inválida; o servidor não vai subir.', ...problems.map((problem) => `- ${problem}`)].join('\n'));
    this.name = 'EnvironmentError';
  }
}

const isBlank = (value: string | undefined) => !value || !value.trim();

/**
 * Descreve o que está errado só pelo nome da variável. O valor nunca entra na
 * mensagem: pode ser um segredo colado no lugar errado.
 */
export function findEnvironmentProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems = REQUIRED_ENV
    .filter((name) => isBlank(env[name]))
    .map((name) => `${name} não está definida.`);

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
