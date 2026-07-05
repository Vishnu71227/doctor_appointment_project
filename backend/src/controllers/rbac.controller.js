import { v4 as uuidv4 } from 'uuid';
import AdminRole, { ALL_PERMISSIONS } from '../models/AdminRole.js';
import User from '../models/User.js';
import { recordAuditLog, listAuditLogs } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

const SYSTEM_ROLES = [
  { key: 'super_admin', name: 'Super Admin', description: 'Full unrestricted access to every module.', is_system: true, permissions: ALL_PERMISSIONS },
  { key: 'admin', name: 'Admin', description: 'General administrator with broad access.', is_system: true, permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith('roles.') && !p.startsWith('settings.manage')) },
  { key: 'support_executive', name: 'Support Executive', description: 'Handles support tickets and patient/doctor queries.', is_system: true, permissions: ['dashboard.view', 'support.view', 'support.manage', 'patients.view', 'doctors.view', 'appointments.view', 'notifications.view'] },
  { key: 'finance_manager', name: 'Finance Manager', description: 'Manages payments, refunds and financial reports.', is_system: true, permissions: ['dashboard.view', 'payments.view', 'payments.manage', 'payments.refund', 'reports.view', 'reports.export', 'coupons.view', 'coupons.manage'] },
  { key: 'moderator', name: 'Moderator', description: 'Moderates reviews and CMS content.', is_system: true, permissions: ['dashboard.view', 'reviews.view', 'reviews.manage', 'cms.view', 'cms.manage'] },
  { key: 'doctor_manager', name: 'Doctor Manager', description: 'Manages doctor onboarding and verification.', is_system: true, permissions: ['dashboard.view', 'doctors.view', 'doctors.manage', 'appointments.view'] },
  { key: 'content_manager', name: 'Content Manager', description: 'Manages CMS pages, banners and notifications.', is_system: true, permissions: ['dashboard.view', 'cms.view', 'cms.manage', 'notifications.view', 'notifications.manage'] },
];

/**
 * Idempotently ensures the 7 system roles required by the spec exist.
 * Called lazily on first access so no manual migration step is required.
 */
const ensureSystemRoles = async () => {
  for (const role of SYSTEM_ROLES) {
    await AdminRole.findOneAndUpdate(
      { key: role.key },
      { $setOnInsert: role },
      { upsert: true, new: true }
    );
  }
};

export const listPermissions = async (req, res) => {
  res.json({ permissions: ALL_PERMISSIONS });
};

export const listRoles = async (req, res) => {
  await ensureSystemRoles();
  const roles = await AdminRole.find().sort({ is_system: -1, name: 1 }).lean();
  res.json({ roles });
};

export const createRole = async (req, res) => {
  const { key, name, description, permissions } = req.body;
  if (!key || !name) {
    return res.status(400).json({ detail: 'key and name are required' });
  }
  const invalid = (permissions || []).filter((p) => !ALL_PERMISSIONS.includes(p));
  if (invalid.length) {
    return res.status(400).json({ detail: `Invalid permissions: ${invalid.join(', ')}` });
  }
  const exists = await AdminRole.findOne({ key: key.toLowerCase() });
  if (exists) {
    return res.status(409).json({ detail: 'Role with this key already exists' });
  }
  const role = await AdminRole.create({
    key: key.toLowerCase(),
    name,
    description,
    permissions: permissions || [],
    is_system: false,
  });

  await recordAuditLog({ req, action: 'role.create', resource: 'AdminRole', resource_id: role.key, new_value: role.toObject() });
  res.status(201).json({ role });
};

export const updateRole = async (req, res) => {
  const { role_key } = req.params;
  const { name, description, permissions, is_active } = req.body;

  const role = await AdminRole.findOne({ key: role_key.toLowerCase() });
  if (!role) {
    return res.status(404).json({ detail: 'Role not found' });
  }
  if (role.is_system && role.key === 'super_admin') {
    return res.status(403).json({ detail: 'super_admin permissions cannot be modified' });
  }
  if (permissions) {
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) {
      return res.status(400).json({ detail: `Invalid permissions: ${invalid.join(', ')}` });
    }
  }

  const old_value = role.toObject();
  if (name) role.name = name;
  if (description !== undefined) role.description = description;
  if (permissions) role.permissions = permissions;
  if (is_active !== undefined) role.is_active = is_active;
  await role.save();

  await recordAuditLog({ req, action: 'role.update', resource: 'AdminRole', resource_id: role.key, old_value, new_value: role.toObject() });
  res.json({ role });
};

