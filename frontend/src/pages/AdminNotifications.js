import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-500',
  scheduled: 'bg-blue-100 text-blue-600',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
};

const CHANNELS = ['email', 'sms', 'whatsapp', 'in_app'];
const CHANNEL_ICONS = { email: '📧', sms: '📱', whatsapp: '💬', in_app: '🔔' };

const EMPTY_FORM = {
  title: '', message: '',
  channels: ['in_app'],
  target_type: 'broadcast',
  target_role: 'all',
  target_user_ids: '',
  scheduled_at: '',
};

export default function AdminNotifications({ token }) {
  const [subTab, setSubTab] = useState('campaigns');
  const [notifications, setNotifications] = useState([]);
  const [history, setHistory] = useState({ logs: [], total: 0, page: 1, pages: 1 });
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Create/edit modal
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // History pagination
  const [histPage, setHistPage] = useState(1);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/admin/notifications', { params: { page, limit: 15, status: statusFilter } });
      setNotifications(res.data.notifications);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch { toast.error('Notifications load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token, page, statusFilter]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/admin/notifications/history', { params: { page: histPage, limit: 25 } });
      setHistory(res.data);
    } catch { toast.error('History load nahi hui'); }
    finally { setLoading(false); }
  }, [token, histPage]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api(token).get('/admin/notifications/stats');
      setStats(res.data);
    } catch {}
  }, [token]);

  useEffect(() => {
    if (subTab === 'campaigns') { fetchNotifications(); fetchStats(); }
    else if (subTab === 'history') fetchHistory();
  }, [subTab, fetchNotifications, fetchHistory, fetchStats]);

  const f = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const toggleChannel = (ch) => {
    setForm((p) => ({
      ...p,
      channels: p.channels.includes(ch) ? p.channels.filter((c) => c !== ch) : [...p.channels, ch],
    }));
  };

  const openCreate = () => { setForm(EMPTY_FORM); setModal({ mode: 'create' }); };
  const openEdit = (n) => {
    setForm({
      title: n.title, message: n.message,
      channels: n.channels,
      target_type: n.target_type,
      target_role: n.target_role || 'all',
      target_user_ids: (n.target_user_ids || []).join(', '),
      scheduled_at: n.scheduled_at ? n.scheduled_at.slice(0, 16) : '',
    });
    setModal({ mode: 'edit', data: n });
  };

  const saveNotification = async () => {
    if (!form.title || !form.message) { toast.error('Title aur message required hai'); return; }
    if (!form.channels.length) { toast.error('Koi channel select karo'); return; }
    setSaving(true);
    const payload = {
      ...form,
      target_user_ids: form.target_user_ids
        ? form.target_user_ids.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      scheduled_at: form.scheduled_at || null,
    };
    try {
      if (modal.mode === 'create') {
        await api(token).post('/admin/notifications', payload);
        toast.success('Notification draft create ho gaya');
      } else {
        await api(token).patch(`/admin/notifications/${modal.data._id}`, payload);
        toast.success('Notification update ho gaya');
      }
      setModal(null);
      fetchNotifications();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const sendNow = async (n) => {
    if (!window.confirm(`"${n.title}" — send karna hai sabko?`)) return;
    try {
      await api(token).post(`/admin/notifications/${n._id}/send`);
      toast.success('Sending shuru ho gaya! Thodi der mein delivered ho jayega.');
      setTimeout(fetchNotifications, 2000);
    } catch (err) { toast.error(err.response?.data?.detail || 'Send failed'); }
  };

  const deleteNotif = async (n) => {
    if (!window.confirm('Delete karna hai?')) return;
    try {
      await api(token).delete(`/admin/notifications/${n._id}`);
      toast.success('Deleted');
      fetchNotifications();
    } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  const inp = 'border rounded-xl px-3 py-2 text-sm w-full';

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: 'campaigns', label: '📣 Campaigns' }, { id: 'history', label: '📜 Delivery History' }].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${subTab === t.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CAMPAIGNS TAB ── */}
      {subTab === 'campaigns' && (
        <div>
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Campaigns', value: Object.values(stats.campaigns).reduce((a, b) => a + (b.count || 0), 0), color: 'text-gray-700' },
                { label: 'Sent', value: stats.campaigns?.sent?.count || 0, color: 'text-green-600' },
                { label: 'Total Delivered', value: Object.values(stats.campaigns).reduce((a, b) => a + (b.sent || 0), 0), color: 'text-teal-600' },
                { label: 'Failed', value: Object.values(stats.campaigns).reduce((a, b) => a + (b.failed || 0), 0), color: 'text-red-500' },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 mb-4 justify-between items-center">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border rounded-xl px-3 py-2 text-sm">
              <option value="">All Status</option>
              {['draft', 'scheduled', 'sending', 'sent', 'failed'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">
              + New Notification
            </button>
          </div>

          {loading && <p className="text-gray-400 text-sm mb-3">Loading…</p>}

          {/* Campaign cards */}
          <div className="space-y-3">
            {notifications.length === 0 && (
              <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
                <div className="text-4xl mb-3">🔔</div>
                <p>Koi notification nahi mili</p>
              </div>
            )}
            {notifications.map((n) => (
              <div key={n._id} className="bg-white rounded-xl border p-5">
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-semibold text-gray-800">{n.title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[n.status]}`}>{n.status}</span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{n.message}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {n.channels.map((ch) => (
                        <span key={ch} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                          {CHANNEL_ICONS[ch]} {ch}
                        </span>
                      ))}
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {n.target_type === 'broadcast' ? '📢 All Users' : n.target_type === 'role_based' ? `👥 ${n.target_role}` : `🎯 ${n.target_user_ids?.length} users`}
                      </span>
                    </div>
                    {n.status === 'sent' && (
                      <p className="text-xs text-gray-400 mt-1">
                        ✅ {n.sent_count} sent · ❌ {n.failed_count} failed · {n.total_recipients} total
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap items-start">
                    {['draft', 'scheduled', 'failed'].includes(n.status) && (
                      <button onClick={() => openEdit(n)} className="text-xs text-teal-600 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50">Edit</button>
                    )}
                    {['draft', 'scheduled', 'failed'].includes(n.status) && (
                      <button onClick={() => sendNow(n)} className="text-xs text-white bg-teal-600 rounded-lg px-3 py-1.5 hover:bg-teal-700">
                        ▶ Send Now
                      </button>
                    )}
                    {['draft', 'scheduled'].includes(n.status) && (
                      <button onClick={() => deleteNotif(n)} className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50">Delete</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>{total} campaigns</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded-full disabled:opacity-40">Prev</button>
              <span className="py-1">Page {page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded-full disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {subTab === 'history' && (
        <div>
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Channel</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Recipient</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.logs.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">No delivery logs</td></tr>
                )}
                {history.logs.map((log) => (
                  <tr key={log._id} className="border-t">
                    <td className="p-3 text-xs text-gray-500">{log.user_id || '—'}</td>
                    <td className="p-3">{CHANNEL_ICONS[log.channel] || '📨'} {log.channel}</td>
                    <td className="p-3 text-xs">{log.type}</td>
                    <td className="p-3 text-xs truncate max-w-xs">{log.recipient}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${log.status === 'sent' ? 'bg-green-100 text-green-700' : log.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-400">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
            <span>{history.total} logs</span>
            <div className="flex gap-2">
              <button disabled={histPage <= 1} onClick={() => setHistPage((p) => p - 1)} className="px-3 py-1 border rounded-full disabled:opacity-40">Prev</button>
              <span className="py-1">Page {history.page} of {history.pages}</span>
              <button disabled={histPage >= history.pages} onClick={() => setHistPage((p) => p + 1)} className="px-3 py-1 border rounded-full disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CREATE / EDIT MODAL ══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">
              {modal.mode === 'create' ? '🔔 New Notification' : 'Edit Notification'}
            </h3>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input value={form.title} onChange={(e) => f('title', e.target.value)} className={inp} placeholder="e.g. New Doctor Available" />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
              <textarea value={form.message} onChange={(e) => f('message', e.target.value)} className={`${inp} resize-none`} rows={4} placeholder="Notification content…" />
            </div>

            {/* Channels */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-2">Channels</label>
              <div className="flex gap-2 flex-wrap">
                {CHANNELS.map((ch) => (
                  <button key={ch} onClick={() => toggleChannel(ch)}
                    className={`px-3 py-1.5 rounded-full text-sm ${form.channels.includes(ch) ? 'bg-teal-600 text-white' : 'border text-gray-500 hover:bg-gray-50'}`}>
                    {CHANNEL_ICONS[ch]} {ch}
                  </button>
                ))}
              </div>
            </div>

            {/* Target */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Target Type</label>
              <select value={form.target_type} onChange={(e) => f('target_type', e.target.value)} className={inp}>
                <option value="broadcast">📢 Broadcast (All Users)</option>
                <option value="role_based">👥 Role Based</option>
                <option value="targeted">🎯 Specific Users</option>
              </select>
            </div>

            {form.target_type === 'role_based' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Target Role</label>
                <select value={form.target_role} onChange={(e) => f('target_role', e.target.value)} className={inp}>
                  <option value="all">All</option>
                  <option value="patient">Patients</option>
                  <option value="doctor">Doctors</option>
                </select>
              </div>
            )}

            {form.target_type === 'targeted' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">User IDs (comma separated)</label>
                <textarea value={form.target_user_ids} onChange={(e) => f('target_user_ids', e.target.value)}
                  className={`${inp} resize-none`} rows={2} placeholder="user-id-1, user-id-2, …" />
              </div>
            )}

            {/* Schedule */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">Schedule (optional — blank = send immediately)</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={(e) => f('scheduled_at', e.target.value)} className={inp} />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveNotification} disabled={saving}
                className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700 disabled:opacity-60">
                {saving ? 'Saving…' : modal.mode === 'create' ? 'Save Draft' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
