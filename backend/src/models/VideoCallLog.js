import mongoose from 'mongoose';

/**
 * One document per video consultation session.
 * Written when a call ends (or on timeout) by the Twilio/Zoom webhook
 * or when admin manually marks a call status.
 */
const videoCallLogSchema = new mongoose.Schema(
  {
    appointment_id: { type: String, required: true, unique: true, index: true },
    patient_id: { type: String, index: true },
    doctor_id: { type: String, index: true },

    // ── Timing ────────────────────────────────────────────────────
    call_started_at: { type: Date },
    call_ended_at: { type: Date },
    duration_seconds: { type: Number, default: 0 }, // computed or from provider

    // ── Status ────────────────────────────────────────────────────
    call_status: {
      type: String,
      enum: ['completed', 'dropped', 'missed', 'no_show_patient', 'no_show_doctor', 'technical_error'],
      default: 'completed',
      index: true,
    },

    // ── Provider ──────────────────────────────────────────────────
    provider: { type: String, enum: ['twilio', 'zoom', 'other'], default: 'twilio' },
    room_name: { type: String },

    // ── Quality signals ───────────────────────────────────────────
    patient_rating: { type: Number, min: 1, max: 5, default: null },
    doctor_rating: { type: Number, min: 1, max: 5, default: null }, // doctor rates patient
    patient_feedback: { type: String },
    drop_reason: { type: String }, // network, timeout, error message

    // ── Join flags ────────────────────────────────────────────────
    patient_joined: { type: Boolean, default: false },
    doctor_joined: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'video_call_logs',
  }
);

videoCallLogSchema.index({ call_status: 1, created_at: -1 });
videoCallLogSchema.index({ doctor_id: 1, call_status: 1 });

const VideoCallLog = mongoose.model('VideoCallLog', videoCallLogSchema);
export default VideoCallLog;
