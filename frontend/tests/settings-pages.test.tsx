import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider, useLocation, type InitialEntry } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MainLayout from '../src/components/layout/MainLayout';
import { ToastProvider } from '../src/components/ui';
import FiscalSettingsPage from '../src/pages/settings/FiscalSettingsPage';
import RestaurantSettingsPage from '../src/pages/settings/RestaurantSettingsPage';
import type { RestaurantConfig } from '../src/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', name: 'Administrador', role: 'ADMIN' },
    signOut: mocks.signOut,
  }),
}));

const fullConfig: RestaurantConfig = {
  id: 'config-1',
  name: 'Casarão',
  phone: '(11) 99999-9999',
  address: 'Rua Principal, 10',
  openingHours: '11h às 23h',
  openingDays: 'Segunda a Domingo',
  logoUrl: 'https://example.com/logo.png',
  bannerUrl: 'https://example.com/banner.png',
  deliveryFee: 8.5,
  urbanDeliveryFee: 7,
  ruralDeliveryFee: 12,
  enabledPayments: 'PIX,CARD',
  nfceEnabled: true,
  nfceGroupItems: false,
  nfceGroupedItemDescription: 'REFEICAO',
  cnpj: '12.345.678/0001-90',
  legalName: 'Casarão Restaurante LTDA',
  stateRegistration: '123456789',
  taxRegime: '4',
  fiscalZipCode: '01001000',
  fiscalStreet: 'Praça da Sé',
  fiscalNumber: '100',
  fiscalNeighborhood: 'Sé',
  fiscalCity: 'São Paulo',
  fiscalCityIbgeCode: '3550308',
  fiscalState: 'SP',
  defaultCfop: '5102',
  defaultNcm: '21069090',
  defaultTaxCode: '102',
  defaultOrigin: '0',
};

const apiConfig = {
  ...fullConfig,
  createdAt: '2026-09-20T10:00:00Z',
  updatedAt: '2026-09-20T11:00:00Z',
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Localização atual">{location.pathname}{location.search}</output>;
}

function createSettingsRouter(initialEntries: InitialEntry[] = ['/settings/restaurant'], initialIndex?: number) {
  return createMemoryRouter([
    {
      path: '/settings/restaurant',
      element: <><Link to="/dashboard">Ir para o painel</Link><Link to="/settings/fiscal">Documentos Fiscais</Link><RestaurantSettingsPage /><LocationProbe /></>,
    },
    {
      path: '/settings/fiscal',
      element: <><Link to="/dashboard">Ir para o painel</Link><Link to="/settings/restaurant">Restaurante</Link><FiscalSettingsPage /><LocationProbe /></>,
    },
    { path: '/dashboard', element: <><div>Painel de destino</div><LocationProbe /></> },
  ], { initialEntries, initialIndex });
}

