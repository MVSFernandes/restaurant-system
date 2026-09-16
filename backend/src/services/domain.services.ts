/**
 * Services simples — CRUD sem regras de negócio complexas.
 * Cada export corresponde a um domínio.
 */

import { createId } from '@paralleldrive/cuid2';
import { categoryRepository } from '../repositories/category.repository';
import { productRepository } from '../repositories/product.repository';
import { productStockItemRepository } from '../repositories/productStockItem.repository';
import { stockItemRepository } from '../repositories/stockItem.repository';
import { supplierRepository } from '../repositories/supplier.repository';
import { supplierStockItemRepository } from '../repositories/supplierStockItem.repository';
import { tableRepository } from '../repositories/table.repository';
import { marmitaMenuItemRepository } from '../repositories/marmitaMenuItem.repository';
import { restaurantConfigRepository } from '../repositories/restaurantConfig.repository';
import {
  Category,
  Product,
  ProductStockItem,
  StockItem,
  Supplier,
  SupplierStockItem,
  Table,
  MarmitaMenuItem,
} from '../types/domain';
import { NotFoundError, ValidationError } from '../types/errors';

// ============================================================================
// CATEGORY
// ============================================================================

export const categoryService = {
  async listAll(): Promise<Category[]> {
    return categoryRepository.findAll();
  },

  async findById(id: string): Promise<Category> {
    const cat = await categoryRepository.findById(id);
    if (!cat) throw new NotFoundError('Category', id);
    return cat;
  },

  async create(input: {
    name: string;
    isMealCategory?: boolean;
    pricePerKg?: number | null;
    selfServicePricePerKg?: number | null;
  }): Promise<Category> {
    return categoryRepository.create({
      id: createId(),
      name: input.name,
      isMealCategory: input.isMealCategory ?? false,
      pricePerKg: input.pricePerKg ?? null,
      selfServicePricePerKg: input.selfServicePricePerKg ?? null,
    });
  },

  async update(id: string, input: Partial<Omit<Category, 'id'>>): Promise<Category> {
    return categoryRepository.update(id, input);
  },

  async delete(id: string): Promise<void> {
    return categoryRepository.delete(id);
  },
};

// ============================================================================
// PRODUCT
// ============================================================================

