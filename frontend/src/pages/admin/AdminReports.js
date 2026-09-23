import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const REPORT_TYPES = [
  { key: 'revenue', label: 'Revenue Report', icon: '💰', desc: 'All completed payment transactions' },
  { key: 'appointments', label: 'Appointment Report', icon: '📅', desc: 'All appointments with status & amount' },
  { key: 'patients', label: 'Patient Report', icon: '👥', desc: 'All registered patients' },
  { key: 'doctors', label: 'Doctor Report', icon: '👨‍⚕️', desc: 'All doctor profiles & verification status' },
  { key: 'refunds', label: 'Refund Report', icon: '↩️', desc: 'All refund transactions' },
];

const FORMATS = [
  { key: 'csv', label: 'CSV', icon: '📄', desc: 'Comma separated — Excel/Sheets compatible' },
  { key: 'excel', label: 'Excel', icon: '📊', desc: '.xlsx formatted with headers' },
  { key: 'pdf', label: 'PDF', icon: '🖨️', desc: 'Printable landscape report' },
];

export default function AdminReports({ token }) {
  const [stats, setStats] = useState(null);
  const [selectedType, setSelectedType] = useState('revenue');
  const [selectedFormat, setSelectedFormat] = useState('excel');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [downloading, setDownloading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api(token).get('/admin/reports/stats');
      setStats(res.data);
    } catch { }
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ type: selectedType, format: selectedFormat });
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      const response = await fetch(`${API}/admin/reports/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Download failed' }));
        throw new Error(err.detail);
      }

      const blob = await response.blob();
      const ext = selectedFormat === 'excel' ? 'xlsx' : selectedFormat;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedType}-report-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(`${selectedType} report download ho gaya!`);
    } catch (err) {
      toast.error(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const quickDateRange = (days) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setFromDate(from.toISOString().slice(0, 10));
    setToDate(to.toISOString().slice(0, 10));
  };

  return (
    <div>
      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Patients', value: stats.total_patients, color: 'text-blue-600', icon: '👥' },
            { label: 'Total Doctors', value: stats.total_doctors, color: 'text-teal-600', icon: '👨‍⚕️' },
            { label: 'Total Appointments', value: stats.total_appointments, color: 'text-purple-600', icon: '📅' },
            { label: 'Total Revenue', value: `₹${(stats.total_revenue || 0).toLocaleString('en-IN')}`, color: 'text-green-600', icon: '💰' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
                <span className="text-3xl">{s.icon}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Report builder */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-800 mb-4">📥 Export Report</h3>

          {/* Report type */}
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Report Type</p>
            <div className="space-y-2">
              {REPORT_TYPES.map((t) => (
                <button key={t.key} onClick={() => setSelectedType(t.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${selectedType === t.key ? 'bg-teal-50 border border-teal-400' : 'border hover:bg-gray-50'}`}>
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <p className={`text-sm font-medium ${selectedType === t.key ? 'text-teal-700' : 'text-gray-700'}`}>{t.label}</p>
                    <p className="text-xs text-gray-400">{t.desc}</p>
                  </div>
                  {selectedType === t.key && <span className="ml-auto text-teal-600">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="mb-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Format</p>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <button key={f.key} onClick={() => setSelectedFormat(f.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all ${selectedFormat === f.key ? 'bg-teal-50 border-teal-400 text-teal-700' : 'hover:bg-gray-50 text-gray-600'}`}>
                  <span className="text-2xl">{f.icon}</span>
                  <span className="text-xs font-medium">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Date Range (optional)</p>
            <div className="flex gap-2 mb-2">
              {[
                { label: 'Today', days: 0 },
                { label: '7 Days', days: 7 },
                { label: '30 Days', days: 30 },
                { label: '90 Days', days: 90 },
              ].map((r) => (
                <button key={r.label} onClick={() => r.days === 0 ? (setFromDate(new Date().toISOString().slice(0,10)), setToDate(new Date().toISOString().slice(0,10))) : quickDateRange(r.days)}
                  className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50 text-gray-600">
                  {r.label}
                </button>
              ))}
              <button onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-xs border rounded-full px-3 py-1 hover:bg-gray-50 text-gray-600">
                All Time
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm" placeholder="From" />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="border rounded-xl px-3 py-2 text-sm" placeholder="To" />
            </div>
          </div>

          <button onClick={downloadReport} disabled={downloading}
            className="w-full bg-teal-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 flex items-center justify-center gap-2">
            {downloading ? (
              <><span className="animate-spin">⏳</span> Generating…</>
            ) : (
              <><span>⬇️</span> Download {FORMATS.find((f) => f.key === selectedFormat)?.label}</>
            )}
          </button>
        </div>

        {/* Quick export panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-700 mb-3">⚡ Quick Exports</h3>
            <p className="text-xs text-gray-400 mb-4">One-click exports with all-time data</p>
            <div className="space-y-2">
              {REPORT_TYPES.map((t) => (
                <div key={t.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span>{t.icon}</span>
                    <span className="text-sm text-gray-700">{t.label}</span>
                  </div>
                  <div className="flex gap-1">
                    {FORMATS.map((f) => (
                      <button key={f.key}
                        onClick={() => { setSelectedType(t.key); setSelectedFormat(f.key); setFromDate(''); setToDate(''); setTimeout(downloadReport, 100); }}
                        className="text-xs border rounded-lg px-2 py-1 hover:bg-gray-50 text-gray-500">
                        {f.icon}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info card */}
          <div className="bg-teal-50 rounded-xl border border-teal-200 p-5">
            <h4 className="font-semibold text-teal-800 mb-2">📋 About Reports</h4>
            <ul className="text-xs text-teal-700 space-y-1.5">
              <li>• <strong>CSV</strong> — Google Sheets / Excel import compatible</li>
              <li>• <strong>Excel (.xlsx)</strong> — Styled with teal headers, ready to share</li>
              <li>• <strong>PDF</strong> — Landscape format, printable</li>
              <li>• Date range filters apply to <code>created_at</code></li>
              <li>• Large exports may take a few seconds to generate</li>
              <li>• All exports are logged in Audit Logs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
