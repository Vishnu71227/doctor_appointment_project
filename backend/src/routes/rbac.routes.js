import express from 'express';
import rbacController from '../controllers/rbac.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

// ── Permissions catalogue ──────────────────────────
router.get('/permissions', requirePermission('roles.view'), rbacController.listPermissions);

// ── Roles ───────────────────────────────────────────
router.get('/roles', requirePermission('roles.view'), rbacController.listRoles);
router.post('/roles', requirePermission('roles.manage'), rbacController.createRole);
router.patch('/roles/:role_key', requirePermission('roles.manage'), rbacController.updateRole);
router.delete('/roles/:role_key', requirePermission('roles.manage'), rbacController.deleteRole);

// ── Admin users (assign roles) ─────────────────────
router.get('/admin-users', requirePermission('roles.view'), rbacController.listAdminUsers);
router.post('/admin-users', requirePermission('roles.manage'), rbacController.createAdminUser);
router.patch('/admin-users/:user_id/role', requirePermission('roles.manage'), rbacController.updateAdminUserRole);

// ── Audit logs ──────────────────────────────────────
router.get('/audit-logs', requirePermission('audit.view'), rbacController.getAuditLogs);

export default router;
