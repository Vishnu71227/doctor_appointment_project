import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const GROUP_META = {
  app: { label: '🏥 Application', icon: '🏥' },
  maintenance: { label: '🔧 Maintenance Mode', icon: '🔧' },
  smtp: { label: '📧 SMTP / Email', icon: '📧' },
  sms: { label: '📱 SMS Gateway', icon: '📱' },
  whatsapp: { label: '💬 WhatsApp API', icon: '💬' },
  payment: { label: '💳 Payment Gateway', icon: '💳' },
  storage: { label: '☁️ Cloud Storage', icon: '☁️' },
};

export default function AdminSystemSettings({ token }) {
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  // Local draft state: { [key]: draftValue }
  const [draft, setDraft] = useState({});
  const [activeGroup, setActiveGroup] = useState('app');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/admin/settings');
      setGrouped(res.data.settings);
      // Initialise draft from current DB values
      const initial = {};
      for (const settings of Object.values(res.data.settings)) {
        for (const s of settings) {
          initial[s.key] = s.is_secret ? '' : s.value; // secrets start blank (user must re-type to change)
        }
      }
      setDraft(initial);
    } catch {
      toast.error('Settings load nahi ho sake');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleChange = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const saveGroup = async (group) => {
    const settings = grouped[group] || [];
    // Only send keys that have a non-empty draft (avoids accidentally clearing secrets)
    const updates = settings
      .filter((s) => draft[s.key] !== undefined)
      .map((s) => ({
        key: s.key,
        value: s.type === 'boolean'
          ? Boolean(draft[s.key])
          : s.type === 'number'
          ? Number(draft[s.key])
          : draft[s.key],
      }))
      // Skip secret fields if still placeholder
      .filter((u) => {
        const meta = settings.find((s) => s.key === u.key);
        if (meta?.is_secret && u.value === '') return false; // unchanged secret
        return true;
      });

    if (updates.length === 0) { toast.info('Koi change nahi tha'); return; }
    setSaving(true);
    try {
      await api(token).patch('/admin/settings', { updates });
      toast.success(`${GROUP_META[group]?.label || group} settings save ho gayi`);
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendSmtpTest = async () => {
    if (!smtpTestEmail) { toast.error('Email address daalo'); return; }
    setTestingSmtp(true);
    try {
      await api(token).post('/admin/settings/test-smtp', { to: smtpTestEmail });
      toast.success('Test email bhej diya gaya!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'SMTP test failed');
    } finally {
      setTestingSmtp(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
        {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl" />)}
      </div>
    );
  }

  const groups = Object.keys(grouped);
  const activeSettings = grouped[activeGroup] || [];

  return (
    <div className="flex gap-6">
      {/* ── Sidebar nav ── */}
      <div className="w-48 shrink-0">
        <div className="bg-white rounded-xl border overflow-hidden">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`w-full text-left px-4 py-3 text-sm border-b last:border-0 transition-colors ${
                activeGroup === g ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {GROUP_META[g]?.icon} {GROUP_META[g]?.label || g}
            </button>
          ))}
        </div>
      </div>

      {/* ── Settings form ── */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-semibold text-gray-800 text-lg">
              {GROUP_META[activeGroup]?.label || activeGroup}
            </h3>
            <button
              onClick={() => saveGroup(activeGroup)}
              disabled={saving}
              className="bg-teal-600 text-white px-5 py-2 rounded-full text-sm hover:bg-teal-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : '💾 Save'}
            </button>
          </div>

          <div className="space-y-5">
            {activeSettings.map((s) => (
              <div key={s.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {s.label}
                  {s.is_secret && <span className="ml-2 text-xs text-amber-500 font-normal">🔒 secret — leave blank to keep unchanged</span>}
                </label>
                {s.description && <p className="text-xs text-gray-400 mb-1">{s.description}</p>}

                {s.type === 'boolean' ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleChange(s.key, true)}
                      className={`px-4 py-1.5 rounded-full text-sm ${draft[s.key] === true || draft[s.key] === 'true' ? 'bg-teal-600 text-white' : 'border text-gray-500 hover:bg-gray-50'}`}
                    >ON</button>
                    <button
                      onClick={() => handleChange(s.key, false)}
                      className={`px-4 py-1.5 rounded-full text-sm ${draft[s.key] === false || draft[s.key] === 'false' || draft[s.key] === '' ? 'bg-red-500 text-white' : 'border text-gray-500 hover:bg-gray-50'}`}
                    >OFF</button>
                  </div>
                ) : s.type === 'select' ? (
                  <select
                    value={draft[s.key] ?? ''}
                    onChange={(e) => handleChange(s.key, e.target.value)}
                    className="border rounded-xl px-4 py-2 text-sm w-full max-w-xs"
                  >
                    {(s.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={s.is_secret ? 'password' : s.type === 'number' ? 'number' : 'text'}
                    placeholder={s.is_secret ? '••••••••' : s.label}
                    value={draft[s.key] ?? ''}
                    onChange={(e) => handleChange(s.key, e.target.value)}
                    className="border rounded-xl px-4 py-2 text-sm w-full max-w-md"
                  />
                )}
              </div>
            ))}
          </div>

          {/* SMTP test section */}
          {activeGroup === 'smtp' && (
            <div className="mt-6 pt-5 border-t">
              <p className="text-sm font-medium text-gray-700 mb-2">📨 SMTP Connection Test</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="test@example.com"
                  value={smtpTestEmail}
                  onChange={(e) => setSmtpTestEmail(e.target.value)}
                  className="border rounded-xl px-4 py-2 text-sm flex-1 max-w-xs"
                />
                <button
                  onClick={sendSmtpTest}
                  disabled={testingSmtp}
                  className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  {testingSmtp ? 'Sending…' : 'Send Test Email'}
                </button>
              </div>
            </div>
          )}

          {/* Maintenance warning banner */}
          {activeGroup === 'maintenance' && (draft['maintenance.enabled'] === true || draft['maintenance.enabled'] === 'true') && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              ⚠️ <strong>Maintenance Mode ON</strong> — Save karne ke baad saare non-admin users ko 503 milega.
              Dhyan se save karo!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
