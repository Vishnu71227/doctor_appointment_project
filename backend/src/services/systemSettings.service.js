import SystemSetting from '../models/SystemSetting.js';
import logger from '../utils/logger.js';

/**
 * Default settings catalogue. Each entry is upserted only on first run
 * (uses $setOnInsert so manual admin changes are never overwritten).
 */
const DEFAULT_SETTINGS = [
  // ── App ────────────────────────────────────────────────────────
  { group: 'app', key: 'app.name', value: 'HealthLine', label: 'Application Name', type: 'string' },
  { group: 'app', key: 'app.tagline', value: 'Your Health, Our Priority', label: 'Tagline', type: 'string' },
  { group: 'app', key: 'app.logo_url', value: '', label: 'Logo URL', type: 'string' },
  { group: 'app', key: 'app.timezone', value: 'Asia/Kolkata', label: 'Timezone', type: 'string' },
  { group: 'app', key: 'app.support_email', value: 'support@healthline.com', label: 'Support Email', type: 'string' },
  { group: 'app', key: 'app.support_phone', value: '', label: 'Support Phone', type: 'string' },
  { group: 'app', key: 'app.currency', value: 'INR', label: 'Currency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP'] },

  // ── Maintenance ────────────────────────────────────────────────
  { group: 'maintenance', key: 'maintenance.enabled', value: false, label: 'Maintenance Mode', description: 'When ON, all non-admin API requests return 503.', type: 'boolean' },
  { group: 'maintenance', key: 'maintenance.message', value: 'We are under maintenance. Back soon!', label: 'Maintenance Message', type: 'string' },
  { group: 'maintenance', key: 'maintenance.estimated_end', value: '', label: 'Estimated End Time', type: 'string' },

  // ── SMTP ───────────────────────────────────────────────────────
  { group: 'smtp', key: 'smtp.host', value: '', label: 'SMTP Host', type: 'string' },
  { group: 'smtp', key: 'smtp.port', value: 587, label: 'SMTP Port', type: 'number' },
  { group: 'smtp', key: 'smtp.secure', value: false, label: 'TLS / SSL', type: 'boolean' },
  { group: 'smtp', key: 'smtp.user', value: '', label: 'SMTP Username', type: 'string' },
  { group: 'smtp', key: 'smtp.pass', value: '', label: 'SMTP Password', type: 'string', is_secret: true },
  { group: 'smtp', key: 'smtp.from', value: 'noreply@healthline.com', label: 'From Address', type: 'string' },
  { group: 'smtp', key: 'smtp.from_name', value: 'HealthLine', label: 'From Name', type: 'string' },

  // ── SMS (MSG91 / Fast2SMS) ─────────────────────────────────────
  { group: 'sms', key: 'sms.provider', value: 'fast2sms', label: 'SMS Provider', type: 'select', options: ['fast2sms', 'msg91', 'twilio'] },
  { group: 'sms', key: 'sms.api_key', value: '', label: 'API Key', type: 'string', is_secret: true },
  { group: 'sms', key: 'sms.sender_id', value: 'HLTLNE', label: 'Sender ID', type: 'string' },
  { group: 'sms', key: 'sms.enabled', value: false, label: 'SMS Enabled', type: 'boolean' },

  // ── WhatsApp ───────────────────────────────────────────────────
  { group: 'whatsapp', key: 'whatsapp.enabled', value: false, label: 'WhatsApp Enabled', type: 'boolean' },
  { group: 'whatsapp', key: 'whatsapp.access_token', value: '', label: 'Access Token', type: 'string', is_secret: true },
  { group: 'whatsapp', key: 'whatsapp.phone_number_id', value: '', label: 'Phone Number ID', type: 'string' },
  { group: 'whatsapp', key: 'whatsapp.business_account_id', value: '', label: 'Business Account ID', type: 'string' },

  // ── Payment (Razorpay) ─────────────────────────────────────────
  { group: 'payment', key: 'payment.gateway', value: 'razorpay', label: 'Payment Gateway', type: 'select', options: ['razorpay', 'stripe'] },
  { group: 'payment', key: 'payment.razorpay_key_id', value: '', label: 'Razorpay Key ID', type: 'string' },
  { group: 'payment', key: 'payment.razorpay_key_secret', value: '', label: 'Razorpay Key Secret', type: 'string', is_secret: true },
  { group: 'payment', key: 'payment.razorpay_webhook_secret', value: '', label: 'Webhook Secret', type: 'string', is_secret: true },
  { group: 'payment', key: 'payment.test_mode', value: true, label: 'Test Mode', type: 'boolean' },
  { group: 'payment', key: 'payment.gst_percent', value: 0, label: 'GST %', type: 'number' },

  // ── Storage ────────────────────────────────────────────────────
  { group: 'storage', key: 'storage.provider', value: 'local', label: 'Storage Provider', type: 'select', options: ['local', 's3', 'cloudinary', 'gcs'] },
  { group: 'storage', key: 'storage.bucket', value: '', label: 'Bucket / Container Name', type: 'string' },
  { group: 'storage', key: 'storage.region', value: 'ap-south-1', label: 'Region', type: 'string' },
  { group: 'storage', key: 'storage.access_key', value: '', label: 'Access Key', type: 'string', is_secret: true },
  { group: 'storage', key: 'storage.secret_key', value: '', label: 'Secret Key', type: 'string', is_secret: true },
  { group: 'storage', key: 'storage.cdn_url', value: '', label: 'CDN Base URL', type: 'string' },
];

let _seeded = false;

/**
 * Idempotently seed defaults. Called lazily — never blocks boot.
 */
export const seedDefaultSettings = async () => {
  if (_seeded) return;
  try {
    await Promise.all(
      DEFAULT_SETTINGS.map((s) =>
        SystemSetting.findOneAndUpdate(
          { key: s.key },
          { $setOnInsert: s },
          { upsert: true, new: true }
        )
      )
    );
    _seeded = true;
    logger.info('[SystemSettings] Defaults seeded/verified');
  } catch (err) {
    logger.error('[SystemSettings] Seed error:', err);
  }
};

/**
 * Return all settings grouped by their group key.
 * Redacts is_secret values (replaced with '••••••••').
 */
export const getAllSettings = async ({ includeSecrets = false } = {}) => {
  await seedDefaultSettings();
  const docs = await SystemSetting.find().sort({ group: 1, key: 1 }).lean();
  const grouped = {};
  for (const doc of docs) {
    if (!grouped[doc.group]) grouped[doc.group] = [];
    grouped[doc.group].push({
      ...doc,
      value: !includeSecrets && doc.is_secret && doc.value ? '••••••••' : doc.value,
    });
  }
  return grouped;
};

/**
 * Bulk update settings from an array [{key, value}].
 * Returns array of updated documents.
 */
export const updateSettings = async (updates = []) => {
  const results = [];
  for (const { key, value } of updates) {
    const doc = await SystemSetting.findOneAndUpdate(
      { key },
      { $set: { value } },
      { new: true }
    );
    if (doc) results.push(doc);
  }
  return results;
};

/**
 * Runtime value accessor — used by services to read live DB-backed settings.
 */
export const getSetting = async (key, fallback = null) => {
  await seedDefaultSettings();
  const doc = await SystemSetting.findOne({ key }).lean();
  return doc ? doc.value : fallback;
};

export default { seedDefaultSettings, getAllSettings, updateSettings, getSetting };
