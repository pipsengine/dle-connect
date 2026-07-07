'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Plus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';

export type EarningsException = {
  id: string;
  employeeId: string;
  employeeName: string;
  issue: string;
  severity: 'Low' | 'Medium' | 'High';
  owner: string;
};

export type EarningsRecord = {
  employeeId: string;
  fullName?: string;
  department?: string;
  jobTitle?: string;
  employmentType: string;
  payrollGroup: string;
  paymentType?: string;
  isDailyRate?: boolean;
  payrollStatus: string;
  allowances?: number | null;
  basePay?: number | null;
  grossPay?: number | null;
  exceptions?: string[];
};

const numberFmt = new Intl.NumberFormat('en-GB');
const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const fmtNum = (value: number) => numberFmt.format(value);
const fmtMoney = (value: number | null | undefined, canView: boolean) =>
  !canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value);

const bonusIssue = (issue: string) => /bonus|arrears|merit|award|incentive/i.test(issue);
const bonusRecord = (record: EarningsRecord) =>
  /bonus|arrears|merit|award|incentive/i.test((record.exceptions || []).join(' '));

const BONUS_TYPES = [
  { id: 'performance', name: 'Performance Bonus', code: 'BON-PERF', taxTreatment: 'Taxable', frequency: 'Annual', status: 'Active' },
  { id: 'project', name: 'Project Completion Bonus', code: 'BON-PROJ', taxTreatment: 'Taxable', frequency: 'Ad-hoc', status: 'Active' },
  { id: 'retention', name: 'Retention Bonus', code: 'BON-RET', taxTreatment: 'Taxable', frequency: 'Annual', status: 'Active' },
  { id: 'arrears', name: 'Salary Arrears', code: 'ARR-BASE', taxTreatment: 'Taxable', frequency: 'One-off', status: 'Active' },
  { id: 'merit', name: 'Merit Award', code: 'BON-MERIT', taxTreatment: 'Taxable', frequency: 'Ad-hoc', status: 'Under Review' },
  { id: 'referral', name: 'Referral Incentive', code: 'BON-REF', taxTreatment: 'Taxable', frequency: 'Ad-hoc', status: 'Active' },
];

