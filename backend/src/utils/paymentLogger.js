/**
 * Payment Audit Logger
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated logger for all payment-related events. Separate from the main
 * application logger so payment audit trails can be shipped to a separate
 * stream (e.g., CloudWatch, Splunk, Datadog) independently.
 *
 * SECURITY NOTE: This logger NEVER logs:
 *  - Card numbers, CVV, expiry
 *  - UPI PINs or OTPs
 *  - Razorpay key secrets
 *  - Full webhook payloads (only summaries)
 */

import pino from 'pino';

const paymentLogger = pino({
  name: 'payment-audit',
  level: process.env.LOG_LEVEL || 'info',

  // Redact sensitive fields in case they accidentally appear in logs
  redact: {
    paths: [
      'razorpay_signature',
      'card.number',
      'card.cvv',
      'card.expiry',
      'upi.vpa',
      'key_secret',
      'webhook_secret',
      '*.password',
      '*.token',
    ],
    censor: '[REDACTED]',
  },

  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            messageFormat: '💳 [PAYMENT] {msg}',
          },
        }
      : undefined,

  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Log payment order creation
 * @param {string} appointmentId
 * @param {string} razorpayOrderId
 * @param {number} amount - in INR
 * @param {string} userId
 */
export const logOrderCreated = (appointmentId, razorpayOrderId, amount, userId) => {
  paymentLogger.info({
    event: 'payment.order_created',
    appointment_id: appointmentId,
    razorpay_order_id: razorpayOrderId,
    amount_inr: amount,
    user_id: userId,
    timestamp: new Date().toISOString(),
  }, `Order created: ${razorpayOrderId} for ₹${amount}`);
};

/**
 * Log successful payment verification
 * @param {string} razorpayPaymentId
 * @param {string} razorpayOrderId
 * @param {string} appointmentId
 * @param {number} amount - in INR
 */
export const logPaymentVerified = (razorpayPaymentId, razorpayOrderId, appointmentId, amount) => {
  paymentLogger.info({
    event: 'payment.verified',
    razorpay_payment_id: razorpayPaymentId,
    razorpay_order_id: razorpayOrderId,
    appointment_id: appointmentId,
    amount_inr: amount,
    timestamp: new Date().toISOString(),
  }, `Payment verified: ${razorpayPaymentId}`);
};

/**
 * Log payment failure
 * @param {string} razorpayOrderId
 * @param {string} appointmentId
 * @param {string} reason
 * @param {string} code
 */
export const logPaymentFailed = (razorpayOrderId, appointmentId, reason, code) => {
  paymentLogger.warn({
    event: 'payment.failed',
    razorpay_order_id: razorpayOrderId,
    appointment_id: appointmentId,
    failure_reason: reason,
    failure_code: code,
    timestamp: new Date().toISOString(),
  }, `Payment failed: ${razorpayOrderId} — ${reason}`);
};

/**
 * Log signature verification failure (potential tamper attempt)
 * @param {string} razorpayOrderId
 * @param {string} appointmentId
 * @param {string} ip
 */
export const logSignatureInvalid = (razorpayOrderId, appointmentId, ip) => {
  paymentLogger.error({
    event: 'payment.signature_invalid',
    razorpay_order_id: razorpayOrderId,
    appointment_id: appointmentId,
    ip_address: ip,
    timestamp: new Date().toISOString(),
    alert: 'POSSIBLE_PAYMENT_TAMPERING',
  }, `⚠️ INVALID SIGNATURE for order ${razorpayOrderId} from IP ${ip}`);
};

/**
 * Log webhook event received
 * @param {string} event - e.g. 'payment.captured'
 * @param {string} entityId
 */
export const logWebhookReceived = (event, entityId) => {
  paymentLogger.info({
    event: `webhook.${event}`,
    entity_id: entityId,
    timestamp: new Date().toISOString(),
  }, `Webhook: ${event} for ${entityId}`);
};

/**
 * Log refund initiated
 * @param {string} paymentId
 * @param {number} amount - in INR
 * @param {string} refundType - 'full' | 'partial'
 * @param {string} initiatedBy - admin user_id
 */
export const logRefundInitiated = (paymentId, amount, refundType, initiatedBy) => {
  paymentLogger.info({
    event: 'refund.initiated',
    payment_id: paymentId,
    refund_amount_inr: amount,
    refund_type: refundType,
    initiated_by: initiatedBy,
    timestamp: new Date().toISOString(),
  }, `Refund initiated: ₹${amount} (${refundType}) for payment ${paymentId}`);
};

/**
 * Log duplicate payment attempt detected
 * @param {string} appointmentId
 * @param {string} existingOrderId
 * @param {string} userId
 */
export const logDuplicatePaymentAttempt = (appointmentId, existingOrderId, userId) => {
  paymentLogger.warn({
    event: 'payment.duplicate_attempt',
    appointment_id: appointmentId,
    existing_order_id: existingOrderId,
    user_id: userId,
    timestamp: new Date().toISOString(),
    alert: 'DUPLICATE_PAYMENT_BLOCKED',
  }, `Duplicate payment attempt blocked for appointment ${appointmentId}`);
};

export default paymentLogger;
