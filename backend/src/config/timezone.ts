import dotenv from 'dotenv';

dotenv.config();

export const DEFAULT_RESTAURANT_TIMEZONE = 'America/Sao_Paulo';

export function resolveRestaurantTimeZone(value = process.env.RESTAURANT_TIMEZONE): string {
  const timeZone = value?.trim() || DEFAULT_RESTAURANT_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error(
      `RESTAURANT_TIMEZONE inválido: "${timeZone}". Informe um fuso IANA válido, como America/Sao_Paulo.`
    );
  }

  return timeZone;
}

export const RESTAURANT_TIMEZONE = resolveRestaurantTimeZone();
