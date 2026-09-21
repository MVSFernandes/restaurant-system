import { createContext, useContext } from 'react';

export interface BrandingIdentity {
  name: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  openingHours: string | null;
  openingDays: string | null;
  deliveryFee: number | null;
  enabledPayments: string | null;
}

export interface BrandingContextValue extends BrandingIdentity {
  displayName: string;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const FALLBACK_NAME = 'Restaurant System';
export const resolveDisplayName = (name?: string | null) => name?.trim() || FALLBACK_NAME;

export const DEFAULT_BRANDING_CONTEXT: BrandingContextValue = {
  name: null,
  logoUrl: null,
  bannerUrl: null,
  openingHours: null,
  openingDays: null,
  deliveryFee: null,
  enabledPayments: null,
  displayName: FALLBACK_NAME,
  loading: false,
  refresh: async () => undefined,
};

export const BrandingContext = createContext<BrandingContextValue>(DEFAULT_BRANDING_CONTEXT);

export function useBranding() {
  return useContext(BrandingContext);
}
