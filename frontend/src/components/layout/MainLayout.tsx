import React, { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { BrandMark } from '../branding/BrandMark';
import { useBranding } from '../../contexts/brandingContext';
import { ROLE_LABELS } from '../../constants/roles';
import type { Role } from '../../types';
import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  FinanceIcon,
  LogoutIcon,
  MenuCatalogIcon,
  NavMenuIcon,
  OrderIcon,
  SettingsIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  StaffIcon,
  StockIcon,
  WaiterIcon,
} from '../ui';

type NavChild = { label: string; path: string };
type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: Role[];
  children?: NavChild[];
};
type NavSection = { label: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    label: 'Operação',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: DashboardIcon, roles: ['ADMIN', 'CASHIER', 'FINANCE', 'WAITER'] },
      {
        label: 'PDV', path: '/pdv', icon: OrderIcon,
        roles: ['ADMIN', 'CASHIER'],
        children: [
          { label: 'Abertura/Fechamento', path: '/pdv/cash-register' },
          { label: 'Mesas', path: '/pdv/tables' },
          { label: 'Pedidos', path: '/pdv/orders' },
          { label: 'Histórico de pedidos', path: '/pdv/orders-history' },
          { label: 'Fechamentos de caixa', path: '/pdv/cash-closures' },
        ],
      },
      {
        label: 'Mesas do garçom', path: '/waiter', icon: WaiterIcon,
        roles: ['ADMIN', 'WAITER'],
        children: [
          { label: 'Minhas mesas', path: '/waiter/tables' },
          { label: 'Histórico', path: '/waiter/history' },
        ],
      },
    ],
  },
  {
    label: 'Gestão',
    items: [
      {
        label: 'Cardápio', path: '/menu', icon: MenuCatalogIcon,
        roles: ['ADMIN'],
        children: [
          { label: 'Categorias', path: '/menu/categories' },
          { label: 'Produtos', path: '/menu/products' },
          { label: 'Cardápio da marmita', path: '/menu/marmita-menu' },
        ],
      },
      {
        label: 'Estoque', path: '/stock', icon: StockIcon,
        roles: ['ADMIN', 'FINANCE'],
        children: [
          { label: 'Insumos', path: '/stock/items' },
          { label: 'Fornecedores', path: '/stock/suppliers' },
          { label: 'CSM', path: '/stock/comparison' },
        ],
      },
      {
        label: 'Financeiro', path: '/finance', icon: FinanceIcon,
        roles: ['ADMIN', 'FINANCE'],
        children: [
          { label: 'Relatórios', path: '/finance/reports' },
          { label: 'Contas a pagar', path: '/finance/payables' },
          { label: 'Fiado', path: '/finance/credit' },
        ],
      },
    ],
  },
  {
    label: 'Administração',
    items: [
      {
        label: 'Configurações', path: '/settings', icon: SettingsIcon,
        roles: ['ADMIN'],
        children: [
          { label: 'Restaurante', path: '/settings/restaurant' },
          { label: 'Documentos fiscais', path: '/settings/fiscal' },
        ],
      },
      { label: 'Garçons', path: '/admin/waiters', icon: StaffIcon, roles: ['ADMIN'] },
    ],
  },
];

// Geometria do item: px-3 (12px) + ícone de 18px. A linha-guia do submenu
// passa no centro do ícone (21px) e o texto do filho alinha com o texto do pai
// (12 + 18 + 12 = 42px).
const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

function isInSection(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(path + '/');
}

function findBreadcrumb(pathname: string): string[] {
  for (const section of navSections) {
    for (const item of section.items) {
      const child = item.children?.find((c) => c.path === pathname);
      if (child) return [item.label, child.label];
      if (!item.children && isInSection(pathname, item.path)) return [item.label];
    }
  }
  return [];
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toLocaleUpperCase('pt-BR');
}

const itemBase =
  'relative flex items-center rounded-token-md text-body font-medium transition-colors';
const itemIdle = 'text-sidebar-fg hover:bg-sidebar-item-hover hover:text-sidebar-fg-active';
const itemCurrent = 'bg-sidebar-item-hover text-sidebar-fg-active';

