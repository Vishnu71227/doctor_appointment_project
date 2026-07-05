import express from 'express';
import { getVideoStats, getCallLogs, getDoctorPerformance, getVideoTrends, updateCallLog } from '../controllers/videoAnalytics.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/stats', requirePermission('video.view'), getVideoStats);
router.get('/logs', requirePermission('video.view'), getCallLogs);
router.get('/doctor-performance', requirePermission('video.view'), getDoctorPerformance);
router.get('/trends', requirePermission('video.view'), getVideoTrends);
router.patch('/logs/:appointment_id', requirePermission('video.view'), updateCallLog);

export default router;
