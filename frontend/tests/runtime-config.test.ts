import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../src/config/runtimeConfig';

vi.unmock('../src/config/runtimeConfig');

const createClient = vi.hoisted(() => vi.fn(() => ({ channel: vi.fn() })));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const renderApp = vi.hoisted(() => vi.fn());
vi.mock('../src/bootstrap', () => ({ renderApp }));

// Simulated destinations only: nothing in this file opens a connection.
const base64Url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload: object) => `${base64Url({ alg: 'none' })}.${base64Url(payload)}.simulated-signature`;
// For payloads that JSON.stringify cannot produce.
const jwtRaw = (payload: string) => `${base64Url({ alg: 'none' })}.${btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.simulated-signature`;

const SIMULATED_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const ANON_KEY = jwt({ role: 'anon', ref: 'abcdefghijklmnopqrst' });
const VALID: RuntimeConfig = { apiUrl: '/api', supabaseUrl: SIMULATED_URL, supabaseAnonKey: ANON_KEY };

type Env = Partial<RuntimeConfig>;
interface Case { name: string; env: Env; problem?: RegExp; expected?: RuntimeConfig }

const without = (field: keyof RuntimeConfig) => {
  const env: Env = { ...VALID };
  delete env[field];
  return env;
};

const CASES: Case[] = [
  { name: 'relative API path', env: VALID, expected: VALID },
  { name: 'absolute API URL', env: { ...VALID, apiUrl: 'https://api.example.test/api' }, expected: { ...VALID, apiUrl: 'https://api.example.test/api' } },
  { name: 'http on localhost', env: { ...VALID, apiUrl: 'http://localhost:3001/api', supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: jwt({ role: 'anon' }) }, expected: { apiUrl: 'http://localhost:3001/api', supabaseUrl: 'http://127.0.0.1:54321', supabaseAnonKey: jwt({ role: 'anon' }) } },
  { name: 'trailing slashes removed', env: { ...VALID, apiUrl: '/api/', supabaseUrl: `${SIMULATED_URL}/` }, expected: VALID },
  { name: 'publishable key', env: { ...VALID, supabaseAnonKey: 'sb_publishable_simulated-key_1' }, expected: { ...VALID, supabaseAnonKey: 'sb_publishable_simulated-key_1' } },
  { name: 'custom domain does not compare the ref', env: { ...VALID, supabaseUrl: 'https://realtime.example.test' }, expected: { ...VALID, supabaseUrl: 'https://realtime.example.test' } },
  { name: 'key without ref', env: { ...VALID, supabaseAnonKey: jwt({ role: 'anon' }) }, expected: { ...VALID, supabaseAnonKey: jwt({ role: 'anon' }) } },

  { name: 'API URL missing', env: without('apiUrl'), problem: /PUBLIC_API_URL/ },
  { name: 'Supabase URL missing', env: without('supabaseUrl'), problem: /PUBLIC_SUPABASE_URL/ },
  { name: 'anon key missing', env: without('supabaseAnonKey'), problem: /PUBLIC_SUPABASE_ANON_KEY/ },
  { name: 'API URL empty', env: { ...VALID, apiUrl: '' }, problem: /PUBLIC_API_URL/ },
  { name: 'API URL only a slash', env: { ...VALID, apiUrl: '/' }, problem: /PUBLIC_API_URL/ },
  { name: 'protocol-relative API URL', env: { ...VALID, apiUrl: '//evil.example.test/api' }, problem: /PUBLIC_API_URL/ },
  { name: 'API URL with query', env: { ...VALID, apiUrl: '/api?x=1' }, problem: /PUBLIC_API_URL/ },
  { name: 'API URL with credentials', env: { ...VALID, apiUrl: 'https://user:pass@api.example.test/api' }, problem: /PUBLIC_API_URL/ },
  { name: 'API URL with another scheme', env: { ...VALID, apiUrl: 'ftp://api.example.test/api' }, problem: /PUBLIC_API_URL/ },
  { name: 'API over http outside localhost', env: { ...VALID, apiUrl: 'http://api.example.test/api' }, problem: /PUBLIC_API_URL.*https/ },
  { name: 'API URL with surrounding spaces', env: { ...VALID, apiUrl: ' /api ' }, problem: /PUBLIC_API_URL/ },
  { name: 'API URL with a second line', env: { ...VALID, apiUrl: '/api\nhttps://evil.example.test' }, problem: /PUBLIC_API_URL/ },
  { name: 'API URL breaking out of JSON', env: { ...VALID, apiUrl: '/api","x":"y' }, problem: /PUBLIC_API_URL/ },
  { name: 'Supabase URL with path', env: { ...VALID, supabaseUrl: `${SIMULATED_URL}/rest/v1` }, problem: /PUBLIC_SUPABASE_URL/ },
  { name: 'Supabase URL relative', env: { ...VALID, supabaseUrl: '/supabase' }, problem: /PUBLIC_SUPABASE_URL/ },
  { name: 'Supabase over http outside localhost', env: { ...VALID, supabaseUrl: 'http://abcdefghijklmnopqrst.supabase.co' }, problem: /PUBLIC_SUPABASE_URL.*https/ },
  { name: 'placeholder key', env: { ...VALID, supabaseAnonKey: 'your-supabase-anon-key' }, problem: /PUBLIC_SUPABASE_ANON_KEY/ },
  { name: 'service_role key', env: { ...VALID, supabaseAnonKey: jwt({ role: 'service_role', ref: 'abcdefghijklmnopqrst' }) }, problem: /service_role/ },
  { name: 'authenticated key', env: { ...VALID, supabaseAnonKey: jwt({ role: 'authenticated' }) }, problem: /papel anon/ },
  { name: 'key without role', env: { ...VALID, supabaseAnonKey: jwt({ ref: 'abcdefghijklmnopqrst' }) }, problem: /papel anon/ },
  { name: 'secret key', env: { ...VALID, supabaseAnonKey: 'sb_secret_simulated' }, problem: /chave secreta/ },
  { name: 'JWT payload that is not JSON', env: { ...VALID, supabaseAnonKey: 'aaaa.bbbb.cccc' }, problem: /PUBLIC_SUPABASE_ANON_KEY/ },
  { name: 'key of another project', env: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', ref: 'zzzzzzzzzzzzzzzzzzzz' }) }, problem: /outro projeto/ },

  // Only the top level of the payload counts.
  { name: 'service_role with metadata.role anon', env: { ...VALID, supabaseAnonKey: jwt({ role: 'service_role', metadata: { role: 'anon' } }) }, problem: /service_role/ },
  { name: 'metadata.role anon without a main role', env: { ...VALID, supabaseAnonKey: jwt({ metadata: { role: 'anon' } }) }, problem: /papel anon/ },
  { name: 'ref of another project with matching metadata.ref', env: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', ref: 'zzzzzzzzzzzzzzzzzzzz', metadata: { ref: 'abcdefghijklmnopqrst' } }) }, problem: /outro projeto/ },
  { name: 'main role anon with metadata.role service_role', env: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', metadata: { role: 'service_role' } }) }, expected: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', metadata: { role: 'service_role' } }) } },
  { name: 'main ref matching with metadata.ref of another project', env: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', ref: 'abcdefghijklmnopqrst', metadata: { ref: 'zzzzzzzzzzzzzzzzzzzz' } }) }, expected: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', ref: 'abcdefghijklmnopqrst', metadata: { ref: 'zzzzzzzzzzzzzzzzzzzz' } }) } },
  { name: 'ref that is not a string', env: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', ref: 123 }) }, expected: { ...VALID, supabaseAnonKey: jwt({ role: 'anon', ref: 123 }) } },

  // Real JSON semantics, which text matching gets wrong.
  { name: 'role written with an escape', env: { ...VALID, supabaseAnonKey: jwtRaw('{"r\\u006fle":"service_role"}') }, problem: /service_role/ },
  { name: 'anon written with an escape', env: { ...VALID, supabaseAnonKey: jwtRaw('{"role":"\\u0061non"}') }, expected: { ...VALID, supabaseAnonKey: jwtRaw('{"role":"\\u0061non"}') } },
  { name: 'repeated role, the last one is service_role', env: { ...VALID, supabaseAnonKey: jwtRaw('{"role":"anon","role":"service_role"}') }, problem: /service_role/ },
  { name: 'anon only inside a string value', env: { ...VALID, supabaseAnonKey: jwtRaw('{"role":"service_role","note":"\\"role\\":\\"anon\\""}') }, problem: /service_role/ },

  // Malformed payloads.
  { name: 'truncated JSON', env: { ...VALID, supabaseAnonKey: jwtRaw('{"role":"anon"') }, problem: /formato/ },
  { name: 'two JSON documents', env: { ...VALID, supabaseAnonKey: jwtRaw('{"role":"anon"}{"role":"service_role"}') }, problem: /formato/ },
  { name: 'JSON array', env: { ...VALID, supabaseAnonKey: jwtRaw('[{"role":"anon"}]') }, problem: /formato/ },
  { name: 'JSON text', env: { ...VALID, supabaseAnonKey: jwtRaw('"anon"') }, problem: /formato/ },
  { name: 'JSON null', env: { ...VALID, supabaseAnonKey: jwtRaw('null') }, problem: /formato/ },
  { name: 'empty payload', env: { ...VALID, supabaseAnonKey: `${base64Url({ alg: 'none' })}.AA.simulated-signature` }, problem: /formato/ },
  { name: 'payload with a NUL byte', env: { ...VALID, supabaseAnonKey: jwtRaw('{"role":"anon\u0000"}') }, problem: /formato/ },

  // What jq's parser tolerates and JSON does not, always with a valid main role.
  ...[
    ['nan', '{"role":"anon","x":nan}'],
    ['NaN', '{"role":"anon","x":NaN}'],
    ['Infinity', '{"role":"anon","x":Infinity}'],
    ['-Infinity', '{"role":"anon","x":-Infinity}'],
    ['nan nested in an array', '{"role":"anon","m":{"x":[1,nan]}}'],
    ['nan before the role', '{"x":nan,"role":"anon"}'],
    ['nan with a key of the same name', '{"role":"anon","nan":nan}'],
    ['nan right after a string with an escaped quote', '{"role":"anon","a":"\\"","x":nan}'],
    ['sNaN', '{"role":"anon","x":sNaN}'],
    ['nan with digits', '{"role":"anon","x":nan1}'],
    ['number with a plus sign', '{"role":"anon","x":+1}'],
    ['number with a leading zero', '{"role":"anon","x":01}'],
    ['number without an integer part', '{"role":"anon","x":.5}'],
    ['number without a fraction', '{"role":"anon","x":1.}'],
    ['line break inside a string', '{"role":"anon","x":"a\nb"}'],
    ['tab inside a string', '{"role":"anon","x":"a\tb"}'],
    ['invalid escape', '{"role":"anon","x":"\\q"}'],
    ['incomplete unicode escape', '{"role":"anon","x":"\\u12"}'],
    ['single quotes', "{'role':'anon'}"],
    ['comment', '{"role":"anon"} # comment'],
    ['trailing comma', '{"role":"anon",}'],
    ['byte order mark', 'ï»¿{"role":"anon"}'],
    ['literal in the wrong case', '{"role":"anon","x":True}'],
    ['literals without a separator', '{"role":"anon","x":[truefalse]}'],
    ['missing colon', '{"role" "anon"}'],
  ].map(([name, payload]): Case => ({ name: `not JSON: ${name}`, env: { ...VALID, supabaseAnonKey: jwtRaw(payload) }, problem: /formato/ })),

  // Valid JSON that a search for those words would refuse by mistake.
  ...[
    ['the words inside a string', '{"role":"anon","note":"nan NaN Infinity -Infinity"}'],
    ['a string that looks like a member', '{"role":"anon","note":"x\\":nan,\\"y"}'],
    ['the words as keys', '{"role":"anon","nan":1,"NaN":2,"Infinity":3,"-Infinity":4}'],
    ['the words inside nested strings', '{"role":"anon","m":{"x":["nan",{"y":"Infinity"}]}}'],
    ['every number form', '{"role":"anon","n":[0,-0,10,-0.5,1e5,1E+2,1.25e-3,1e1000]}'],
    ['the three literals', '{"role":"anon","t":true,"f":false,"z":null}'],
    ['whitespace between tokens', ' {\n\t"role" : "anon" ,\r\n"x" : [ 1 , 2 ]\n} \n'],
    ['escapes in strings', '{"role":"anon","x":"\\"\\\\\\/\\b\\f\\n\\r\\t\\u00e9\\u0000"}'],
    ['non-ASCII text', Buffer.from('{"role":"anon","x":"café"}', 'utf8').toString('latin1')],
    ['empty containers', '{"role":"anon","a":{},"b":[],"c":""}'],
  ].map(([name, payload]): Case => {
    const env = { ...VALID, supabaseAnonKey: jwtRaw(payload) };
    return { name: `valid JSON: ${name}`, env, expected: env };
  }),
];

