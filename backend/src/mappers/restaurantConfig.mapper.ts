import { RestaurantConfig } from '../types/domain';

type ConfigRow = Record<string, any>;
type ConfigInsert = Record<string, any>;
type ConfigUpdate = Record<string, any>;

export function toRestaurantConfigDomain(row: ConfigRow): RestaurantConfig {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    openingHours: row.opening_hours,
    openingDays: row.opening_days,
    deliveryFee: row.delivery_fee,
    urbanDeliveryFee: row.urban_delivery_fee,
    ruralDeliveryFee: row.rural_delivery_fee,
    enabledPayments: row.enabled_payments,
    cnpj: row.cnpj ?? null,
    legalName: row.legal_name ?? null,
    stateRegistration: row.state_registration ?? null,
    taxRegime: row.tax_regime ?? null,
    fiscalCityIbgeCode: row.fiscal_city_ibge_code ?? null,
    fiscalZipCode: row.fiscal_zip_code ?? null,
    fiscalStreet: row.fiscal_street ?? null,
    fiscalNumber: row.fiscal_number ?? null,
    fiscalNeighborhood: row.fiscal_neighborhood ?? null,
    fiscalCity: row.fiscal_city ?? null,
    fiscalState: row.fiscal_state ?? null,
    defaultCfop: row.default_cfop ?? null,
    defaultNcm: row.default_ncm ?? null,
    defaultOrigin: row.default_origin ?? null,
    defaultTaxCode: row.default_tax_code ?? null,
    nfceEnabled: row.nfce_enabled ?? false,
    nfceGroupItems: row.nfce_group_items ?? false,
    nfceGroupedItemDescription: row.nfce_grouped_item_description ?? 'REFEICAO',
    updatedAt: new Date(row.updated_at),
  };
}

export function toRestaurantConfigInsert(domain: RestaurantConfig): ConfigInsert {
  return {
    id: domain.id,
    name: domain.name,
    address: domain.address,
    phone: domain.phone,
    logo_url: domain.logoUrl,
    banner_url: domain.bannerUrl,
    opening_hours: domain.openingHours,
    opening_days: domain.openingDays,
    delivery_fee: domain.deliveryFee,
    urban_delivery_fee: domain.urbanDeliveryFee,
    rural_delivery_fee: domain.ruralDeliveryFee,
    enabled_payments: domain.enabledPayments,
    cnpj: domain.cnpj,
    legal_name: domain.legalName,
    state_registration: domain.stateRegistration,
    tax_regime: domain.taxRegime,
    fiscal_city_ibge_code: domain.fiscalCityIbgeCode,
    fiscal_zip_code: domain.fiscalZipCode,
    fiscal_street: domain.fiscalStreet,
    fiscal_number: domain.fiscalNumber,
    fiscal_neighborhood: domain.fiscalNeighborhood,
    fiscal_city: domain.fiscalCity,
    fiscal_state: domain.fiscalState,
    default_cfop: domain.defaultCfop,
    default_ncm: domain.defaultNcm,
    default_origin: domain.defaultOrigin,
    default_tax_code: domain.defaultTaxCode,
    nfce_enabled: domain.nfceEnabled,
    nfce_group_items: domain.nfceGroupItems,
    nfce_grouped_item_description: domain.nfceGroupedItemDescription,
  };
}

export function toRestaurantConfigUpdate(patch: Partial<RestaurantConfig>): ConfigUpdate {
  const update: ConfigUpdate = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;
  if (patch.bannerUrl !== undefined) update.banner_url = patch.bannerUrl;
  if (patch.openingHours !== undefined) update.opening_hours = patch.openingHours;
  if (patch.openingDays !== undefined) update.opening_days = patch.openingDays;
  if (patch.deliveryFee !== undefined) update.delivery_fee = patch.deliveryFee;
  if (patch.urbanDeliveryFee !== undefined) update.urban_delivery_fee = patch.urbanDeliveryFee;
  if (patch.ruralDeliveryFee !== undefined) update.rural_delivery_fee = patch.ruralDeliveryFee;
  if (patch.enabledPayments !== undefined) update.enabled_payments = patch.enabledPayments;
  if (patch.cnpj !== undefined) update.cnpj = patch.cnpj;
  if (patch.legalName !== undefined) update.legal_name = patch.legalName;
  if (patch.stateRegistration !== undefined) update.state_registration = patch.stateRegistration;
  if (patch.taxRegime !== undefined) update.tax_regime = patch.taxRegime;
  if (patch.fiscalCityIbgeCode !== undefined) update.fiscal_city_ibge_code = patch.fiscalCityIbgeCode;
  if (patch.fiscalZipCode !== undefined) update.fiscal_zip_code = patch.fiscalZipCode;
  if (patch.fiscalStreet !== undefined) update.fiscal_street = patch.fiscalStreet;
  if (patch.fiscalNumber !== undefined) update.fiscal_number = patch.fiscalNumber;
  if (patch.fiscalNeighborhood !== undefined) update.fiscal_neighborhood = patch.fiscalNeighborhood;
  if (patch.fiscalCity !== undefined) update.fiscal_city = patch.fiscalCity;
  if (patch.fiscalState !== undefined) update.fiscal_state = patch.fiscalState;
  if (patch.defaultCfop !== undefined) update.default_cfop = patch.defaultCfop;
  if (patch.defaultNcm !== undefined) update.default_ncm = patch.defaultNcm;
  if (patch.defaultOrigin !== undefined) update.default_origin = patch.defaultOrigin;
  if (patch.defaultTaxCode !== undefined) update.default_tax_code = patch.defaultTaxCode;
  if (patch.nfceEnabled !== undefined) update.nfce_enabled = patch.nfceEnabled;
  if (patch.nfceGroupItems !== undefined) update.nfce_group_items = patch.nfceGroupItems;
  if (patch.nfceGroupedItemDescription !== undefined) {
    update.nfce_grouped_item_description = patch.nfceGroupedItemDescription;
  }
  return update;
}
