import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    user_id: { type: String, index: true },
    user_email: { type: String },
    user_role: { type: String },
    action: { type: String, required: true, index: true }, // e.g. 'doctor.approve'
    resource: { type: String, required: true, index: true }, // e.g. 'DoctorProfile'
    resource_id: { type: String, index: true },
    method: { type: String },
    path: { type: String },
    old_value: { type: mongoose.Schema.Types.Mixed },
    new_value: { type: mongoose.Schema.Types.Mixed },
    status_code: { type: Number },
    ip_address: { type: String },
    user_agent: { type: String },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    collection: 'audit_logs',
  }
);

auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ resource: 1, resource_id: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
