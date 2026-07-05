import Appointment from '../models/Appointment.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import DoctorProfile from '../models/DoctorProfile.js';
import Prescription from '../models/Prescription.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { recordAuditLog } from '../services/auditLog.service.js';
import logger from '../utils/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseDate = (d) => (d ? new Date(d) : null);

const buildDateQuery = (from, to, field = 'created_at') => {
  if (!from && !to) return {};
  const q = {};
  if (from) q[`${field}.$gte`] = parseDate(from);
  if (to)   q[`${field}.$lte`] = parseDate(to);
  // flatten
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    const [col, op] = k.split('.$');
    if (!out[col]) out[col] = {};
    out[col][`$${op}`] = v;
  }
  return out;
};

const sendCSV = (res, filename, headers, rows) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  res.write(headers.map(escape).join(',') + '\n');
  for (const row of rows) {
    res.write(row.map(escape).join(',') + '\n');
  }
  res.end();
};

const buildExcel = async (res, filename, sheetName, headers, rows) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HealthLine Admin';
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col) => { col.width = 20; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
};

const buildPDF = (res, filename, title, headers, rows) => {
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // Title
  doc.fontSize(16).fillColor('#0f766e').text('HealthLine', { align: 'center' });
  doc.fontSize(12).fillColor('#1f2937').text(title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#6b7280').text(`Generated: ${new Date().toLocaleString('en-IN')}`, { align: 'right' });
  doc.moveDown();

  // Table
  const colW = (doc.page.width - 60) / headers.length;
  const drawRow = (cols, isHeader = false) => {
    const y = doc.y;
    if (isHeader) doc.rect(30, y - 4, doc.page.width - 60, 18).fill('#0f766e');
    cols.forEach((cell, i) => {
      doc.fillColor(isHeader ? '#ffffff' : '#374151')
        .fontSize(isHeader ? 8 : 7)
        .text(String(cell ?? ''), 30 + i * colW, y, { width: colW - 4, lineBreak: false });
    });
    doc.moveDown(0.8);
  };

  drawRow(headers, true);
  for (const row of rows) {
    if (doc.y > doc.page.height - 60) { doc.addPage(); drawRow(headers, true); }
    drawRow(row);
  }
  doc.end();
};

// ── DATA FETCHERS ─────────────────────────────────────────────────────────────

const getRevenueData = async (from, to) => {
  const query = { payment_status: 'completed', ...buildDateQuery(from, to) };
  const payments = await Payment.find(query).sort({ created_at: -1 }).lean();
  return payments.map((p) => [
    p.payment_id || p._id,
    p.patient_id,
    p.doctor_id,
    p.amount,
    p.currency || 'INR',
    p.method || '—',
    p.status,
    new Date(p.created_at).toLocaleDateString('en-IN'),
  ]);
};

const getAppointmentData = async (from, to) => {
  const query = buildDateQuery(from, to);
  const appointments = await Appointment.find(query).sort({ created_at: -1 }).lean();
  return appointments.map((a) => [
    a.id,
    a.patient_id,
    a.doctor_id,
    a.date,
    a.time,
    a.consultation_type,
    a.status,
    a.payment_status,
    a.amount || 0,
    new Date(a.created_at).toLocaleDateString('en-IN'),
  ]);
};

const getPatientData = async (from, to) => {
  const query = { role: 'patient', ...buildDateQuery(from, to) };
  const users = await User.find(query).select('-password').sort({ created_at: -1 }).lean();
  return users.map((u) => [
    u.id, u.full_name, u.email, u.phone || '—',
    u.is_active ? 'Active' : 'Inactive',
    u.otp_verified ? 'Yes' : 'No',
    new Date(u.created_at).toLocaleDateString('en-IN'),
  ]);
};

const getDoctorData = async (from, to) => {
  const query = buildDateQuery(from, to);
  const profiles = await DoctorProfile.find(query).sort({ created_at: -1 }).lean();
  return profiles.map((d) => [
    d.user_id, d.name || '—', d.specialization || '—',
    d.verification_status, d.experience_years || '—',
    d.consultation_fee || '—', d.rating || '—',
    new Date(d.created_at).toLocaleDateString('en-IN'),
  ]);
};

const getRefundData = async (from, to) => {
  const query = { 'refunds.0': { $exists: true }, ...buildDateQuery(from, to) };
  const payments = await Payment.find(query).sort({ created_at: -1 }).lean();
  const rows = [];
  for (const p of payments) {
    for (const r of (p.refunds || [])) {
      rows.push([
        p.payment_id || p._id,
        p.patient_id,
        r.amount || '—',
        r.reason || '—',
        r.status || '—',
        r.razorpay_refund_id || '—',
        r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '—',
      ]);
    }
  }
  return rows;
};

// ── REPORT HEADERS ────────────────────────────────────────────────────────────

const REPORT_CONFIGS = {
  revenue: {
    title: 'Revenue Report',
    headers: ['Payment ID', 'Patient ID', 'Doctor ID', 'Amount (INR)', 'Currency', 'Method', 'Status', 'Date'],
    getData: getRevenueData,
  },
  appointments: {
    title: 'Appointment Report',
    headers: ['ID', 'Patient ID', 'Doctor ID', 'Date', 'Time', 'Type', 'Status', 'Payment', 'Amount', 'Created'],
    getData: getAppointmentData,
  },
  patients: {
    title: 'Patient Report',
    headers: ['ID', 'Name', 'Email', 'Phone', 'Status', 'Verified', 'Joined'],
    getData: getPatientData,
  },
  doctors: {
    title: 'Doctor Report',
    headers: ['User ID', 'Name', 'Specialization', 'Verification', 'Experience', 'Fee', 'Rating', 'Joined'],
    getData: getDoctorData,
  },
  refunds: {
    title: 'Refund Report',
    headers: ['Payment ID', 'Patient ID', 'Amount', 'Reason', 'Status', 'Razorpay ID', 'Date'],
    getData: getRefundData,
  },
};

// ── CONTROLLER ────────────────────────────────────────────────────────────────

export const generateReport = async (req, res) => {
  try {
    const { type, format, from, to } = req.query;

    if (!REPORT_CONFIGS[type]) {
      return res.status(400).json({ detail: `Invalid report type. Valid: ${Object.keys(REPORT_CONFIGS).join(', ')}` });
    }
    if (!['csv', 'excel', 'pdf'].includes(format)) {
      return res.status(400).json({ detail: 'format must be csv, excel, or pdf' });
    }

    const config = REPORT_CONFIGS[type];
    const rows = await config.getData(from, to);
    const filename = `${type}-report-${new Date().toISOString().slice(0, 10)}`;

    await recordAuditLog({ req, action: `report.export.${type}`, resource: 'Report', new_value: { type, format, from, to, rows: rows.length } });

    if (format === 'csv') {
      sendCSV(res, `${filename}.csv`, config.headers, rows);
    } else if (format === 'excel') {
      await buildExcel(res, `${filename}.xlsx`, config.title, config.headers, rows);
    } else {
      buildPDF(res, `${filename}.pdf`, config.title, config.headers, rows);
    }
  } catch (err) {
    logger.error('generateReport:', err);
    if (!res.headersSent) res.status(500).json({ detail: 'Report generate nahi hua' });
  }
};

export const getReportStats = async (req, res) => {
  try {
    const [totalPatients, totalDoctors, totalAppointments, revenueAgg] = await Promise.all([
      User.countDocuments({ role: 'patient' }),
      DoctorProfile.countDocuments(),
      Appointment.countDocuments(),
      Payment.aggregate([
        { $match: { payment_status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    res.json({
      total_patients: totalPatients,
      total_doctors: totalDoctors,
      total_appointments: totalAppointments,
      total_revenue: revenueAgg[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ detail: 'Stats load nahi hua' });
  }
};

export default { generateReport, getReportStats };
