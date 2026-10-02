import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getHomePath } from '../../constants/roles';

/** A raiz leva à tela inicial do papel: o garçom cai nas mesas, não no Dashboard. */
const HomeRedirect: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  return <Navigate to={getHomePath(isAuthenticated ? user?.role : null)} replace />;
};

export default HomeRedirect;
