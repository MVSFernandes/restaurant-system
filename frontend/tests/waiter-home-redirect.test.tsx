import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '../src/components/layout/ProtectedRoute';
import { useAuthStore } from '../src/store/authStore';
import type { Role } from '../src/types';

const auth = vi.hoisted(() => ({ role: 'ADMIN' as Role }));

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Pessoa Teste', role: auth.role }, signOut: vi.fn() }),
}));
// A tela do Dashboard não é o assunto: basta saber se ela foi mostrada.
vi.mock('../src/pages/DashboardPage', () => ({ default: () => <p>Tela do Dashboard</p> }));

function Screen({ name }: { name: string }) {
  return <p aria-label="Tela atual">{`${name} em ${useLocation().pathname}`}</p>;
}

// Mesmos grupos de App.tsx para as rotas envolvidas no redirecionamento.
function renderAt(path: string, role: Role) {
  auth.role = role;
  useAuthStore.setState({
    isAuthenticated: true,
    accessToken: 'token',
    user: { id: 'u-1', name: 'Pessoa Teste', email: 'pessoa@teste.local', role },
  });
  const router = createMemoryRouter([
    {
      element: <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER', 'FINANCE']} />,
      children: [{ path: '/dashboard', element: <Screen name="Dashboard" /> }],
    },
    {
      element: <ProtectedRoute allowedRoles={['ADMIN', 'CASHIER']} />,
      children: [{ path: '/pdv/orders', element: <Screen name="Pedidos" /> }],
    },
    {
      element: <ProtectedRoute allowedRoles={['ADMIN', 'WAITER']} bare />,
      children: [{ path: '/waiter/tables', element: <Screen name="Minhas mesas" /> }],
    },
  ], { initialEntries: ['/login-anterior', path], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
}

const current = () => screen.getByLabelText('Tela atual').textContent;

afterEach(() => {
  cleanup();
  useAuthStore.setState({ isAuthenticated: false, accessToken: null, user: null });
});

describe('garçom sem Dashboard', () => {
  it('redirects /dashboard to Minhas mesas, replacing the history entry', async () => {
    const router = renderAt('/dashboard', 'WAITER');
    await waitFor(() => expect(current()).toBe('Minhas mesas em /waiter/tables'));
    // replace: "voltar" não devolve o garçom a /dashboard (que o mandaria de novo às mesas).
    expect(router.state.historyAction).toBe('REPLACE');
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/login-anterior');
  });

  it('sends the waiter to Minhas mesas from an area that is not theirs, without passing by /dashboard', async () => {
    const router = renderAt('/pdv/orders', 'WAITER');
    const visited: string[] = [];
    router.subscribe((state) => visited.push(state.location.pathname));
    await waitFor(() => expect(current()).toBe('Minhas mesas em /waiter/tables'));
    expect(visited).not.toContain('/dashboard');
  });

  it.each<Role>(['ADMIN', 'CASHIER', 'FINANCE'])('%s still opens the Dashboard', async (role) => {
    renderAt('/dashboard', role);
    await waitFor(() => expect(current()).toBe('Dashboard em /dashboard'));
  });

  it('FINANCE still falls back to the Dashboard from an area that is not theirs', async () => {
    renderAt('/pdv/orders', 'FINANCE');
    await waitFor(() => expect(current()).toBe('Dashboard em /dashboard'));
  });
});
