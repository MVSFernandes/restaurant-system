import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import api from '../services/api';
import {
  BrandingContext,
  DEFAULT_BRANDING_CONTEXT,
  resolveDisplayName,
  type BrandingContextValue,
  type BrandingIdentity,
} from './brandingContext';

let brandingRequest: Promise<BrandingIdentity> | null = null;

function requestBranding(force = false): Promise<BrandingIdentity> {
  if (force || !brandingRequest) {
    brandingRequest = api.get<BrandingIdentity>('/config/branding')
      .then(({ data }) => ({
        name: data.name || null,
        logoUrl: data.logoUrl || null,
        bannerUrl: data.bannerUrl || null,
        openingHours: data.openingHours || null,
        openingDays: data.openingDays || null,
        deliveryFee: data.deliveryFee ?? null,
        enabledPayments: data.enabledPayments || null,
      }))
      .catch((error) => {
        brandingRequest = null;
        throw error;
      });
  }
  return brandingRequest;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<BrandingIdentity>(DEFAULT_BRANDING_CONTEXT);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    try {
      setIdentity(await requestBranding(force));
    } catch (error) {
      console.error('Erro ao carregar identidade do restaurante:', error);
      setIdentity(DEFAULT_BRANDING_CONTEXT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) return;

    const defaultHref = icon.dataset.defaultHref || icon.getAttribute('href') || '/vite.svg';
    icon.dataset.defaultHref = defaultHref;

    if (!identity.logoUrl) {
      icon.href = defaultHref;
      return;
    }

    const candidate = new Image();
    candidate.onload = () => {
      icon.href = identity.logoUrl || defaultHref;
    };
    candidate.onerror = () => {
      icon.href = defaultHref;
    };
    candidate.src = identity.logoUrl;
  }, [identity.logoUrl]);

  const value = useMemo<BrandingContextValue>(() => ({
    ...identity,
    displayName: resolveDisplayName(identity.name),
    loading,
    refresh: () => load(true),
  }), [identity, load, loading]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

const PAGE_TITLES: Array<[RegExp, string]> = [
  [/^\/login$/, 'Login'],
  [/^\/cardapio$/, 'Cardápio'],
  [/^\/dashboard$/, 'Dashboard'],
  [/^\/pdv\/cash-register$/, 'Caixa'],
  [/^\/pdv\/tables$/, 'Mesas'],
  [/^\/pdv\/orders$/, 'Pedidos'],
  [/^\/pdv\/history$/, 'Histórico de pedidos'],
  [/^\/pdv\/orders-history$/, 'Histórico de pedidos'],
  [/^\/pdv\/cash-closures$/, 'Fechamentos de caixa'],
  [/^\/waiter\/tables$/, 'Minhas Mesas'],
  [/^\/waiter\/history$/, 'Histórico'],
  [/^\/menu\/categories$/, 'Categorias'],
  [/^\/menu\/products$/, 'Produtos'],
  [/^\/menu\/marmita-menu$/, 'Cardápio da Marmita'],
  [/^\/stock\/items$/, 'Insumos'],
  [/^\/stock\/suppliers$/, 'Fornecedores'],
  [/^\/stock\/comparison$/, 'CSM'],
  [/^\/finance\/reports$/, 'Relatórios'],
  [/^\/finance\/payables$/, 'Contas a Pagar'],
  [/^\/finance\/credit$/, 'Fiado'],
  [/^\/settings\/restaurant$/, 'Restaurante'],
  [/^\/settings\/fiscal$/, 'Documentos Fiscais'],
  [/^\/admin\/waiters$/, 'Garçons'],
  [/^\/design-system$/, 'Design System'],
];

export function BrandingRouteEffects() {
  const location = useLocation();
  const { displayName } = useContext(BrandingContext);

  useEffect(() => {
    const page = PAGE_TITLES.find(([pattern]) => pattern.test(location.pathname))?.[1] || 'Início';
    document.title = page + ' · ' + displayName;
  }, [displayName, location.pathname]);

  return <Outlet />;
}
