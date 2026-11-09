import { deriveBrandTokens, evaluateBrandColor, normalizeBrandColor, type BrandTokenName, type Rgb } from './brandColor';

// Aplica a cor principal configurada (Etapa 1B.7) trocando as variáveis
// `--color-primary*` dos temas claro e escuro. Usa uma folha de estilo própria,
// e não o atributo style do <html>, porque o tema escuro redefine as variáveis
// na classe `.dark`, e um valor herdado do <html> não passaria por cima dela.
// Sem cor válida, a folha é removida e voltam os valores de index.css.

export const BRAND_THEME_STYLE_ID = 'brand-theme';

const toCssValue = ([red, green, blue]: Rgb) => `${red} ${green} ${blue}`;

function declarations(tokens: Partial<Record<BrandTokenName, Rgb>>) {
  return (Object.entries(tokens) as Array<[BrandTokenName, Rgb]>)
    .map(([name, value]) => `--color-${name}: ${toCssValue(value)};`)
    .join(' ');
}

// Painel lateral do login (LoginPage): a cor aceita garante 4,5:1 do branco sobre a
// cor principal, mas não sobre a cor principal clareada pela textura e pelos
// círculos brancos. Com cor personalizada, os textos menores ficam brancos sólidos
// e a decoração passa a escurecer. Sem esta folha, valem os valores de antes.
const LOGIN_ASIDE_DECLARATIONS = '--login-aside-text-alpha: 1; --login-aside-decor: 0 0 0;';

/** CSS dos dois temas para uma cor; null se a cor for inválida ou sem contraste. */
export function buildBrandThemeCss(color: unknown): string | null {
  const normalized = normalizeBrandColor(color);
  if (!normalized) return null;
  // A API já recusa cores sem contraste; esta conferência protege a tela de um
  // valor gravado por fora do fluxo de Configurações.
  if (evaluateBrandColor(normalized).failures.length > 0) return null;
  const { light, dark } = deriveBrandTokens(normalized);
  // `:root:root` e `.dark.dark` ganham de index.css pela especificidade, sem
  // depender da ordem das folhas no <head>.
  return `:root:root { ${declarations(light)} ${LOGIN_ASIDE_DECLARATIONS} } .dark.dark { ${declarations(dark)} }`;
}

export function applyBrandTheme(color: unknown, doc: Document = document): void {
  const css = buildBrandThemeCss(color);
  const existing = doc.getElementById(BRAND_THEME_STYLE_ID);
  if (!css) {
    existing?.remove();
    return;
  }
  const style = existing ?? doc.head.appendChild(doc.createElement('style'));
  style.id = BRAND_THEME_STYLE_ID;
  if (style.textContent !== css) style.textContent = css;
}
