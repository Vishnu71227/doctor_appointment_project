import FeatureFlag from '../models/FeatureFlag.js';
import { seedDefaultFlags, isEnabled, invalidateCache } from '../services/featureFlag.service.js';
import { recordAuditLog } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

/** GET /feature-flags/public — returns map of { key: boolean } for the current user */
export const publicGetFlags = async (req, res) => {
  try {
    await seedDefaultFlags();
    const flags = await FeatureFlag.find({ enabled: true }).lean();
    const user = req.user || {};
    const result = {};
    await Promise.all(
      flags.map(async (f) => {
        result[f.key] = await isEnabled(f.key, user);
      })
    );
    res.json({ flags: result });
  } catch (err) {
    res.status(500).json({ detail: 'Flags load nahi ho sake' });
  }
};

/** GET /admin/feature-flags — all flags for admin panel */
export const adminListFlags = async (req, res) => {
  try {
    await seedDefaultFlags();
    const { category } = req.query;
    const query = category ? { category } : {};
    const flags = await FeatureFlag.find(query).sort({ category: 1, key: 1 }).lean();
    res.json({ flags });
  } catch (err) {
    res.status(500).json({ detail: 'Flags load nahi ho sake' });
  }
};

/** POST /admin/feature-flags — create custom flag */
export const createFlag = async (req, res) => {
  try {
    const { key, name, description, enabled, strategy, allowed_roles, allowed_user_ids, rollout_percent, category } = req.body;
    if (!key || !name) return res.status(400).json({ detail: 'key and name required' });

    const exists = await FeatureFlag.findOne({ key: key.toLowerCase() });
    if (exists) return res.status(409).json({ detail: 'Flag with this key already exists' });

    const flag = await FeatureFlag.create({
      key: key.toLowerCase().replace(/\s+/g, '_'),
      name, description,
      enabled: enabled || false,
      strategy: strategy || 'global',
      allowed_roles: allowed_roles || [],
      allowed_user_ids: allowed_user_ids || [],
      rollout_percent: rollout_percent ?? 100,
      category: category || 'other',
    });

    invalidateCache();
    await recordAuditLog({ req, action: 'feature_flag.create', resource: 'FeatureFlag', resource_id: flag.key, new_value: { key: flag.key, enabled: flag.enabled } });
    res.status(201).json({ flag });
  } catch (err) {
    logger.error('createFlag:', err);
    res.status(500).json({ detail: 'Flag create nahi hua' });
  }
};

/** PATCH /admin/feature-flags/:key — toggle or update flag */
export const updateFlag = async (req, res) => {
  try {
    const flag = await FeatureFlag.findOne({ key: req.params.key });
    if (!flag) return res.status(404).json({ detail: 'Flag not found' });

    const old_value = { enabled: flag.enabled, strategy: flag.strategy };
    const fields = ['name', 'description', 'enabled', 'strategy', 'allowed_roles', 'allowed_user_ids', 'rollout_percent', 'category'];
    for (const f of fields) {
      if (req.body[f] !== undefined) flag[f] = req.body[f];
    }
    if (req.body.enabled !== undefined) {
      flag.last_toggled_by = req.user.email;
      flag.last_toggled_at = new Date();
    }
    await flag.save();
    invalidateCache();

    await recordAuditLog({
      req, action: `feature_flag.${req.body.enabled !== undefined ? 'toggle' : 'update'}`,
      resource: 'FeatureFlag', resource_id: flag.key,
      old_value, new_value: { enabled: flag.enabled, strategy: flag.strategy },
    });
    res.json({ flag });
  } catch (err) {
    res.status(500).json({ detail: 'Flag update nahi hua' });
  }
};

/** DELETE /admin/feature-flags/:key */
export const deleteFlag = async (req, res) => {
  try {
    const flag = await FeatureFlag.findOne({ key: req.params.key });
    if (!flag) return res.status(404).json({ detail: 'Flag not found' });
    if (flag.is_system) return res.status(403).json({ detail: 'System flags cannot be deleted' });
    await flag.deleteOne();
    invalidateCache();
    await recordAuditLog({ req, action: 'feature_flag.delete', resource: 'FeatureFlag', resource_id: flag.key });
    res.json({ message: 'Flag deleted' });
  } catch (err) {
    res.status(500).json({ detail: 'Delete nahi hua' });
  }
};

export default { publicGetFlags, adminListFlags, createFlag, updateFlag, deleteFlag };
