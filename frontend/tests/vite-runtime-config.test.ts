// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

// Starts the real Vite dev server and asks the real endpoint. The values are
// fictitious and come from the process environment, which takes precedence over
// the local .env files. No browser runs, so nothing connects to them.
const b64 = (value: string) => Buffer.from(value).toString('base64url');
const jwt = (payload: string) => `${b64('{"alg":"none"}')}.${b64(payload)}.simulated-signature`;

const API_URL = 'http://localhost:3001/api';
const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';

const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as { port: number };
    probe.close(() => resolve(port));
  });
});

let server: ChildProcess | null = null;

afterEach(async () => {
  if (!server) return;
  const closing = new Promise((resolve) => server!.once('exit', resolve));
  server.kill();
  await closing;
  server = null;
});

async function startVite(supabaseAnonKey: string) {
  const port = await freePort();
  let logs = '';
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    env: { ...process.env, VITE_API_URL: API_URL, VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: supabaseAnonKey },
  });
  server.stdout!.on('data', (chunk) => { logs += chunk; });
  server.stderr!.on('data', (chunk) => { logs += chunk; });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      await fetch(`${base}/`);
      break;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return { base, logs: () => logs };
}

// Everything a browser could read from the server, besides the endpoint.
const OTHER_PATHS = ['/', '/src/main.tsx', '/src/config/runtimeConfig.ts', '/@vite/env'];

describe('runtime-config.json served by the real Vite dev server', () => {
  it('serves a valid public configuration', async () => {
    const key = jwt('{"role":"anon","ref":"abcdefghijklmnopqrst"}');
    const { base } = await startVite(key);
    const response = await fetch(`${base}/runtime-config.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ apiUrl: API_URL, supabaseUrl: SUPABASE_URL, supabaseAnonKey: key });
  }, 30000);

  it.each([
    ['service_role', jwt('{"role":"service_role"}'), /service_role/],
    ['service_role with metadata.role anon', jwt('{"role":"service_role","metadata":{"role":"anon"}}'), /service_role/],
    ['sb_secret_', 'sb_secret_simulated-value', /chave secreta/],
    ['ref of another project with matching metadata.ref', jwt('{"role":"anon","ref":"zzzzzzzzzzzzzzzzzzzz","metadata":{"ref":"abcdefghijklmnopqrst"}}'), /outro projeto/],
    ['malformed JSON', jwt('{"role":"anon"'), /formato/],
    ['the nan literal', jwt('{"role":"anon","x":nan}'), /formato/],
  ])('refuses %s without exposing the key', async (_name, key, message) => {
    const { base, logs } = await startVite(key);

    const response = await fetch(`${base}/runtime-config.json`);
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain(key);
    expect(body).not.toContain(key.split('.')[1] || key);
    expect(JSON.parse(body).problems.join(' ')).toMatch(message);

    for (const path of OTHER_PATHS) {
      expect(await (await fetch(`${base}${path}`)).text(), path).not.toContain(key);
    }

    await expect.poll(logs).toMatch(message);
    expect(logs()).not.toContain(key);
    expect(logs()).not.toContain(key.split('.')[1] || key);
  }, 30000);
});
