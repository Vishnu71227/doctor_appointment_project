import mongoose from 'mongoose';

// All permission keys available in the system. Used to validate role.permissions.
export const ALL_PERMISSIONS = [
  'dashboard.view',
  'doctors.view', 'doctors.manage',
  'patients.view', 'patients.manage',
  'appointments.view', 'appointments.manage',
  'payments.view', 'payments.manage', 'payments.refund',
  'reviews.view', 'reviews.manage',
  'prescriptions.view', 'prescriptions.manage',
  'video.view',
  'support.view', 'support.manage',
  'notifications.view', 'notifications.manage',
  'coupons.view', 'coupons.manage',
  'cms.view', 'cms.manage',
  'reports.view', 'reports.export',
  'settings.view', 'settings.manage',
  'roles.view', 'roles.manage',
  'audit.view',
  'feature_flags.view', 'feature_flags.manage',
];

const adminRoleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((p) => ALL_PERMISSIONS.includes(p)),
        message: 'Invalid permission key provided',
      },
    },
    is_system: {
      // system roles (super_admin) cannot be deleted/edited away from full access
      type: Boolean,
      default: false,
    },
    is_active: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'admin_roles',
  }
);

const AdminRole = mongoose.model('AdminRole', adminRoleSchema);

export default AdminRole;
