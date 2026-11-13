import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' } }) }));
vi.mock('../src/hooks/useMenuViewers', () => ({ useMenuViewers: () => undefined }));
vi.mock('../src/hooks/useOrderEvents', () => ({ useOrderEvents: () => undefined }));
import OrdersPage from '../src/pages/pdv/OrdersPage';
import PublicMenuPage from '../src/pages/menu/PublicMenuPage';
import { BrandingContext, DEFAULT_BRANDING_CONTEXT } from '../src/contexts/brandingContext';

const product = (id: string, available?: boolean) => ({
  id, name: id, price: 5, categoryId: 'drinks', isByWeight: false, available,
});
const categories = [{ id: 'drinks', name: 'Bebidas', products: [product('Coca Lata', false), product('Água', true), product('Sem vínculo')] }];
beforeEach(() => {
  mocks.get.mockImplementation(async (url: string) => ({ data:
    url.startsWith('/categories') ? categories :
    url === '/tables/table/tabs?status=OPEN' ? {
      tabs: [{
        id: 'tab', tableId: 'table', name: 'Mesa 1', status: 'OPEN',
        openedAt: new Date().toISOString(), total: 0, balance: 0,
        itemCount: 0, lastOrderAt: null,
      }],
      total: 0,
      balance: 0,
    } :
    url === '/tables' ? [{ id: 'table', number: 1, status: 'OCCUPIED' }] :
    url === '/cash-register/current' ? { id: 'session' } :
    url === '/config' ? {
      name: 'Restaurante',
      urbanDeliveryFee: 1,
      ruralDeliveryFee: 3,
    } : [],
  }));
  mocks.post.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function fillDeliveryAddress() {
  fireEvent.change(screen.getByLabelText('Telefone *'), { target: { value: '11900000000' } });
  fireEvent.change(screen.getByLabelText('Rua *'), { target: { value: 'Rua Fictícia' } });
  fireEvent.change(screen.getByLabelText('Número *'), { target: { value: 'S/N' } });
  fireEvent.change(screen.getByLabelText('Bairro *'), { target: { value: 'Centro' } });
}

async function openPdv() {
  render(<OrdersPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Novo Pedido' }));
}
describe('stock availability at order entry', () => {
  it('PDV disables unavailable products and keeps unlinked products sellable', async () => {
    await openPdv();
    const unavailable = screen.getByRole('button', { name: /Coca Lata.*Sem estoque/ }) as HTMLButtonElement;
    expect(unavailable.disabled).toBe(true);
    fireEvent.click(unavailable);
    expect(mocks.post).not.toHaveBeenCalled();
    const unlinked = screen.getByRole('button', { name: /Sem vínculo/ }) as HTMLButtonElement;
    expect(unlinked.disabled).toBe(false);
    fireEvent.click(unlinked);
    expect(screen.getAllByText('Sem vínculo')).toHaveLength(2);
  });
  it('public menu marks unavailable products without an add action', async () => {
    render(<PublicMenuPage />);
    const unavailableName = await screen.findByText('Coca Lata');
    const card = unavailableName.parentElement!.parentElement!;
    expect(card.textContent).toContain('Esgotado');
    expect(card.querySelector('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Adicionar' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Adicionar' })[1]);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe('public menu and by-weight products', () => {
  it('shows by-weight products as unavailable online, with the reason, and keeps unit products', async () => {
    mocks.get.mockImplementation(async (url: string) => ({
      data: url.startsWith('/categories') ? [{
        id: 'meals',
        name: 'Refeições',
        products: [
          { ...product('Salada por kg', true), isByWeight: true },
          product('Suco', true),
        ],
      }] : [],
    }));
    render(<PublicMenuPage />);
    const byWeightName = await screen.findByText('Salada por kg');
    const card = byWeightName.parentElement!.parentElement!;
    expect(card.textContent).toContain('Só no restaurante');
    expect(card.textContent).toContain('a pesagem é feita no restaurante');
    expect(card.querySelector('button')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Adicionar' })).toHaveLength(1);
  });
});

describe('public delivery checkout', () => {
  it('sends an enabled DB payment method and includes the configured fee in the total', async () => {
    const deliveryCategories = [{
      id: 'meals',
      name: 'Refeições',
      products: [
        { ...product('Item 1', true), price: 4.25 },
        { ...product('Item 2', true), price: 8.9 },
      ],
    }];
    mocks.get.mockImplementation(async (url: string) => ({
      data: url.startsWith('/categories') ? deliveryCategories : [],
    }));
    mocks.post.mockResolvedValue({ data: { id: 'public-order' } });

    render(
      <BrandingContext.Provider value={{
        ...DEFAULT_BRANDING_CONTEXT,
        deliveryFee: 5,
        enabledPayments: 'CASH,PIX',
      }}>
        <PublicMenuPage />
      </BrandingContext.Provider>
    );

    const addButtons = await screen.findAllByRole('button', { name: 'Adicionar' });
    fireEvent.click(addButtons[0]);
    fireEvent.click(addButtons[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByDisplayValue('Retirada no local'), { target: { value: 'DELIVERY' } });

    expect(screen.getByText('R$ 13,15')).toBeTruthy();
    expect(screen.getByText('R$ 5,00')).toBeTruthy();
    expect(screen.getByText('R$ 18,15')).toBeTruthy();
    expect(screen.queryByText('Pagar na Entrega')).toBeNull();

    fireEvent.change(screen.getByDisplayValue('PIX'), { target: { value: 'CASH' } });
    fireEvent.change(screen.getByPlaceholderText('João Silva'), { target: { value: 'Cliente Entrega' } });
    fillDeliveryAddress();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar Pedido' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [url, body] = mocks.post.mock.calls[0];
    expect(url).toBe('/orders/public');
    expect(body).toMatchObject({
      type: 'DELIVERY',
      paymentMethod: 'CASH',
      deliveryFee: 5,
      customerPhone: '11900000000',
      deliveryStreet: 'Rua Fictícia',
      deliveryNumber: 'S/N',
      deliveryNeighborhood: 'Centro',
      deliveryReference: '',
    });
  });

  it('shows the address only for delivery and names the missing fields in Portuguese', async () => {
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    const finish = () => screen.getByRole('button', { name: 'Finalizar Pedido' }) as HTMLButtonElement;

    expect(screen.queryByLabelText('Rua *')).toBeNull();
    expect(screen.getByText('Para finalizar, preencha seu nome.')).toBeTruthy();
    expect(finish().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente' } });
    expect(screen.queryByText(/Para finalizar/)).toBeNull();
    expect(finish().disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Tipo do pedido'), { target: { value: 'DELIVERY' } });
    expect(screen.getByLabelText('Telefone *')).toBeTruthy();
    expect((screen.getByLabelText('Rua *') as HTMLInputElement).autocomplete).toBe('address-line1');
    expect((screen.getByLabelText('Bairro *') as HTMLInputElement).autocomplete).toBe('address-level3');
    expect(screen.getByLabelText('Número *')).toBeTruthy();
    expect(screen.getByLabelText('Referência')).toBeTruthy();
    expect(screen.getByText('Para finalizar, preencha rua, número, bairro e telefone.')).toBeTruthy();
    expect(finish().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Rua *'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Número *'), { target: { value: '12' } });
    expect(screen.getByText('Para finalizar, preencha rua, bairro e telefone.')).toBeTruthy();
    fireEvent.click(finish());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('does not send the typed address after switching back to take-away', async () => {
    mocks.post.mockResolvedValue({ data: { id: 'public-order' } });
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente' } });
    fireEvent.change(screen.getByLabelText('Tipo do pedido'), { target: { value: 'DELIVERY' } });
    fillDeliveryAddress();
    fireEvent.change(screen.getByLabelText('Tipo do pedido'), { target: { value: 'TAKE_AWAY' } });
    expect(screen.queryByLabelText('Rua *')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar Pedido' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const body = mocks.post.mock.calls[0][1];
    expect(body.type).toBe('TAKE_AWAY');
    for (const field of ['deliveryStreet', 'deliveryNumber', 'deliveryNeighborhood', 'deliveryReference']) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('labels every checkout field and lets the phone autofill name and phone', async () => {
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));

    const name = screen.getByLabelText('Seu nome', { exact: false }) as HTMLInputElement;
    expect(name.autocomplete).toBe('name');
    expect(name.name).toBe('name');
    const phone = screen.getByLabelText('Telefone') as HTMLInputElement;
    expect(phone.type).toBe('tel');
    expect(phone.autocomplete).toBe('tel');
    expect(phone.name).toBe('tel');
    expect((screen.getByLabelText('Tipo do pedido') as HTMLSelectElement).value).toBe('TAKE_AWAY');
    expect(screen.getByLabelText('Forma de pagamento').tagName).toBe('SELECT');
  });
});

describe('public checkout with the cash register closed', () => {
  const CLOSED = 'No momento, o restaurante não está aceitando pedidos. Tente novamente mais tarde.';
  const closedRefusal = {
    response: { status: 400, data: { message: 'No cash register session is currently open.', code: 'CASH_REGISTER_CLOSED' } },
  };
  // Resposta de GET /orders/public/availability; o padrão é a consulta não
  // trazer o booleano (estado desconhecido, que não bloqueia).
  let availability: unknown;
  beforeEach(() => {
    availability = [];
    const fallback = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(async (url: string) => (
      url === '/orders/public/availability' ? { data: availability } : fallback(url)
    ));
  });

  it('shows the Portuguese message, keeps every field and lets the same submission go through after reopening', async () => {
    mocks.post.mockRejectedValueOnce(closedRefusal).mockResolvedValueOnce({ data: { id: 'public-order' } });
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente Fictício' } });
    fireEvent.change(screen.getByLabelText('Tipo do pedido'), { target: { value: 'DELIVERY' } });
    fillDeliveryAddress();
    fireEvent.change(screen.getByLabelText('Referência'), { target: { value: 'Portão azul' } });
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'PIX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar Pedido' }));

    expect(await screen.findByText(CLOSED)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/No cash register/)).toBeNull();
    expect(screen.queryByText('Pedido Realizado!')).toBeNull();
    expect((screen.getByLabelText('Seu nome', { exact: false }) as HTMLInputElement).value).toBe('Cliente Fictício');
    expect((screen.getByLabelText('Tipo do pedido') as HTMLSelectElement).value).toBe('DELIVERY');
    expect((screen.getByLabelText('Forma de pagamento') as HTMLSelectElement).value).toBe('PIX');
    expect((screen.getByLabelText('Telefone *') as HTMLInputElement).value).toBe('11900000000');
    expect((screen.getByLabelText('Rua *') as HTMLInputElement).value).toBe('Rua Fictícia');
    expect((screen.getByLabelText('Número *') as HTMLInputElement).value).toBe('S/N');
    expect((screen.getByLabelText('Bairro *') as HTMLInputElement).value).toBe('Centro');
    expect((screen.getByLabelText('Referência') as HTMLInputElement).value).toBe('Portão azul');
    const finish = screen.getByRole('button', { name: 'Finalizar Pedido' }) as HTMLButtonElement;
    // A recusa no envio confirma o caixa fechado: só a finalização fica bloqueada.
    expect(finish.disabled).toBe(true);

    availability = { acceptingOrders: true };
    fireEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }));
    await waitFor(() => expect(finish.disabled).toBe(false));
    expect(screen.queryByText(CLOSED)).toBeNull();

    fireEvent.click(finish);
    expect(await screen.findByText('Pedido Realizado!')).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledTimes(2);
    const [first, retry] = mocks.post.mock.calls;
    // O carrinho e os dados continuam os mesmos na nova tentativa.
    expect(first[1].items).toHaveLength(1);
    expect(retry[1]).toEqual(first[1]);
    expect(retry[1]).toMatchObject({
      type: 'DELIVERY', paymentMethod: 'PIX', customerName: 'Cliente Fictício', customerPhone: '11900000000',
      deliveryStreet: 'Rua Fictícia', deliveryNumber: 'S/N', deliveryNeighborhood: 'Centro', deliveryReference: 'Portão azul',
    });
    expect(retry[2].headers['X-Idempotency-Key']).toBe(first[2].headers['X-Idempotency-Key']);
  });

  it('recognizes the closed register by code, not by the English text', async () => {
    mocks.post.mockRejectedValue({ response: { status: 400, data: { message: 'Outro texto qualquer', code: 'CASH_REGISTER_CLOSED' } } });
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar Pedido' }));
    expect(await screen.findByText(CLOSED)).toBeTruthy();
    expect(screen.queryByText('Outro texto qualquer')).toBeNull();
  });

  it('does not treat a network failure or another refusal as a closed register', async () => {
    mocks.post.mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Forma de pagamento indisponível.', code: 'VALIDATION_ERROR' } } });
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar Pedido' }));
    expect((await screen.findByRole('alert')).textContent)
      .toBe('Não foi possível confirmar o pedido. Verifique a conexão e tente novamente.');

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar Pedido' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Forma de pagamento indisponível.'));
  });

  const availabilityCalls = () => mocks.get.mock.calls.filter(([url]) => url === '/orders/public/availability').length;

  it('warns on the menu when closed, keeps browsing and the cart, and disables only the finish button', async () => {
    availability = { acceptingOrders: false };
    render(<PublicMenuPage />);
    expect(await screen.findByText(CLOSED)).toBeTruthy();
    expect(screen.getByText(/carrinho e os dados preenchidos ficam guardados/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bebidas' }));
    const add = screen.getAllByRole('button', { name: 'Adicionar' })[0] as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente Fictício' } });
    fireEvent.change(screen.getByLabelText('Tipo do pedido'), { target: { value: 'DELIVERY' } });
    fillDeliveryAddress();

    await waitFor(() => expect(availabilityCalls()).toBe(2));
    expect(screen.getAllByText(CLOSED)).toHaveLength(1);
    const finish = screen.getByRole('button', { name: 'Finalizar Pedido' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);
    expect(finish.getAttribute('aria-describedby')).toBe('checkout-ordering-closed');
    fireEvent.click(finish);
    expect(mocks.post).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Tipo do pedido') as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByLabelText('Forma de pagamento') as HTMLSelectElement).disabled).toBe(false);
  });

  it('checks again when the cart opens and after "Verificar novamente", keeping every field, and sends one order', async () => {
    availability = { acceptingOrders: false };
    mocks.post.mockResolvedValue({ data: { id: 'public-order' } });
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente Fictício' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11900000000' } });
    const finish = screen.getByRole('button', { name: 'Finalizar Pedido' }) as HTMLButtonElement;
    await waitFor(() => expect(availabilityCalls()).toBe(2));
    expect(finish.disabled).toBe(true);

    // Ainda fechado na nova consulta: segue bloqueado, com os dados no lugar.
    fireEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }));
    await waitFor(() => expect(availabilityCalls()).toBe(3));
    await screen.findByRole('button', { name: 'Verificar novamente' });
    expect(finish.disabled).toBe(true);

    availability = { acceptingOrders: true };
    fireEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }));
    await waitFor(() => expect(finish.disabled).toBe(false));
    expect(screen.queryByText(CLOSED)).toBeNull();
    expect((screen.getByLabelText('Seu nome', { exact: false }) as HTMLInputElement).value).toBe('Cliente Fictício');
    expect((screen.getByLabelText('Telefone') as HTMLInputElement).value).toBe('11900000000');

    fireEvent.click(finish);
    expect(await screen.findByText('Pedido Realizado!')).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it('lets the customer try the normal flow when the availability lookup fails', async () => {
    const fallback = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/orders/public/availability') throw new Error('Network Error');
      return fallback(url);
    });
    mocks.post.mockResolvedValue({ data: { id: 'public-order' } });
    render(<PublicMenuPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente' } });
    await waitFor(() => expect(availabilityCalls()).toBe(2));
    expect(screen.queryByText(CLOSED)).toBeNull();
    const finish = screen.getByRole('button', { name: 'Finalizar Pedido' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(false);
    fireEvent.click(finish);
    expect(await screen.findByText('Pedido Realizado!')).toBeTruthy();
  });

  it('a lookup that fails after a closed answer stops blocking the finish button', async () => {
    availability = { acceptingOrders: false };
    render(<PublicMenuPage />);
    expect(await screen.findByText(CLOSED)).toBeTruthy();
    const fallback = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/orders/public/availability') throw new Error('Network Error');
      return fallback(url);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Adicionar' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carrinho' }));
    fireEvent.change(screen.getByLabelText('Seu nome', { exact: false }), { target: { value: 'Cliente' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Finalizar Pedido' }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('PDV delivery fee selection', () => {
  it('defaults to urban and requires a value when selecting another fee', async () => {
    await openPdv();
    fireEvent.click(screen.getByRole('button', { name: /Água/ }));
    fireEvent.change(screen.getByDisplayValue('Mesa'), { target: { value: 'DELIVERY' } });

    expect((screen.getByRole('radio', { name: /Urbana/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Outra/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));

    expect((await screen.findAllByText('Informe o valor da taxa personalizada.')).length).toBeGreaterThanOrEqual(1);

    const customFee = screen.getByLabelText('Valor da taxa personalizada', { exact: false }) as HTMLInputElement;
    fireEvent.change(customFee, { target: { value: '0' } });
    expect(customFee.value).toContain('0,00');

    fireEvent.click(screen.getByRole('radio', { name: /Sem taxa/ }));
    expect(screen.queryByLabelText('Valor da taxa personalizada', { exact: false })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Cliente da entrega'), { target: { value: 'Cliente' } });
    fireEvent.change(screen.getByPlaceholderText('Telefone *'), { target: { value: '11999999999' } });
    fireEvent.change(screen.getByPlaceholderText('Rua *'), { target: { value: 'Rua A' } });
    fireEvent.change(screen.getByPlaceholderText('Número *'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('Bairro *'), { target: { value: 'Centro' } });
    mocks.post.mockResolvedValue({ data: { id: 'order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0][1]).toMatchObject({
      type: 'DELIVERY',
      deliveryType: 'NONE',
      deliveryFee: 0,
    });
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
    fireEvent.change(await screen.findByDisplayValue('Selecione a comanda'), {
      target: { value: 'tab' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Estoque insuficiente de "Água".');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirmar Pedido' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[0][1].idempotencyKey).toBe(mocks.post.mock.calls[1][1].idempotencyKey);
  });
});

describe('order payment visibility', () => {
  it('identifies an online order and shows pending payment before it is finished', async () => {
    const previousGet = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(async (url: string) => url.startsWith('/orders?') ? {
      data: [{
        id: 'online-order',
        type: 'DELIVERY',
        source: 'PUBLIC_MENU',
        status: 'NEW',
        total: 16,
        items: [],
        createdAt: new Date().toISOString(),
        customerName: 'Cliente Online',
        payment: { method: 'CASH', status: 'PENDING' },
      }],
    } : previousGet(url));

    render(<OrdersPage />);

    expect(await screen.findByText('Pedido online')).toBeTruthy();
    expect(screen.getByText('DINHEIRO')).toBeTruthy();
    expect(screen.getByText('A RECEBER')).toBeTruthy();
    expect(screen.getByText('Cobrar R$ 16,00')).toBeTruthy();
  });
});

describe('order card responsible person', () => {
  it('shows the waiter for a tab order, the creator for a PDV order and nobody for the public menu', async () => {
    const previousGet = mocks.get.getMockImplementation()!;
    const base = { status: 'NEW', total: 10, items: [], createdAt: new Date().toISOString() };
    mocks.get.mockImplementation(async (url: string) => url.startsWith('/orders?') ? {
      data: [
        {
          ...base, id: 'pdv-order', type: 'TAKE_AWAY', source: 'PDV', customerName: 'Cliente PDV',
          userId: 'cashier-1', waiterId: null,
          user: { id: 'cashier-1', name: 'Caixa Fictício' }, waiter: null,
        },
        {
          ...base, id: 'waiter-order', type: 'DINE_IN', source: 'WAITER',
          userId: 'waiter-1', waiterId: 'waiter-1',
          user: { id: 'waiter-1', name: 'Garçom Fictício' }, waiter: { id: 'waiter-1', name: 'Garçom Fictício' },
        },
        {
          ...base, id: 'public-order', type: 'TAKE_AWAY', source: 'PUBLIC_MENU', customerName: 'Cliente Online',
          userId: null, waiterId: null, user: null, waiter: null,
        },
      ],
    } : previousGet(url));

    render(<OrdersPage />);

    expect(await screen.findByText('Responsável: Caixa Fictício')).toBeTruthy();
    expect(screen.getByText('Responsável: Garçom Fictício')).toBeTruthy();
    expect(screen.getAllByText(/^Responsável:/)).toHaveLength(2);
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
