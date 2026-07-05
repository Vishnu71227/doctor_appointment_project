import { getSetting } from '../services/systemSettings.service.js';

let _lastCheck = 0;
let _cached = false;
const CACHE_TTL = 30_000; // re-check DB every 30 seconds

/**
 * Intercepts every non-admin request when maintenance mode is enabled.
 * Uses a short TTL cache to avoid a DB hit on every single request.
 */
export const maintenanceMiddleware = async (req, res, next) => {
  try {
    const now = Date.now();
    if (now - _lastCheck > CACHE_TTL) {
      _cached = await getSetting('maintenance.enabled', false);
      _lastCheck = now;
    }

    if (!_cached) return next();

    // Always allow admin routes and the public maintenance status endpoint
    if (req.path.startsWith('/admin') || req.path.includes('/public/maintenance')) {
      return next();
    }

    const message = await getSetting('maintenance.message', 'We are under maintenance. Back soon!');
    const estimated_end = await getSetting('maintenance.estimated_end', '');

    return res.status(503).json({
      detail: 'Service temporarily unavailable',
      maintenance: true,
      message,
      estimated_end: estimated_end || null,
    });
  } catch {
    // If DB check fails, allow through (fail open — don't break the app)
    next();
  }
};

export default maintenanceMiddleware;
