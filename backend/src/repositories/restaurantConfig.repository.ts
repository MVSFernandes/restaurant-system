import { supabase } from '../lib/supabase';
import { RestaurantConfig } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import {
  toOperationalRestaurantConfig,
  toPublicRestaurantConfig,
  toRestaurantConfigDomain,
  toRestaurantConfigUpdate,
} from '../mappers/restaurantConfig.mapper';
import type {
  OperationalRestaurantConfig,
  PublicRestaurantConfig,
} from '../mappers/restaurantConfig.mapper';
import { NotFoundError } from '../types/errors';

const TABLE = 'restaurant_config';
const FULL_CONFIG_COLUMNS = [
  'id', 'name', 'address', 'phone', 'logo_url', 'banner_url',
  'opening_hours', 'opening_days', 'delivery_fee', 'urban_delivery_fee',
  'rural_delivery_fee', 'enabled_payments', 'cnpj', 'legal_name',
  'state_registration', 'tax_regime', 'fiscal_city_ibge_code',
  'fiscal_zip_code', 'fiscal_street', 'fiscal_number', 'fiscal_neighborhood',
  'fiscal_city', 'fiscal_state', 'default_cfop', 'default_ncm',
  'default_origin', 'default_tax_code', 'nfce_enabled', 'nfce_group_items',
  'nfce_grouped_item_description', 'updated_at',
].join(',');
const OPERATIONAL_CONFIG_COLUMNS = [
  'name', 'logo_url', 'urban_delivery_fee', 'rural_delivery_fee', 'nfce_enabled',
].join(',');
const PUBLIC_CONFIG_COLUMNS = [
  'name', 'logo_url', 'banner_url', 'opening_hours', 'opening_days',
  'delivery_fee', 'enabled_payments',
].join(',');

export const restaurantConfigRepository = {
  /**
   * Retorna a configuração administrativa completa (singleton).
   * A lista explícita evita que uma coluna nova seja exposta por acidente.
   */
  async get(): Promise<RestaurantConfig> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(FULL_CONFIG_COLUMNS)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'RestaurantConfig' });
    if (!data) throw new NotFoundError('RestaurantConfig');

    return toRestaurantConfigDomain(data as any);
  },

  /** Somente os campos necessários no PDV e no fluxo atual do garçom. */
  async getOperational(): Promise<OperationalRestaurantConfig> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(OPERATIONAL_CONFIG_COLUMNS)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'RestaurantConfig' });
    if (!data) throw new NotFoundError('RestaurantConfig');

    return toOperationalRestaurantConfig(data as any);
  },

  /** Somente os campos publicados no login e no cardápio digital. */
  async getPublic(): Promise<PublicRestaurantConfig> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(PUBLIC_CONFIG_COLUMNS)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'RestaurantConfig' });
    if (!data) throw new NotFoundError('RestaurantConfig');

    return toPublicRestaurantConfig(data as any);
  },

  /**
   * Atualiza a config (singleton).
   * Recebe o ID explicitamente para evitar updates acidentais sem WHERE.
   */
  async update(id: string, patch: Partial<RestaurantConfig>): Promise<RestaurantConfig> {
    const payload = toRestaurantConfigUpdate(patch);

    if (Object.keys(payload).length === 0) {
      return this.get();
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select(FULL_CONFIG_COLUMNS)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'RestaurantConfig' });
    if (!data) throw new NotFoundError('RestaurantConfig', id);

    return toRestaurantConfigDomain(data as any);
  },
};
