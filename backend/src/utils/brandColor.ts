// Cor principal configurável por instalação (Etapa 1B.7).
//
// Este arquivo existe em dois lugares, com conteúdo idêntico:
//   backend/src/utils/brandColor.ts   (recusa a cor no PUT /api/config)
//   frontend/src/theme/brandColor.ts  (aplica os tokens e mostra a prévia)
// backend/tests/brand-color.test.cjs confere que os dois são iguais.
//
// A partir de uma cor (#rrggbb), deriva os tokens `primary` dos temas claro e
// escuro e confere o contraste das combinações de texto e fundo que as telas
// realmente usam. Sem cor configurada, nada é derivado: valem os valores
// padrão de frontend/src/index.css (laranja).

export const BRAND_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

/** WCAG 2.1 AA para texto normal (1.4.3). */
export const MIN_TEXT_CONTRAST = 4.5;
/** WCAG 2.1 AA para componentes e ícones (1.4.11). */
export const MIN_NON_TEXT_CONTRAST = 3;

export type Rgb = readonly [number, number, number];

export type BrandTokenName =
  | 'primary'
  | 'primary-hover'
  | 'primary-subtle'
  | 'primary-strong'
  | 'primary-fg'
  | 'primary-50'
  | 'primary-100'
  | 'primary-200'
  | 'primary-300'
  | 'primary-400'
  | 'primary-500'
  | 'primary-600'
  | 'primary-700'
  | 'primary-800'
  | 'primary-900'
  | 'focus-ring'
  | 'sidebar-item-active';

export type BrandTheme = 'light' | 'dark';

export interface BrandTokens {
  light: Record<BrandTokenName, Rgb>;
  /** Só os tokens que o tema escuro redefine; a paleta 50–900 é a mesma. */
  dark: Partial<Record<BrandTokenName, Rgb>>;
}

export interface ContrastFailure {
  theme: BrandTheme;
  usage: string;
  ratio: number;
  minimum: number;
}

export interface BrandColorEvaluation {
  color: string;
  tokens: BrandTokens;
  failures: ContrastFailure[];
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

// Fundos neutros fixos de frontend/src/index.css, que a cor não altera.
const LIGHT_SURFACE: Rgb = [255, 255, 255];
const LIGHT_CANVAS: Rgb = [241, 245, 249];
const LIGHT_SIDEBAR: Rgb = [15, 23, 42];
const DARK_SURFACE: Rgb = [15, 23, 42];
const DARK_CANVAS: Rgb = [2, 6, 23];
const DARK_SIDEBAR: Rgb = [2, 6, 23];
const DARK_TEXT: Rgb = [15, 23, 42];

/** Aceita `#rrggbb`, com ou sem espaços e em maiúsculas; devolve minúsculo ou null. */
export function normalizeBrandColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  return BRAND_COLOR_PATTERN.test(color) ? color : null;
}

export function hexToRgb(color: string): Rgb {
  return [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];
}

/** Mistura `from` com `to` na proporção `amount` (0 = from, 1 = to). */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((index) =>
    Math.round(from[index] + (to[index] - from[index]) * amount)
  ) as unknown as Rgb;
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([red, green, blue]: Rgb): number {
  return 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
}

export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Clareia `base` o mínimo, em passos de 5%, até ter `minimum` contra todos os fundos. */
function lightenUntil(base: Rgb, backgrounds: Rgb[], minimum: number): Rgb {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(base, WHITE, step / 20);
    if (backgrounds.every((background) => contrastRatio(candidate, background) >= minimum)) {
      return candidate;
    }
  }
  return WHITE;
}

export function deriveBrandTokens(color: string): BrandTokens {
  const base = hexToRgb(color);
  const tint = (amount: number) => mix(base, WHITE, amount);
  const shade = (amount: number) => mix(base, BLACK, amount);

  // Proporções tiradas da paleta laranja padrão (primary-600 = cor escolhida).
  const light: Record<BrandTokenName, Rgb> = {
    primary: base,
    'primary-hover': shade(0.17),
    'primary-subtle': tint(0.94),
    'primary-strong': shade(0.2),
    'primary-fg': WHITE,
    'primary-50': tint(0.94),
    'primary-100': tint(0.9),
    'primary-200': tint(0.7),
    'primary-300': tint(0.5),
    'primary-400': tint(0.28),
    'primary-500': tint(0.1),
    'primary-600': base,
    'primary-700': shade(0.2),
    'primary-800': shade(0.38),
    'primary-900': shade(0.48),
    'focus-ring': tint(0.1),
    // A barra lateral é escura também no tema claro: o ícone ativo usa a
    // variante clara da cor, como no tema escuro.
    'sidebar-item-active': lightenUntil(base, [LIGHT_SIDEBAR], MIN_NON_TEXT_CONTRAST),
  };

  // No escuro, a cor principal aparece como texto sobre fundo escuro e como
  // fundo de botão. As duas exigências só cabem juntas com texto escuro no
  // botão, por isso `primary-fg` vira escuro neste tema.
  const darkPrimary = lightenUntil(base, [DARK_SURFACE, DARK_CANVAS], MIN_TEXT_CONTRAST);
  const darkSubtle = mix(DARK_SURFACE, base, 0.25);
  const dark: Partial<Record<BrandTokenName, Rgb>> = {
    primary: darkPrimary,
    'primary-hover': mix(darkPrimary, WHITE, 0.12),
    'primary-subtle': darkSubtle,
    'primary-strong': lightenUntil(base, [darkSubtle], MIN_TEXT_CONTRAST),
    'primary-fg': DARK_TEXT,
    'focus-ring': darkPrimary,
    'sidebar-item-active': lightenUntil(base, [DARK_SIDEBAR], MIN_NON_TEXT_CONTRAST),
  };

  return { light, dark };
}

