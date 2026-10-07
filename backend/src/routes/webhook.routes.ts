import { Router } from 'express';
import { receiveFocusWebhook } from '../controllers/invoice.controller';
import { verifyFocusWebhook } from '../middlewares/focusWebhook.middleware';

const router = Router();

router.post('/focus-nfe', verifyFocusWebhook, receiveFocusWebhook);

export default router;
