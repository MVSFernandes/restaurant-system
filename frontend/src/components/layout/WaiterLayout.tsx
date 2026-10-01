import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { FloorPlanIcon, MenuCatalogIcon } from '../ui';

// Casca do app do garçom: sem sidebar, feita para o celular numa mão só.
// A navegação fica embaixo, ao alcance do polegar.

const navItems = [
  // A grade é a forma da tela que o item abre: o salão, não a comida.
  { to: '/waiter/tables', label: 'Mesas', icon: FloorPlanIcon },
  { to: '/waiter/menu', label: 'Cardápio', icon: MenuCatalogIcon },
];

export const WAITER_COLUMN = 'mx-auto w-full max-w-screen-sm';

const WaiterBottomNav: React.FC = () => (
  <nav
    aria-label="Navegação do garçom"
    className="fixed inset-x-0 bottom-0 z-30 border-t border-default bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    <ul className={clsx(WAITER_COLUMN, 'grid grid-cols-2')}>
      {navItems.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            className={({ isActive }) =>
              clsx(
                'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
                isActive ? 'text-default' : 'text-muted hover:text-default'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={clsx(
                    'absolute inset-x-8 top-0 h-0.5 rounded-full',
                    isActive ? 'bg-primary' : 'bg-transparent'
                  )}
                />
                <Icon size={22} strokeWidth={1.75} aria-hidden="true" className={isActive ? 'text-primary' : undefined} />
                {label}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

const WaiterLayout: React.FC = () => (
  <div className="min-h-screen bg-canvas text-default">
    {/* Espaço da barra inferior (56px) mais a área segura do aparelho. */}
    <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <Outlet />
    </div>
    <WaiterBottomNav />
  </div>
);

export default WaiterLayout;
