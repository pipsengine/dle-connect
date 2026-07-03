'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  FileText,
  Filter,
  History,
  Landmark,
  MoreHorizontal,
  RefreshCcw,
  Scale,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

export type TaxPayeStatus = 'Ready' | 'Review' | 'Blocked' | 'Pending';

export type TaxPayeRecord = {
  employeeId: string;
  employeeCode?: string;
  fullName: string;
  department: string;
  payrollGroup: string;
  taxState: string;
  payeMethod?: 'contract-flat' | 'progressive';
  payeMethodLabel?: string;
  contractFlatPayeRate?: number | null;
  monthlyGrossPay?: number | null;
  annualGrossIncome: number | null;
  annualPreTaxDeductions: number | null;
  annualReliefs: number | null;
  annualChargeableIncome: number | null;
  annualPaye: number | null;
  monthlyPaye: number | null;
  status: TaxPayeStatus;
  issues: string[];
};

export type TaxPayeVersion = {
  id: string;
  name: string;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  basis: string;
  notes: string;
  taxBands: Array<{ id: string; sequence: number; label: string; bandAmount: number | null; rate: number }>;
  statutoryDeductions: Array<Record<string, unknown>>;
  reliefs: Array<Record<string, unknown>>;
  regulatoryChanges: Array<Record<string, unknown>>;
};

export type TaxPayePayload = {
  generatedAt: string;
  periodLabel: string;
  dataSource?: { warning: string | null };
  permissions: { canViewMoney: boolean; canExport: boolean };
  config: { activeVersion: TaxPayeVersion };
  summary: {
    employees: number;
    contractFlatEmployees?: number;
    annualChargeableIncome: number;
    annualPreTaxDeductions: number;
    annualReliefs: number;
    annualPaye: number;
    monthlyPaye: number;
    ready: number;
    review: number;
    blocked: number;
    exceptionCount: number;
  };
  records: TaxPayeRecord[];
};

type TabId = 'employees' | 'bands' | 'deductions' | 'reliefs' | 'changes';

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

const money = (value: number | null | undefined, canView = true) =>
  !canView || value === null || value === undefined ? '—' : moneyFmt.format(value);
const number = (value: number | undefined) => numberFmt.format(value || 0);

