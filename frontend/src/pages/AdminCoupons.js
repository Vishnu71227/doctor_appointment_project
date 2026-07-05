import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const EMPTY_FORM = {
  code: '', description: '',
  discount_type: 'percentage', discount_value: '',
  max_discount_amount: '', min_order_amount: '',
  starts_at: '', expires_at: '',
  max_uses: '', max_uses_per_user: '1',
  applicable_to: 'all',
  is_active: true,
};

const StatusBadge = ({ coupon }) => {
  const now = new Date();
  const expired = coupon.expires_at && new Date(coupon.expires_at) < now;
  const notStarted = coupon.starts_at && new Date(coupon.starts_at) > now;
  const limitReached = coupon.max_uses !== null && coupon.total_uses >= coupon.max_uses;

  if (!coupon.is_active) return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Inactive</span>;
  if (expired) return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">Expired</span>;
  if (notStarted) return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-600">Upcoming</span>;
  if (limitReached) return <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-600">Limit Reached</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Active</span>;
};

export default function AdminCoupons({ token }) {
  const [subTab, setSubTab] = useState('list');
  const [coupons, setCoupons] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal
  const [modal, setModal] = useState(null); // null | { mode: 'create'|'edit', data? }
  const [form, setForm] = useState(EMPTY_FORM);

  // Usage report modal
  const [reportModal, setReportModal] = useState(null); // { coupon, data }

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/coupons', { params: { page, limit: 15, search, status: statusFilter } });
      setCoupons(res.data.coupons);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch { toast.error('Coupons load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token, page, search, statusFilter]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await api(token).get('/coupons/analytics');
      setAnalytics(res.data);
    } catch { toast.error('Analytics load nahi hui'); }
  }, [token]);

  useEffect(() => {
    if (subTab === 'list') fetchCoupons();
    else if (subTab === 'analytics') fetchAnalytics();
  }, [subTab, fetchCoupons, fetchAnalytics]);

  const f = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const openCreate = () => { setForm(EMPTY_FORM); setModal({ mode: 'create' }); };
  const openEdit = (c) => {
    setForm({
      code: c.code, description: c.description || '',
      discount_type: c.discount_type, discount_value: c.discount_value,
      max_discount_amount: c.max_discount_amount ?? '',
      min_order_amount: c.min_order_amount ?? '',
      starts_at: c.starts_at ? c.starts_at.slice(0, 10) : '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 10) : '',
      max_uses: c.max_uses ?? '',
      max_uses_per_user: c.max_uses_per_user ?? 1,
      applicable_to: c.applicable_to,
      is_active: c.is_active,
    });
    setModal({ mode: 'edit', data: c });
  };

  const saveCoupon = async () => {
    if (!form.code || !form.discount_value) { toast.error('Code aur discount value required hai'); return; }
    const payload = {
      ...form,
      discount_value: Number(form.discount_value),
      max_discount_amount: form.max_discount_amount !== '' ? Number(form.max_discount_amount) : null,
      min_order_amount: form.min_order_amount !== '' ? Number(form.min_order_amount) : 0,
      max_uses: form.max_uses !== '' ? Number(form.max_uses) : null,
      max_uses_per_user: Number(form.max_uses_per_user),
      expires_at: form.expires_at || null,
      starts_at: form.starts_at || new Date().toISOString(),
    };
    try {
      if (modal.mode === 'create') {
        await api(token).post('/coupons', payload);
        toast.success('Coupon create ho gaya!');
      } else {
        await api(token).patch(`/coupons/${modal.data._id}`, payload);
        toast.success('Coupon update ho gaya!');
      }
      setModal(null);
      fetchCoupons();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
  };

  const toggleActive = async (c) => {
    try {
      await api(token).patch(`/coupons/${c._id}`, { is_active: !c.is_active });
      toast.success(`Coupon ${!c.is_active ? 'activated' : 'deactivated'}`);
      fetchCoupons();
    } catch (err) { toast.error(err.response?.data?.detail || 'Update failed'); }
  };

  const deleteCoupon = async (c) => {
    if (!window.confirm(`"${c.code}" delete karna hai?`)) return;
    try {
      await api(token).delete(`/coupons/${c._id}`);
      toast.success('Coupon deleted');
      fetchCoupons();
    } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  const openReport = async (c) => {
    try {
      const res = await api(token).get(`/coupons/${c._id}/report`);
      setReportModal({ coupon: c, data: res.data });
    } catch { toast.error('Report load nahi hua'); }
  };

  const I = ({ label, children }) => (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
  const inp = "border rounded-xl px-3 py-2 text-sm w-full";

  return (
    <div>
      {/* Sub tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: 'list', label: '🎟️ Coupons' }, { id: 'analytics', label: '📊 Analytics' }].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${subTab === t.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {subTab === 'list' && (
        <div>
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 mb-4 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by code..."
                className="border rounded-xl px-4 py-2 text-sm w-48"
              />
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="border rounded-xl px-3 py-2 text-sm">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">
              + New Coupon
            </button>
          </div>

          {loading && <p className="text-gray-400 text-sm mb-3">Loading…</p>}

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Discount</th>
                  <th className="p-3">Min Amt</th>
                  <th className="p-3">Uses</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No coupons found</td></tr>
                )}
                {coupons.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="p-3">
                      <span className="font-mono font-semibold text-teal-700">{c.code}</span>
                      {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                    </td>
                    <td className="p-3">
                      {c.discount_type === 'percentage'
                        ? `${c.discount_value}%${c.max_discount_amount ? ` (max ₹${c.max_discount_amount})` : ''}`
                        : `₹${c.discount_value}`}
                    </td>
                    <td className="p-3">{c.min_order_amount ? `₹${c.min_order_amount}` : '—'}</td>
                    <td className="p-3">{c.total_uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                    <td className="p-3">{c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN') : 'Never'}</td>
                    <td className="p-3"><StatusBadge coupon={c} /></td>
                    <td className="p-3">
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => openEdit(c)} className="text-teal-600 text-xs hover:underline">Edit</button>
                        <button onClick={() => toggleActive(c)} className="text-yellow-600 text-xs hover:underline">
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => openReport(c)} className="text-blue-600 text-xs hover:underline">Report</button>
                        <button onClick={() => deleteCoupon(c)} className="text-red-500 text-xs hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
            <span>{total} coupons total</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border rounded-full disabled:opacity-40">Prev</button>
              <span className="py-1">Page {page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded-full disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {subTab === 'analytics' && analytics && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total Coupons', value: analytics.summary.total_coupons, color: 'text-gray-800' },
              { label: 'Active', value: analytics.summary.active_coupons, color: 'text-green-600' },
              { label: 'Expired', value: analytics.summary.expired_coupons, color: 'text-red-500' },
              { label: 'Total Uses', value: analytics.summary.total_usages, color: 'text-blue-600' },
              { label: 'Discount Given', value: `₹${analytics.summary.total_discount_given?.toFixed(0)}`, color: 'text-orange-500' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-700 mb-3">🏆 Top Coupons by Usage</h3>
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-left">
                <tr><th className="pb-2">Code</th><th className="pb-2">Type</th><th className="pb-2">Discount</th><th className="pb-2">Total Uses</th><th className="pb-2">Status</th></tr>
              </thead>
              <tbody>
                {analytics.top_coupons.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="py-2 font-mono font-semibold text-teal-700">{c.code}</td>
                    <td className="py-2">{c.discount_type}</td>
                    <td className="py-2">{c.discount_type === 'percentage' ? `${c.discount_value}%` : `₹${c.discount_value}`}</td>
                    <td className="py-2">{c.total_uses}</td>
                    <td className="py-2"><StatusBadge coupon={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ CREATE / EDIT MODAL ══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">{modal.mode === 'create' ? '🎟️ New Coupon' : `Edit ${modal.data?.code}`}</h3>

            <div className="grid grid-cols-2 gap-3">
              <I label="Code (e.g. SAVE20)">
                <input value={form.code} onChange={(e) => f('code', e.target.value.toUpperCase())}
                  className={inp} placeholder="HEALTHLINE20" disabled={modal.mode === 'edit'} />
              </I>
              <I label="Discount Type">
                <select value={form.discount_type} onChange={(e) => f('discount_type', e.target.value)} className={inp}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat (₹)</option>
                </select>
              </I>
              <I label={form.discount_type === 'percentage' ? 'Discount %' : 'Discount ₹'}>
                <input type="number" value={form.discount_value} onChange={(e) => f('discount_value', e.target.value)} className={inp} min="0" />
              </I>
              {form.discount_type === 'percentage' && (
                <I label="Max Discount ₹ (optional cap)">
                  <input type="number" value={form.max_discount_amount} onChange={(e) => f('max_discount_amount', e.target.value)} className={inp} placeholder="e.g. 200" />
                </I>
              )}
              <I label="Min Order Amount ₹">
                <input type="number" value={form.min_order_amount} onChange={(e) => f('min_order_amount', e.target.value)} className={inp} placeholder="0" />
              </I>
              <I label="Max Uses Per User">
                <input type="number" value={form.max_uses_per_user} onChange={(e) => f('max_uses_per_user', e.target.value)} className={inp} min="1" />
              </I>
              <I label="Total Usage Limit (blank = unlimited)">
                <input type="number" value={form.max_uses} onChange={(e) => f('max_uses', e.target.value)} className={inp} placeholder="Unlimited" />
              </I>
              <I label="Applicable To">
                <select value={form.applicable_to} onChange={(e) => f('applicable_to', e.target.value)} className={inp}>
                  <option value="all">All Users</option>
                  <option value="new_users">New Users Only</option>
                  <option value="specific_users">Specific Users</option>
                  <option value="specific_doctors">Specific Doctors</option>
                </select>
              </I>
              <I label="Starts At">
                <input type="date" value={form.starts_at} onChange={(e) => f('starts_at', e.target.value)} className={inp} />
              </I>
              <I label="Expires At (blank = never)">
                <input type="date" value={form.expires_at} onChange={(e) => f('expires_at', e.target.value)} className={inp} />
              </I>
            </div>

            <I label="Description (optional)">
              <input value={form.description} onChange={(e) => f('description', e.target.value)} className={inp} placeholder="20% off on all consultations" />
            </I>

            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <button onClick={() => f('is_active', true)} className={`px-3 py-1 rounded-full text-xs ${form.is_active ? 'bg-green-600 text-white' : 'border text-gray-500'}`}>Active</button>
              <button onClick={() => f('is_active', false)} className={`px-3 py-1 rounded-full text-xs ${!form.is_active ? 'bg-gray-500 text-white' : 'border text-gray-500'}`}>Inactive</button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveCoupon} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700">
                {modal.mode === 'create' ? 'Create Coupon' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ USAGE REPORT MODAL ══ */}
      {reportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">📊 {reportModal.coupon.code} — Usage Report</h3>
              <button onClick={() => setReportModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-teal-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-teal-700">{reportModal.data.total_uses}</p>
                <p className="text-xs text-teal-600">Total Uses</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-orange-600">₹{reportModal.data.total_discount?.toFixed(0)}</p>
                <p className="text-xs text-orange-500">Total Discount Given</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr><th className="p-2">User</th><th className="p-2">Discount</th><th className="p-2">Final Amt</th><th className="p-2">Used At</th></tr>
                </thead>
                <tbody>
                  {reportModal.data.usages.slice(0, 50).map((u) => (
                    <tr key={u._id} className="border-t">
                      <td className="p-2 text-gray-600">{u.user_id}</td>
                      <td className="p-2 text-red-600">-₹{u.discount_given}</td>
                      <td className="p-2">₹{u.final_amount}</td>
                      <td className="p-2">{new Date(u.used_at).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
