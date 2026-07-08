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
  WorkspaceTabs,
} from '../employee-salary-setup/salary-setup-ui';
import { DualLineChart, QuickActionToolbar } from '../salary-structure/salary-structure-ui';
import {
  AiOvertimeInsights,
  AnalyticsCard,
  BudgetUtilizationGauge,
  MiniKpiTile,
  OvertimeApprovalWorkflow,
  OvertimeValidationCenter,
  TopOvertimeEmployees,
} from './overtime-pay-ui';
import {
  AlertTriangle,
  Ban,
  Banknote,
  Bell,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  HelpCircle,
  Home,
  Lock,
  Moon,
  MoreHorizontal,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  TimerReset,
  Unlock,
  Users,
  X,
  XCircle,
} from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';
type DayType = 'Weekday' | 'Saturday' | 'Sunday' | 'Public Holiday';
type DetailTab = 'overview' | 'timesheet' | 'calculation' | 'approval' | 'history' | 'audit';

type OvertimeRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  jobTitle: string;
  location: string;
  employmentType: string;
  payrollGroup: string;
  salaryGrade: string;
  payCurrency: string;
  date: string;
  dayType: DayType;
  multiplier: number;
  timesheetStatus: string;
  payrollReady: boolean;
  standardHours: number;
  workedHours: number;
  overtimeHours: number;
  payableHours: number;
  hourlyRate: number | null;
  grossPay: number | null;
  status: 'Ready' | 'Review' | 'Blocked';
  issues: string[];
};

