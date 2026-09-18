/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        display: ['30px', { lineHeight: '36px', fontWeight: '700' }],
        title: ['24px', { lineHeight: '32px', fontWeight: '600' }],
        heading: ['18px', { lineHeight: '26px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        body: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        label: ['13px', { lineHeight: '18px', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
      },
      colors: {
        canvas: 'rgb(var(--color-bg-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--color-bg-surface) / <alpha-value>)',
          sunken: 'rgb(var(--color-bg-surface-sunken) / <alpha-value>)',
          hover: 'rgb(var(--color-bg-surface-hover) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
          subtle: 'rgb(var(--color-primary-subtle) / <alpha-value>)',
          fg: 'rgb(var(--color-primary-fg) / <alpha-value>)',
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          subtle: 'rgb(var(--color-danger-subtle) / <alpha-value>)',
          fg: 'rgb(var(--color-danger-fg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          subtle: 'rgb(var(--color-success-subtle) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          subtle: 'rgb(var(--color-warning-subtle) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          subtle: 'rgb(var(--color-info-subtle) / <alpha-value>)',
        },
        'focus-ring': 'rgb(var(--color-focus-ring) / <alpha-value>)',
        sidebar: {
          bg: 'rgb(var(--color-sidebar-bg) / <alpha-value>)',
          fg: 'rgb(var(--color-sidebar-fg) / <alpha-value>)',
          'fg-active': 'rgb(var(--color-sidebar-fg-active) / <alpha-value>)',
          'item-active': 'rgb(var(--color-sidebar-item-active) / <alpha-value>)',
          'item-hover': 'rgb(var(--color-sidebar-item-hover) / <alpha-value>)',
          border: 'rgb(var(--color-sidebar-border) / <alpha-value>)',
        },
      },
      textColor: {
        default: 'rgb(var(--color-text-default) / <alpha-value>)',
        muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        subtle: 'rgb(var(--color-text-subtle) / <alpha-value>)',
        inverse: 'rgb(var(--color-text-inverse) / <alpha-value>)',
      },
      borderColor: {
        default: 'rgb(var(--color-border-default) / <alpha-value>)',
        strong: 'rgb(var(--color-border-strong) / <alpha-value>)',
      },
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
        'token-xl': 'var(--radius-xl)',
      },
      boxShadow: {
        'token-xs': 'var(--shadow-xs)',
        'token-sm': 'var(--shadow-sm)',
        'token-md': 'var(--shadow-md)',
      },
      spacing: {
        page: 'var(--space-page)',
        section: 'var(--space-section)',
        card: 'var(--space-card)',
      },
    },
  },
  plugins: [],
}

