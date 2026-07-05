import mongoose from 'mongoose';
import { generateId } from '../utils/helpers.js';

const adminNotificationSchema = new mongoose.Schema(
  {
    notification_id: {
      type: String,
      unique: true,
      default: () => `NOTIF-${generateId().replace(/-/g, '').substring(0, 8).toUpperCase()}`,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // ── Channels ──────────────────────────────────────────────────
    channels: {
      type: [String],
      enum: ['email', 'sms', 'whatsapp', 'in_app'],
      default: ['in_app'],
    },

    // ── Targeting ─────────────────────────────────────────────────
    target_type: {
      type: String,
      enum: ['broadcast', 'targeted', 'role_based'],
      default: 'broadcast',
    },
    target_role: {
      type: String,
      enum: ['all', 'patient', 'doctor'],
      default: 'all',
    },
    target_user_ids: { type: [String], default: [] }, // for targeted

    // ── Status & delivery ─────────────────────────────────────────
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
      default: 'draft',
      index: true,
    },
    scheduled_at: { type: Date, default: null },
    sent_at: { type: Date, default: null },

    // ── Delivery counters ─────────────────────────────────────────
    total_recipients: { type: Number, default: 0 },
    sent_count: { type: Number, default: 0 },
    failed_count: { type: Number, default: 0 },

    created_by: { type: String },
    error_log: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'admin_notifications',
  }
);

adminNotificationSchema.index({ status: 1, created_at: -1 });

const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);
export default AdminNotification;
