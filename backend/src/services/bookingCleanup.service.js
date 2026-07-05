import { Queue } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

// 🔒 PRODUCTION FIX: abandoned bookings (patient starts checkout, never pays)
// used to stay "pending" forever and permanently block that slot. This
// schedules a delayed job that auto-cancels the appointment if it's still
// unpaid after a grace period, so the slot becomes bookable again.
const UNPAID_GRACE_PERIOD_MINUTES = 15;

class BookingCleanupService {
  constructor() {
    this.queue = null;
  }

  getQueue() {
    if (!this.queue) {
      const redis = getRedisClient();
      if (!redis) return null;
      this.queue = new Queue('booking-cleanup', { connection: redis });
    }
    return this.queue;
  }

  async scheduleUnpaidCancellation(appointmentId) {
    const queue = this.getQueue();
    if (!queue) {
      logger.warn('[BOOKING CLEANUP] Queue not available — Redis missing. Unpaid booking will NOT auto-expire.');
      return;
    }

    try {
      await queue.add(
        'cancel-if-unpaid',
        { appointmentId },
        {
          delay: UNPAID_GRACE_PERIOD_MINUTES * 60 * 1000,
          jobId: `cleanup-${appointmentId}`, // prevents duplicate jobs for the same appointment
          removeOnComplete: true,
          removeOnFail: true,
        }
      );
      logger.info(`[BOOKING CLEANUP] Scheduled unpaid-cancellation check for ${appointmentId} in ${UNPAID_GRACE_PERIOD_MINUTES} min`);
    } catch (error) {
      logger.error('[BOOKING CLEANUP] Failed to schedule cleanup job:', error.message);
    }
  }

  // Called when payment succeeds, so we don't need to cancel an already-paid booking.
  async cancelScheduledCleanup(appointmentId) {
    const queue = this.getQueue();
    if (!queue) return;
    try {
      const job = await queue.getJob(`cleanup-${appointmentId}`);
      if (job) {
        await job.remove();
        logger.info(`[BOOKING CLEANUP] Cancelled cleanup job for paid appointment ${appointmentId}`);
      }
    } catch (error) {
      logger.error('[BOOKING CLEANUP] Failed to cancel cleanup job:', error.message);
    }
  }
}

export default new BookingCleanupService();
