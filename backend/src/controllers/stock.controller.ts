import { Request, Response } from 'express';
import { stockService } from '../services/domain.services';
import { DomainError } from '../types/errors';
import { notifyStockChanged } from '../services/stockRealtime.service';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: fallback });
};

export const getStockItems = async (_req: Request, res: Response) => {
  try {
    res.json(await stockService.listAll());
  } catch (error) {
    handleError(res, error, 'Erro ao buscar itens de estoque');
  }
};

export const getStockItemById = async (req: Request, res: Response) => {
  try {
    const item = await stockService.findById(req.params.id);
    res.json(item);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar item');
  }
};

export const getLowStockItems = async (_req: Request, res: Response) => {
  try {
    res.json(await stockService.findLowStock());
  } catch (error) {
    handleError(res, error, 'Erro ao buscar itens com estoque baixo');
  }
};

export const createStockItem = async (req: Request, res: Response) => {
  try {
    const { name, quantity, unit, minQuantity } = req.body;
    const item = await stockService.create({ name, quantity, unit, minQuantity });
    void notifyStockChanged();
    res.status(201).json(item);
  } catch (error) {
    handleError(res, error, 'Erro ao criar item de estoque');
  }
};

export const updateStockItem = async (req: Request, res: Response) => {
  try {
    const { name, quantity, unit, minQuantity } = req.body;
    const item = await stockService.update(req.params.id, { name, quantity, unit, minQuantity });
    void notifyStockChanged();
    res.json(item);
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar item de estoque');
  }
};

export const deleteStockItem = async (req: Request, res: Response) => {
  try {
    await stockService.delete(req.params.id);
    void notifyStockChanged();
    res.status(204).send();
  } catch (error) {
    handleError(res, error, 'Erro ao excluir item de estoque');
  }
};