import express from 'express';
import {
  publicValidateCoupon,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  couponUsageReport,
  couponAnalytics,
} from '../controllers/coupon.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ── Public (auth required but not admin — called from booking flow) ──────────
router.post('/validate', authMiddleware, publicValidateCoupon);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/analytics', requirePermission('coupons.view'), couponAnalytics);
router.get('/', requirePermission('coupons.view'), listCoupons);
router.post('/', requirePermission('coupons.manage'), createCoupon);
router.patch('/:id', requirePermission('coupons.manage'), updateCoupon);
router.delete('/:id', requirePermission('coupons.manage'), deleteCoupon);
router.get('/:id/report', requirePermission('coupons.view'), couponUsageReport);

export default router;
