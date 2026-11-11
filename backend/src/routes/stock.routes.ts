import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  getStockItems,
  getStockItemById,
  getLowStockItems,
  createStockItem,
  updateStockItem,
  deleteStockItem,
} from '../controllers/stock.controller';

const router = Router();

router.use(authenticate);

// Insumos (quantidade em estoque, mínimo, itens em falta) são dado de gestão:
// o garçom não usa estas consultas em mesas, comandas ou pedidos. O que ele
// precisa saber, se o produto está disponível, vem no cardápio (/categories).
const readers = authorize('ADMIN', 'CASHIER', 'FINANCE');

router.get('/', readers, getStockItems);
router.get('/low', readers, getLowStockItems);
router.get('/:id', readers, getStockItemById);
router.post('/', authorize('ADMIN', 'FINANCE'), createStockItem);
router.put('/:id', authorize('ADMIN', 'FINANCE'), updateStockItem);
router.delete('/:id', authorize('ADMIN'), deleteStockItem);

export default router;