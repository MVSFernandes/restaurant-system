// TEST ONLY. A tiny stand-in for the Supabase REST API (PostgREST) that only
// answers the installation marker read done at backend startup:
//   GET /rest/v1/app_installation?select=installation_id,environment&limit=2
// Used by tests/environment-startup.test.cjs and by the CI compose smoke test
// (docker-compose.ci.yml), where there is no real database. It holds no data
// and never accepts writes. Never point a real installation at it.
//
// Run directly:  node scripts/postgrest-marker-stub.cjs
//   STUB_PORT (default 54321), STUB_MODE (found | empty | table-missing |
//   server-error | forbidden), MARKER_INSTALLATION_ID, MARKER_ENVIRONMENT.
const http = require('node:http');

const MODES = ['found', 'empty', 'table-missing', 'server-error', 'forbidden'];

function startStub({ mode = 'found', marker = null, port = 0, host = '127.0.0.1', delayMs = 0 } = {}) {
  if (!MODES.includes(mode)) throw new Error(`Unknown stub mode: ${mode}`);
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, at: Date.now() });
    const send = (status, body) => setTimeout(() => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    }, req.url === '/health' ? 0 : delayMs);
    if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', stub: true });
    if (req.method !== 'GET' || !req.url.startsWith('/rest/v1/app_installation')) {
      return send(404, { code: 'STUB_NOT_SUPPORTED', message: 'This test stub only answers the installation marker read.' });
    }
    switch (mode) {
      case 'found':
        return send(200, [{ installation_id: marker.installationId, environment: marker.environment }]);
      case 'empty':
        return send(200, []);
      case 'table-missing':
        return send(404, {
          code: 'PGRST205',
          message: "Could not find the table 'public.app_installation' in the schema cache",
        });
      case 'server-error':
        return send(503, { code: 'STUB_UNAVAILABLE', message: 'Service unavailable' });
      case 'forbidden':
        return send(401, { code: '42501', message: 'permission denied for table app_installation' });
    }
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const { port: actualPort } = server.address();
      resolve({
        url: `http://${host}:${actualPort}`,
        requests,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

module.exports = { startStub, MODES };

if (require.main === module) {
  const mode = process.env.STUB_MODE || 'found';
  const marker = {
    installationId: process.env.MARKER_INSTALLATION_ID,
    environment: process.env.MARKER_ENVIRONMENT,
  };
  if (mode === 'found' && (!marker.installationId || !marker.environment)) {
    console.error('MARKER_INSTALLATION_ID and MARKER_ENVIRONMENT are required in mode "found".');
    process.exit(1);
  }
  startStub({ mode, marker, port: Number(process.env.STUB_PORT || 54321), host: '0.0.0.0' })
    .then(({ url }) => console.log(`[TEST STUB] installation marker stub on ${url} (mode ${mode})`));
}
