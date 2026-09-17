const { test } = require('node:test');
const assert = require('node:assert/strict');

const { formatBRL } = require('../src/utils/currency');

test('formats integers, decimals, thousands, zero and numeric strings as BRL', () => {
  assert.equal(formatBRL(20), 'R$ 20,00');
  assert.equal(formatBRL(20.5), 'R$ 20,50');
  assert.equal(formatBRL(1234.56), 'R$ 1.234,56');
  assert.equal(formatBRL(0), 'R$ 0,00');
  assert.equal(formatBRL('42.9'), 'R$ 42,90');
});

test('falls back to zero for absent or invalid values', () => {
  for (const value of [null, undefined, '', 'invalid', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatBRL(value), 'R$ 0,00');
  }
});

test('rounds currency values and normalizes the separator after R$ to a regular space', () => {
  const formatted = formatBRL(10.005);

  assert.equal(formatted, 'R$ 10,01');
  assert.equal(formatted.charCodeAt(2), 32);
  assert.equal(formatted.includes('\u00A0'), false);
  assert.equal(formatted.includes('\u202F'), false);
});
