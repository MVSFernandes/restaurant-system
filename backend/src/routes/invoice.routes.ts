import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { createInvoice, createNfce, getInvoice, getOrderNfce } from '../controllers/invoice.controller';

const router = Router();

router.use(authenticate);

router.post('/', authorize('ADMIN', 'FINANCE'), createInvoice);
router.post('/nfce', authorize('ADMIN', 'CASHIER'), createNfce);
router.get('/order/:orderId', authorize('ADMIN', 'CASHIER'), getOrderNfce);
router.get('/:id', authorize('ADMIN', 'CASHIER', 'FINANCE'), getInvoice);

export default router;
