import mongoose from 'mongoose';

/**
 * Feature Flags — runtime on/off switches for application features.
 * No deploy required to toggle a feature.
 *
 * Rollout strategies:
 *  - global   : flag is on/off for everyone
 *  - role     : on for specific user roles (patient | doctor | admin)
 *  - user     : on for specific user IDs (canary / beta users)
 *  - percent  : on for X% of users (gradual rollout)
 */
const featureFlagSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      // e.g. 'video_consultation', 'ai_prescription', 'new_payment_ui'
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    // ── State ─────────────────────────────────────────────────────
    enabled: { type: Boolean, default: false, index: true },

    // ── Rollout strategy ──────────────────────────────────────────
    strategy: {
      type: String,
      enum: ['global', 'role', 'user', 'percent'],
      default: 'global',
    },
    allowed_roles: { type: [String], default: [] },   // for strategy=role
    allowed_user_ids: { type: [String], default: [] }, // for strategy=user
    rollout_percent: { type: Number, default: 100, min: 0, max: 100 }, // for strategy=percent

    // ── Meta ──────────────────────────────────────────────────────
    category: {
      type: String,
      enum: ['ui', 'backend', 'payment', 'consultation', 'notification', 'experimental', 'other'],
      default: 'other',
    },
    is_system: { type: Boolean, default: false }, // cannot be deleted
    last_toggled_by: { type: String },
    last_toggled_at: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'feature_flags',
  }
);

const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);
export default FeatureFlag;
