import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * Persist an audit log entry. Never throws - audit logging must not break
 * the main request flow.
 */
export const recordAuditLog = async ({
  req,
  action,
  resource,
  resource_id,
  old_value = null,
  new_value = null,
  status_code = 200,
}) => {
  try {
    await AuditLog.create({
      user_id: req.user?.id,
      user_email: req.user?.email,
      user_role: req.user?.admin_role || req.user?.role,
      action,
      resource,
      resource_id: resource_id ? String(resource_id) : undefined,
      method: req.method,
      path: req.originalUrl,
      old_value,
      new_value,
      status_code,
      ip_address: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
      user_agent: req.headers['user-agent'],
    });
  } catch (error) {
    // Audit logging failures should never break the admin action itself
    logger.error('Failed to write audit log:', error);
  }
};

export const listAuditLogs = async ({ page = 1, limit = 25, action, resource, user_id, from, to }) => {
  const query = {};
  if (action) query.action = action;
  if (resource) query.resource = resource;
  if (user_id) query.user_id = user_id;
  if (from || to) {
    query.created_at = {};
    if (from) query.created_at.$gte = new Date(from);
    if (to) query.created_at.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    AuditLog.find(query).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).lean(),
    AuditLog.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)) || 1,
  };
};

export default { recordAuditLog, listAuditLogs };
