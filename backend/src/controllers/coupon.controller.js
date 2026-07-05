import Coupon from '../models/Coupon.js';
import CouponUsage from '../models/CouponUsage.js';
import { validateCoupon, getCouponReport } from '../services/coupon.service.js';
import { recordAuditLog } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

// ── PUBLIC: validate coupon (called from booking flow) ──────────────────────
export const publicValidateCoupon = async (req, res) => {
  try {
    const { code, amount, doctor_id } = req.body;
    const user_id = req.user?.id;
    if (!code || !amount) return res.status(400).json({ detail: 'code and amount required' });

    const result = await validateCoupon({ code, user_id, amount: Number(amount), doctor_id });
    if (!result.valid) return res.status(400).json({ detail: result.reason });

    res.json({
      valid: true,
      code: result.coupon.code,
      discount_type: result.coupon.discount_type,
      discount_value: result.coupon.discount_value,
      discount: result.discount,
      final_amount: result.final_amount,
      description: result.coupon.description,
    });
  } catch (err) {
    logger.error('publicValidateCoupon error:', err);
    res.status(500).json({ detail: 'Coupon validation failed' });
  }
};

// ── ADMIN: list all coupons with pagination ─────────────────────────────────
export const listCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status } = req.query;
    const query = {};
    if (search) query.code = { $regex: search.toUpperCase(), $options: 'i' };
    if (status === 'active') query.is_active = true;
    if (status === 'inactive') query.is_active = false;
    if (status === 'expired') {
      query.expires_at = { $lt: new Date() };
      query.is_active = true;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [coupons, total] = await Promise.all([
      Coupon.find(query).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).lean(),
      Coupon.countDocuments(query),
    ]);

    res.json({ coupons, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (err) {
    res.status(500).json({ detail: 'Coupons load nahi ho sake' });
  }
};

// ── ADMIN: create coupon ────────────────────────────────────────────────────
export const createCoupon = async (req, res) => {
  try {
    const {
      code, description, discount_type, discount_value,
      max_discount_amount, min_order_amount,
      starts_at, expires_at,
      max_uses, max_uses_per_user,
      applicable_to, allowed_user_ids, allowed_doctor_ids,
      is_active,
    } = req.body;

    if (!code || !discount_type || discount_value === undefined) {
      return res.status(400).json({ detail: 'code, discount_type and discount_value are required' });
    }
    if (!['percentage', 'flat'].includes(discount_type)) {
      return res.status(400).json({ detail: 'discount_type must be percentage or flat' });
    }
    if (discount_type === 'percentage' && (discount_value <= 0 || discount_value > 100)) {
      return res.status(400).json({ detail: 'Percentage discount must be between 1 and 100' });
    }

    const exists = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (exists) return res.status(409).json({ detail: 'Coupon code already exists' });

    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      description,
      discount_type,
      discount_value: Number(discount_value),
      max_discount_amount: max_discount_amount ? Number(max_discount_amount) : null,
      min_order_amount: min_order_amount ? Number(min_order_amount) : 0,
      starts_at: starts_at || new Date(),
      expires_at: expires_at || null,
      max_uses: max_uses ? Number(max_uses) : null,
      max_uses_per_user: max_uses_per_user !== undefined ? Number(max_uses_per_user) : 1,
      applicable_to: applicable_to || 'all',
      allowed_user_ids: allowed_user_ids || [],
      allowed_doctor_ids: allowed_doctor_ids || [],
      is_active: is_active !== false,
      created_by: req.user.email,
    });

    await recordAuditLog({ req, action: 'coupon.create', resource: 'Coupon', resource_id: coupon.code, new_value: { code: coupon.code, discount_type, discount_value } });
    res.status(201).json({ coupon });
  } catch (err) {
    logger.error('createCoupon error:', err);
    res.status(500).json({ detail: 'Coupon create nahi hua' });
  }
};

// ── ADMIN: update coupon ────────────────────────────────────────────────────
export const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ detail: 'Coupon not found' });

    const old_value = { code: coupon.code, is_active: coupon.is_active };
    const updatable = [
      'description', 'discount_value', 'max_discount_amount', 'min_order_amount',
      'starts_at', 'expires_at', 'max_uses', 'max_uses_per_user',
      'applicable_to', 'allowed_user_ids', 'allowed_doctor_ids', 'is_active',
    ];
    for (const key of updatable) {
      if (req.body[key] !== undefined) coupon[key] = req.body[key];
    }
    await coupon.save();

    await recordAuditLog({ req, action: 'coupon.update', resource: 'Coupon', resource_id: coupon.code, old_value, new_value: { is_active: coupon.is_active } });
    res.json({ coupon });
  } catch (err) {
    res.status(500).json({ detail: 'Coupon update nahi hua' });
  }
};

// ── ADMIN: delete coupon ────────────────────────────────────────────────────
export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ detail: 'Coupon not found' });
    if (coupon.total_uses > 0) {
      return res.status(409).json({ detail: `Coupon has been used ${coupon.total_uses} time(s). Deactivate instead of deleting.` });
    }
    await coupon.deleteOne();
    await recordAuditLog({ req, action: 'coupon.delete', resource: 'Coupon', resource_id: coupon.code });
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ detail: 'Coupon delete nahi hua' });
  }
};

// ── ADMIN: coupon usage report ──────────────────────────────────────────────
export const couponUsageReport = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id).lean();
    if (!coupon) return res.status(404).json({ detail: 'Coupon not found' });

    const report = await getCouponReport(coupon._id);
    res.json({ coupon, ...report });
  } catch (err) {
    res.status(500).json({ detail: 'Report load nahi hua' });
  }
};

// ── ADMIN: overall coupon analytics ────────────────────────────────────────
export const couponAnalytics = async (req, res) => {
  try {
    const [totalCoupons, activeCoupons, expiredCoupons, usageStats] = await Promise.all([
      Coupon.countDocuments(),
      Coupon.countDocuments({ is_active: true }),
      Coupon.countDocuments({ expires_at: { $lt: new Date() } }),
      CouponUsage.aggregate([
        {
          $group: {
            _id: null,
            total_usages: { $sum: 1 },
            total_discount_given: { $sum: '$discount_given' },
          },
        },
      ]),
    ]);

    const topCoupons = await Coupon.find().sort({ total_uses: -1 }).limit(5).lean();

    res.json({
      summary: {
        total_coupons: totalCoupons,
        active_coupons: activeCoupons,
        expired_coupons: expiredCoupons,
        total_usages: usageStats[0]?.total_usages || 0,
        total_discount_given: usageStats[0]?.total_discount_given || 0,
      },
      top_coupons: topCoupons,
    });
  } catch (err) {
    res.status(500).json({ detail: 'Analytics load nahi hua' });
  }
};

export default {
  publicValidateCoupon,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  couponUsageReport,
  couponAnalytics,
};
