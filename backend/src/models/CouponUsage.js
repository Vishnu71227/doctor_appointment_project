import mongoose from 'mongoose';

const couponUsageSchema = new mongoose.Schema(
  {
    coupon_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    coupon_code: { type: String, required: true },
    user_id: { type: String, required: true, index: true },
    appointment_id: { type: String },
    payment_id: { type: String },
    discount_given: { type: Number, required: true }, // actual INR discount applied
    original_amount: { type: Number },
    final_amount: { type: Number },
  },
  {
    timestamps: { createdAt: 'used_at', updatedAt: false },
    collection: 'coupon_usages',
  }
);

couponUsageSchema.index({ coupon_id: 1, user_id: 1 });

const CouponUsage = mongoose.model('CouponUsage', couponUsageSchema);
export default CouponUsage;
