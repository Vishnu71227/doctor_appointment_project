/**
 * Payment Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * OLD ISSUES FIXED:
 *  1. verify() did not send razorpay_signature — fixed, all 3 fields required
 *  2. Backend accepted test_mode from frontend — REMOVED, test mode from config only
 *  3. No Payment model — now all operations use Payment service + model
 *  4. No webhook support — full webhook handler with signature verification
 *  5. No refund system — full and partial refunds supported
 *  6. No invoice download — PDF streamed directly from server
 *  7. No audit logging — all events logged via paymentLogger
 *
 * SECURITY:
 *  - All routes (except webhook) protected by authMiddleware
 *  - Webhook verified via Razorpay-Signature header (raw body HMAC)
 *  - Ownership checks on every payment operation
 *  - No sensitive data in responses (signature stored with select: false)
 */

import crypto from 'crypto';
import paymentService from '../services/payment.service.js';
import Payment from '../models/Payment.js';
import Appointment from '../models/Appointment.js';
import User from '../models/User.js';
import DoctorProfile from '../models/DoctorProfile.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { logSignatureInvalid } from '../utils/paymentLogger.js';
import { generateInvoicePDF } from '../services/invoice.service.js';

class PaymentController {
  // ── POST /payments/create-order ──────────────────────────────────────────
  /**
   * Creates a Razorpay order and a Payment document.
   * Returns order details + Razorpay key_id to the frontend.
   * Frontend uses these to open the Razorpay checkout.
   */
  async createOrder(req, res, next) {
    try {
      const { amount, currency = 'INR', appointment_id } = req.body;
      const userId = req.user.id;

      // ── Input validation ─────────────────────────────────────────────
      if (!amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ detail: 'Valid amount (> 0) required' });
      }
      if (!appointment_id) {
        return res.status(400).json({ detail: 'appointment_id is required' });
      }
      if (currency !== 'INR') {
        return res.status(400).json({ detail: 'Only INR currency is supported' });
      }

      // ── Verify appointment exists and belongs to user ─────────────────
      const appointment = await Appointment.findOne({ id: appointment_id });
      if (!appointment) {
        return res.status(404).json({ detail: 'Appointment not found' });
      }
      if (req.user.role === 'patient' && appointment.patient_id !== userId) {
        return res.status(403).json({ detail: 'Appointment does not belong to you' });
      }
      if (appointment.payment_status === 'completed') {
        return res.status(409).json({ detail: 'Payment already completed for this appointment' });
      }

      const result = await paymentService.createOrder(
        appointment_id,
        userId,
        Number(amount),
        req.ip,
        req.headers['user-agent']
      );

      logger.info(`Order created: ${result.razorpayOrderId} for appointment ${appointment_id}`);

