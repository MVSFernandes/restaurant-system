import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { createInvoice, createOrderInvoice, createNfce, getInvoice, getOrderInvoices, getOrderInvoice } from '../controllers/invoice.controller';

const router = Router();

router.use(authenticate);

router.post('/', authorize('ADMIN', 'FINANCE'), createInvoice);
router.post('/nfe', authorize('ADMIN', 'CASHIER', 'FINANCE'), createOrderInvoice);
router.post('/nfce', authorize('ADMIN', 'CASHIER'), createNfce);
router.get('/orders', authorize('ADMIN', 'CASHIER', 'FINANCE'), getOrderInvoices);
router.get('/order/:orderId', authorize('ADMIN', 'CASHIER', 'FINANCE'), getOrderInvoice);
router.get('/:id', authorize('ADMIN', 'CASHIER', 'FINANCE'), getInvoice);

export default router;
