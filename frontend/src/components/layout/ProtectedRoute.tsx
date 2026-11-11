import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import MainLayout from './MainLayout';
import AccessDenied from './AccessDenied';
import { getHomePath } from '../../constants/roles';
import type { Role } from '../../types';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
  /** Sem a casca administrativa: a rota filha traz a própria (ex.: app do garçom). */
  bare?: boolean;
  /**
   * Papel sem permissão: em vez de levar ao Dashboard em silêncio, mostra uma
   * página que diz que a área não é dele. Os outros grupos seguem como antes.
   */
  explainDenial?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, bare = false, explainDenial = false }) => {
  const { isAuthenticated, user } = useAuthStore();

  // O Dashboard é o destino de quem volta pelo menu. Com o código já baixado,
  // ele abre mesmo se a conexão cair, mostrando "Não disponível" nos blocos em
  // vez da tela de erro. O garçom não tem Dashboard: nada a baixar.
  const usesDashboard = isAuthenticated && user?.role !== 'WAITER';
  React.useEffect(() => {
    if (usesDashboard) void import('../../pages/DashboardPage').catch(() => {});
  }, [usesDashboard]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Tela inicial do papel, sempre permitida a ele (sem loop): /waiter/tables
    // para o garçom, /dashboard para os demais.
    if (!explainDenial) return <Navigate to={getHomePath(user.role)} replace />;
    return (
      <MainLayout>
        <AccessDenied role={user.role} />
      </MainLayout>
    );
  }

  if (bare) return <Outlet />;

  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
};

export default ProtectedRoute;
