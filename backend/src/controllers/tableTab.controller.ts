import { Request, Response } from 'express';
import { tableTabService } from '../services/tableTab.service';
import { DomainError } from '../types/errors';
import { publishTableTabChanged } from '../lib/realtime';
import { TABLE_TAB_EVENTS } from '../constants/realtime';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) {
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
      details: error.details,
    });
  }
  console.error(error);
  return res.status(500).json({ message: fallback });
};

export const listTableTabs = async (req: Request, res: Response) => {
  try {
    const status = req.query.status === 'OPEN' || req.query.status === 'CLOSED'
      ? req.query.status
      : undefined;
    res.json(await tableTabService.listForTable(req.params.tableId, status));
  } catch (error) {
    handleError(res, error, 'Erro ao buscar comandas');
  }
};

export const createTableTab = async (req: Request, res: Response) => {
  try {
    const tab = await tableTabService.create(req.params.tableId, req.body.name, (req as any).user.id);
    void publishTableTabChanged(TABLE_TAB_EVENTS.created, { tabId: tab.id, tableId: tab.tableId });
    res.status(201).json(tab);
  } catch (error) {
    handleError(res, error, 'Erro ao abrir comanda');
  }
};

export const getTableTab = async (req: Request, res: Response) => {
  try {
    res.json(await tableTabService.findById(req.params.tabId));
  } catch (error) {
    handleError(res, error, 'Erro ao buscar comanda');
  }
};

export const renameTableTab = async (req: Request, res: Response) => {
  try {
    const tab = await tableTabService.rename(req.params.tabId, req.body.name);
    void publishTableTabChanged(TABLE_TAB_EVENTS.updated, { tabId: tab.id, tableId: tab.tableId });
    res.json(tab);
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar comanda');
  }
};

export const closeTableTab = async (req: Request, res: Response) => {
  try {
    const tab = await tableTabService.close(
      req.params.tabId,
      req.body.method,
      req.body.customerId,
      (req as any).user.id
    );
    void publishTableTabChanged(TABLE_TAB_EVENTS.closed, { tabId: tab.id, tableId: tab.tableId });
    void publishTableTabChanged(TABLE_TAB_EVENTS.tableUpdated, { tabId: tab.id, tableId: tab.tableId });
    res.json(tab);
  } catch (error) {
    handleError(res, error, 'Erro ao fechar comanda');
  }
};
