import { productStockAvailability } from '../services/productAvailability.service';
import { Request, Response } from 'express';
import { categoryService } from '../services/domain.services';
import { productRepository } from '../repositories/product.repository';
import { DomainError } from '../types/errors';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: fallback });
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await categoryService.listAll();

    // Enriquece com produtos aninhados (frontend usa category.products no modal de pedido)
    const enriched = await Promise.all(
      categories.map(async (cat) => {
        const products = await productRepository.findByCategory(cat.id);
        const productsWithStock = await Promise.all(
          products.map(async (p) => ({
            ...p,
            category: cat,
            ...await productStockAvailability(p.id),
          }))
        );
        return { ...cat, products: productsWithStock };
      })
    );

    res.json(enriched);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar categorias');
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const category = await categoryService.findById(req.params.id);
    res.json(category);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar categoria');
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, isMealCategory, pricePerKg, selfServicePricePerKg } = req.body;
    const category = await categoryService.create({
      name,
      isMealCategory: !!isMealCategory,
      pricePerKg: pricePerKg != null && pricePerKg !== '' ? Number(pricePerKg) : null,
      selfServicePricePerKg: selfServicePricePerKg != null && selfServicePricePerKg !== ''
        ? Number(selfServicePricePerKg) : null,
    });
    res.status(201).json(category);
  } catch (error) {
    handleError(res, error, 'Erro ao criar categoria');
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { name, isMealCategory, pricePerKg, selfServicePricePerKg } = req.body;
    const category = await categoryService.update(req.params.id, {
      name,
      isMealCategory: isMealCategory !== undefined ? !!isMealCategory : undefined,
      pricePerKg: pricePerKg != null && pricePerKg !== '' ? Number(pricePerKg) : null,
      selfServicePricePerKg: selfServicePricePerKg != null && selfServicePricePerKg !== ''
        ? Number(selfServicePricePerKg) : null,
    });
    res.json(category);
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar categoria');
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    await categoryService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error, 'Erro ao excluir categoria');
  }
};