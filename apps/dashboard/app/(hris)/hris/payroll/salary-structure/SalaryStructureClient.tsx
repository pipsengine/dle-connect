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
import {
  AiCompensationInsights,
  DualLineChart,
  GovernanceWorkflow,
  HealthScoreRing,
  QuickActionToolbar,
  VerticalBarChart,
} from './salary-structure-ui';
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Banknote,
  Bell,
  Building2,
  ChevronDown,
  CircleDollarSign,
  Clock,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  GitBranch,
  HelpCircle,
  Layers3,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';
type RegisterTab = 'structures' | 'grades' | 'bands' | 'components' | 'versions' | 'expiring';
type DetailTab = 'overview' | 'components' | 'employees' | 'history' | 'audit';

type PayrollRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  businessUnit: string;
  jobTitle: string;
  employmentType: string;
  payrollGroup: string;
  salaryGrade: string;
  earningProfile: string;
  earningProfileId: string;
  payCurrency: string;
  payrollStatus: 'Ready' | 'Review' | 'Blocked';
  basePay: number | null;
  allowances: number | null;
  grossPay: number | null;
  netPay: number | null;
  exceptions: string[];
};

type PayrollPayload = {
  generatedAt: string;
  source: string;
  role: Role;
  periodLabel: string;
  permissions: { canViewMoney: boolean; canExport: boolean };
  summary: { totalEmployees: number; payrollEligible: number; grossPay: number; netPay: number; exceptionCount: number };
  records: PayrollRecord[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

type GradeBand = {
  grade: string;
  employees: number;
  minPay: number;
  midpoint: number;
  maxPay: number;
  averagePay: number;
  totalGross: number;
  totalNet: number;
  exceptions: number;
  belowBand: number;
  aboveBand: number;
  compaRatio: number;
  health: 'Healthy' | 'Review' | 'Critical';
  healthScore: number;
  structureName: string;
  structureCode: string;
};

type StructureRow = {
  id: string;
  name: string;
  code: string;
  type: string;
  status: 'Active' | 'Draft' | 'Under Review';
  effectiveFrom: string;
  effectiveTo: string;
  grades: number;
  employees: number;
  monthlyPayroll: number;
  annualProjection: number;
  approvalStage: string;
  healthScore: number;
};

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const money = (value: number | null | undefined, canView = true) =>
  !canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value);
const number = (value: number) => numberFmt.format(value);

const structureTypeForProfile = (profileId: string) => {
  if (profileId.includes('contract')) return 'Contract';
  if (profileId.includes('management') || profileId.includes('senior')) return 'Management';
  if (profileId.includes('stipend')) return 'Stipend';
  return 'Corporate';
};

const structureLabel = (profileId: string, profileName: string) => {
  const map: Record<string, { name: string; code: string }> = {
    'management-cola-permanent': { name: 'DLE Management COLA Structure', code: 'MGT-COLA-001' },
    'management-permanent': { name: 'DLE Management Structure', code: 'MGT-STR-001' },
    'senior-management-permanent': { name: 'DLE Senior Management Structure', code: 'SNM-STR-001' },
    'senior-permanent': { name: 'DLE Senior Staff Structure', code: 'SNR-STR-001' },
    'junior-permanent': { name: 'DLE Junior Staff Structure', code: 'JNR-STR-001' },
    'contract-day-rate': { name: 'DLE Contract Day Rate Structure', code: 'CTR-DAY-001' },
    'contract-lumpsum': { name: 'DLE Contract Lumpsum Structure', code: 'CTR-LMP-001' },
    'stipend-non-taxable': { name: 'DLE NYSC / IT Stipend Structure', code: 'STP-STR-001' },
    fallback: { name: 'DLE Corporate Structure', code: 'CORP-STR-001' },
  };
  return map[profileId] || { name: profileName || 'DLE Payroll Structure', code: profileId.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 14) };
};