      return res.status(201).json({
        order_id: result.razorpayOrderId,
        amount: result.amount,
        amount_paise: result.amountPaise,
        currency: result.currency,
        key_id: result.keyId, // Frontend needs this to open Razorpay checkout
        payment_id: result.paymentId,
        test_mode: result.testMode || false,
      });
    } catch (error) {
      logger.error('createOrder error:', error);
      if (error.message.includes('Unauthorized')) return res.status(403).json({ detail: error.message });
      if (error.message.includes('not found')) return res.status(404).json({ detail: error.message });
      if (error.message.includes('already completed')) return res.status(409).json({ detail: error.message });
      next(error);
    }
  }

  // ── POST /payments/verify ────────────────────────────────────────────────
  /**
   * Verifies the Razorpay payment signature sent by the frontend after checkout.
   * THIS IS THE CRITICAL SECURITY STEP.
   *
   * All three Razorpay fields are required:
   *   - razorpay_order_id
   *   - razorpay_payment_id
   *   - razorpay_signature  ← was missing in old code!
   *
   * Never trust the frontend — signature must be verified on backend.
   */
  async verifyPayment(req, res, next) {
    try {
      const {
        appointment_id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = req.body;

      const userId = req.user.id;

      // ── Input validation ─────────────────────────────────────────────
      if (!appointment_id) {
        return res.status(400).json({ detail: 'appointment_id is required' });
      }

      // In test mode, these fields can be omitted (handled in service)
      if (!config.payment.testMode) {
        if (!razorpay_order_id) {
          return res.status(400).json({ detail: 'razorpay_order_id is required' });
        }
        if (!razorpay_payment_id) {
          return res.status(400).json({ detail: 'razorpay_payment_id is required' });
        }
        if (!razorpay_signature) {
          return res.status(400).json({ detail: 'razorpay_signature is required' });
        }
      }

      const result = await paymentService.verifyAndCapturePayment({
        appointmentId: appointment_id,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        userId,
        ip: req.ip,
      });

      return res.json({
        success: true,
        message: 'Payment verified and appointment confirmed',
        appointment_status: result.appointment?.status,
        payment_status: result.payment?.status,
        invoice_number: result.payment?.invoice_number,
        test_mode: result.testMode || false,
      });
    } catch (error) {
      logger.error('verifyPayment error:', error);
      if (error.message.includes('invalid signature')) {
        return res.status(400).json({ detail: 'Payment verification failed: invalid signature' });
      }
      if (error.message.includes('Unauthorized')) return res.status(403).json({ detail: error.message });
      if (error.message.includes('not found')) return res.status(404).json({ detail: error.message });
      next(error);
    }
  }

  // ── POST /payments/webhook ───────────────────────────────────────────────
  /**
   * Razorpay webhook endpoint.
   * MUST be mounted with raw body parser (not json parser) for signature verification.
   * MUST NOT have authMiddleware — Razorpay calls this, not users.
   *
   * Registers to handle: payment.captured, payment.failed, refund.processed, order.paid
   */
  async handleWebhook(req, res) {
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = config.payment.razorpayWebhookSecret;

    // ── Skip verification in test mode if no secret configured ──────────
    if (!config.payment.testMode && webhookSecret) {
      if (!signature) {
        logger.warn('Webhook received without signature header');
        return res.status(400).json({ detail: 'Missing webhook signature' });
      }

      // Verify webhook signature using raw body
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.rawBody) // rawBody set by express middleware in app.js
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex')
      );

      if (!isValid) {
        logSignatureInvalid('WEBHOOK', 'UNKNOWN', req.ip);
        return res.status(400).json({ detail: 'Invalid webhook signature' });
      }
    }

    // ── Parse event ──────────────────────────────────────────────────────
    let payload;
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ detail: 'Invalid webhook payload' });
    }

    const event = payload?.event;
    if (!event) {
      return res.status(400).json({ detail: 'Missing event in webhook payload' });
    }

    // ── Always respond 200 immediately (Razorpay requires fast ACK) ──────
    res.status(200).json({ received: true, event });

    // ── Process event asynchronously ─────────────────────────────────────
    paymentService.handleWebhookEvent(event, payload).catch((err) => {
      logger.error(`Webhook processing error for ${event}:`, err);
    });
  }

  // ── POST /payments/refund ─────────────────────────────────────────────────
  /**
   * Admin-only: initiate full or partial refund.
   */
  async initiateRefund(req, res, next) {
    try {
      const { payment_id } = req.params;
      const { amount, reason = 'Admin initiated refund' } = req.body;

      if (!payment_id) {
        return res.status(400).json({ detail: 'payment_id is required' });
      }
      if (amount !== undefined && (isNaN(amount) || Number(amount) <= 0)) {
        return res.status(400).json({ detail: 'Refund amount must be a positive number' });
      }

      const result = await paymentService.initiateRefund(
        payment_id,
        amount ? Number(amount) : null,
        reason,
        req.user.id
      );

      logger.info(`Admin ${req.user.id} initiated refund: ${result.refundId} for payment ${payment_id}`);

      return res.json({
        success: true,
        message: 'Refund initiated successfully',
        refund_id: result.refundId,
        refund_amount: result.amount,
        test_mode: result.testMode || false,
      });
    } catch (error) {
      logger.error('initiateRefund error:', error);
      if (error.message.includes('not found')) return res.status(404).json({ detail: error.message });
      if (error.message.includes('Only captured')) return res.status(400).json({ detail: error.message });
      if (error.message.includes('already fully refunded')) return res.status(409).json({ detail: error.message });
      if (error.message.includes('Cannot refund')) return res.status(400).json({ detail: error.message });
      next(error);
    }
  }

  // ── GET /payments/history ─────────────────────────────────────────────────
  /**
   * Patient: get own payment history.
   */
  async getPaymentHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const skip = parseInt(req.query.skip) || 0;

      const { payments, total } = await paymentService.getPaymentsByUser(userId, limit, skip);

      return res.json({ payments, total, limit, skip });
    } catch (error) {
      next(error);
    }
  }

  // ── GET /payments/:payment_id ─────────────────────────────────────────────
  /**
   * Patient: get single payment details.
   */
  async getPaymentById(req, res, next) {
    try {
      const { payment_id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      const payment = await paymentService.getPaymentByPaymentId(payment_id, userId, isAdmin);
      if (!payment) {
        return res.status(404).json({ detail: 'Payment not found' });
      }

      return res.json(payment);
    } catch (error) {
      next(error);
    }
  }

  // ── GET /payments/:payment_id/invoice ────────────────────────────────────
  /**
   * Download invoice PDF for a payment.
   */
  async downloadInvoice(req, res, next) {
    try {
      const { payment_id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.role === 'admin';

      const payment = await paymentService.getPaymentByPaymentId(payment_id, userId, isAdmin);
      if (!payment) {
        return res.status(404).json({ detail: 'Payment not found' });
      }
      if (payment.status !== 'captured' && payment.status !== 'refunded') {
        return res.status(400).json({ detail: 'Invoice only available for completed payments' });
      }

      const appointment = await Appointment.findOne({ id: payment.appointment_id }).lean();
      const patient = await User.findOne({ id: payment.user_id }).lean();
      const doctorProfile = await DoctorProfile.findOne({}).lean();

      const pdfBuffer = await generateInvoicePDF({
        payment,
        appointment: appointment || {},
        patient: patient || { full_name: 'Patient', email: '' },
        doctor: doctorProfile || {},
      });

      const filename = `invoice-${payment.invoice_number || payment_id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      return res.send(pdfBuffer);
    } catch (error) {
      logger.error('downloadInvoice error:', error);
      next(error);
    }
  }

  // ── GET /admin/payments/stats ─────────────────────────────────────────────
  async getPaymentStats(req, res, next) {
    try {
      const stats = await paymentService.getRevenueStats();
      return res.json(stats);
    } catch (error) {
      next(error);
    }
  }

  // ── GET /admin/payments ───────────────────────────────────────────────────
  async getAllPayments(req, res, next) {
    try {
      const {
        status,
        search,
        start_date,
        end_date,
        limit = 50,
        skip = 0,
      } = req.query;

      const result = await paymentService.getAllPayments({
        status,
        search,
        startDate: start_date,
        endDate: end_date,
        limit: Math.min(parseInt(limit), 100),
        skip: parseInt(skip),
      });

      return res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // ── GET /admin/payments/failed ────────────────────────────────────────────
  async getFailedPayments(req, res, next) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const skip = parseInt(req.query.skip) || 0;

      const [payments, total] = await Promise.all([
        Payment.find({ status: 'failed' })
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Payment.countDocuments({ status: 'failed' }),
      ]);

      return res.json({ payments, total });
    } catch (error) {
      next(error);
    }
  }

  // ── GET /admin/payments/refunds ───────────────────────────────────────────
  async getRefundHistory(req, res, next) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const skip = parseInt(req.query.skip) || 0;

      const [payments, total] = await Promise.all([
        Payment.find({ refund_status: { $in: ['full', 'partial'] } })
          .sort({ updated_at: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Payment.countDocuments({ refund_status: { $in: ['full', 'partial'] } }),
      ]);

      return res.json({ payments, total });
    } catch (error) {
      next(error);
    }
  }
}

export default new PaymentController();
