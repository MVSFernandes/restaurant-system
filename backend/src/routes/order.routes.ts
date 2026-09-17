import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  getOrders, getRecentOrders, getOrderById, createOrder, updateOrderStatus,
  deleteOrder, createPublicOrder, processPayment, getOrderReceipt, updateOrder
} from '../controllers/order.controller';

const router = Router();

// Rota pública para o cardápio digital
router.post('/public', createPublicOrder);

router.use(authenticate);

router.get('/', getOrders);
router.get('/recent', getRecentOrders);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.patch('/:id', updateOrder);
router.patch('/:id/status', updateOrderStatus);
router.post('/:id/payment', processPayment);
router.delete('/:id', authorize('ADMIN', 'CASHIER'), deleteOrder);

router.get('/:id/receipt', getOrderReceipt);

export default router;
