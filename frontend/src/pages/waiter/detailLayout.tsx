import React from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import { BackIcon, Skeleton } from '../../components/ui';

// Peças das telas de detalhe do garçom (Mesa aberta, Comanda): cabeçalho com
// voltar, cards, rótulo de seção e a barra de ação fixa embaixo.

export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

export const cardBase = 'rounded-token-xl border border-default bg-surface';

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="mt-[18px] text-[13px] font-semibold uppercase leading-[18px] tracking-[0.4px] text-muted">{children}</h2>
);

type DetailHeaderProps = {
  /** Rota pai conhecida: funciona também quando a URL é aberta direto. */
  backTo: string;
  backLabel: string;
  loading?: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Elemento à direita do título (ex.: pílula de situação). */
  trailing?: React.ReactNode;
};

export const DetailHeader: React.FC<DetailHeaderProps> = ({ backTo, backLabel, loading, title, subtitle, trailing }) => (
  <header className="sticky top-0 z-20 border-b border-default bg-surface px-5 pb-[18px] pt-5">
    <div className={clsx(WAITER_COLUMN, 'flex items-center gap-3')}>
      <Link
        to={backTo}
        aria-label={backLabel}
        className={clsx(
          'flex size-11 shrink-0 items-center justify-center rounded-token-lg border border-default bg-surface text-default hover:bg-surface-hover',
          focusRing
        )}
      >
        <BackIcon size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>

      <div className="min-w-0 flex-1">
        {loading ? (
          <>
            <Skeleton className="h-6 w-28" />
            <Skeleton className="mt-2 h-3.5 w-40" />
          </>
        ) : (
          <>
            <h1 className="truncate text-[24px] font-bold leading-[30px] tracking-[-0.3px]">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-[13px] leading-[18px] text-muted">{subtitle}</p>}
          </>
        )}
      </div>

      {trailing}
    </div>
  </header>
);

// Altura da barra: 12 + 56 + 20px, mais a área segura do aparelho. A página
// reserva esse espaço embaixo para o último conteúdo não ficar atrás dela.
export const BOTTOM_BAR_CLEARANCE = 'pb-[calc(88px+24px+env(safe-area-inset-bottom))]';

export const BottomBar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fixed inset-x-0 bottom-0 z-30 border-t border-default bg-surface px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
    <div className={clsx(WAITER_COLUMN, 'flex gap-2.5')}>{children}</div>
  </div>
);

// Ação principal da barra: 56px, raio 14px, fundo primary, ícone de 20px.
export const primaryActionClasses =
  'flex h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[14px] bg-primary text-[17px] font-semibold text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';
