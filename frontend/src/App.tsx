import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RouteError from './components/layout/RouteError';
import { BrandingRouteEffects } from './contexts/BrandingProvider';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'));

const TablesPage = lazy(() => import('./pages/pdv/TablesPage'));
const OrdersPage = lazy(() => import('./pages/pdv/OrdersPage'));
const CashRegisterPage = lazy(() => import('./pages/pdv/CashRegisterPage'));
const OrderHistoryPage = lazy(() => import('./pages/pdv/OrderHistoryPage'));
const CashClosuresPage = lazy(() => import('./pages/pdv/CashClosuresPage'));

const WaiterTablesPage = lazy(() => import('./pages/waiter/WaiterTablesPage'));
const WaiterHistoryPage = lazy(() => import('./pages/waiter/WaiterHistoryPage'));

const CategoriesPage = lazy(() => import('./pages/menu/CategoriesPage'));
const ProductsPage = lazy(() => import('./pages/menu/ProductsPage'));
const MarmitaMenuPage = lazy(() => import('./pages/menu/MarmitaMenuPage'));

const StockItemsPage = lazy(() => import('./pages/finance/StockItemsPage'));
const SuppliersPage = lazy(() => import('./pages/finance/SuppliersPage'));
const SupplierComparisonPage = lazy(() => import('./pages/finance/SupplierComparisonPage'));

const FinanceReportsPage = lazy(() => import('./pages/finance/FinanceReportsPage'));
const PayablesPage = lazy(() => import('./pages/finance/PayablesPage'));
const CreditPage = lazy(() => import('./pages/finance/CreditPage'));

const RestaurantSettingsPage = lazy(() => import('./pages/settings/RestaurantSettingsPage'));
const FiscalSettingsPage = lazy(() => import('./pages/settings/FiscalSettingsPage'));
const WaitersManagementPage = lazy(() => import('./pages/admin/WaitersManagementPage'));

const PublicMenuPage = lazy(() => import('./pages/menu/PublicMenuPage'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
  </div>
);

// Erro de uma tela aparece dentro da casca: a sidebar continua utilizável.
const insideShell = (children: RouteObject[]): RouteObject[] => [{ errorElement: <RouteError />, children }];

const router = createBrowserRouter([
  {
    element: <BrandingRouteEffects />,
    errorElement: <RouteError standalone />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/cardapio', element: <PublicMenuPage /> },
      {
        element: <ProtectedRoute />,
        children: insideShell([
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/settings', element: <Navigate to="/settings/restaurant" replace /> },
          { path: '/settings/restaurant', element: <RestaurantSettingsPage /> },
          { path: '/settings/fiscal', element: <FiscalSettingsPage /> },
          { path: '/design-system', element: <DesignSystemPage /> },
        ]),
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']} />,
        children: insideShell([
          { path: '/pdv/tables', element: <TablesPage /> },
          { path: '/pdv/orders', element: <OrdersPage /> },
          { path: '/pdv/cash-register', element: <CashRegisterPage /> },
          { path: '/pdv/history', element: <Navigate to="/pdv/orders-history" replace /> },
          { path: '/pdv/orders-history', element: <OrderHistoryPage /> },
          { path: '/pdv/cash-closures', element: <CashClosuresPage /> },
        ]),
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN', 'WAITER']} />,
        children: insideShell([
          { path: '/waiter/tables', element: <WaiterTablesPage /> },
          { path: '/waiter/history', element: <WaiterHistoryPage /> },
        ]),
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN']} />,
        children: insideShell([
          { path: '/menu/categories', element: <CategoriesPage /> },
          { path: '/menu/products', element: <ProductsPage /> },
          { path: '/menu/marmita-menu', element: <MarmitaMenuPage /> },
          { path: '/admin/waiters', element: <WaitersManagementPage /> },
        ]),
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN', 'FINANCE']} />,
        children: insideShell([
          { path: '/stock/items', element: <StockItemsPage /> },
          { path: '/stock/suppliers', element: <SuppliersPage /> },
          { path: '/stock/comparison', element: <SupplierComparisonPage /> },
          { path: '/finance/reports', element: <FinanceReportsPage /> },
          { path: '/finance/payables', element: <PayablesPage /> },
          { path: '/finance/credit', element: <CreditPage /> },
        ]),
      },
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);

function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}

export default App;
