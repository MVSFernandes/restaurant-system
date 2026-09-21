import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { receiveBrandingImage } from '../middlewares/brandingUpload.middleware';
import {
  getConfig,
  getPublicBranding,
  removeBanner,
  removeLogo,
  updateConfig,
  uploadBanner,
  uploadLogo,
} from '../controllers/config.controller';

const router = Router();

router.get('/branding', getPublicBranding);

router.post('/branding/logo', authenticate, authorize('ADMIN'), receiveBrandingImage, uploadLogo);
router.post('/branding/banner', authenticate, authorize('ADMIN'), receiveBrandingImage, uploadBanner);
router.delete('/branding/logo', authenticate, authorize('ADMIN'), removeLogo);
router.delete('/branding/banner', authenticate, authorize('ADMIN'), removeBanner);

router.get('/', authenticate, getConfig);
router.put('/', authenticate, authorize('ADMIN'), updateConfig);

export default router;
