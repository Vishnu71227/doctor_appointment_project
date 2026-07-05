import mongoose from 'mongoose';

/**
 * Generic key-value settings store.
 * Sensitive keys (passwords, API secrets) are flagged is_secret = true
 * so controllers can redact them before sending to the frontend.
 *
 * Groups: app | smtp | sms | whatsapp | payment | storage | maintenance
 */
const systemSettingSchema = new mongoose.Schema(
  {
    group: {
      type: String,
      required: true,
      enum: ['app', 'smtp', 'sms', 'whatsapp', 'payment', 'storage', 'maintenance'],
      index: true,
    },
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: '' },
    label: { type: String }, // human-readable label for UI
    description: { type: String },
    type: {
      type: String,
      enum: ['string', 'boolean', 'number', 'select'],
      default: 'string',
    },
    options: { type: [String], default: [] }, // for select type
    is_secret: { type: Boolean, default: false }, // redact in API response
    is_readonly: { type: Boolean, default: false }, // cannot be changed from UI
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'system_settings',
  }
);

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

export default SystemSetting;
