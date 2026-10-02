import { Product } from '../types/domain';

type ProductRow = Record<string, any>;
type ProductInsert = Record<string, any>;
type ProductUpdate = Record<string, any>;

export function toProductDomain(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    imageUrl: row.image_url,
    isByWeight: row.is_by_weight,
    isPaused: row.is_paused ?? false,
    pausedAt: row.paused_at ? new Date(row.paused_at) : null,
    categoryId: row.category_id,
    ncm: row.ncm ?? null,
    cfop: row.cfop ?? null,
    origin: row.origin ?? null,
    taxCode: row.tax_code ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function toProductInsert(domain: Product): ProductInsert {
  return {
    id: domain.id,
    name: domain.name,
    description: domain.description,
    price: domain.price,
    image_url: domain.imageUrl,
    is_by_weight: domain.isByWeight,
    is_paused: domain.isPaused,
    paused_at: domain.pausedAt?.toISOString() ?? null,
    category_id: domain.categoryId,
    ncm: domain.ncm,
    cfop: domain.cfop,
    origin: domain.origin,
    tax_code: domain.taxCode,
  };
}

export function toProductUpdate(patch: Partial<Product>): ProductUpdate {
  const update: ProductUpdate = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl;
  if (patch.isByWeight !== undefined) update.is_by_weight = patch.isByWeight;
  if (patch.isPaused !== undefined) update.is_paused = patch.isPaused;
  if (patch.pausedAt !== undefined) update.paused_at = patch.pausedAt?.toISOString() ?? null;
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.ncm !== undefined) update.ncm = patch.ncm;
  if (patch.cfop !== undefined) update.cfop = patch.cfop;
  if (patch.origin !== undefined) update.origin = patch.origin;
  if (patch.taxCode !== undefined) update.tax_code = patch.taxCode;
  return update;
}