function renderSettings(initialEntries?: InitialEntry[], initialIndex?: number) {
  const router = createSettingsRouter(initialEntries, initialIndex);
  const result = render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  return { ...result, router };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.signOut.mockReset();
  mocks.get.mockResolvedValue({ data: { ...apiConfig } });
  mocks.put.mockResolvedValue({ data: {} });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Settings pages and routes', () => {
  it('renders 8 restaurant fields on its own route without tabs or query string', async () => {
    renderSettings();
    const labels = [
      'Nome do Restaurante', 'Telefone', 'Endereço', 'Horário de Funcionamento',
      'Dias de Funcionamento', 'Logo do restaurante', 'Banner do cardápio digital',
      'Taxa urbana', 'Taxa rural', 'Taxa do cardápio digital',
    ];

    await screen.findByRole('heading', { name: 'Restaurante' });
    labels.forEach((label) => expect(screen.getByLabelText(label)).toBeTruthy());
    expect(labels).toHaveLength(10);
    expect(screen.getByText('Aplicada em pedidos de entrega dentro da cidade, no PDV.')).toBeTruthy();
    expect(screen.getByText('Aplicada em pedidos de entrega em zona rural, no PDV.')).toBeTruthy();
    expect(screen.getByText('Cobrada em todos os pedidos de entrega feitos pelo cardápio online.')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByLabelText('Localização atual').textContent).toBe('/settings/restaurant');
  });

  it('renders 18 fiscal fields on its own route without tabs or query string', async () => {
    renderSettings(['/settings/fiscal']);
    const labels = [
      'Habilitar emissão de NFC-e no PDV', 'Emitir NFC-e com item único',
      'Descrição do item', 'CNPJ', 'Razão Social', 'Inscrição Estadual',
      'Regime tributário', 'CEP', 'Logradouro', 'Número', 'Bairro', 'Cidade',
      'Código IBGE', 'UF', 'CFOP padrão', 'NCM padrão',
      'Código tributário padrão', 'Origem padrão',
    ];

    await screen.findByRole('heading', { name: 'Documentos Fiscais' });
    labels.forEach((label) => expect(screen.getByLabelText(label, { exact: false })).toBeTruthy());
    expect(labels).toHaveLength(18);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByLabelText('Localização atual').textContent).toBe('/settings/fiscal');
  });

  it('saves restaurant changes with the complete original config payload', async () => {
    renderSettings();
    const deliveryFee = await screen.findByLabelText('Taxa do cardápio digital');
    fireEvent.change(deliveryFee, { target: { value: '13115' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith('/config', {
      ...apiConfig,
      deliveryFee: 131.15,
      cnpj: '12345678000190',
      nfceGroupedItemDescription: 'REFEICAO',
    });
  });

  it('saves an emptied delivery fee explicitly as zero without losing the other fees', async () => {
    renderSettings();
    const urbanFee = await screen.findByLabelText('Taxa urbana');
    fireEvent.change(urbanFee, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith('/config', {
      ...apiConfig,
      urbanDeliveryFee: 0,
      cnpj: '12345678000190',
      nfceGroupedItemDescription: 'REFEICAO',
    });
  });

  it('saves fiscal changes with the complete original config payload', async () => {
    mocks.get.mockResolvedValue({ data: { ...apiConfig, nfceGroupedItemDescription: '  REFEICAO  ' } });
    renderSettings(['/settings/fiscal']);
    const legalName = await screen.findByLabelText('Razão Social');
    fireEvent.change(legalName, { target: { value: 'Nova Razão Social LTDA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith('/config', {
      ...apiConfig,
      legalName: 'Nova Razão Social LTDA',
      cnpj: '12345678000190',
      nfceGroupedItemDescription: 'REFEICAO',
    });
  });

  it('highlights and focuses the first invalid field on the fiscal page', async () => {
    mocks.get.mockResolvedValue({ data: { ...apiConfig, nfceGroupItems: true, nfceGroupedItemDescription: '   ' } });
    renderSettings(['/settings/fiscal']);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }));

    const description = screen.getByLabelText('Descrição do item', { exact: false });
    expect(description.getAttribute('aria-invalid')).toBe('true');
    expect((await screen.findAllByText('A descrição do item agrupado deve ter entre 1 e 120 caracteres.')).length).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(document.activeElement).toBe(description));
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('blocks navigation to the other settings sub-item while changes are pending', async () => {
    renderSettings();
    fireEvent.change(await screen.findByLabelText('Nome do Restaurante'), { target: { value: 'Casarão alterado' } });

    fireEvent.click(screen.getByRole('link', { name: 'Documentos Fiscais' }));
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText('Localização atual').textContent).toBe('/settings/restaurant');

    fireEvent.click(screen.getByRole('link', { name: 'Documentos Fiscais' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sair sem salvar' }));
    expect(await screen.findByRole('heading', { name: 'Documentos Fiscais' })).toBeTruthy();
  });

  it('blocks browser back and forward navigation while changes are pending', async () => {
    const back = renderSettings(['/dashboard', '/settings/fiscal'], 1);
    fireEvent.change(await screen.findByLabelText('CNPJ'), { target: { value: '11222333000144' } });
    void back.router.navigate(-1);
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText('Localização atual').textContent).toBe('/settings/fiscal');
    back.unmount();

    const forward = renderSettings(['/settings/restaurant', '/dashboard'], 0);
    fireEvent.change(await screen.findByLabelText('Nome do Restaurante'), { target: { value: 'Outro nome' } });
    void forward.router.navigate(1);
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
    expect(await screen.findByText('Painel de destino')).toBeTruthy();
  });

  it('registers the native unload warning and keeps copy feedback', async () => {
    renderSettings();
    fireEvent.change(await screen.findByLabelText('Nome do Restaurante'), { target: { value: 'Outro nome' } });
    const event = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(event, 'returnValue', { configurable: true, value: null, writable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    await screen.findByText('Configurações salvas com sucesso');
    await waitFor(() => {
      const savedEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(savedEvent);
      expect(savedEvent.defaultPrevented).toBe(false);
      expect(savedEvent.returnValue).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copiar Link' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/cardapio`));
    expect(await screen.findByText('Link do cardápio copiado')).toBeTruthy();
  });
});

describe('Settings sidebar group', () => {
  it('expands like other groups and highlights the active settings child', async () => {
    const router = createMemoryRouter([
      { path: '*', element: <MainLayout><LocationProbe /></MainLayout> },
    ], { initialEntries: ['/dashboard'] });
    render(<RouterProvider router={router} />);

    expect(screen.queryByRole('link', { name: 'Restaurante' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Configurações' })[0]);
    fireEvent.click(screen.getByRole('link', { name: 'Restaurante' }));

    await waitFor(() => expect(screen.getByLabelText('Localização atual').textContent).toBe('/settings/restaurant'));
    expect(screen.getAllByRole('link', { name: 'Restaurante' }).some((link) => link.className.includes('bg-primary-600'))).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Documentos Fiscais' }).length).toBeGreaterThan(0);
  });
});
