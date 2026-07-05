import express from 'express';
import { generateReport, getReportStats } from '../controllers/reports.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/stats', requirePermission('reports.view'), getReportStats);
// GET /admin/reports/export?type=revenue&format=csv&from=2024-01-01&to=2024-12-31
router.get('/export', requirePermission('reports.export'), generateReport);

export default router;
