import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const CATEGORIES = ['all', 'ui', 'backend', 'payment', 'consultation', 'notification', 'experimental', 'other'];
const CATEGORY_ICONS = { ui: '🎨', backend: '⚙️', payment: '💳', consultation: '🩺', notification: '🔔', experimental: '🧪', other: '🏷️' };
const STRATEGIES = ['global', 'role', 'user', 'percent'];

const EMPTY_FORM = {
  key: '', name: '', description: '',
  enabled: false,
  strategy: 'global',
  allowed_roles: [],
  allowed_user_ids: '',
  rollout_percent: 100,
  category: 'other',
};

export default function AdminFeatureFlags({ token }) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingKey, setTogglingKey] = useState(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const params = categoryFilter !== 'all' ? { category: categoryFilter } : {};
      const res = await api(token).get('/feature-flags', { params });
      setFlags(res.data.flags);
    } catch { toast.error('Flags load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token, categoryFilter]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const f = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const toggleRole = (role) => {
    setForm((p) => ({
      ...p,
      allowed_roles: p.allowed_roles.includes(role)
        ? p.allowed_roles.filter((r) => r !== role)
        : [...p.allowed_roles, role],
    }));
  };

  const quickToggle = async (flag) => {
    setTogglingKey(flag.key);
    try {
      await api(token).patch(`/feature-flags/${flag.key}`, { enabled: !flag.enabled });
      toast.success(`"${flag.name}" ${!flag.enabled ? 'enabled' : 'disabled'}`);
      fetchFlags();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Toggle failed');
    } finally { setTogglingKey(null); }
  };

  const openCreate = () => { setForm(EMPTY_FORM); setModal({ mode: 'create' }); };
  const openEdit = (flag) => {
    setForm({
      key: flag.key,
      name: flag.name,
      description: flag.description || '',
      enabled: flag.enabled,
      strategy: flag.strategy,
      allowed_roles: flag.allowed_roles || [],
      allowed_user_ids: (flag.allowed_user_ids || []).join(', '),
      rollout_percent: flag.rollout_percent ?? 100,
      category: flag.category,
    });
    setModal({ mode: 'edit', data: flag });
  };

  const saveFlag = async () => {
    if (!form.key || !form.name) { toast.error('Key aur Name required hai'); return; }
    setSaving(true);
    const payload = {
      ...form,
      allowed_user_ids: form.allowed_user_ids
        ? form.allowed_user_ids.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      rollout_percent: Number(form.rollout_percent),
    };
    try {
      if (modal.mode === 'create') {
        await api(token).post('/feature-flags', payload);
        toast.success('Feature flag create ho gaya');
      } else {
        await api(token).patch(`/feature-flags/${modal.data.key}`, payload);
        toast.success('Feature flag update ho gaya');
      }
      setModal(null);
      fetchFlags();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const deleteFlag = async (flag) => {
    if (!window.confirm(`"${flag.name}" delete karna hai?`)) return;
    try {
      await api(token).delete(`/feature-flags/${flag.key}`);
      toast.success('Flag deleted');
      fetchFlags();
    } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  const filtered = flags.filter((f) =>
    !search || f.key.includes(search.toLowerCase()) || f.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category for display
  const grouped = filtered.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});

  const inp = 'border rounded-xl px-3 py-2 text-sm w-full';

  return (
    <div>
      {/* Summary bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        {CATEGORIES.filter((c) => c !== 'all').map((cat) => {
          const count = flags.filter((f) => f.category === cat).length;
          const onCount = flags.filter((f) => f.category === cat && f.enabled).length;
          return (
            <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? 'all' : cat)}
              className={`rounded-xl border p-3 text-center transition-all ${categoryFilter === cat ? 'border-teal-500 bg-teal-50' : 'bg-white hover:bg-gray-50'}`}>
              <p className="text-xl">{CATEGORY_ICONS[cat]}</p>
              <p className="text-xs font-medium text-gray-700 mt-1 capitalize">{cat}</p>
              <p className="text-xs text-gray-400">{onCount}/{count} on</p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4 justify-between items-center">
        <div className="flex gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flags…" className="border rounded-xl px-3 py-2 text-sm w-52" />
          {categoryFilter !== 'all' && (
            <button onClick={() => setCategoryFilter('all')}
              className="text-xs text-gray-500 border rounded-full px-3 py-1 hover:bg-gray-50">
              ✕ Clear filter
            </button>
          )}
        </div>
        <button onClick={openCreate} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">
          + New Flag
        </button>
      </div>

      {loading && <p className="text-gray-400 text-sm mb-3">Loading…</p>}

      {/* Grouped flag list */}
      {Object.entries(grouped).map(([category, catFlags]) => (
        <div key={category} className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
            {CATEGORY_ICONS[category]} {category}
            <span className="font-normal text-gray-400">({catFlags.length})</span>
          </h3>
          <div className="bg-white rounded-xl border divide-y overflow-hidden">
            {catFlags.map((flag) => (
              <div key={flag.key} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50">
                {/* Toggle switch */}
                <button
                  onClick={() => quickToggle(flag)}
                  disabled={togglingKey === flag.key}
                  className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${flag.enabled ? 'bg-teal-500' : 'bg-gray-300'} ${togglingKey === flag.key ? 'opacity-50' : ''}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${flag.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800 text-sm">{flag.name}</span>
                    {flag.is_system && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">system</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${flag.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {flag.enabled ? 'ON' : 'OFF'}
                    </span>
                    {flag.strategy !== 'global' && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                        {flag.strategy}{flag.strategy === 'percent' ? ` ${flag.rollout_percent}%` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{flag.key}</p>
                  {flag.description && <p className="text-xs text-gray-500 mt-0.5">{flag.description}</p>}
                  {flag.last_toggled_by && (
                    <p className="text-xs text-gray-300 mt-0.5">Last by {flag.last_toggled_by}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(flag)} className="text-teal-600 text-xs hover:underline">Edit</button>
                  {!flag.is_system && (
                    <button onClick={() => deleteFlag(flag)} className="text-red-500 text-xs hover:underline">Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && !loading && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">🏳️</div>
          <p>Koi flag nahi mila</p>
        </div>
      )}

      {/* ══ CREATE / EDIT MODAL ══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">
              {modal.mode === 'create' ? '🏳️ New Feature Flag' : `Edit: ${modal.data?.name}`}
            </h3>

            {modal.mode === 'create' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Key (snake_case)</label>
                <input value={form.key}
                  onChange={(e) => f('key', e.target.value.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  className={inp} placeholder="e.g. new_payment_ui" />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input value={form.name} onChange={(e) => f('name', e.target.value)} className={inp} />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => f('description', e.target.value)}
                className={`${inp} resize-none`} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select value={form.category} onChange={(e) => f('category', e.target.value)} className={inp}>
                  {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                    <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rollout Strategy</label>
                <select value={form.strategy} onChange={(e) => f('strategy', e.target.value)} className={inp}>
                  {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Strategy-specific fields */}
            {form.strategy === 'role' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-2">Allowed Roles</label>
                <div className="flex gap-2">
                  {['patient', 'doctor', 'admin'].map((role) => (
                    <button key={role} onClick={() => toggleRole(role)}
                      className={`px-3 py-1.5 rounded-full text-xs ${form.allowed_roles.includes(role) ? 'bg-teal-600 text-white' : 'border text-gray-500 hover:bg-gray-50'}`}>
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.strategy === 'user' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">User IDs (comma separated)</label>
                <textarea value={form.allowed_user_ids} onChange={(e) => f('allowed_user_ids', e.target.value)}
                  className={`${inp} resize-none`} rows={2} placeholder="user-id-1, user-id-2" />
              </div>
            )}

            {form.strategy === 'percent' && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Rollout Percentage: <strong>{form.rollout_percent}%</strong>
                </label>
                <input type="range" min="0" max="100" value={form.rollout_percent}
                  onChange={(e) => f('rollout_percent', Number(e.target.value))}
                  className="w-full accent-teal-600" />
                <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>50%</span><span>100%</span></div>
              </div>
            )}

            {/* Enabled toggle */}
            <div className="flex items-center gap-3 mb-5 mt-1">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <button onClick={() => f('enabled', true)}
                className={`px-4 py-1.5 rounded-full text-sm ${form.enabled ? 'bg-teal-600 text-white' : 'border text-gray-500 hover:bg-gray-50'}`}>
                ✅ Enabled
              </button>
              <button onClick={() => f('enabled', false)}
                className={`px-4 py-1.5 rounded-full text-sm ${!form.enabled ? 'bg-gray-500 text-white' : 'border text-gray-500 hover:bg-gray-50'}`}>
                ⛔ Disabled
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveFlag} disabled={saving}
                className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700 disabled:opacity-60">
                {saving ? 'Saving…' : modal.mode === 'create' ? 'Create Flag' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
