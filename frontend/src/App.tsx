import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Lazy loading das páginas
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'));

// PDV
const TablesPage = lazy(() => import('./pages/pdv/TablesPage'));
const OrdersPage = lazy(() => import('./pages/pdv/OrdersPage'));
const CashRegisterPage = lazy(() => import('./pages/pdv/CashRegisterPage'));
const HistoryPage = lazy(() => import('./pages/pdv/HistoryPage'));

// Garçom
const WaiterTablesPage = lazy(() => import('./pages/waiter/WaiterTablesPage'));
const WaiterHistoryPage = lazy(() => import('./pages/waiter/WaiterHistoryPage'));

// Cardápio
const CategoriesPage = lazy(() => import('./pages/menu/CategoriesPage'));
const ProductsPage = lazy(() => import('./pages/menu/ProductsPage'));
const MarmitaMenuPage = lazy(() => import('./pages/menu/MarmitaMenuPage'));

// Estoque
const StockItemsPage = lazy(() => import('./pages/finance/StockItemsPage'));
const SuppliersPage = lazy(() => import('./pages/finance/SuppliersPage'));
const SupplierComparisonPage = lazy(() => import('./pages/finance/SupplierComparisonPage'));

// Financeiro
const FinanceReportsPage = lazy(() => import('./pages/finance/FinanceReportsPage'));
const PayablesPage = lazy(() => import('./pages/finance/PayablesPage'));
const CreditPage = lazy(() => import('./pages/finance/CreditPage'));

// Configurações
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WaitersManagementPage = lazy(() => import('./pages/admin/WaitersManagementPage'));

// Cardápio Público
const PublicMenuPage = lazy(() => import('./pages/menu/PublicMenuPage'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
  </div>
);

function App() {
  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cardapio" element={<PublicMenuPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/design-system" element={<DesignSystemPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']} />}>
            <Route path="/pdv/tables" element={<TablesPage />} />
            <Route path="/pdv/orders" element={<OrdersPage />} />
            <Route path="/pdv/cash-register" element={<CashRegisterPage />} />
            <Route path="/pdv/history" element={<HistoryPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'WAITER']} />}>
            <Route path="/waiter/tables" element={<WaiterTablesPage />} />
            <Route path="/waiter/history" element={<WaiterHistoryPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/menu/categories" element={<CategoriesPage />} />
            <Route path="/menu/products" element={<ProductsPage />} />
            <Route path="/menu/marmita-menu" element={<MarmitaMenuPage />} />
            <Route path="/admin/waiters" element={<WaitersManagementPage />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'FINANCE']} />}>
            <Route path="/stock/items" element={<StockItemsPage />} />
            <Route path="/stock/suppliers" element={<SuppliersPage />} />
            <Route path="/stock/comparison" element={<SupplierComparisonPage />} />
            <Route path="/finance/reports" element={<FinanceReportsPage />} />
            <Route path="/finance/payables" element={<PayablesPage />} />
            <Route path="/finance/credit" element={<CreditPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
