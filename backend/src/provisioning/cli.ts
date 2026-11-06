/**
 * Provisionamento de uma instalação (Etapa 1B.3). Roteiro: backend/PROVISIONING.md.
 *
 *   npm run provision -- <comando> --target-env <arquivo> --project-ref <ref> \
 *     --installation-id <id> --environment <ambiente> [opções do comando]
 *
 * Comandos:
 *   status                                   somente leitura
 *   marker  [--new-installation]             grava o marcador de uma instalação nova
 *   config  --restaurant-name "<nome>"       cria a linha inicial de restaurant_config
 *   storage                                  cria o bucket branding
 *   admin   --admin-name "<nome>" --admin-email <email>
 *                                            cria o primeiro administrador (senha pedida com entrada oculta)
 *
 * Saída: 0 feito ou já existente; 3 recurso existente divergente (preservado);
 * 1 recusado (destino, identidade, migrations, dados existentes); 2 uso incorreto.
 * Não há senha por argumento nem rota HTTP de bootstrap.
 */
import path from 'node:path';
import { loadTargetEnvironment, SupabaseProvisioningGateway } from './gateway';
import { promptHidden, PromptAbortedError } from './prompt';
import {
  ProvisioningError,
  ProvisioningExpectation,
  ProvisioningGateway,
  runAdmin,
  runConfig,
  runMarker,
  runStatus,
  runStorage,
  StepOutcome,
  TargetSummary,
} from './provision';

const COMMANDS = ['status', 'marker', 'config', 'storage', 'admin'] as const;
type Command = (typeof COMMANDS)[number];

// --target-env (e não --env-file): o Node 20.6+ trata --env-file como opção
// própria e carregaria o arquivo em process.env.
const VALUE_FLAGS = ['--target-env', '--project-ref', '--installation-id', '--environment', '--restaurant-name', '--admin-name', '--admin-email'];
const BOOLEAN_FLAGS = ['--new-installation'];

export interface ParsedArgs {
  command: Command;
  envFile: string;
  expect: ProvisioningExpectation;
  options: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as Command)) {
    throw new ProvisioningError('USAGE', `Comando inválido. Use um de: ${COMMANDS.join(', ')}.`);
  }
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (/^--(admin-)?pass(word)?/i.test(flag) || /senha/i.test(flag)) {
      throw new ProvisioningError('USAGE', 'A senha não é aceita por argumento: ela é pedida com entrada oculta pelo comando admin.');
    }
    if (flag === '--env-file') throw new ProvisioningError('USAGE', 'Use --target-env <arquivo> (o Node usa --env-file para carregar variáveis no próprio processo).');
    if (BOOLEAN_FLAGS.includes(flag)) {
      options[flag] = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(flag)) throw new ProvisioningError('USAGE', `Opção desconhecida: ${flag}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw new ProvisioningError('USAGE', `${flag} precisa de um valor.`);
    options[flag] = value;
    index += 1;
  }
  const required = ['--target-env', '--project-ref', '--installation-id', '--environment'];
  if (command === 'config') required.push('--restaurant-name');
  if (command === 'admin') required.push('--admin-name', '--admin-email');
  const missing = required.filter((flag) => typeof options[flag] !== 'string');
  if (missing.length) throw new ProvisioningError('USAGE', `Faltam: ${missing.join(', ')}.`);
  if (options['--new-installation'] && command !== 'marker') {
    throw new ProvisioningError('USAGE', '--new-installation só vale para o comando marker.');
  }
  return {
    command: command as Command,
    envFile: path.resolve(String(options['--target-env'])),
    expect: {
      projectRef: String(options['--project-ref']),
      installationId: String(options['--installation-id']),
      environment: String(options['--environment']),
    },
    options,
  };
}

export const EXIT_CODES: Record<StepOutcome, number> = { created: 0, already: 0, preserved: 0, report: 0, diverged: 3 };

export interface CliDeps {
  log: (line: string) => void;
  error: (line: string) => void;
  loadTarget: (envFile: string) => { summary: TargetSummary; gateway: ProvisioningGateway };
  promptPassword: (question: string) => Promise<string>;
}

const defaultDeps = (): CliDeps => ({
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  loadTarget: (envFile) => {
    const { summary, serviceRoleKey } = loadTargetEnvironment(envFile);
    return { summary, gateway: new SupabaseProvisioningGateway(summary.supabaseUrl, serviceRoleKey) };
  },
  promptPassword: (question) => promptHidden(question),
});

export async function main(argv: string[], deps: CliDeps = defaultDeps()): Promise<number> {
  try {
    const args = parseArgs(argv);
    const { summary, gateway } = deps.loadTarget(args.envFile);
    const base = { gateway, log: deps.log };
    let outcome: StepOutcome;
    switch (args.command) {
      case 'status':
        outcome = await runStatus(args.expect, summary, base);
        break;
      case 'marker':
        outcome = await runMarker(args.expect, summary, base, { newInstallation: args.options['--new-installation'] === true });
        break;
      case 'config':
        outcome = await runConfig(args.expect, summary, base, { restaurantName: String(args.options['--restaurant-name']) });
        break;
      case 'storage':
        outcome = await runStorage(args.expect, summary, base);
        break;
      case 'admin':
        outcome = await runAdmin(args.expect, summary, { ...base, promptPassword: deps.promptPassword }, {
          name: String(args.options['--admin-name']),
          email: String(args.options['--admin-email']),
        });
        break;
    }
    return EXIT_CODES[outcome];
  } catch (error) {
    if (error instanceof ProvisioningError) {
      deps.error(`[${error.code}] ${error.message}`);
      return error.code === 'USAGE' ? 2 : 1;
    }
    if (error instanceof PromptAbortedError) {
      deps.error(error.message);
      return 1;
    }
    // Erro inesperado: só a mensagem, nunca o objeto (poderia carregar configuração).
    deps.error(`Falha inesperada: ${error instanceof Error ? error.message : String(error)}. Nada mais foi executado.`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
