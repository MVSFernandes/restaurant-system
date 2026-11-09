import { describeContrastFailures, evaluateBrandColor, normalizeBrandColor } from './brandColor';

// Laranja de fábrica (primary-600 de index.css), mostrado quando não há cor.
export const DEFAULT_BRAND_COLOR = '#ea580c';

/** Erro da cor para o formulário de Configurações; undefined quando pode salvar. */
export function brandColorError(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const color = normalizeBrandColor(value);
  if (!color) return 'Informe a cor no formato #rrggbb.';
  const { failures } = evaluateBrandColor(color);
  return failures.length > 0 ? describeContrastFailures(failures) : undefined;
}
