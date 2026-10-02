import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  getProducts, getProductById, createProduct, updateProduct, setProductPaused, deleteProduct
} from '../controllers/product.controller';

const router = Router();

router.get('/', getProducts);
router.get('/:id', getProductById);
router.post('/', authenticate, authorize('ADMIN'), createProduct);
router.put('/:id', authenticate, authorize('ADMIN'), updateProduct);
router.patch('/:id/pause', authenticate, authorize('ADMIN', 'CASHIER'), setProductPaused);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteProduct);

export default router;
