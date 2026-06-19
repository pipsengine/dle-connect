'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Ban, KeyRound, Lock, RefreshCcw, Search, ShieldCheck, Unlock, UserCog } from 'lucide-react';

type UserAccount = {
  id: string;
  username: string;
  employeeCode: string;
  fullName: string;
  email: string;
  department: string;
  unit: string;
  jobTitle: string;
  grade: string;
  location: string;
  employmentStatus: string;
  reportingManager: string;
  status: string;
  roles: string[];
  departmentAccess: string[];
  moduleAccess: string[];
  firstLoginRequired: boolean;
  passwordResetRequired: boolean;
  failedAttempts: number;
  lastLoginAt: string | null;
};

type LoginHistory = { id: string; username: string; at: string; ipAddress: string; device: string; status: string; reason?: string };

export default function UserManagementClient({ section = 'user-accounts' }: { section?: string }) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [history, setHistory] = useState<LoginHistory[]>([]);
  const [roles, setRoles] = useState<Array<{ name: string; category: string }>>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

  const load = async (sync = false) => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, currentUserRes] = await Promise.all([
        fetch(`/api/admin/users${sync ? '?sync=1' : ''}`, { cache: 'no-store' }),
        fetch('/api/admin/roles', { cache: 'no-store' }),
        fetch('/api/current-user?context=enterprise', { cache: 'no-store' }),
      ]);
      const usersJson = await usersRes.json();
      const rolesJson = await rolesRes.json();
      const currentUserJson = await currentUserRes.json().catch(() => null);
      if (!usersRes.ok) throw new Error(usersJson.error || 'Unable to load users');
      setUsers(usersJson.data.users || []);
      setHistory(usersJson.data.loginHistory || []);
      setRoles(rolesRes.ok ? rolesJson.data || [] : []);
      setIsGlobalAdmin(currentUserJson?.data?.source === 'application-level-global-admin' || currentUserJson?.data?.employeeCode === 'Admin');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return users.filter((user) => !q || [user.username, user.employeeCode, user.fullName, user.email, user.department, user.jobTitle, user.status, user.roles.join(' ')].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [query, users]);

  const activeUser = users.find((user) => user.id === selected) || filtered[0];
  const assignableRoles = useMemo(() => roles.filter((role) => isGlobalAdmin || role.name !== 'Super Administrator'), [roles, isGlobalAdmin]);

  useEffect(() => {
    if (activeUser) setSelectedRoles(activeUser.roles || []);
  }, [activeUser?.id]);

  const mutate = async (userId: string, action: string, extra: Record<string, unknown> = {}) => {
    setToast('');
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      setToast(json.error || 'Action failed');
      return;
    }
    setToast(`${action.replace(/-/g, ' ')} completed`);
    await load();
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white"><UserCog className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black text-slate-950">User Administration</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">Employee-linked accounts, account status, role assignment, login history, and security controls.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          <button onClick={() => void load(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Sync Employee Directory</button>
        </div>
      </div>

      {toast ? <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{toast}</div> : null}

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Total Users', users.length],
          ['Active', users.filter((u) => u.status === 'Active').length],
          ['First Login', users.filter((u) => u.status === 'Pending First Login' || u.firstLoginRequired).length],
          ['Locked', users.filter((u) => u.status === 'Locked').length],
          ['Disabled', users.filter((u) => u.status === 'Disabled').length],
          ['Password Reset', users.filter((u) => u.passwordResetRequired).length],
        ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{String(value)}</p></div>)}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users, employee code, department, role..." className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="max-h-[620px] overflow-auto">
            {filtered.map((user) => (
              <button key={user.id} type="button" onClick={() => setSelected(user.id)} className={`w-full border-b border-slate-100 p-4 text-left hover:bg-slate-50 ${activeUser?.id === user.id ? 'bg-blue-50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{user.fullName}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">{user.employeeCode} / {user.department} / {user.jobTitle}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{user.status}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">{user.roles.join(', ')}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {activeUser ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">{activeUser.fullName}</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">{activeUser.username} / {activeUser.email || 'No email'}</p>
                </div>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">{activeUser.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ['Employee ID', activeUser.employeeCode],
                  ['Department', activeUser.department],
                  ['Unit', activeUser.unit],
                  ['Grade', activeUser.grade],
                  ['Location', activeUser.location],
                  ['Manager', activeUser.reportingManager],
                  ['Employment', activeUser.employmentStatus],
                  ['Failed Attempts', activeUser.failedAttempts],
                ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-black uppercase text-slate-500">{label}</p><p className="mt-1 text-xs font-extrabold text-slate-900">{String(value || 'N/A')}</p></div>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void mutate(activeUser.id, 'activate')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white"><BadgeCheck className="h-4 w-4" />Activate</button>
                <button onClick={() => void mutate(activeUser.id, 'disable')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-black text-white"><Ban className="h-4 w-4" />Disable</button>
                <button onClick={() => void mutate(activeUser.id, 'lock')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-black text-white"><Lock className="h-4 w-4" />Lock</button>
                <button onClick={() => void mutate(activeUser.id, 'unlock')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-black text-white"><Unlock className="h-4 w-4" />Unlock</button>
                <button onClick={() => void mutate(activeUser.id, 'reset-password')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-black text-white"><KeyRound className="h-4 w-4" />Reset Password</button>
              </div>
              <div className="mt-5">
                <p className="text-xs font-black uppercase text-slate-500">Assign Roles</p>
                <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 p-3">
                  {assignableRoles.map((role) => (
                    <label key={role.name} className="flex items-center gap-2 py-1 text-xs font-bold text-slate-700">
                      <input type="checkbox" checked={selectedRoles.includes(role.name)} onChange={(event) => setSelectedRoles((prev) => event.target.checked ? [...prev, role.name] : prev.filter((item) => item !== role.name))} />
                      {role.name} <span className="text-slate-400">({role.category})</span>
                    </label>
                  ))}
                </div>
                <button onClick={() => void mutate(activeUser.id, 'assign-roles', { roles: selectedRoles })} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white"><ShieldCheck className="h-4 w-4" />Save Roles</button>
              </div>
            </div>
          ) : <div className="text-sm font-bold text-slate-500">No user selected.</div>}
        </section>
      </div>

      {section.includes('history') ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-slate-950">Login History</h2>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {history.slice(0, 80).map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700">{item.username} / {item.status} / {new Date(item.at).toLocaleString()} / {item.ipAddress} / {item.reason || 'OK'}</div>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
