import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/ui';
import SettingsPage from '../src/pages/SettingsPage';
import type { RestaurantConfig } from '../src/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: mocks }));

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

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Localização atual">{location.pathname}{location.search}</output>;
}

function renderSettings(initialEntry = '/settings') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <Routes>
          <Route path="/settings" element={<><Link to="/dashboard">Ir para o painel</Link><SettingsPage /><LocationProbe /></>} />
          <Route path="/dashboard" element={<div>Painel de destino</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.get.mockResolvedValue({ data: { ...fullConfig } });
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

describe('Settings tabs', () => {
  it('keeps all 26 fields in their tabs and reflects the active tab in the URL', async () => {
    renderSettings();

    const restaurantTab = await screen.findByRole('tab', { name: 'Restaurante' });
    const fiscalTab = screen.getByRole('tab', { name: 'Documentos Fiscais' });
    expect(restaurantTab.getAttribute('aria-selected')).toBe('true');

    const restaurantLabels = [
      'Nome do Restaurante', 'Telefone', 'Endereço', 'Horário de Funcionamento',
      'Dias de Funcionamento', 'URL do Logo', 'URL do Banner (Cardápio Digital)',
      'Taxa de Entrega',
    ];
    restaurantLabels.forEach((label) => expect(screen.getByLabelText(label)).toBeTruthy());

    restaurantTab.focus();
    fireEvent.keyDown(restaurantTab.closest('[role="tablist"]')!, { key: 'ArrowRight' });

    await waitFor(() => expect(fiscalTab.getAttribute('aria-selected')).toBe('true'));
    expect(screen.getByLabelText('Localização atual').textContent).toBe('/settings?aba=fiscal');

    const fiscalLabels = [
      'Habilitar emissão de NFC-e no PDV', 'Emitir NFC-e com item único',
      'Descrição do item', 'CNPJ', 'Razão Social', 'Inscrição Estadual',
      'Regime tributário', 'CEP', 'Logradouro', 'Número', 'Bairro', 'Cidade',
      'Código IBGE', 'UF', 'CFOP padrão', 'NCM padrão',
      'Código tributário padrão', 'Origem padrão',
    ];
    fiscalLabels.forEach((label) => expect(screen.getByLabelText(label, { exact: false })).toBeTruthy());
    expect(restaurantLabels).toHaveLength(8);
    expect(fiscalLabels).toHaveLength(18);
  });

  it('restores the fiscal tab from the URL and falls back to restaurant for invalid values', async () => {
    const firstRender = renderSettings('/settings?aba=fiscal');
    expect((await screen.findByRole('tab', { name: 'Documentos Fiscais' })).getAttribute('aria-selected')).toBe('true');
    firstRender.unmount();

    renderSettings('/settings?aba=desconhecida');
    expect((await screen.findByRole('tab', { name: 'Restaurante' })).getAttribute('aria-selected')).toBe('true');
  });

  it('marks and opens the fiscal tab, then focuses the first invalid field', async () => {
    mocks.get.mockResolvedValue({
      data: { ...fullConfig, nfceGroupItems: true, nfceGroupedItemDescription: '   ' },
    });
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }));

    const fiscalTab = await screen.findByRole('tab', { name: /Documentos Fiscais/ });
    await waitFor(() => expect(fiscalTab.getAttribute('aria-selected')).toBe('true'));
    expect(within(fiscalTab).getByText('1')).toBeTruthy();
    const description = screen.getByLabelText('Descrição do item', { exact: false });
    expect(description.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(description));
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('keeps the original single PUT payload, including fields that are not rendered', async () => {
    mocks.get.mockResolvedValue({
      data: { ...fullConfig, nfceGroupedItemDescription: '  REFEICAO  ' },
    });
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith('/config', {
      ...fullConfig,
      cnpj: '12345678000190',
      nfceGroupedItemDescription: 'REFEICAO',
    });
    expect(await screen.findByText('Configurações salvas com sucesso')).toBeTruthy();
  });

  it('asks for confirmation when leaving with unsaved changes', async () => {
    renderSettings();
    const name = await screen.findByLabelText('Nome do Restaurante');
    fireEvent.change(name, { target: { value: 'Casarão alterado' } });

    fireEvent.click(screen.getByRole('link', { name: 'Ir para o painel' }));
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText('Localização atual').textContent).toBe('/settings');

    fireEvent.click(screen.getByRole('link', { name: 'Ir para o painel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sair sem salvar' }));
    expect(await screen.findByText('Painel de destino')).toBeTruthy();
  });

  it('shows the save loading state and the backend error message', async () => {
    let rejectSave!: (reason: unknown) => void;
    mocks.put.mockReturnValue(new Promise((_resolve, reject) => {
      rejectSave = reject;
    }));
    renderSettings();

    const saveButton = await screen.findByRole('button', { name: 'Salvar' });
    fireEvent.click(saveButton);
    expect(saveButton.getAttribute('aria-busy')).toBe('true');

    rejectSave({ response: { data: { message: 'Configuração fiscal inválida' } } });
    expect(await screen.findByText('Configuração fiscal inválida')).toBeTruthy();
    await waitFor(() => expect(saveButton.getAttribute('aria-busy')).toBeNull());
  });

  it('copies the public menu URL and reports success with a toast', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar Link' }));

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/cardapio`));
    expect(await screen.findByText('Link do cardápio copiado')).toBeTruthy();
  });

  it('keeps delivery fee numeric and does not confirm when only switching tabs', async () => {
    renderSettings();
    const deliveryFee = await screen.findByLabelText('Taxa de Entrega');
    fireEvent.change(deliveryFee, { target: { value: '13115' } });
    expect((deliveryFee as HTMLInputElement).value).toBe('R$ 131,15');

    fireEvent.click(screen.getByRole('tab', { name: 'Documentos Fiscais' }));
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Restaurante' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith('/config', expect.objectContaining({ deliveryFee: 131.15 })));
  });
});