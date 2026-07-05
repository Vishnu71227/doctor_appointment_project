import AdminNotification from '../models/AdminNotification.js';
import NotificationLog from '../models/NotificationLog.js';
import { dispatchNotification } from '../services/notification.service.js';
import { recordAuditLog } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

/** GET /admin/notifications — list with filters */
export const listNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};
    if (status) query.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [notifications, total] = await Promise.all([
      AdminNotification.find(query).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).lean(),
      AdminNotification.countDocuments(query),
    ]);
    res.json({ notifications, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (err) {
    res.status(500).json({ detail: 'Notifications load nahi ho sake' });
  }
};

/** POST /admin/notifications — create draft */
export const createNotification = async (req, res) => {
  try {
    const { title, message, channels, target_type, target_role, target_user_ids, scheduled_at } = req.body;
    if (!title || !message) return res.status(400).json({ detail: 'title and message required' });
    if (!channels?.length) return res.status(400).json({ detail: 'At least one channel required' });

    const notif = await AdminNotification.create({
      title,
      message,
      channels,
      target_type: target_type || 'broadcast',
      target_role: target_role || 'all',
      target_user_ids: target_user_ids || [],
      scheduled_at: scheduled_at || null,
      status: scheduled_at ? 'scheduled' : 'draft',
      created_by: req.user.email,
    });

    await recordAuditLog({ req, action: 'notification.create', resource: 'AdminNotification', resource_id: notif.notification_id, new_value: { title, channels, target_type } });
    res.status(201).json({ notification: notif });
  } catch (err) {
    logger.error('createNotification:', err);
    res.status(500).json({ detail: 'Notification create nahi hua' });
  }
};

/** POST /admin/notifications/:id/send — send now */
export const sendNotification = async (req, res) => {
  try {
    const notif = await AdminNotification.findById(req.params.id);
    if (!notif) return res.status(404).json({ detail: 'Notification not found' });
    if (notif.status === 'sending') return res.status(409).json({ detail: 'Already sending' });
    if (notif.status === 'sent') return res.status(409).json({ detail: 'Already sent. Create a new one to resend.' });

    // Respond immediately, dispatch async
    res.json({ message: 'Notification dispatch shuru ho gaya', notification_id: notif.notification_id });

    // Fire and forget — does not block response
    dispatchNotification(notif.notification_id).catch((err) =>
      logger.error('[Notification] Async dispatch error:', err)
    );

    await recordAuditLog({ req, action: 'notification.send', resource: 'AdminNotification', resource_id: notif.notification_id });
  } catch (err) {
    logger.error('sendNotification:', err);
    res.status(500).json({ detail: 'Send failed' });
  }
};

/** PATCH /admin/notifications/:id — update draft */
export const updateNotification = async (req, res) => {
  try {
    const notif = await AdminNotification.findById(req.params.id);
    if (!notif) return res.status(404).json({ detail: 'Notification not found' });
    if (['sent', 'sending'].includes(notif.status)) {
      return res.status(409).json({ detail: 'Cannot edit a sent/sending notification' });
    }
    const fields = ['title', 'message', 'channels', 'target_type', 'target_role', 'target_user_ids', 'scheduled_at'];
    for (const f of fields) { if (req.body[f] !== undefined) notif[f] = req.body[f]; }
    await notif.save();
    res.json({ notification: notif });
  } catch (err) {
    res.status(500).json({ detail: 'Update nahi hua' });
  }
};

/** DELETE /admin/notifications/:id — delete draft only */
export const deleteNotification = async (req, res) => {
  try {
    const notif = await AdminNotification.findById(req.params.id);
    if (!notif) return res.status(404).json({ detail: 'Notification not found' });
    if (['sent', 'sending'].includes(notif.status)) {
      return res.status(409).json({ detail: 'Cannot delete a sent/sending notification' });
    }
    await notif.deleteOne();
    await recordAuditLog({ req, action: 'notification.delete', resource: 'AdminNotification', resource_id: notif.notification_id });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ detail: 'Delete nahi hua' });
  }
};

/** GET /admin/notifications/history — delivery log */
export const notificationHistory = async (req, res) => {
  try {
    const { page = 1, limit = 25, channel, status, user_id } = req.query;
    const query = {};
    if (channel) query.channel = channel;
    if (status) query.status = status;
    if (user_id) query.user_id = user_id;
    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      NotificationLog.find(query).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).lean(),
      NotificationLog.countDocuments(query),
    ]);
    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (err) {
    res.status(500).json({ detail: 'History load nahi hui' });
  }
};

/** GET /admin/notifications/stats */
export const notificationStats = async (req, res) => {
  try {
    const [campaignStats, deliveryStats] = await Promise.all([
      AdminNotification.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, total_sent: { $sum: '$sent_count' }, total_failed: { $sum: '$failed_count' } } }]),
      NotificationLog.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const byStatus = Object.fromEntries(campaignStats.map((s) => [s._id, { count: s.count, sent: s.total_sent, failed: s.total_failed }]));
    const delivery = Object.fromEntries(deliveryStats.map((s) => [s._id, s.count]));
    res.json({ campaigns: byStatus, delivery });
  } catch (err) {
    res.status(500).json({ detail: 'Stats load nahi hua' });
  }
};

export default {
  listNotifications,
  createNotification,
  sendNotification,
  updateNotification,
  deleteNotification,
  notificationHistory,
  notificationStats,
};
