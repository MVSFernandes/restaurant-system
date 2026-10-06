import React from 'react';
import { Link } from 'react-router-dom';
import { getHomeLabel, getHomePath } from '../../constants/roles';
import { Card, RestrictedIcon, buttonClasses } from '../ui';
import type { Role } from '../../types';

/**
 * Área só do administrador, aberta por quem não é. Diz a verdade em vez de
 * levar a outra tela em silêncio ou mostrar uma tela que falharia ao salvar.
 * Mesmo desenho da tela de erro de rota (RouteError, RouteNotFound).
 */
const AccessDenied: React.FC<{ role: Role }> = ({ role }) => (
  <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-token-lg bg-surface-sunken text-muted">
      <RestrictedIcon size={22} strokeWidth={1.75} aria-hidden="true" />
    </span>
    <div className="min-w-0 flex-1">
      <h1 className="text-heading text-default">Área do administrador</h1>
      <p className="mt-1 max-w-prose text-body text-muted">Esta área é só do administrador do sistema.</p>
      <Link to={getHomePath(role)} className={buttonClasses({ size: 'lg', className: 'mt-4' })}>
        {getHomeLabel(role)}
      </Link>
    </div>
  </Card>
);

export default AccessDenied;
