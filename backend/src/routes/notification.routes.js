import express from 'express';
import {
  listNotifications,
  createNotification,
  sendNotification,
  updateNotification,
  deleteNotification,
  notificationHistory,
  notificationStats,
} from '../controllers/notification.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/stats', requirePermission('notifications.view'), notificationStats);
router.get('/history', requirePermission('notifications.view'), notificationHistory);
router.get('/', requirePermission('notifications.view'), listNotifications);
router.post('/', requirePermission('notifications.manage'), createNotification);
router.patch('/:id', requirePermission('notifications.manage'), updateNotification);
router.delete('/:id', requirePermission('notifications.manage'), deleteNotification);
router.post('/:id/send', requirePermission('notifications.manage'), sendNotification);

export default router;
