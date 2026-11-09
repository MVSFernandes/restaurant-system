import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/ui';
import { BrandingProvider } from '../src/contexts/BrandingProvider';
import RestaurantSettingsPage from '../src/pages/settings/RestaurantSettingsPage';
import { applyBrandTheme, BRAND_THEME_STYLE_ID, buildBrandThemeCss } from '../src/theme/applyBrandTheme';
import { contrastRatio, deriveBrandTokens, evaluateBrandColor } from '../src/theme/brandColor';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));

const root = path.resolve(__dirname, '..');
const brandStyle = () => document.getElementById(BRAND_THEME_STYLE_ID);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.get.mockReset();
  mocks.put.mockReset();
});

afterEach(() => {
  cleanup();
  brandStyle()?.remove();
  vi.restoreAllMocks();
});

describe('default palette stays the previous orange', () => {
  it('index.css defines primary-50..900 with the exact former Tailwind hex values', () => {
    const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
    const former: Record<string, string> = {
      50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c',
      500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12',
    };
    for (const [step, hex] of Object.entries(former)) {
      const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)).join(' ');
      expect(css).toContain(`--color-primary-${step}: ${rgb};`);
    }
  });

  it('Tailwind reads the scale from variables, so a configured color reaches every primary-N class', async () => {
    const config = (await import('../tailwind.config.js')).default as {
      theme: { extend: { colors: { primary: Record<string, string> } } };
    };
    for (const step of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']) {
      expect(config.theme.extend.colors.primary[step]).toBe(`rgb(var(--color-primary-${step}) / <alpha-value>)`);
    }
  });

  it('status colors are untouched: no status token is derived from the brand color', () => {
    const { light, dark } = deriveBrandTokens('#1d4ed8');
    for (const name of Object.keys({ ...light, ...dark })) {
      expect(name).not.toMatch(/danger|success|warning|info/);
    }
  });
});

describe('brand uses follow the configured color; attention uses stay orange (decisão de 2026-11-09)', () => {
  // Normaliza CRLF: o checkout no Windows pode trazer quebras de linha \r\n.
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

  it('PDV: "Editar Pedido" icon and order-type label use the brand tokens', () => {
    const orders = read('src/pages/pdv/OrdersPage.tsx');
    expect(orders).toContain('className="p-1 text-primary-600 hover:bg-primary-50 rounded"\n                        title="Editar Pedido"');
    expect(orders).toContain('<p className="text-xs font-bold tracking-wide text-primary-600 uppercase">');
    expect(orders).not.toContain('text-orange-600 hover:bg-orange-50 rounded');
    expect(orders).not.toContain('tracking-wide text-orange-600 uppercase');
  });

  it('fiscal panel: main button, icon and "Cadastrar cliente" link use the brand tokens', () => {
    const fiscal = read('src/components/fiscal/OrderFiscalDocumentPanel.tsx');
    expect(fiscal).toContain('bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700');
    expect(fiscal).toContain('<span className="rounded-lg bg-primary-100 p-2 text-primary-700"><ReceiptText size={20} /></span>');
    expect(fiscal).toContain('className="mt-2 text-sm font-semibold text-primary-700 underline"');
    expect(fiscal).not.toMatch(/orange-/);
  });

  it('attention and alert uses keep the current orange', () => {
    expect(read('src/components/modals/EditOrderModal.tsx')).toContain('text-orange-500 uppercase tracking-wider mb-1">Valor Fixo (R$)');
    expect(read('src/pages/pdv/OrdersPage.tsx')).toContain('bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 border border-orange-200');
    expect(read('src/pages/finance/CreditPage.tsx')).toContain('rounded-lg border border-orange-200 bg-orange-50 p-4');
    expect(read('src/pages/finance/StockItemsPage.tsx')).toContain('<Bell size={18} className="text-orange-600" />');
  });

  it('the default palette keeps the previous look: each replaced orange step has the same value', () => {
    const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
    // orange-50/100/600/700 do Tailwind = primary-50/100/600/700 padrão.
    for (const [step, rgb] of [['50', '255 247 237'], ['100', '255 237 213'], ['600', '234 88 12'], ['700', '194 65 12']]) {
      expect(css).toContain(`--color-primary-${step}: ${rgb};`);
    }
  });
});

