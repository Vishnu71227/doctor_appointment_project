import Coupon from '../models/Coupon.js';
import CouponUsage from '../models/CouponUsage.js';
import User from '../models/User.js';

/**
 * Validate a coupon code for a given user and amount.
 * Returns { valid: true, coupon, discount } or { valid: false, reason }
 */
export const validateCoupon = async ({ code, user_id, amount, doctor_id = null }) => {
  if (!code) return { valid: false, reason: 'Coupon code required' };

  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), is_active: true });
  if (!coupon) return { valid: false, reason: 'Invalid or inactive coupon code' };

  const now = new Date();
  if (coupon.starts_at && coupon.starts_at > now) {
    return { valid: false, reason: 'Coupon is not active yet' };
  }
  if (coupon.expires_at && coupon.expires_at < now) {
    return { valid: false, reason: 'Coupon has expired' };
  }
  if (coupon.max_uses !== null && coupon.total_uses >= coupon.max_uses) {
    return { valid: false, reason: 'Coupon usage limit reached' };
  }
  if (amount < (coupon.min_order_amount || 0)) {
    return { valid: false, reason: `Minimum order amount ₹${coupon.min_order_amount} required` };
  }

  // Per-user limit check
  const userUses = await CouponUsage.countDocuments({ coupon_id: coupon._id, user_id });
  if (coupon.max_uses_per_user !== null && userUses >= coupon.max_uses_per_user) {
    return { valid: false, reason: 'You have already used this coupon the maximum number of times' };
  }

  // Targeting checks
  if (coupon.applicable_to === 'new_users') {
    const user = await User.findOne({ id: user_id }).lean();
    const usageCount = await CouponUsage.countDocuments({ user_id });
    if (usageCount > 0) {
      return { valid: false, reason: 'This coupon is only for new users' };
    }
  }
  if (coupon.applicable_to === 'specific_users' && coupon.allowed_user_ids.length > 0) {
    if (!coupon.allowed_user_ids.includes(user_id)) {
      return { valid: false, reason: 'This coupon is not applicable to your account' };
    }
  }
  if (coupon.applicable_to === 'specific_doctors' && coupon.allowed_doctor_ids.length > 0 && doctor_id) {
    if (!coupon.allowed_doctor_ids.includes(doctor_id)) {
      return { valid: false, reason: 'This coupon is not valid for the selected doctor' };
    }
  }

  // Calculate discount
  let discount = 0;
  if (coupon.discount_type === 'flat') {
    discount = Math.min(coupon.discount_value, amount);
  } else {
    discount = (amount * coupon.discount_value) / 100;
    if (coupon.max_discount_amount) {
      discount = Math.min(discount, coupon.max_discount_amount);
    }
  }
  discount = Math.round(discount * 100) / 100;

  return {
    valid: true,
    coupon,
    discount,
    final_amount: Math.max(0, amount - discount),
  };
};

/**
 * Record coupon usage and increment counter. Call after successful payment.
 */
export const applyCoupon = async ({ coupon_id, coupon_code, user_id, appointment_id, payment_id, discount_given, original_amount, final_amount }) => {
  await Promise.all([
    CouponUsage.create({ coupon_id, coupon_code, user_id, appointment_id, payment_id, discount_given, original_amount, final_amount }),
    Coupon.findByIdAndUpdate(coupon_id, { $inc: { total_uses: 1 } }),
  ]);
};

/**
 * Coupon usage report for admin.
 */
export const getCouponReport = async (coupon_id) => {
  const usages = await CouponUsage.find({ coupon_id }).sort({ used_at: -1 }).lean();
  const total_discount = usages.reduce((sum, u) => sum + (u.discount_given || 0), 0);
  return { usages, total_uses: usages.length, total_discount };
};

export default { validateCoupon, applyCoupon, getCouponReport };
