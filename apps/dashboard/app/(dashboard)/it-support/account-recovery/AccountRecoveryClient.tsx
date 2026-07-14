'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LifeBuoy,
  RefreshCcw,
  Search,
  ShieldAlert,
  Unlock,
  UserRoundCheck,
} from 'lucide-react';

type RecoveryUser = {
  id: string;
  username: string;
  employeeCode?: string;
  employeeId?: string;
  fullName: string;
  email?: string;
  department?: string;
  jobTitle?: string;
  status: string;
  roles: string[];
  firstLoginRequired: boolean;
  passwordResetRequired: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  issues: string[];
  recentHistory?: Array<{ at: string; status: string; reason?: string; ipAddress?: string }>;
};

type Summary = {
  total: number;
  withIssues: number;
  locked: number;
  disabled: number;
  passwordFlags: number;
};

const formatWhen = (value?: string | null) => {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
};

export default function AccountRecoveryClient() {
  const [users, setUsers] = useState<RecoveryUser[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(true);
  const [resetPassword, setResetPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'success' | 'error'>('info');

  const load = async (q = query, onlyIssues = issuesOnly) => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      params.set('issuesOnly', onlyIssues ? '1' : '0');
      const response = await fetch(`/api/it-support/account-recovery?${params.toString()}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load account recovery queue.');
      const nextUsers = (json.data?.users || []) as RecoveryUser[];
      setUsers(nextUsers);
      setSummary(json.data?.summary || null);
      if (!selectedId && nextUsers[0]) setSelectedId(nextUsers[0].id);
      if (selectedId && !nextUsers.some((user) => user.id === selectedId) && nextUsers[0]) {
        setSelectedId(nextUsers[0].id);
      }
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Unable to load accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => users.find((user) => user.id === selectedId) || users[0] || null,
    [users, selectedId],
  );

  const recover = async (action: 'recover-account' | 'unlock' | 'activate' | 'reset-password' = 'recover-account') => {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/it-support/account-recovery', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: selected.id,
          action,
          resetPassword: action === 'recover-account' ? resetPassword : action === 'reset-password',
          clearPasswordFlags: true,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Recovery action failed.');
      setTone('success');
      setMessage(json.data?.message || 'Account recovered.');
      await load(query, issuesOnly);
      setSelectedId(selected.id);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof Error ? error.message : 'Recovery action failed.');
    } finally {
      setBusy(false);
    }
  };

  const bannerClass = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-900'
    : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-blue-200 bg-blue-50 text-blue-900';

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-white">
                <LifeBuoy className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">IT & Support</p>
                <h1 className="mt-1 text-2xl font-black text-slate-950">Account Recovery</h1>
                <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">
                  Clear locked accounts, failed login lockouts, disabled status, and stuck password-change flags so staff can sign in again.
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

        {summary ? (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: 'Accounts', value: summary.total, icon: UserRoundCheck },
              { label: 'With issues', value: summary.withIssues, icon: AlertTriangle },
              { label: 'Locked', value: summary.locked, icon: ShieldAlert },
              { label: 'Disabled', value: summary.disabled, icon: ShieldAlert },
              { label: 'Password flags', value: summary.passwordFlags, icon: KeyRound },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase text-slate-500">{item.label}</p>
                  <item.icon className="h-4 w-4 text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-slate-950">{item.value}</p>
              </div>
            ))}
          </section>
        ) : null}

        {message ? <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${bannerClass}`}>{message}</div> : null}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <label className="block">
                <span className="text-xs font-black uppercase text-slate-500">Search employee / username</span>
                <span className="mt-2 flex h-11 items-center rounded-xl border border-slate-200 px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void load(query, issuesOnly);
                    }}
                    placeholder="e.g. NYSC0032"
                    className="ml-2 h-full w-full text-sm font-bold outline-none"
                  />
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void load(query, issuesOnly)}
                  className="inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-xs font-black text-white"
                >
                  Search
                </button>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={issuesOnly}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setIssuesOnly(next);
                      void load(query, next);
                    }}
                  />
                  Show only accounts with issues
                </label>
              </div>
            </div>
            <div className="max-h-[62vh] overflow-y-auto">
              {loading ? (
                <p className="p-4 text-sm font-semibold text-slate-500">Loading accounts…</p>
              ) : users.length === 0 ? (
                <p className="p-4 text-sm font-semibold text-slate-500">No matching accounts.</p>
              ) : users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedId(user.id)}
                  className={`flex w-full flex-col gap-1 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${selected?.id === user.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-slate-950">{user.username}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${user.issues.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {user.issues.length ? `${user.issues.length} issue(s)` : 'Clear'}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600">{user.fullName}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{user.department || '—'} · {user.status}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selected ? (
              <p className="text-sm font-semibold text-slate-500">Select an account to recover.</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-black text-slate-950">{selected.fullName}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {selected.username}
                    {selected.employeeCode ? ` · ${selected.employeeCode}` : ''}
                    {selected.jobTitle ? ` · ${selected.jobTitle}` : ''}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">Status</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{selected.status}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">Failed attempts</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{selected.failedAttempts}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase text-slate-500">Last login</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{formatWhen(selected.lastLoginAt)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-black uppercase text-slate-500">Detected issues</p>
                  {selected.issues.length ? (
                    <ul className="mt-2 space-y-2">
                      {selected.issues.map((issue) => (
                        <li key={issue} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                          <AlertTriangle className="h-4 w-4" /> {issue}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
                      <CheckCircle2 className="h-4 w-4" /> No blockers detected — account should be able to sign in.
                    </p>
                  )}
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={resetPassword}
                    onChange={(event) => setResetPassword(event.target.checked)}
                  />
                  <span>
                    Also reset password to the employee surname (user will be required to change it after login).
                    Use this when the person forgot their password.
                  </span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void recover('recover-account')}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-60"
                  >
                    <Unlock className="h-4 w-4" /> Clear Account Issues
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void recover('unlock')}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:opacity-60"
                  >
                    Unlock only
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void recover('activate')}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 disabled:opacity-60"
                  >
                    Activate only
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void recover('reset-password')}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-black text-amber-900 disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4" /> Reset password
                  </button>
                </div>

                {selected.recentHistory?.length ? (
                  <div>
                    <p className="text-xs font-black uppercase text-slate-500">Recent login activity</p>
                    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-black">When</th>
                            <th className="px-3 py-2 font-black">Status</th>
                            <th className="px-3 py-2 font-black">Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.recentHistory.map((item, index) => (
                            <tr key={`${item.at}-${index}`} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-semibold text-slate-700">{formatWhen(item.at)}</td>
                              <td className="px-3 py-2 font-bold text-slate-900">{item.status}</td>
                              <td className="px-3 py-2 font-semibold text-slate-600">{item.reason || item.ipAddress || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