export const deleteRole = async (req, res) => {
  const { role_key } = req.params;
  const role = await AdminRole.findOne({ key: role_key.toLowerCase() });
  if (!role) {
    return res.status(404).json({ detail: 'Role not found' });
  }
  if (role.is_system) {
    return res.status(403).json({ detail: 'System roles cannot be deleted' });
  }
  const inUse = await User.countDocuments({ admin_role: role.key });
  if (inUse > 0) {
    return res.status(409).json({ detail: `Role is assigned to ${inUse} user(s). Reassign them before deleting.` });
  }
  await role.deleteOne();
  await recordAuditLog({ req, action: 'role.delete', resource: 'AdminRole', resource_id: role.key, old_value: role.toObject() });
  res.json({ message: 'Role deleted' });
};

export const listAdminUsers = async (req, res) => {
  const admins = await User.find({ role: 'admin' }).select('-password').sort({ created_at: -1 }).lean();
  res.json({ admins });
};

export const createAdminUser = async (req, res) => {
  const { email, full_name, password, admin_role } = req.body;
  if (!email || !full_name || !password) {
    return res.status(400).json({ detail: 'email, full_name and password are required' });
  }
  await ensureSystemRoles();
  if (admin_role) {
    const roleExists = await AdminRole.findOne({ key: admin_role });
    if (!roleExists) {
      return res.status(400).json({ detail: 'admin_role does not exist' });
    }
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ detail: 'A user with this email already exists' });
  }

  const bcrypt = (await import('bcrypt')).default;
  const hashed = await bcrypt.hash(password, 12);

  const newAdmin = await User.create({
    id: uuidv4(),
    email: email.toLowerCase(),
    full_name,
    password: hashed,
    role: 'admin',
    admin_role: admin_role || 'admin',
    otp_verified: true,
    phone_verified: true,
    is_active: true,
  });

  await recordAuditLog({ req, action: 'admin_user.create', resource: 'User', resource_id: newAdmin.id, new_value: { email: newAdmin.email, admin_role: newAdmin.admin_role } });
  res.status(201).json({ admin: { id: newAdmin.id, email: newAdmin.email, full_name: newAdmin.full_name, admin_role: newAdmin.admin_role } });
};

export const updateAdminUserRole = async (req, res) => {
  const { user_id } = req.params;
  const { admin_role } = req.body;
  if (!admin_role) {
    return res.status(400).json({ detail: 'admin_role is required' });
  }
  const roleExists = await AdminRole.findOne({ key: admin_role });
  if (!roleExists) {
    return res.status(400).json({ detail: 'admin_role does not exist' });
  }
  const user = await User.findOne({ id: user_id, role: 'admin' });
  if (!user) {
    return res.status(404).json({ detail: 'Admin user not found' });
  }
  if (user.admin_role === 'super_admin' && req.user.id !== user.id) {
    // prevent accidental demotion of the last super_admin by a non-super_admin actor
    const superAdminCount = await User.countDocuments({ admin_role: 'super_admin' });
    if (superAdminCount <= 1 && req.user.admin_role !== 'super_admin') {
      return res.status(403).json({ detail: 'Only a super_admin can change the last super_admin account' });
    }
  }
  const old_value = { admin_role: user.admin_role };
  user.admin_role = admin_role;
  await user.save();

  await recordAuditLog({ req, action: 'admin_user.update_role', resource: 'User', resource_id: user.id, old_value, new_value: { admin_role } });
  res.json({ message: 'Admin role updated', user: { id: user.id, email: user.email, admin_role: user.admin_role } });
};

export const getAuditLogs = async (req, res) => {
  const { page = 1, limit = 25, action, resource, user_id, from, to } = req.query;
  const result = await listAuditLogs({ page, limit, action, resource, user_id, from, to });
  res.json(result);
};

export default {
  listPermissions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listAdminUsers,
  createAdminUser,
  updateAdminUserRole,
  getAuditLogs,
};