const NavEntry: React.FC<{
  item: NavItem;
  collapsed: boolean;
  onNavigate: () => void;
  onExpandSidebar: () => void;
}> = ({ item, collapsed, onNavigate, onExpandSidebar }) => {
  const { pathname } = useLocation();
  const submenuId = useId();
  const Icon = item.icon;
  const inSection = isInSection(pathname, item.path);
  const hasActiveChild = !!item.children?.some((child) => child.path === pathname);

  const [open, setOpen] = useState(hasActiveChild);
  const [prevHasActiveChild, setPrevHasActiveChild] = useState(hasActiveChild);

  // Abre o grupo quando a rota atual passa a ser um dos filhos.
  if (hasActiveChild !== prevHasActiveChild) {
    setPrevHasActiveChild(hasActiveChild);
    if (hasActiveChild) setOpen(true);
  }

  const icon = (
    <Icon
      size={ICON_SIZE}
      strokeWidth={ICON_STROKE}
      aria-hidden="true"
      className={clsx('shrink-0', inSection && 'text-sidebar-item-active')}
    />
  );

  if (collapsed) {
    const collapsedClass = clsx(itemBase, 'h-10 w-10 justify-center', inSection ? itemCurrent : itemIdle);

    if (item.children) {
      return (
        <button
          type="button"
          title={item.label}
          aria-label={item.label}
          onClick={() => {
            setOpen(true);
            onExpandSidebar();
          }}
          className={collapsedClass}
        >
          {icon}
        </button>
      );
    }

    return (
      <Link
        to={item.path}
        onClick={onNavigate}
        title={item.label}
        aria-label={item.label}
        aria-current={inSection ? 'page' : undefined}
        className={collapsedClass}
      >
        {icon}
      </Link>
    );
  }

  if (!item.children) {
    return (
      <Link
        to={item.path}
        onClick={onNavigate}
        aria-current={inSection ? 'page' : undefined}
        className={clsx(itemBase, 'h-9 gap-3 px-3', inSection ? itemCurrent : itemIdle)}
      >
        {icon}
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={submenuId}
        className={clsx(
          itemBase,
          'h-9 w-full gap-3 px-3',
          inSection ? 'text-sidebar-fg-active hover:bg-sidebar-item-hover' : itemIdle
        )}
      >
        {icon}
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDownIcon
          size={16}
          strokeWidth={ICON_STROKE}
          aria-hidden="true"
          className={clsx('shrink-0 opacity-60 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul id={submenuId} className="relative mt-0.5 space-y-0.5">
          <span aria-hidden="true" className="absolute inset-y-1 left-[21px] w-px bg-sidebar-border" />
          {item.children.map((child) => {
            const active = pathname === child.path;
            return (
              <li key={child.path} className="relative">
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1.5 left-[20px] w-[3px] rounded-full bg-sidebar-item-active"
                  />
                )}
                <Link
                  to={child.path}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'flex h-8 items-center rounded-token-md pl-[42px] pr-3 text-label transition-colors',
                    active
                      ? 'text-sidebar-fg-active'
                      : 'font-normal text-sidebar-fg hover:bg-sidebar-item-hover hover:text-sidebar-fg-active'
                  )}
                >
                  <span className="truncate">{child.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const sidebarIconButton =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-token-md text-sidebar-fg transition-colors hover:bg-sidebar-item-hover hover:text-sidebar-fg-active';

const Sidebar: React.FC<{
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onClose?: () => void;
  onNavigate: () => void;
}> = ({ collapsed, onToggleCollapsed, onClose, onNavigate }) => {
  const { user, signOut } = useAuth();
  const { displayName, logoUrl } = useBranding();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !!user && item.roles.includes(user.role)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      <div
        className={clsx(
          'flex h-topbar shrink-0 items-center gap-3 border-b border-sidebar-border',
          collapsed ? 'justify-center px-4' : 'px-4'
        )}
      >
        <BrandMark
          name={displayName}
          logoUrl={logoUrl}
          className="h-8 w-8 rounded-token-md"
          fallbackClassName="text-body"
        />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-body font-semibold text-sidebar-fg-active">
            {displayName}
          </span>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fechar menu" className={sidebarIconButton}>
            <CloseIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
          </button>
        )}
      </div>

      <nav
        aria-label="Navegação principal"
        className={clsx('flex-1 overflow-y-auto py-5 scrollbar-hide', collapsed ? 'px-4' : 'px-3')}
      >
        <div className="space-y-6">
          {sections.map((section, index) => (
            <div key={section.label}>
              {collapsed ? (
                index > 0 && <div aria-hidden="true" className="mx-2 mb-6 h-px bg-sidebar-border" />
              ) : (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-sidebar-fg/60">
                  {section.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.path}>
                    <NavEntry
                      item={item}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                      onExpandSidebar={() => onToggleCollapsed?.()}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className={clsx('shrink-0 space-y-1 border-t border-sidebar-border py-3', collapsed ? 'px-4' : 'px-3')}>
        {user && (
          <div className={clsx('flex items-center gap-3', collapsed ? 'flex-col' : 'px-1 py-1')}>
            {!collapsed && (
              <>
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-item-hover text-caption font-semibold text-sidebar-fg-active"
                >
                  {initialsOf(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label text-sidebar-fg-active">{user.name}</p>
                  <p className="truncate text-caption text-sidebar-fg/70">{ROLE_LABELS[user.role] ?? user.role}</p>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
              className={clsx(sidebarIconButton, collapsed && 'h-10 w-10')}
            >
              <LogoutIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            </button>
          </div>
        )}

        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : undefined}
            className={clsx(
              'flex w-full items-center rounded-token-md text-body transition-colors',
              itemIdle,
              collapsed ? 'h-10 justify-center' : 'h-9 gap-3 px-3'
            )}
          >
            {collapsed ? (
              <SidebarExpandIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            ) : (
              <>
                <SidebarCollapseIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
                <span>Recolher menu</span>
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
};

const Topbar: React.FC<{ onOpenMenu: () => void }> = ({ onOpenMenu }) => {
  const { pathname } = useLocation();
  const { displayName } = useBranding();
  const crumbs = findBreadcrumb(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-3 border-b border-default bg-surface/95 px-4 backdrop-blur md:px-page">
      <Button variant="ghost" iconOnly aria-label="Abrir menu" onClick={onOpenMenu} className="-ml-2 md:hidden">
        <NavMenuIcon aria-hidden="true" />
      </Button>

      {crumbs.length > 0 ? (
        <nav aria-label="Você está em" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-2 text-body">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li
                  key={crumb}
                  className={clsx('flex min-w-0 items-center gap-2', !last && 'hidden sm:flex')}
                >
                  {index > 0 && (
                    <ChevronRightIcon size={14} aria-hidden="true" className="shrink-0 text-subtle" />
                  )}
                  <span
                    aria-current={last ? 'page' : undefined}
                    className={clsx('truncate', last ? 'font-medium text-default' : 'text-muted')}
                  >
                    {crumb}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : (
        <span className="truncate text-body font-medium text-default md:hidden">{displayName}</span>
      )}
    </header>
  );
};

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Fecha o menu do celular a cada troca de rota.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas">
      {/* SIDEBAR DESKTOP */}
      <aside
        className={clsx(
          'hidden h-full shrink-0 flex-col bg-sidebar-bg transition-[width] duration-200 md:flex',
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        )}
      >
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(!collapsed)}
          onNavigate={closeMobile}
        />
      </aside>

      {/* OVERLAY MOBILE */}
      {mobileOpen && (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-sidebar-bg/60 md:hidden" onClick={closeMobile} />
      )}

      {/* SIDEBAR MOBILE */}
      <aside
        aria-hidden={!mobileOpen}
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-sidebar max-w-[85vw] flex-col bg-sidebar-bg transition-[transform,visibility] duration-200 md:hidden',
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'
        )}
      >
        <Sidebar collapsed={false} onClose={closeMobile} onNavigate={closeMobile} />
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL COM BARRA DE ROLAGEM PRÓPRIA */}
      <main className="h-full flex-1 overflow-y-auto">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />

        {/* O padding precisa continuar 16px/24px: CreditPage e DesignSystemPage
            usam margem negativa (-m-4 md:-m-6) para sangrar até a borda. */}
        <div className="mx-auto w-full max-w-content p-4 md:p-page">
          {children}
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
