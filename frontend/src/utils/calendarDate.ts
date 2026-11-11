// Datas de calendário (vencimentos): o dia vale como está escrito, sem fuso.
//
// A API grava o vencimento escolhido no formulário (AAAA-MM-DD) como meia-noite
// UTC e pode devolvê-lo como "2026-11-11T00:00:00.000Z". Passar esse valor por
// `new Date()` no navegador em São Paulo dá 10/11 às 21h: um dia a menos. Aqui
// o dia é lido do próprio texto, e "hoje" vem do fuso da instalação
// (RESTAURANT_TIMEZONE no backend, entregue em /config/branding como timeZone).

/** Mesmo padrão do backend quando a instalação não informa o fuso. */
export const DEFAULT_RESTAURANT_TIME_ZONE = 'America/Sao_Paulo';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** AAAA-MM-DD do vencimento, aceitando data pura ou ISO com horário. */
export function calendarDateKey(value: string): string {
  const match = CALENDAR_DATE.exec(value ?? '');
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

/** DD/MM/AAAA do vencimento. */
export function formatCalendarDate(value: string): string {
  const key = calendarDateKey(value);
  if (!key) return '-';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

const todayFormatters = new Map<string, Intl.DateTimeFormat>();

function todayFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = todayFormatters.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    todayFormatters.set(timeZone, formatter);
    return formatter;
  } catch {
    return null;
  }
}

/** Fuso informado pela instalação; ausente ou inválido, America/Sao_Paulo. */
export function resolveRestaurantTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim();
  return candidate && todayFormatter(candidate) ? candidate : DEFAULT_RESTAURANT_TIME_ZONE;
}

/** AAAA-MM-DD de hoje no fuso da instalação. */
export function restaurantTodayKey(now: Date = new Date(), timeZone?: string | null): string {
  return todayFormatter(resolveRestaurantTimeZone(timeZone))!.format(now);
}

export type DueStatus = 'overdue' | 'today' | 'upcoming';

/** Situação do vencimento em relação a `today` (AAAA-MM-DD). */
export function dueStatus(dueDate: string, today: string): DueStatus {
  const key = calendarDateKey(dueDate);
  // Sem data legível não se afirma atraso (como antes, com Date inválida).
  if (!key) return 'upcoming';
  if (key < today) return 'overdue';
  if (key === today) return 'today';
  return 'upcoming';
}
