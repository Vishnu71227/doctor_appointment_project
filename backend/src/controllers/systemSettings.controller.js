import { getAllSettings, updateSettings, getSetting } from '../services/systemSettings.service.js';
import { recordAuditLog } from '../services/auditLog.service.js';
import SystemSetting from '../models/SystemSetting.js';
import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

/**
 * GET /admin/settings
 * Returns all settings grouped. Secrets are redacted.
 */
export const getSettings = async (req, res) => {
  try {
    const grouped = await getAllSettings({ includeSecrets: false });
    res.json({ settings: grouped });
  } catch (err) {
    logger.error('getSettings error:', err);
    res.status(500).json({ detail: 'Settings load nahi ho sake' });
  }
};

/**
 * PATCH /admin/settings
 * Body: { updates: [{ key, value }] }
 * Bulk update one or more settings.
 */
export const patchSettings = async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ detail: 'updates array required' });
    }
    const readonly = await SystemSetting.find({
      key: { $in: updates.map((u) => u.key) },
      is_readonly: true,
    }).lean();
    if (readonly.length) {
      return res.status(403).json({ detail: `Read-only keys cannot be changed: ${readonly.map((r) => r.key).join(', ')}` });
    }
    const old_value = {};
    const currentDocs = await SystemSetting.find({ key: { $in: updates.map((u) => u.key) } }).lean();
    for (const d of currentDocs) old_value[d.key] = d.value;

    const updated = await updateSettings(updates);

    await recordAuditLog({
      req,
      action: 'settings.update',
      resource: 'SystemSetting',
      old_value,
      new_value: updates.reduce((acc, u) => { acc[u.key] = u.value; return acc; }, {}),
    });
    res.json({ updated: updated.length, message: 'Settings saved successfully' });
  } catch (err) {
    logger.error('patchSettings error:', err);
    res.status(500).json({ detail: 'Settings save nahi hue' });
  }
};

/**
 * POST /admin/settings/test-smtp
 * Send a test email using saved SMTP config.
 */
export const testSmtp = async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ detail: 'to email required' });

    const host = await getSetting('smtp.host');
    const port = await getSetting('smtp.port', 587);
    const secure = await getSetting('smtp.secure', false);
    const user = await getSetting('smtp.user');
    const pass = await getSetting('smtp.pass');
    const from = await getSetting('smtp.from', 'noreply@healthline.com');
    const fromName = await getSetting('smtp.from_name', 'HealthLine');

    if (!host || !user || !pass) {
      return res.status(400).json({ detail: 'SMTP settings incomplete. Host, user aur password required hain.' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Boolean(secure),
      auth: { user, pass },
    });

    await transporter.verify();
    await transporter.sendMail({
      from: `"${fromName}" <${from}>`,
      to,
      subject: 'HealthLine — SMTP Test Email',
      html: `<div style="font-family:sans-serif;padding:24px;">
        <h2>✅ SMTP Working!</h2>
        <p>Yeh test email HealthLine Admin Panel se bheji gayi hai.</p>
        <small>Time: ${new Date().toISOString()}</small>
      </div>`,
    });

    await recordAuditLog({ req, action: 'settings.smtp_test', resource: 'SystemSetting', new_value: { to } });
    res.json({ message: `Test email sent to ${to}` });
  } catch (err) {
    logger.error('testSmtp error:', err);
    res.status(500).json({ detail: `SMTP test failed: ${err.message}` });
  }
};

/**
 * GET /admin/settings/maintenance
 * Public-ish endpoint checked by maintenance middleware.
 */
export const getMaintenanceStatus = async (req, res) => {
  try {
    const enabled = await getSetting('maintenance.enabled', false);
    const message = await getSetting('maintenance.message', '');
    const estimated_end = await getSetting('maintenance.estimated_end', '');
    res.json({ maintenance: { enabled, message, estimated_end } });
  } catch (err) {
    res.json({ maintenance: { enabled: false } });
  }
};

export default { getSettings, patchSettings, testSmtp, getMaintenanceStatus };
