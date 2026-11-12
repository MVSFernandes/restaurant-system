import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/ui';
import { parsePromiseMinutesInput, promiseMinutesError } from '../src/lib/orderPromise';
import RestaurantSettingsPage from '../src/pages/settings/RestaurantSettingsPage';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/contexts/brandingContext', () => ({ useBranding: () => ({ refresh: vi.fn() }) }));

const baseConfig = {
  id: 'config-1',
  name: 'Restaurante Fictício',
  nfceGroupedItemDescription: 'REFEICAO',
};

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/settings/restaurant', element: <RestaurantSettingsPage /> }],
    { initialEntries: ['/settings/restaurant'] }
  );
  return render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.put.mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('order promise minutes (helpers)', () => {
  it('empty input means no deadline; anything else is validated as a positive integer', () => {
    expect(parsePromiseMinutesInput('')).toBeNull();
    expect(parsePromiseMinutesInput('  ')).toBeNull();
    expect(parsePromiseMinutesInput('45')).toBe(45);
    expect(promiseMinutesError(null)).toBeUndefined();
    expect(promiseMinutesError(undefined)).toBeUndefined();
    expect(promiseMinutesError(1)).toBeUndefined();
    for (const value of [0, -5, 12.5, Number.NaN]) expect(promiseMinutesError(value)).toBeTruthy();
  });
});

describe('Restaurant settings: order deadline card', () => {
  it('shows one empty field per order type when nothing is configured', async () => {
    mocks.get.mockResolvedValue({
      data: { ...baseConfig, orderPromiseMinutes: { DINE_IN: null, TAKE_AWAY: null, DELIVERY: null } },
    });
    renderPage();
    for (const label of ['Mesa', 'Retirada', 'Entrega']) {
      expect(((await screen.findByLabelText(label)) as HTMLInputElement).value).toBe('');
    }
    expect(screen.getByText('Prazo dos pedidos')).toBeTruthy();
  });

  it('shows saved minutes and saves changes as one object per type, empty as null', async () => {
    mocks.get.mockResolvedValue({
      data: { ...baseConfig, orderPromiseMinutes: { DINE_IN: null, TAKE_AWAY: 20, DELIVERY: 45 } },
    });
    renderPage();
    const delivery = (await screen.findByLabelText('Entrega')) as HTMLInputElement;
    expect(delivery.value).toBe('45');
    expect((screen.getByLabelText('Retirada') as HTMLInputElement).value).toBe('20');

    fireEvent.change(screen.getByLabelText('Mesa'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Retirada'), { target: { value: '' } });
    fireEvent.change(delivery, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put.mock.calls[0][1].orderPromiseMinutes).toEqual({ DINE_IN: 15, TAKE_AWAY: null, DELIVERY: 50 });
  });

  it('blocks saving zero or fractional minutes and points to the card', async () => {
    mocks.get.mockResolvedValue({
      data: { ...baseConfig, orderPromiseMinutes: { DINE_IN: null, TAKE_AWAY: null, DELIVERY: null } },
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Retirada'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Entrega'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(screen.getByLabelText('Retirada').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Entrega').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Mesa').getAttribute('aria-invalid')).not.toBe('true');
    await waitFor(() => expect(document.activeElement?.id).toBe('settings-orderPromiseMinutes'));
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
