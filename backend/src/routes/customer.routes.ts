import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
  getCustomers,
  getCustomerCredits,
  getCustomerCredit,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  payCredit,
  addCreditCharge,
} from '../controllers/customer.controller';

const router = Router();

// Fiado é dinheiro de cliente: lançar dívida, dar baixa, mudar limite e criar
// cliente ficam com quem recebe no balcão ou cuida do financeiro. O garçom
// fica de fora (docs/etapas/etapa-papeis-dinheiro.md).
const creditRoles = authorize('ADMIN', 'FINANCE', 'CASHIER');

router.use(authenticate);

router.get('/credit', getCustomerCredits);
router.get('/', getCustomers);
router.get('/:id/credit', getCustomerCredit);
router.post('/', creditRoles, createCustomer);
router.put('/:id', creditRoles, updateCustomer);
router.delete('/:id', authorize('ADMIN'), deleteCustomer);
router.post('/:id/payments', creditRoles, payCredit);
router.post('/:id/pay-credit', creditRoles, payCredit);
router.post('/:id/charge-credit', creditRoles, addCreditCharge);

export default router;
