import type { RestaurantConfig } from '../types';

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const formatCnpj = (value?: string | null) => {
  const digits = onlyDigits(value || '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

export function buildSettingsPayload(config: Partial<RestaurantConfig>): Partial<RestaurantConfig> {
  const groupedItemDescription = String(
    config.nfceGroupedItemDescription ?? 'REFEICAO'
  ).trim();

  return {
    ...config,
    cnpj: config.cnpj ? onlyDigits(config.cnpj).slice(0, 14) : config.cnpj,
    nfceGroupedItemDescription: groupedItemDescription || 'REFEICAO',
  };
}