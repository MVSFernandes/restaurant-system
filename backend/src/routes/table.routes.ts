import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  getTables, getTableById, createTable, updateTableStatus, deleteTable
} from '../controllers/table.controller';
import { createTableTab, listTableTabs } from '../controllers/tableTab.controller';

const router = Router();

router.use(authenticate);

router.get('/', getTables);
router.get('/:tableId/tabs', listTableTabs);
router.post('/:tableId/tabs', authorize('ADMIN', 'CASHIER', 'WAITER'), createTableTab);
router.get('/:id', getTableById);
router.post('/', authorize('ADMIN'), createTable);
router.patch('/:id/status', authorize('ADMIN', 'CASHIER', 'WAITER'), updateTableStatus);
router.delete('/:id', authorize('ADMIN'), deleteTable);

export default router;
