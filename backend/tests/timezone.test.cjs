const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

process.env.SUPABASE_URL = 'https://timezone.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
process.env.RESTAURANT_TIMEZONE = 'America/Sao_Paulo';

const backendDir = path.resolve(__dirname, '..');
const scenarioPath = path.join(__dirname, 'timezone-scenario.cjs');
const { dateInputRangeUtc } = require('../src/utils/datetime');
const { marmitaMenuService } = require('../src/services/domain.services');
const { marmitaMenuItemRepository } = require('../src/repositories/marmitaMenuItem.repository');

function runScenario(processTimeZone, restaurantTimeZone = 'America/Sao_Paulo') {
  const result = spawnSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', scenarioPath],
    {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        TZ: processTimeZone,
        RESTAURANT_TIMEZONE: restaurantTimeZone,
        SUPABASE_URL: 'https://timezone.example.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'test-only-key',
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('all backend date flows return the same result with the process in UTC or Brasilia', () => {
  const brasilia = runScenario('America/Sao_Paulo');
  const utc = runScenario('UTC');

  const comparable = ({ processTimeZone: _ignored, legacyPeriods: _legacy, legacyHistoryIds: _legacyHistory, ...value }) => value;
  assert.deepEqual(comparable(utc), comparable(brasilia));

  assert.deepEqual(brasilia.dayRange, {
    start: '2026-09-29T03:00:00.000Z',
    endExclusive: '2026-09-30T03:00:00.000Z',
  });
  assert.equal(brasilia.marmitaWeekday, 2);
});

test('Brasil keeps the same report, closure, history and marmita numbers as before', () => {
  const brasilia = runScenario('America/Sao_Paulo');

  for (const period of ['today', 'week', 'month', 'year']) {
    assert.equal(brasilia.newPeriods[period].total, brasilia.legacyPeriods[period].total, period);
  }
  for (const period of ['week', 'month', 'year']) {
    assert.equal(brasilia.newPeriods[period].startDate, brasilia.legacyPeriods[period].startDate, period);
    assert.equal(brasilia.newPeriods[period].endDate, brasilia.legacyPeriods[period].endDate, period);
  }

  assert.deepEqual(brasilia.orderHistoryIds, brasilia.legacyHistoryIds);
  assert.deepEqual(brasilia.cashClosureIds, brasilia.legacyHistoryIds);
  assert.deepEqual(brasilia.newHistoryIds, [
    'day-start',
    'evening-sale',
    'late-sale',
    'last-millisecond',
  ]);
  assert.equal(brasilia.marmitaWeekday, 2);
});

test('day range uses an exclusive next-midnight boundary, including DST days', () => {
  const regular = dateInputRangeUtc('2026-09-29');
  assert.equal(regular.start.toISOString(), '2026-09-29T03:00:00.000Z');
  assert.equal(regular.endExclusive.toISOString(), '2026-09-30T03:00:00.000Z');

  const daylightSavingChange = dateInputRangeUtc('2026-03-08', 'America/New_York');
  assert.equal(daylightSavingChange.start.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(daylightSavingChange.endExclusive.toISOString(), '2026-03-09T04:00:00.000Z');
  assert.equal(daylightSavingChange.endExclusive.getTime() - daylightSavingChange.start.getTime(), 23 * 60 * 60 * 1000);
});

test('invalid configured timezone stops startup with a clear error', () => {
  const result = spawnSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', '-e', "require('./src/config/timezone')"],
    {
      cwd: backendDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        RESTAURANT_TIMEZONE: 'Invalid/Restaurant',
      },
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /RESTAURANT_TIMEZONE inválido/);
});

test('marmita service selects the restaurant weekday through the central helper', async () => {
  const original = marmitaMenuItemRepository.findByDayOfWeek;
  const calls = [];
  marmitaMenuItemRepository.findByDayOfWeek = async (day) => {
    calls.push(day);
    return [{ id: 'tuesday-item' }];
  };

  try {
    const result = await marmitaMenuService.getTodayMenu(new Date('2026-09-30T02:55:00.000Z'));
    assert.deepEqual(calls, [2]);
    assert.equal(result[0].id, 'tuesday-item');
  } finally {
    marmitaMenuItemRepository.findByDayOfWeek = original;
  }
});
