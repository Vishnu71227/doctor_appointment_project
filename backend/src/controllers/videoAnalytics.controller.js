import VideoCallLog from '../models/VideoCallLog.js';
import Appointment from '../models/Appointment.js';
import DoctorProfile from '../models/DoctorProfile.js';
import User from '../models/User.js';
import { recordAuditLog } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

/**
 * Seed VideoCallLog from existing completed Appointments that lack a log entry.
 * Runs lazily on first admin access so historical data is visible.
 */
const seedLogsFromAppointments = async () => {
  try {
    const completed = await Appointment.find({
      consultation_type: 'video',
      status: { $in: ['completed', 'cancelled'] },
    }).lean();

    for (const appt of completed) {
      const exists = await VideoCallLog.findOne({ appointment_id: appt.id });
      if (exists) continue;

      const patientJoined = !!appt.patient_joined_at;
      const doctorJoined = !!appt.doctor_joined_at;
      let callStatus = 'completed';
      if (appt.status === 'cancelled') {
        callStatus = !patientJoined ? 'no_show_patient' : !doctorJoined ? 'no_show_doctor' : 'missed';
      } else if (!patientJoined && !doctorJoined) {
        callStatus = 'missed';
      }

      let durationSeconds = 0;
      if (appt.patient_joined_at && appt.completed_at) {
        durationSeconds = Math.max(0, (new Date(appt.completed_at) - new Date(appt.patient_joined_at)) / 1000);
      }

      await VideoCallLog.create({
        appointment_id: appt.id,
        patient_id: appt.patient_id,
        doctor_id: appt.doctor_id,
        call_started_at: appt.patient_joined_at || appt.doctor_joined_at || null,
        call_ended_at: appt.completed_at || appt.cancelled_at || null,
        duration_seconds: Math.round(durationSeconds),
        call_status: callStatus,
        patient_joined: patientJoined,
        doctor_joined: doctorJoined,
      });
    }
  } catch (err) {
    logger.error('[VideoAnalytics] Seed error:', err.message);
  }
};