interface UsagePair {
  theme: BrandTheme;
  usage: string;
  text: Rgb;
  background: Rgb;
  minimum: number;
}

/** Combinações usadas nas telas (levantamento da Etapa 1B.7). */
function usagePairs({ light, dark }: BrandTokens): UsagePair[] {
  const d = { ...light, ...dark } as Record<BrandTokenName, Rgb>;
  const text = MIN_TEXT_CONTRAST;
  return [
    { theme: 'light', usage: 'texto do botão principal', text: light['primary-fg'], background: light.primary, minimum: text },
    { theme: 'light', usage: 'texto do botão principal com o cursor em cima', text: light['primary-fg'], background: light['primary-hover'], minimum: text },
    { theme: 'light', usage: 'texto branco nos botões e etiquetas da cor principal', text: WHITE, background: light['primary-600'], minimum: text },
    { theme: 'light', usage: 'texto branco no botão com o cursor em cima', text: WHITE, background: light['primary-700'], minimum: text },
    { theme: 'light', usage: 'links e valores na cor principal sobre fundo branco', text: light.primary, background: LIGHT_SURFACE, minimum: text },
    { theme: 'light', usage: 'links e valores na cor principal sobre o fundo da página', text: light.primary, background: LIGHT_CANVAS, minimum: text },
    { theme: 'light', usage: 'texto na cor principal sobre o fundo claro da cor', text: light['primary-600'], background: light['primary-50'], minimum: text },
    { theme: 'light', usage: 'texto escuro da cor sobre o fundo claro da cor', text: light['primary-700'], background: light['primary-100'], minimum: text },
    { theme: 'light', usage: 'etiqueta da cor principal', text: light['primary-strong'], background: light['primary-subtle'], minimum: text },
    { theme: 'light', usage: 'subtítulo claro sobre o cabeçalho colorido', text: light['primary-100'], background: light['primary-600'], minimum: text },
    { theme: 'light', usage: 'rótulo do tipo do pedido sobre fundo branco', text: light['primary-600'], background: LIGHT_SURFACE, minimum: text },
    { theme: 'light', usage: 'link "Cadastrar cliente" do painel fiscal sobre fundo branco', text: light['primary-700'], background: LIGHT_SURFACE, minimum: text },
    { theme: 'light', usage: 'ícone "Editar Pedido" com o cursor em cima', text: light['primary-600'], background: light['primary-50'], minimum: MIN_NON_TEXT_CONTRAST },
    { theme: 'light', usage: 'ícone ativo da barra lateral', text: light['sidebar-item-active'], background: LIGHT_SIDEBAR, minimum: MIN_NON_TEXT_CONTRAST },
    { theme: 'dark', usage: 'texto do botão principal', text: d['primary-fg'], background: d.primary, minimum: text },
    { theme: 'dark', usage: 'texto do botão principal com o cursor em cima', text: d['primary-fg'], background: d['primary-hover'], minimum: text },
    { theme: 'dark', usage: 'links e valores na cor principal sobre o fundo escuro', text: d.primary, background: DARK_SURFACE, minimum: text },
    { theme: 'dark', usage: 'links e valores na cor principal sobre o fundo da página', text: d.primary, background: DARK_CANVAS, minimum: text },
    { theme: 'dark', usage: 'etiqueta da cor principal', text: d['primary-strong'], background: d['primary-subtle'], minimum: text },
    { theme: 'dark', usage: 'ícone ativo da barra lateral', text: d['sidebar-item-active'], background: DARK_SIDEBAR, minimum: MIN_NON_TEXT_CONTRAST },
  ];
}

export function evaluateBrandColor(color: string): BrandColorEvaluation {
  const tokens = deriveBrandTokens(color);
  const failures = usagePairs(tokens)
    .map((pair) => ({
      theme: pair.theme,
      usage: pair.usage,
      minimum: pair.minimum,
      ratio: Math.floor(contrastRatio(pair.text, pair.background) * 100) / 100,
    }))
    .filter((pair) => pair.ratio < pair.minimum);
  return { color, tokens, failures };
}

const formatRatio = (ratio: number) => ratio.toFixed(2).replace('.', ',');

/** Mensagem curta, para a tela e para a resposta da API. */
export function describeContrastFailures(failures: ContrastFailure[]): string {
  const first = failures[0];
  if (!first) return '';
  const theme = first.theme === 'light' ? 'tema claro' : 'tema escuro';
  const more = failures.length > 1 ? ` (e mais ${failures.length - 1} combinação(ões))` : '';
  return `Contraste insuficiente no ${theme}, ${first.usage}: ${formatRatio(first.ratio)}:1, mínimo ${formatRatio(first.minimum)}:1${more}. Escolha uma cor mais escura.`;
}
