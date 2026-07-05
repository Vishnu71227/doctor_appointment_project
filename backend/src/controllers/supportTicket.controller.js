import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';
import { recordAuditLog } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

// ══════════════════════════════════════════════════════
// USER-FACING ENDPOINTS
// ══════════════════════════════════════════════════════

/** POST /support/tickets — user creates a ticket */
export const userCreateTicket = async (req, res) => {
  try {
    const { subject, description, category, priority, related_appointment_id, related_payment_id } = req.body;
    if (!subject || !description) {
      return res.status(400).json({ detail: 'subject and description required' });
    }
    const user = await User.findOne({ id: req.user.id }).lean();
    const ticket = await SupportTicket.create({
      subject,
      description,
      category: category || 'other',
      priority: priority || 'medium',
      user_id: req.user.id,
      user_email: req.user.email,
      user_name: user?.full_name || req.user.email,
      related_appointment_id: related_appointment_id || null,
      related_payment_id: related_payment_id || null,
    });
    res.status(201).json({ ticket });
  } catch (err) {
    logger.error('userCreateTicket:', err);
    res.status(500).json({ detail: 'Ticket create nahi hua' });
  }
};

/** GET /support/tickets — user's own tickets */
export const userListTickets = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { user_id: req.user.id };
    if (status) query.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).lean(),
      SupportTicket.countDocuments(query),
    ]);
    res.json({ tickets, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (err) {
    res.status(500).json({ detail: 'Tickets load nahi ho sake' });
  }
};

/** GET /support/tickets/:ticket_id — user views own ticket */
export const userGetTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticket_id: req.params.ticket_id, user_id: req.user.id }).lean();
    if (!ticket) return res.status(404).json({ detail: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ detail: 'Ticket load nahi hua' });
  }
};

/** POST /support/tickets/:ticket_id/reply — user replies */
export const userReplyTicket = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ detail: 'message required' });
    const ticket = await SupportTicket.findOne({ ticket_id: req.params.ticket_id, user_id: req.user.id });
    if (!ticket) return res.status(404).json({ detail: 'Ticket not found' });
    if (['resolved', 'closed'].includes(ticket.status)) {
      return res.status(400).json({ detail: 'Cannot reply to a resolved/closed ticket. Please open a new ticket.' });
    }
    ticket.replies.push({
      sender_id: req.user.id,
      sender_email: req.user.email,
      sender_name: req.user.full_name || req.user.email,
      sender_role: 'user',
      message,
    });
    // If admin was waiting for user reply, move back to in_progress
    if (ticket.status === 'waiting_user') ticket.status = 'in_progress';
    await ticket.save();
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ detail: 'Reply nahi ho saka' });
  }
};

// ══════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════

/** GET /admin/support/tickets — list all tickets with filters */
export const adminListTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, category, assigned_to, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (assigned_to === 'me') query.assigned_to = req.user.id;
    else if (assigned_to === 'unassigned') query.assigned_to = null;
    if (search) {
      query.$or = [
        { ticket_id: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { user_email: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query).sort({ priority: -1, created_at: -1 }).skip(skip).limit(Number(limit)).lean(),
      SupportTicket.countDocuments(query),
    ]);
    res.json({ tickets, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (err) {
    res.status(500).json({ detail: 'Tickets load nahi ho sake' });
  }
};

/** GET /admin/support/tickets/:ticket_id */
export const adminGetTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticket_id: req.params.ticket_id }).lean();
    if (!ticket) return res.status(404).json({ detail: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ detail: 'Ticket load nahi hua' });
  }
};