const SECRET_SHAPED_VALUES = [
  jwt({ role: 'service_role', ref: 'abcdefghijklmnopqrst' }),
  'sb_secret_simulated',
];

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const configResponse = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

describe('validation in the browser', () => {
  it.each(CASES)('$name', async ({ env, problem, expected }) => {
    const { parseRuntimeConfig, RuntimeConfigError } = await import('../src/config/runtimeConfig');
    if (expected) {
      expect(parseRuntimeConfig(env)).toEqual(expected);
      return;
    }
    let error: unknown;
    try { parseRuntimeConfig(env); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(RuntimeConfigError);
    expect((error as Error).message).toMatch(problem!);
  });

  it('refuses extra fields, so a secret cannot travel in the file', async () => {
    const { parseRuntimeConfig } = await import('../src/config/runtimeConfig');
    expect(() => parseRuntimeConfig({ ...VALID, serviceRoleKey: 'x' })).toThrow(/serviceRoleKey/);
  });

  it.each([[null], ['text'], [[]], [42]])('refuses content that is not an object: %j', async (raw) => {
    const { parseRuntimeConfig } = await import('../src/config/runtimeConfig');
    expect(() => parseRuntimeConfig(raw)).toThrow(/objeto JSON/);
  });

  it.each(SECRET_SHAPED_VALUES)('never repeats a refused key in the message', async (key) => {
    const { parseRuntimeConfig } = await import('../src/config/runtimeConfig');
    let message = '';
    try { parseRuntimeConfig({ ...VALID, supabaseAnonKey: key }); } catch (error) { message = (error as Error).message; }
    expect(message).not.toBe('');
    expect(message).not.toContain(key);
  });
});

const shell = spawnSync('sh', ['-c', 'command -v jq']);
const script = 'docker/40-runtime-config.sh';

// Skipped on a machine without sh and jq. In CI they must exist, so this fails there instead.
describe.skipIf(shell.status !== 0 && !process.env.CI)('validation when the container starts', () => {
  let dir: string;
  let output: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'runtime-config-'));
    output = join(dir, 'runtime-config.json').replace(/\\/g, '/');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // Only PATH and the three variables: the script must not depend on anything else.
  const run = (env: Env, extra: Record<string, string> = {}) => spawnSync('sh', [script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      RUNTIME_CONFIG_OUTPUT: output,
      ...(env.apiUrl === undefined ? {} : { PUBLIC_API_URL: env.apiUrl }),
      ...(env.supabaseUrl === undefined ? {} : { PUBLIC_SUPABASE_URL: env.supabaseUrl }),
      ...(env.supabaseAnonKey === undefined ? {} : { PUBLIC_SUPABASE_ANON_KEY: env.supabaseAnonKey }),
      ...extra,
    },
  });

  it.each(CASES)('agrees with the browser: $name', async ({ env, problem, expected }) => {
    const { parseRuntimeConfig } = await import('../src/config/runtimeConfig');
    const result = run(env);
    if (expected) {
      expect(result.status, result.stderr).toBe(0);
      const generated = JSON.parse(readFileSync(output, 'utf8'));
      expect(generated).toEqual(expected);
      expect(parseRuntimeConfig(generated)).toEqual(expected);
    } else {
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(problem!);
      expect(existsSync(output)).toBe(false);
    }
  });

  it('removes a previous file when the new configuration is refused', () => {
    writeFileSync(output, '{"apiUrl":"/old"}');
    expect(run({ ...VALID, apiUrl: undefined }).status).toBe(1);
    expect(existsSync(output)).toBe(false);
  });

  it.each(SECRET_SHAPED_VALUES)('never prints or publishes a refused key', (key) => {
    const result = run({ ...VALID, supabaseAnonKey: key });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(key);
    expect(existsSync(output)).toBe(false);
  });

  it('ignores the backend secrets even when they are present', () => {
    const result = run(VALID, { SUPABASE_SERVICE_ROLE_KEY: 'simulated-service-role', JWT_SECRET: 'simulated-jwt-secret' });
    expect(result.status, result.stderr).toBe(0);
    const generated = readFileSync(output, 'utf8');
    expect(generated).not.toContain('simulated-service-role');
    expect(generated).not.toContain('simulated-jwt-secret');
    expect(Object.keys(JSON.parse(generated)).sort()).toEqual(['apiUrl', 'supabaseAnonKey', 'supabaseUrl']);
  });
});

