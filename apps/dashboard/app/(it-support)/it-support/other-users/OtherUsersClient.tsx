'use client';

import { useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCcw, UserPlus, UserRound, UserX } from 'lucide-react';
import { ItSupportBreadcrumbs } from '../it-support-portal-shell';

type PortalUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  organisation: string;
  role: string;
  status: string;
  firstLoginRequired: boolean;
  passwordResetRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const ROLES = ['Visitor Reception', 'Visitor Security'] as const;

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  organisation: '',
  role: 'Visitor Reception',
};

export default function OtherUsersClient() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'error'>('success');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/it-support/other-users', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load other users.');
      const next = (json.data?.users || []) as PortalUser[];
      setUsers(next);
      setSelectedId((current) => current && next.some((user) => user.id === current) ? current : (next[0]?.id || ''));
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Unable to load other users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return users;
    return users.filter((user) =>
      [user.username, user.fullName, user.email, user.phone, user.organisation, user.role, user.status]
        .some((value) => String(value || '').toLowerCase().includes(text)),
    );
  }, [query, users]);

  const selected = users.find((user) => user.id === selectedId) || null;

  useEffect(() => {
    if (!selected) return;
    setDraft({
      fullName: selected.fullName,
      email: selected.email,
      phone: selected.phone,
      organisation: selected.organisation,
      role: selected.role || 'Visitor Reception',
    });
  }, [selected]);

  const bannerClass = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-900'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900';

  const createUser = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/it-support/other-users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to create the other user.');
      setTone('success');
      setMessage(String(json.data?.message || 'Other user created.'));
      setForm(emptyForm);
      await load();
      if (json.data?.user?.id) setSelectedId(json.data.user.id);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Unable to create the other user.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: 'disable' | 'enable' | 'reset-password' | 'update') => {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/it-support/other-users', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: selected.id, action, ...draft }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to update the other user.');
      setTone('success');
      setMessage(String(json.data?.message || 'Other user updated.'));
      await load();
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Unable to update the other user.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ItSupportBreadcrumbs items={['Service Operations', 'Other Users']} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white">
              <UserRound className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-teal-700">Service Operations</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">Other Users</h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
                Create sign-in accounts for people who use the visitor management portal and are not on the employee directory. Logins are generated as DL-0001, DL-0002, and so on. The temporary password is their surname in capitals.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </section>

      {message ? <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${bannerClass}`}>{message}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">New other user</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block text-xs font-black uppercase text-slate-500">
            Full name
            <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none" placeholder="Adaeze Okonkwo" />
          </label>
          <label className="block text-xs font-black uppercase text-slate-500">
            Email
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none" placeholder="name@company.com" />
          </label>
          <label className="block text-xs font-black uppercase text-slate-500">
            Phone
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none" placeholder="080..." />
          </label>
          <label className="block text-xs font-black uppercase text-slate-500">
            Organisation
            <input value={form.organisation} onChange={(event) => setForm({ ...form, organisation: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none" placeholder="Contract security company" />
          </label>
          <label className="block text-xs font-black uppercase text-slate-500">
            Visitor portal role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 outline-none">
              {ROLES.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !form.fullName.trim()}
          onClick={() => void createUser()}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-black text-white disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" /> Create account
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, DL code, email, or organisation"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Login</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedId(user.id)}
                    className={`cursor-pointer border-t border-slate-100 ${user.id === selectedId ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-4 py-3 font-black text-slate-950">{user.username}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{user.fullName}</div>
                      <div className="text-xs font-semibold text-slate-500">{user.organisation || user.email || 'No organisation'}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{user.role}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{user.status}</td>
                  </tr>
                ))}
                {!loading && visible.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No other users yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">{selected.username}</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">{selected.fullName}</h2>
                <p className="text-xs font-semibold text-slate-500">Not listed on the employee directory. Host search will not offer this person.</p>
              </div>
              <label className="block text-xs font-black uppercase text-slate-500">
                Full name
                <input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none" />
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">
                Email
                <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none" />
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">
                Phone
                <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none" />
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">
                Organisation
                <input value={draft.organisation} onChange={(event) => setDraft({ ...draft, organisation: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none" />
              </label>
              <label className="block text-xs font-black uppercase text-slate-500">
                Role
                <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none">
                  {ROLES.map((role) => <option key={role}>{role}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="button" disabled={busy} onClick={() => void act('update')} className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-3 text-xs font-black text-white disabled:opacity-60">Save changes</button>
                <button type="button" disabled={busy} onClick={() => void act('reset-password')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-800 disabled:opacity-60">
                  <KeyRound className="h-4 w-4" /> Reset password
                </button>
                {selected.status === 'Disabled' ? (
                  <button type="button" disabled={busy} onClick={() => void act('enable')} className="inline-flex h-10 items-center rounded-lg border border-emerald-200 px-3 text-xs font-black text-emerald-800 disabled:opacity-60">Enable</button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => void act('disable')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 px-3 text-xs font-black text-red-800 disabled:opacity-60">
                    <UserX className="h-4 w-4" /> Disable
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-500">{loading ? 'Loading other users…' : 'Create an account to manage it here.'}</p>
          )}
        </div>
      </section>
    </div>
  );
}