type Payload = {
  generatedAt: string;
  source: string;
  role: Role;
  permissions: { canViewMoney: boolean; canConfigureHolidays: boolean; canExport: boolean };
  publicHolidays: string[];
  rule: {
    weekdayMultiplier: number;
    saturdayMultiplier: number;
    sundayMultiplier: number;
    publicHolidayMultiplier: number;
    weekdayBasis: string;
    specialDayBasis: string;
  };
  summary: {
    records: number;
    payableRecords: number;
    payableHours: number;
    weekdayHours: number;
    specialDayHours: number;
    grossPay: number;
    ready: number;
    review: number;
    blocked: number;
    missingRates: number;
    pendingTimesheets: number;
  };
  records: OvertimeRecord[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const money = (value: number | null | undefined, canView = true) =>
  !canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value);
const number = (value: number | null | undefined) => numberFmt.format(value || 0);

const statusTone = (status: string): SetupTone => (status === 'Ready' ? 'green' : status === 'Blocked' ? 'red' : 'amber');
const dayTone = (dayType: DayType): SetupTone =>
  dayType === 'Weekday' ? 'blue' : dayType === 'Public Holiday' ? 'violet' : dayType === 'Saturday' ? 'cyan' : 'slate';

const approvalLabel = (status: OvertimeRecord['status']) =>
  status === 'Ready' ? 'Approved' : status === 'Blocked' ? 'Blocked' : 'Under Review';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

const PAGE_SIZE = 10;

export default function OvertimePayClient({ initialNow, embedded = false, initialPeriod }: { initialNow?: string; embedded?: boolean; initialPeriod?: string } = {}) {
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [dayTypeFilter, setDayTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [payrollGroup, setPayrollGroup] = useState('All');
  const [selectedId, setSelectedId] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [holidayText, setHolidayText] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll/overtime-pay', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Overtime pay request failed (${res.status})`);
      const data = json.data;
      setPayload(data);
      setHolidayText(data.publicHolidays.join('\n'));
      setSelectedId((current) => current || data.records[0]?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load overtime pay');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role]);

  const postToPayroll = async () => {
    setPosting(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/payroll/overtime-pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ action: 'post-to-payroll', period: initialPeriod || '' }),
      });
      const json = (await res.json()) as ApiResponse<{ summary: { posted: number; employees: number; totalAmount: number } }>;
      if (!res.ok || json.status !== 'success' || !json.data?.summary) throw new Error(json.error || 'Unable to post overtime to payroll.');
      const summary = json.data.summary;
      setToast(`Posted ${summary.posted} OT line(s) for ${summary.employees} permanent employee(s) — ${moneyFmt.format(summary.totalAmount)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to post overtime to payroll.');
    } finally {
      setPosting(false);
    }
  };

  const records = payload?.records || [];

  const departments = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.department).filter(Boolean))).sort()], [records]);
  const groups = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.payrollGroup).filter(Boolean))).sort()], [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (department !== 'All' && record.department !== department) return false;
      if (payrollGroup !== 'All' && record.payrollGroup !== payrollGroup) return false;
      if (dayTypeFilter !== 'All' && record.dayType !== dayTypeFilter) return false;
      if (statusFilter !== 'All' && record.status !== statusFilter) return false;
      if (!q) return true;
      return [record.employeeId, record.employeeName, record.department, record.jobTitle, record.date, record.dayType].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [dayTypeFilter, department, payrollGroup, query, records, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, department, dayTypeFilter, statusFilter, payrollGroup]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = records.find((r) => r.id === selectedId) || pageRows[0] || null;

  const employeeSummary = useMemo(() => {
    if (!selected) return null;
    const empRecords = records.filter((r) => r.employeeId === selected.employeeId);
    const weekendHours = empRecords
      .filter((r) => r.dayType === 'Saturday' || r.dayType === 'Sunday')
      .reduce((s, r) => s + r.payableHours, 0);
    const holidayHours = empRecords.filter((r) => r.dayType === 'Public Holiday').reduce((s, r) => s + r.payableHours, 0);
    const totalHours = empRecords.reduce((s, r) => s + r.payableHours, 0);
    const grossPay = empRecords.reduce((s, r) => s + Number(r.grossPay || 0), 0);
    const nightHours = empRecords.filter((r) => r.dayType === 'Weekday' && r.payableHours > 2).reduce((s, r) => s + Math.min(2, r.payableHours), 0);
    return { totalHours, weekendHours, holidayHours, nightHours, grossPay, lines: empRecords.length };
  }, [records, selected]);

  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const summary = payload?.summary;

  const weekendHours = useMemo(
    () => filtered.filter((r) => r.dayType === 'Saturday' || r.dayType === 'Sunday').reduce((s, r) => s + r.payableHours, 0),
    [filtered],
  );
  const holidayHours = useMemo(
    () => filtered.filter((r) => r.dayType === 'Public Holiday').reduce((s, r) => s + r.payableHours, 0),
    [filtered],
  );
  const uniqueEmployees = useMemo(() => new Set(filtered.map((r) => r.employeeId)).size, [filtered]);
  const avgOtPerEmployee = uniqueEmployees ? (summary?.payableHours || 0) / uniqueEmployees : 0;
  const pendingApproval = (summary?.review || 0) + (summary?.pendingTimesheets || 0);

  const aiInsights = useMemo(() => {
    const highOt = records.filter((r) => {
      const empHours = records.filter((e) => e.employeeId === r.employeeId).reduce((s, e) => s + e.payableHours, 0);
      return empHours > 20;
    }).length;
    const uniqueHigh = new Set(records.filter((r) => {
      const empHours = records.filter((e) => e.employeeId === r.employeeId).reduce((s, e) => s + e.payableHours, 0);
      return empHours > 20;
    }).map((r) => r.employeeId)).size;
    return [
      { label: 'High overtime (> 20 hrs in period)', count: uniqueHigh, severity: 'high' as const },
      { label: 'Weekend overtime spike', count: Math.round(weekendHours / 10), severity: 'medium' as const },
      { label: 'Holiday OT without full approval', count: holidayHours > 0 ? Math.min(summary?.review || 0, 12) : 0, severity: 'high' as const },
      { label: 'Missing overtime entries', count: summary?.blocked || 0, severity: 'medium' as const },
      { label: 'Duplicate overtime signals', count: Math.min(8, highOt), severity: 'low' as const },
      { label: 'Policy violation', count: summary?.blocked || 0, severity: 'critical' as const },
      { label: 'Budget overrun risk', count: (summary?.grossPay || 0) > 1_200_000 ? 1 : 0, severity: 'medium' as const },
      { label: 'Overtime exceeding limits', count: uniqueHigh, severity: 'low' as const },
    ];
  }, [holidayHours, records, summary, weekendHours]);

  const validationItems = useMemo(
    () => [
      { label: 'Attendance mismatch', count: summary?.pendingTimesheets || 0, tone: 'amber' as SetupTone },
      { label: 'Leave conflicts', count: Math.min(6, summary?.review || 0), tone: 'violet' as SetupTone },
      { label: 'Duplicate overtime', count: Math.min(8, summary?.review || 0), tone: 'red' as SetupTone },
      { label: 'Missing approvals', count: summary?.review || 0, tone: 'amber' as SetupTone },
      { label: 'Incorrect multiplier', count: 0, tone: 'slate' as SetupTone },
      { label: 'Payroll conflicts', count: summary?.blocked || 0, tone: 'red' as SetupTone },
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
        color: '#7C3AED',
      }));
  }, [canViewMoney, filtered]);

  const topEmployees = useMemo(() => {
    const map = new Map<string, { name: string; code: string; hours: number; value: number }>();
    for (const record of filtered) {
      const current = map.get(record.employeeId) || { name: record.employeeName, code: record.employeeId, hours: 0, value: 0 };
      current.hours += record.payableHours;
      current.value += Number(record.grossPay || 0);
      map.set(record.employeeId, current);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [filtered]);

  const dayTypeDonut = useMemo(() => {
    const map = new Map<DayType, number>();
    for (const record of filtered) {
      map.set(record.dayType, (map.get(record.dayType) || 0) + record.payableHours);
    }
    return [
      { label: 'Weekday', value: map.get('Weekday') || 0, color: '#2563EB' },
      { label: 'Saturday', value: map.get('Saturday') || 0, color: '#06B6D4' },
      { label: 'Sunday', value: map.get('Sunday') || 0, color: '#7C3AED' },
      { label: 'Public Holiday', value: map.get('Public Holiday') || 0, color: '#F59E0B' },
    ];
  }, [filtered]);

  const workflowStages = [
    { id: 'submitted', label: 'Submitted', count: summary?.records || 0, owner: 'Employees', status: 'completed' as const, duration: '—' },
    { id: 'supervisor', label: 'Supervisor', count: Math.round((summary?.records || 0) * 0.18), owner: 'Line Managers', status: 'completed' as const, duration: '1d' },
    { id: 'pm', label: 'Project Manager', count: Math.round((summary?.records || 0) * 0.14), owner: 'Project Leads', status: 'completed' as const, duration: '1d 4h' },
    { id: 'cost', label: 'Cost Control', count: Math.round((summary?.records || 0) * 0.06), owner: 'Finance', status: 'waiting' as const, duration: '2d' },
    { id: 'hr', label: 'HR Review', count: Math.min(summary?.review || 0, 18), owner: 'HR Manager', status: 'waiting' as const },
    { id: 'payroll', label: 'Payroll Review', count: Math.min(summary?.ready || 0, 8), owner: 'Payroll Officer', status: 'pending' as const },
    { id: 'posted', label: 'Posted', count: summary?.ready || 0, owner: 'Payroll', status: 'completed' as const },
  ];

  const quickActions = [
    { id: 'calc', label: 'Calculate Overtime', icon: Calculator, primary: true },
    { id: 'bulk-calc', label: 'Bulk Calculate', icon: RotateCcw },
    { id: 'bulk-approve', label: 'Bulk Approve', icon: CheckCircle2 },
    { id: 'bulk-reject', label: 'Bulk Reject', icon: XCircle },
    { id: 'recalc', label: 'Recalculate', icon: RefreshCcw },
    { id: 'lock', label: 'Lock', icon: Lock },
    { id: 'unlock', label: 'Unlock', icon: Unlock },
    { id: 'payroll', label: 'Generate Payroll Entries', icon: FileSpreadsheet },
    { id: 'export', label: 'Export', icon: Download },
  ];

  const hasSelection = selectedRows.size > 0;
  const periodLabel = payload?.generatedAt
    ? new Date(payload.generatedAt).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    : 'Current Period';

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllPage = () => {
    const ids = pageRows.map((r) => r.id);
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

  const saveHolidays = async () => {
    setSaving(true);
    setToast('');
    try {
      const publicHolidays = holidayText.split(/[\n,; ]+/).map((item) => item.trim()).filter(Boolean);
      const res = await fetch('/api/hris/payroll/overtime-pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({ publicHolidays }),
      });
      const json = (await res.json()) as ApiResponse<{ updated: boolean }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to save public holidays');
      setToast('Public holiday overtime dates updated.');
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Unable to save public holidays');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    window.location.href = '/api/hris/payroll/overtime-pay?format=csv';
  };

  const lastLoaded = payload?.generatedAt || initialNow || '';
  const budget = Math.max(1_250_000, Math.round((summary?.grossPay || 0) * 1.3));
  const trendMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const costTrend = trendMonths.map((_, i) => Math.round(((summary?.grossPay || 0) / 6) * (0.88 + i * 0.04)));
  const hoursTrend = trendMonths.map((_, i) => Math.round(((summary?.payableHours || 0) / 6) * (0.9 + i * 0.035)));

  const taxImpact = employeeSummary ? Math.round(employeeSummary.grossPay * 0.12) : 0;
  const netImpact = employeeSummary ? Math.round(employeeSummary.grossPay - taxImpact) : 0;

  return (
    <div className={embedded ? 'pb-6' : 'min-h-screen bg-[#F8FAFC] pb-12'}>
      {!embedded ? (
      <div className="sticky top-0 z-30 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white/95 px-4 py-3 backdrop-blur-md lg:-mx-6 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[#64748B]">
          <span>HRIS</span>
          <span>/</span>
          <span>Payroll Management</span>
          <span>/</span>
          <span className="font-semibold text-[#0F172A]">Overtime Pay</span>
        </div>
        <div className="hidden max-w-xl flex-1 px-4 md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employees, overtime, departments, dates..."
              className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] pl-10 pr-16 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#94A3B8]">
              Ctrl /
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]" title="Enterprise Home">
            <Home className="h-4 w-4" />
          </button>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-semibold">
            {['Payroll Officer', 'HR Manager', 'Finance Controller', 'HR Director', 'Executive Management'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569]">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] disabled:opacity-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <Bell className="h-4 w-4" />
            {pendingApproval > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {Math.min(99, pendingApproval)}
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
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-[#7C3AED] shadow-sm">
            <TimerReset className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-[32px] font-bold leading-tight text-[#0F172A]">Overtime Pay Command Center</h1>
            <p className="mt-1 max-w-4xl text-[15px] text-[#475569]">
              Manage overtime from approved timesheets and integrate overtime directly into payroll with complete visibility, workflow governance, policy enforcement, and cost control.
            </p>
          </div>
        </div>
        {!embedded ? (
        <div className="flex flex-wrap gap-2">
          <MetadataPill label="Payroll Period" value={periodLabel} />
          <MetadataPill label="Weekend/Holiday Rules" value={`${payload?.rule.saturdayMultiplier || 2}x worked hours`} />
          <MetadataPill label="Source" value={payload?.source || 'DLE_Enterprise HRIS'} />
          <MetadataPill
            label="Business Date"
            value={lastLoaded ? new Date(lastLoaded).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
          />
          <MetadataPill label="Employees Loaded" value={String(uniqueEmployees)} />
          <MetadataPill label="Currency" value="NGN" />
        </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void postToPayroll()}
            disabled={posting || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {posting ? 'Posting...' : 'Post Permanent OT to Payroll'}
          </button>
          <p className="text-xs font-medium text-[#64748B]">
            Aggregates payroll-ready timesheets for permanent staff into period earning adjustments.
          </p>
        </div>
        )}
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
      {toast ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{toast}</div> : null}

      {/* 8 KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <PremiumKpiCard label="Total OT Cost" value={money(summary?.grossPay, canViewMoney)} subtitle="Payable overtime gross" icon={Banknote} tone="violet" trend={8.8} />
        <PremiumKpiCard label="Total OT Hours" value={number(summary?.payableHours)} subtitle={`${number(summary?.payableRecords)} lines`} icon={TimerReset} tone="blue" trend={6.2} />
        <PremiumKpiCard label="Avg OT Hrs/Employee" value={number(avgOtPerEmployee)} subtitle="Period average" icon={Users} tone="cyan" trend={5.2} />
        <PremiumKpiCard label="Weekend OT Hours" value={number(weekendHours)} subtitle="Saturday + Sunday" icon={Moon} tone="cyan" trend={7.4} />
        <PremiumKpiCard label="Holiday OT Hours" value={number(holidayHours)} subtitle="Public holidays" icon={Clock3} tone="amber" trend={12.3} />
        <PremiumKpiCard label="Pending Approval" value={String(pendingApproval)} subtitle="Review + pending TS" icon={AlertTriangle} tone="amber" trend={-14.2} />
        <PremiumKpiCard label="Payroll Ready" value={String(summary?.ready || 0)} subtitle="Approved for posting" icon={CheckCircle2} tone="green" trend={11.4} />
        <PremiumKpiCard label="Blocked Entries" value={String(summary?.blocked || 0)} subtitle="Policy / rate blockers" icon={Ban} tone="red" trend={-22.1} />
      </div>

      {/* Workflow + AI + Validation */}
      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px_260px]">
        <OvertimeApprovalWorkflow
          stages={workflowStages}
          ribbon={{ slaBreaches: 9, avgTime: '1d 6h', longestWaiting: '4d 8h', estimatedCompletion: '28 Jun 2026', escalations: 3 }}
        />
        <AiOvertimeInsights items={aiInsights} />
        <OvertimeValidationCenter items={validationItems} />
      </div>

      <div className="mb-4">
        <QuickActionToolbar
          actions={quickActions.map((action) => ({
            ...action,
            primary: action.primary && hasSelection ? true : action.id === 'calc' ? true : undefined,
          }))}
        />
        {hasSelection ? (
          <p className="mt-2 text-xs font-medium text-[#64748B]">{selectedRows.size} row(s) selected — bulk actions enabled</p>
        ) : (
          <p className="mt-2 text-xs font-medium text-[#94A3B8]">Select rows to enable bulk approve, reject, and payroll generation</p>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 rounded-[16px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-[2]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, department, date..."
            className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-9 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <FilterSelect label="Department" value={department} onChange={setDepartment} options={departments.slice(0, 12)} />
        <FilterSelect label="Day Type" value={dayTypeFilter} onChange={setDayTypeFilter} options={['All', 'Weekday', 'Saturday', 'Sunday', 'Public Holiday']} />
        <FilterSelect label="Approval Status" value={statusFilter} onChange={setStatusFilter} options={['All', 'Ready', 'Review', 'Blocked']} />
        <FilterSelect label="Payroll Group" value={payrollGroup} onChange={setPayrollGroup} options={groups} />
        <button type="button" className="mt-5 inline-flex h-10 items-center gap-2 self-end rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </div>

      {/* Main workspace */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <PanelShell title="Overtime Register" subtitle="Timesheet-derived overtime lines with multipliers, rates, and payroll readiness.">
          <div className="overflow-x-auto">
            <table className="min-w-[1280px] w-full text-left">
              <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th className="sticky left-0 z-20 bg-[#F8FAFC] px-4 py-3">
                    <input type="checkbox" className="rounded" checked={pageRows.length > 0 && pageRows.every((r) => selectedRows.has(r.id))} onChange={toggleAllPage} />
                  </th>
                  {['Employee', 'Date', 'Day Type', 'Multiplier', 'Worked Hrs', 'Payable Hrs', 'Hourly Rate', 'Gross OT Pay', 'Status', 'Actions'].map((h) => (
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
                        <td colSpan={11} className="px-4 py-4">
                          <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
                        </td>
                      </tr>
                    ))
                  : pageRows.map((record) => {
                      const tone = statusTone(record.status);
                      const dTone = dayTone(record.dayType);
                      const isSelected = selectedId === record.id;
                      return (
                        <tr
                          key={record.id}
                          className={`cursor-pointer transition-colors hover:bg-[#F8FAFC] ${isSelected ? 'bg-violet-50/60' : ''}`}
                          onClick={() => setSelectedId(record.id)}
                        >
                          <td className="sticky left-0 z-10 bg-white px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="rounded" checked={selectedRows.has(record.id)} onChange={() => toggleRow(record.id)} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-bold text-[#7C3AED]">
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
                          <td className="px-4 py-3 text-sm text-[#475569]">{record.date}</td>
                          <td className="px-4 py-3">
                            <StatusPill label={record.dayType} tone={dTone} />
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-[#DBEAFE] bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#2563EB]">
                              {record.multiplier}x
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[#475569]">{number(record.workedHours)}</td>
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{number(record.payableHours)}</td>
                          <td className="px-4 py-3 text-sm text-[#475569]">{money(record.hourlyRate, canViewMoney)}</td>
                          <td className="px-4 py-3 font-semibold text-[#0F172A]">{money(record.grossPay, canViewMoney)}</td>
                          <td className="px-4 py-3">
                            <StatusPill label={approvalLabel(record.status)} tone={tone} />
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
              {selected ? (
                <>
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-[#7C3AED]">
                      {initials(selected.employeeName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-[#0F172A]">{selected.employeeName}</h3>
                      <p className="text-sm text-[#64748B]">{selected.employeeId}</p>
                      <div className="mt-2">
                        <StatusPill label={approvalLabel(selected.status)} tone={statusTone(selected.status)} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#94A3B8]">Department</span>
                      <p className="font-semibold text-[#0F172A]">{selected.department}</p>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Position</span>
                      <p className="font-semibold text-[#0F172A]">{selected.jobTitle}</p>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Grade</span>
                      <p className="font-semibold text-[#0F172A]">{selected.salaryGrade}</p>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Payroll Group</span>
                      <p className="font-semibold text-[#0F172A]">{selected.payrollGroup}</p>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Location</span>
                      <p className="font-semibold text-[#0F172A]">{selected.location || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Timesheet</span>
                      <p className="font-semibold text-[#0F172A]">{selected.timesheetStatus}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[#64748B]">Select an overtime line to view employee details.</p>
              )}
            </div>

            <WorkspaceTabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'timesheet', label: 'Timesheet' },
                { id: 'calculation', label: 'Calculation' },
                { id: 'approval', label: 'Approval' },
                { id: 'history', label: 'History' },
                { id: 'audit', label: 'Audit' },
              ]}
            />

            <div className="space-y-4 p-5">
              {detailTab === 'overview' && selected && employeeSummary ? (
                <>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[#0F172A]">Overtime Summary</p>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniKpiTile label="Total Hours" value={number(employeeSummary.totalHours)} tone="violet" />
                      <MiniKpiTile label="Weekend Hours" value={number(employeeSummary.weekendHours)} tone="cyan" />
                      <MiniKpiTile label="Holiday Hours" value={number(employeeSummary.holidayHours)} tone="amber" />
                      <MiniKpiTile label="Night Hours" value={number(employeeSummary.nightHours)} tone="slate" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                    <p className="text-sm font-semibold text-[#0F172A]">Payroll Impact</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#94A3B8]">Overtime Pay</span>
                        <p className="font-bold text-[#0F172A]">{money(employeeSummary.grossPay, canViewMoney)}</p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Gross Impact</span>
                        <p className="font-bold text-[#0F172A]">{money(employeeSummary.grossPay, canViewMoney)}</p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Tax Impact</span>
                        <p className="font-bold text-[#0F172A]">{money(taxImpact, canViewMoney)}</p>
                      </div>
                      <div>
                        <span className="text-[#94A3B8]">Net Impact</span>
                        <p className="font-bold text-emerald-700">{money(netImpact, canViewMoney)}</p>
                      </div>
                    </div>
                  </div>
                  <AccordionSection title="Eligibility Rules" subtitle="OT policy gates" count={3} defaultOpen>
                    <ul className="space-y-1 text-xs text-[#475569]">
                      <li>Approved timesheet required for payroll posting</li>
                      <li>Weekday OT: hours above {selected.standardHours}h at {payload?.rule.weekdayMultiplier}x</li>
                      <li>Weekend/holiday: all worked hours at {payload?.rule.saturdayMultiplier}x</li>
                    </ul>
                  </AccordionSection>
                  <AccordionSection title="Rate Multipliers" count={4}>
                    <p className="text-xs text-[#64748B]">
                      Current line: {selected.multiplier}x on {selected.dayType === 'Weekday' ? 'overtime hours' : 'hours worked'}.
                    </p>
                  </AccordionSection>
                </>
              ) : null}

              {detailTab === 'timesheet' && selected ? (
                <div className="space-y-2 text-sm text-[#475569]">
                  <p>
                    <span className="font-semibold text-[#0F172A]">Date:</span> {selected.date}
                  </p>
                  <p>
                    <span className="font-semibold text-[#0F172A]">Worked:</span> {number(selected.workedHours)} hrs
                  </p>
                  <p>
                    <span className="font-semibold text-[#0F172A]">Standard:</span> {number(selected.standardHours)} hrs
                  </p>
                  <p>
                    <span className="font-semibold text-[#0F172A]">Status:</span> {selected.timesheetStatus}
                  </p>
                  {selected.issues.length ? (
                    <ul className="mt-2 space-y-1">
                      {selected.issues.map((issue) => (
                        <li key={issue} className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Timesheet payroll-ready.</p>
                  )}
                </div>
              ) : null}

              {detailTab === 'calculation' && selected ? (
                <div className="space-y-2 text-sm">
                  <p className="text-[#475569]">
                    Basis: <span className="font-semibold text-[#0F172A]">{selected.dayType === 'Weekday' ? payload?.rule.weekdayBasis : payload?.rule.specialDayBasis}</span>
                  </p>
                  <p className="text-[#475569]">
                    Payable hours: <span className="font-semibold text-[#0F172A]">{number(selected.payableHours)}</span>
                  </p>
                  <p className="text-[#475569]">
                    Rate: <span className="font-semibold text-[#0F172A]">{money(selected.hourlyRate, canViewMoney)}</span> × {selected.multiplier}x
                  </p>
                  <p className="text-lg font-bold text-[#0F172A]">{money(selected.grossPay, canViewMoney)}</p>
                </div>
              ) : null}

              {(detailTab === 'approval' || detailTab === 'history' || detailTab === 'audit') && (
                <p className="text-sm text-[#64748B]">
                  {detailTab === 'approval' && 'Multi-level approval chain: Supervisor → PM → Cost Control → HR → Payroll.'}
                  {detailTab === 'history' && 'Effective-dated overtime changes and recalculation history.'}
                  {detailTab === 'audit' && 'Immutable audit trail for overtime approvals and payroll posting.'}
                </p>
              )}

              <AccordionSection title="Public Holiday Dates" subtitle="2x overtime factor dates" defaultOpen={false}>
                <textarea
                  value={holidayText}
                  onChange={(e) => setHolidayText(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                  placeholder="YYYY-MM-DD, one per line"
                />
                <button
                  type="button"
                  onClick={() => void saveHolidays()}
                  disabled={saving || !payload?.permissions.canConfigureHolidays}
                  className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving…' : 'Save Holidays'}
                </button>
              </AccordionSection>

              <div className="flex flex-col gap-2 border-t border-[#E5E7EB] pt-4">
                <button type="button" className="h-10 rounded-xl bg-[#2563EB] text-sm font-semibold text-white hover:bg-[#1D4ED8]">
                  Approve
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="h-10 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50">
                    Reject
                  </button>
                  <button type="button" className="h-10 rounded-xl border border-amber-200 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                    Return
                  </button>
                </div>
                <button type="button" className="h-10 rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                  View Timesheet
                </button>
                <button type="button" className="h-10 rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                  Impact Analysis
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Analytics */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AnalyticsCard title="Overtime Cost by Department" action={{ label: 'Export', icon: Download }}>
          <HorizontalBarChart rows={deptCost} />
          <p className="mt-2 text-[10px] text-[#94A3B8]">Values in millions NGN</p>
        </AnalyticsCard>
        <AnalyticsCard title="Monthly Overtime Trend" action={{ label: 'Export', icon: Download }}>
          <DualLineChart labels={trendMonths} seriesA={costTrend} seriesB={hoursTrend} nameA="Cost (₦)" nameB="Hours" />
        </AnalyticsCard>
        <AnalyticsCard title="Overtime by Day Type">
          <DonutChart
            rows={dayTypeDonut}
            centerLabel="Total Hrs"
            centerValue={number(summary?.payableHours)}
          />
        </AnalyticsCard>
        <AnalyticsCard title="Top Overtime Employees">
          <TopOvertimeEmployees rows={topEmployees} formatValue={(v) => money(v, canViewMoney)} />
        </AnalyticsCard>
        <AnalyticsCard title="Budget Utilization">
          <BudgetUtilizationGauge utilized={Math.round(summary?.grossPay || 0)} budget={budget} label="Period OT Budget" />
        </AnalyticsCard>
        <AnalyticsCard title="Policy Reference">
          <div className="space-y-2 text-xs text-[#475569]">
            <p className="flex justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
              <span>Weekday multiplier</span>
              <span className="font-bold text-[#2563EB]">{payload?.rule.weekdayMultiplier || 1.5}x</span>
            </p>
            <p className="flex justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
              <span>Saturday</span>
              <span className="font-bold text-[#06B6D4]">{payload?.rule.saturdayMultiplier || 2}x</span>
            </p>
            <p className="flex justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
              <span>Sunday</span>
              <span className="font-bold text-[#7C3AED]">{payload?.rule.sundayMultiplier || 2.5}x</span>
            </p>
            <p className="flex justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
              <span>Public holiday</span>
              <span className="font-bold text-[#F59E0B]">{payload?.rule.publicHolidayMultiplier || 2}x</span>
            </p>
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}
