import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import MainLayout from './MainLayout';
import type { Role } from '../../types';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();

  // O Dashboard é o destino de quem volta pelo menu. Com o código já baixado,
  // ele abre mesmo se a conexão cair, mostrando "Não disponível" nos blocos em
  // vez da tela de erro.
  React.useEffect(() => {
    if (isAuthenticated) void import('../../pages/DashboardPage').catch(() => {});
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
};

export default ProtectedRoute;
