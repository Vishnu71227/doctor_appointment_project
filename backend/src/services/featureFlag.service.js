import FeatureFlag from '../models/FeatureFlag.js';
import logger from '../utils/logger.js';

// ── Default system flags ────────────────────────────────────────────────────
const DEFAULT_FLAGS = [
  { key: 'video_consultation', name: 'Video Consultation', description: 'Enable video call feature for appointments', category: 'consultation', enabled: true, strategy: 'global', is_system: true },
  { key: 'prescription_pdf', name: 'Prescription PDF Download', description: 'Allow patients to download prescriptions as PDF', category: 'ui', enabled: true, strategy: 'global', is_system: true },
  { key: 'coupon_system', name: 'Coupon / Discount System', description: 'Allow coupon codes during booking', category: 'payment', enabled: true, strategy: 'global', is_system: true },
  { key: 'razorpay_payments', name: 'Razorpay Payments', description: 'Enable Razorpay payment gateway', category: 'payment', enabled: true, strategy: 'global', is_system: true },
  { key: 'whatsapp_notifications', name: 'WhatsApp Notifications', description: 'Send appointment reminders via WhatsApp', category: 'notification', enabled: false, strategy: 'global', is_system: false },
  { key: 'sms_notifications', name: 'SMS Notifications', description: 'Send OTPs and reminders via SMS', category: 'notification', enabled: true, strategy: 'global', is_system: true },
  { key: 'doctor_ratings', name: 'Doctor Ratings & Reviews', description: 'Allow patients to rate doctors after consultation', category: 'ui', enabled: true, strategy: 'global', is_system: false },
  { key: 'ai_symptom_checker', name: 'AI Symptom Checker', description: 'Experimental AI symptom analysis before booking', category: 'experimental', enabled: false, strategy: 'global', is_system: false },
  { key: 'new_dashboard_ui', name: 'New Dashboard UI', description: 'Beta redesigned patient dashboard', category: 'ui', enabled: false, strategy: 'percent', rollout_percent: 0, is_system: false },
  { key: 'multi_doctor_appointment', name: 'Multi-Doctor Appointments', description: 'Book appointments with multiple doctors in one session', category: 'consultation', enabled: false, strategy: 'global', is_system: false },
  { key: 'family_accounts', name: 'Family Account Linking', description: 'Link family members under one account', category: 'backend', enabled: false, strategy: 'global', is_system: false },
  { key: 'insurance_integration', name: 'Insurance Integration', description: 'Accept insurance claims for consultations', category: 'payment', enabled: false, strategy: 'global', is_system: false },
];

// ── Short-lived in-memory cache (10 seconds) ────────────────────────────────
let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 10_000;

const invalidateCache = () => { _cache = null; _cacheTs = 0; };

const getAllFlags = async () => {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL) return _cache;
  _cache = await FeatureFlag.find().lean();
  _cacheTs = now;
  return _cache;
};

// ── Seed defaults ───────────────────────────────────────────────────────────
let _seeded = false;
export const seedDefaultFlags = async () => {
  if (_seeded) return;
  try {
    await Promise.all(
      DEFAULT_FLAGS.map((f) =>
        FeatureFlag.findOneAndUpdate({ key: f.key }, { $setOnInsert: f }, { upsert: true, new: true })
      )
    );
    _seeded = true;
    invalidateCache();
    logger.info('[FeatureFlags] Defaults seeded');
  } catch (err) {
    logger.error('[FeatureFlags] Seed error:', err);
  }
};

/**
 * Check if a feature is enabled for a given user context.
 * @param {string} key — flag key
 * @param {{ role?: string, id?: string }} user — optional user context
 */
export const isEnabled = async (key, user = {}) => {
  try {
    await seedDefaultFlags();
    const flags = await getAllFlags();
    const flag = flags.find((f) => f.key === key);
    if (!flag || !flag.enabled) return false;

    switch (flag.strategy) {
      case 'global':
        return true;
      case 'role':
        return flag.allowed_roles.includes(user.role);
      case 'user':
        return flag.allowed_user_ids.includes(user.id);
      case 'percent': {
        if (!user.id) return Math.random() * 100 < flag.rollout_percent;
        // Deterministic hash so same user always gets same result
        const hash = user.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        return (hash % 100) < flag.rollout_percent;
      }
      default:
        return flag.enabled;
    }
  } catch {
    return false; // fail-safe: feature off on error
  }
};

export { getAllFlags, invalidateCache };
export default { seedDefaultFlags, isEnabled, getAllFlags, invalidateCache };
