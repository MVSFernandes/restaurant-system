import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  closeTableTab,
  getTableTab,
  renameTableTab,
} from '../controllers/tableTab.controller';

const router = Router();
router.use(authenticate);
router.get('/:tabId', getTableTab);
router.patch('/:tabId', authorize('ADMIN', 'CASHIER', 'WAITER'), renameTableTab);
router.post('/:tabId/close', authorize('ADMIN', 'CASHIER'), closeTableTab);
export default router;
