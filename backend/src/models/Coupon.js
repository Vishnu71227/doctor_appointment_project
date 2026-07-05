import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, trim: true },

    // ── Discount ────────────────────────────────────────────────────────────
    discount_type: {
      type: String,
      enum: ['percentage', 'flat'],
      required: true,
    },
    discount_value: {
      type: Number,
      required: true,
      min: 0,
    },
    max_discount_amount: {
      // Cap for percentage coupons (e.g. 20% off but max ₹200)
      type: Number,
      default: null,
    },
    min_order_amount: {
      // Minimum consultation fee required to apply coupon
      type: Number,
      default: 0,
    },

    // ── Validity ─────────────────────────────────────────────────────────────
    starts_at: { type: Date, default: Date.now },
    expires_at: { type: Date, default: null }, // null = never expires

    // ── Usage limits ─────────────────────────────────────────────────────────
    max_uses: { type: Number, default: null },        // null = unlimited total uses
    max_uses_per_user: { type: Number, default: 1 },  // per unique user_id
    total_uses: { type: Number, default: 0 },         // counter

    // ── Targeting ─────────────────────────────────────────────────────────────
    applicable_to: {
      type: String,
      enum: ['all', 'new_users', 'specific_users', 'specific_doctors'],
      default: 'all',
    },
    allowed_user_ids: { type: [String], default: [] },
    allowed_doctor_ids: { type: [String], default: [] },

    is_active: { type: Boolean, default: true, index: true },
    created_by: { type: String }, // admin email
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'coupons',
  }
);

couponSchema.index({ code: 1, is_active: 1 });
couponSchema.index({ expires_at: 1 }, { sparse: true });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
