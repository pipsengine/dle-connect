'use client';

import { useEffect, useState } from 'react';
import { unfinishedDepartmentRoutes, formatDate } from '@/lib/corporate-office/front-desk-format';
import type { Correspondence, DepartmentRoute, RouteStatus } from '@/lib/corporate-office/front-desk-types';
import { EmployeeSearch } from './EmployeeSearch';

const STATUS_CLASS: Record<RouteStatus, string> = {
  Pending: 'bg-slate-100 text-slate-600',
  Acknowledged: 'bg-sky-50 text-sky-700',
  'In Progress': 'bg-amber-50 text-amber-700',
  Completed: 'bg-emerald-50 text-emerald-700',
  Waived: 'bg-slate-100 text-slate-500',
};

const canWaiveFrom = (permissions: string[], isGlobalAdmin: boolean) =>
  isGlobalAdmin || permissions.some((permission) => permission === '*' || permission === 'corporate.front-desk.edit' || permission === 'corporate.front-desk.*' || permission === 'corporate.*');

export function DepartmentRouting({
  item,
  onUpdated,
}: {
  item: Correspondence;
  onUpdated: (item: Correspondence) => void;
}) {
  const routes = item.routes || [];
  const [note, setNote] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [reassigning, setReassigning] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [canWaive, setCanWaive] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions.map(String) : [];
        setCanWaive(canWaiveFrom(permissions, Boolean(json?.data?.isGlobalAdmin)));
      })
      .catch(() => setCanWaive(false));
  }, []);

  const run = async (action: string, route: DepartmentRoute, extra: Record<string, unknown> = {}) => {
    setBusy(route.id);
    setError('');
    try {
      const response = await fetch('/api/corporate-office/front-desk', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: item.id, routeId: route.id, ...extra }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'The department action could not be completed.');
      setReassigning('');
      onUpdated(json.data as Correspondence);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The department action could not be completed.');
    } finally {
      setBusy('');
    }
  };

  if (!routes.length) {
    return (
      <section className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Departments Involved</h4>
        <p className="mt-2 text-sm text-slate-500">No departments have been routed. Edit this correspondence to add them.</p>
      </section>
    );
  }

  const openRoutes = unfinishedDepartmentRoutes(routes);

  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Departments Involved</h4>
        <p className="text-xs text-slate-400">{routes.length - openRoutes.length} of {routes.length} complete</p>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 space-y-3">
        {routes.map((route) => {
          const locked = route.status === 'Completed' || route.status === 'Waived' || item.status === 'Closed';
          return (
            <article key={route.id} className={`rounded-xl border p-4 ${route.lead ? 'border-sky-200 bg-sky-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="text-sm font-semibold text-slate-900">{route.department}</h5>
                    {route.lead ? <span className="rounded-full bg-[#2f6fed] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Lead</span> : null}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASS[route.status]}`}>{route.status}</span>
                  </div>
                  {route.lead ? <p className="mt-1 text-xs text-slate-500">Coordinates the consolidated response.</p> : null}
                </div>
                <p className="text-xs text-slate-500">{route.priority} · {route.dueDate ? formatDate(route.dueDate) : 'No deadline'}</p>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned officer</dt>
                  <dd className="mt-0.5 text-slate-800">{route.assigneeName || 'Unassigned'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">HOD</dt>
                  <dd className="mt-0.5 text-slate-800">{route.hodName || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Acknowledged</dt>
                  <dd className="mt-0.5 text-slate-800">{route.acknowledgedAt ? `${formatDate(route.acknowledgedAt)}${route.acknowledgedBy ? ` · ${route.acknowledgedBy}` : ''}` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Completed</dt>
                  <dd className="mt-0.5 text-slate-800">{route.completedAt ? `${formatDate(route.completedAt)}${route.completedBy ? ` · ${route.completedBy}` : ''}` : route.waivedAt ? `Waived ${formatDate(route.waivedAt)}` : '—'}</dd>
                </div>
                {route.actionRequired ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Action required</dt>
                    <dd className="mt-0.5 text-slate-800">{route.actionRequired}</dd>
                  </div>
                ) : null}
                {route.progressNote ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Progress</dt>
                    <dd className="mt-0.5 text-slate-800">{route.progressNote}</dd>
                  </div>
                ) : null}
                {route.waiveReason ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Waiver</dt>
                    <dd className="mt-0.5 text-slate-800">{route.waiveReason}{route.waivedBy ? ` · ${route.waivedBy}` : ''}</dd>
                  </div>
                ) : null}
              </dl>
              {!locked ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                  {reassigning === route.id ? (
                    <EmployeeSearch
                      label="Reassign officer"
                      selectedName=""
                      department={route.department}
                      placeholder="Search the employee directory"
                      onSelect={(person) => run('route-reassign', route, { employeeCode: person.code })}
                      onClear={() => undefined}
                    />
                  ) : null}
                  <textarea
                    value={note[route.id] || ''}
                    onChange={(event) => setNote((current) => ({ ...current, [route.id]: event.target.value }))}
                    rows={2}
                    placeholder="Progress note"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    {route.status === 'Pending' ? (
                      <button type="button" disabled={busy === route.id} onClick={() => run('route-acknowledge', route)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Acknowledge</button>
                    ) : null}
                    <button type="button" disabled={busy === route.id} onClick={() => run('route-progress', route, { note: note[route.id] || '' })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Update progress</button>
                    <button type="button" disabled={busy === route.id} onClick={() => setReassigning((current) => current === route.id ? '' : route.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white">Reassign</button>
                    <button type="button" disabled={busy === route.id} onClick={() => run('route-complete', route)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Mark complete</button>
                  </div>
                  {canWaive ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <input
                        value={reason[route.id] || ''}
                        onChange={(event) => setReason((current) => ({ ...current, [route.id]: event.target.value }))}
                        placeholder="Reason for waiving this department"
                        className="min-w-[16rem] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                      />
                      <button type="button" disabled={busy === route.id || !(reason[route.id] || '').trim()} onClick={() => run('route-waive', route, { reason: reason[route.id] || '' })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white">Waive</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
