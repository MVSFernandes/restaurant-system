import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  getSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getSupplierComparison, upsertSupplierPrice
} from '../controllers/supplier.controller';

const router = Router();

router.use(authenticate);

// Fornecedores (contato, telefone, e-mail) e preços de compra dos insumos são
// dado de gestão: o garçom não usa estas consultas em mesas, comandas ou
// pedidos. Mesmo portão das leituras de insumos (stock.routes.ts).
const readers = authorize('ADMIN', 'CASHIER', 'FINANCE');

router.get('/', readers, getSuppliers);
router.post('/', authorize('ADMIN', 'FINANCE'), createSupplier);
router.put('/:id', authorize('ADMIN', 'FINANCE'), updateSupplier);
router.delete('/:id', authorize('ADMIN'), deleteSupplier);
router.get('/comparison', readers, getSupplierComparison);
router.post('/price', authorize('ADMIN', 'FINANCE'), upsertSupplierPrice);

export default router;
