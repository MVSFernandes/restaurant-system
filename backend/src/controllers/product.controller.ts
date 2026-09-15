import { productStockAvailability } from '../services/productAvailability.service';
import { Request, Response } from 'express';
import { productService } from '../services/domain.services';
import { categoryRepository } from '../repositories/category.repository';
import { productStockItemRepository } from '../repositories/productStockItem.repository';
import { DomainError } from '../types/errors';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: fallback });
};

/**
 * Enriquece produtos com `category` e `productStockItems` aninhados.
 * O frontend legado espera esses campos para:
 * - Mostrar a categoria no card do produto
 * - Verificar se tem vínculo de estoque ("Sem vínculo de estoque")
 * - Exibir produtos no modal de novo pedido
 */
async function enrichProducts(products: Awaited<ReturnType<typeof productService.listAll>>) {
  const categories = await categoryRepository.findAll();
  const catMap = new Map(categories.map((c) => [c.id, c]));

  return Promise.all(
    products.map(async (p) => ({
      ...p,
      category: catMap.get(p.categoryId) ?? null,
      ...await productStockAvailability(p.id),
    }))
  );
}

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.query;
    const products = await productService.listAll(categoryId as string | undefined);
    const enriched = await enrichProducts(products);
    res.json(enriched);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar produtos');
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const product = await productService.findById(req.params.id);
    const [categories, stockItems] = await Promise.all([
      categoryRepository.findAll(),
      productStockItemRepository.findByProduct(product.id),
    ]);
    const category = categories.find((c) => c.id === product.categoryId) ?? null;
  res.json({ ...product, category, stockItems: stockItems });
  } catch (error) {
    handleError(res, error, 'Erro ao buscar produto');
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price, categoryId, imageUrl, isByWeight, ncm, cfop, origin, taxCode } = req.body;
    const product = await productService.create({
      name, description, price, categoryId, imageUrl, isByWeight, ncm, cfop, origin, taxCode,
    });
    const categories = await categoryRepository.findAll();
    const category = categories.find((c) => c.id === product.categoryId) ?? null;
    res.status(201).json({ ...product, category, stockItems: [] });
  } catch (error) {
    handleError(res, error, 'Erro ao criar produto');
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { name, description, price, categoryId, imageUrl, isByWeight, ncm, cfop, origin, taxCode } = req.body;
    const product = await productService.update(req.params.id, {
      name,
      description,
      price: price !== undefined ? parseFloat(price) : undefined,
      categoryId,
      imageUrl,
      isByWeight: isByWeight !== undefined ? !!isByWeight : undefined,
      ncm,
      cfop,
      origin,
      taxCode,
    });
    const [categories, stockItems] = await Promise.all([
      categoryRepository.findAll(),
      productStockItemRepository.findByProduct(product.id),
    ]);
    const category = categories.find((c) => c.id === product.categoryId) ?? null;
    res.json({ ...product, category, stockItems: stockItems });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar produto');
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    await productService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error, 'Erro ao excluir produto');
  }
};
