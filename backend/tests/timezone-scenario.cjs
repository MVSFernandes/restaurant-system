process.env.SUPABASE_URL = 'https://timezone.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const {
  dateInputRangeUtc,
  isWithinUtcRange,
  weekdayInTimeZone,
} = require('../src/utils/datetime');
const { periodToDates } = require('../src/services/finance.service');

const now = new Date('2026-09-30T02:55:00.000Z'); // 29/09, 23h55 no restaurante
const instants = [
  ['before-day', '2026-09-29T02:59:59.999Z', 100],
  ['day-start', '2026-09-29T03:00:00.000Z', 10],
  ['evening-sale', '2026-09-30T00:30:00.000Z', 20],
  ['late-sale', '2026-09-30T02:50:00.000Z', 30],
  ['last-millisecond', '2026-09-30T02:59:59.999Z', 40],
  ['next-day', '2026-09-30T03:10:00.000Z', 50],
  ['last-week', '2026-09-24T12:00:00.000Z', 60],
  ['last-month', '2026-09-10T12:00:00.000Z', 70],
  ['older', '2025-01-01T12:00:00.000Z', 80],
].map(([id, iso, amount]) => ({ id, instant: new Date(iso), amount }));

const reportInstants = instants.filter(({ id }) => !['last-millisecond', 'next-day'].includes(id));
const totalFor = (start, endExclusive, rows = reportInstants) => rows
  .filter(({ instant }) => instant >= start && instant < endExclusive)
  .reduce((total, row) => total + row.amount, 0);

const newPeriods = Object.fromEntries(['today', 'week', 'month', 'year'].map((period) => {
  const dates = periodToDates(period, now);
  return [period, {
    ...dates,
    total: totalFor(new Date(dates.startDate), new Date(dates.endDate)),
  }];
}));

function legacyPeriod(period) {
  const start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(now.getDate() - 7);
  if (period === 'month') start.setMonth(now.getMonth() - 1);
  if (period === 'year') start.setFullYear(now.getFullYear() - 1);
  return {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
    total: totalFor(start, now),
  };
}
const legacyPeriods = Object.fromEntries(['today', 'week', 'month', 'year'].map((period) => [period, legacyPeriod(period)]));

const selectedDate = dateInputRangeUtc('2026-09-29');
const newHistoryIds = instants
  .filter(({ instant }) => isWithinUtcRange(instant, selectedDate))
  .map(({ id }) => id);
const legacyHistoryStart = new Date('2026-09-29T00:00:00.000-03:00');
const legacyHistoryEnd = new Date('2026-09-29T23:59:59.999-03:00');
const legacyHistoryIds = instants
  .filter(({ instant }) => instant >= legacyHistoryStart && instant <= legacyHistoryEnd)
  .map(({ id }) => id);

process.stdout.write(JSON.stringify({
  processTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dayRange: {
    start: selectedDate.start.toISOString(),
    endExclusive: selectedDate.endExclusive.toISOString(),
  },
  newPeriods,
  legacyPeriods,
  newHistoryIds,
  legacyHistoryIds,
  cashClosureIds: newHistoryIds,
  orderHistoryIds: newHistoryIds,
  marmitaWeekday: weekdayInTimeZone(now),
}));
