import { Worker } from 'bullmq';
import { getRedisClient } from '../config/redis.js';
import Appointment from '../models/Appointment.js';
import logger from '../utils/logger.js';

class BookingCleanupWorker {
  constructor() {
    this.worker = null;
  }

  startWorker() {
    const redisClient = getRedisClient();
    if (!redisClient) {
      logger.warn('[BOOKING CLEANUP WORKER] Redis not available. Worker not started.');
      return;
    }
    if (this.worker) {
      logger.info('[BOOKING CLEANUP WORKER] Worker already running.');
      return;
    }
    try {
      this.worker = new Worker(
        'booking-cleanup',
        async (job) => {
          await this.processCleanup(job);
        },
        {
          connection: {
            host: redisClient.options?.host,
            port: redisClient.options?.port,
            password: redisClient.options?.password,
            tls: redisClient.options?.tls,
            db: 0,
          },
          concurrency: 5,
        }
      );

      this.worker.on('completed', (job) => {
        logger.info(`[BOOKING CLEANUP WORKER] Job ${job.id} completed`);
      });

      this.worker.on('failed', (job, err) => {
        logger.error(`[BOOKING CLEANUP WORKER] Job ${job?.id} failed:`, err.message);
      });

      logger.info('[BOOKING CLEANUP WORKER] Worker started successfully ✅');
    } catch (error) {
      logger.error('[BOOKING CLEANUP WORKER] Failed to start worker:', error.message);
    }
  }

  async processCleanup(job) {
    const { appointmentId } = job.data;
    logger.info(`[BOOKING CLEANUP] Checking unpaid status for ${appointmentId}`);
    try {
      const appointment = await Appointment.findOne({ id: appointmentId });
      if (!appointment) {
        logger.warn(`[BOOKING CLEANUP] Appointment ${appointmentId} not found — nothing to do`);
        return;
      }

      // Only cancel if it's still genuinely unpaid. If payment succeeded in the
      // meantime (job ran before cancelScheduledCleanup got the chance to remove it),
      // leave it alone.
      if (appointment.payment_status === 'completed') {
        logger.info(`[BOOKING CLEANUP] ${appointmentId} is already paid — skipping`);
        return;
      }

      if (appointment.status === 'cancelled') {
        logger.info(`[BOOKING CLEANUP] ${appointmentId} already cancelled — skipping`);
        return;
      }

      appointment.status = 'cancelled';
      appointment.payment_status = 'failed';
      appointment.cancelled_at = new Date();
      appointment.cancellation_reason = 'Auto-cancelled: payment not completed within the grace period';
      await appointment.save();

      logger.info(`[BOOKING CLEANUP] Auto-cancelled unpaid appointment ${appointmentId} — slot released`);
    } catch (error) {
      logger.error('[BOOKING CLEANUP] Failed:', error.message);
      throw error;
    }
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
      logger.info('[BOOKING CLEANUP WORKER] Worker closed');
    }
  }
}

export default new BookingCleanupWorker();
