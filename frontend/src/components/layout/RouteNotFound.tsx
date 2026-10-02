import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getHomeLabel, getHomePath } from '../../constants/roles';
import { Card, WarningIcon, buttonClasses } from '../ui';

/**
 * Rota que não existe. Antes ela levava ao Dashboard em silêncio: o garçom
 * caía no meio do salão numa tela que não é dele, sem entender o que houve.
 * Agora diz o que aconteceu e leva de volta à tela inicial do papel.
 * Mesmo desenho da tela de erro de rota (RouteError).
 */
const RouteNotFound: React.FC = () => {
  const { pathname } = useLocation();
  const { isAuthenticated, user } = useAuthStore();
  const role = isAuthenticated ? user?.role : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-lg">
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-token-lg bg-surface-sunken text-muted">
            <WarningIcon size={22} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-heading text-default">Esta tela não existe</h1>
            <p className="mt-1 max-w-prose break-words text-body text-muted">
              O endereço <span className="font-medium text-default">{pathname}</span> não leva a nenhuma tela do sistema.
            </p>
            <Link to={getHomePath(role)} className={buttonClasses({ size: 'lg', className: 'mt-4' })}>
              {getHomeLabel(role)}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RouteNotFound;
