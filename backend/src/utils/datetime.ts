import { RESTAURANT_TIMEZONE } from '../config/timezone';

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type UtcRange = {
  start: Date;
  endExclusive: Date;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function zonedDateTimeParts(
  instant: Date,
  timeZone = RESTAURANT_TIMEZONE
): ZonedDateTimeParts {
  const values = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function wallClockToUtc(
  parts: ZonedDateTimeParts,
  timeZone = RESTAURANT_TIMEZONE,
  millisecond = 0
): Date {
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    millisecond
  );
  let candidate = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedDateTimeParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      millisecond
    );
    const correction = desiredAsUtc - observedAsUtc;
    if (correction === 0) return new Date(candidate);
    candidate += correction;
  }

  throw new Error(`Não foi possível converter a data para o fuso ${timeZone}.`);
}

function dateOnlyParts(value: string): ZonedDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Data inválida: "${value}". Use o formato AAAA-MM-DD.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) {
    throw new Error(`Data inválida: "${value}". Use uma data existente.`);
  }

  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

function nextCalendarDay(parts: ZonedDateTimeParts): ZonedDateTimeParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

export function dayRangeUtc(
  instant: Date,
  timeZone = RESTAURANT_TIMEZONE
): UtcRange {
  const local = zonedDateTimeParts(instant, timeZone);
  const startParts = { ...local, hour: 0, minute: 0, second: 0 };
  return {
    start: wallClockToUtc(startParts, timeZone),
    endExclusive: wallClockToUtc(nextCalendarDay(startParts), timeZone),
  };
}

export function dateInputRangeUtc(
  value: string,
  timeZone = RESTAURANT_TIMEZONE
): UtcRange {
  const startParts = dateOnlyParts(value);
  return {
    start: wallClockToUtc(startParts, timeZone),
    endExclusive: wallClockToUtc(nextCalendarDay(startParts), timeZone),
  };
}

export function subtractCalendarPeriodUtc(
  instant: Date,
  amount: { days?: number; months?: number; years?: number },
  timeZone = RESTAURANT_TIMEZONE
): Date {
  const local = zonedDateTimeParts(instant, timeZone);
  const wallClock = new Date(Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
    instant.getUTCMilliseconds()
  ));

  if (amount.days) wallClock.setUTCDate(wallClock.getUTCDate() - amount.days);
  if (amount.months) wallClock.setUTCMonth(wallClock.getUTCMonth() - amount.months);
  if (amount.years) wallClock.setUTCFullYear(wallClock.getUTCFullYear() - amount.years);

  return wallClockToUtc({
    year: wallClock.getUTCFullYear(),
    month: wallClock.getUTCMonth() + 1,
    day: wallClock.getUTCDate(),
    hour: wallClock.getUTCHours(),
    minute: wallClock.getUTCMinutes(),
    second: wallClock.getUTCSeconds(),
  }, timeZone, wallClock.getUTCMilliseconds());
}

export function weekdayInTimeZone(
  instant: Date,
  timeZone = RESTAURANT_TIMEZONE
): number {
  const local = zonedDateTimeParts(instant, timeZone);
  return new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
}

export function isWithinUtcRange(instant: Date, range: UtcRange): boolean {
  return instant >= range.start && instant < range.endExclusive;
}
