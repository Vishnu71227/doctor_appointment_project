/**
 * Payment Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * OLD: Only 2 routes (create-order, verify) — no webhooks, no refunds, no history
 * NEW: Full payment route set:
 *   - create-order: Create Razorpay order + Payment record
 *   - verify: Verify signature + confirm payment (FIXED: now requires all 3 fields)
 *   - webhook: Razorpay async events (NO auth — raw body required)
 *   - refund: Admin-only refund initiation
 *   - history: Patient's own payment history
 *   - /:payment_id: Single payment details
 *   - /:payment_id/invoice: PDF download
 *
 * IMPORTANT: Webhook route uses raw body — mounted before json middleware in app.js
 */

import express from 'express';
import paymentController from '../controllers/payment.controller.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import { paymentLimiter } from '../middlewares/rateLimit.middleware.js';

const router = express.Router();

// ── Public: Razorpay Webhook (NO auth, NO JSON parser) ───────────────────────
// CRITICAL: This must be before authMiddleware and must use raw body
// rawBody is stored by express in app.js before JSON parsing for this path
router.post('/webhook', paymentController.handleWebhook);

// ── All other payment routes require authentication ──────────────────────────
router.use(authMiddleware);

// ── Patient routes ────────────────────────────────────────────────────────────
// Create Razorpay order (rate-limited to prevent abuse)
router.post('/create-order', paymentLimiter, paymentController.createOrder);

// Verify payment signature (most critical endpoint — rate-limited)
router.post('/verify', paymentLimiter, paymentController.verifyPayment);

// Get authenticated user's payment history (paginated)
router.get('/history', paymentController.getPaymentHistory);

// Get single payment details (patient can only see own payments)
router.get('/:payment_id', paymentController.getPaymentById);

// Download invoice PDF for a specific payment
router.get('/:payment_id/invoice', paymentController.downloadInvoice);

// ── Admin-only routes ──────────────────────────────────────────────────────
// Initiate refund (full or partial)
router.post(
  '/:payment_id/refund',
  requireRole('admin'),
  paymentController.initiateRefund
);

export default router;
