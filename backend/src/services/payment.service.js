/**
 * Payment Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Central business logic for all payment operations. Controllers call this
 * service; service handles Razorpay API, DB operations, and emails.
 *
 * ARCHITECTURE:
 *  - All DB writes are idempotent (safe to retry on network failures)
 *  - Razorpay calls are wrapped with proper error handling
 *  - Payment state machine: created → captured / failed / cancelled
 *  - Refund state machine: none → partial / full
 */

import crypto from 'crypto';
import Razorpay from 'razorpay';
import Payment from '../models/Payment.js';
import Appointment from '../models/Appointment.js';
import User from '../models/User.js';
import DoctorProfile from '../models/DoctorProfile.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import {
  logOrderCreated,
  logPaymentVerified,
  logPaymentFailed,
  logSignatureInvalid,
  logWebhookReceived,
  logRefundInitiated,
  logDuplicatePaymentAttempt,
} from '../utils/paymentLogger.js';
import emailService from './email.service.js';
import { generateInvoicePDF } from './invoice.service.js';
import { generateId } from '../utils/helpers.js';
import bookingCleanupService from './bookingCleanup.service.js';

// ── Razorpay singleton ────────────────────────────────────────────────────────
let _razorpay = null;

const getRazorpay = () => {
  if (!config.payment.razorpayKeyId || !config.payment.razorpayKeySecret) {
    throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
  }
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: config.payment.razorpayKeyId,
      key_secret: config.payment.razorpayKeySecret,
    });
  }
  return _razorpay;
};

