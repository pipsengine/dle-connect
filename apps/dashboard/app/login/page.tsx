'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { clearStoredSessionActivity } from '@/components/layout/auth-session-guard';
import { safeInternalNextPath } from '@/lib/auth/safe-next';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const next = useMemo(
    () => safeInternalNextPath(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('next')),
    [],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login, password, rememberDevice }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Login failed.');
      clearStoredSessionActivity();
      const redirectTo = json.data.user?.isGlobalAdmin && !next ? '/' : json.data.redirectTo;
      if (redirectTo === '/change-password') {
        window.location.assign(`/change-password${next ? `?next=${encodeURIComponent(next)}` : ''}`);
        return;
      }
      // Honor email / middleware deep links (e.g. trip supervisor approval).
      window.location.assign(next || redirectTo || '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center">
        <section className="grid w-full overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[0.95fr_1.05fr]">
          <div className="hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="inline-flex h-16 w-36 items-center justify-center rounded-xl bg-white p-2">
                <div className="text-3xl font-black tracking-tight text-cyan-600">DL</div>
              </div>
              <h1 className="mt-8 max-w-md text-4xl font-black tracking-tight">DLE Digital Enterprise Application</h1>
              <p className="mt-4 max-w-md text-sm font-semibold leading-6 text-slate-300">
                Secure access for HRIS, Payroll, Finance, Procurement, Projects, HSE, Quality, Assets, Documents, and enterprise analytics.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-300">
              {['Employee-linked accounts', 'RBAC authorization', 'Audit trail', 'Session security'].map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-3">{item}</div>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <div className="mb-8 lg:hidden">
              <div className="inline-flex h-14 w-28 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
                <div className="text-2xl font-black tracking-tight text-cyan-600">DL</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><LockKeyhole className="h-5 w-5" /></span>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">Secure Login</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Use username, employee code, employee ID, or email.</p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-xs font-black uppercase text-slate-600">Username / Employee Code / Email</span>
                <input value={login} onChange={(event) => setLogin(event.target.value)} required autoComplete="username" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase text-slate-600">Password</span>
                <span className="mt-2 flex h-12 items-center rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                  <input value={password} onChange={(event) => setPassword(event.target.value)} required type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="h-full min-w-0 flex-1 rounded-xl px-4 text-sm font-bold outline-none" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-50" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
                  <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  Remember device
                </label>
                <a href="mailto:it-support@dormanlongeng.com?subject=Password Reset Request" className="text-sm font-black text-blue-700 hover:text-blue-800">Forgot password?</a>
              </div>
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
              <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300">
                <ShieldCheck className="h-4 w-4" />
                {loading ? 'Validating secure session' : 'Sign in'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
