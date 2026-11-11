// Fuso do navegador antes de qualquer Date: America/Sao_Paulo, onde
// 2026-11-11T00:00:00.000Z ainda é 10/11 às 21h.
process.env.TZ = 'America/Sao_Paulo';

import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/components/ui';
import DashboardPage from '../src/pages/DashboardPage';
import PayablesPage from '../src/pages/finance/PayablesPage';
import api from '../src/services/api';
import {
  calendarDateKey,
  DEFAULT_RESTAURANT_TIME_ZONE,
  dueStatus,
  formatCalendarDate,
  resolveRestaurantTimeZone,
  restaurantTodayKey,
} from '../src/utils/calendarDate';

// Fuso da instalação, como chega em /config/branding (null = resposta sem o campo).
const installation = vi.hoisted(() => ({ timeZone: null as string | null }));

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Pessoa Teste', role: 'ADMIN' }, signOut: vi.fn() }),
}));
vi.mock('../src/hooks/useMenuViewers', () => ({ useMenuViewers: () => ({ available: false, count: null }) }));
vi.mock('../src/hooks/useOrderEvents', () => ({ useOrderEvents: vi.fn() }));
vi.mock('../src/contexts/brandingContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/contexts/brandingContext')>();
  return { ...original, useBranding: () => ({ ...original.DEFAULT_BRANDING_CONTEXT, timeZone: installation.timeZone }) };
});

// Meio-dia de 11/11/2026 em São Paulo (15h UTC).
const NOON_SAO_PAULO = new Date('2026-11-11T12:00:00-03:00');

// Mesmos formatos que a API pode devolver: meia-noite UTC e data pura.
const payables = [
  { id: 'p-yesterday', description: 'Conta de ontem', amount: 120, dueDate: '2026-11-10T00:00:00.000Z', paid: false, supplierId: null },
  { id: 'p-today', description: 'Conta de hoje', amount: 480.75, dueDate: '2026-11-11T00:00:00.000Z', paid: false, supplierId: null },
  { id: 'p-tomorrow', description: 'Conta de amanhã', amount: 99.9, dueDate: '2026-11-12', paid: false, supplierId: null },
  { id: 'p-paid', description: 'Conta paga ontem', amount: 50, dueDate: '2026-11-10T00:00:00.000Z', paid: true, paidAt: '2026-11-10T15:00:00.000Z', supplierId: null },
];

const respond = (url: string) => {
  if (url === '/finance/payables') return { data: payables };
  if (url === '/suppliers') return { data: [] };
  if (url === '/cash-register/current') return { data: null };
  if (url.startsWith('/finance/reports')) return { data: { topProducts: [] } };
  return { data: [] };
};

const renderPage = (element: React.ReactNode) =>
  render(<ToastProvider><MemoryRouter>{element}</MemoryRouter></ToastProvider>);

const rowOf = async (description: string) =>
  (await screen.findByText(description, { selector: 'p' })).closest('tr') as HTMLElement;

const overdueCard = () => screen.getByText('Precisam de atenção').parentElement as HTMLElement;

async function dashboardPayablesItem() {
  const label = await screen.findByText('Contas vencendo hoje');
  return label.closest('li') as HTMLElement;
}

beforeAll(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  installation.timeZone = null;
  vi.setSystemTime(NOON_SAO_PAULO);
  vi.mocked(api.get).mockImplementation(async (url: string) => respond(url));
});
afterEach(cleanup);

describe('utilitário de datas de calendário', () => {
  it('lê o dia do texto, com ou sem horário', () => {
    expect(calendarDateKey('2026-11-11T00:00:00.000Z')).toBe('2026-11-11');
    expect(calendarDateKey('2026-11-11T00:00:00+00:00')).toBe('2026-11-11');
    expect(calendarDateKey('2026-11-11')).toBe('2026-11-11');
    expect(formatCalendarDate('2026-11-11T00:00:00.000Z')).toBe('11/11/2026');
    expect(formatCalendarDate('2026-11-11')).toBe('11/11/2026');
  });

  it('classifica ontem, hoje e amanhã pelo dia em São Paulo quando a instalação não informa o fuso', () => {
    expect(restaurantTodayKey()).toBe('2026-11-11');
    expect(dueStatus('2026-11-10T00:00:00.000Z', restaurantTodayKey())).toBe('overdue');
    expect(dueStatus('2026-11-11T00:00:00.000Z', restaurantTodayKey())).toBe('today');
    expect(dueStatus('2026-11-11', restaurantTodayKey())).toBe('today');
    expect(dueStatus('2026-11-12', restaurantTodayKey())).toBe('upcoming');
  });

  it('usa o fuso da instalação e volta a America/Sao_Paulo quando ele falta ou é inválido', () => {
    expect(resolveRestaurantTimeZone('America/Rio_Branco')).toBe('America/Rio_Branco');
    expect(resolveRestaurantTimeZone(null)).toBe(DEFAULT_RESTAURANT_TIME_ZONE);
    expect(resolveRestaurantTimeZone('')).toBe(DEFAULT_RESTAURANT_TIME_ZONE);
    expect(resolveRestaurantTimeZone('Fuso/Inexistente')).toBe(DEFAULT_RESTAURANT_TIME_ZONE);
    expect(DEFAULT_RESTAURANT_TIME_ZONE).toBe('America/Sao_Paulo');

    // 23h30 de 11/11 em São Paulo = 02h30 de 12/11 em UTC = 00h30 de 12/11 em Noronha.
    const lateNight = new Date('2026-11-12T02:30:00.000Z');
    expect(restaurantTodayKey(lateNight)).toBe('2026-11-11');
    expect(restaurantTodayKey(lateNight, 'America/Noronha')).toBe('2026-11-12');
    expect(restaurantTodayKey(lateNight, 'Fuso/Inexistente')).toBe('2026-11-11');
  });
});

