/**
 * PaymentHistory Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Patient-facing payment history page. Shows all payments, statuses, invoice
 * download links and refund status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import {
  CreditCard, Download, RefreshCw, AlertCircle, CheckCircle,
  Clock, XCircle, ArrowLeft, ReceiptText, IndianRupee, FileText,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
};

const STATUS_CONFIG = {
  captured:           { label: 'Paid',           color: '#15803d', bg: '#f0fdf4', border: '#86efac', Icon: CheckCircle },
  created:            { label: 'Pending',         color: '#d97706', bg: '#fffbeb', border: '#fde68a', Icon: Clock },
  failed:             { label: 'Failed',          color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', Icon: XCircle },
  refunded:           { label: 'Refunded',        color: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', Icon: RefreshCw },
  partially_refunded: { label: 'Part. Refunded',  color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', Icon: RefreshCw },
  cancelled:          { label: 'Cancelled',       color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', Icon: XCircle },
  authorized:         { label: 'Authorized',      color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', Icon: Clock },
};

const REFUND_CONFIG = {
  none:    { label: 'No Refund',   color: '#9ca3af' },
  partial: { label: 'Part. Refund', color: '#7c3aed' },
  full:    { label: 'Full Refund', color: '#1d4ed8' },
  failed:  { label: 'Refund Failed', color: '#dc2626' },
};

const METHOD_ICONS = {
  card:       '💳',
  upi:        '📱',
  netbanking: '🏦',
  wallet:     '👛',
  emi:        '📅',
  unknown:    '💰',
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.created;
  const { label, color, bg, border, Icon } = cfg;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600,
      color, background: bg, border: `1px solid ${border}`,
    }}>
      <Icon size={11} strokeWidth={2.5} /> {label}
    </span>
  );
}

function EmptyState({ onRefresh }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🧾</div>
      <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#111827' }}>No payments yet</h3>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#6b7280' }}>
        Your payment history will appear here after your first consultation.
      </p>
      <button
        onClick={onRefresh}
        style={{
          padding: '10px 24px', borderRadius: 999, border: 'none',
          background: '#0F766E', color: '#fff', fontSize: 14,
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        Refresh
      </button>
    </div>
  );
}

export default function PaymentHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');

  const LIMIT = 10;

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: LIMIT, skip: page * LIMIT };
      if (filterStatus) params.status = filterStatus;
      const res = await axios.get(`${API}/payments/history`, { params });
      setPayments(res.data.payments || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error('Failed to load payment history');
      }
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const handleDownloadInvoice = async (paymentId, invoiceNumber) => {
    if (downloadingId) return;
    setDownloadingId(paymentId);
    try {
      const res = await axios.get(`${API}/payments/${paymentId}/invoice`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceNumber || paymentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Invoice downloaded!');
    } catch {
      toast.error('Failed to download invoice');
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Color tokens ─────────────────────────────────────────────────────────
  const T = {
    primary: '#0F766E', primaryLight: '#F0FDF4',
    text: '#111827', muted: '#6b7280',
    border: '#e5e7eb', cardBg: '#ffffff',
    pageBg: '#f8fafc',
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
      minHeight: '100vh', background: T.pageBg,
      padding: '0 0 60px',
    }}>

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${T.border}`,
        padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 14,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          id="payment-history-back-btn"
          onClick={() => navigate('/patient/dashboard')}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: `1px solid ${T.border}`, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: T.muted,
          }}
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: T.text }}>Payment History</h1>
          <p style={{ margin: 0, fontSize: 12, color: T.muted }}>{total} total transaction{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={fetchPayments}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 999, border: `1px solid ${T.border}`,
            background: '#fff', color: T.muted, fontSize: 13, cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { val: '',          label: 'All' },
            { val: 'captured',  label: '✅ Paid' },
            { val: 'failed',    label: '❌ Failed' },
            { val: 'created',   label: '⏳ Pending' },
            { val: 'refunded',  label: '↩️ Refunded' },
          ].map(({ val, label }) => (
            <button
              key={val}
              id={`filter-${val || 'all'}`}
              onClick={() => { setFilterStatus(val); setPage(0); }}
              style={{
                padding: '7px 16px', borderRadius: 999, fontSize: 13,
                border: filterStatus === val ? 'none' : `1px solid ${T.border}`,
                background: filterStatus === val ? T.primary : '#fff',
                color: filterStatus === val ? '#fff' : T.muted,
                cursor: 'pointer', fontWeight: filterStatus === val ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Payment cards ─────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: T.muted }}>
            <div style={{
              width: 40, height: 40, border: `3px solid ${T.border}`,
              borderTopColor: T.primary, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
            }} />
            <p style={{ fontSize: 14 }}>Loading payments...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : payments.length === 0 ? (
          <EmptyState onRefresh={fetchPayments} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {payments.map((payment) => {
              const statusCfg = STATUS_CONFIG[payment.status] || STATUS_CONFIG.created;
              const refundCfg = REFUND_CONFIG[payment.refund_status] || REFUND_CONFIG.none;
              const methodIcon = METHOD_ICONS[payment.payment_method] || '💰';
              const canDownload = payment.status === 'captured' || payment.status === 'refunded'
                               || payment.status === 'partially_refunded';
              const isDownloading = downloadingId === payment.payment_id;

              return (
                <div
                  key={payment.payment_id}
                  id={`payment-card-${payment.payment_id}`}
                  style={{
                    background: T.cardBg, border: `1px solid ${T.border}`,
                    borderRadius: 14, padding: '18px 20px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.2s',
                  }}
                >
                  {/* Card top row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                    {/* Icon */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                      background: statusCfg.bg, border: `1px solid ${statusCfg.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20,
                    }}>
                      {methodIcon}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
                          ₹{payment.amount?.toFixed(2)}
                        </span>
                        <StatusBadge status={payment.status} />
                        {payment.refund_status !== 'none' && (
                          <span style={{ fontSize: 11, color: refundCfg.color, fontWeight: 600 }}>
                            {refundCfg.label}
                            {payment.total_refunded_amount > 0 && ` (₹${payment.total_refunded_amount})`}
                          </span>
                        )}
                      </div>

                      {/* Meta info */}
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: T.muted }}>
                          📅 {formatDate(payment.transaction_date || payment.created_at)}
                          {payment.transaction_date && ` · ${formatTime(payment.transaction_date)}`}
                        </span>
                        {payment.payment_method && payment.payment_method !== 'unknown' && (
                          <span style={{ fontSize: 12, color: T.muted }}>
                            {methodIcon} {payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Invoice download button */}
                    {canDownload && (
                      <button
                        id={`download-invoice-${payment.payment_id}`}
                        onClick={() => handleDownloadInvoice(payment.payment_id, payment.invoice_number)}
                        disabled={isDownloading}
                        title="Download Invoice PDF"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px', borderRadius: 999,
                          border: `1px solid ${T.border}`, background: isDownloading ? '#f9fafb' : '#fff',
                          color: T.primary, fontSize: 13, fontWeight: 600,
                          cursor: isDownloading ? 'not-allowed' : 'pointer',
                          flexShrink: 0, opacity: isDownloading ? 0.6 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {isDownloading ? (
                          <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                        ) : (
                          <Download size={14} />
                        )}
                        <span style={{ display: 'none' }}>Invoice</span>
                      </button>
                    )}
                  </div>

                  {/* Expanded details row */}
                  <div style={{
                    marginTop: 14, paddingTop: 14,
                    borderTop: `1px solid ${T.border}`,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10,
                  }}>
                    {payment.invoice_number && (
                      <div>
                        <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Invoice No.</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: 'monospace' }}>{payment.invoice_number}</div>
                      </div>
                    )}
                    {payment.razorpay_payment_id && (
                      <div>
                        <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Transaction ID</div>
                        <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace', wordBreak: 'break-all' }}>{payment.razorpay_payment_id}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Order ID</div>
                      <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace', wordBreak: 'break-all' }}>{payment.razorpay_order_id}</div>
                    </div>
                    {payment.failure_reason && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 10, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Failure Reason</div>
                        <div style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <AlertCircle size={12} /> {payment.failure_reason}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Refund history if any */}
                  {payment.refunds && payment.refunds.length > 0 && (
                    <div style={{
                      marginTop: 12, background: '#eff6ff',
                      borderRadius: 8, padding: '10px 14px',
                      border: '1px solid #bfdbfe',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', marginBottom: 8 }}>↩️ Refund History</div>
                      {payment.refunds.map((refund, idx) => (
                        <div key={idx} style={{ fontSize: 12, color: '#1e40af', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: idx > 0 ? '1px solid #bfdbfe' : 'none' }}>
                          <span>₹{refund.amount} refunded</span>
                          <span style={{ color: '#60a5fa' }}>{formatDate(refund.initiated_at)} · {refund.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 28 }}>
            <button
              id="payment-history-prev"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '8px 20px', borderRadius: 999, border: `1px solid ${T.border}`,
                background: '#fff', color: page === 0 ? T.muted : T.primary,
                cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 13,
                opacity: page === 0 ? 0.5 : 1,
              }}
            >← Prev</button>

            <span style={{ fontSize: 13, color: T.muted }}>
              Page {page + 1} of {totalPages}
            </span>

            <button
              id="payment-history-next"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                padding: '8px 20px', borderRadius: 999, border: `1px solid ${T.border}`,
                background: '#fff', color: page >= totalPages - 1 ? T.muted : T.primary,
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 13,
                opacity: page >= totalPages - 1 ? 0.5 : 1,
              }}
            >Next →</button>
          </div>
        )}

        {/* ── Info banner ───────────────────────────────────────────── */}
        <div style={{
          marginTop: 32, background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: 12, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <FileText size={18} color="#15803d" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 2 }}>
              Invoices & Receipts
            </div>
            <div style={{ fontSize: 12, color: '#166534' }}>
              PDF invoices are available for all completed payments. They include GST details and transaction ID for your records.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
