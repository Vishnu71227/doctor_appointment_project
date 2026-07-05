/**
 * Invoice Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates professional PDF invoices using pdfkit (already installed).
 * Returns a Buffer so it can be:
 *   1. Attached to emails via nodemailer
 *   2. Streamed directly to HTTP response for downloads
 *   3. Stored in object storage (future)
 *
 * DESIGN: Pure function — no side effects, no DB calls. Takes data in, returns Buffer.
 */

import PDFDocument from 'pdfkit';
import config from '../config/env.js';

/**
 * Generate invoice PDF buffer
 *
 * @param {Object} data
 * @param {Object} data.payment     - Payment document
 * @param {Object} data.appointment - Appointment document
 * @param {Object} data.patient     - User document (patient)
 * @param {Object} data.doctor      - Doctor name/profile
 * @returns {Promise<Buffer>}
 */
export const generateInvoicePDF = ({ payment, appointment, patient, doctor }) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Invoice — ${payment.invoice_number || payment.payment_id}`,
        Author: config.clinic.name,
        Subject: 'Medical Consultation Invoice',
        Keywords: 'invoice, medical, consultation',
      },
    });

    // Collect all PDF data into buffer chunks
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const clinic = config.clinic;
    const colors = {
      primary: '#0F766E',    // Teal
      secondary: '#134E4A',
      light: '#F0FDF4',
      border: '#D1FAE5',
      text: '#111827',
      muted: '#6B7280',
      accent: '#14B8A6',
    };

    const pageWidth = doc.page.width - 100; // accounting for margins

    // ── Header: Clinic Branding ────────────────────────────────────────────
    doc
      .fillColor(colors.primary)
      .rect(50, 50, pageWidth, 80)
      .fill();

    doc
      .fillColor('#FFFFFF')
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('🏥 ' + clinic.name, 70, 68);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Medical Consultation Invoice', 70, 98);

    if (clinic.website) {
      doc.fillColor('#CCFBF1').text(clinic.website, 70, 112);
    }

    // Invoice label on right
    doc
      .fillColor('#FFFFFF')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('INVOICE', 0, 68, { align: 'right' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#CCFBF1')
      .text(`#${payment.invoice_number || payment.payment_id}`, 0, 92, { align: 'right' });

    // ── Invoice Meta Block ─────────────────────────────────────────────────
    let y = 158;

    // Two column: Billed To | Invoice Details
    const col1 = 50;
    const col2 = 320;

    doc
      .fillColor(colors.primary)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('BILLED TO', col1, y)
      .text('INVOICE DETAILS', col2, y);

    y += 14;
    doc.fillColor(colors.text).font('Helvetica').fontSize(10);

    // Patient info
    doc
      .font('Helvetica-Bold')
      .text(patient.full_name || 'Patient', col1, y);
    y += 14;
    doc
      .font('Helvetica')
      .fillColor(colors.muted)
      .text(patient.email || '', col1, y);
    y += 12;
    if (patient.phone) {
      doc.text(patient.phone, col1, y);
      y += 12;
    }

    // Invoice details (right column)
    const invY = 172;
    const labelX = col2;
    const valueX = col2 + 110;

    const drawDetail = (label, value, yPos) => {
      doc
        .fillColor(colors.muted)
        .font('Helvetica')
        .fontSize(9)
        .text(label, labelX, yPos);
      doc
        .fillColor(colors.text)
        .font('Helvetica-Bold')
        .text(value || '-', valueX, yPos);
    };

    drawDetail('Invoice No.', payment.invoice_number || payment.payment_id, invY);
    drawDetail('Invoice Date:', formatDate(payment.transaction_date || payment.created_at), invY + 14);
    drawDetail('Payment Date:', formatDate(payment.captured_at || payment.transaction_date), invY + 28);
    drawDetail('Appointment ID:', shortenId(appointment.id), invY + 42);
    drawDetail('Transaction ID:', payment.razorpay_payment_id || payment.payment_id, invY + 56);
    drawDetail('Payment Method:', capitalize(payment.payment_method || 'Online'), invY + 70);

    // Status badge
    doc
      .roundedRect(labelX, invY + 86, 90, 18, 4)
      .fill(colors.primary);
    doc
      .fillColor('#FFFFFF')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('PAID', labelX, invY + 91, { width: 90, align: 'center' });

    // ── Divider ────────────────────────────────────────────────────────────
    y = Math.max(y, invY + 112) + 20;
    doc.strokeColor(colors.border).lineWidth(1).moveTo(50, y).lineTo(50 + pageWidth, y).stroke();
    y += 20;

    // ── Service Table ──────────────────────────────────────────────────────
    // Table header
    const tableHeaders = ['Description', 'Doctor', 'Date & Time', 'Amount'];
    const colWidths = [200, 120, 120, 80];
    const colPositions = [50, 250, 370, 490];

    // Header background
    doc.fillColor(colors.light).rect(50, y, pageWidth, 24).fill();
    doc.strokeColor(colors.border).rect(50, y, pageWidth, 24).stroke();

    tableHeaders.forEach((h, i) => {
      doc
        .fillColor(colors.primary)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(h.toUpperCase(), colPositions[i], y + 8, { width: colWidths[i] - 10 });
    });
    y += 24;

    // Table row
    const rowBg = '#F9FAFB';
    doc.fillColor(rowBg).rect(50, y, pageWidth, 32).fill();
    doc.strokeColor(colors.border).rect(50, y, pageWidth, 32).stroke();

    const consultType = appointment.consultation_type === 'video' ? '🎥 Video Consultation' : '💬 Chat Consultation';
    const apptDate = appointment.date || '';
    const apptTime = appointment.time || '';

    const rowValues = [
      `Medical Consultation\n${consultType}`,
      `Dr. ${doctor?.full_name || 'Doctor'}`,
      `${apptDate}\n${apptTime}`,
      `₹${payment.amount?.toFixed(2)}`,
    ];

    rowValues.forEach((v, i) => {
      doc
        .fillColor(colors.text)
        .font('Helvetica')
        .fontSize(9)
        .text(v, colPositions[i], y + 8, { width: colWidths[i] - 10 });
    });
    y += 40;

    // ── Totals ─────────────────────────────────────────────────────────────
    const totalX = 370;
    const totalWidth = 180;

    const drawTotalRow = (label, value, bold = false, highlight = false) => {
      if (highlight) {
        doc.fillColor(colors.primary).rect(totalX, y, totalWidth, 22).fill();
        doc.fillColor('#FFFFFF');
      } else {
        doc.fillColor(bold ? '#F3F4F6' : '#FFFFFF').rect(totalX, y, totalWidth, 20).fill();
        doc.strokeColor(colors.border).rect(totalX, y, totalWidth, 20).stroke();
        doc.fillColor(colors.text);
      }

      doc
        .font(bold || highlight ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(highlight ? 10 : 9)
        .text(label, totalX + 10, y + (highlight ? 6 : 5), { width: 100 });

      doc
        .font(bold || highlight ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, totalX + 110, y + (highlight ? 6 : 5), { width: 60, align: 'right' });

      y += highlight ? 22 : 20;
    };

    const gstPercent = clinic.gstPercent || 0;
    const subtotal = payment.amount;
    const gstAmount = gstPercent > 0 ? parseFloat((subtotal * gstPercent / 100).toFixed(2)) : 0;
    const total = subtotal + gstAmount;

    drawTotalRow('Subtotal', `₹${subtotal?.toFixed(2)}`);
    if (gstPercent > 0) {
      drawTotalRow(`GST (${gstPercent}%)`, `₹${gstAmount.toFixed(2)}`);
    } else {
      drawTotalRow('GST', 'Exempt', false, false);
    }
    drawTotalRow(`Total Paid (${payment.currency || 'INR'})`, `₹${total.toFixed(2)}`, true, true);

    // ── Refund info (if any) ───────────────────────────────────────────────
    if (payment.refund_status !== 'none' && payment.total_refunded_amount > 0) {
      y += 10;
      doc
        .fillColor('#FEF2F2')
        .rect(50, y, pageWidth, 24)
        .fill();
      doc
        .strokeColor('#FECACA')
        .rect(50, y, pageWidth, 24)
        .stroke();
      doc
        .fillColor('#DC2626')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          `Refund Processed: ₹${payment.total_refunded_amount.toFixed(2)} (${capitalize(payment.refund_status)})`,
          60, y + 8
        );
      y += 32;
    }

    // ── Clinic Details footer ───────────────────────────────────────────────
    y += 30;
    doc.strokeColor(colors.border).lineWidth(1).moveTo(50, y).lineTo(50 + pageWidth, y).stroke();
    y += 14;

    doc
      .fillColor(colors.primary)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Service Provider Details', 50, y);
    y += 14;

    const clinicDetails = [
      clinic.name,
      clinic.address,
      clinic.phone ? `Phone: ${clinic.phone}` : null,
      clinic.email ? `Email: ${clinic.email}` : null,
      clinic.gstin ? `GSTIN: ${clinic.gstin}` : null,
    ].filter(Boolean);

    clinicDetails.forEach((line) => {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text(line, 50, y);
      y += 12;
    });

    // ── Legal footer ──────────────────────────────────────────────────────
    y += 16;
    doc
      .fillColor(colors.light)
      .rect(50, y, pageWidth, 40)
      .fill();
    doc
      .fillColor(colors.muted)
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        'This is a computer-generated invoice and does not require a physical signature. ' +
        'This invoice is valid for tax purposes. For any queries, contact us at ' + clinic.email + '. ' +
        'Payments are non-refundable except as per our refund policy.',
        60,
        y + 8,
        { width: pageWidth - 20 }
      );

    // ── Page footer ────────────────────────────────────────────────────────
    doc
      .fillColor(colors.muted)
      .fontSize(7)
      .text(
        `Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST | ${clinic.name}`,
        50,
        doc.page.height - 30,
        { align: 'center', width: pageWidth }
      );

    doc.end();
  });
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const shortenId = (id) => {
  if (!id) return '-';
  return id.length > 16 ? `...${id.slice(-12)}` : id;
};

const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export default { generateInvoicePDF };
