import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, ShoppingCart, Users, Package, DollarSign,
  BookOpen, LogOut, Menu, X, ChevronDown, ChevronUp, Settings, UserCog
} from 'lucide-react';
import { clsx } from 'clsx';
import { BrandMark } from '../branding/BrandMark';
import { useBranding } from '../../contexts/brandingContext';

type NavChild = { label: string; path: string; icon: React.ReactNode | null };
type NavItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles?: string[];
  children?: NavChild[];
};

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} />, roles: ['ADMIN', 'CASHIER', 'FINANCE', 'WAITER'] },
  {
    label: 'PDV', path: '/pdv', icon: <ShoppingCart size={20} />,
    roles: ['ADMIN', 'CASHIER'],
    children: [
      { label: 'Abertura/Fechamento', path: '/pdv/cash-register', icon: null },
      { label: 'Mesas', path: '/pdv/tables', icon: null },
      { label: 'Pedidos', path: '/pdv/orders', icon: null },
      { label: 'Histórico de pedidos', path: '/pdv/orders-history', icon: null },
      { label: 'Fechamentos de caixa', path: '/pdv/cash-closures', icon: null },
    ]
  },
  {
    label: 'Mesas Garçom ', path: '/waiter', icon: <Users size={20} />,
    roles: ['ADMIN', 'WAITER'],
    children: [
      { label: 'Minhas Mesas', path: '/waiter/tables', icon: null },
      { label: 'Histórico', path: '/waiter/history', icon: null },
    ]
  },
  {
    label: 'Cardápio', path: '/menu', icon: <BookOpen size={20} />,
    roles: ['ADMIN'],
    children: [
      { label: 'Categorias', path: '/menu/categories', icon: null },
      { label: 'Produtos', path: '/menu/products', icon: null },
      { label: 'Cardápio da Marmita', path: '/menu/marmita-menu', icon: null },
    ]
  },
  {
    label: 'Estoque', path: '/stock', icon: <Package size={20} />,
    roles: ['ADMIN', 'FINANCE'],
    children: [
      { label: 'Insumos', path: '/stock/items', icon: null },
      { label: 'Fornecedores', path: '/stock/suppliers', icon: null },
      { label: 'CSM', path: '/stock/comparison', icon: null },
    ]
  },
  {
    label: 'Financeiro', path: '/finance', icon: <DollarSign size={20} />,
    roles: ['ADMIN', 'FINANCE'],
    children: [
      { label: 'Relatórios', path: '/finance/reports', icon: null },
      { label: 'Contas a Pagar', path: '/finance/payables', icon: null },
      { label: 'Fiado', path: '/finance/credit', icon: null },
    ]
  },
  {
    label: 'Configurações', path: '/settings', icon: <Settings size={20} />,
    roles: ['ADMIN'],
    children: [
      { label: 'Restaurante', path: '/settings/restaurant', icon: null },
      { label: 'Documentos Fiscais', path: '/settings/fiscal', icon: null },
    ]
  },
  { label: 'Garçons', path: '/admin/waiters', icon: <UserCog size={20} />, roles: ['ADMIN'] },
];

const NavLink: React.FC<{ item: NavItem; collapsed: boolean; onNavigate?: () => void }> = ({ item, collapsed, onNavigate }) => {
  const location = useLocation();
  const isActive = location.pathname.startsWith(item.path);

  const shouldStartOpen =
    !!item.children &&
    item.children.some((child) => location.pathname === child.path);

  const [open, setOpen] = useState(shouldStartOpen);

  useEffect(() => {
    if (shouldStartOpen) setOpen(true);
  }, [shouldStartOpen]);

  if (item.children && !collapsed) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            isActive ? 'bg-primary-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
          )}
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {open && (
          <div className="ml-8 mt-1 space-y-1">
            {item.children.map((child) => (
              <Link
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={clsx(
                  'block px-3 py-1.5 rounded-lg text-sm transition-colors',
                  location.pathname === child.path
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                )}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={clsx(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive ? 'bg-primary-700 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      )}
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
};

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();
  const { displayName, logoUrl } = useBranding();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  const sidebarContent = (
    <>
      <div className={clsx('flex items-center justify-between border-b border-gray-700 p-4', collapsed && 'md:flex-col md:gap-2 md:px-2 md:py-3')}>
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark
            name={displayName}
            logoUrl={logoUrl}
            className="h-9 w-9 rounded-token-md"
            fallbackClassName="text-body-lg"
          />
          <span className={clsx('truncate text-base font-bold text-white', collapsed && 'md:hidden')}>
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:inline-flex p-1 rounded hover:bg-gray-700 text-gray-400"
          >
            {collapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 rounded hover:bg-gray-700 text-gray-400"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
        {visibleNavItems.map((item) => (
          <NavLink key={item.path} item={item} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
        ))}
      </nav>

      <div className="p-3 border-t border-gray-700 shrink-0">
        {!collapsed && user && (
          <div className="mb-2 px-3 py-2">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-red-700 hover:text-white transition-colors"
        >
          <LogOut size={20} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
      {/* SIDEBAR DESKTOP */}
      <div className="hidden md:flex">
        <aside
          className={clsx(
            'flex flex-col bg-gray-900 text-white transition-all duration-300 h-full flex-shrink-0',
            collapsed ? 'w-16' : 'w-64'
          )}
        >
          {sidebarContent}
        </aside>
      </div>

      {/* OVERLAY MOBILE */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      {/* SIDEBAR MOBILE */}
      <aside
        className={clsx(
          'md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-gray-900 text-white transform transition-transform duration-300 flex flex-col',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL COM BARRA DE ROLAGEM PRÓPRIA */}
      <main className="flex-1 h-full overflow-y-auto">
        <div className="md:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm"
          >
            <Menu size={20} />
          </button>
          <span className="max-w-[65vw] truncate font-semibold text-gray-900">{displayName}</span>
          <div className="w-10" />
        </div>
        
        {/* Aqui é onde a página realmente renderiza (e onde o css quebrava antes) */}
        <div className="p-4 md:p-6 w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
