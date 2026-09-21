import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryFeeSelector } from '../src/components/orders/DeliveryFeeSelector';
import { EditOrderModal } from '../src/components/modals/EditOrderModal';
import {
  deliveryFeeForSelection,
  type DeliveryFeeType,
} from '../src/lib/deliveryFees';
import type { Category, Order } from '../src/types';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));

function SelectorHarness() {
  const [type, setType] = useState<DeliveryFeeType>('URBAN');
  const [customFee, setCustomFee] = useState<number | null>(null);
  const currentFee = deliveryFeeForSelection(
    type,
    { urbanDeliveryFee: 0, ruralDeliveryFee: 3 },
    customFee
  );

  return (
    <>
      <DeliveryFeeSelector
        value={type}
        urbanFee={0}
        ruralFee={3}
        customFee={customFee}
        onValueChange={setType}
        onCustomFeeChange={setCustomFee}
      />
      <output aria-label="Taxa atual">{currentFee === null ? 'vazia' : currentFee}</output>
    </>
  );
}

const product = {
  id: 'meal',
  name: 'Refeição',
  description: '',
  price: 10,
  categoryId: 'meals',
  isByWeight: false,
};

const categories = [{
  id: 'meals',
  name: 'Refeições',
  products: [product],
}] as Category[];

const deliveryOrder = {
  id: 'order-1',
  type: 'DELIVERY',
  status: 'NEW',
  total: 11,
  deliveryFee: 1,
  deliveryType: 'URBAN',
  customerName: 'Cliente',
  deliveryStreet: 'Rua A',
  deliveryNumber: '10',
  deliveryNeighborhood: 'Centro',
  deliveryPhone: '11999999999',
  deliveryReference: '',
  deliveryNotes: '',
  items: [{
    id: 'item-1',
    orderId: 'order-1',
    productId: 'meal',
    product,
    quantity: 1,
    price: 10,
    unitPrice: 10,
    manualPrice: null,
    saleType: 'UNIT',
    notes: '',
  }],
} as unknown as Order;

beforeEach(() => {
  mocks.get.mockReset();
  mocks.patch.mockReset();
  mocks.get.mockResolvedValue({
    data: { urbanDeliveryFee: 4, ruralDeliveryFee: 8 },
  });
  mocks.patch.mockResolvedValue({ data: {} });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('delivery fee choices', () => {
  it('supports urban zero, rural and a required custom numeric value', () => {
    render(<SelectorHarness />);

    expect((screen.getByRole('radio', { name: /Urbana/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText('Taxa atual').textContent).toBe('0');

    fireEvent.click(screen.getByRole('radio', { name: /Rural/ }));
    expect(screen.getByLabelText('Taxa atual').textContent).toBe('3');

    fireEvent.click(screen.getByRole('radio', { name: /Outra/ }));
    expect(screen.getByLabelText('Taxa atual').textContent).toBe('vazia');

    fireEvent.change(screen.getByLabelText('Valor da taxa personalizada', { exact: false }), {
      target: { value: '1250' },
    });
    expect(screen.getByLabelText('Taxa atual').textContent).toBe('12.5');
  });

  it('keeps the fee stored on an existing order when configuration changes', async () => {
    render(
      <EditOrderModal
        order={deliveryOrder}
        categories={categories}
        onClose={() => undefined}
        onSave={() => undefined}
      />
    );

    expect(await screen.findByText('Taxa gravada neste pedido: R$ 1,00')).toBeTruthy();
    expect(screen.getByText('R$ 11,00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls[0][1]).toMatchObject({
      deliveryType: 'URBAN',
      deliveryFee: 1,
    });
  });
});