const buildBands = (records: PayrollRecord[]): GradeBand[] => {
  const byGrade = new Map<string, PayrollRecord[]>();
  for (const record of records) {
    const grade = record.salaryGrade || 'Unassigned';
    byGrade.set(grade, [...(byGrade.get(grade) || []), record]);
  }

  return Array.from(byGrade.entries())
    .map(([grade, rows]) => {
      const pays = rows.map((row) => Number(row.basePay || row.grossPay || 0)).filter((v) => v > 0).sort((a, b) => a - b);
      const minPay = pays[0] || 0;
      const maxPay = pays[pays.length - 1] || 0;
      const averagePay = pays.length ? pays.reduce((s, v) => s + v, 0) / pays.length : 0;
      const midpoint = minPay && maxPay ? (minPay + maxPay) / 2 : averagePay;
      const lowerGuard = midpoint ? midpoint * 0.75 : 0;
      const upperGuard = midpoint ? midpoint * 1.25 : 0;
      const belowBand = pays.filter((v) => lowerGuard && v < lowerGuard).length;
      const aboveBand = pays.filter((v) => upperGuard && v > upperGuard).length;
      const exceptions = rows.reduce((s, row) => s + row.exceptions.length, 0);
      const compaRatio = midpoint ? (averagePay / midpoint) * 100 : 0;
      const health: GradeBand['health'] =
        exceptions > rows.length || belowBand + aboveBand > Math.max(1, rows.length * 0.25)
          ? 'Critical'
          : compaRatio < 80 || compaRatio > 120 || exceptions > 0
            ? 'Review'
            : 'Healthy';
      const healthScore = health === 'Healthy' ? 92 : health === 'Review' ? 74 : 58;
      const structure = structureLabel(rows[0]?.earningProfileId || 'fallback', rows[0]?.earningProfile || '');
      return {
        grade,
        employees: rows.length,
        minPay,
        midpoint,
        maxPay,
        averagePay,
        totalGross: rows.reduce((s, row) => s + Number(row.grossPay || 0), 0),
        totalNet: rows.reduce((s, row) => s + Number(row.netPay || 0), 0),
        exceptions,
        belowBand,
        aboveBand,
        compaRatio,
        health,
        healthScore,
        structureName: structure.name,
        structureCode: structure.code,
      };
    })
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }));
};

const buildStructures = (records: PayrollRecord[]): StructureRow[] => {
  const groups = new Map<string, PayrollRecord[]>();
  for (const record of records) {
    const key = record.earningProfileId || record.earningProfile || 'fallback';
    groups.set(key, [...(groups.get(key) || []), record]);
  }
  return Array.from(groups.entries()).map(([profileId, rows]) => {
    const meta = structureLabel(profileId, rows[0]?.earningProfile || '');
    const grades = new Set(rows.map((r) => r.salaryGrade || 'Unassigned')).size;
    const monthlyPayroll = rows.reduce((s, r) => s + Number(r.grossPay || 0), 0);
    const exceptions = rows.reduce((s, r) => s + r.exceptions.length, 0);
    const healthScore = Math.max(55, Math.min(98, 94 - exceptions * 2 - rows.filter((r) => r.payrollStatus !== 'Ready').length));
    return {
      id: profileId,
      name: meta.name,
      code: meta.code,
      type: structureTypeForProfile(profileId),
      status: (exceptions > 0 ? 'Under Review' : 'Active') as StructureRow['status'],
      effectiveFrom: '01 Jan 2026',
      effectiveTo: '31 Dec 9999',
      grades,
      employees: rows.length,
      monthlyPayroll,
      annualProjection: monthlyPayroll * 12,
      approvalStage: exceptions > 0 ? 'HR Manager' : 'Published',
      healthScore,
    };
  }).sort((a, b) => b.monthlyPayroll - a.monthlyPayroll);
};

const healthTone = (health: GradeBand['health']): SetupTone =>
  health === 'Healthy' ? 'green' : health === 'Critical' ? 'red' : 'amber';

const statusTone = (status: StructureRow['status']): SetupTone =>
  status === 'Active' ? 'green' : status === 'Under Review' ? 'amber' : 'slate';

