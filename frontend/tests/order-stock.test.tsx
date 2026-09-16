import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' } }) }));
vi.mock('../src/hooks/useMenuViewers', () => ({ useMenuViewers: () => undefined }));
import OrdersPage from '../src/pages/pdv/OrdersPage';
import WaiterTablesPage from '../src/pages/waiter/WaiterTablesPage';
import PublicMenuPage from '../src/pages/menu/PublicMenuPage';

const product = (id: string, available?: boolean) => ({
  id, name: id, price: 5, categoryId: 'drinks', isByWeight: false, available,
});
const categories = [{ id: 'drinks', name: 'Bebidas', products: [product('Coca Lata', false), product('Água', true), product('Sem vínculo')] }];
beforeEach(() => {
  mocks.get.mockImplementation(async (url: string) => ({ data:
    url.startsWith('/categories') ? categories :
    url === '/tables' ? [{ id: 'table', number: 1, status: 'OCCUPIED' }] :
    url === '/users' ? [{ id: 'admin', name: 'Operador', role: 'ADMIN' }] :
    url === '/cash-register/current' ? { id: 'session' } :
    url === '/config' ? { name: 'Restaurante' } : [],
  }));
  mocks.post.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openPdv() {
  render(<OrdersPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Novo Pedido' }));
}
async function openWaiter() {
  render(<WaiterTablesPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Mesa 1 Ocupada/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar Itens' }));
}

describe('stock availability at order entry', () => {
  for (const [name, open] of [['PDV', openPdv], ['waiter', openWaiter]] as const) {
    it(`${name} disables unavailable products and keeps unlinked products sellable`, async () => {
      await open();
      const unavailable = screen.getByRole('button', { name: /Coca Lata.*Sem estoque/ }) as HTMLButtonElement;
      expect(unavailable.disabled).toBe(true);
      fireEvent.click(unavailable);
      expect(mocks.post).not.toHaveBeenCalled();
      const unlinked = screen.getByRole('button', { name: /Sem vínculo/ }) as HTMLButtonElement;
      expect(unlinked.disabled).toBe(false);
      fireEvent.click(unlinked);
      expect(screen.getAllByText('Sem vínculo')).toHaveLength(2);
    });
  }
  it('public menu marks unavailable products without an add action', async () => {
    render(<PublicMenuPage />);
    const unavailableName = await screen.findByText('Coca Lata');
    const card = unavailableName.parentElement!.parentElement!;
    expect(card.textContent).toContain('Sem estoque');
    expect(card.querySelector('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Adicionar' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Adicionar' })[1]);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe('stock race at confirmation', () => {
  it('public checkout shows the stock error and retains the cart for correction', async () => {
    mocks.post.mockRejectedValue({ response: { status: 400, data: { message: 'Estoque insuficiente de Água.' } } });
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByPlaceholderText('João Silva'), { target: { value: 'Cliente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar Pedido' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Estoque insuficiente de Água.');
    expect(screen.getByRole('button', { name: 'Finalizar Pedido' })).toBeTruthy();
  });
  it('PDV keeps the modal open with the API message and reuses the key on retry', async () => {
    mocks.post.mockRejectedValue({ response: { status: 400, data: { message: 'Estoque insuficiente de "Água".' } } });
    await openPdv();
    fireEvent.click(screen.getByRole('button', { name: /Água/ }));
    fireEvent.change(screen.getByDisplayValue('Selecione a mesa'), { target: { value: 'table' } });
    fireEvent.change(screen.getByDisplayValue('Responsável pelo Pedido'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Estoque insuficiente de "Água".');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirmar Pedido' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[0][1].idempotencyKey).toBe(mocks.post.mock.calls[1][1].idempotencyKey);
  });
  it('waiter sees the translated stock error inside the order modal', async () => {
    mocks.post.mockRejectedValue({ response: { status: 400, data: { message: 'Insufficient stock of "Água".' } } });
    await openWaiter();
    fireEvent.click(screen.getByRole('button', { name: /Água/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para Cozinha' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Estoque insuficiente de "Água".');
  });
});

describe('payment request volume', () => {
  it.each(['PIX', 'Dinheiro', 'Crédito', 'Débito'])('payment %s performs one write and only three refresh reads', async label => {
    const previousGet = mocks.get.getMockImplementation()!;
    let paid = false;
    const sale = { id: 'short-order', type: 'TAKE_AWAY', status: 'DELIVERED', total: 10, items: [], createdAt: new Date().toISOString(), customerName: 'Cliente' };
    mocks.get.mockImplementation(async (url: string) => url.startsWith('/orders?') ? { data: [{ ...sale, ...(paid ? { status: 'FINISHED', payment: { status: 'PAID', method: 'PIX' } } : {}) }] } : previousGet(url));
    mocks.post.mockImplementation(async () => { paid = true; return { data: {} }; });
    render(<OrdersPage />);
    const button = await screen.findByRole('button', { name: label });
    mocks.get.mockClear();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.get.mock.calls.filter(([url]) => url === '/cash-register/current')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: label, exact: true })).toBeNull());
    expect(mocks.post).toHaveBeenCalledTimes(1);
    // Three payment reads plus one coalesced fiscal batch for the newly finalized order.
    expect(mocks.get.mock.calls.filter(([url]) => url !== '/invoices/orders')).toHaveLength(3);
  });
});
