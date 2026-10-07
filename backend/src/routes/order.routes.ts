import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  getOrders, getRecentOrders, getOrderHistory, getOrderById, createOrder, updateOrderStatus,
  deleteOrder, createPublicOrder, processPayment, getOrderReceipt, updateOrder
} from '../controllers/order.controller';

const router = Router();

// Rota pública para o cardápio digital
router.post('/public', createPublicOrder);

router.use(authenticate);

router.get('/', getOrders);
router.get('/recent', getRecentOrders);
router.get('/history', authorize('ADMIN', 'CASHIER'), getOrderHistory);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.patch('/:id', updateOrder);
router.patch('/:id/status', updateOrderStatus);
// Quem fecha a conta é o caixa: o garçom lança o pedido, não recebe o dinheiro.
router.post('/:id/payment', authorize('ADMIN', 'CASHIER'), processPayment);
router.delete('/:id', authorize('ADMIN', 'CASHIER'), deleteOrder);

router.get('/:id/receipt', getOrderReceipt);

export default router;
