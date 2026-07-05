import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;

const api = (token) => axios.create({
  baseURL: API,
  headers: { Authorization: `Bearer ${token}` },
});

export default function AdminRBAC({ token }) {
  const [subTab, setSubTab] = useState('roles'); // 'roles' | 'admins' | 'audit'
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [auditLogs, setAuditLogs] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [auditPage, setAuditPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Role create/edit modal state
  const [roleModal, setRoleModal] = useState(null); // { mode: 'create'|'edit', data }
  const [roleForm, setRoleForm] = useState({ key: '', name: '', description: '', permissions: [] });

  // Admin create modal
  const [adminModal, setAdminModal] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: '', full_name: '', password: '', admin_role: 'admin' });

  useEffect(() => {
    if (subTab === 'roles') fetchRoles();
    else if (subTab === 'admins') { fetchAdmins(); if (!roles.length) fetchRoles(); }
    else if (subTab === 'audit') fetchAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, auditPage]);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api(token).get('/admin/rbac/roles'),
        api(token).get('/admin/rbac/permissions'),
      ]);
      setRoles(rolesRes.data.roles);
      setAllPermissions(permsRes.data.permissions);
    } catch { toast.error('Roles load nahi ho sake'); }
    finally { setLoading(false); }
  };

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/admin/rbac/admin-users');
      setAdmins(res.data.admins);
    } catch { toast.error('Admin users load nahi ho sake'); }
    finally { setLoading(false); }
  };

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/admin/rbac/audit-logs', { params: { page: auditPage, limit: 25 } });
      setAuditLogs(res.data);
    } catch { toast.error('Audit logs load nahi ho sake'); }
    finally { setLoading(false); }
  };

  const openCreateRole = () => {
    setRoleForm({ key: '', name: '', description: '', permissions: [] });
    setRoleModal({ mode: 'create' });
  };

  const openEditRole = (role) => {
    setRoleForm({ key: role.key, name: role.name, description: role.description || '', permissions: role.permissions });
    setRoleModal({ mode: 'edit', data: role });
  };

  const togglePermission = (perm) => {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter((p) => p !== perm)
        : [...f.permissions, perm],
    }));
  };

  const saveRole = async () => {
    try {
      if (roleModal.mode === 'create') {
        if (!roleForm.key || !roleForm.name) { toast.error('Key aur Name zaroori hai'); return; }
        await api(token).post('/admin/rbac/roles', roleForm);
        toast.success('Role create ho gaya');
      } else {
        await api(token).patch(`/admin/rbac/roles/${roleModal.data.key}`, {
          name: roleForm.name,
          description: roleForm.description,
          permissions: roleForm.permissions,
        });
        toast.success('Role update ho gaya');
      }
      setRoleModal(null);
      fetchRoles();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Role save nahi hua');
    }
  };

  const deleteRole = async (key) => {
    if (!window.confirm(`Role "${key}" delete karna hai?`)) return;
    try {
      await api(token).delete(`/admin/rbac/roles/${key}`);
      toast.success('Role delete ho gaya');
      fetchRoles();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Role delete nahi hua');
    }
  };

  const createAdmin = async () => {
    if (!adminForm.email || !adminForm.full_name || !adminForm.password) {
      toast.error('Saare fields zaroori hain'); return;
    }
    try {
      await api(token).post('/admin/rbac/admin-users', adminForm);
      toast.success('Admin user create ho gaya');
      setAdminModal(false);
      setAdminForm({ email: '', full_name: '', password: '', admin_role: 'admin' });
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Admin create nahi hua');
    }
  };

  const changeAdminRole = async (userId, newRole) => {
    try {
      await api(token).patch(`/admin/rbac/admin-users/${userId}/role`, { admin_role: newRole });
      toast.success('Role assign ho gaya');
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Role assign nahi hua');
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[
          { id: 'roles', label: 'Roles & Permissions' },
          { id: 'admins', label: 'Admin Users' },
          { id: 'audit', label: 'Audit Logs' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              subTab === t.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-500 text-sm mb-3">Loading...</p>}

      {/* ── ROLES TAB ── */}
      {subTab === 'roles' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={openCreateRole} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">
              + New Role
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {roles.map((role) => (
              <div key={role.key} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-800">{role.name}</h3>
                    <p className="text-xs text-gray-500">{role.key} {role.is_system && '· system'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEditRole(role)} className="text-xs text-teal-600 hover:underline">Edit</button>
                    {!role.is_system && (
                      <button onClick={() => deleteRole(role.key)} className="text-xs text-red-600 hover:underline">Delete</button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-2">{role.description}</p>
                <p className="text-xs text-gray-400 mt-2">{role.permissions.length} permissions</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ADMIN USERS TAB ── */}
      {subTab === 'admins' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setAdminModal(true)} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">
              + New Admin User
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{a.full_name}</td>
                    <td className="p-3">{a.email}</td>
                    <td className="p-3">
                      <select
                        value={a.admin_role || 'admin'}
                        onChange={(e) => changeAdminRole(a.id, e.target.value)}
                        className="border rounded-lg px-2 py-1 text-sm"
                      >
                        {roles.map((r) => (
                          <option key={r.key} value={r.key}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">{a.is_active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AUDIT LOGS TAB ── */}
      {subTab === 'audit' && (
        <div>
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Resource</th>
                  <th className="p-3">IP</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.items.map((log) => (
                  <tr key={log._id} className="border-t">
                    <td className="p-3 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="p-3">{log.user_email || '—'}</td>
                    <td className="p-3">{log.action}</td>
                    <td className="p-3">{log.resource} {log.resource_id ? `#${log.resource_id}` : ''}</td>
                    <td className="p-3">{log.ip_address || '—'}</td>
                    <td className="p-3">{log.status_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center gap-2 mt-3">
            <button
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((p) => p - 1)}
              className="px-3 py-1 rounded-full border text-sm disabled:opacity-40"
            >Prev</button>
            <span className="text-sm text-gray-500">Page {auditLogs.page} of {auditLogs.pages}</span>
            <button
              disabled={auditPage >= auditLogs.pages}
              onClick={() => setAuditPage((p) => p + 1)}
              className="px-3 py-1 rounded-full border text-sm disabled:opacity-40"
            >Next</button>
          </div>
        </div>
      )}

      {/* ── Role Modal ── */}
      {roleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">{roleModal.mode === 'create' ? 'New Role' : `Edit ${roleModal.data.name}`}</h3>
            {roleModal.mode === 'create' && (
              <input
                placeholder="key (e.g. billing_manager)"
                value={roleForm.key}
                onChange={(e) => setRoleForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                className="border rounded-xl px-4 py-2 text-sm w-full mb-3"
              />
            )}
            <input
              placeholder="Display name"
              value={roleForm.name}
              onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
              className="border rounded-xl px-4 py-2 text-sm w-full mb-3"
            />
            <textarea
              placeholder="Description"
              value={roleForm.description}
              onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
              className="border rounded-xl px-4 py-2 text-sm w-full mb-3 resize-none"
              rows={2}
            />
            <p className="text-sm font-medium text-gray-700 mb-2">Permissions</p>
            <div className="grid grid-cols-2 gap-1 mb-4 max-h-60 overflow-y-auto border rounded-xl p-3">
              {allPermissions.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={roleForm.permissions.includes(p)}
                    onChange={() => togglePermission(p)}
                  />
                  {p}
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRoleModal(null)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveRole} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Create Modal ── */}
      {adminModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-4">New Admin User</h3>
            <input placeholder="Full name" value={adminForm.full_name} onChange={(e) => setAdminForm((f) => ({ ...f, full_name: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full mb-3" />
            <input placeholder="Email" value={adminForm.email} onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full mb-3" />
            <input placeholder="Password" type="password" value={adminForm.password} onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full mb-3" />
            <select value={adminForm.admin_role} onChange={(e) => setAdminForm((f) => ({ ...f, admin_role: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full mb-4">
              {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setAdminModal(false)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={createAdmin} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
