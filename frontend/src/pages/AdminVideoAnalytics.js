import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const STATUS_COLORS = {
  completed: 'bg-green-100 text-green-700',
  dropped: 'bg-red-100 text-red-600',
  missed: 'bg-yellow-100 text-yellow-700',
  no_show_patient: 'bg-orange-100 text-orange-600',
  no_show_doctor: 'bg-purple-100 text-purple-600',
  technical_error: 'bg-gray-100 text-gray-600',
};

const STATUS_ICONS = {
  completed: '✅', dropped: '📵', missed: '📞',
  no_show_patient: '🚫', no_show_doctor: '👨‍⚕️❌', technical_error: '⚠️',
};

const fmtDuration = (secs) => {
  if (!secs) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}m ${s}s`;
};

export default function AdminVideoAnalytics({ token }) {
  const [subTab, setSubTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState({ logs: [], total: 0, page: 1, pages: 1 });
  const [performance, setPerformance] = useState([]);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(false);

  // Logs filters
  const [logsPage, setLogsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const res = await api(token).get('/admin/video/stats');
      setStats(res.data);
    } catch { toast.error('Stats load nahi hua'); }
  }, [token]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/admin/video/logs', {
        params: { page: logsPage, limit: 20, status: statusFilter, from: fromDate, to: toDate },
      });
      setLogs(res.data);
    } catch { toast.error('Logs load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token, logsPage, statusFilter, fromDate, toDate]);

  const fetchPerformance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/admin/video/doctor-performance');
      setPerformance(res.data.performance);
    } catch { toast.error('Performance load nahi hua'); }
    finally { setLoading(false); }
  }, [token]);

  const fetchTrends = useCallback(async () => {
    try {
      const res = await api(token).get('/admin/video/trends');
      setTrends(res.data.trends);
    } catch {}
  }, [token]);

  useEffect(() => {
    if (subTab === 'overview') { fetchStats(); fetchTrends(); }
    else if (subTab === 'logs') fetchLogs();
    else if (subTab === 'performance') fetchPerformance();
  }, [subTab, fetchStats, fetchLogs, fetchPerformance, fetchTrends]);

  // Simple bar chart renderer
  const maxTrend = Math.max(...trends.map((t) => t.total), 1);

  const StatCard = ({ label, value, sub, color = 'text-gray-800', icon }) => (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex justify-between items-start">
        <div>
          <p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
          <p className="text-xs text-gray-500 mt-1">{label}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
    </div>
  );

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { id: 'overview', label: '📊 Overview' },
          { id: 'logs', label: '📋 Call Logs' },
          { id: 'performance', label: '👨‍⚕️ Doctor Performance' },
        ].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${subTab === t.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {subTab === 'overview' && stats && (
        <div>
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Calls" value={stats.total_calls} icon="📹" color="text-teal-700" />
            <StatCard label="Completed" value={stats.completed} icon="✅" color="text-green-600" />
            <StatCard label="Dropped" value={stats.dropped} icon="📵" color="text-red-500" />
            <StatCard label="Missed / No-show" value={(stats.missed || 0) + (stats.no_show_patient || 0) + (stats.no_show_doctor || 0)} icon="🚫" color="text-orange-500" />
            <StatCard label="Avg Duration" value={`${stats.avg_duration_minutes}m`} icon="⏱️" color="text-blue-600" />
            <StatCard label="Max Duration" value={`${stats.max_duration_minutes}m`} icon="⏰" />
            <StatCard label="Total Hours" value={`${stats.total_hours}h`} icon="📅" color="text-purple-600" />
            <StatCard label="Avg Patient Rating"
              value={stats.avg_patient_rating ? `⭐ ${stats.avg_patient_rating}` : '—'}
              sub={stats.ratings_count ? `${stats.ratings_count} ratings` : null}
              color="text-yellow-600" />
          </div>

          {/* Status breakdown */}
          <div className="bg-white rounded-xl border p-5 mb-5">
            <h3 className="font-semibold text-gray-700 mb-4">Call Status Breakdown</h3>
            <div className="space-y-3">
              {Object.entries(stats.by_status || {}).map(([status, count]) => {
                const pct = stats.total_calls > 0 ? ((count / stats.total_calls) * 100).toFixed(0) : 0;
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <span>{STATUS_ICONS[status] || '📞'}</span>
                        <span className="capitalize">{status.replace(/_/g, ' ')}</span>
                      </span>
                      <span className="font-medium">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${status === 'completed' ? 'bg-green-500' : status === 'dropped' ? 'bg-red-500' : 'bg-orange-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 30-day trend mini chart */}
          {trends.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-700 mb-4">📈 Last 30 Days — Daily Calls</h3>
              <div className="flex items-end gap-1 h-32">
                {trends.map((t) => (
                  <div key={t._id} className="flex-1 flex flex-col items-center gap-0.5" title={`${t._id}: ${t.total} calls`}>
                    <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                      <div
                        className="w-full bg-teal-500 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                        style={{ height: `${(t.total / maxTrend) * 100}%`, minHeight: t.total > 0 ? '4px' : '0' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{trends[0]?._id}</span>
                <span>{trends[trends.length - 1]?._id}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CALL LOGS ── */}
      {subTab === 'logs' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setLogsPage(1); }}
              className="border rounded-xl px-3 py-2 text-sm">
              <option value="">All Status</option>
              {Object.keys(STATUS_COLORS).map((s) => (
                <option key={s} value={s}>{STATUS_ICONS[s]} {s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setLogsPage(1); }}
              className="border rounded-xl px-3 py-2 text-sm" />
            <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setLogsPage(1); }}
              className="border rounded-xl px-3 py-2 text-sm" />
            <button onClick={fetchLogs} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">
              🔍 Apply
            </button>
          </div>

          {loading && <p className="text-gray-400 text-sm mb-3">Loading…</p>}

          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="p-3">Appointment</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Doctor</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Rating</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.logs.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No call logs found</td></tr>
                )}
                {logs.logs.map((log) => (
                  <tr key={log._id} className="border-t hover:bg-gray-50">
                    <td className="p-3 text-xs font-mono text-teal-700">{log.appointment_id?.slice(-8)}</td>
                    <td className="p-3 text-xs">{log.patient_name}</td>
                    <td className="p-3 text-xs">{log.doctor_name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[log.call_status]}`}>
                        {STATUS_ICONS[log.call_status]} {log.call_status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-xs">{fmtDuration(log.duration_seconds)}</td>
                    <td className="p-3 text-xs">
                      {log.patient_rating ? `⭐ ${log.patient_rating}/5` : '—'}
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
            <span>{logs.total} logs</span>
            <div className="flex gap-2">
              <button disabled={logsPage <= 1} onClick={() => setLogsPage((p) => p - 1)}
                className="px-3 py-1 border rounded-full disabled:opacity-40">Prev</button>
              <span className="py-1">Page {logs.page} of {logs.pages}</span>
              <button disabled={logsPage >= logs.pages} onClick={() => setLogsPage((p) => p + 1)}
                className="px-3 py-1 border rounded-full disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DOCTOR PERFORMANCE ── */}
      {subTab === 'performance' && (
        <div>
          {loading && <p className="text-gray-400 text-sm mb-3">Loading…</p>}
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="p-3">Doctor</th>
                  <th className="p-3">Total Calls</th>
                  <th className="p-3">Completed</th>
                  <th className="p-3">Completion %</th>
                  <th className="p-3">Dropped</th>
                  <th className="p-3">No-show</th>
                  <th className="p-3">Avg Duration</th>
                  <th className="p-3">Avg Rating</th>
                </tr>
              </thead>
              <tbody>
                {performance.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">No performance data</td></tr>
                )}
                {performance.map((p) => (
                  <tr key={p._id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-800">{p.doctor_name}</td>
                    <td className="p-3">{p.total_calls}</td>
                    <td className="p-3 text-green-600">{p.completed}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full" style={{ width: `${p.completion_rate}%` }} />
                        </div>
                        <span className="text-xs">{p.completion_rate}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-red-500">{p.dropped}</td>
                    <td className="p-3 text-orange-500">{p.no_show}</td>
                    <td className="p-3 text-xs">{p.avg_duration_min}m</td>
                    <td className="p-3">{p.avg_rating ? `⭐ ${p.avg_rating}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
