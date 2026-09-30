import { Request, Response } from 'express';
import { tableService } from '../services/domain.services';
import { orderRepository } from '../repositories/order.repository';
import { DomainError } from '../types/errors';
import { tableTabService, TableOverviewView } from '../services/tableTab.service';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: fallback });
};

export const getWaiterTableOverview = async (req: Request, res: Response) => {
  try {
    const view = ['mine', 'free'].includes(String(req.query.view))
      ? String(req.query.view) as TableOverviewView
      : 'all';
    const userId = (req as any).user.id;
    res.setHeader('Cache-Control', 'no-store');
    res.json(await tableTabService.listTableOverview(userId, view));
  } catch (error) {
    handleError(res, error, 'Erro ao buscar visão das mesas');
  }
};
export const getTables = async (_req: Request, res: Response) => {
  try {
    const activeStatuses = ['NEW', 'IN_PROGRESS', 'READY', 'DELIVERED'] as const;
    const [tables, activeOrders] = await Promise.all([
      tableService.listAll(),
      orderRepository.findByStatuses([...activeStatuses]),
    ]);
    const ordersByStatus = new Map(
      activeStatuses.map((status) => [
        status,
        activeOrders.filter((order) => order.status === status),
      ])
    );

    // Mantém a ordem legada: status primeiro, created_at dentro de cada status.
    const enriched = tables.map((table) => ({
      ...table,
      orders: activeStatuses.flatMap((status) =>
        (ordersByStatus.get(status) ?? []).filter((order) => order.tableId === table.id)
      ),
    }));

    res.json(enriched);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar mesas');
  }
};

export const getTableById = async (req: Request, res: Response) => {
  try {
    const table = await tableService.findById(req.params.id);
    res.json(table);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar mesa');
  }
};

export const createTable = async (req: Request, res: Response) => {
  try {
    const table = await tableService.create(parseInt(req.body.number));
    res.status(201).json(table);
  } catch (error) {
    handleError(res, error, 'Erro ao criar mesa');
  }
};

export const updateTableStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (status === 'AVAILABLE') {
      const hasActiveOrder = await orderRepository.hasActiveByTable(req.params.id);
      if (hasActiveOrder) {
        return res.status(400).json({
          message: 'Não é possível liberar a mesa. Existe um pedido ativo vinculado a ela. Finalize ou cancele o pedido primeiro.',        });
      }
    }

    const table = await tableService.updateStatus(req.params.id, status);
    res.json(table);
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar status da mesa');
  }
};

export const deleteTable = async (req: Request, res: Response) => {
  try {
    await tableService.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error, 'Erro ao excluir mesa');
  }
};