describe('vencimento das contas a pagar como data de calendário', () => {
  it('Contas a Pagar mostra a data do vencimento e marca só a de ontem como vencida', async () => {
    renderPage(<PayablesPage />);

    const yesterday = await rowOf('Conta de ontem');
    const today = await rowOf('Conta de hoje');
    const tomorrow = await rowOf('Conta de amanhã');
    const paid = await rowOf('Conta paga ontem');

    expect(within(yesterday).getByText('10/11/2026')).toBeTruthy();
    expect(within(yesterday).getByText('Vencida')).toBeTruthy();

    expect(within(today).getByText('11/11/2026')).toBeTruthy();
    expect(within(today).getByText('Pendente')).toBeTruthy();

    expect(within(tomorrow).getByText('12/11/2026')).toBeTruthy();
    expect(within(tomorrow).getByText('Pendente')).toBeTruthy();

    expect(within(paid).getByText('Paga')).toBeTruthy();

    // Card "Vencidas": só a conta de ontem em aberto.
    expect(within(overdueCard()).getByText('R$ 120,00')).toBeTruthy();
    expect(within(overdueCard()).getByText('1 conta(s)')).toBeTruthy();
  });

  it('Dashboard mostra R$ 480,75 vencendo hoje e 1 conta atrasada', async () => {
    renderPage(<DashboardPage />);

    const item = await dashboardPayablesItem();
    await waitFor(() => expect(within(item).getByText('R$ 480,75')).toBeTruthy());
    expect(within(item).getByText('Conta de hoje. 1 conta atrasada.')).toBeTruthy();
  });
});

// Perto da meia-noite, com o navegador em São Paulo e a instalação em outro
// fuso: a data exibida não muda; "vence hoje"/"atrasada" segue o dia da instalação.
describe('fuso da instalação diferente do padrão, perto da meia-noite', () => {
  describe('instalação em America/Noronha às 00h30 de 12/11 (23h30 de 11/11 em São Paulo)', () => {
    beforeEach(() => {
      installation.timeZone = 'America/Noronha';
      vi.setSystemTime(new Date('2026-11-12T02:30:00.000Z'));
    });

    it('Contas a Pagar: datas iguais, a conta de 11/11 já está vencida', async () => {
      renderPage(<PayablesPage />);

      const yesterday = await rowOf('Conta de ontem');
      const today = await rowOf('Conta de hoje');
      const tomorrow = await rowOf('Conta de amanhã');

      expect(within(yesterday).getByText('10/11/2026')).toBeTruthy();
      expect(within(yesterday).getByText('Vencida')).toBeTruthy();
      expect(within(today).getByText('11/11/2026')).toBeTruthy();
      expect(within(today).getByText('Vencida')).toBeTruthy();
      expect(within(tomorrow).getByText('12/11/2026')).toBeTruthy();
      expect(within(tomorrow).getByText('Pendente')).toBeTruthy();

      expect(within(overdueCard()).getByText('R$ 600,75')).toBeTruthy();
      expect(within(overdueCard()).getByText('2 conta(s)')).toBeTruthy();
    });

    it('Dashboard: a conta de 12/11 vence hoje e há 2 atrasadas', async () => {
      renderPage(<DashboardPage />);

      const item = await dashboardPayablesItem();
      await waitFor(() => expect(within(item).getByText('R$ 99,90')).toBeTruthy());
      expect(within(item).getByText('Conta de amanhã. 2 contas atrasadas.')).toBeTruthy();
    });
  });

  describe('instalação em America/Rio_Branco às 22h30 de 11/11 (00h30 de 12/11 em São Paulo)', () => {
    beforeEach(() => {
      installation.timeZone = 'America/Rio_Branco';
      vi.setSystemTime(new Date('2026-11-12T03:30:00.000Z'));
    });

    it('Contas a Pagar: datas iguais, a conta de 11/11 ainda não venceu', async () => {
      renderPage(<PayablesPage />);

      const yesterday = await rowOf('Conta de ontem');
      const today = await rowOf('Conta de hoje');
      const tomorrow = await rowOf('Conta de amanhã');

      expect(within(yesterday).getByText('10/11/2026')).toBeTruthy();
      expect(within(yesterday).getByText('Vencida')).toBeTruthy();
      expect(within(today).getByText('11/11/2026')).toBeTruthy();
      expect(within(today).getByText('Pendente')).toBeTruthy();
      expect(within(tomorrow).getByText('12/11/2026')).toBeTruthy();
      expect(within(tomorrow).getByText('Pendente')).toBeTruthy();

      expect(within(overdueCard()).getByText('R$ 120,00')).toBeTruthy();
      expect(within(overdueCard()).getByText('1 conta(s)')).toBeTruthy();
    });

    it('Dashboard: a conta de 11/11 ainda vence hoje e há 1 atrasada', async () => {
      renderPage(<DashboardPage />);

      const item = await dashboardPayablesItem();
      await waitFor(() => expect(within(item).getByText('R$ 480,75')).toBeTruthy());
      expect(within(item).getByText('Conta de hoje. 1 conta atrasada.')).toBeTruthy();
    });
  });
});
