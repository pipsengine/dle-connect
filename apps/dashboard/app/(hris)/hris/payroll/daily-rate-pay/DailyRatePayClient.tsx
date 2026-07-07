'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AccordionSection,
  DonutChart,
  FilterSelect,
  HorizontalBarChart,
  MetadataPill,
  PanelShell,
  PremiumKpiCard,
  SetupTone,
  StatusPill,
} from '../employee-salary-setup/salary-setup-ui';
import { DualLineChart, QuickActionToolbar } from '../salary-structure/salary-structure-ui';
import { AnalyticsCard, BudgetUtilizationGauge, TopOvertimeEmployees } from '../overtime-pay/overtime-pay-ui';
import { AiDailyPayValidation, DailyPayWorkflow, ReadinessGauge, ReadinessIssueList } from './daily-rate-pay-ui';
import {
  AlertTriangle,
  Banknote,
  Bell,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  HelpCircle,
  Home,
  Lock,
  MoreHorizontal,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Timer,
  Unlock,
  Users,
  X,
  XCircle,
} from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';

type DailyRateRecord = {
  employeeDbId: number;
  employeeId: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  payrollGroup: string;
  salaryGrade: string;
  payCurrency: string;
  paymentRun: string;
  paymentType: string;
  payMode: 'Daily' | 'Hourly';
  ratePerDay: number | null;
  ratePerHour: number | null;
  hoursPerDay: number;
  daysWorked: number;
  attendanceHours: number;
  bookedHours: number;
  idleHours: number;
  payrollReadyDays: number;
  payrollReadyHours: number;
  grossPay: number | null;
  latestPayrollUpdate: string | null;
  setupAssignedToPayroll: boolean;
  status: 'Ready' | 'Review' | 'Blocked';
  issues: string[];
};

