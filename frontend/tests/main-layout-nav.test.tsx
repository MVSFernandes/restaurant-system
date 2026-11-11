import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MainLayout from '../src/components/layout/MainLayout';
import type { Role } from '../src/types';

const auth = vi.hoisted(() => ({ role: 'ADMIN' as Role, signOut: vi.fn() }));

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Pessoa Teste', role: auth.role }, signOut: auth.signOut }),
}));

function LocationProbe() {
  return <p aria-label="Localização atual">{useLocation().pathname}</p>;
}

function renderAt(path: string, role: Role = 'ADMIN') {
  auth.role = role;
  const router = createMemoryRouter([
    { path: '*', element: <MainLayout><LocationProbe /></MainLayout> },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

// Duas cópias da navegação ficam no DOM (desktop e gaveta do celular).
const desktopNav = () => screen.getAllByRole('navigation', { name: 'Navegação principal' })[0];
const breadcrumb = () =>
  within(screen.getByRole('navigation', { name: 'Você está em' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('Operação: Pedidos, Mesas e Caixa', () => {
  it('replaces PDV with Pedidos and Caixa groups and a direct Mesas link', () => {
    renderAt('/dashboard');
    const nav = within(desktopNav());
    expect(nav.queryByRole('button', { name: 'PDV' })).toBeNull();
    expect(nav.getByRole('button', { name: 'Pedidos' })).toBeTruthy();
    expect(nav.getByRole('button', { name: 'Caixa' })).toBeTruthy();
    expect(nav.getByRole('link', { name: 'Mesas' }).getAttribute('href')).toBe('/pdv/tables');

    fireEvent.click(nav.getByRole('button', { name: 'Pedidos' }));
    expect(nav.getByRole('link', { name: 'Pedidos' }).getAttribute('href')).toBe('/pdv/orders');
    expect(nav.getByRole('link', { name: 'Histórico de pedidos' }).getAttribute('href')).toBe('/pdv/orders-history');

    fireEvent.click(nav.getByRole('button', { name: 'Caixa' }));
    expect(nav.getByRole('link', { name: 'Abertura/Fechamento' }).getAttribute('href')).toBe('/pdv/cash-register');
    expect(nav.getByRole('link', { name: 'Fechamentos de caixa' }).getAttribute('href')).toBe('/pdv/cash-closures');
  });

  it('opens and highlights the group of the active child', () => {
    renderAt('/pdv/orders-history');
    const nav = within(desktopNav());
    const group = nav.getByRole('button', { name: 'Pedidos' });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(group.className).toContain('text-sidebar-fg-active');
    expect(nav.getByRole('link', { name: 'Histórico de pedidos' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('button', { name: 'Caixa' }).getAttribute('aria-expanded')).toBe('false');
    expect(breadcrumb()).toEqual(['Pedidos', 'Histórico de pedidos']);
  });

  it('builds breadcrumbs for Mesas and Caixa', () => {
    renderAt('/pdv/tables');
    expect(breadcrumb()).toEqual(['Mesas']);
    expect(within(desktopNav()).getByRole('link', { name: 'Mesas' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    renderAt('/pdv/cash-closures');
    expect(breadcrumb()).toEqual(['Caixa', 'Fechamentos de caixa']);
    cleanup();
    renderAt('/pdv/orders');
    expect(breadcrumb()).toEqual(['Pedidos']);
  });
});

describe('navigation per role', () => {
  const visibleTopLevel = () =>
    // nav > lista de seções > seção > ul > li: só o primeiro nível.
    Array.from(desktopNav().querySelectorAll(':scope > div > div > ul > li')).map(
      (li) => li.firstElementChild?.textContent?.trim()
    );

  it.each<[Role, string[]]>([
    ['ADMIN', ['Dashboard', 'Pedidos', 'Mesas', 'Caixa', 'Mesas do garçom', 'Cardápio', 'Estoque', 'Financeiro', 'Configurações', 'Garçons']],
    ['CASHIER', ['Dashboard', 'Pedidos', 'Mesas', 'Caixa', 'Produtos']],
    ['FINANCE', ['Dashboard', 'Estoque', 'Financeiro']],
    ['WAITER', ['Dashboard', 'Mesas do garçom']],
  ])('%s sees only its entries', (role, expected) => {
    renderAt('/dashboard', role);
    expect(visibleTopLevel()).toEqual(expected);
  });

  it('uses the role-filtered nav for breadcrumbs', () => {
    renderAt('/menu/products', 'CASHIER');
    expect(breadcrumb()).toEqual(['Produtos']);
    cleanup();
    renderAt('/menu/products', 'ADMIN');
    expect(breadcrumb()).toEqual(['Cardápio', 'Produtos']);
  });
});

describe('desktop collapsed state', () => {
  it('persists across reloads', () => {
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Recolher menu' }));
    expect(window.localStorage.getItem('mainLayout.sidebarCollapsed')).toBe('true');
    cleanup();

    renderAt('/dashboard');
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir menu' }));
    expect(window.localStorage.getItem('mainLayout.sidebarCollapsed')).toBe('false');
  });

  it('falls back to expanded when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderAt('/dashboard');
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toBeTruthy();
    spy.mockRestore();
  });
});

describe('mobile drawer focus', () => {
  const flushFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const drawer = () => screen.getByRole('dialog', { name: 'Menu' });

  it('moves focus in, traps Tab and returns focus on Escape', async () => {
    renderAt('/dashboard', 'WAITER');
    const menuButton = screen.getByRole('button', { name: 'Abrir menu' });
    menuButton.focus();
    fireEvent.click(menuButton);
    await flushFrame();

    const close = within(drawer()).getByRole('button', { name: 'Fechar menu' });
    expect(document.activeElement).toBe(close);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');

    // Shift+Tab no primeiro vai para o último; Tab no último volta ao primeiro.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    const logout = within(drawer()).getByRole('button', { name: 'Sair' });
    expect(document.activeElement).toBe(logout);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    expect(document.activeElement).toBe(menuButton);
  });

  it('closes on outside tap and on route change, returning focus', async () => {
    renderAt('/dashboard', 'CASHIER');
    const menuButton = screen.getByRole('button', { name: 'Abrir menu' });

    fireEvent.click(menuButton);
    await flushFrame();
    const overlay = document.querySelector('div.fixed.inset-0[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    expect(document.activeElement).toBe(menuButton);

    fireEvent.click(menuButton);
    await flushFrame();
    fireEvent.click(within(drawer()).getByRole('link', { name: 'Mesas' }));
    await waitFor(() => expect(screen.getByLabelText('Localização atual').textContent).toBe('/pdv/tables'));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    expect(document.activeElement).toBe(menuButton);
  });
});