describe('loading the configuration', () => {
  it('reads the file without cache and returns the validated values', async () => {
    const fetchMock = configResponse(JSON.stringify(VALID));
    vi.stubGlobal('fetch', fetchMock);
    const { loadRuntimeConfig, getRuntimeConfig } = await import('../src/config/runtimeConfig');
    await expect(loadRuntimeConfig()).resolves.toEqual(VALID);
    expect(getRuntimeConfig()).toEqual(VALID);
    expect(fetchMock).toHaveBeenCalledWith('/runtime-config.json', expect.objectContaining({ cache: 'no-store' }));
  });

  it.each([
    ['a missing file', configResponse('not found', 404), /404/],
    ['the problems listed by the dev server', configResponse('{"problems":["PUBLIC_API_URL é obrigatório."]}', 500), /PUBLIC_API_URL é obrigatório/],
    ['an error body with unexpected problems', configResponse('{"problems":[{"key":"x"}]}', 500), /status 500/],
    ['the SPA fallback answering with HTML', configResponse('<!doctype html><html></html>'), /JSON válido/],
    ['an unreachable server', vi.fn(async () => { throw new TypeError('network'); }), /baixar/],
    ['empty values', configResponse('{"apiUrl":"","supabaseUrl":"","supabaseAnonKey":""}'), /obrigatório/],
  ])('fails clearly for %s', async (_name, fetchMock, message) => {
    vi.stubGlobal('fetch', fetchMock);
    const { loadRuntimeConfig, getRuntimeConfig } = await import('../src/config/runtimeConfig');
    await expect(loadRuntimeConfig()).rejects.toThrow(message);
    expect(() => getRuntimeConfig()).toThrow(/antes de ser carregada/);
  });
});