/** GET /admin/video/stats — summary metrics */
export const getVideoStats = async (req, res) => {
  try {
    await seedLogsFromAppointments();

    const [statusAgg, durationAgg, ratingAgg, totalVideo] = await Promise.all([
      VideoCallLog.aggregate([{ $group: { _id: '$call_status', count: { $sum: 1 } } }]),
      VideoCallLog.aggregate([
        { $match: { call_status: 'completed', duration_seconds: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$duration_seconds' }, max: { $max: '$duration_seconds' }, total: { $sum: '$duration_seconds' } } },
      ]),
      VideoCallLog.aggregate([
        { $match: { patient_rating: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$patient_rating' }, count: { $sum: 1 } } },
      ]),
      VideoCallLog.countDocuments(),
    ]);

    const byStatus = Object.fromEntries(statusAgg.map((s) => [s._id, s.count]));
    const duration = durationAgg[0] || { avg: 0, max: 0, total: 0 };

    res.json({
      total_calls: totalVideo,
      by_status: byStatus,
      completed: byStatus.completed || 0,
      dropped: byStatus.dropped || 0,
      missed: byStatus.missed || 0,
      no_show_patient: byStatus.no_show_patient || 0,
      no_show_doctor: byStatus.no_show_doctor || 0,
      avg_duration_minutes: (duration.avg / 60).toFixed(1),
      max_duration_minutes: (duration.max / 60).toFixed(1),
      total_hours: (duration.total / 3600).toFixed(1),
      avg_patient_rating: ratingAgg[0]?.avg?.toFixed(1) || null,
      ratings_count: ratingAgg[0]?.count || 0,
    });
  } catch (err) {
    logger.error('getVideoStats:', err);
    res.status(500).json({ detail: 'Stats load nahi hua' });
  }
};

/** GET /admin/video/logs — paginated call log */
export const getCallLogs = async (req, res) => {
  try {
    await seedLogsFromAppointments();
    const { page = 1, limit = 20, status, doctor_id, from, to } = req.query;
    const query = {};
    if (status) query.call_status = status;
    if (doctor_id) query.doctor_id = doctor_id;
    if (from || to) {
      query.created_at = {};
      if (from) query.created_at.$gte = new Date(from);
      if (to) query.created_at.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      VideoCallLog.find(query).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).lean(),
      VideoCallLog.countDocuments(query),
    ]);

    // Enrich with patient/doctor names
    const patientIds = [...new Set(logs.map((l) => l.patient_id).filter(Boolean))];
    const doctorIds = [...new Set(logs.map((l) => l.doctor_id).filter(Boolean))];
    const [patients, doctors] = await Promise.all([
      User.find({ id: { $in: patientIds } }).select('id full_name email').lean(),
      User.find({ id: { $in: doctorIds } }).select('id full_name').lean(),
    ]);
    const patientMap = Object.fromEntries(patients.map((u) => [u.id, u]));
    const doctorMap = Object.fromEntries(doctors.map((u) => [u.id, u]));

    const enriched = logs.map((l) => ({
      ...l,
      patient_name: patientMap[l.patient_id]?.full_name || l.patient_id,
      doctor_name: doctorMap[l.doctor_id]?.full_name || l.doctor_id,
    }));

    res.json({ logs: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 });
  } catch (err) {
    logger.error('getCallLogs:', err);
    res.status(500).json({ detail: 'Logs load nahi ho sake' });
  }
};

/** GET /admin/video/doctor-performance — per-doctor stats */
export const getDoctorPerformance = async (req, res) => {
  try {
    await seedLogsFromAppointments();
    const perf = await VideoCallLog.aggregate([
      {
        $group: {
          _id: '$doctor_id',
          total_calls: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$call_status', 'completed'] }, 1, 0] } },
          dropped: { $sum: { $cond: [{ $eq: ['$call_status', 'dropped'] }, 1, 0] } },
          no_show: { $sum: { $cond: [{ $eq: ['$call_status', 'no_show_doctor'] }, 1, 0] } },
          avg_duration: { $avg: '$duration_seconds' },
          avg_rating: { $avg: '$patient_rating' },
        },
      },
      { $sort: { total_calls: -1 } },
      { $limit: 20 },
    ]);

    const doctorIds = perf.map((p) => p._id).filter(Boolean);
    const doctors = await User.find({ id: { $in: doctorIds } }).select('id full_name').lean();
    const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d.full_name]));

    const enriched = perf.map((p) => ({
      ...p,
      doctor_name: doctorMap[p._id] || p._id,
      completion_rate: p.total_calls > 0 ? ((p.completed / p.total_calls) * 100).toFixed(0) : '0',
      avg_duration_min: p.avg_duration ? (p.avg_duration / 60).toFixed(1) : '0',
      avg_rating: p.avg_rating ? p.avg_rating.toFixed(1) : null,
    }));

    res.json({ performance: enriched });
  } catch (err) {
    res.status(500).json({ detail: 'Performance load nahi hua' });
  }
};

/** GET /admin/video/trends — daily call counts (last 30 days) */
export const getVideoTrends = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trends = await VideoCallLog.aggregate([
      { $match: { created_at: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$call_status', 'completed'] }, 1, 0] } },
          dropped: { $sum: { $cond: [{ $eq: ['$call_status', 'dropped'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ trends });
  } catch (err) {
    res.status(500).json({ detail: 'Trends load nahi hua' });
  }
};

/** PATCH /admin/video/logs/:appointment_id — manual status correction */
export const updateCallLog = async (req, res) => {
  try {
    const { call_status, duration_seconds, patient_rating, drop_reason } = req.body;
    let log = await VideoCallLog.findOne({ appointment_id: req.params.appointment_id });
    if (!log) {
      log = await VideoCallLog.create({ appointment_id: req.params.appointment_id, ...req.body });
    } else {
      if (call_status) log.call_status = call_status;
      if (duration_seconds !== undefined) log.duration_seconds = duration_seconds;
      if (patient_rating !== undefined) log.patient_rating = patient_rating;
      if (drop_reason !== undefined) log.drop_reason = drop_reason;
      await log.save();
    }
    await recordAuditLog({ req, action: 'video_log.update', resource: 'VideoCallLog', resource_id: req.params.appointment_id });
    res.json({ log });
  } catch (err) {
    res.status(500).json({ detail: 'Log update nahi hua' });
  }
};

export default { getVideoStats, getCallLogs, getDoctorPerformance, getVideoTrends, updateCallLog };