export const productService = {
  async listAll(categoryId?: string): Promise<Product[]> {
    if (categoryId) return productRepository.findByCategory(categoryId);
    return productRepository.findAll();
  },

  async findById(id: string): Promise<Product> {
    const product = await productRepository.findById(id);
    if (!product) throw new NotFoundError('Product', id);
    return product;
  },

  async search(name: string): Promise<Product[]> {
    return productRepository.searchByName(name);
  },

  async create(input: {
    name: string;
    description?: string | null;
    price: number;
    categoryId: string;
    imageUrl?: string | null;
    isByWeight?: boolean;
    ncm?: string | null;
    cfop?: string | null;
    origin?: string | null;
    taxCode?: string | null;
  }): Promise<Product> {
    return productRepository.create({
      id: createId(),
      name: input.name,
      description: input.description ?? null,
      price: parseFloat(String(input.price)),
      categoryId: input.categoryId,
      imageUrl: input.imageUrl ?? null,
      isByWeight: input.isByWeight ?? false,
      ncm: input.ncm ?? null,
      cfop: input.cfop ?? null,
      origin: input.origin ?? null,
      taxCode: input.taxCode ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },

  async update(id: string, input: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Product> {
    return productRepository.update(id, input);
  },

  async delete(id: string): Promise<void> {
    return productRepository.delete(id);
  },

  async getLinks(productId: string): Promise<ProductStockItem[]> {
    return productStockItemRepository.findByProduct(productId);
  },

  async replaceLinks(
    productId: string,
    links: Array<{ stockItemId: string; quantity: number }>
  ): Promise<{ deleted: number; inserted: number }> {
    const product = await productRepository.findById(productId);
    if (!product) throw new NotFoundError('Product', productId);

    const normalized = links
      .filter((l) => l.stockItemId && l.quantity > 0)
      .map((l) => ({
        id: createId(),
        productId,
        stockItemId: l.stockItemId,
        quantity: l.quantity,
      }));

    return productStockItemRepository.replaceLinks(productId, normalized);
  },
};

// ============================================================================
// STOCK
// ============================================================================

export const stockService = {
  async listAll(): Promise<StockItem[]> {
    return stockItemRepository.findAll();
  },

  async findById(id: string): Promise<StockItem> {
    const item = await stockItemRepository.findById(id);
    if (!item) throw new NotFoundError('StockItem', id);
    return item;
  },

  async findLowStock(): Promise<StockItem[]> {
    return stockItemRepository.findLowStock();
  },

  async create(input: {
    name: string;
    quantity: number;
    unit: string;
    minQuantity?: number;
  }): Promise<StockItem> {
    return stockItemRepository.create({
      id: createId(),
      name: input.name,
      quantity: parseFloat(String(input.quantity)),
      unit: input.unit,
      minQuantity: parseFloat(String(input.minQuantity ?? 0)),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },

  async update(
    id: string,
    input: { name?: string; quantity?: number; unit?: string; minQuantity?: number }
  ): Promise<StockItem> {
    return stockItemRepository.update(id, {
      name: input.name,
      quantity: input.quantity !== undefined ? parseFloat(String(input.quantity)) : undefined,
      unit: input.unit,
      minQuantity: input.minQuantity !== undefined ? parseFloat(String(input.minQuantity)) : undefined,
    });
  },

  async delete(id: string): Promise<void> {
    return stockItemRepository.delete(id);
  },
};

// ============================================================================
// SUPPLIER
// ============================================================================

export const supplierService = {
  async listAll(): Promise<Supplier[]> {
    return supplierRepository.findAll();
  },

  async create(input: {
    name: string;
    contact?: string | null;
    phone?: string | null;
    email?: string | null;
  }): Promise<Supplier> {
    return supplierRepository.create({
      id: createId(),
      name: input.name,
      contact: input.contact ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },

  async update(
    id: string,
    input: { name?: string; contact?: string | null; phone?: string | null; email?: string | null }
  ): Promise<Supplier> {
    return supplierRepository.update(id, input);
  },

  async delete(id: string): Promise<void> {
    return supplierRepository.delete(id);
  },

  async upsertPrice(input: {
    supplierId: string;
    stockItemId: string;
    price: number;
  }): Promise<SupplierStockItem> {
    const existing = await supplierStockItemRepository.findBySupplierAndStockItem(
      input.supplierId,
      input.stockItemId
    );

    if (existing) {
      return supplierStockItemRepository.update(existing.id, { price: parseFloat(String(input.price)) });
    }

    return supplierStockItemRepository.create({
      id: createId(),
      supplierId: input.supplierId,
      stockItemId: input.stockItemId,
      price: parseFloat(String(input.price)),
      updatedAt: new Date(),
    });
  },

  async getComparison(): Promise<Array<{
    stockItemId: string;
    stockItemName: string;
    supplierPrices: Array<{ supplierId: string; supplierName: string; price: number; isCheapest: boolean }>;
  }>> {
    const stockItems = await stockItemRepository.findAll();
    const result = [];

    for (const item of stockItems) {
      const links = await supplierStockItemRepository.findByStockItem(item.id);
      if (links.length === 0) continue;

      const minPrice = Math.min(...links.map((l) => l.price));
      const supplierPrices = await Promise.all(
        links.map(async (l) => {
          const supplier = await supplierRepository.findById(l.supplierId);
          return {
            supplierId: l.supplierId,
            supplierName: supplier?.name ?? 'Desconhecido',
            price: l.price,
            isCheapest: l.price === minPrice,
          };
        })
      );

      result.push({ stockItemId: item.id, stockItemName: item.name, supplierPrices });
    }

    return result;
  },
};

// ============================================================================
// TABLE
// ============================================================================

export const tableService = {
  async listAll(): Promise<Table[]> {
    return tableRepository.findAll();
  },

  async findById(id: string): Promise<Table> {
    const table = await tableRepository.findById(id);
    if (!table) throw new NotFoundError('Table', id);
    return table;
  },

  async create(number: number): Promise<Table> {
    return tableRepository.create({
      id: createId(),
      number,
      status: 'AVAILABLE',
    });
  },

  async updateStatus(id: string, status: Table['status']): Promise<Table> {
    return tableRepository.update(id, { status });
  },

  async delete(id: string): Promise<void> {
    return tableRepository.delete(id);
  },
};

// ============================================================================
// MARMITA MENU
// ============================================================================

export const marmitaMenuService = {
  async getTodayMenu(): Promise<MarmitaMenuItem[]> {
    const day = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };

    let targetDay = map[day] ?? 1;
    if (targetDay === 0) targetDay = 6;

    let items = await marmitaMenuItemRepository.findByDayOfWeek(targetDay);
    if (items.length === 0 && targetDay !== 6) {
      items = await marmitaMenuItemRepository.findByDayOfWeek(6);
    }
    if (items.length === 0) {
      items = await marmitaMenuItemRepository.findByDayOfWeek(1);
    }

    return items;
  },

  async getByDay(dayOfWeek: number): Promise<MarmitaMenuItem[]> {
    return marmitaMenuItemRepository.findByDayOfWeek(dayOfWeek);
  },

  async listAll(): Promise<MarmitaMenuItem[]> {
    return marmitaMenuItemRepository.findAll();
  },

  async create(input: Omit<MarmitaMenuItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<MarmitaMenuItem> {
    return marmitaMenuItemRepository.create({
      ...input,
      id: createId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },

  async update(id: string, input: Partial<MarmitaMenuItem>): Promise<MarmitaMenuItem> {
    return marmitaMenuItemRepository.update(id, input);
  },

  async delete(id: string): Promise<void> {
    return marmitaMenuItemRepository.delete(id);
  },
};

// ============================================================================
// RESTAURANT CONFIG
// ============================================================================

export const configService = {
  async get() {
    return restaurantConfigRepository.get();
  },

  async update(input: {
    name?: string;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    openingHours?: string | null;
    openingDays?: string | null;
    deliveryFee?: number | null;
    urbanDeliveryFee?: number | null;
    ruralDeliveryFee?: number | null;
    cnpj?: string | null;
    legalName?: string | null;
    stateRegistration?: string | null;
    taxRegime?: string | null;
    fiscalCityIbgeCode?: string | null;
    fiscalZipCode?: string | null;
    fiscalStreet?: string | null;
    fiscalNumber?: string | null;
    fiscalNeighborhood?: string | null;
    fiscalCity?: string | null;
    fiscalState?: string | null;
    defaultCfop?: string | null;
    defaultNcm?: string | null;
    defaultOrigin?: string | null;
    defaultTaxCode?: string | null;
    nfceEnabled?: boolean;
    nfceGroupItems?: boolean;
    nfceGroupedItemDescription?: string;
  }) {
    const config = await restaurantConfigRepository.get();
    if (input.nfceGroupItems !== undefined && typeof input.nfceGroupItems !== 'boolean') {
      throw new ValidationError('nfceGroupItems', 'Informe verdadeiro ou falso');
    }
    if (
      input.nfceGroupedItemDescription !== undefined &&
      typeof input.nfceGroupedItemDescription !== 'string'
    ) {
      throw new ValidationError('nfceGroupedItemDescription', 'Informe uma descrição válida');
    }
    const groupedItemDescription = String(
      input.nfceGroupedItemDescription ?? config.nfceGroupedItemDescription
    ).trim();
    if (groupedItemDescription.length < 1 || groupedItemDescription.length > 120) {
      throw new ValidationError(
        'nfceGroupedItemDescription',
        'A descrição do item agrupado deve ter entre 1 e 120 caracteres'
      );
    }
    return restaurantConfigRepository.update(config.id, {
      name: input.name,
      logoUrl: input.logoUrl,
      bannerUrl: input.bannerUrl,
      address: input.address,
      phone: input.phone,
      openingHours: input.openingHours,
      openingDays: input.openingDays,
      deliveryFee: input.deliveryFee != null ? parseFloat(String(input.deliveryFee)) : undefined,
      urbanDeliveryFee: input.urbanDeliveryFee != null ? parseFloat(String(input.urbanDeliveryFee)) : undefined,
      ruralDeliveryFee: input.ruralDeliveryFee != null ? parseFloat(String(input.ruralDeliveryFee)) : undefined,
      cnpj: input.cnpj,
      legalName: input.legalName,
      stateRegistration: input.stateRegistration,
      taxRegime: input.taxRegime,
      fiscalCityIbgeCode: input.fiscalCityIbgeCode,
      fiscalZipCode: input.fiscalZipCode,
      fiscalStreet: input.fiscalStreet,
      fiscalNumber: input.fiscalNumber,
      fiscalNeighborhood: input.fiscalNeighborhood,
      fiscalCity: input.fiscalCity,
      fiscalState: input.fiscalState,
      defaultCfop: input.defaultCfop,
      defaultNcm: input.defaultNcm,
      defaultOrigin: input.defaultOrigin,
      defaultTaxCode: input.defaultTaxCode,
      nfceEnabled: input.nfceEnabled,
      nfceGroupItems: input.nfceGroupItems,
      nfceGroupedItemDescription:
        input.nfceGroupedItemDescription !== undefined ? groupedItemDescription : undefined,
    });
  },
};