describe('clients', () => {
  it('cannot be created before the configuration is loaded', async () => {
    createClient.mockClear();
    await expect(import('../src/services/api')).rejects.toThrow(/antes de ser carregada/);
    await expect(import('../src/lib/supabase')).rejects.toThrow(/antes de ser carregada/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ['installation A', { apiUrl: 'https://api.a.example.test/api', supabaseUrl: 'https://realtime-a.example.test', supabaseAnonKey: jwt({ role: 'anon' }) }],
    ['installation B', { apiUrl: '/api', supabaseUrl: 'https://realtime-b.example.test', supabaseAnonKey: 'sb_publishable_simulated' }],
  ])('use the destination of %s', async (_name, config) => {
    createClient.mockClear();
    vi.stubGlobal('fetch', configResponse(JSON.stringify(config)));
    const { loadRuntimeConfig } = await import('../src/config/runtimeConfig');
    await loadRuntimeConfig();

    const { default: api } = await import('../src/services/api');
    await import('../src/lib/supabase');

    expect(api.defaults.baseURL).toBe(config.apiUrl);
    expect(createClient).toHaveBeenCalledWith(config.supabaseUrl, config.supabaseAnonKey, expect.anything());
  });
});

describe('startup', () => {
  const settle = () => vi.waitFor(() => {
    expect(document.getElementById('root')!.children.length + renderApp.mock.calls.length).toBeGreaterThan(0);
  });

  it('renders the application only after the configuration is valid', async () => {
    renderApp.mockClear();
    vi.stubGlobal('fetch', configResponse(JSON.stringify(VALID)));
    await import('../src/main');
    await settle();
    expect(renderApp).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows a clear error, opens no client and does not repeat the key', async () => {
    renderApp.mockClear();
    createClient.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = jwt({ role: 'service_role' });
    vi.stubGlobal('fetch', configResponse(JSON.stringify({ ...VALID, supabaseAnonKey: key })));

    await import('../src/main');
    await settle();

    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toMatch(/não está configurada corretamente/);
    expect(alert?.textContent).toMatch(/service_role/);
    expect(document.body.innerHTML).not.toContain(key);
    expect(renderApp).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('the artifact carries no installation value', () => {
  const sourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });

  it('the source does not read build-time configuration or fall back to a destination', () => {
    for (const file of sourceFiles('src')) {
      const content = readFileSync(file, 'utf8');
      expect(content, file).not.toMatch(/import\.meta\.env\.VITE_/);
      expect(content, file).not.toMatch(/localhost:3001/);
      expect(content, file).not.toMatch(/\.supabase\.co['"`]/);
    }
  });

  it('the image takes no configuration at build time', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    expect(dockerfile).not.toMatch(/^\s*(ARG|ENV)\s/m);
    expect(dockerfile).not.toMatch(/VITE_/);
    expect(dockerfile).toMatch(/40-runtime-config\.sh/);
    expect(dockerfile).toMatch(/apk add --no-cache jq/);
  });

  describe('bundle check', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bundle-check-')); mkdirSync(join(dir, 'assets')); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));
    const check = () => spawnSync(process.execPath, ['scripts/check-public-bundle.mjs', dir], { encoding: 'utf8' });

    it('accepts a build without installation values', () => {
      writeFileSync(join(dir, 'assets', 'app.js'), 'fetch("/runtime-config.json")');
      expect(check().status).toBe(0);
    });

    it.each([
      ['a JWT', ANON_KEY],
      ['a Supabase project URL', SIMULATED_URL],
      ['the development API', 'http://localhost:3001/api'],
    ])('rejects %s without printing it', (_name, value) => {
      writeFileSync(join(dir, 'assets', 'app.js'), `const x = "${value}"`);
      const result = check();
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toContain(value);
    });

    it('rejects a build that brings its own runtime-config.json', () => {
      writeFileSync(join(dir, 'runtime-config.json'), '{}');
      expect(check().status).toBe(1);
    });
  });
});