const severityTone = (severity: EarningsException['severity']) => {
  if (severity === 'High') return 'bg-red-100 text-red-800 border-red-200';
  if (severity === 'Medium') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const statusTone = (status: string) => {
  if (status === 'Blocked') return 'bg-red-100 text-red-800';
  if (status === 'Review') return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-800';
};

type BonusInputsPanelProps = {
  records: EarningsRecord[];
  issues: EarningsException[];
  periodLabel: string;
  canViewMoney: boolean;
};

export function BonusInputsPanel({ records, issues, periodLabel, canViewMoney }: BonusInputsPanelProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [uploadFile, setUploadFile] = useState('');

  const bonusIssues = issues.filter((item) => bonusIssue(item.issue));
  const candidateRows = useMemo(() => {
    const issueIds = new Set(bonusIssues.map((item) => item.employeeId));
    return records.filter((record) => bonusRecord(record) || issueIds.has(record.employeeId));
  }, [bonusIssues, records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidateRows.filter((record) => {
      if (statusFilter !== 'All' && record.payrollStatus !== statusFilter) return false;
      if (typeFilter !== 'All') {
        const match = typeFilter === 'Arrears' ? /arrears/i.test((record.exceptions || []).join(' ')) : /bonus|merit|award/i.test((record.exceptions || []).join(' '));
        if (!match) return false;
      }
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.jobTitle, record.payrollGroup].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [candidateRows, query, statusFilter, typeFilter]);

  const readyCount = filtered.filter((r) => r.payrollStatus === 'Ready').length;
  const reviewCount = filtered.filter((r) => r.payrollStatus === 'Review').length;
  const blockedCount = filtered.filter((r) => r.payrollStatus === 'Blocked').length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-[#7C3AED] shadow-sm">
              <Sparkles className="h-7 w-7" />
            </span>
            <div>
              <h2 className="text-2xl font-bold text-[#0F172A]">Bonus Inputs</h2>
              <p className="mt-1 max-w-3xl text-sm text-[#64748B]">
                Configure bonus types, upload bonus spreadsheets, and review employee bonus assignments for {periodLabel}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              New Bonus Entry
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Import Bonuses
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Bonus Candidates" value={fmtNum(candidateRows.length)} subtitle="Employees with bonus inputs" tone="violet" />
        <KpiTile label="Ready" value={fmtNum(readyCount)} subtitle="Approved for payroll" tone="green" />
        <KpiTile label="Pending Review" value={fmtNum(reviewCount)} subtitle="Requires payroll review" tone="amber" />
        <KpiTile label="Blocked" value={fmtNum(blockedCount)} subtitle="Policy or validation blockers" tone="red" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-[#0F172A]">Bonus Setup</h3>
          <p className="mt-1 text-sm text-[#64748B]">Active bonus and arrears pay components configured for this payroll cycle.</p>
          <div className="mt-4 space-y-2">
            {BONUS_TYPES.map((type) => (
              <div key={type.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-[#0F172A]">{type.name}</p>
                  <p className="text-xs text-[#64748B]">
                    {type.code} · {type.frequency} · {type.taxTreatment}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${type.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {type.status}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-[#0F172A]">Bonus Upload</h3>
          <p className="mt-1 text-sm text-[#64748B]">Upload a CSV or Excel file with employee bonus assignments for bulk processing.</p>
          <label className="mt-4 flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-6 text-center hover:border-[#2563EB] hover:bg-blue-50/40">
            <Upload className="h-8 w-8 text-[#64748B]" />
            <p className="mt-2 text-sm font-semibold text-[#0F172A]">Drop bonus file here or click to browse</p>
            <p className="mt-1 text-xs text-[#64748B]">Supported: .csv, .xlsx · Max 5MB</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => setUploadFile(e.target.files?.[0]?.name || '')}
            />
          </label>
          {uploadFile ? (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 font-semibold text-emerald-800">
                <FileSpreadsheet className="h-4 w-4" />
                {uploadFile}
              </span>
              <button type="button" onClick={() => setUploadFile('')} className="text-emerald-700 hover:text-emerald-900">
                Remove
              </button>
            </div>
          ) : null}
          <button
            type="button"
            disabled={!uploadFile}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            Validate &amp; Stage Upload
          </button>
        </article>
      </section>

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#0F172A]">Bonus Review</h3>
            <p className="mt-1 text-sm text-[#64748B]">{fmtNum(filtered.length)} employee bonus records for review.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employees..."
                className="h-10 rounded-lg border border-[#E5E7EB] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#2563EB]"
              />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-semibold">
              <option value="All">All types</option>
              <option value="Bonus">Bonus</option>
              <option value="Arrears">Arrears</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-semibold">
              <option value="All">All statuses</option>
              <option value="Ready">Ready</option>
              <option value="Review">Review</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#E5E7EB]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-[#64748B]">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Payroll Group</th>
                <th className="px-4 py-3">Base Pay</th>
                <th className="px-4 py-3">Gross Pay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issues</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.employeeId} className="border-t border-[#E5E7EB] hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#0F172A]">{record.fullName || record.employeeId}</p>
                    <p className="text-xs text-[#64748B]">{record.employeeId}</p>
                  </td>
                  <td className="px-4 py-3 text-[#475569]">{record.department || '—'}</td>
                  <td className="px-4 py-3 text-[#475569]">{record.payrollGroup}</td>
                  <td className="px-4 py-3 font-semibold">{fmtMoney(record.basePay, canViewMoney)}</td>
                  <td className="px-4 py-3 font-semibold">{fmtMoney(record.grossPay, canViewMoney)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone(record.payrollStatus)}`}>{record.payrollStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">{(record.exceptions || []).filter(bonusIssue).join('; ') || '—'}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="text-sm font-semibold text-[#2563EB] hover:underline">
                      Review
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-emerald-700">
                    No bonus input records found for the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {bonusIssues.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            Bonus Validation Issues ({fmtNum(bonusIssues.length)})
          </h3>
          <div className="mt-3 space-y-2">
            {bonusIssues.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-[#0F172A]">
                  {item.employeeName} · {item.employeeId}
                </p>
                <p className="mt-1 text-[#475569]">{item.issue}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

type ExceptionsPanelProps = {
  issues: EarningsException[];
  onFix: (id: string) => void;
};

export function EarningsExceptionsPanel({ issues, onFix }: ExceptionsPanelProps) {
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const categorize = (issue: string) => {
    if (/allowance/i.test(issue)) return 'Allowances';
    if (/overtime|\bot\b/i.test(issue)) return 'Overtime';
    if (/daily.rate|timesheet|rate per day/i.test(issue)) return 'Daily Rate';
    if (/bonus|arrears|merit/i.test(issue)) return 'Bonus';
    return 'General';
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return issues.filter((item) => {
      if (severityFilter !== 'All' && item.severity !== severityFilter) return false;
      if (categoryFilter !== 'All' && categorize(item.issue) !== categoryFilter) return false;
      if (!q) return true;
      return [item.employeeId, item.employeeName, item.issue, item.owner].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [categoryFilter, issues, query, severityFilter]);

  const highCount = issues.filter((item) => item.severity === 'High').length;
  const mediumCount = issues.filter((item) => item.severity === 'Medium').length;
  const lowCount = issues.filter((item) => item.severity === 'Low').length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-[#0F172A]">Exception Register</h2>
        <p className="mt-2 text-sm text-[#64748B]">Review and resolve earnings exceptions before payroll processing.</p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile label="High Severity" value={fmtNum(highCount)} subtitle="Immediate action required" tone="red" />
        <KpiTile label="Medium Severity" value={fmtNum(mediumCount)} subtitle="Review before run" tone="amber" />
        <KpiTile label="Low Severity" value={fmtNum(lowCount)} subtitle="Informational / monitor" tone="slate" />
      </section>

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-lg font-semibold">{fmtNum(filtered.length)} earnings exceptions</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search exceptions..."
                className="h-10 rounded-lg border border-[#E5E7EB] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#2563EB]"
              />
            </div>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-semibold">
              <option value="All">All severities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-semibold">
              <option value="All">All categories</option>
              <option value="Allowances">Allowances</option>
              <option value="Overtime">Overtime</option>
              <option value="Daily Rate">Daily Rate</option>
              <option value="Bonus">Bonus</option>
              <option value="General">General</option>
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#0F172A]">{item.employeeName}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${severityTone(item.severity)}`}>{item.severity}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">{categorize(item.issue)}</span>
                </div>
                <p className="text-xs text-[#64748B]">{item.employeeId}</p>
                <p className="mt-1 text-sm text-slate-700">{item.issue}</p>
                <p className="mt-1 text-xs font-semibold text-[#64748B]">Owner: {item.owner}</p>
              </div>
              <button
                type="button"
                onClick={() => onFix(item.id)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#2563EB] hover:bg-blue-50"
              >
                Fix
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!filtered.length ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              No earnings exceptions match the current filters.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function KpiTile({ label, value, subtitle, tone }: { label: string; value: string; subtitle: string; tone: 'violet' | 'green' | 'amber' | 'red' | 'slate' }) {
  const tones = {
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  };
  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-bold text-[#0F172A]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[#64748B]">{subtitle}</p>
    </article>
  );
}