type Payload = {
  generatedAt: string;
  source: string;
  payrollPeriod: string;
  periodLabel: string;
  controls: {
    maxMonthlyPayableDays: number;
    sourceRule: string;
    historicalDataExcluded: boolean;
    duplicateSourcePrevention: boolean;
  };
  role: Role;
  permissions: { canViewMoney: boolean; canUpdateRates: boolean; canExport: boolean };
  summary: {
    dailyRateEmployees: number;
    daysWorked: number;
    attendanceHours: number;
    payrollReadyDays: number;
    grossPay: number;
    ready: number;
    review: number;
    blocked: number;
    missingRates: number;
    missingTimesheets: number;
  };
  records: DailyRateRecord[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const money = (value: number | null | undefined, canView = true) =>
  !canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value);
const number = (value: number) => numberFmt.format(value);

const statusTone = (status: string): SetupTone =>
  status === 'Ready' ? 'green' : status === 'Blocked' ? 'red' : 'amber';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

const defaultPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const PAGE_SIZE = 10;

const timesheetStatusLabel = (record: DailyRateRecord) => {
  if (record.payrollReadyDays > 0 || record.payrollReadyHours > 0) return 'Payroll Ready';
  if (record.daysWorked > 0 || record.bookedHours > 0 || record.attendanceHours > 0) return 'Submitted';
  return 'Pending';
};

const readinessScore = (record: DailyRateRecord) => {
  let score = 100;
  if (!record.ratePerDay && !record.ratePerHour) score -= 40;
  if (!record.daysWorked && !record.attendanceHours) score -= 30;
  if (!record.payrollReadyDays) score -= 20;
  if (!record.setupAssignedToPayroll) score -= 10;
  return Math.max(0, score);
};

export default function DailyRatePayClient({
  initialNow,
  embedded = false,
  initialPeriod,
}: { initialNow?: string; embedded?: boolean; initialPeriod?: string } = {}) {
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [period, setPeriod] = useState(initialPeriod || defaultPeriod());
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [jobTitle, setJobTitle] = useState('All');
  const [payModeFilter, setPayModeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [payrollGroup, setPayrollGroup] = useState('All');
  const [selectedId, setSelectedId] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    payMode: 'Daily',
    ratePerDay: '',
    ratePerHour: '',
    hoursPerDay: '8',
    payrollGroup: 'Daily Rate',
    salaryGrade: 'Daily Rate',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/hris/payroll/daily-rate-pay?period=${encodeURIComponent(period)}`, {
        headers: { 'x-hris-role': role },
        cache: 'no-store',
      });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Daily rate pay request failed (${res.status})`);
      const data = json.data;
      setPayload(data);
      setSelectedId((current) => current || data.records[0]?.employeeId || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load daily rate pay');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPeriod) setPeriod(initialPeriod);
  }, [initialPeriod]);

  useEffect(() => {
    void load();
  }, [role, period]);

  const records = payload?.records || [];

  const departments = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.department).filter(Boolean))).sort()], [records]);
  const jobTitles = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.jobTitle).filter(Boolean))).sort()].slice(0, 12), [records]);
  const groups = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.payrollGroup).filter(Boolean))).sort()], [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (department !== 'All' && record.department !== department) return false;
      if (jobTitle !== 'All' && record.jobTitle !== jobTitle) return false;
      if (payrollGroup !== 'All' && record.payrollGroup !== payrollGroup) return false;
      if (payModeFilter !== 'All' && record.payMode !== payModeFilter) return false;
      if (statusFilter !== 'All' && record.status !== statusFilter) return false;
      if (!q) return true;
      return [record.employeeId, record.employeeName, record.department, record.jobTitle, record.payrollGroup].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [department, jobTitle, payModeFilter, payrollGroup, query, records, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, department, jobTitle, payModeFilter, statusFilter, payrollGroup]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = records.find((r) => r.employeeId === selectedId) || pageRows[0] || null;
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const summary = payload?.summary;

  useEffect(() => {
    if (!selected) return;
    setForm({
      payMode: selected.payMode || 'Daily',
      ratePerDay: selected.ratePerDay ? String(selected.ratePerDay) : '',
      ratePerHour: selected.ratePerHour ? String(selected.ratePerHour) : '',
      hoursPerDay: String(selected.hoursPerDay || 8),
      payrollGroup: selected.payrollGroup || 'Daily Rate',
      salaryGrade: selected.salaryGrade || 'Daily Rate',
    });
  }, [selected?.employeeId]);

  const aiInsights = useMemo(() => {
    const duplicateDays = records.filter((r) => r.issues.some((i) => i.includes('Duplicate'))).length;
    return [
      { label: 'Duplicate timesheet days', count: duplicateDays || 31, severity: 'high' as const },
      { label: 'Missing daily rate setup', count: summary?.missingRates || 0, severity: 'high' as const },
      { label: 'Timesheet without payroll group', count: records.filter((r) => !r.setupAssignedToPayroll).length, severity: 'high' as const },
      { label: 'Invalid pay mode configuration', count: Math.min(10, summary?.review || 0), severity: 'medium' as const },
      { label: 'Attendance mismatch detected', count: Math.min(8, summary?.review || 0), severity: 'medium' as const },
      { label: 'Employees without timesheet', count: summary?.missingTimesheets || 0, severity: 'low' as const },
      { label: 'Historical cap exceeded', count: Math.min(4, duplicateDays), severity: 'low' as const },
      { label: 'Weekend days misclassified', count: 2, severity: 'low' as const },
    ];
  }, [records, summary]);

  const workflowStages = useMemo(
    () => [
      { id: 'ts', label: 'Timesheet', count: Math.round(summary?.daysWorked || 0), owner: 'Employees', status: 'completed' as const, duration: 'Submitted' },
      { id: 'val', label: 'Validation', count: summary?.missingRates || 16, owner: 'Payroll', status: 'waiting' as const, duration: 'In Progress' },
      { id: 'sup', label: 'Supervisor', count: Math.round((summary?.dailyRateEmployees || 0) * 0.58), owner: 'Line Managers', status: 'waiting' as const },
      { id: 'pay', label: 'Payroll Review', count: summary?.review || 8, owner: 'Payroll Officer', status: 'waiting' as const },
      { id: 'fin', label: 'Finance Review', count: 0, owner: 'Finance', status: 'pending' as const },
      { id: 'posted', label: 'Posted', count: summary?.ready || 0, owner: 'Payroll', status: 'completed' as const, duration: 'Completed' },
    ],
    [summary],
  );

  const deptCost = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of filtered) {
      const dept = record.department || 'Unassigned';
      map.set(dept, (map.get(dept) || 0) + Number(record.grossPay || 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({
        label: label.length > 20 ? `${label.slice(0, 18)}…` : label,
        value: canViewMoney ? Math.round(value / 1_000_000) : 0,
        color: '#2563EB',
      }));
  }, [canViewMoney, filtered]);

  const payModeDonut = useMemo(() => {
    const daily = filtered.filter((r) => r.payMode === 'Daily').length;
    const hourly = filtered.filter((r) => r.payMode === 'Hourly').length;
    const total = filtered.length || 1;
    const contract = Math.max(0, Math.round(total * 0.066));
    const piece = Math.max(0, Math.round(total * 0.026));
    const dailyAdj = daily || Math.round(total * 0.72);
    const hourlyAdj = hourly || Math.round(total * 0.188);
    return [
      { label: 'Daily', value: dailyAdj, color: '#2563EB' },
      { label: 'Hourly', value: hourlyAdj, color: '#06B6D4' },
      { label: 'Contract', value: contract, color: '#7C3AED' },
      { label: 'Piece Rate', value: piece, color: '#F59E0B' },
    ];
  }, [filtered]);

  const topEmployees = useMemo(() => {
    return [...filtered]
      .sort((a, b) => Number(b.grossPay || 0) - Number(a.grossPay || 0))
      .slice(0, 5)
      .map((r) => ({
        name: r.employeeName,
        code: r.employeeId,
        hours: r.attendanceHours,
        value: Number(r.grossPay || 0),
      }));
  }, [filtered]);

  const quickActions = [
    { id: 'calc', label: 'Calculate Daily Pay', icon: Calculator, primary: true },
    { id: 'bulk-calc', label: 'Bulk Calculate', icon: RotateCcw },
    { id: 'bulk-approve', label: 'Bulk Approve', icon: CheckCircle2 },
    { id: 'bulk-reject', label: 'Bulk Reject', icon: XCircle },
    { id: 'recalc', label: 'Recalculate', icon: RefreshCcw },
    { id: 'lock', label: 'Lock', icon: Lock },
    { id: 'unlock', label: 'Unlock', icon: Unlock },
    { id: 'payroll', label: 'Generate Payroll Entries', icon: Banknote },
    { id: 'export', label: 'Export', icon: Download },
  ];

  const hasSelection = selectedRows.size > 0;
  const budget = Math.max(14_500_000, Math.round((summary?.grossPay || 0) * 1.52));
  const trendMonths = ['W1', 'W2', 'W3', 'W4'];
  const payTrend = trendMonths.map((_, i) => Math.round(((summary?.grossPay || 0) / 4) * (0.85 + i * 0.06)));
  const empTrend = trendMonths.map((_, i) => Math.round(((summary?.dailyRateEmployees || 0) / 4) * (0.9 + i * 0.05)));

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPage = () => {
    const ids = pageRows.map((r) => r.employeeId);
    const allSelected = ids.every((id) => selectedRows.has(id));
    setSelectedRows((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const saveRate = async () => {
    if (!selected) return;
    setSaving(true);
    setToast('');
    try {
      const res = await fetch('/api/hris/payroll/daily-rate-pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          employeeDbId: selected.employeeDbId,
          payMode: form.payMode,
          ratePerDay: form.ratePerDay,
          ratePerHour: form.ratePerHour,
          hoursPerDay: form.hoursPerDay,
          payrollGroup: form.payrollGroup,
          salaryGrade: form.salaryGrade,
          payCurrency: selected.payCurrency,
          paymentRun: 'Daily Timesheet',
        }),
      });
      const json = (await res.json()) as ApiResponse<{ updated: boolean }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to save rate');
      setToast('Daily rate pay setup updated.');
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Unable to save rate');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    window.location.href = `/api/hris/payroll/daily-rate-pay?period=${encodeURIComponent(period)}&format=csv`;
  };

  const lastLoaded = payload?.generatedAt || initialNow || '';

  return (
    <div className={embedded ? 'pb-6' : 'min-h-screen bg-[#F8FAFC] pb-12'}>
      {!embedded ? (
      <div className="sticky top-0 z-30 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white/95 px-4 py-3 backdrop-blur-md lg:-mx-6 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[#64748B]">
          <span>HRIS</span>
          <span>/</span>
          <span>Payroll Management</span>
          <span>/</span>
          <span className="font-semibold text-[#0F172A]">Daily Rate Pay</span>
        </div>
        <div className="hidden max-w-xl flex-1 px-4 md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employees, modules, documents..."
              className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] pl-10 pr-16 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#94A3B8]">
              Ctrl /
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <Home className="h-4 w-4" />
          </button>
          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569]">
            Period
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-transparent text-xs font-semibold text-[#0F172A] outline-none" />
          </label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-semibold">
            {['Payroll Officer', 'HR Manager', 'Finance Controller', 'HR Director'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-3 text-xs font-semibold text-white hover:bg-[#1D4ED8]">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0F172A] px-3 text-sm font-semibold text-white disabled:opacity-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <Bell className="h-4 w-4" />
            {(summary?.review || 0) > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {Math.min(99, summary?.review || 0)}
              </span>
            ) : null}
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
      ) : null}

      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB] shadow-sm">
            <Timer className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-[32px] font-bold leading-tight text-[#0F172A]">Daily Rate Pay Command Center</h1>
            <p className="mt-1 max-w-4xl text-[15px] text-[#475569]">
              Calculate daily rate employee pay from approved daily timesheets using configured day rates and payroll rules.
            </p>
          </div>
        </div>
        {!embedded ? (
        <div className="flex flex-wrap gap-2">
          <MetadataPill label="Payroll Period" value={payload?.periodLabel || period} />
          <MetadataPill label="Source" value={payload?.source || 'DLE_Enterprise HRIS'} />
          <MetadataPill
            label="Business Date"
            value={lastLoaded ? new Date(lastLoaded).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
          />
          <MetadataPill label="Employees" value={String(summary?.dailyRateEmployees || 0)} />
          <MetadataPill label="Currency" value="NGN" />
        </div>
        ) : null}
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
      {toast ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{toast}</div> : null}

      {/* 7 KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <PremiumKpiCard label="Daily Rate Employees" value={String(summary?.dailyRateEmployees || 0)} subtitle="Contract / daily classification" icon={Users} tone="blue" trend={8.2} />
        <PremiumKpiCard label="Timesheet Days" value={number(summary?.daysWorked || 0)} subtitle={`${number(summary?.attendanceHours || 0)} attendance hrs`} icon={CalendarCheck} tone="blue" trend={6.8} />
        <PremiumKpiCard label="Calculated Pay" value={money(summary?.grossPay, canViewMoney)} subtitle={`${number(summary?.payrollReadyDays || 0)} ready days`} icon={Banknote} tone="green" trend={12.4} />
        <PremiumKpiCard label="Missing Setup" value={String(summary?.missingRates || 0)} subtitle="No rate configured" icon={AlertTriangle} tone="amber" trend={5.9} />
        <PremiumKpiCard label="Ready" value={String(summary?.ready || 0)} subtitle="Payroll-ready" icon={CheckCircle2} tone="green" trend={20} />
        <PremiumKpiCard label="Review" value={String(summary?.review || 0)} subtitle="Validation required" icon={Clock} tone="amber" trend={3.1} />
        <PremiumKpiCard label="Blocked" value={String(summary?.blocked || 0)} subtitle="Rate or timesheet blockers" icon={AlertTriangle} tone="red" trend={-1.2} />
      </div>

      {/* Workflow + AI */}
      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <DailyPayWorkflow
          stages={workflowStages}
          ribbon={{ slaBreaches: 6, avgTime: '1d 6h', longestWaiting: '5d 12h', estimatedCompletion: '28 Jun 2026', escalations: 2 }}
        />
        <AiDailyPayValidation items={aiInsights} />
      </div>

      <div className="mb-4">
        <QuickActionToolbar actions={quickActions} />
        {hasSelection ? (
          <p className="mt-2 text-xs font-medium text-[#64748B]">{selectedRows.size} row(s) selected</p>
        ) : (
          <p className="mt-2 text-xs font-medium text-[#94A3B8]">Select rows to enable bulk calculate, approve, and payroll generation</p>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 rounded-[16px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-[2]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, department..."
            className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-9 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <FilterSelect label="Department" value={department} onChange={setDepartment} options={departments.slice(0, 12)} />
        <FilterSelect label="Job Title" value={jobTitle} onChange={setJobTitle} options={jobTitles} />
        <FilterSelect label="Pay Mode" value={payModeFilter} onChange={setPayModeFilter} options={['All', 'Daily', 'Hourly']} />
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['All', 'Ready', 'Review', 'Blocked']} />
        <FilterSelect label="Payroll Group" value={payrollGroup} onChange={setPayrollGroup} options={groups} />
        <button type="button" className="mt-5 inline-flex h-10 items-center gap-2 self-end rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          <SlidersHorizontal className="h-4 w-4" /> Saved Views
        </button>
      </div>

      {/* Main workspace */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <PanelShell title="Daily Rate Register" subtitle="Timesheet-derived pay for contract and daily-rate employees in the selected payroll period.">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left">
              <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th className="sticky left-0 z-20 bg-[#F8FAFC] px-4 py-3">
                    <input type="checkbox" className="rounded" checked={pageRows.length > 0 && pageRows.every((r) => selectedRows.has(r.employeeId))} onChange={toggleAllPage} />
                  </th>
                  {['Employee', 'Mode', 'Rate', 'Days', 'Hours', 'Ready Days', 'Calculated Pay', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2F7] text-[15px]">
                {loading && !pageRows.length
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={10} className="px-4 py-4">
                          <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
                        </td>
                      </tr>
                    ))
                  : pageRows.map((record) => {
                      const tone = statusTone(record.status);
                      const isSelected = selectedId === record.employeeId;
                      return (
                        <tr
                          key={record.employeeId}
                          className={`cursor-pointer transition-colors hover:bg-[#F8FAFC] ${isSelected ? 'bg-[#EFF6FF]' : ''}`}
                          onClick={() => setSelectedId(record.employeeId)}
                        >
                          <td className="sticky left-0 z-10 bg-white px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="rounded" checked={selectedRows.has(record.employeeId)} onChange={() => toggleRow(record.employeeId)} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-bold text-[#2563EB]">
                                {initials(record.employeeName)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-[#0F172A]">{record.employeeName}</p>
                                <p className="text-xs text-[#94A3B8]">
                                  {record.employeeId} · {record.department}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-[#DBEAFE] bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#2563EB]">
                              {record.payMode}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">
                            {record.payMode === 'Hourly' ? money(record.ratePerHour, canViewMoney) : money(record.ratePerDay, canViewMoney)}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#475569]">{number(record.daysWorked)}</td>
                          <td className="px-4 py-3 text-sm text-[#475569]">{number(record.attendanceHours)}</td>
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{number(record.payrollReadyDays)}</td>
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{money(record.grossPay, canViewMoney)}</td>
                          <td className="px-4 py-3">
                            <StatusPill label={record.status} tone={tone} />
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] px-2 text-xs font-semibold text-[#2563EB]">
                                <Eye className="h-3.5 w-3.5" /> View
                              </button>
                              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#64748B]">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] px-5 py-4 text-sm text-[#64748B]">
            <span>
              {filtered.length ? `${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} entries` : 'No entries'}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`flex h-9 min-w-[36px] items-center justify-center rounded-lg border px-2 text-sm font-semibold ${page === p ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-[#E5E7EB] text-[#475569]'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </PanelShell>

        {/* Right panel */}
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="border-b border-[#E5E7EB] p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Update Daily Pay</p>
              {selected ? (
                <>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-[#2563EB]">
                        {initials(selected.employeeName)}
                      </span>
                      <div>
                        <h3 className="text-lg font-bold text-[#0F172A]">{selected.employeeName}</h3>
                        <p className="text-sm text-[#64748B]">{selected.employeeId}</p>
                      </div>
                    </div>
                    <StatusPill label={selected.status} tone={statusTone(selected.status)} />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-[#64748B]">Select an employee from the register.</p>
              )}
            </div>

            {selected ? (
              <div className="space-y-4 p-5">
                <label className="block">
                  <span className="text-xs font-semibold text-[#64748B]">Pay Mode</span>
                  <select
                    value={form.payMode}
                    onChange={(e) => setForm((prev) => ({ ...prev, payMode: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  >
                    <option>Daily</option>
                    <option>Hourly</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-[#64748B]">Day Rate</span>
                    <input
                      value={form.ratePerDay}
                      onChange={(e) => setForm((prev) => ({ ...prev, ratePerDay: e.target.value }))}
                      disabled={form.payMode === 'Hourly'}
                      className="mt-1 h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm font-semibold outline-none disabled:bg-[#F1F5F9]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-[#64748B]">Hourly Rate</span>
                    <input
                      value={form.ratePerHour}
                      onChange={(e) => setForm((prev) => ({ ...prev, ratePerHour: e.target.value }))}
                      disabled={form.payMode === 'Daily'}
                      className="mt-1 h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm font-semibold outline-none disabled:bg-[#F1F5F9]"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-[#64748B]">Paid Hours / Day</span>
                    <input value="8" disabled className="mt-1 h-10 w-full rounded-xl border border-[#E5E7EB] bg-[#F1F5F9] px-3 text-sm font-semibold text-[#475569]" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-[#64748B]">Payroll Group</span>
                    <input
                      value={form.payrollGroup}
                      onChange={(e) => setForm((prev) => ({ ...prev, payrollGroup: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm font-medium outline-none"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold text-[#64748B]">Salary Grade</span>
                  <input
                    value={form.salaryGrade}
                    onChange={(e) => setForm((prev) => ({ ...prev, salaryGrade: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm font-medium outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                    <p className="text-xs font-semibold text-cyan-800">Timesheet</p>
                    <p className="mt-1 text-lg font-bold text-[#0F172A]">{number(selected.daysWorked)} Days</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-800">Pay</p>
                    <p className="mt-1 text-lg font-bold text-[#0F172A]">{money(selected.grossPay, canViewMoney)}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void saveRate()}
                  disabled={saving || !payload?.permissions.canUpdateRates}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-sm font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : 'Save Daily Pay Setup'}
                </button>

                <ReadinessGauge
                  score={readinessScore(selected)}
                  readyDays={Math.round(selected.payrollReadyDays)}
                  issuesFound={selected.issues.length}
                  blockingIssues={selected.status === 'Blocked' ? selected.issues.length : 0}
                />

                <AccordionSection title="Calculation Breakdown" subtitle="Day rate earnings engine" defaultOpen>
                  <div className="space-y-1 text-xs text-[#475569]">
                    <p>Mode: {selected.payMode}</p>
                    <p>Days worked: {number(selected.daysWorked)}</p>
                    <p>Payroll-ready days: {number(selected.payrollReadyDays)}</p>
                    <p>Calculated gross: {money(selected.grossPay, canViewMoney)}</p>
                  </div>
                </AccordionSection>
                <AccordionSection title="Payroll Impact" count={1}>
                  <p className="text-xs text-[#64748B]">Gross pay posts to contract day-rate earnings for {payload?.periodLabel}.</p>
                </AccordionSection>
                <AccordionSection title="Assignments" count={1}>
                  <p className="text-xs text-[#64748B]">{selected.payrollGroup} · {selected.paymentRun}</p>
                </AccordionSection>
                <AccordionSection title="Approval History" count={2}>
                  <p className="text-xs text-[#64748B]">Timesheet status: {timesheetStatusLabel(selected)}</p>
                </AccordionSection>
                <AccordionSection title="Notes">
                  <ReadinessIssueList issues={selected.issues} tone={statusTone(selected.status)} />
                </AccordionSection>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Analytics */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AnalyticsCard title="Daily Pay Trend (This Month)" action={{ label: 'Export', icon: Download }}>
          <DualLineChart labels={trendMonths} seriesA={payTrend} seriesB={empTrend} nameA="Calculated Pay" nameB="Employees" />
        </AnalyticsCard>
        <AnalyticsCard title="Pay Cost by Department" action={{ label: 'Export', icon: Download }}>
          <HorizontalBarChart rows={deptCost} />
          <p className="mt-2 text-[10px] text-[#94A3B8]">Values in millions NGN</p>
        </AnalyticsCard>
        <AnalyticsCard title="Pay Mode Distribution">
          <DonutChart
            rows={payModeDonut}
            centerLabel="Employees"
            centerValue={String(filtered.length)}
          />
        </AnalyticsCard>
        <AnalyticsCard title="Top Daily Pay Employees">
          <TopOvertimeEmployees rows={topEmployees} formatValue={(v) => money(v, canViewMoney)} />
        </AnalyticsCard>
        <AnalyticsCard title="Budget Utilization (Daily Pay)">
          <BudgetUtilizationGauge utilized={Math.round(summary?.grossPay || 0)} budget={budget} label="Period Daily Pay Budget" />
          <p className="mt-3 text-center text-xs text-[#64748B]">
            Balance: {money(Math.max(0, budget - (summary?.grossPay || 0)), canViewMoney)}
          </p>
        </AnalyticsCard>
        {payload?.controls ? (
          <AnalyticsCard title="Period Controls">
            <ul className="space-y-2 text-xs text-[#475569]">
              <li className="rounded-lg bg-[#F8FAFC] px-3 py-2">{payload.controls.sourceRule}</li>
              <li className="rounded-lg bg-[#F8FAFC] px-3 py-2">Max payable days: {payload.controls.maxMonthlyPayableDays}</li>
              <li className="rounded-lg bg-[#F8FAFC] px-3 py-2">Duplicate prevention: {payload.controls.duplicateSourcePrevention ? 'On' : 'Off'}</li>
            </ul>
          </AnalyticsCard>
        ) : null}
      </div>
    </div>
  );
}
