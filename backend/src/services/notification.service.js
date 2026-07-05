import User from '../models/User.js';
import AdminNotification from '../models/AdminNotification.js';
import NotificationLog from '../models/NotificationLog.js';
import { sendOtpEmail } from './email.service.js';
import smsService from './sms.service.js';
import logger from '../utils/logger.js';
import { generateId } from '../utils/helpers.js';

/**
 * Resolve the list of user documents to notify.
 */
const resolveRecipients = async ({ target_type, target_role, target_user_ids }) => {
  if (target_type === 'targeted' && target_user_ids?.length > 0) {
    return User.find({ id: { $in: target_user_ids }, is_active: true }).select('id email full_name phone').lean();
  }
  const query = { is_active: true };
  if (target_type === 'role_based' && target_role && target_role !== 'all') {
    query.role = target_role;
  }
  return User.find(query).select('id email full_name phone').lean();
};

/**
 * Send a notification via email channel.
 * Re-uses existing nodemailer transporter pattern.
 */
const sendEmailNotification = async ({ to, name, title, message }) => {
  try {
    const nodemailer = (await import('nodemailer')).default;
    const { getSetting } = await import('./systemSettings.service.js');

    const host = await getSetting('smtp.host');
    const port = await getSetting('smtp.port', 587);
    const user = await getSetting('smtp.user');
    const pass = await getSetting('smtp.pass');
    const from = await getSetting('smtp.from', 'noreply@healthline.com');
    const fromName = await getSetting('smtp.from_name', 'HealthLine');

    if (!host || !user || !pass) {
      logger.warn('[Notification] SMTP not configured, skipping email to', to);
      return false;
    }

    const transporter = nodemailer.createTransport({
      host, port: Number(port), secure: false,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject: title,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#0f766e,#14b8a6);padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:20px;">🏥 HealthLine</h1>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
          <h2 style="color:#0f766e;font-size:18px;margin:0 0 12px;">${title}</h2>
          <p style="color:#374151;line-height:1.6;">${message}</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Namaste ${name || 'User'},<br>— HealthLine Team</p>
        </div>
      </div>`,
    });
    return true;
  } catch (err) {
    logger.error('[Notification] Email send error:', err.message);
    return false;
  }
};

/**
 * Send notification via SMS channel using existing sms.service.
 */
const sendSmsNotification = async ({ phone, message }) => {
  try {
    if (!phone) return false;
    // Reuse existing SMSService's generic send method if available
    const result = await smsService.sendCustomSMS?.(phone, message);
    return !!result;
  } catch (err) {
    logger.error('[Notification] SMS send error:', err.message);
    return false;
  }
};

/**
 * Main dispatch function. Updates notification doc with counters.
 * Runs asynchronously — does not block the HTTP response.
 */
export const dispatchNotification = async (notificationId) => {
  const notif = await AdminNotification.findOne({ notification_id: notificationId });
  if (!notif) { logger.error('[Notification] Doc not found:', notificationId); return; }

  try {
    notif.status = 'sending';
    await notif.save();

    const recipients = await resolveRecipients({
      target_type: notif.target_type,
      target_role: notif.target_role,
      target_user_ids: notif.target_user_ids,
    });

    notif.total_recipients = recipients.length;
    let sent = 0, failed = 0;

    for (const user of recipients) {
      const channels = notif.channels;
      let userSent = false;

      for (const channel of channels) {
        try {
          let ok = false;
          if (channel === 'email' && user.email) {
            ok = await sendEmailNotification({ to: user.email, name: user.full_name, title: notif.title, message: notif.message });
          } else if (channel === 'sms' && user.phone) {
            ok = await sendSmsNotification({ phone: user.phone, message: `${notif.title}: ${notif.message}` });
          } else if (channel === 'in_app') {
            // in_app = logged to NotificationLog so user can read in their notification center
            await NotificationLog.create({
              id: generateId(),
              user_id: user.id,
              channel: 'email', // reuse channel field
              type: 'booking', // closest available enum
              recipient: user.email,
              status: 'sent',
            });
            ok = true;
          }
          if (ok) userSent = true;
        } catch (chErr) {
          logger.error(`[Notification] Channel ${channel} error for user ${user.id}:`, chErr.message);
        }
      }

      if (userSent) sent++; else failed++;
    }

    notif.status = 'sent';
    notif.sent_at = new Date();
    notif.sent_count = sent;
    notif.failed_count = failed;
    await notif.save();

    logger.info(`[Notification] ${notificationId} dispatched: ${sent} sent, ${failed} failed`);
  } catch (err) {
    logger.error('[Notification] Dispatch error:', err);
    notif.status = 'failed';
    notif.error_log = err.message;
    await notif.save();
  }
};

export default { dispatchNotification };
