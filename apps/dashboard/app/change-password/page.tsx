'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { passwordPolicyErrors } from '@/lib/auth/session';
import { safeInternalNextPath } from '@/lib/auth/safe-next';

export default function ChangePasswordPage() {
  const [login, setLogin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const next = useMemo(
    () => safeInternalNextPath(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('next')),
    [],
  );
  const suggestedLogin = useMemo(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('user') || '', []);
  const policy = passwordPolicyErrors(newPassword);

  useEffect(() => {
    let active = true;
    if (suggestedLogin) setLogin(suggestedLogin);
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (!active) return;
        if (res.status === 401) {
          setNeedsLogin(true);
          return;
        }
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const user = json?.data;
        if (!user) {
          setNeedsLogin(true);
          return;
        }
        if (user.username && !suggestedLogin) setLogin(String(user.username));
        if (user.isGlobalAdmin || (!user.firstLoginRequired && !user.passwordResetRequired)) {
          window.location.replace(next || '/');
        }
      })
      .catch(() => {
        if (active) setNeedsLogin(true);
      });
    return () => {
      active = false;
    };
  }, [next, suggestedLogin]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          login: login.trim() || undefined,
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to change password.');
      window.location.assign(next || json.data.redirectTo || '/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to change password.';
      setError(message);
      if (/unauthenticated|session expired/i.test(message)) setNeedsLogin(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><KeyRound className="h-5 w-5" /></span>
          <div>
            <h1 className="text-2xl font-black text-slate-950">Change Password</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">First login and password resets must be completed before accessing the application.</p>
          </div>
        </div>
        {needsLogin ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            Your session is not active. Enter your username/employee code and current password to finish the reset.
          </div>
        ) : null}
        <form onSubmit={submit} className="mt-6 space-y-4">
          {needsLogin ? (
            <label className="block">
              <span className="text-xs font-black uppercase text-slate-600">Username / Employee Code</span>
              <input
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
                autoComplete="username"
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="e.g. NYSC0032"
              />
            </label>
          ) : null}
          {[
            ['Current Password', currentPassword, setCurrentPassword, 'current-password'],
            ['New Password', newPassword, setNewPassword, 'new-password'],
            ['Confirm New Password', confirmPassword, setConfirmPassword, 'new-password'],
          ].map(([label, value, setter, autoComplete]) => (
            <label key={String(label)} className="block">
              <span className="text-xs font-black uppercase text-slate-600">{String(label)}</span>
              <span className="mt-2 flex h-12 items-center rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                <input value={String(value)} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)} required type={show ? 'text' : 'password'} autoComplete={String(autoComplete)} className="h-full min-w-0 flex-1 rounded-xl px-4 text-sm font-bold outline-none" />
                <button type="button" onClick={() => setShow((item) => !item)} className="mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-50" aria-label={show ? 'Hide passwords' : 'Show passwords'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
          ))}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase text-slate-600">Password Policy</p>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {['Minimum 8 characters', 'At least 1 uppercase letter', 'At least 1 lowercase letter', 'At least 1 digit', 'At least 1 special character'].map((rule) => {
                const ok = !policy.includes(rule);
                return <span key={rule} className={`inline-flex items-center gap-2 text-xs font-bold ${ok ? 'text-emerald-700' : 'text-slate-500'}`}><CheckCircle2 className="h-3.5 w-3.5" />{rule}</span>;
              })}
            </div>
          </div>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
          <button disabled={loading || policy.length > 0 || newPassword !== confirmPassword || (needsLogin && !login.trim())} className="h-12 w-full rounded-xl bg-slate-950 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {loading ? 'Updating password' : 'Update Password'}
          </button>
        </form>
      </section>
    </main>
  );
}
