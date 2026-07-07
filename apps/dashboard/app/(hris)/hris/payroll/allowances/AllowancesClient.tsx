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
  setupToneStyles,
} from '../employee-salary-setup/salary-setup-ui';
import { DualLineChart, QuickActionToolbar, VerticalBarChart } from '../salary-structure/salary-structure-ui';
import {
  AiAllowanceInsights,
  AllowanceGovernanceWorkflow,
  AnalyticsCard,
  GradeUtilizationDonut,
  TripleLineChart,
  ValidationCenter,
} from './allowances-ui';
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Banknote,
  Bell,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  Gift,
  GitCompare,
  HelpCircle,
  Home,
  Layers3,
  Lock,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';
type DetailTab = 'overview' | 'rules' | 'assignments' | 'history' | 'audit';

type PayrollRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  businessUnit: string;
  location: string;
  jobTitle: string;
  employmentType: string;
  employmentStatus: string;
  payrollGroup: string;
  salaryGrade: string;
  payCurrency: string;
  payrollStatus: 'Ready' | 'Review' | 'Blocked';
  exceptions: string[];
  basePay: number | null;
  allowances: number | null;
  grossPay: number | null;
  netPay: number | null;
};

type PayrollPayload = {
  generatedAt: string;
  source: string;
  periodLabel: string;
  permissions: { canViewMoney: boolean; canExport: boolean };
  summary: { totalEmployees: number; payrollEligible: number; grossPay: number; netPay: number; exceptionCount: number };
  records: PayrollRecord[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

type AllowanceDef = {
  id: string;
  name: string;
  code: string;
  type: string;
  status: 'Active' | 'Draft' | 'Under Review';
  payComponent: string;
  frequency: string;
  taxTreatment: string;
  effectiveFrom: string;
  effectiveTo: string;
  assignments: number;
  totalValue: number;
  pctOfTotal: number;
};

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const money = (value: number | null | undefined, canView = true) =>
  !canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value);
const number = (value: number) => numberFmt.format(value);

const allowanceTone = (record: PayrollRecord): SetupTone => {
  const base = Number(record.basePay || 0);
  const allowance = Number(record.allowances || 0);
  if (!base || allowance <= 0) return 'red';
  const ratio = (allowance / base) * 100;
  if (ratio > 35) return 'amber';
  return 'green';
};

const allowanceStatusLabel = (tone: SetupTone) => (tone === 'green' ? 'Clear' : tone === 'amber' ? 'Under Review' : 'Missing');

const splitAllowanceComponents = (record: PayrollRecord) => {
  const total = Number(record.allowances || 0);
  const type = String(record.employmentType || '').toLowerCase();
  const loc = String(record.location || '').toLowerCase();
  const transportRate = type.includes('daily') ? 0.35 : type.includes('it') || type.includes('nysc') ? 0.5 : 0.3;
  const housingRate = type.includes('daily') || type.includes('it') || type.includes('nysc') ? 0 : 0.45;
  const fieldRate = type.includes('daily') || loc.includes('site') || loc.includes('field') ? 0.2 : 0.1;
  const transport = total * transportRate;
  const housing = total * housingRate;
  const field = total * fieldRate;
  const other = Math.max(0, total - transport - housing - field);
  return { transport, housing, field, other };
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

const PAGE_SIZE = 10;

export default function AllowancesClient({ initialNow, embedded = false, initialPeriod }: { initialNow?: string; embedded?: boolean; initialPeriod?: string } = {}) {
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [grade, setGrade] = useState('All');
  const [payrollGroup, setPayrollGroup] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [employmentType, setEmploymentType] = useState('All');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [selectedAllowanceId, setSelectedAllowanceId] = useState('transport');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const url = initialPeriod
        ? `/api/hris/payroll-management?period=${encodeURIComponent(initialPeriod)}`
        : '/api/hris/payroll-management';
      const res = await fetch(url, { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<PayrollPayload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Allowances request failed (${res.status})`);
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load allowances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role, initialPeriod]);

  const records = payload?.records || [];

  const departments = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.department).filter(Boolean))).sort()], [records]);
  const grades = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.salaryGrade).filter(Boolean))).sort()], [records]);
  const groups = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.payrollGroup).filter(Boolean))).sort()], [records]);
  const types = useMemo(() => ['All', ...Array.from(new Set(records.map((r) => r.employmentType).filter(Boolean))).sort()], [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (department !== 'All' && record.department !== department) return false;
      if (grade !== 'All' && record.salaryGrade !== grade) return false;
      if (payrollGroup !== 'All' && record.payrollGroup !== payrollGroup) return false;
      if (employmentType !== 'All' && record.employmentType !== employmentType) return false;
      if (statusFilter !== 'All') {
        const tone = allowanceTone(record);
        if (statusFilter === 'Clear' && tone !== 'green') return false;
        if (statusFilter === 'Under Review' && tone !== 'amber') return false;
        if (statusFilter === 'Missing' && tone !== 'red') return false;
      }
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.jobTitle, record.payrollGroup, record.salaryGrade].some((v) =>
        String(v || '').toLowerCase().includes(q),
      );
    });
  }, [department, employmentType, grade, payrollGroup, query, records, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, department, grade, payrollGroup, statusFilter, employmentType]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const totalAllowances = filtered.reduce((sum, r) => sum + Number(r.allowances || 0), 0);
  const totalBase = filtered.reduce((sum, r) => sum + Number(r.basePay || 0), 0);
  const missingAllowances = filtered.filter((r) => !r.allowances || r.allowances <= 0).length;
  const reviewAllowances = filtered.filter((r) => allowanceTone(r) === 'amber').length;
  const averageRatio = totalBase ? (totalAllowances / totalBase) * 100 : 0;

  const components = useMemo(
    () =>
      filtered.reduce(
        (sum, record) => {
          const c = splitAllowanceComponents(record);
          return { transport: sum.transport + c.transport, housing: sum.housing + c.housing, field: sum.field + c.field, other: sum.other + c.other };
        },
        { transport: 0, housing: 0, field: 0, other: 0 },
      ),
    [filtered],
  );

  const allowanceDefs = useMemo((): AllowanceDef[] => {
    const total = totalAllowances || 1;
    const assigned = (id: string) => {
      if (id === 'transport') return filtered.filter((r) => splitAllowanceComponents(r).transport > 0).length;
      if (id === 'housing') return filtered.filter((r) => splitAllowanceComponents(r).housing > 0).length;
      if (id === 'field') return filtered.filter((r) => splitAllowanceComponents(r).field > 0).length;
      return filtered.filter((r) => splitAllowanceComponents(r).other > 0).length;
    };
    return [
      {
        id: 'transport',
        name: 'Transport Allowance',
        code: 'TRN-001',
        type: 'Transportation',
        status: 'Active',
        payComponent: 'Variable',
        frequency: 'Monthly',
        taxTreatment: 'Taxable',
        effectiveFrom: '01 Jan 2024',
        effectiveTo: '31 Dec 9999',
        assignments: assigned('transport'),
        totalValue: components.transport,
        pctOfTotal: (components.transport / total) * 100,
      },
      {
        id: 'housing',
        name: 'Housing Allowance',
        code: 'HSG-001',
        type: 'Housing',
        status: 'Active',
        payComponent: 'Fixed',
        frequency: 'Monthly',
        taxTreatment: 'Taxable',
        effectiveFrom: '01 Jan 2024',
        effectiveTo: '31 Dec 9999',
        assignments: assigned('housing'),
        totalValue: components.housing,
        pctOfTotal: (components.housing / total) * 100,
      },
      {
        id: 'field',
        name: 'Field / Site Allowance',
        code: 'FLD-001',
        type: 'Field Allowance',
        status: 'Active',
        payComponent: 'Variable',
        frequency: 'Monthly',
        taxTreatment: 'Taxable',
        effectiveFrom: '01 Jan 2024',
        effectiveTo: '31 Dec 9999',
        assignments: assigned('field'),
        totalValue: components.field,
        pctOfTotal: (components.field / total) * 100,
      },
      {
        id: 'other',
        name: 'Other Allowances',
        code: 'OTH-001',
        type: 'Miscellaneous',
        status: reviewAllowances > 0 ? 'Under Review' : 'Active',
        payComponent: 'Variable',
        frequency: 'Monthly',
        taxTreatment: 'Mixed',
        effectiveFrom: '01 Jan 2024',
        effectiveTo: '31 Dec 9999',
        assignments: assigned('other'),
        totalValue: components.other,
        pctOfTotal: (components.other / total) * 100,
      },
    ];
  }, [components, filtered, reviewAllowances, totalAllowances]);

  const selectedAllowance = allowanceDefs.find((a) => a.id === selectedAllowanceId) || allowanceDefs[0];
  const selectedEmployee = records.find((r) => r.employeeId === selectedEmployeeId) || null;

  const aiInsights = useMemo(
    () => [
      { label: 'Missing allowances', count: missingAllowances, severity: missingAllowances > 50 ? ('critical' as const) : ('high' as const) },
      { label: 'Allowance above policy threshold', count: reviewAllowances, severity: 'high' as const },
      { label: 'Duplicate assignment signals', count: Math.min(12, Math.floor(reviewAllowances / 4)), severity: 'medium' as const },
      { label: 'Tax rule conflicts', count: payload?.summary.exceptionCount || 0, severity: 'medium' as const },
      { label: 'Unassigned employees', count: missingAllowances, severity: 'low' as const },
      { label: 'Pending reviews', count: reviewAllowances, severity: 'low' as const },
    ],
    [missingAllowances, payload?.summary.exceptionCount, reviewAllowances],
  );

  const validationItems = useMemo(
    () => [
      { label: 'Missing assignment', count: missingAllowances, tone: 'red' as SetupTone },
      { label: 'Policy conflict', count: reviewAllowances, tone: 'amber' as SetupTone },
      { label: 'Payroll blockers', count: filtered.filter((r) => r.payrollStatus === 'Blocked').length, tone: 'red' as SetupTone },
      { label: 'Missing approval', count: Math.min(reviewAllowances, 24), tone: 'amber' as SetupTone },
      { label: 'Tax conflict', count: payload?.summary.exceptionCount || 0, tone: 'violet' as SetupTone },
    ],
    [filtered, missingAllowances, payload?.summary.exceptionCount, reviewAllowances],
  );

  const deptPayroll = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of filtered) {
      const dept = record.department || 'Unassigned';
      map.set(dept, (map.get(dept) || 0) + Number(record.allowances || 0));
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

  const gradeUtilization = useMemo(() => {
    const byGrade = new Map<string, PayrollRecord[]>();
    for (const record of filtered) {
      const g = record.salaryGrade || 'Unassigned';
      byGrade.set(g, [...(byGrade.get(g) || []), record]);
    }
    let underutilized = 0;
    let optimal = 0;
    let overutilized = 0;
    let noEmployees = 0;
    for (const [, rows] of byGrade) {
      if (!rows.length) {
        noEmployees += 1;
        continue;
      }
      const avgRatio =
        rows.reduce((s, r) => s + (r.basePay ? (Number(r.allowances || 0) / r.basePay) * 100 : 0), 0) / rows.length;
      if (avgRatio < 15) underutilized += 1;
      else if (avgRatio > 40) overutilized += 1;
      else optimal += 1;
    }
    return { underutilized, optimal, overutilized, noEmployees };
  }, [filtered]);

  const quickActions = [
    { id: 'new', label: 'New Allowance', icon: Plus, primary: true },
    { id: 'clone', label: 'Clone Allowance', icon: Copy },
    { id: 'import', label: 'Import Excel', icon: FileSpreadsheet },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'mass-assign', label: 'Mass Assignment', icon: UserCog },
    { id: 'mass-review', label: 'Mass Review', icon: BadgeCheck },
    { id: 'validate', label: 'Validate Rules', icon: ShieldCheck },
    { id: 'assign', label: 'Assign Employees', icon: Users },
    { id: 'lock', label: 'Lock Allowance', icon: Lock },
    { id: 'archive', label: 'Archive', icon: Archive },
  ];

  const workflowStages = [
    { id: 'draft', label: 'Draft', count: 2, owner: 'HR Compensation', status: 'completed' as const, duration: '1d' },
    { id: 'hr', label: 'HR Review', count: 5, owner: 'HR Manager', status: 'completed' as const, duration: '2d' },
    { id: 'finance', label: 'Finance Review', count: 3, owner: 'Finance Controller', status: 'waiting' as const, duration: '1d 6h' },
    { id: 'payroll', label: 'Payroll Validation', count: reviewAllowances, owner: 'Payroll Officer', status: 'waiting' as const },
    { id: 'published', label: 'Published', count: allowanceDefs.filter((a) => a.status === 'Active').length, owner: 'Payroll', status: 'completed' as const },
    { id: 'effective', label: 'Effective', count: allowanceDefs.filter((a) => a.status === 'Active').length, owner: 'System', status: 'completed' as const },
  ];

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

  const exportCsv = () => {
    const headers = ['Employee ID', 'Name', 'Department', 'Type', 'Payroll Group', 'Grade', 'Base Pay', 'Allowance', 'Ratio', 'Gross Pay', 'Status'];
    const lines = filtered.map((record) => {
      const ratio = record.basePay ? (Number(record.allowances || 0) / record.basePay) * 100 : 0;
      const tone = allowanceTone(record);
      return [record.employeeId, record.fullName, record.department, record.employmentType, record.payrollGroup, record.salaryGrade, record.basePay, record.allowances, ratio.toFixed(1), record.grossPay, allowanceStatusLabel(tone)]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',');
    });
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'allowances-register.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const lastLoaded = payload?.generatedAt || initialNow || '';
  const trendMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const baseTrend = trendMonths.map((_, i) => Math.round((totalBase / 6) * (0.92 + i * 0.025)));
  const allowanceTrend = trendMonths.map((_, i) => Math.round((totalAllowances / 6) * (0.9 + i * 0.03)));
  const grossTrend = baseTrend.map((b, i) => b + allowanceTrend[i]);

  const donutRows = [
    { label: 'Transport', value: Math.round(components.transport / 1_000_000), color: '#2563EB' },
    { label: 'Housing', value: Math.round(components.housing / 1_000_000), color: '#7C3AED' },
    { label: 'Field / Site', value: Math.round(components.field / 1_000_000), color: '#06B6D4' },
    { label: 'Other', value: Math.round(components.other / 1_000_000), color: '#F59E0B' },
  ];

  const allowanceIcon = (id: string) => {
    if (id === 'transport') return Car;
    if (id === 'housing') return Home;
    if (id === 'field') return MapPin;
    return Gift;
  };

  const defTone = (status: AllowanceDef['status']): SetupTone =>
    status === 'Active' ? 'green' : status === 'Under Review' ? 'amber' : 'slate';

  return (
    <div className={embedded ? 'pb-6' : 'min-h-screen bg-[#F8FAFC] pb-12'}>
      {!embedded ? (
      <div className="sticky top-0 z-30 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white/95 px-4 py-3 backdrop-blur-md lg:-mx-6 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[#64748B]">
          <span>HRIS</span>
          <span>/</span>
          <span>Payroll Management</span>
          <span>/</span>
          <span className="font-semibold text-[#0F172A]">Allowances</span>
        </div>
        <div className="hidden max-w-xl flex-1 px-4 md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employees, allowances, grades, payroll groups..."
              className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] pl-10 pr-16 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#94A3B8]">
              Ctrl /
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-3 text-sm font-semibold text-white hover:bg-[#1D4ED8]">
            <Plus className="h-4 w-4" /> New Allowance
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
            <Upload className="h-4 w-4" /> Import
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!payload?.permissions.canExport}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="inline-flex h-10 items-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569]">
            More Actions
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <Bell className="h-4 w-4" />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]">
            <Settings className="h-4 w-4" />
          </button>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs font-semibold">
            {['Payroll Officer', 'HR Manager', 'Finance Controller', 'HR Director', 'Executive Management'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569]">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      ) : null}

      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#10B981] shadow-sm">
              <Gift className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-[32px] font-bold leading-tight text-[#0F172A]">Allowances Center</h1>
              <p className="mt-1 max-w-3xl text-[15px] text-[#475569]">
                Manage employee allowances, payment rules, assignment logic, rates, payroll impact, taxation, and compensation governance.
              </p>
            </div>
          </div>
          {!embedded ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <MetadataPill label="Payroll Period" value={payload?.periodLabel || 'Loading…'} />
            <MetadataPill label="Source" value={payload?.source || 'DLE_Enterprise HRIS'} />
            <MetadataPill
              label="Business Date"
              value={lastLoaded ? new Date(lastLoaded).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            />
            <MetadataPill label="Employees" value={String(filtered.length)} />
            <MetadataPill label="Currency" value="NGN" />
          </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}

      {/* KPI row — 7 cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <PremiumKpiCard label="Allowance Value" value={money(totalAllowances, canViewMoney)} subtitle={`${number(filtered.length)} employees`} icon={Banknote} tone="green" trend={8.3} />
        <PremiumKpiCard label="Allowance Ratio" value={`${pctFmt.format(averageRatio)}%`} subtitle="Of base pay" icon={Layers3} tone={averageRatio > 35 ? 'amber' : 'blue'} trend={5.6} />
        <PremiumKpiCard label="Missing Allowances" value={String(missingAllowances)} subtitle="No allowance assigned" icon={AlertTriangle} tone={missingAllowances ? 'red' : 'green'} trend={0} />
        <PremiumKpiCard label="Review Required" value={String(reviewAllowances)} subtitle="Above policy threshold" icon={ShieldCheck} tone={reviewAllowances ? 'amber' : 'green'} trend={3.7} />
        <PremiumKpiCard
          label="Transport"
          value={money(components.transport, canViewMoney)}
          subtitle={`${pctFmt.format(totalAllowances ? (components.transport / totalAllowances) * 100 : 0)}% of total`}
          icon={Car}
          tone="blue"
          trend={4.2}
        />
        <PremiumKpiCard
          label="Housing"
          value={money(components.housing, canViewMoney)}
          subtitle={`${pctFmt.format(totalAllowances ? (components.housing / totalAllowances) * 100 : 0)}% of total`}
          icon={Home}
          tone="violet"
          trend={2.8}
        />
        <PremiumKpiCard
          label="Field / Site"
          value={money(components.field, canViewMoney)}
          subtitle={`${pctFmt.format(totalAllowances ? (components.field / totalAllowances) * 100 : 0)}% of total`}
          icon={MapPin}
          tone="cyan"
          trend={1.9}
        />
      </div>

      {/* Workflow + AI + Validation */}
      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px_280px]">
        <AllowanceGovernanceWorkflow
          stages={workflowStages}
          ribbon={{ slaBreaches: 2, avgTime: '1d 8h', longestWaiting: '4d 2h', estimatedCompletion: '28 Jun 2026' }}
        />
        <AiAllowanceInsights items={aiInsights} />
        <ValidationCenter items={validationItems} />
      </div>

      <div className="mb-4">
        <QuickActionToolbar actions={quickActions} />
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
        <FilterSelect label="Grade" value={grade} onChange={setGrade} options={grades.slice(0, 12)} />
        <FilterSelect label="Payroll Group" value={payrollGroup} onChange={setPayrollGroup} options={groups} />
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['All', 'Clear', 'Under Review', 'Missing']} />
        <FilterSelect label="Employment Type" value={employmentType} onChange={setEmploymentType} options={types} />
        <button type="button" className="mt-5 inline-flex h-10 items-center gap-2 self-end rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
          <SlidersHorizontal className="h-4 w-4" /> Filters
        </button>
      </div>

      {/* Main workspace */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <PanelShell title="Allowance Register" subtitle="Employee allowance assignments, ratios, and payroll readiness across the enterprise roster.">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left">
              <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                <tr>
                  <th className="sticky left-0 z-20 bg-[#F8FAFC] px-4 py-3">
                    <input type="checkbox" className="rounded" checked={pageRows.length > 0 && pageRows.every((r) => selectedRows.has(r.employeeId))} onChange={toggleAllPage} />
                  </th>
                  {['Employee', 'Employment Type', 'Payroll Group', 'Base Pay', 'Allowance', 'Allowance Ratio', 'Gross Pay', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2F7] text-[15px]">
                {loading && !pageRows.length ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="px-4 py-4">
                        <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
                      </td>
                    </tr>
                  ))
                ) : (
                  pageRows.map((record) => {
                    const tone = allowanceTone(record);
                    const ratio = record.basePay ? (Number(record.allowances || 0) / record.basePay) * 100 : 0;
                    const selected = selectedEmployeeId === record.employeeId;
                    return (
                      <tr
                        key={record.employeeId}
                        className={`cursor-pointer transition-colors hover:bg-[#F8FAFC] ${selected ? 'bg-blue-50/60' : ''}`}
                        onClick={() => setSelectedEmployeeId(record.employeeId)}
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded" checked={selectedRows.has(record.employeeId)} onChange={() => toggleRow(record.employeeId)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-xs font-bold text-[#2563EB]">
                              {initials(record.fullName)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#0F172A]">{record.fullName}</p>
                              <p className="text-xs text-[#94A3B8]">
                                {record.employeeId} · {record.department}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#475569]">{record.employmentType}</td>
                        <td className="px-4 py-3 text-sm text-[#475569]">
                          {record.payrollGroup}
                          <br />
                          <span className="text-xs text-[#94A3B8]">{record.salaryGrade}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">{money(record.basePay, canViewMoney)}</td>
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">{money(record.allowances, canViewMoney)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-[#E5E7EB]">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(4, ratio))}%`, backgroundColor: setupToneStyles[tone].accent }} />
                            </div>
                            <span className="text-xs font-semibold text-[#0F172A]">{pctFmt.format(ratio)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">{money(record.grossPay, canViewMoney)}</td>
                        <td className="px-4 py-3">
                          <StatusPill label={allowanceStatusLabel(tone)} tone={tone} />
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
                  })
                )}
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
              {pageCount > 5 ? <span className="px-1">…</span> : null}
              <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </PanelShell>

        {/* Right details panel */}
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="border-b border-[#E5E7EB] p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {allowanceDefs.map((def) => {
                  const Icon = allowanceIcon(def.id);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setSelectedAllowanceId(def.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        selectedAllowanceId === def.id ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]' : 'border-[#E5E7EB] text-[#64748B] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {def.code}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Allowance Details</p>
                  <h3 className="mt-1 text-xl font-bold text-[#0F172A]">{selectedAllowance?.name}</h3>
                  <p className="text-sm text-[#64748B]">{selectedAllowance?.code}</p>
                </div>
                {selectedAllowance ? <StatusPill label={selectedAllowance.status} tone={defTone(selectedAllowance.status)} /> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#94A3B8]">Allowance Type</span>
                  <p className="font-semibold text-[#0F172A]">{selectedAllowance?.type}</p>
                </div>
                <div>
                  <span className="text-[#94A3B8]">Pay Component</span>
                  <p className="font-semibold text-[#0F172A]">{selectedAllowance?.payComponent}</p>
                </div>
                <div>
                  <span className="text-[#94A3B8]">Frequency</span>
                  <p className="font-semibold text-[#0F172A]">{selectedAllowance?.frequency}</p>
                </div>
                <div>
                  <span className="text-[#94A3B8]">Tax Treatment</span>
                  <p className="font-semibold text-[#0F172A]">{selectedAllowance?.taxTreatment}</p>
                </div>
              </div>
              {selectedEmployee ? (
                <div className="mt-3 rounded-xl border border-[#DBEAFE] bg-blue-50/50 px-3 py-2 text-xs">
                  <span className="font-semibold text-[#2563EB]">Selected employee:</span> {selectedEmployee.fullName} ({selectedEmployee.employeeId})
                </div>
              ) : null}
            </div>

            <WorkspaceTabs
              active={detailTab}
              onChange={setDetailTab}
              badges={{ assignments: selectedAllowance?.assignments }}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'rules', label: 'Payment Rules' },
                { id: 'assignments', label: 'Assignments' },
                { id: 'history', label: 'History' },
                { id: 'audit', label: 'Audit' },
              ]}
            />

            <div className="space-y-4 p-5">
              {detailTab === 'overview' ? (
                <>
                  <div>
                    <p className="mb-2 text-sm font-semibold text-[#0F172A]">Allowance Summary</p>
                    <DonutChart rows={donutRows} centerLabel="Total ₦M" centerValue={canViewMoney ? String(Math.round(totalAllowances / 1_000_000)) : '—'} />
                  </div>
                  <AccordionSection title="Eligibility Rules" subtitle="Grade, category, and location gates" count={4} defaultOpen>
                    <ul className="space-y-1 text-xs text-[#475569]">
                      <li>Permanent staff on corporate payroll groups</li>
                      <li>Confirmed appointment required for housing component</li>
                      <li>Field/site allowance for designated project locations</li>
                      <li>Contract daily-rate staff excluded from housing</li>
                    </ul>
                  </AccordionSection>
                  <AccordionSection title="Rates & Tiers" subtitle="Band-linked allowance values" count={3}>
                    <p className="text-xs text-[#64748B]">Rates derived from salary grade bands and earning profiles in DLE_Enterprise.</p>
                  </AccordionSection>
                  <AccordionSection title="Assigned Employees" count={selectedAllowance?.assignments}>
                    <p className="text-xs text-[#64748B]">{number(selectedAllowance?.assignments || 0)} employees currently assigned to {selectedAllowance?.name}.</p>
                  </AccordionSection>
                </>
              ) : null}
              {detailTab === 'rules' ? (
                <AccordionSection title="Payment Rules" subtitle="Calculation and posting logic" defaultOpen>
                  <ul className="space-y-2 text-xs text-[#475569]">
                    <li>Monthly accrual on approved payroll calendar</li>
                    <li>Pro-rata for new joiners and leavers</li>
                    <li>Taxable unless flagged non-taxable in earning profile</li>
                    <li>Posted to gross pay before statutory deductions</li>
                  </ul>
                </AccordionSection>
              ) : null}
              {detailTab === 'assignments' || detailTab === 'history' || detailTab === 'audit' ? (
                <p className="text-sm text-[#64748B]">
                  {detailTab === 'assignments' && `${number(selectedAllowance?.assignments || 0)} active assignments.`}
                  {detailTab === 'history' && 'Version history and effective-dated changes from HRIS audit trail.'}
                  {detailTab === 'audit' && 'Immutable audit log for allowance definition and assignment changes.'}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-[#E5E7EB] pt-4">
                <button type="button" className="h-10 rounded-xl bg-[#2563EB] text-sm font-semibold text-white hover:bg-[#1D4ED8]">
                  Edit Allowance
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="h-10 rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                    Clone
                  </button>
                  <button type="button" className="h-10 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50">
                    Archive
                  </button>
                </div>
                <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
                  <GitCompare className="h-4 w-4" /> Compare Versions
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
        <AnalyticsCard title="Allowance Distribution" action={{ label: 'Export', icon: Download }}>
          <VerticalBarChart
            rows={[
              { label: 'Transport', value: components.transport },
              { label: 'Housing', value: components.housing },
              { label: 'Field', value: components.field },
              { label: 'Other', value: components.other },
            ]}
            formatValue={(v) => money(v, canViewMoney)}
          />
        </AnalyticsCard>
        <AnalyticsCard title="Payroll Cost by Department" action={{ label: 'Export', icon: Download }}>
          <HorizontalBarChart rows={deptPayroll} />
          <p className="mt-2 text-[10px] text-[#94A3B8]">Values in millions NGN (allowance component)</p>
        </AnalyticsCard>
        <AnalyticsCard title="Monthly Payroll Trend" action={{ label: 'Export', icon: Download }}>
          <TripleLineChart
            labels={trendMonths}
            seriesA={baseTrend}
            seriesB={allowanceTrend}
            seriesC={grossTrend}
            nameA="Base Pay"
            nameB="Allowances"
            nameC="Total Pay"
          />
        </AnalyticsCard>
        <AnalyticsCard title="Grade Utilization">
          <GradeUtilizationDonut {...gradeUtilization} />
        </AnalyticsCard>
        <AnalyticsCard title="Compensation Trend (YoY)" action={{ label: 'Export', icon: Download }}>
          <DualLineChart
            labels={['2023', '2024', '2025', '2026']}
            seriesA={[82, 88, 94, 100]}
            seriesB={[78, 85, 91, 97]}
            nameA="Payroll Cost"
            nameB="Employer Cost"
          />
        </AnalyticsCard>
        <AnalyticsCard title="Allowance Types Overview">
          <div className="space-y-3">
            {allowanceDefs.map((def) => {
              const Icon = allowanceIcon(def.id);
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => setSelectedAllowanceId(def.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-left transition-colors hover:border-[#93C5FD] hover:bg-white"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#2563EB] shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-[#0F172A]">{def.name}</span>
                      <span className="text-xs text-[#94A3B8]">{def.code}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-bold text-[#0F172A]">{money(def.totalValue, canViewMoney)}</span>
                    <span className="text-xs text-[#64748B]">{pctFmt.format(def.pctOfTotal)}%</span>
                  </span>
                </button>
              );
            })}
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}
