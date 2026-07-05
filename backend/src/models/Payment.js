/**
 * Payment Model
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated payment audit table. Every payment attempt (success, failure, or
 * pending) is recorded here. Appointment model holds a reference but the full
 * financial audit trail lives here.
 *
 * WHY A SEPARATE MODEL:
 *  - Appointment model should not grow unboundedly with payment retry data
 *  - Payment records must be immutable audit logs (never hard-deleted)
 *  - Refund lifecycle needs its own state machine independent of appointments
 */

import mongoose from 'mongoose';
import { generateId } from '../utils/helpers.js';

const paymentSchema = new mongoose.Schema(
  {
    // ── Core identifiers ───────────────────────────────────────────────────
    payment_id: {
      type: String,
      required: true,
      unique: true,
      default: () => `pay_hl_${generateId().replace(/-/g, '').substring(0, 16)}`,
      index: true,
    },

    // ── Razorpay identifiers ───────────────────────────────────────────────
    razorpay_order_id: {
      type: String,
      required: true,
      unique: true, // Prevents duplicate order creation for same payment slot
      index: true,
    },
    razorpay_payment_id: {
      type: String,
      sparse: true, // Only set after payment captured
      index: true,
    },
    razorpay_signature: {
      type: String,
      select: false, // Never return in API responses (security)
    },

    // ── Relations ──────────────────────────────────────────────────────────
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    appointment_id: {
      type: String,
      required: true,
      index: true,
    },

    // ── Amount ────────────────────────────────────────────────────────────
    amount: {
      type: Number,
      required: true,
      min: 1, // Amount in INR (not paise)
    },
    amount_paise: {
      type: Number, // Razorpay always uses paise — stored for audit
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR'],
    },

    // ── Status ────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded'],
      default: 'created',
      index: true,
    },

    // ── Payment method details ────────────────────────────────────────────
    payment_method: {
      type: String,
      enum: ['card', 'upi', 'netbanking', 'wallet', 'emi', 'unknown', null],
      default: null,
    },
    payment_method_details: {
      // Stores card last4, bank name, UPI VPA etc. (non-sensitive subset)
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ── Transaction timestamps ─────────────────────────────────────────────
    transaction_date: {
      type: Date,
      default: null,
    },
    authorized_at: Date,
    captured_at: Date,
    failed_at: Date,

    // ── Refund lifecycle ───────────────────────────────────────────────────
    refund_status: {
      type: String,
      enum: ['none', 'partial', 'full', 'failed'],
      default: 'none',
    },
    refunds: [
      {
        refund_id: String,          // Razorpay refund ID
        razorpay_refund_id: String,
        amount: Number,             // Refund amount in INR
        amount_paise: Number,
        status: {
          type: String,
          enum: ['pending', 'processed', 'failed'],
          default: 'pending',
        },
        reason: String,
        initiated_by: String,       // admin user_id
        initiated_at: { type: Date, default: Date.now },
        processed_at: Date,
      },
    ],
    total_refunded_amount: {
      type: Number,
      default: 0,
    },

    // ── Webhook tracking ──────────────────────────────────────────────────
    webhook_events: [
      {
        event: String,     // e.g., 'payment.captured'
        received_at: { type: Date, default: Date.now },
        payload_summary: mongoose.Schema.Types.Mixed,
      },
    ],

    // ── Invoice ───────────────────────────────────────────────────────────
    invoice_number: {
      type: String,
      sparse: true,
    },
    invoice_generated_at: Date,

    // ── Failure details ───────────────────────────────────────────────────
    failure_reason: String,
    failure_code: String,

    // ── Audit fields ──────────────────────────────────────────────────────
    ip_address: String,
    user_agent: String,
    notes: mongoose.Schema.Types.Mixed, // For Razorpay order notes passthrough

    // ── Test mode flag ────────────────────────────────────────────────────
    test_mode: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'payments',
  }
);

// ── Compound indexes ────────────────────────────────────────────────────────
paymentSchema.index({ user_id: 1, created_at: -1 });        // User payment history
paymentSchema.index({ appointment_id: 1, status: 1 });       // Appointment payment lookup
paymentSchema.index({ status: 1, created_at: -1 });          // Admin dashboard queries
paymentSchema.index({ created_at: -1 });                     // Revenue analytics sort
paymentSchema.index({ transaction_date: -1 });               // Date-range revenue queries
paymentSchema.index({ refund_status: 1 });                   // Refund management

// ── Invoice number generator ────────────────────────────────────────────────
paymentSchema.methods.generateInvoiceNumber = function () {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const seq = this.payment_id.slice(-6).toUpperCase();
  return `HL-INV-${y}${m}-${seq}`;
};

// ── Virtual: net amount after refunds ───────────────────────────────────────
paymentSchema.virtual('net_amount').get(function () {
  return this.amount - (this.total_refunded_amount || 0);
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
