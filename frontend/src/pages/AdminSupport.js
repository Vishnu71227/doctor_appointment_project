import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-700',
};
const STATUS_COLORS = {
  open: 'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting_user: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-gray-100 text-gray-500',
  closed: 'bg-gray-200 text-gray-400',
};

const Badge = ({ label, colorMap }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[label] || 'bg-gray-100 text-gray-500'}`}>
    {label?.replace('_', ' ')}
  </span>
);

export default function AdminSupport({ token }) {
  const [subTab, setSubTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [search, setSearch] = useState('');

  // Detail modal
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/support/admin/tickets', {
        params: { page, limit: 15, status: statusFilter, priority: priorityFilter, assigned_to: assignedFilter, search },
      });
      setTickets(res.data.tickets);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch { toast.error('Tickets load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token, page, statusFilter, priorityFilter, assignedFilter, search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api(token).get('/support/admin/stats');
      setStats(res.data);
    } catch { toast.error('Stats load nahi hui'); }
  }, [token]);

  useEffect(() => {
    if (subTab === 'tickets') { fetchTickets(); fetchStats(); }
  }, [subTab, fetchTickets, fetchStats]);

  const openTicket = async (t) => {
    try {
      const res = await api(token).get(`/support/admin/tickets/${t.ticket_id}`);
      setSelected(res.data.ticket);
      setReplyText('');
    } catch { toast.error('Ticket load nahi hua'); }
  };

  const sendReply = async () => {
    if (!replyText.trim()) { toast.error('Reply khali nahi ho sakti'); return; }
    setReplying(true);
    try {
      const res = await api(token).post(`/support/admin/tickets/${selected.ticket_id}/reply`, { message: replyText });
      setSelected(res.data.ticket);
      setReplyText('');
      toast.success('Reply bhej diya');
      fetchTickets();
    } catch (err) { toast.error(err.response?.data?.detail || 'Reply failed'); }
    finally { setReplying(false); }
  };

  const updateStatus = async (status) => {
    try {
      const res = await api(token).patch(`/support/admin/tickets/${selected.ticket_id}`, { status });
      setSelected(res.data.ticket);
      toast.success(`Status: ${status}`);
      fetchTickets();
    } catch (err) { toast.error(err.response?.data?.detail || 'Update failed'); }
  };

  const updatePriority = async (priority) => {
    try {
      const res = await api(token).patch(`/support/admin/tickets/${selected.ticket_id}`, { priority });
      setSelected(res.data.ticket);
      toast.success(`Priority: ${priority}`);
      fetchTickets();
    } catch (err) { toast.error(err.response?.data?.detail || 'Update failed'); }
  };

  const assignToMe = async () => {
    try {
      const res = await api(token).patch(`/support/admin/tickets/${selected.ticket_id}`, {
        assigned_to: 'me', assigned_email: 'me',
        status: selected.status === 'open' ? 'in_progress' : selected.status,
      });
      setSelected(res.data.ticket);
      toast.success('Ticket assign ho gaya');
      fetchTickets();
    } catch (err) { toast.error(err.response?.data?.detail || 'Assign failed'); }
  };

  const escalate = async () => {
    try {
      const res = await api(token).post(`/support/admin/tickets/${selected.ticket_id}/escalate`);
      setSelected(res.data.ticket);
      toast.success('Ticket escalate ho gaya');
      fetchTickets();
    } catch (err) { toast.error(err.response?.data?.detail || 'Escalate failed'); }
  };

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: 'tickets', label: '🎫 All Tickets' }].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${subTab === t.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
          {[
            { label: 'Open', value: stats.by_status?.open || 0, color: 'text-green-600' },
            { label: 'In Progress', value: stats.by_status?.in_progress || 0, color: 'text-blue-600' },
            { label: 'Waiting User', value: stats.by_status?.waiting_user || 0, color: 'text-yellow-600' },
            { label: 'Resolved', value: stats.by_status?.resolved || 0, color: 'text-gray-500' },
            { label: 'Urgent', value: stats.by_priority?.urgent || 0, color: 'text-red-600' },
            { label: 'Avg Resolution', value: stats.avg_resolution_hours ? `${stats.avg_resolution_hours}h` : '—', color: 'text-teal-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search ticket / email..." className="border rounded-xl px-3 py-2 text-sm w-52" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="border rounded-xl px-3 py-2 text-sm">
          <option value="">All Status</option>
          {['open', 'in_progress', 'waiting_user', 'resolved', 'closed'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} className="border rounded-xl px-3 py-2 text-sm">
          <option value="">All Priority</option>
          {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={assignedFilter} onChange={(e) => { setAssignedFilter(e.target.value); setPage(1); }} className="border rounded-xl px-3 py-2 text-sm">
          <option value="">All Tickets</option>
          <option value="me">Assigned to Me</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>

      {loading && <p className="text-gray-400 text-sm mb-3">Loading…</p>}

      {/* Ticket table */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="p-3">Ticket ID</th>
              <th className="p-3">Subject</th>
              <th className="p-3">User</th>
              <th className="p-3">Category</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-gray-400">No tickets found</td></tr>
            )}
            {tickets.map((t) => (
              <tr key={t._id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono text-xs text-teal-700">{t.ticket_id}</td>
                <td className="p-3 max-w-xs truncate">{t.subject}</td>
                <td className="p-3 text-gray-500 text-xs">{t.user_email}</td>
                <td className="p-3">
                  <span className="bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded-full">{t.category}</span>
                </td>
                <td className="p-3"><Badge label={t.priority} colorMap={PRIORITY_COLORS} /></td>
                <td className="p-3"><Badge label={t.status} colorMap={STATUS_COLORS} /></td>
                <td className="p-3 text-xs text-gray-400">{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                <td className="p-3">
                  <button onClick={() => openTicket(t)} className="text-teal-600 text-xs hover:underline font-medium">Open →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
        <span>{total} tickets</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded-full disabled:opacity-40">Prev</button>
          <span className="py-1">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded-full disabled:opacity-40">Next</button>
        </div>
      </div>

      {/* ══ TICKET DETAIL MODAL ══ */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-5 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-800">{selected.subject}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{selected.ticket_id} · {selected.user_email}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl ml-4">×</button>
              </div>

              {/* Control bar */}
              <div className="flex flex-wrap gap-2 mt-3">
                {/* Status */}
                <select value={selected.status} onChange={(e) => updateStatus(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-xs">
                  {['open', 'in_progress', 'waiting_user', 'resolved', 'closed'].map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
                {/* Priority */}
                <select value={selected.priority} onChange={(e) => updatePriority(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-xs">
                  {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button onClick={assignToMe} className="border rounded-lg px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Assign to Me</button>
                <button onClick={escalate} className="border rounded-lg px-2 py-1 text-xs text-orange-600 hover:bg-orange-50">⬆️ Escalate</button>
              </div>
            </div>

            {/* Thread */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Original description */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex gap-2 items-center mb-2">
                  <span className="text-xs font-medium text-gray-700">{selected.user_name || selected.user_email}</span>
                  <span className="text-xs text-gray-400">· {new Date(selected.created_at).toLocaleString('en-IN')}</span>
                  <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded">User</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.description}</p>
              </div>

              {/* Replies */}
              {selected.replies?.map((r, i) => (
                <div key={i} className={`rounded-xl p-4 ${r.sender_role === 'admin' ? 'bg-teal-50 ml-6' : 'bg-gray-50 mr-6'}`}>
                  <div className="flex gap-2 items-center mb-2">
                    <span className="text-xs font-medium text-gray-700">{r.sender_name || r.sender_email}</span>
                    <span className="text-xs text-gray-400">· {new Date(r.created_at).toLocaleString('en-IN')}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.sender_role === 'admin' ? 'bg-teal-200 text-teal-700' : 'bg-gray-200 text-gray-600'}`}>
                      {r.sender_role === 'admin' ? 'Support' : 'User'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.message}</p>
                </div>
              ))}
            </div>

            {/* Reply box */}
            {!['resolved', 'closed'].includes(selected.status) && (
              <div className="p-5 border-t">
                <textarea
                  rows={3}
                  placeholder="Apna reply likho…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="border rounded-xl px-4 py-2 text-sm w-full resize-none mb-2"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { updateStatus('resolved'); setSelected(null); }}
                    className="border rounded-xl px-4 py-2 text-sm text-green-600 hover:bg-green-50">
                    ✅ Mark Resolved
                  </button>
                  <button onClick={sendReply} disabled={replying}
                    className="bg-teal-600 text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-teal-700 disabled:opacity-60">
                    {replying ? 'Sending…' : 'Send Reply'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
