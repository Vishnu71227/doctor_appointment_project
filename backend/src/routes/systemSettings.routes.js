import express from 'express';
import { getSettings, patchSettings, testSmtp, getMaintenanceStatus } from '../controllers/systemSettings.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public maintenance status (checked by frontend + middleware)
router.get('/public/maintenance', getMaintenanceStatus);

// All other routes require admin auth + permission
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', requirePermission('settings.view'), getSettings);
router.patch('/', requirePermission('settings.manage'), patchSettings);
router.post('/test-smtp', requirePermission('settings.manage'), testSmtp);

export default router;