const statusChip = (status: string) => {
  if (status === 'Ready') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'Blocked') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Pending') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const tabs: { id: TabId; label: string }[] = [
  { id: 'employees', label: 'Employees' },
  { id: 'bands', label: 'Tax Bands' },
  { id: 'deductions', label: 'Statutory Deductions' },
  { id: 'reliefs', label: 'Reliefs' },
  { id: 'changes', label: 'Regulatory Changes' },
];

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  iconBg,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Scale;
  iconBg: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#64748B]">{label}</p>
          <p className="mt-2 truncate text-[34px] font-bold leading-none text-[#0F172A]">{value}</p>
          <p className="mt-2 text-sm text-[#64748B]">{detail}</p>
        </div>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg}`}>
          <Icon className="h-6 w-6" />
        </span>
      </div>
    </div>
  );
}

function ValidationCard({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'green' | 'amber' | 'red';
  icon: typeof BadgeCheck;
}) {
  const tones = {
    green: { card: 'border-emerald-200 bg-emerald-50/60', icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-800' },
    amber: { card: 'border-amber-200 bg-amber-50/60', icon: 'bg-amber-100 text-amber-700', value: 'text-amber-800' },
    red: { card: 'border-red-200 bg-red-50/60', icon: 'bg-red-100 text-red-700', value: 'text-red-800' },
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones.card}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#64748B]">{label}</p>
          <p className={`mt-1 text-3xl font-bold ${tones.value}`}>{value}</p>
          <p className="mt-1 text-xs font-medium text-[#64748B]">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function WorkspacePanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <h2 className="text-[22px] font-semibold text-[#0F172A]">{title}</h2>
        <p className="mt-1 text-sm text-[#64748B]">{subtitle}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function TaxPayeCommandCenter({
  payload,
  loading,
  error,
  role,
  onRoleChange,
  onRefresh,
  onExport,
  lastLoaded,
}: {
  payload: TaxPayePayload | null;
  loading: boolean;
  error: string;
  role: string;
  onRoleChange: (role: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  lastLoaded: string;
}) {
  const [tab, setTab] = useState<TabId>('employees');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('All States');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<TaxPayeRecord | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const version = payload?.config.activeVersion;
  const records = payload?.records || [];

  const states = useMemo(
    () => ['All States', ...Array.from(new Set(records.map((r) => r.taxState).filter(Boolean))).sort()],
    [records],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (stateFilter !== 'All States' && record.taxState !== stateFilter) return false;
      if (statusFilter !== 'All Statuses' && record.status !== statusFilter) return false;
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.payrollGroup, record.taxState]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, records, stateFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const pageNumbers = useMemo(() => {
    const max = 5;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(page - 2, totalPages - max + 1));
    return Array.from({ length: max }, (_, i) => start + i);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [query, stateFilter, statusFilter, pageSize]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuId(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const grossDisplay = (record: TaxPayeRecord) => {
    const monthly = record.monthlyGrossPay ?? (record.annualGrossIncome ? record.annualGrossIncome / 12 : null);
    return money(monthly, canViewMoney);
  };

  const progressiveOnlyValue = (record: TaxPayeRecord, annualValue: number | null | undefined) =>
    record.payeMethod === 'contract-flat' ? '—' : money(annualValue ? annualValue / 12 : null, canViewMoney);

  const contractFlatCount = payload?.summary.contractFlatEmployees || 0;

  const loadedLabel = new Date(lastLoaded).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC';

  return (
    <div className="-mx-3 space-y-6 bg-[#F8FAFC] px-3 py-1 sm:-mx-6 sm:px-6">
      <header className="flex min-h-[90px] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
              <Landmark className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-[36px] font-bold leading-tight tracking-tight text-[#0F172A]">Tax PAYE</h1>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-[#64748B]">
                Configure Nigeria PAYE engine for Tax Act 2025 rules, statutory deductions, reliefs, effective dates, audit history, and future tax changes.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
              Period: {payload?.periodLabel || 'Loading…'}
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
              Version: {version?.name || 'Loading…'}
            </span>
            <span className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-xs font-semibold text-[#64748B]">
              Loaded: {loadedLabel}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          >
            {['Payroll Officer', 'Finance Controller', 'HR Director', 'HR Manager', 'Executive Management', 'Auditor', 'Employee'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!payload?.permissions.canExport}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>
      ) : null}
      {payload?.dataSource?.warning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{payload.dataSource.warning}</div>
      ) : null}
      {contractFlatCount > 0 ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <span className="font-semibold">{number(contractFlatCount)} contract employee{contractFlatCount === 1 ? '' : 's'}</span>
          {' '}with C-code use a flat <span className="font-semibold">5% monthly gross PAYE</span> (month-on-month, not annualized). Progressive bands, reliefs, and chargeable-income columns do not apply to them.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Annual Chargeable Income"
          value={money(payload?.summary.annualChargeableIncome, canViewMoney)}
          detail={`${number(payload?.summary.employees)} employees assessed`}
          icon={Scale}
          iconBg="bg-violet-100 text-violet-700"
        />
        <KpiCard
          label="Annual PAYE"
          value={money(payload?.summary.annualPaye, canViewMoney)}
          detail="Progressive annual PAYE liability"
          icon={Banknote}
          iconBg="bg-red-100 text-red-600"
        />
        <KpiCard
          label="Monthly PAYE"
          value={money(payload?.summary.monthlyPaye, canViewMoney)}
          detail="Monthly payroll tax deduction"
          icon={CalendarClock}
          iconBg="bg-blue-100 text-[#2563EB]"
        />
        <KpiCard
          label="Pre-Tax Deductions"
          value={money(payload?.summary.annualPreTaxDeductions, canViewMoney)}
          detail={`${money(payload?.summary.annualReliefs, canViewMoney)} configured reliefs`}
          icon={ShieldCheck}
          iconBg="bg-emerald-100 text-emerald-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ValidationCard label="Ready" value={number(payload?.summary.ready)} detail="PAYE records with no exceptions" tone="green" icon={BadgeCheck} />
        <ValidationCard label="Review" value={number(payload?.summary.review)} detail="Configuration or payroll review required" tone="amber" icon={FileText} />
        <ValidationCard
          label="Blocked"
          value={number(payload?.summary.blocked)}
          detail={`${number(payload?.summary.exceptionCount)} exception flags`}
          tone={(payload?.summary.blocked || 0) > 0 ? 'red' : 'green'}
          icon={AlertTriangle}
        />
      </div>

      <div className="border-b border-[#E5E7EB]">
        <nav className="-mb-px flex flex-wrap gap-6">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                tab === item.id
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#64748B] hover:border-slate-300 hover:text-[#0F172A]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'employees' && (
        <>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search employee, department, payroll group, state..."
                  className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-10 text-sm outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
              >
                {states.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
              >
                {['All Statuses', 'Ready', 'Review', 'Blocked', 'Pending'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 text-sm font-semibold text-[#0F172A] hover:bg-white"
              >
                <Filter className="h-4 w-4" />
                Filters
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full text-left">
                <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                  <tr>
                    {['Employee', 'Tax Method', 'Payroll Group', 'State', 'Gross Income', 'Pre-Tax Ded.', 'Reliefs', 'Chargeable Income', 'Annual PAYE', 'Monthly PAYE', 'Status', 'Actions'].map((header) => (
                      <th key={header} className="px-4 py-3 text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((record) => (
                    <tr
                      key={record.employeeId}
                      className="cursor-pointer border-t border-[#E5E7EB] transition-colors hover:bg-slate-50"
                      onClick={() => setSelectedEmployee(record)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar fullName={record.fullName} employeeId={record.employeeId} size="sm" tryPhoto />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#0F172A]">{record.fullName}</p>
                            <p className="text-xs font-medium text-[#64748B]">{record.employeeCode || record.employeeId}</p>
                            <p className="truncate text-xs text-[#64748B]">{record.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {record.payeMethod === 'contract-flat' ? (
                          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                            5% flat
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            Progressive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-[#0F172A]">{record.payrollGroup}</td>
                      <td className="px-4 py-3 text-sm font-medium text-[#64748B]">{record.taxState}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{grossDisplay(record)}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{progressiveOnlyValue(record, record.annualPreTaxDeductions)}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{progressiveOnlyValue(record, record.annualReliefs)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{progressiveOnlyValue(record, record.annualChargeableIncome)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{money(record.annualPaye, canViewMoney)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#0F172A]">{money(record.monthlyPaye, canViewMoney)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusChip(record.status)}`}>{record.status}</span>
                      </td>
                      <td className="relative px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          aria-label="Row actions"
                          onClick={() => setMenuId(menuId === record.employeeId ? null : record.employeeId)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#64748B] hover:bg-slate-50"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuId === record.employeeId ? (
                          <div ref={menuRef} className="absolute right-4 top-12 z-20 w-48 rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-lg">
                            {['View', 'Edit', 'Recalculate', 'Audit History', 'View Tax Breakdown'].map((action) => (
                              <button
                                key={action}
                                type="button"
                                onClick={() => {
                                  setMenuId(null);
                                  if (action === 'View' || action === 'View Tax Breakdown') setSelectedEmployee(record);
                                }}
                                className="block w-full px-4 py-2 text-left text-sm font-medium text-[#0F172A] hover:bg-slate-50"
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {!loading && pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-sm font-medium text-[#64748B]">
                        No PAYE records match the selected filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-[#E5E7EB] px-4 py-3 sm:flex-row">
              <p className="text-sm text-[#64748B]">
                Showing <span className="font-semibold text-[#0F172A]">{filtered.length ? (page - 1) * pageSize + 1 : 0}</span> to{' '}
                <span className="font-semibold text-[#0F172A]">{Math.min(page * pageSize, filtered.length)}</span> of{' '}
                <span className="font-semibold text-[#0F172A]">{number(filtered.length)}</span> results
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage(1)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40" aria-label="First page">
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    className={`min-w-9 rounded-lg px-3 py-2 text-sm font-semibold ${page === item ? 'bg-[#2563EB] text-white' : 'border border-[#E5E7EB] bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    {item}
                  </button>
                ))}
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40" aria-label="Last page">
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#64748B]">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-sm font-medium text-slate-700"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                per page
              </label>
            </div>
          </div>
        </>
      )}

      {tab === 'bands' && (
        <WorkspacePanel title="PAYE Tax Band Management" subtitle="Tax brackets, rates, effective dates, and historical versions.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(version?.taxBands || [])
              .sort((a, b) => a.sequence - b.sequence)
              .map((band) => (
                <div key={band.id} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{band.label}</p>
                  <p className="mt-2 text-xl font-bold text-[#0F172A]">{band.bandAmount === null ? 'Open-ended' : money(band.bandAmount, true)}</p>
                  <p className="mt-1 text-sm font-semibold text-[#64748B]">{pctFmt.format(band.rate * 100)}% tax rate</p>
                </div>
              ))}
          </div>
        </WorkspacePanel>
      )}

      {tab === 'deductions' && (
        <WorkspacePanel title="Statutory Deduction Workspace" subtitle="Pre-tax statutory deductions, caps, and calculation basis.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(version?.statutoryDeductions || []).map((item) => (
              <div key={String(item.id)} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[#0F172A]">{String(item.label || item.id)}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {item.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#64748B]">{String(item.calculationBasis || '')}</p>
                <p className="mt-2 text-sm font-semibold text-[#0F172A]">
                  Rate {pctFmt.format(Number(item.rate || 0) * 100)}%
                  {item.monthlyCap ? ` · monthly cap ${money(Number(item.monthlyCap), true)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </WorkspacePanel>
      )}

      {tab === 'reliefs' && (
        <WorkspacePanel title="Relief Configuration" subtitle="CRA, pension, NHF, and approved employee reliefs.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(version?.reliefs || []).map((item) => (
              <div key={String(item.id)} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                <p className="font-semibold text-[#0F172A]">{String(item.label || item.id)}</p>
                <p className="mt-2 text-xs text-[#64748B]">{String(item.calculationBasis || '')}</p>
                <p className="mt-2 text-sm font-semibold text-[#0F172A]">
                  Rate {pctFmt.format(Number(item.rate || 0) * 100)}%
                  {item.annualCap ? ` · annual cap ${money(Number(item.annualCap), true)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </WorkspacePanel>
      )}

      {tab === 'changes' && (
        <WorkspacePanel title="Tax Regulation Timeline" subtitle="Tax Act versions, government circulars, and effective dates.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(version?.regulatoryChanges || []).map((item) => (
              <div key={String(item.id)} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <p className="text-sm font-semibold text-[#0F172A]">{String(item.title || item.id)}</p>
                <p className="mt-1 text-xs font-medium text-[#64748B]">Effective {String(item.effectiveDate || version?.effectiveFrom || '')}</p>
                <p className="mt-3 text-sm text-[#64748B]">{String(item.impact || '')}</p>
              </div>
            ))}
          </div>
        </WorkspacePanel>
      )}

      {selectedEmployee ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 p-3 sm:p-5">
          <div className="flex h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
              <div className="flex items-center gap-3">
                <EmployeeAvatar fullName={selectedEmployee.fullName} employeeId={selectedEmployee.employeeId} size="lg" tryPhoto />
                <div>
                  <h3 className="text-lg font-semibold text-[#0F172A]">{selectedEmployee.fullName}</h3>
                  <p className="text-sm text-[#64748B]">{selectedEmployee.employeeId} · {selectedEmployee.department}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedEmployee(null)} className="rounded-lg border border-[#E5E7EB] p-2 text-[#64748B] hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-auto p-5">
              {selectedEmployee.payeMethod === 'contract-flat' ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                  <p className="font-semibold">Contract flat PAYE</p>
                  <p className="mt-2">
                    Monthly PAYE = 5% × monthly gross ({grossDisplay(selectedEmployee)} × 5% = {money(selectedEmployee.monthlyPaye, canViewMoney)}).
                  </p>
                  <p className="mt-2 text-xs text-violet-800">Not annualized. Progressive tax bands and reliefs do not apply.</p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <SummaryTile label="Tax Method" value={selectedEmployee.payeMethodLabel || (selectedEmployee.payeMethod === 'contract-flat' ? 'Contract flat 5%' : 'Progressive PAYE')} />
                <SummaryTile label="Monthly Gross" value={grossDisplay(selectedEmployee)} />
                <SummaryTile label="Monthly PAYE" value={money(selectedEmployee.monthlyPaye, canViewMoney)} />
                <SummaryTile label="Annual PAYE" value={money(selectedEmployee.annualPaye, canViewMoney)} />
                {selectedEmployee.payeMethod !== 'contract-flat' ? (
                  <>
                    <SummaryTile label="Chargeable Income" value={money(selectedEmployee.annualChargeableIncome, canViewMoney)} />
                    <SummaryTile label="Reliefs" value={money(selectedEmployee.annualReliefs, canViewMoney)} />
                  </>
                ) : null}
              </div>
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                  <History className="h-4 w-4 text-[#2563EB]" />
                  Audit & Validation
                </div>
                <p className="mt-2 text-sm text-[#64748B]">Status: {selectedEmployee.status}</p>
                {selectedEmployee.issues.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-[#64748B]">
                    {selectedEmployee.issues.map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-emerald-700">No validation exceptions recorded.</p>
                )}
              </div>
              <button type="button" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-sm font-semibold text-white hover:bg-blue-700">
                <Eye className="h-4 w-4" />
                View Tax Breakdown
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <p className="text-xs font-medium text-[#64748B]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#0F172A]">{value}</p>
    </div>
  );
}
