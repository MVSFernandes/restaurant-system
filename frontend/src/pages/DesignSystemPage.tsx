import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const colorTokens = [
  ['bg-canvas', '--color-bg-canvas', '#f1f5f9', '#020617'],
  ['bg-surface', '--color-bg-surface', '#ffffff', '#0f172a'],
  ['bg-surface-sunken', '--color-bg-surface-sunken', '#f8fafc', '#1e293b'],
  ['bg-surface-hover', '--color-bg-surface-hover', '#f1f5f9', '#1e293b'],
  ['border-default', '--color-border-default', '#e2e8f0', '#1e293b'],
  ['border-strong', '--color-border-strong', '#cbd5e1', '#334155'],
  ['text-default', '--color-text-default', '#0f172a', '#f1f5f9'],
  ['text-muted', '--color-text-muted', '#475569', '#94a3b8'],
  ['text-subtle', '--color-text-subtle', '#64748b', '#64748b'],
  ['text-inverse', '--color-text-inverse', '#ffffff', '#0f172a'],
  ['primary', '--color-primary', '#ea580c', '#f97316'],
  ['primary-hover', '--color-primary-hover', '#c2410c', '#ea580c'],
  ['primary-subtle', '--color-primary-subtle', '#fff7ed', '#431407'],
  ['primary-fg', '--color-primary-fg', '#ffffff', '#ffffff'],
  ['danger', '--color-danger', '#dc2626', '#ef4444'],
  ['danger-subtle', '--color-danger-subtle', '#fef2f2', '#450a0a'],
  ['danger-fg', '--color-danger-fg', '#ffffff', '#ffffff'],
  ['success', '--color-success', '#059669', '#10b981'],
  ['success-subtle', '--color-success-subtle', '#ecfdf5', '#022c22'],
  ['warning', '--color-warning', '#f59e0b', '#fbbf24'],
  ['warning-subtle', '--color-warning-subtle', '#fffbeb', '#451a03'],
  ['info', '--color-info', '#2563eb', '#3b82f6'],
  ['info-subtle', '--color-info-subtle', '#eff6ff', '#172554'],
  ['focus-ring', '--color-focus-ring', '#f97316', '#fb923c'],
  ['sidebar-bg', '--color-sidebar-bg', '#0f172a', '#020617'],
  ['sidebar-fg', '--color-sidebar-fg', '#cbd5e1', '#cbd5e1'],
  ['sidebar-fg-active', '--color-sidebar-fg-active', '#ffffff', '#ffffff'],
  ['sidebar-item-active', '--color-sidebar-item-active', '#ea580c', '#f97316'],
  ['sidebar-item-hover', '--color-sidebar-item-hover', '#1e293b', '#0f172a'],
  ['sidebar-border', '--color-sidebar-border', '#1e293b', '#1e293b'],
] as const;

const typographyTokens = [
  ['text-display', 'Título de página', '30px / 36px · 700'],
  ['text-title', 'Título de seção grande', '24px / 32px · 600'],
  ['text-heading', 'Título de card', '18px / 26px · 600'],
  ['text-body-lg', 'Texto de destaque', '16px / 24px · 400'],
  ['text-body', 'Texto padrão', '14px / 20px · 400'],
  ['text-label', 'Rótulo de campo', '13px / 18px · 500'],
  ['text-caption', 'Texto auxiliar', '12px / 16px · 400'],
] as const;

const radiusTokens = [
  ['radius-sm', '6px', 'rounded-token-sm'],
  ['radius-md', '8px', 'rounded-token-md'],
  ['radius-lg', '12px', 'rounded-token-lg'],
  ['radius-xl', '16px', 'rounded-token-xl'],
] as const;

const shadowTokens = [
  ['shadow-xs', 'Card em repouso', 'shadow-token-xs'],
  ['shadow-sm', 'Card elevado, dropdown', 'shadow-token-sm'],
  ['shadow-md', 'Modal, popover', 'shadow-token-md'],
] as const;

const DesignSystemPage = () => {
  const [dark, setDark] = useState(false);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-full bg-canvas p-page text-default transition-colors">
        <div className="mx-auto max-w-6xl space-y-section">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-label font-semibold uppercase tracking-widest text-primary">Referência interna</p>
              <h1 className="text-display">Design System</h1>
              <p className="mt-2 text-body text-muted">Tokens visuais do Restaurant System.</p>
            </div>
            <div className="inline-flex self-start rounded-token-md border border-default bg-surface p-1 shadow-token-xs">
              <button type="button" onClick={() => setDark(false)} className={`inline-flex items-center gap-2 rounded-token-sm px-3 py-2 text-label ${!dark ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-hover'}`}>
                <Sun size={16} /> Claro
              </button>
              <button type="button" onClick={() => setDark(true)} className={`inline-flex items-center gap-2 rounded-token-sm px-3 py-2 text-label ${dark ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-hover'}`}>
                <Moon size={16} /> Escuro
              </button>
            </div>
          </header>

          <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
            <h2 className="text-title">Cores semânticas</h2>
            <p className="mt-1 text-body text-muted">Valores ativos no tema {dark ? 'escuro' : 'claro'}.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {colorTokens.map(([name, variable, light, darkValue]) => (
                <div key={name} className="flex items-center gap-3 rounded-token-md border border-default bg-surface-sunken p-3">
                  <span className="h-12 w-12 shrink-0 rounded-token-md border border-default" style={{ backgroundColor: `rgb(var(${variable}))` }} />
                  <span className="min-w-0">
                    <strong className="block truncate text-label">{name}</strong>
                    <span className="block font-mono text-caption text-muted">{dark ? darkValue : light}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
            <h2 className="text-title">Tipografia</h2>
            <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
              {typographyTokens.map(([name, example, details]) => (
                <div key={name} className="grid gap-2 py-4 md:grid-cols-[180px_1fr_180px] md:items-baseline">
                  <code className="text-caption text-primary">{name}</code>
                  <span className={name}>{example}</span>
                  <span className="text-caption text-muted md:text-right">{details}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-token-md bg-surface-sunken p-4">
              <span className="text-caption text-muted">Números tabulares</span>
              <p className="mt-1 text-heading tabular-nums">R$ 1.234,56 · 000123</p>
            </div>
          </section>

          <div className="grid gap-section lg:grid-cols-2">
            <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
              <h2 className="text-title">Raios</h2>
              <div className="mt-5 grid grid-cols-2 gap-4">
                {radiusTokens.map(([name, value, className]) => (
                  <div key={name} className={`border-2 border-primary bg-primary-subtle p-5 ${className}`}>
                    <strong className="block text-label">{name}</strong>
                    <span className="text-caption text-muted">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
              <h2 className="text-title">Sombras</h2>
              <div className="mt-5 space-y-4">
                {shadowTokens.map(([name, usage, className]) => (
                  <div key={name} className={`rounded-token-lg border border-default bg-surface p-5 ${className}`}>
                    <strong className="block text-label">{name}</strong>
                    <span className="text-caption text-muted">{usage}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignSystemPage;
