import express from 'express';
import { publicGetFlags, adminListFlags, createFlag, updateFlag, deleteFlag } from '../controllers/featureFlag.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Public (auth optional — returns flags for current user context)
router.get('/public', authMiddleware, publicGetFlags);

// Admin
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', requirePermission('feature_flags.view'), adminListFlags);
router.post('/', requirePermission('feature_flags.manage'), createFlag);
router.patch('/:key', requirePermission('feature_flags.manage'), updateFlag);
router.delete('/:key', requirePermission('feature_flags.manage'), deleteFlag);

export default router;
