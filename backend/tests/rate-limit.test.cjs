const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createApiRateLimiter } = require('../src/middlewares/rateLimit.middleware');

test('read budgets are isolated by verified user/resource and reset without a restart', async () => {
  const app = express();
  app.use('/api', createApiRateLimiter({ windowMs: 500, readLimit: 2, writeLimit: 2, publicLimit: 2 }));
  app.all('/api/*', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const token = id => jwt.sign({ id, role: 'CASHIER' }, process.env.JWT_SECRET || 'secret');
  const request = (path, id = 'operator', method = 'GET') => fetch(base + '/api/' + path, { method, headers: { Authorization: 'Bearer ' + token(id) } });
  try {
    assert.equal((await request('invoices/a')).status, 200);
    assert.equal((await request('invoices/b')).status, 200);
    const limited = await request('invoices/c');
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).message, 'Muitas requisições, aguarde alguns instantes');
    assert.ok(limited.headers.get('retry-after'));
    assert.equal(limited.headers.get('x-ratelimit-scope'), 'invoices:read');
    assert.equal((await request('tables')).status, 200);
    assert.equal((await request('cash-register/current')).status, 200);
    assert.equal((await request('orders/a/payment', 'operator', 'POST')).status, 200);
    assert.equal((await request('invoices/a', 'other')).status, 200);
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal((await request('invoices/a')).status, 200);
    for (let i = 0; i < 2; i++) assert.equal((await fetch(base + '/api/orders', { headers: { Authorization: 'Bearer forged-' + i } })).status, 200);
    assert.equal((await fetch(base + '/api/orders', { headers: { Authorization: 'Bearer forged-new' } })).status, 429);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
