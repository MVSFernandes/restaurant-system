import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { BrandingRouteEffects } from './contexts/BrandingProvider';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'));

const TablesPage = lazy(() => import('./pages/pdv/TablesPage'));
const OrdersPage = lazy(() => import('./pages/pdv/OrdersPage'));
const CashRegisterPage = lazy(() => import('./pages/pdv/CashRegisterPage'));
const HistoryPage = lazy(() => import('./pages/pdv/HistoryPage'));

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

const router = createBrowserRouter([
  {
    element: <BrandingRouteEffects />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/cardapio', element: <PublicMenuPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/settings', element: <Navigate to="/settings/restaurant" replace /> },
          { path: '/settings/restaurant', element: <RestaurantSettingsPage /> },
          { path: '/settings/fiscal', element: <FiscalSettingsPage /> },
          { path: '/design-system', element: <DesignSystemPage /> },
        ],
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']} />,
        children: [
          { path: '/pdv/tables', element: <TablesPage /> },
          { path: '/pdv/orders', element: <OrdersPage /> },
          { path: '/pdv/cash-register', element: <CashRegisterPage /> },
          { path: '/pdv/history', element: <HistoryPage /> },
        ],
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN', 'WAITER']} />,
        children: [
          { path: '/waiter/tables', element: <WaiterTablesPage /> },
          { path: '/waiter/history', element: <WaiterHistoryPage /> },
        ],
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN']} />,
        children: [
          { path: '/menu/categories', element: <CategoriesPage /> },
          { path: '/menu/products', element: <ProductsPage /> },
          { path: '/menu/marmita-menu', element: <MarmitaMenuPage /> },
          { path: '/admin/waiters', element: <WaitersManagementPage /> },
        ],
      },
      {
        element: <ProtectedRoute allowedRoles={['ADMIN', 'FINANCE']} />,
        children: [
          { path: '/stock/items', element: <StockItemsPage /> },
          { path: '/stock/suppliers', element: <SuppliersPage /> },
          { path: '/stock/comparison', element: <SupplierComparisonPage /> },
          { path: '/finance/reports', element: <FinanceReportsPage /> },
          { path: '/finance/payables', element: <PayablesPage /> },
          { path: '/finance/credit', element: <CreditPage /> },
        ],
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
