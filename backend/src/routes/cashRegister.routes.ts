import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  closeCashRegister,
  createCashWithdrawal,
  getCashRegisterHistory,
  getCashClosuresHistory,
  getClosedOrdersHistory,
  getCurrentCashRegister,
  openCashRegister,
  suggestWithdrawalAmount,
} from '../controllers/cashRegister.controller';

const router = Router();

router.use(authenticate);
router.get('/current', getCurrentCashRegister);
router.get('/history', authorize('ADMIN', 'CASHIER', 'FINANCE'), getCashRegisterHistory);
router.get('/closures-history', authorize('ADMIN', 'CASHIER'), getCashClosuresHistory);
router.get('/orders-history', authorize('ADMIN', 'CASHIER'), getClosedOrdersHistory);
router.get('/suggest-withdrawal', authorize('ADMIN', 'CASHIER'), suggestWithdrawalAmount);
router.post('/open', authorize('ADMIN', 'CASHIER'), openCashRegister);
router.post('/close', authorize('ADMIN', 'CASHIER'), closeCashRegister);
router.post('/withdrawals', authorize('ADMIN', 'CASHIER'), createCashWithdrawal);

export default router;