class PaymentService {
  /**
   * Create a Razorpay order and a Payment document (idempotent).
   * If a 'created' order already exists for this appointment, returns it (prevents duplicates).
   *
   * @param {string} appointmentId
   * @param {string} userId
   * @param {number} amount - in INR
   * @param {string} [ip]
   * @param {string} [userAgent]
   * @returns {{ razorpayOrder, payment, keyId }}
   */
  async createOrder(appointmentId, userId, amount, ip, userAgent) {
    // ── Idempotency: check for existing active order ──────────────────────
    const existing = await Payment.findOne({
      appointment_id: appointmentId,
      status: 'created',
    });

    if (existing) {
      logDuplicatePaymentAttempt(appointmentId, existing.razorpay_order_id, userId);
      logger.info(`Returning existing order ${existing.razorpay_order_id} for appointment ${appointmentId}`);
      return {
        razorpayOrderId: existing.razorpay_order_id,
        amount: existing.amount,
        amountPaise: existing.amount_paise,
        currency: existing.currency,
        paymentId: existing.payment_id,
        keyId: config.payment.razorpayKeyId,
      };
    }

    // ── Validate appointment ownership ────────────────────────────────────
    const appointment = await Appointment.findOne({ id: appointmentId });
    if (!appointment) {
      throw new Error('Appointment not found');
    }
    if (appointment.patient_id !== userId) {
      throw new Error('Unauthorized: appointment does not belong to this user');
    }
    if (appointment.payment_status === 'completed') {
      throw new Error('Payment already completed for this appointment');
    }

    const amountInr = amount;
    const amountPaise = Math.round(amountInr * 100); // Razorpay uses paise

    // ── Test mode: return mock order without hitting Razorpay ─────────────
    if (config.payment.testMode) {
      const mockOrderId = `order_test_${generateId().replace(/-/g, '').substring(0, 14)}`;
      const payment = await Payment.create({
        appointment_id: appointmentId,
        user_id: userId,
        razorpay_order_id: mockOrderId,
        amount: amountInr,
        amount_paise: amountPaise,
        currency: 'INR',
        status: 'created',
        test_mode: true,
        ip_address: ip,
        user_agent: userAgent,
        notes: { appointment_id: appointmentId, test_mode: true },
      });

      await Appointment.findOneAndUpdate(
        { id: appointmentId },
        { $set: { razorpay_order_id: mockOrderId, amount: amountInr, payment_status: 'pending' } }
      );

      logOrderCreated(appointmentId, mockOrderId, amountInr, userId);
      return {
        razorpayOrderId: mockOrderId,
        amount: amountInr,
        amountPaise,
        currency: 'INR',
        paymentId: payment.payment_id,
        keyId: config.payment.razorpayKeyId || 'rzp_test_placeholder',
        testMode: true,
      };
    }

    // ── Live mode: create real Razorpay order ─────────────────────────────
    const razorpay = getRazorpay();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${appointmentId.substring(0, 20)}`,
      notes: {
        appointment_id: appointmentId,
        user_id: userId,
        platform: 'HealthLine',
      },
    });

    // ── Persist Payment document ──────────────────────────────────────────
    const payment = await Payment.create({
      appointment_id: appointmentId,
      user_id: userId,
      razorpay_order_id: razorpayOrder.id,
      amount: amountInr,
      amount_paise: amountPaise,
      currency: 'INR',
      status: 'created',
      test_mode: false,
      ip_address: ip,
      user_agent: userAgent,
      notes: { appointment_id: appointmentId },
    });

    // ── Update appointment with order reference ───────────────────────────
    await Appointment.findOneAndUpdate(
      { id: appointmentId },
      { $set: { razorpay_order_id: razorpayOrder.id, amount: amountInr, payment_status: 'pending' } }
    );

    logOrderCreated(appointmentId, razorpayOrder.id, amountInr, userId);

    return {
      razorpayOrderId: razorpayOrder.id,
      amount: amountInr,
      amountPaise,
      currency: 'INR',
      paymentId: payment.payment_id,
      keyId: config.payment.razorpayKeyId,
      testMode: false,
    };
  }

  /**
   * Verify Razorpay payment signature and confirm the payment.
   * This is the ONLY function that should mark a payment as captured.
   * Backend must NEVER trust frontend-only success responses.
   *
   * @param {Object} params
   * @returns {{ success: boolean, payment, appointment }}
   */
  async verifyAndCapturePayment({
    appointmentId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    userId,
    ip,
  }) {
    // ── Find Payment record ───────────────────────────────────────────────
    const payment = await Payment.findOne({ razorpay_order_id: razorpayOrderId });
    if (!payment) {
      throw new Error('Payment record not found for this order');
    }

    // ── Ownership check ───────────────────────────────────────────────────
    if (payment.user_id !== userId) {
      throw new Error('Unauthorized: payment does not belong to this user');
    }

    // ── Idempotency: already captured ─────────────────────────────────────
    if (payment.status === 'captured') {
      logger.info(`Payment ${razorpayPaymentId} already captured — idempotent response`);
      const appointment = await Appointment.findOne({ id: appointmentId });
      return { success: true, payment, appointment };
    }

    // ── Test mode: skip signature verification ────────────────────────────
    if (config.payment.testMode || payment.test_mode) {
      const testPaymentId = razorpayPaymentId || `pay_test_${generateId().replace(/-/g, '').substring(0, 14)}`;
      const invoiceNum = payment.generateInvoiceNumber();

      await Payment.findOneAndUpdate(
        { razorpay_order_id: razorpayOrderId },
        {
          $set: {
            razorpay_payment_id: testPaymentId,
            status: 'captured',
            transaction_date: new Date(),
            captured_at: new Date(),
            invoice_number: invoiceNum,
            invoice_generated_at: new Date(),
            payment_method: 'unknown',
          },
        }
      );

      const appointment = await Appointment.findOneAndUpdate(
        { id: appointmentId },
        {
          $set: {
            payment_status: 'completed',
            razorpay_payment_id: testPaymentId,
            status: 'confirmed',
          },
        },
        { new: true }
      );

      logPaymentVerified(testPaymentId, razorpayOrderId, appointmentId, payment.amount);

      // 🔒 PRODUCTION FIX: payment succeeded — cancel the unpaid auto-cancel job
      await bookingCleanupService.cancelScheduledCleanup(appointmentId);
      logger.info(`Test payment captured: ${testPaymentId}`);

      return { success: true, payment, appointment, testMode: true };
    }

    // ── PRODUCTION: Verify Razorpay HMAC-SHA256 signature ─────────────────
    // This is the critical security step — prevents payment tampering
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new Error('razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required');
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.payment.razorpayKeySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    // timing-safe comparison prevents timing attacks
    let isValid;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(razorpaySignature, 'hex')
      );
    } catch {
      // Buffer.from will throw if signature is not valid hex
      isValid = false;
    }

    if (!isValid) {
      logSignatureInvalid(razorpayOrderId, appointmentId, ip);
      // Mark payment as failed in DB (tamper attempt recorded)
      await Payment.findOneAndUpdate(
        { razorpay_order_id: razorpayOrderId },
        { $set: { status: 'failed', failure_reason: 'signature_verification_failed', failed_at: new Date() } }
      );
      throw new Error('Payment verification failed: invalid signature');
    }

    // ── Generate invoice number ───────────────────────────────────────────
    const invoiceNum = payment.generateInvoiceNumber();

    // ── Mark Payment as captured ──────────────────────────────────────────
    const updatedPayment = await Payment.findOneAndUpdate(
      { razorpay_order_id: razorpayOrderId },
      {
        $set: {
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: razorpaySignature, // stored but never returned (select: false)
          status: 'captured',
          transaction_date: new Date(),
          captured_at: new Date(),
          invoice_number: invoiceNum,
          invoice_generated_at: new Date(),
        },
      },
      { new: true }
    );

    // ── Confirm Appointment ───────────────────────────────────────────────
    const appointment = await Appointment.findOneAndUpdate(
      { id: appointmentId },
      {
        $set: {
          payment_status: 'completed',
          payment_id: payment.payment_id,
          razorpay_payment_id: razorpayPaymentId,
          status: 'confirmed',
        },
      },
      { new: true }
    );

    logPaymentVerified(razorpayPaymentId, razorpayOrderId, appointmentId, payment.amount);

    // 🔒 PRODUCTION FIX: payment succeeded — cancel the unpaid auto-cancel job
    await bookingCleanupService.cancelScheduledCleanup(appointmentId);

    // ── Send confirmation emails (async, non-blocking) ────────────────────
    this._sendPostPaymentEmails(updatedPayment, appointment).catch((err) => {
      logger.error('Post-payment email dispatch error:', err);
    });

    return { success: true, payment: updatedPayment, appointment };
  }

  /**
   * Handle Razorpay webhook events. Called from webhook route.
   * Webhook signature MUST be verified BEFORE calling this method.
   *
   * @param {string} event - e.g., 'payment.captured'
   * @param {Object} payload - Razorpay event payload
   */
  async handleWebhookEvent(event, payload) {
    logWebhookReceived(event, payload?.payload?.payment?.entity?.id || payload?.payload?.order?.entity?.id);

    try {
      switch (event) {
        case 'payment.captured':
          await this._onPaymentCaptured(payload);
          break;
        case 'payment.failed':
          await this._onPaymentFailed(payload);
          break;
        case 'refund.processed':
          await this._onRefundProcessed(payload);
          break;
        case 'order.paid':
          await this._onOrderPaid(payload);
          break;
        default:
          logger.info(`Unhandled webhook event: ${event}`);
      }
    } catch (err) {
      logger.error(`Webhook event handling failed for ${event}:`, err);
      // Don't rethrow — webhook must always return 200 to Razorpay
    }
  }

  /**
   * Initiate a refund (full or partial).
   * Only callable by admin.
   *
   * @param {string} paymentId - our internal payment_id
   * @param {number|null} refundAmount - null = full refund
   * @param {string} reason
   * @param {string} adminUserId
   */
  async initiateRefund(paymentId, refundAmount, reason, adminUserId) {
    const payment = await Payment.findOne({ payment_id: paymentId });
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'captured') throw new Error('Only captured payments can be refunded');
    if (payment.refund_status === 'full') throw new Error('Payment already fully refunded');

    const maxRefundable = payment.amount - (payment.total_refunded_amount || 0);
    const refundInr = refundAmount || maxRefundable; // null = full refund
    const refundPaise = Math.round(refundInr * 100);

    if (refundInr > maxRefundable) {
      throw new Error(`Cannot refund ₹${refundInr}. Maximum refundable is ₹${maxRefundable}`);
    }

    // ── Test mode: mock refund ────────────────────────────────────────────
    if (config.payment.testMode || payment.test_mode) {
      const mockRefundId = `rfnd_test_${generateId().replace(/-/g, '').substring(0, 14)}`;
      await this._applyRefundToPayment(payment, mockRefundId, refundInr, refundPaise, reason, adminUserId);
      logRefundInitiated(paymentId, refundInr, refundAmount ? 'partial' : 'full', adminUserId);
      return { refundId: mockRefundId, amount: refundInr, testMode: true };
    }

    // ── Live: initiate refund via Razorpay ────────────────────────────────
    const razorpay = getRazorpay();
    const razorpayRefund = await razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: refundPaise,
      notes: { reason, initiated_by: adminUserId },
    });

    await this._applyRefundToPayment(payment, razorpayRefund.id, refundInr, refundPaise, reason, adminUserId);
    logRefundInitiated(paymentId, refundInr, refundAmount ? 'partial' : 'full', adminUserId);

    // ── Send refund email ─────────────────────────────────────────────────
    const patient = await User.findOne({ id: payment.user_id });
    const appointment = await Appointment.findOne({ id: payment.appointment_id });
    if (patient) {
      emailService.sendRefundEmail({
        patientEmail: patient.email,
        patientName: patient.full_name,
        refundAmount: refundInr,
        originalAmount: payment.amount,
        currency: payment.currency,
        refundId: razorpayRefund.id,
        transactionId: payment.razorpay_payment_id,
        appointmentId: payment.appointment_id,
        refundType: refundAmount ? 'partial' : 'full',
      }).catch((e) => logger.error('Refund email failed:', e));
    }

    return { refundId: razorpayRefund.id, amount: refundInr };
  }

  /**
   * Get a user's payment history (paginated).
   */
  async getPaymentsByUser(userId, limit = 20, skip = 0) {
    const payments = await Payment.find({ user_id: userId })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Payment.countDocuments({ user_id: userId });
    return { payments, total };
  }

  /**
   * Get a single payment by payment_id (with ownership check).
   */
  async getPaymentByPaymentId(paymentId, userId, isAdmin = false) {
    const query = { payment_id: paymentId };
    if (!isAdmin) query.user_id = userId;

    const payment = await Payment.findOne(query).lean();
    return payment;
  }

  /**
   * Admin: get all payments with optional filters.
   */
  async getAllPayments({ status, search, startDate, endDate, limit = 50, skip = 0 } = {}) {
    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { payment_id: { $regex: search, $options: 'i' } },
        { razorpay_order_id: { $regex: search, $options: 'i' } },
        { razorpay_payment_id: { $regex: search, $options: 'i' } },
        { appointment_id: { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      query.created_at = {};
      if (startDate) query.created_at.$gte = new Date(startDate);
      if (endDate) query.created_at.$lte = new Date(endDate);
    }

    const [payments, total] = await Promise.all([
      Payment.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments(query),
    ]);
    return { payments, total };
  }

  /**
   * Admin: get revenue statistics.
   */
  async getRevenueStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const capturedFilter = { status: 'captured' };

    const [
      totalRevenueResult,
      dailyRevenueResult,
      monthlyRevenueResult,
      lastMonthRevenueResult,
      totalTransactions,
      failedTransactions,
      refundedTransactions,
      totalRefundedResult,
    ] = await Promise.all([
      // Total revenue (all time)
      Payment.aggregate([
        { $match: capturedFilter },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Today's revenue
      Payment.aggregate([
        { $match: { ...capturedFilter, created_at: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // This month's revenue
      Payment.aggregate([
        { $match: { ...capturedFilter, created_at: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      // Last month's revenue
      Payment.aggregate([
        { $match: { ...capturedFilter, created_at: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Payment.countDocuments(capturedFilter),
      Payment.countDocuments({ status: 'failed' }),
      Payment.countDocuments({ refund_status: { $in: ['full', 'partial'] } }),
      Payment.aggregate([
        { $match: {} },
        { $group: { _id: null, total: { $sum: '$total_refunded_amount' } } },
      ]),
    ]);

    // Daily revenue for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailyBreakdown = await Payment.aggregate([
      { $match: { ...capturedFilter, created_at: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$created_at' },
            month: { $month: '$created_at' },
            day: { $dayOfMonth: '$created_at' },
          },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    return {
      total_revenue: totalRevenueResult[0]?.total || 0,
      daily_revenue: dailyRevenueResult[0]?.total || 0,
      monthly_revenue: monthlyRevenueResult[0]?.total || 0,
      last_month_revenue: lastMonthRevenueResult[0]?.total || 0,
      total_transactions: totalTransactions,
      failed_transactions: failedTransactions,
      refunded_transactions: refundedTransactions,
      total_refunded_amount: totalRefundedResult[0]?.total || 0,
      daily_breakdown: dailyBreakdown,
    };
  }

  // ── Private: webhook event handlers ───────────────────────────────────────

  async _onPaymentCaptured(payload) {
    const entity = payload?.payload?.payment?.entity;
    if (!entity) return;

    const { id: razorpayPaymentId, order_id: razorpayOrderId, method, amount } = entity;
    const amountInr = amount / 100;

    const payment = await Payment.findOne({ razorpay_order_id: razorpayOrderId });
    if (!payment || payment.status === 'captured') return; // Idempotent

    const invoiceNum = payment.generateInvoiceNumber();

    await Payment.findOneAndUpdate(
      { razorpay_order_id: razorpayOrderId },
      {
        $set: {
          razorpay_payment_id: razorpayPaymentId,
          status: 'captured',
          transaction_date: new Date(),
          captured_at: new Date(),
          payment_method: method || 'unknown',
          invoice_number: invoiceNum,
          invoice_generated_at: new Date(),
        },
        $push: {
          webhook_events: {
            event: 'payment.captured',
            received_at: new Date(),
            payload_summary: { razorpayPaymentId, amountInr, method },
          },
        },
      }
    );

    await Appointment.findOneAndUpdate(
      { id: payment.appointment_id },
      {
        $set: {
          payment_status: 'completed',
          razorpay_payment_id: razorpayPaymentId,
          status: 'confirmed',
        },
      }
    );

    logger.info(`Webhook: payment.captured — ${razorpayPaymentId}`);

    // 🔒 PRODUCTION FIX: payment confirmed via webhook — cancel the unpaid auto-cancel job
    await bookingCleanupService.cancelScheduledCleanup(payment.appointment_id);
  }

  async _onPaymentFailed(payload) {
    const entity = payload?.payload?.payment?.entity;
    if (!entity) return;

    const { id: razorpayPaymentId, order_id: razorpayOrderId, error_code, error_description } = entity;

    await Payment.findOneAndUpdate(
      { razorpay_order_id: razorpayOrderId },
      {
        $set: {
          razorpay_payment_id: razorpayPaymentId,
          status: 'failed',
          failed_at: new Date(),
          failure_reason: error_description || 'Payment failed',
          failure_code: error_code || 'UNKNOWN',
        },
        $push: {
          webhook_events: {
            event: 'payment.failed',
            received_at: new Date(),
            payload_summary: { razorpayPaymentId, error_code, error_description },
          },
        },
      }
    );

    const payment = await Payment.findOne({ razorpay_order_id: razorpayOrderId });
    if (payment) {
      logPaymentFailed(razorpayOrderId, payment.appointment_id, error_description, error_code);

      // Send failure email
      const patient = await User.findOne({ id: payment.user_id });
      if (patient) {
        emailService.sendPaymentFailureEmail({
          patientEmail: patient.email,
          patientName: patient.full_name,
          amount: payment.amount,
          currency: payment.currency,
          appointmentId: payment.appointment_id,
          failureReason: error_description || 'Payment could not be processed',
        }).catch((e) => logger.error('Failure email error:', e));
      }
    }
  }

  async _onRefundProcessed(payload) {
    const entity = payload?.payload?.refund?.entity;
    if (!entity) return;

    const { id: refundId, payment_id: razorpayPaymentId, amount } = entity;
    const refundInr = amount / 100;

    await Payment.findOneAndUpdate(
      { razorpay_payment_id: razorpayPaymentId, 'refunds.refund_id': refundId },
      {
        $set: { 'refunds.$.status': 'processed', 'refunds.$.processed_at': new Date() },
        $push: {
          webhook_events: {
            event: 'refund.processed',
            received_at: new Date(),
            payload_summary: { refundId, refundInr },
          },
        },
      }
    );

    logger.info(`Webhook: refund.processed — ${refundId}`);
  }

  async _onOrderPaid(payload) {
    const entity = payload?.payload?.order?.entity;
    if (!entity) return;

    // order.paid is essentially the same as payment.captured for our flow
    logger.info(`Webhook: order.paid — ${entity.id}`);
    await Payment.findOneAndUpdate(
      { razorpay_order_id: entity.id },
      {
        $push: {
          webhook_events: {
            event: 'order.paid',
            received_at: new Date(),
            payload_summary: { orderId: entity.id },
          },
        },
      }
    );
  }

  // ── Private: apply refund to payment record ────────────────────────────────

  async _applyRefundToPayment(payment, refundId, refundInr, refundPaise, reason, adminUserId) {
    const newTotal = (payment.total_refunded_amount || 0) + refundInr;
    const isFullRefund = newTotal >= payment.amount;

    await Payment.findOneAndUpdate(
      { payment_id: payment.payment_id },
      {
        $push: {
          refunds: {
            refund_id: refundId,
            razorpay_refund_id: refundId,
            amount: refundInr,
            amount_paise: refundPaise,
            status: 'processed',
            reason,
            initiated_by: adminUserId,
            initiated_at: new Date(),
            processed_at: new Date(),
          },
        },
        $set: {
          total_refunded_amount: newTotal,
          refund_status: isFullRefund ? 'full' : 'partial',
          status: isFullRefund ? 'refunded' : 'captured',
        },
      }
    );

    if (isFullRefund) {
      await Appointment.findOneAndUpdate(
        { id: payment.appointment_id },
        { $set: { payment_status: 'refunded', status: 'cancelled' } }
      );
    }
  }

  // ── Private: send post-payment emails ────────────────────────────────────

  async _sendPostPaymentEmails(payment, appointment) {
    try {
      const [patient, doctorProfile] = await Promise.all([
        User.findOne({ id: payment.user_id }),
        DoctorProfile.findOne({}),
      ]);

      if (!patient) return;

      // Generate invoice PDF
      let invoiceBuffer = null;
      try {
        invoiceBuffer = await generateInvoicePDF({
          payment,
          appointment,
          patient,
          doctor: doctorProfile,
        });
      } catch (pdfErr) {
        logger.error('Invoice PDF generation failed:', pdfErr);
      }

      // Send payment success email with invoice attached
      await emailService.sendPaymentSuccessEmail({
        patientEmail: patient.email,
        patientName: patient.full_name,
        doctorName: doctorProfile?.full_name || 'Doctor',
        amount: payment.amount,
        currency: payment.currency,
        transactionId: payment.razorpay_payment_id,
        orderId: payment.razorpay_order_id,
        appointmentId: appointment.id,
        appointmentDate: appointment.date,
        appointmentTime: appointment.time,
        consultationType: appointment.consultation_type,
        invoiceBuffer,
        invoiceNumber: payment.invoice_number,
      });
    } catch (err) {
      logger.error('Post-payment email error:', err);
    }
  }
}

export default new PaymentService();
