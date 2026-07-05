import mongoose from 'mongoose';
import { generateId } from '../utils/helpers.js';

const replySchema = new mongoose.Schema(
  {
    sender_id: { type: String, required: true },
    sender_email: { type: String },
    sender_name: { type: String },
    sender_role: { type: String, enum: ['user', 'admin'], default: 'user' },
    message: { type: String, required: true, trim: true },
    attachments: { type: [String], default: [] },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticket_id: {
      type: String,
      unique: true,
      default: () => `TKT-${generateId().replace(/-/g, '').substring(0, 8).toUpperCase()}`,
      index: true,
    },
    subject: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['appointment', 'payment', 'technical', 'doctor', 'prescription', 'refund', 'other'],
      default: 'other',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },

    // ── Relations ─────────────────────────────────────────────────
    user_id: { type: String, required: true, index: true },
    user_email: { type: String },
    user_name: { type: String },

    assigned_to: { type: String, default: null },      // admin user_id
    assigned_email: { type: String, default: null },

    // ── Content ───────────────────────────────────────────────────
    description: { type: String, required: true, trim: true },
    replies: { type: [replySchema], default: [] },

    // ── Metadata ──────────────────────────────────────────────────
    resolved_at: { type: Date, default: null },
    closed_at: { type: Date, default: null },
    first_response_at: { type: Date, default: null }, // SLA tracking
    related_appointment_id: { type: String, default: null },
    related_payment_id: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'support_tickets',
  }
);

supportTicketSchema.index({ status: 1, priority: 1, created_at: -1 });
supportTicketSchema.index({ user_id: 1, status: 1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
export default SupportTicket;