/** PATCH /admin/support/tickets/:ticket_id — update status, priority, assign */
export const adminUpdateTicket = async (req, res) => {
  try {
    const { status, priority, assigned_to, assigned_email } = req.body;
    const ticket = await SupportTicket.findOne({ ticket_id: req.params.ticket_id });
    if (!ticket) return res.status(404).json({ detail: 'Ticket not found' });

    const old_value = { status: ticket.status, priority: ticket.priority, assigned_to: ticket.assigned_to };

    if (status) {
      ticket.status = status;
      if (status === 'resolved') ticket.resolved_at = new Date();
      if (status === 'closed') ticket.closed_at = new Date();
    }
    if (priority) ticket.priority = priority;
    if (assigned_to !== undefined) {
      ticket.assigned_to = assigned_to;
      ticket.assigned_email = assigned_email || null;
    }

    await ticket.save();
    await recordAuditLog({ req, action: 'support_ticket.update', resource: 'SupportTicket', resource_id: ticket.ticket_id, old_value, new_value: { status, priority, assigned_to } });
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ detail: 'Ticket update nahi hua' });
  }
};

/** POST /admin/support/tickets/:ticket_id/reply — admin replies */
export const adminReplyTicket = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ detail: 'message required' });

    const ticket = await SupportTicket.findOne({ ticket_id: req.params.ticket_id });
    if (!ticket) return res.status(404).json({ detail: 'Ticket not found' });

    // Track first response time for SLA
    if (!ticket.first_response_at) ticket.first_response_at = new Date();

    ticket.replies.push({
      sender_id: req.user.id,
      sender_email: req.user.email,
      sender_name: req.user.full_name || req.user.email,
      sender_role: 'admin',
      message,
    });
    // Move to waiting_user after admin replies
    if (ticket.status === 'open' || ticket.status === 'in_progress') {
      ticket.status = 'waiting_user';
    }
    await ticket.save();
    await recordAuditLog({ req, action: 'support_ticket.reply', resource: 'SupportTicket', resource_id: ticket.ticket_id });
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ detail: 'Reply nahi hua' });
  }
};

/** POST /admin/support/tickets/:ticket_id/escalate */
export const adminEscalateTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticket_id: req.params.ticket_id });
    if (!ticket) return res.status(404).json({ detail: 'Ticket not found' });

    const old_priority = ticket.priority;
    const escalation_map = { low: 'medium', medium: 'high', high: 'urgent', urgent: 'urgent' };
    ticket.priority = escalation_map[ticket.priority];
    if (ticket.status === 'waiting_user') ticket.status = 'in_progress';

    ticket.replies.push({
      sender_id: req.user.id,
      sender_email: req.user.email,
      sender_name: req.user.full_name || req.user.email,
      sender_role: 'admin',
      message: `Ticket escalated from ${old_priority} to ${ticket.priority} priority by ${req.user.email}.`,
    });
    await ticket.save();
    await recordAuditLog({ req, action: 'support_ticket.escalate', resource: 'SupportTicket', resource_id: ticket.ticket_id, old_value: { priority: old_priority }, new_value: { priority: ticket.priority } });
    res.json({ ticket });
  } catch (err) {
    res.status(500).json({ detail: 'Escalation nahi hua' });
  }
};

/** GET /admin/support/stats */
export const adminTicketStats = async (req, res) => {
  try {
    const [statusCounts, priorityCounts, avgResolutionAgg] = await Promise.all([
      SupportTicket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      SupportTicket.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      SupportTicket.aggregate([
        { $match: { resolved_at: { $ne: null } } },
        { $project: { hours: { $divide: [{ $subtract: ['$resolved_at', '$created_at'] }, 3600000] } } },
        { $group: { _id: null, avg_hours: { $avg: '$hours' } } },
      ]),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
    const byPriority = Object.fromEntries(priorityCounts.map((p) => [p._id, p.count]));

    res.json({
      by_status: byStatus,
      by_priority: byPriority,
      avg_resolution_hours: avgResolutionAgg[0]?.avg_hours?.toFixed(1) || null,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    res.status(500).json({ detail: 'Stats load nahi hua' });
  }
};

export default {
  userCreateTicket, userListTickets, userGetTicket, userReplyTicket,
  adminListTickets, adminGetTicket, adminUpdateTicket, adminReplyTicket,
  adminEscalateTicket, adminTicketStats,
};
