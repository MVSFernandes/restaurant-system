import type { Role } from '../types';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  CASHIER: 'Caixa',
  FINANCE: 'Financeiro',
  WAITER: 'Garçom',
};

/** Tela inicial de cada papel. O garçom não usa o Dashboard: começa nas mesas. */
export function getHomePath(role: Role | null | undefined): string {
  if (!role) return '/login';
  return role === 'WAITER' ? '/waiter/tables' : '/dashboard';
}

/** Nome da tela inicial, para o texto do link que leva até ela. */
export function getHomeLabel(role: Role | null | undefined): string {
  if (!role) return 'Ir para o login';
  return role === 'WAITER' ? 'Ir para as mesas' : 'Ir para o painel';
}