export default function SalaryStructureClient({ initialNow }: { initialNow?: string } = {}) {
  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [registerTab, setRegisterTab] = useState<RegisterTab>('structures');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll-management', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<PayrollPayload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Request failed (${res.status})`);
      setPayload(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load salary structure');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role]);

  const records = payload?.records || [];
  const bands = useMemo(() => buildBands(records), [records]);
  const structures = useMemo(() => buildStructures(records), [records]);

  useEffect(() => {
    if (!selectedStructureId && structures[0]) setSelectedStructureId(structures[0].id);
    if (!selectedGrade && bands[0]) setSelectedGrade(bands[0].grade);
  }, [structures, bands, selectedStructureId, selectedGrade]);

  const selectedStructure = structures.find((s) => s.id === selectedStructureId) || structures[0] || null;
  const selectedBand = bands.find((b) => b.grade === selectedGrade) || bands[0] || null;

  const filteredStructures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return structures.filter((row) => {
      if (statusFilter !== 'All' && row.status !== statusFilter) return false;
      if (typeFilter !== 'All' && row.type !== typeFilter) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q);
    });
  }, [structures, query, statusFilter, typeFilter]);

  const filteredBands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bands.filter((band) => {
      if (selectedStructure && band.structureCode !== selectedStructure.code && registerTab === 'grades') {
        const structureGrades = records.filter((r) => r.earningProfileId === selectedStructure.id).map((r) => r.salaryGrade);
        if (!structureGrades.includes(band.grade)) return false;
      }
      if (!q) return true;
      return band.grade.toLowerCase().includes(q) || band.structureName.toLowerCase().includes(q);
    });
  }, [bands, query, selectedStructure, registerTab, records]);

  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const totalStructures = structures.length;
  const activeStructures = structures.filter((s) => s.status === 'Active').length;
  const draftStructures = structures.filter((s) => s.status === 'Draft').length;
  const pendingApproval = structures.filter((s) => s.approvalStage !== 'Published' && s.approvalStage !== 'Effective').length;
  const expiringSoon = 3;
  const grossPay = payload?.summary.grossPay || 0;
  const employeesCovered = payload?.summary.payrollEligible || records.length;
  const coveragePct = records.length ? (employeesCovered / records.length) * 100 : 0;

  const aiInsights = useMemo(() => {
    const aboveMax = bands.reduce((s, b) => s + b.aboveBand, 0);
    const belowMin = bands.reduce((s, b) => s + b.belowBand, 0);
    const criticalGrades = bands.filter((b) => b.health === 'Critical').length;
    const reviewGrades = bands.filter((b) => b.health === 'Review').length;
    return [
      { label: 'Employees above maximum range', count: aboveMax, severity: 'high' as const },
      { label: 'Employees below minimum range', count: belowMin, severity: 'high' as const },
      { label: 'Grades with compression risk', count: criticalGrades, severity: 'medium' as const },
      { label: 'Structures due for review', count: reviewGrades, severity: 'medium' as const },
      { label: 'Compensation outliers', count: payload?.summary.exceptionCount || 0, severity: 'low' as const },
    ];
  }, [bands, payload?.summary.exceptionCount]);

  const deptPayroll = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of records) {
      const dept = record.department || 'Unassigned';
      map.set(dept, (map.get(dept) || 0) + Number(record.grossPay || 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label: label.length > 18 ? `${label.slice(0, 16)}…` : label, value: canViewMoney ? Math.round(value / 1_000_000) : 0 }));
  }, [records, canViewMoney]);

  const gradeDistribution = useMemo(
    () =>
      bands
        .slice(0, 8)
        .map((b) => ({ label: b.grade.length > 8 ? b.grade.slice(0, 7) : b.grade, value: b.employees })),
    [bands],
  );

  const componentBreakdown = selectedBand
    ? [
        { label: 'Basic Salary', value: Math.round(selectedBand.midpoint * 0.65), color: '#2563EB' },
        { label: 'Housing', value: Math.round(selectedBand.midpoint * 0.15), color: '#10B981' },
        { label: 'Transport', value: Math.round(selectedBand.midpoint * 0.075), color: '#F59E0B' },
        { label: 'Utility', value: Math.round(selectedBand.midpoint * 0.05), color: '#7C3AED' },
        { label: 'Other', value: Math.round(selectedBand.midpoint * 0.075), color: '#06B6D4' },
      ]
    : [];

  const quickActions = [
    { id: 'new', label: 'New Structure', icon: Plus, primary: true },
    { id: 'band', label: 'New Band', icon: Layers3 },
    { id: 'clone', label: 'Clone Structure', icon: Copy },
    { id: 'import', label: 'Import Excel', icon: FileSpreadsheet },
    { id: 'validate', label: 'Validate Structure', icon: ShieldCheck },
    { id: 'increment', label: 'Mass Increment', icon: TrendingUp },
    { id: 'review', label: 'Salary Review', icon: BadgeCheck },
    { id: 'assign', label: 'Assign Employees', icon: UserCog },
    { id: 'lock', label: 'Lock Structure', icon: Lock },
    { id: 'archive', label: 'Archive', icon: Archive },
  ];

  const workflowStages = [
    { id: 'draft', label: 'Draft', count: draftStructures || 4, owner: 'HR Compensation', status: 'completed' as const, duration: '1d 2h' },
    { id: 'hr-comp', label: 'HR Compensation', count: 5, owner: 'Jane Okafor', status: 'completed' as const, duration: '2d 4h' },
    { id: 'hr-mgr', label: 'HR Manager', count: pendingApproval || 2, owner: 'HR Manager', status: 'waiting' as const, duration: '1d 8h' },
    { id: 'finance', label: 'Finance Review', count: 1, owner: 'Finance Controller', status: 'pending' as const },
    { id: 'exec', label: 'Executive Approval', count: 0, owner: 'Executive Mgmt', status: 'pending' as const },
    { id: 'published', label: 'Published', count: activeStructures, owner: 'Payroll', status: 'completed' as const },
    { id: 'effective', label: 'Effective', count: activeStructures, owner: 'System', status: 'completed' as const },
  ];

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const headers = ['Structure', 'Code', 'Type', 'Status', 'Grades', 'Employees', 'Monthly Payroll', 'Health Score'];
    const lines = filteredStructures.map((row) =>
      [row.name, row.code, row.type, row.status, row.grades, row.employees, row.monthlyPayroll, row.healthScore]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'salary-structure-register.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const lastLoaded = payload?.generatedAt || initialNow || '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12">
      {/* Top action bar */}
      <div className="sticky top-0 z-30 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white/95 px-4 py-3 backdrop-blur-md lg:-mx-6 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[#64748B]">
          <span>HRIS</span><span>/</span><span>Payroll Management</span><span>/</span><span className="font-semibold text-[#0F172A]">Salary Structure</span>
        </div>
        <div className="hidden max-w-xl flex-1 px-4 md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employees, grades, bands, structures..."
              className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] pl-10 pr-16 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#94A3B8]">Ctrl /</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-3 text-sm font-semibold text-white hover:bg-[#1D4ED8]">
            <Plus className="h-4 w-4" /> New Structure
          </button>
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]">
            <Upload className="h-4 w-4" /> Import
          </button>
          <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">
            <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="inline-flex h-10 items-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#475569]">More Actions</button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]"><Bell className="h-4 w-4" /></button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]"><HelpCircle className="h-4 w-4" /></button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#475569]"><Settings className="h-4 w-4" /></button>
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

      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-[#7C3AED] shadow-sm">
              <Building2 className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-[32px] font-bold leading-tight text-[#0F172A]">Salary Structure Command Center</h1>
              <p className="mt-1 max-w-3xl text-[15px] text-[#475569]">
                Design, manage and govern salary structures, grades, bands and compensation components.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <MetadataPill label="As At" value={lastLoaded ? new Date(lastLoaded).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Loading…'} />
            <MetadataPill label="Source" value={payload?.source || 'DLE_Enterprise HRIS'} />
            <MetadataPill label="Structures" value={String(totalStructures)} />
            <MetadataPill label="Grades" value={String(bands.length)} />
            <MetadataPill label="Employees Covered" value={number(employeesCovered)} />
            <MetadataPill label="Currency" value="NGN" />
          </div>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <PremiumKpiCard label="Total Structures" value={String(totalStructures)} subtitle={`${activeStructures} Active, ${draftStructures} Draft`} icon={GitBranch} tone="blue" trend={4.2} />
        <PremiumKpiCard label="Active Structures" value={String(activeStructures)} subtitle={`${pctFmt.format(totalStructures ? (activeStructures / totalStructures) * 100 : 0)}% of total`} icon={BadgeCheck} tone="green" trend={2.1} />
        <PremiumKpiCard label="Salary Grades" value={String(bands.length)} subtitle="From live payroll setup" icon={Layers3} tone="violet" />
        <PremiumKpiCard label="Employees Covered" value={number(employeesCovered)} subtitle={`${pctFmt.format(coveragePct)}% of roster`} icon={Users} tone="cyan" trend={1.4} />
        <PremiumKpiCard label="Monthly Payroll Value" value={money(grossPay, canViewMoney)} subtitle="Current period gross" icon={Banknote} tone="green" trend={6.2} />
        <PremiumKpiCard label="Annual Payroll Projection" value={money(grossPay * 12, canViewMoney)} subtitle="12-month run rate" icon={CircleDollarSign} tone="blue" trend={8.7} />
        <PremiumKpiCard label="Pending Approval" value={String(pendingApproval)} subtitle="Structures awaiting approval" icon={Clock} tone="amber" />
        <PremiumKpiCard label="Expiring Soon" value={String(expiringSoon)} subtitle="Within next 60 days" icon={AlertTriangle} tone="red" />
      </div>

      {/* Workflow + AI */}
      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <GovernanceWorkflow
          stages={workflowStages}
          ribbon={{ slaBreaches: 3, avgTime: '2d 4h', longestWaiting: '5d 12h', estimatedCompletion: '27 Jun 2026' }}
        />
        <AiCompensationInsights items={aiInsights} />
      </div>

      {/* Quick actions */}
      <div className="mb-4">
        <QuickActionToolbar actions={quickActions} />
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 rounded-[16px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={['All', 'Active', 'Draft', 'Under Review']} />
        <FilterSelect label="Structure Type" value={typeFilter} onChange={setTypeFilter} options={['All', 'Corporate', 'Management', 'Contract', 'Stipend']} />
        <FilterSelect label="Approval Stage" value="All" onChange={() => {}} options={['All', 'Draft', 'HR Manager', 'Finance Review', 'Published', 'Effective']} />
        <FilterSelect label="Department" value="All" onChange={() => {}} options={['All', ...Array.from(new Set(records.map((r) => r.department).filter(Boolean))).slice(0, 8)]} />
      </div>

      {/* Main workspace */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <PanelShell title="Salary Structure Register" subtitle="Govern compensation structures, grades, bands, and components across the enterprise.">
          <WorkspaceTabs
            active={registerTab}
            onChange={setRegisterTab}
            badges={{ structures: totalStructures, grades: bands.length, expiring: expiringSoon }}
            tabs={[
              { id: 'structures', label: 'Structures' },
              { id: 'grades', label: 'Grades' },
              { id: 'bands', label: 'Bands' },
              { id: 'components', label: 'Components' },
              { id: 'versions', label: 'Versions' },
              { id: 'expiring', label: 'Expiring Soon' },
            ]}
          />
          <div className="overflow-x-auto">
            {registerTab === 'structures' || registerTab === 'expiring' ? (
              <table className="min-w-[1100px] w-full text-left">
                <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
                  <tr>
                    <th className="sticky left-0 z-20 bg-[#F8FAFC] px-4 py-3"><input type="checkbox" className="rounded" /></th>
                    {['Structure Name', 'Type', 'Status', 'Effective From', 'Effective To', 'Grades', 'Employees', 'Monthly Payroll', 'Annual Projection', 'Approval Stage', 'Health Score', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF2F7] text-[15px]">
                  {filteredStructures.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer transition-colors hover:bg-[#F8FAFC] ${selectedStructureId === row.id ? 'bg-blue-50/50' : ''}`}
                      onClick={() => setSelectedStructureId(row.id)}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedRows.has(row.id)} onChange={() => toggleRow(row.id)} className="rounded" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB]"><GitBranch className="h-4 w-4" /></span>
                          <div>
                            <p className="font-semibold text-[#0F172A]">{row.name}</p>
                            <p className="text-xs text-[#94A3B8]">{row.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#475569]">{row.type}</td>
                      <td className="px-4 py-3"><StatusPill label={row.status} tone={statusTone(row.status)} /></td>
                      <td className="px-4 py-3 text-sm text-[#475569]">{row.effectiveFrom}</td>
                      <td className="px-4 py-3 text-sm text-[#475569]">{row.effectiveTo}</td>
                      <td className="px-4 py-3 font-semibold">{row.grades}</td>
                      <td className="px-4 py-3 font-semibold">{number(row.employees)}</td>
                      <td className="px-4 py-3 font-semibold text-[#0F172A]">{money(row.monthlyPayroll, canViewMoney)}</td>
                      <td className="px-4 py-3 text-sm text-[#475569]">{money(row.annualProjection, canViewMoney)}</td>
                      <td className="px-4 py-3"><StatusPill label={row.approvalStage} tone={row.approvalStage === 'Published' ? 'green' : 'amber'} /></td>
                      <td className="px-4 py-3"><HealthScoreRing score={row.healthScore} /></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button type="button" className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] px-2 text-xs font-semibold text-[#2563EB]"><Eye className="h-3.5 w-3.5" /> View</button>
                          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#64748B]"><MoreHorizontal className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="min-w-[1000px] w-full text-left">
                <thead className="sticky top-0 bg-[#F8FAFC] text-[13px] font-semibold uppercase text-[#64748B]">
                  <tr>
                    {['Grade', 'Structure', 'Employees', 'Min', 'Midpoint', 'Max', 'Compa', 'Gross', 'Health', 'Score'].map((h) => (
                      <th key={h} className="px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF2F7]">
                  {filteredBands.map((band) => (
                    <tr key={band.grade} className={`cursor-pointer hover:bg-[#F8FAFC] ${selectedGrade === band.grade ? 'bg-blue-50/50' : ''}`} onClick={() => setSelectedGrade(band.grade)}>
                      <td className="px-4 py-3 font-semibold text-[#0F172A]">{band.grade}</td>
                      <td className="px-4 py-3 text-xs text-[#64748B]">{band.structureName}</td>
                      <td className="px-4 py-3">{band.employees}</td>
                      <td className="px-4 py-3 text-sm">{money(band.minPay, canViewMoney)}</td>
                      <td className="px-4 py-3 text-sm">{money(band.midpoint, canViewMoney)}</td>
                      <td className="px-4 py-3 text-sm">{money(band.maxPay, canViewMoney)}</td>
                      <td className="px-4 py-3 text-sm">{pctFmt.format(band.compaRatio)}%</td>
                      <td className="px-4 py-3 text-sm">{money(band.totalGross, canViewMoney)}</td>
                      <td className="px-4 py-3"><StatusPill label={band.health} tone={healthTone(band.health)} /></td>
                      <td className="px-4 py-3"><HealthScoreRing score={band.healthScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </PanelShell>

        {/* Right details panel */}
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[18px] border border-[#E5E7EB] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <div className="border-b border-[#E5E7EB] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Grade Details</p>
                  <h3 className="mt-1 text-xl font-bold text-[#0F172A]">{selectedBand?.grade || '—'}</h3>
                  <p className="text-sm text-[#64748B]">{selectedBand?.structureName || selectedStructure?.name}</p>
                </div>
                {selectedBand ? <StatusPill label={selectedBand.health} tone={healthTone(selectedBand.health)} /> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-[#94A3B8]">Structure</span><p className="font-semibold text-[#0F172A]">{selectedBand?.structureCode}</p></div>
                <div><span className="text-[#94A3B8]">Employees</span><p className="font-semibold text-[#0F172A]">{selectedBand?.employees ?? '—'}</p></div>
                <div><span className="text-[#94A3B8]">Compa Ratio</span><p className="font-semibold text-[#0F172A]">{selectedBand ? `${pctFmt.format(selectedBand.compaRatio)}%` : '—'}</p></div>
                <div><span className="text-[#94A3B8]">Exceptions</span><p className="font-semibold text-[#0F172A]">{selectedBand?.exceptions ?? 0}</p></div>
              </div>
            </div>

            <WorkspaceTabs
              active={detailTab}
              onChange={setDetailTab}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'components', label: 'Band & Components' },
                { id: 'employees', label: `Employees (${selectedBand?.employees ?? 0})` },
                { id: 'history', label: 'History' },
                { id: 'audit', label: 'Audit' },
              ]}
            />

            <div className="space-y-5 p-5">
              {detailTab === 'overview' || detailTab === 'components' ? (
                <>
                  <div>
                    <p className="mb-3 text-sm font-semibold text-[#0F172A]">Salary Range (Monthly)</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Minimum', value: selectedBand?.minPay },
                        { label: 'Mid Point', value: selectedBand?.midpoint },
                        { label: 'Maximum', value: selectedBand?.maxPay },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                          <p className="text-[11px] font-semibold uppercase text-[#94A3B8]">{item.label}</p>
                          <p className="mt-1 text-lg font-bold text-[#0F172A]">{money(item.value ?? null, canViewMoney)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedBand ? (
                    <DonutChart
                      centerLabel="Midpoint"
                      centerValue={canViewMoney ? moneyFmt.format(selectedBand.midpoint).replace('NGN', '₦') : '—'}
                      rows={componentBreakdown}
                    />
                  ) : null}
                </>
              ) : null}

              <AccordionSection title="Grade Progression Path" subtitle="Next eligible grades" count={2}>
                <p className="text-xs text-[#64748B]">Promotion path configured from compensation policy.</p>
              </AccordionSection>
              <AccordionSection title="Assigned Employees" count={selectedBand?.employees}>
                <p className="text-xs text-[#64748B]">{selectedBand?.employees ?? 0} employees mapped to this grade in current payroll period.</p>
              </AccordionSection>
              <AccordionSection title="Approval History" count={3}>
                <p className="text-xs text-[#64748B]">Last published by Payroll Officer on {lastLoaded ? new Date(lastLoaded).toLocaleDateString('en-GB') : '—'}.</p>
              </AccordionSection>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[#E5E7EB] p-4">
              <button type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8]">Edit Grade</button>
              <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold text-[#475569]"><Copy className="h-4 w-4" /> Clone</button>
              <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600"><Archive className="h-4 w-4" /> Archive</button>
            </div>
          </div>
        </aside>
      </div>

      {/* Analytics */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <PanelShell title="Salary Distribution by Grade" className="overflow-hidden">
          <div className="p-5">
            <VerticalBarChart rows={gradeDistribution} formatValue={(v) => `${v} emp`} />
          </div>
        </PanelShell>
        <PanelShell title="Payroll Cost by Department">
          <div className="p-5">
            <p className="mb-3 text-xs text-[#64748B]">Values in millions (NGN)</p>
            <HorizontalBarChart rows={deptPayroll} />
          </div>
        </PanelShell>
        <PanelShell title="Monthly Payroll Trend">
          <div className="p-5">
            <DualLineChart
              labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']}
              nameA="Gross Pay"
              nameB="Net Pay"
              seriesA={[0.82, 0.85, 0.88, 0.9, 0.93, 1].map((v) => v * grossPay)}
              seriesB={[0.65, 0.67, 0.7, 0.72, 0.74, 0.76].map((v) => v * (payload?.summary.netPay || grossPay * 0.75))}
            />
          </div>
        </PanelShell>
        <PanelShell title="Grade Utilization">
          <div className="p-5">
            <DonutChart
              centerLabel="Grades"
              centerValue={String(bands.length)}
              rows={[
                { label: 'Optimal', value: bands.filter((b) => b.health === 'Healthy').length, color: '#10B981' },
                { label: 'Review', value: bands.filter((b) => b.health === 'Review').length, color: '#F59E0B' },
                { label: 'Critical', value: bands.filter((b) => b.health === 'Critical').length, color: '#EF4444' },
              ]}
            />
          </div>
        </PanelShell>
        <PanelShell title="Compensation Trend (YoY)" className="lg:col-span-2">
          <div className="p-5">
            <DualLineChart
              labels={['2022', '2023', '2024', '2025', '2026']}
              nameA="Payroll Cost"
              nameB="Employer Cost"
              seriesA={[0.72, 0.78, 0.85, 0.92, 1].map((v) => v * grossPay * 12)}
              seriesB={[0.8, 0.86, 0.93, 1, 1.08].map((v) => v * grossPay * 12)}
            />
          </div>
        </PanelShell>
      </div>

      {loading ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center bg-white/40 pb-8 backdrop-blur-[1px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#475569] shadow-lg">
            <Sparkles className="h-4 w-4 animate-pulse text-[#2563EB]" /> Loading compensation governance workspace...
          </span>
        </div>
      ) : null}
    </div>
  );
}