describe('theme application', () => {
  it('writes both themes with higher specificity than index.css', () => {
    const css = buildBrandThemeCss('#1D4ED8');
    expect(css).toContain(':root:root {');
    expect(css).toContain('--color-primary: 29 78 216;');
    expect(css).toContain('--color-primary-600: 29 78 216;');
    expect(css).toContain('.dark.dark {');
    expect(css).toMatch(/\.dark\.dark \{[^}]*--color-primary-fg: 15 23 42;/);
  });

  it('refuses invalid or low-contrast values, keeping the default palette', () => {
    expect(buildBrandThemeCss('azul')).toBeNull();
    expect(buildBrandThemeCss('#facc15')).toBeNull();
    expect(buildBrandThemeCss(null)).toBeNull();
  });

  it('adds one style element, updates it, and removes it for null', () => {
    applyBrandTheme('#1d4ed8');
    expect(document.querySelectorAll(`#${BRAND_THEME_STYLE_ID}`)).toHaveLength(1);
    applyBrandTheme('#0f766e');
    expect(document.querySelectorAll(`#${BRAND_THEME_STYLE_ID}`)).toHaveLength(1);
    expect(brandStyle()?.textContent).toContain('--color-primary: 15 118 110;');
    applyBrandTheme(null);
    expect(brandStyle()).toBeNull();
  });

  it('every derived pair of an accepted color meets its minimum in both themes', () => {
    for (const color of ['#1d4ed8', '#7e22ce', '#0f766e', '#be123c', '#000000']) {
      expect(evaluateBrandColor(color).failures).toEqual([]);
    }
    const { dark } = deriveBrandTokens('#7e22ce');
    expect(contrastRatio(dark.primary!, [15, 23, 42])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('login side panel: the smaller texts keep 4.5:1 with a custom color', () => {
  const WHITE: [number, number, number] = [255, 255, 255];
  const blend = (color: number[], over: number[], alpha: number) => color.map((value, i) => Math.round(value * alpha + over[i] * (1 - alpha))) as [number, number, number];
  // Válida e perto do limite: a menor razão do branco sobre a cor principal entre as
  // cores aceitas fica em torno de 5,09:1 (busca em grade feita em 2026-11-09).
  const NEAR_LIMIT = '#666f7b';
  const nearLimit: [number, number, number] = [0x66, 0x6f, 0x7b];

  it('the near-limit color is accepted and is a real regression case for the old panel', () => {
    expect(evaluateBrandColor(NEAR_LIMIT).failures).toEqual([]);
    expect(contrastRatio(WHITE, nearLimit)).toBeLessThan(5.2);
    // Antes: texto branco a 80% e borda branca a 20% do círculo clareando o fundo.
    expect(contrastRatio(blend(WHITE, nearLimit, 0.8), nearLimit)).toBeLessThan(4.5);
    expect(contrastRatio(WHITE, blend(WHITE, nearLimit, 0.2))).toBeLessThan(4.5);
  });

  it('the brand theme makes the texts solid white and the decoration darken', () => {
    const css = buildBrandThemeCss(NEAR_LIMIT)!;
    expect(css).toMatch(/:root:root \{[^}]*--login-aside-text-alpha: 1;/);
    expect(css).toMatch(/:root:root \{[^}]*--login-aside-decor: 0 0 0;/);
  });

  it('with darkening decoration, every point behind the text keeps at least the white-on-primary ratio', () => {
    // Pior combinação de sobreposições pretas: textura (.28 e .18 a 20%), círculo (.1) e borda (.2).
    for (const alpha of [0, 0.056, 0.1, 0.2, 0.3]) {
      expect(contrastRatio(WHITE, blend([0, 0, 0], nearLimit, alpha))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('without a custom color, LoginPage falls back to the previous look (white decoration, 75% and 80% text)', () => {
    const login = fs.readFileSync(path.join(root, 'src/pages/auth/LoginPage.tsx'), 'utf8');
    expect(login).toContain('text-white/[var(--login-aside-text-alpha,0.75)]">Gestão integrada');
    expect(login).toContain('text-white/[var(--login-aside-text-alpha,0.8)]">Pedidos, estoque');
    expect(login).toContain('border-[rgb(var(--login-aside-decor,255_255_255)/0.2)] bg-[rgb(var(--login-aside-decor,255_255_255)/0.1)]');
    expect(login.match(/rgb\(var\(--login-aside-decor, 255 255 255\) \/ \.(28|18)\)/g)).toHaveLength(6);
    expect(login).not.toMatch(/rgba\(255,255,255/);
  });
});

describe('BrandingProvider', () => {
  function Shell() {
    const router = createMemoryRouter([{ path: '/', element: <p>Página</p> }]);
    return <BrandingProvider><RouterProvider router={router} /></BrandingProvider>;
  }

  it('applies the color from /config/branding', async () => {
    mocks.get.mockResolvedValue({ data: { name: 'Casa Azul', brandPrimaryColor: '#1d4ed8' } });
    render(<Shell />);
    await waitFor(() => expect(brandStyle()?.textContent).toContain('--color-primary: 29 78 216;'));
  });

  it('keeps the default orange when the API has no color (older backend or none chosen)', async () => {
    document.head.appendChild(Object.assign(document.createElement('style'), { id: BRAND_THEME_STYLE_ID }));
    mocks.get.mockResolvedValue({ data: { name: 'Casa' } });
    render(<Shell />);
    await waitFor(() => expect(brandStyle()).toBeNull());
  });
});

describe('Settings → Restaurante, cor da marca', () => {
  const baseConfig = { id: 'config-1', name: 'Casarão', nfceGroupedItemDescription: 'REFEICAO' };

  function renderPage(config: Record<string, unknown>) {
    mocks.get.mockResolvedValue({ data: config });
    mocks.put.mockResolvedValue({ data: {} });
    const router = createMemoryRouter([{ path: '/', element: <RestaurantSettingsPage /> }]);
    render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  }

  const colorText = () => screen.getByPlaceholderText('#ea580c') as HTMLInputElement;

  it('saves a valid color normalized and shows the light and dark previews', async () => {
    renderPage(baseConfig);
    await screen.findByText('Cor da marca');
    fireEvent.change(colorText(), { target: { value: '#1D4ED8' } });
    expect(screen.getByLabelText('Prévia no tema claro')).toBeTruthy();
    expect(screen.getByLabelText('Prévia no tema escuro')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put.mock.calls[0][1].brandPrimaryColor).toBe('#1d4ed8');
  });

  it('blocks saving a color without contrast and names the failing combination', async () => {
    renderPage(baseConfig);
    await screen.findByText('Cor da marca');
    fireEvent.change(colorText(), { target: { value: '#facc15' } });
    expect(screen.getByRole('alert').textContent).toMatch(/Contraste insuficiente no tema claro, texto do botão principal/);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('"Usar laranja padrão" sends null explicitly', async () => {
    renderPage({ ...baseConfig, brandPrimaryColor: '#0f766e' });
    await screen.findByText('Cor da marca');
    fireEvent.click(screen.getByRole('button', { name: 'Usar laranja padrão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    const payload = mocks.put.mock.calls[0][1];
    expect(Object.hasOwn(payload, 'brandPrimaryColor')).toBe(true);
    expect(payload.brandPrimaryColor).toBeNull();
  });

  it('with an older backend (no field in GET /config), the save omits the color, so the backend keeps it', async () => {
    renderPage(baseConfig);
    await screen.findByText('Cor da marca');
    fireEvent.change(screen.getByLabelText('Nome do Restaurante'), { target: { value: 'Casarão Novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(Object.hasOwn(mocks.put.mock.calls[0][1], 'brandPrimaryColor')).toBe(false);
  });
});
