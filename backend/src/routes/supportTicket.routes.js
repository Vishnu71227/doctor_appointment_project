import express from 'express';
import {
  userCreateTicket, userListTickets, userGetTicket, userReplyTicket,
  adminListTickets, adminGetTicket, adminUpdateTicket, adminReplyTicket,
  adminEscalateTicket, adminTicketStats,
} from '../controllers/supportTicket.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();
router.use(authMiddleware);

// ── User routes (any authenticated user) ─────────────────────────────────────
router.post('/tickets', userCreateTicket);
router.get('/tickets', userListTickets);
router.get('/tickets/:ticket_id', userGetTicket);
router.post('/tickets/:ticket_id/reply', userReplyTicket);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/admin/stats', requireRole('admin'), requirePermission('support.view'), adminTicketStats);
router.get('/admin/tickets', requireRole('admin'), requirePermission('support.view'), adminListTickets);
router.get('/admin/tickets/:ticket_id', requireRole('admin'), requirePermission('support.view'), adminGetTicket);
router.patch('/admin/tickets/:ticket_id', requireRole('admin'), requirePermission('support.manage'), adminUpdateTicket);
router.post('/admin/tickets/:ticket_id/reply', requireRole('admin'), requirePermission('support.manage'), adminReplyTicket);
router.post('/admin/tickets/:ticket_id/escalate', requireRole('admin'), requirePermission('support.manage'), adminEscalateTicket);

export default router;
