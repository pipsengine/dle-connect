'use client';

import type { IdCardIssue } from '../lib/employees';

const when = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export function IssuanceHistory({ issues }: { issues: IdCardIssue[] }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]">
      <div className="px-6 pt-5 pb-4">
        <h2 className="text-lg font-bold text-slate-900">Issuance history</h2>
        <p className="mt-1 text-sm text-slate-500">Saved in HRIS when a card is generated. The artwork is rebuilt from the Employee Directory.</p>
      </div>
      {issues.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-slate-500">No ID cards have been recorded yet.</p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
          {issues.map((issue) => (
            <li key={issue.id} className="px-6 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{issue.employeeName}</p>
                  <p className="text-sm text-slate-500 truncate">
                    {issue.employeeCode} · {issue.jobTitle || 'No job title'} · {issue.department || 'Unassigned'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${issue.status === 'Reprinted' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                  {issue.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {when(issue.issuedAt)} · {issue.issuedBy} · {issue.exportFormat.toUpperCase()}
                {issue.photoPresent ? '' : ' · no photo on file'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
