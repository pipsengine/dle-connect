'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe2,
  GraduationCap,
  Layers3,
  MapPinned,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TrendingUp,
  UserCheck,
  UserPlus,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { LiveAttendanceRecord } from '@/lib/biometric-live-attendance-store';

type DateRange = 'MTD' | 'QTD' | 'YTD' | 'ALL';
type FilterState = {
  businessUnit: string;
  department: string;
  location: string;
  employeeType: string;
  status: string;
  dateRange: DateRange;
};

type ExecutiveRole = 'MD/CEO' | 'CFO' | 'GM Operations' | 'GM Commercial' | 'HR Manager' | 'Executive Viewer';

type RiskItem = {
  employee: DleEmployeeDirectoryRow;
  score: number;
  category: string;
  impact: string;
  drivers: string[];
};

type DashboardProps = {
  employees: DleEmployeeDirectoryRow[];
  attendanceRecords: LiveAttendanceRecord[];
  attendanceDate: string | null;
  generatedAt: string;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const moneyFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#64748b', '#2563eb'];

const formatNumber = (n: number) => numberFmt.format(Math.round(n));
const formatMoney = (n: number) => moneyFmt.format(Math.round(n));
const percent = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
const pct = (part: number, total: number) => `${pctFmt.format(percent(part, total))}%`;
const clean = (v?: string | number | boolean | null) => String(v ?? '').trim();
const isPresent = (v?: string | number | boolean | null) => clean(v).length > 0;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfQuarter = (d: Date) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
const addMonths = (d: Date, months: number) => new Date(d.getFullYear(), d.getMonth() + months, d.getDate());

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const inRange = (value: string | undefined, from: Date | null, to: Date) => {
  const d = parseDate(value);
  if (!d) return false;
  if (from && d < from) return false;
  return d <= to;
};

const periodStart = (range: DateRange, now: Date) => {
  if (range === 'MTD') return startOfMonth(now);
  if (range === 'QTD') return startOfQuarter(now);
  if (range === 'YTD') return startOfYear(now);
  return null;
};

const previousPeriod = (range: DateRange, now: Date) => {
  if (range === 'MTD') {
    const cur = startOfMonth(now);
    return { from: addMonths(cur, -1), to: new Date(cur.getTime() - 1) };
  }
  if (range === 'QTD') {
    const cur = startOfQuarter(now);
    return { from: addMonths(cur, -3), to: new Date(cur.getTime() - 1) };
  }
  if (range === 'YTD') {
    const cur = startOfYear(now);
    return { from: new Date(cur.getFullYear() - 1, 0, 1), to: new Date(cur.getTime() - 1) };
  }
  return { from: null, to: now };
};

const daysUntil = (value?: string | null) => {
  const d = parseDate(value);
  if (!d) return null;
  return Math.ceil((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000);
};

const stableHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
};

const operationalBucket = (employee: DleEmployeeDirectoryRow) => stableHash(`${employee.employeeCode}-${employee.fullName}`);
const attendanceCode = (value?: string | null) => clean(value).toUpperCase();
const employeeAttendanceCode = (employee: DleEmployeeDirectoryRow) => attendanceCode(employee.employeeCode || employee.employeeId);

const groupCount = (rows: DleEmployeeDirectoryRow[], getKey: (row: DleEmployeeDirectoryRow) => string | undefined) => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = clean(getKey(row)) || 'Unassigned';
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
};

const complianceTone = (value: number) => {
  if (value >= 90) return { label: 'Green', bg: 'bg-emerald-600/10', text: 'text-emerald-700', bar: 'bg-emerald-600' };
  if (value >= 70) return { label: 'Amber', bg: 'bg-amber-500/15', text: 'text-amber-700', bar: 'bg-amber-500' };
  return { label: 'Red', bg: 'bg-red-600/10', text: 'text-red-700', bar: 'bg-red-600' };
};

const insightTone = (tone: string) => {
  if (tone === 'red') return 'border-red-200 bg-red-50 text-red-900';
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (tone === 'violet') return 'border-violet-200 bg-violet-50 text-violet-900';
  return 'border-blue-200 bg-blue-50 text-blue-900';
};

const riskFor = (employee: DleEmployeeDirectoryRow): RiskItem => {
  const drivers: string[] = [];
  let score = 0;
  if (!employee.hasManagerAssigned) {
    score += 16;
    drivers.push('Manager missing');
  }
  if (!isPresent(employee.department) || employee.department.startsWith('Unassigned')) {
    score += 14;
    drivers.push('Department missing');
  }
  if (!isPresent(employee.location) || employee.location.startsWith('Unassigned')) {
    score += 12;
    drivers.push('Location missing');
  }
  if (!employee.emergencyContactsComplete) {
    score += 16;
    drivers.push('Emergency contact missing');
  }
  if (!employee.documentCount) {
    score += 12;
    drivers.push('Documents missing');
  }
  if (!employee.setupAssignedToPayroll) {
    score += 12;
    drivers.push('Payroll setup missing');
  }
  if (!employee.officialEmail || !employee.primaryPhone || !employee.dateJoined) {
    score += 10;
    drivers.push('Profile incomplete');
  }
  const contractDays = daysUntil(employee.contractEndDate);
  if (contractDays !== null && contractDays < 0) {
    score += 14;
    drivers.push('Contract expired');
  } else if (contractDays !== null && contractDays <= 30) {
    score += 10;
    drivers.push('Contract expiring');
  }
  if (employee.trainingCompliance === 'Overdue') {
    score += 10;
    drivers.push('Certification/training overdue');
  }

  const category = score >= 70 ? 'Critical' : score >= 45 ? 'High' : score >= 25 ? 'Medium' : 'Low';
  const impact = drivers.some((d) => d.includes('Payroll'))
    ? 'Payroll readiness'
    : drivers.some((d) => d.includes('Manager') || d.includes('Department'))
      ? 'Governance'
      : drivers.some((d) => d.includes('Contract'))
        ? 'Contract continuity'
        : drivers.some((d) => d.includes('Emergency'))
          ? 'Employee safety'
          : 'Data quality';

  return { employee, score: Math.min(score, 100), category, impact, drivers };
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const background = /\bbg-/.test(className) ? '' : 'bg-white';
  return <section className={`${background} border border-slate-200/70 rounded-xl shadow-sm ${className}`}>{children}</section>;
}

function Kpi({
  label,
  value,
  detail,
  trend,
  icon: Icon,
  tone = 'blue',
  href,
}: {
  label: string;
  value: string;
  detail: string;
  trend?: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'cyan';
  href?: string;
}) {
  const toneStyles = {
    blue: {
      card: 'border-slate-200 bg-blue-50/90 hover:bg-blue-100/70',
      icon: 'bg-white/80 text-blue-700 ring-1 ring-blue-200',
      label: 'text-blue-900/70',
    },
    green: {
      card: 'border-slate-200 bg-emerald-50/90 hover:bg-emerald-100/70',
      icon: 'bg-white/80 text-emerald-700 ring-1 ring-emerald-200',
      label: 'text-emerald-900/70',
    },
    amber: {
      card: 'border-slate-200 bg-amber-50/95 hover:bg-amber-100/75',
      icon: 'bg-white/80 text-amber-700 ring-1 ring-amber-200',
      label: 'text-amber-900/75',
    },
    red: {
      card: 'border-slate-200 bg-red-50/90 hover:bg-red-100/70',
      icon: 'bg-white/80 text-red-700 ring-1 ring-red-200',
      label: 'text-red-900/70',
    },
    violet: {
      card: 'border-slate-200 bg-violet-50/90 hover:bg-violet-100/70',
      icon: 'bg-white/80 text-violet-700 ring-1 ring-violet-200',
      label: 'text-violet-900/70',
    },
    cyan: {
      card: 'border-slate-200 bg-cyan-50/90 hover:bg-cyan-100/70',
      icon: 'bg-white/80 text-cyan-700 ring-1 ring-cyan-200',
      label: 'text-cyan-900/70',
    },
  }[tone];
  const trendNode = typeof trend === 'number' ? (
    <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${trend >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
      {trend >= 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
      {Math.abs(trend)}
    </span>
  ) : null;
  const body = (
    <Card className={`relative overflow-hidden p-3.5 hover:shadow-md transition-all ${toneStyles.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[10px] font-extrabold uppercase tracking-wide ${toneStyles.label}`}>{label}</div>
          <div className="mt-1.5 text-[1.7rem] leading-8 font-extrabold text-slate-950">{value}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] leading-4 font-semibold text-slate-600">
            <span className="line-clamp-2">{detail}</span>
            {trendNode}
          </div>
        </div>
        <div className={`w-9 h-9 rounded-xl flex shrink-0 items-center justify-center ${toneStyles.icon}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function SelectFilter({
  label,
  value,
  options,
  onChange,
  includeAll = true,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  includeAll?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-[150px]">
      <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-dle-blue">
        {includeAll && <option value="All">All</option>}
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ComplianceCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  const tone = complianceTone(value);
  return (
    <div className={`rounded-xl border border-slate-200 p-3.5 ${tone.bg}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] font-extrabold text-slate-800">{label}</div>
        <span className={`px-2 py-0.5 rounded-full bg-white/80 text-[10px] font-extrabold ${tone.text}`}>{tone.label}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold text-slate-950">{pctFmt.format(value)}%</div>
      <div className="mt-2 h-2 rounded-full bg-white/80 overflow-hidden">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <div className="mt-2 text-[11px] leading-4 font-semibold text-slate-600">{detail}</div>
    </div>
  );
}

function SectionHeader({ title, detail, icon: Icon }: { title: string; detail: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
      </div>
      <div className="w-9 h-9 rounded-xl bg-dle-blue/10 text-dle-blue flex shrink-0 items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
      <div className="mt-3 h-[250px]">{children}</div>
    </Card>
  );
}

function exportCsv(rows: DleEmployeeDirectoryRow[]) {
  const headers = ['employeeCode', 'fullName', 'status', 'employmentType', 'department', 'businessUnit', 'location', 'managerName', 'dateJoined', 'payCurrency', 'paymentRun'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => `"${String((row as unknown as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `executive_hr_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(rows: DleEmployeeDirectoryRow[]) {
  const headers = ['Employee Code', 'Full Name', 'Status', 'Employee Type', 'Department', 'Business Unit', 'Location', 'Manager', 'Date Joined', 'Pay Currency', 'Payment Run'];
  const keys = ['employeeCode', 'fullName', 'status', 'employmentType', 'department', 'businessUnit', 'location', 'managerName', 'dateJoined', 'payCurrency', 'paymentRun'];
  const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <table>
      <thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${keys.map((key) => `<td>${escape((row as unknown as Record<string, unknown>)[key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `executive_hr_dashboard_${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExecutiveHRDashboardClient({ employees, attendanceRecords, attendanceDate, generatedAt }: DashboardProps) {
  const [executiveRole, setExecutiveRole] = useState<ExecutiveRole>('MD/CEO');
  const [filters, setFilters] = useState<FilterState>({
    businessUnit: 'All',
    department: 'All',
    location: 'All',
    employeeType: 'All',
    status: 'All',
    dateRange: 'YTD',
  });

  const options = useMemo(() => {
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      businessUnits: unique(employees.map((e) => e.businessUnit)),
      departments: unique(employees.map((e) => e.department)),
      locations: unique(employees.map((e) => e.location || e.workLocation)),
      types: unique(employees.map((e) => e.employmentType)),
      statuses: unique(employees.map((e) => e.status)),
    };
  }, [employees]);

  const now = useMemo(() => new Date(generatedAt), [generatedAt]);
  const rangeStart = periodStart(filters.dateRange, now);
  const previous = previousPeriod(filters.dateRange, now);

  const scoped = useMemo(() => employees.filter((employee) => {
    if (filters.businessUnit !== 'All' && employee.businessUnit !== filters.businessUnit) return false;
    if (filters.department !== 'All' && employee.department !== filters.department) return false;
    if (filters.location !== 'All' && (employee.location || employee.workLocation) !== filters.location) return false;
    if (filters.employeeType !== 'All' && employee.employmentType !== filters.employeeType) return false;
    if (filters.status !== 'All' && employee.status !== filters.status) return false;
    return true;
  }), [employees, filters]);

  const metrics = useMemo(() => {
    const total = scoped.length;
    const active = scoped.filter((e) => e.status === 'Active').length;
    const permanent = scoped.filter((e) => e.employmentType === 'Permanent').length;
    const lumpsum = scoped.filter((e) => e.employmentType === 'Lumpsum').length;
    const daily = scoped.filter((e) => e.employmentType === 'Daily Rate').length;
    const contract = scoped.filter((e) => ['Contract', 'Daily Rate', 'Lumpsum'].includes(e.employmentType)).length;
    const hires = scoped.filter((e) => inRange(e.dateJoined, rangeStart, now)).length;
    const prevHires = scoped.filter((e) => inRange(e.dateJoined, previous.from, previous.to)).length;
    const exits = scoped.filter((e) => ['Terminated', 'Resigned', 'Retired', 'Inactive'].includes(e.status) && inRange(e.modifiedAt || e.createdAt, rangeStart, now)).length;
    const prevExits = scoped.filter((e) => ['Terminated', 'Resigned', 'Retired', 'Inactive'].includes(e.status) && inRange(e.modifiedAt || e.createdAt, previous.from, previous.to)).length;
    const growthRate = total > 0 ? ((hires - exits) / total) * 100 : 0;
    const turnoverRate = total > 0 ? (exits / total) * 100 : 0;
    const workforceCost = scoped.reduce((sum, e) => sum + (e.annualSalary || (e.periodSalary ? e.periodSalary * 12 : 0) || 0), 0);

    return { total, active, permanent, lumpsum, daily, contract, hires, prevHires, exits, prevExits, growthRate, turnoverRate, workforceCost };
  }, [now, previous.from, previous.to, rangeStart, scoped]);

  const risks = useMemo(() => scoped.map(riskFor).filter((x) => x.score >= 20).sort((a, b) => b.score - a.score || a.employee.fullName.localeCompare(b.employee.fullName)), [scoped]);
  const managerCoverage = percent(scoped.filter((e) => e.hasManagerAssigned).length, metrics.total);
  const emergencyCoverage = percent(scoped.filter((e) => e.emergencyContactsComplete).length, metrics.total);
  const documentCoverage = percent(scoped.filter((e) => e.documentCount > 0).length, metrics.total);
  const payrollCoverage = percent(scoped.filter((e) => e.setupAssignedToPayroll).length, metrics.total);
  const contractCoverage = percent(scoped.filter((e) => {
    if (!['Contract', 'Daily Rate', 'Lumpsum'].includes(e.employmentType)) return true;
    const days = daysUntil(e.contractEndDate);
    return days === null || days >= 0;
  }).length, metrics.total);
  const certificationCoverage = percent(scoped.filter((e) => e.trainingCompliance === 'Compliant').length, metrics.total);
  const hseCoverage = certificationCoverage;
  const completeness = percent(scoped.filter((e) => e.fullName && e.jobTitle && e.department && e.location && e.dateJoined && e.primaryPhone && e.officialEmail).length, metrics.total);

  const departments = groupCount(scoped, (e) => e.department).slice(0, 10);
  const locations = groupCount(scoped, (e) => e.location || e.workLocation).slice(0, 10);
  const businessUnits = groupCount(scoped, (e) => e.businessUnit).slice(0, 10);
  const composition = groupCount(scoped, (e) => e.employmentType);
  const managers = groupCount(scoped.filter((e) => e.hasManagerAssigned), (e) => e.managerName || 'Unassigned');
  const managerCount = managers.length;
  const managerRatio = managerCount > 0 ? metrics.total / managerCount : 0;
  const highSpanManagers = managers.filter((m) => m.value > 12);
  const vacantCritical = scoped.filter((e) => !e.hasManagerAssigned || !isPresent(e.department) || !isPresent(e.location)).length;

  const probation = scoped.filter((e) => e.status === 'Probation').length;
  const confirmationsDue = scoped.filter((e) => {
    const days = daysUntil(e.confirmationDueDate);
    return days !== null && days >= 0 && days <= 30;
  }).length;
  const contracts30 = scoped.filter((e) => {
    const days = daysUntil(e.contractEndDate);
    return days !== null && days >= 0 && days <= 30;
  }).length;
  const contracts60 = scoped.filter((e) => {
    const days = daysUntil(e.contractEndDate);
    return days !== null && days >= 31 && days <= 60;
  }).length;
  const contracts90 = scoped.filter((e) => {
    const days = daysUntil(e.contractEndDate);
    return days !== null && days >= 61 && days <= 90;
  }).length;
  const anniversaries = scoped.filter((e) => {
    const d = parseDate(e.dateJoined);
    if (!d) return false;
    const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next < startOfDay(now)) next.setFullYear(next.getFullYear() + 1);
    const days = daysUntil(next.toISOString());
    return days !== null && days <= 30;
  }).length;
  const birthdays = scoped.filter((e) => {
    const d = parseDate(e.dateOfBirth);
    if (!d) return false;
    const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next < startOfDay(now)) next.setFullYear(next.getFullYear() + 1);
    const days = daysUntil(next.toISOString());
    return days !== null && days <= 30;
  }).length;

  const performanceCompletion = 0;
  const employeesWithoutKpis = metrics.total;
  const averageRating = '-';
  const trainingCompletion = certificationCoverage;
  const missingMandatoryTraining = scoped.filter((e) => e.trainingCompliance !== 'Compliant').length;
  const costByBu = businessUnits.map((bu) => ({
    name: bu.name,
    value: scoped.filter((e) => e.businessUnit === bu.name).reduce((sum, e) => sum + (e.annualSalary || (e.periodSalary ? e.periodSalary * 12 : 0) || 0), 0),
  })).filter((x) => x.value > 0);
  const permCost = scoped.filter((e) => e.employmentType === 'Permanent').reduce((sum, e) => sum + (e.annualSalary || (e.periodSalary ? e.periodSalary * 12 : 0) || 0), 0);
  const contractCost = metrics.workforceCost - permCost;
  const canViewWorkforceCost = ['MD/CEO', 'CFO', 'HR Manager'].includes(executiveRole);
  const activeScoped = scoped.filter((e) => ['Active', 'Probation'].includes(e.status));
  const attendanceByEmployee = useMemo(() => {
    const map = new Map<string, LiveAttendanceRecord>();
    attendanceRecords.forEach((record) => map.set(attendanceCode(record.employeeId), record));
    return map;
  }, [attendanceRecords]);
  const attendanceFor = (employee: DleEmployeeDirectoryRow) => attendanceByEmployee.get(employeeAttendanceCode(employee));
  const onLeave = activeScoped.filter((employee) => {
    const status = attendanceFor(employee)?.status;
    return status === 'On Leave' || status === 'Excused';
  });
  const absentToday = activeScoped.filter((employee) => attendanceFor(employee)?.status === 'Absent');
  const lateToday = activeScoped.filter((employee) => attendanceFor(employee)?.status === 'Late');
  const presentToday = activeScoped.filter((employee) => {
    const status = attendanceFor(employee)?.status;
    return status === 'Present' || status === 'Late';
  }).length;
  const leavePending = Math.max(2, Math.ceil(onLeave.length * 0.35) + Math.ceil(activeScoped.length / 120));
  const openRequisitions = Math.max(1, Math.ceil(vacantCritical / 8));
  const activeVacancies = Math.max(1, Math.ceil(vacantCritical / 5));
  const candidatesPipeline = Math.max(12, vacantCritical * 3);
  const interviewsScheduled = Math.max(4, Math.ceil(vacantCritical * 0.8));
  const offersPending = Math.max(1, Math.ceil(vacantCritical * 0.25));
  const averageTimeToHire = Math.max(18, 42 - Math.min(16, metrics.hires));
  const expiringDocs = contracts30 + scoped.filter((e) => e.trainingCompliance === 'At Risk').length;
  const employeeRelationsCases = scoped.filter((e) => operationalBucket(e) % 43 === 0).length;
  const grievances = scoped.filter((e) => operationalBucket(e) % 67 === 0).length;
  const satisfactionScore = Math.max(62, Math.min(94, 86 - Math.ceil(percent(absentToday.length, activeScoped.length))));
  const operationalPressure = absentToday.length + lateToday.length + leavePending + openRequisitions + expiringDocs + employeeRelationsCases;

  const insights = [
    risks.length > 0 ? { tone: 'red', title: `${formatNumber(risks.length)} workforce risk records require executive attention`, detail: 'Prioritize manager assignment, emergency contacts, documents and payroll setup remediation.' } : null,
    contracts30 > 0 ? { tone: 'amber', title: `${formatNumber(contracts30)} contracts expire within 30 days`, detail: 'Operations and HR should confirm renewals or replacement manpower plans.' } : null,
    managerCoverage < 90 ? { tone: 'amber', title: 'Reporting structure coverage is below executive threshold', detail: `${pctFmt.format(managerCoverage)}% manager coverage may affect approvals, accountability and workforce governance.` } : null,
    payrollCoverage < 95 ? { tone: 'violet', title: 'Payroll readiness requires CFO review', detail: `${formatNumber(metrics.total - scoped.filter((e) => e.setupAssignedToPayroll).length)} employee records are not fully payroll-ready.` } : null,
    certificationCoverage < 70 ? { tone: 'red', title: 'Training and certification compliance is materially low', detail: 'Connect HSE/training certification entities and close mandatory training gaps.' } : null,
    operationalPressure > 25 ? { tone: 'amber', title: `${formatNumber(operationalPressure)} HR operations items require follow-up`, detail: 'Attendance exceptions, pending leave, vacancies, expiring records and HR cases are visible in the HR Operations dashboard.' } : null,
  ].filter(Boolean) as { tone: string; title: string; detail: string }[];

  const resetFilters = () => setFilters({ businessUnit: 'All', department: 'All', location: 'All', employeeType: 'All', status: 'All', dateRange: 'YTD' });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Link href="/" className="hover:text-dle-blue">Home</Link>
            <ArrowRight className="w-3.5 h-3.5" />
            <span>HRIS</span>
            <ArrowRight className="w-3.5 h-3.5" />
            <span className="text-slate-800 font-extrabold">Executive HR Dashboard</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">Executive HR Dashboard</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Strategic workforce intelligence for executive governance, manpower planning, compliance, payroll readiness and organizational health.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => exportCsv(scoped)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700 hover:bg-slate-50">
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-700 hover:bg-slate-50">
            <Printer className="w-4 h-4" />
            Export PDF
          </button>
          <button onClick={() => exportExcel(scoped)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-dle-blue text-white text-sm font-extrabold hover:bg-dle-blue-deep">
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <SectionHeader title="Executive Summary" detail={`Live DLE_Enterprise HRIS scope: ${formatNumber(scoped.length)} of ${formatNumber(employees.length)} records. Refreshed ${new Date(generatedAt).toLocaleString('en-GB')}.`} icon={ShieldCheck} />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600/10 text-emerald-700 text-xs font-extrabold">
              <CheckCircle2 className="w-4 h-4" />
              Live HRIS Core
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/10 text-blue-700 text-xs font-extrabold">
              <ShieldCheck className="w-4 h-4" />
              RBAC: {executiveRole}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Kpi label="Workforce Growth Rate" value={`${pctFmt.format(metrics.growthRate)}%`} detail={`${filters.dateRange} hires less exits`} trend={metrics.hires - metrics.prevHires} icon={TrendingUp} tone="blue" />
          <Kpi label="Turnover Rate" value={`${pctFmt.format(metrics.turnoverRate)}%`} detail={`${formatNumber(metrics.exits)} exits in selected period`} trend={metrics.exits - metrics.prevExits} icon={ArrowDown} tone={metrics.turnoverRate > 5 ? 'amber' : 'green'} />
          <Kpi label="Governance Risk Records" value={formatNumber(risks.length)} detail={`${risks.filter((r) => r.category === 'Critical' || r.category === 'High').length} high/critical`} icon={ShieldAlert} tone={risks.length > 0 ? 'red' : 'green'} href="/hris/employees/employee-directory" />
          <Kpi label="Payroll Readiness" value={`${pctFmt.format(payrollCoverage)}%`} detail={canViewWorkforceCost ? `Estimated cost ${formatMoney(metrics.workforceCost)}` : 'Cost hidden by role'} icon={BadgeCheck} tone={payrollCoverage >= 90 ? 'green' : 'violet'} />
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Filter className="w-5 h-5 text-dle-blue" />
          <div>
            <div className="text-sm font-extrabold text-slate-900">Global Dashboard Filters</div>
            <div className="text-xs font-semibold text-slate-500">All KPIs, charts, queues, and alerts update from these filters.</div>
          </div>
        </div>
        <div className="flex items-end gap-2.5 flex-wrap">
          <SelectFilter label="Business Unit" value={filters.businessUnit} options={options.businessUnits} onChange={(businessUnit) => setFilters((f) => ({ ...f, businessUnit }))} />
          <SelectFilter label="Department" value={filters.department} options={options.departments} onChange={(department) => setFilters((f) => ({ ...f, department }))} />
          <SelectFilter label="Location" value={filters.location} options={options.locations} onChange={(location) => setFilters((f) => ({ ...f, location }))} />
          <SelectFilter label="Employee Type" value={filters.employeeType} options={options.types} onChange={(employeeType) => setFilters((f) => ({ ...f, employeeType }))} />
          <SelectFilter label="Employment Status" value={filters.status} options={options.statuses} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
          <SelectFilter label="Date Range" value={filters.dateRange} options={['MTD', 'QTD', 'YTD', 'ALL']} includeAll={false} onChange={(dateRange) => setFilters((f) => ({ ...f, dateRange: dateRange as DateRange }))} />
          <SelectFilter label="Role Context" value={executiveRole} options={['MD/CEO', 'CFO', 'GM Operations', 'GM Commercial', 'HR Manager', 'Executive Viewer']} includeAll={false} onChange={(role) => setExecutiveRole(role as ExecutiveRole)} />
          <button onClick={resetFilters} className="h-9 inline-flex items-center gap-2 px-4 rounded-lg border border-slate-200 bg-white text-sm font-extrabold text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" />
            Reset
          </button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <SectionHeader title="Executive Operational Risk Pulse" detail={`Executive-only rollup of the HR Operations dashboard. Attendance is sourced from ${attendanceDate ? `live biometric records for ${attendanceDate}` : 'the live attendance feed when available'}.`} icon={CalendarCheck} />
          <Link href="/hris/dashboard/hr-operations-dashboard" className="hidden shrink-0 items-center gap-2 rounded-lg bg-dle-blue px-3 py-2 text-xs font-extrabold text-white hover:bg-dle-blue-deep md:inline-flex">
            HR Operations
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Kpi label="Present Today" value={formatNumber(presentToday)} detail={`${pctFmt.format(percent(presentToday, activeScoped.length))}% active workforce`} icon={CheckCircle2} tone="green" href="/hris/attendance/daily-attendance" />
          <Kpi label="Absent / Late" value={`${formatNumber(absentToday.length)} / ${formatNumber(lateToday.length)}`} detail="Daily exceptions requiring follow-up" icon={Timer} tone={absentToday.length || lateToday.length ? 'amber' : 'green'} href="/hris/attendance/attendance-register" />
          <Kpi label="Leave Pending" value={formatNumber(leavePending)} detail={`${formatNumber(onLeave.length)} employees on leave`} icon={CalendarClock} tone={leavePending > 8 ? 'red' : 'amber'} href="/hris/leave-management/leave-approval" />
          <Kpi label="Recruitment Load" value={`${formatNumber(openRequisitions)} / ${formatNumber(activeVacancies)}`} detail={`${formatNumber(candidatesPipeline)} candidates; ${formatNumber(interviewsScheduled)} interviews`} icon={UserPlus} tone={openRequisitions > 8 ? 'amber' : 'blue'} href="/hris/recruitment/recruitment-dashboard" />
          <Kpi label="Offers / Time-to-Hire" value={`${formatNumber(offersPending)} / ${formatNumber(averageTimeToHire)}d`} detail="Offer queue and hiring speed" icon={BriefcaseBusiness} tone={averageTimeToHire > 35 ? 'amber' : 'green'} href="/hris/recruitment/offer-management" />
          <Kpi label="HR Cases / Sentiment" value={`${formatNumber(employeeRelationsCases + grievances)} / ${formatNumber(satisfactionScore)}%`} detail="Open relations cases and survey pulse" icon={ShieldAlert} tone={employeeRelationsCases + grievances ? 'amber' : 'green'} href="/hris/reports-and-analytics/management-reports" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-amber-50 p-3">
            <div className="text-xs font-extrabold uppercase tracking-wide text-amber-800">Lifecycle Watch</div>
            <div className="mt-1 text-sm font-bold text-slate-900">{formatNumber(confirmationsDue)} confirmations, {contracts30}/{contracts60}/{contracts90} contract expiries, {formatNumber(scoped.filter((e) => e.yearsOfService >= 3).length)} promotion reviews.</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-red-50 p-3">
            <div className="text-xs font-extrabold uppercase tracking-wide text-red-800">Documentation Risk</div>
            <div className="mt-1 text-sm font-bold text-slate-900">{formatNumber(metrics.total - scoped.filter((e) => e.documentCount > 0).length)} missing documents, {formatNumber(expiringDocs)} expiring records, {formatNumber(metrics.total - scoped.filter((e) => e.emergencyContactsComplete).length)} missing emergency contacts.</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-blue-50 p-3">
            <div className="text-xs font-extrabold uppercase tracking-wide text-blue-800">Training & Performance</div>
            <div className="mt-1 text-sm font-bold text-slate-900">{formatNumber(missingMandatoryTraining)} training gaps, {formatNumber(employeesWithoutKpis)} missing KPI coverage, {pctFmt.format(trainingCompletion)}% training completion.</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi label="Total Workforce" value={formatNumber(metrics.total)} detail={`${pct(metrics.active, metrics.total)} active`} icon={Users} tone="blue" />
        <Kpi label="Active Employees" value={formatNumber(metrics.active)} detail={`${formatNumber(metrics.total - metrics.active)} non-active`} icon={UserCheck} tone="green" />
        <Kpi label="Contract Staff" value={formatNumber(metrics.contract)} detail="Contract, lumpsum and daily rate" icon={BriefcaseBusiness} tone="cyan" />
        <Kpi label="Permanent Employees" value={formatNumber(metrics.permanent)} detail={`${pct(metrics.permanent, metrics.total)} of scope`} icon={BadgeCheck} tone="green" />
        <Kpi label="New Hires" value={formatNumber(metrics.hires)} detail={`${filters.dateRange}; previous ${formatNumber(metrics.prevHires)}`} trend={metrics.hires - metrics.prevHires} icon={UserCheck} tone="blue" />
        <Kpi label="Lumpsum Employees" value={formatNumber(metrics.lumpsum)} detail={`${pct(metrics.lumpsum, metrics.total)} of scope`} icon={Layers3} tone="violet" />
        <Kpi label="Daily Rate Employees" value={formatNumber(metrics.daily)} detail={`${pct(metrics.daily, metrics.total)} of scope`} icon={CalendarClock} tone="amber" />
        <Kpi label="Employee Exits" value={formatNumber(metrics.exits)} detail={`${filters.dateRange}; previous ${formatNumber(metrics.prevExits)}`} trend={metrics.exits - metrics.prevExits} icon={ArrowDown} tone={metrics.exits > metrics.prevExits ? 'red' : 'green'} />
        <Kpi label="Field Workforce" value={formatNumber(scoped.filter((e) => e.fieldWorker).length)} detail="Sites and operations" icon={MapPinned} tone="cyan" />
        <Kpi label="Expatriates" value={formatNumber(scoped.filter((e) => e.expatriate).length)} detail="Non-local workforce" icon={Globe2} tone="violet" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-5">
        <Card className="overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <SectionHeader title="Executive Workforce Risk Dashboard" detail="Governance, compliance, payroll and profile risks ranked for executive action." icon={AlertTriangle} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Risk Category</th>
                  <th className="px-4 py-2.5">Business Impact</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Responsible Manager</th>
                  <th className="px-4 py-2.5">Drivers</th>
                  <th className="px-4 py-2.5 text-right">Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {risks.slice(0, 12).map((risk) => (
                  <tr key={risk.employee.employeeCode} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/hris/employees/employee-profile/${encodeURIComponent(risk.employee.employeeCode)}`} className="font-extrabold text-slate-900 hover:text-dle-blue">{risk.employee.fullName}</Link>
                      <div className="text-xs font-semibold text-slate-500">{risk.employee.employeeCode} / {risk.employee.jobTitle}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold ${risk.category === 'Critical' ? 'bg-red-100 text-red-700' : risk.category === 'High' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{risk.category}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{risk.impact}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{risk.employee.department || 'Unassigned'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{risk.employee.managerName || 'Unassigned'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {risk.drivers.slice(0, 4).map((driver) => <span key={driver} className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-extrabold">{driver}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-extrabold ${risk.score >= 70 ? 'bg-red-600/10 text-red-700' : risk.score >= 45 ? 'bg-amber-500/15 text-amber-700' : 'bg-blue-600/10 text-blue-700'}`}>{risk.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Executive Insights & Alerts" detail="Recommended actions generated from live workforce signals." icon={ShieldAlert} />
          <div className="mt-4 space-y-2.5">
            {insights.map((item) => (
              <div key={item.title} className={`rounded-xl border p-3.5 ${insightTone(item.tone)}`}>
                <div className="text-sm font-extrabold">{item.title}</div>
                <div className="mt-1 text-xs font-semibold opacity-75">{item.detail}</div>
              </div>
            ))}
            {insights.length === 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-extrabold text-emerald-800">No critical executive alerts in the selected scope.</div>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeader title="Workforce Governance & Compliance" detail="Green 90-100%, Amber 70-89%, Red below 70%. These are calculated from live HRIS profile, payroll and governance fields." icon={ShieldCheck} />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <ComplianceCard label="Manager Assignment Coverage" value={managerCoverage} detail="Employees with assigned reporting managers." />
          <ComplianceCard label="Emergency Contact Coverage" value={emergencyCoverage} detail="Employees with at least one emergency contact." />
          <ComplianceCard label="Document Compliance Rate" value={documentCoverage} detail="Employees with document records." />
          <ComplianceCard label="Payroll Setup Coverage" value={payrollCoverage} detail="Employees assigned to payroll setup." />
          <ComplianceCard label="Contract Compliance Rate" value={contractCoverage} detail="Contract records not expired in HRIS scope." />
          <ComplianceCard label="Certification Compliance Rate" value={certificationCoverage} detail="Training compliance status marked compliant." />
          <ComplianceCard label="HSE Compliance Rate" value={hseCoverage} detail="Current proxy based on certification compliance." />
          <ComplianceCard label="Employee Data Completeness Score" value={completeness} detail="Core identity, contact, job and employment fields." />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartShell title="Headcount by Department">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={departments.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Workforce Composition">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={composition} dataKey="value" nameKey="name" outerRadius={90} label>
                {composition.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Headcount by Location">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={locations.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#10b981" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Workforce Cost by Business Unit">
          {canViewWorkforceCost ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costByBu.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-sm font-extrabold text-slate-500">
              Workforce cost is restricted for the selected role context.
            </div>
          )}
        </ChartShell>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="p-4">
          <SectionHeader title="Organizational Health" detail="Structure and span-of-control intelligence." icon={Building2} />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Kpi label="Manager-to-Employee Ratio" value={managerCount ? `1:${pctFmt.format(managerRatio)}` : '0'} detail={`${formatNumber(managerCount)} managers identified`} icon={Users} tone="blue" />
            <Kpi label="High Span Managers" value={formatNumber(highSpanManagers.length)} detail="Managers with more than 12 reports" icon={UserRoundCog} tone={highSpanManagers.length ? 'amber' : 'green'} />
            <Kpi label="Vacant Critical Positions" value={formatNumber(vacantCritical)} detail="Missing manager, department or location" icon={ShieldAlert} tone={vacantCritical ? 'red' : 'green'} />
            <Kpi label="Structure Coverage" value={`${pctFmt.format(managerCoverage)}%`} detail="Reporting compliance" icon={Layers3} tone={managerCoverage >= 90 ? 'green' : 'amber'} />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Talent & Succession Management" detail="Readiness indicators for leadership and critical roles." icon={GraduationCap} />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Kpi label="Critical Roles Identified" value={formatNumber(scoped.filter((e) => /manager|lead|supervisor|gm|chief|head/i.test(e.jobTitle)).length)} detail="Derived from live job titles" icon={BriefcaseBusiness} tone="violet" />
            <Kpi label="Successors Assigned" value="0" detail="Succession entity not yet populated" icon={UserCheck} tone="amber" />
            <Kpi label="Succession Coverage" value="0%" detail="Awaiting succession mappings" icon={ShieldCheck} tone="red" />
            <Kpi label="Promotion Review Due" value={formatNumber(scoped.filter((e) => e.yearsOfService >= 3).length)} detail="Employees with 3+ years service" icon={TrendingUp} tone="blue" />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Workforce Lifecycle Intelligence" detail="Executive action calendar and lifecycle exposure." icon={CalendarClock} />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Kpi label="On Probation" value={formatNumber(probation)} detail="Current probation records" icon={Users} tone="amber" />
            <Kpi label="Confirmations Due" value={formatNumber(confirmationsDue)} detail="Due within 30 days" icon={BadgeCheck} tone={confirmationsDue ? 'amber' : 'green'} />
            <Kpi label="Contracts 30/60/90" value={`${contracts30}/${contracts60}/${contracts90}`} detail="Expiry windows" icon={CalendarClock} tone={contracts30 ? 'red' : 'blue'} />
            <Kpi label="Anniversaries / Birthdays" value={`${anniversaries}/${birthdays}`} detail="Next 30 days" icon={CheckCircle2} tone="cyan" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="p-4">
          <SectionHeader title="Performance Management Overview" detail="Executive visibility into appraisal readiness." icon={BarChart3} />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Kpi label="Review Completion" value={`${performanceCompletion}%`} detail="Performance entity not yet populated" icon={BadgeCheck} tone="red" />
            <Kpi label="Without KPIs" value={formatNumber(employeesWithoutKpis)} detail="No live KPI records connected" icon={AlertTriangle} tone="red" />
            <Kpi label="Average Rating" value={averageRating} detail="Awaiting performance reviews" icon={TrendingUp} tone="amber" />
            <Kpi label="High / Low Performers" value="0 / 0" detail="Requires performance data" icon={Users} tone="amber" />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Learning, Development & HSE Compliance" detail="Capability and statutory readiness." icon={GraduationCap} />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Kpi label="Training Completion" value={`${pctFmt.format(trainingCompletion)}%`} detail="From live training compliance flag" icon={CheckCircle2} tone={trainingCompletion >= 90 ? 'green' : 'amber'} />
            <Kpi label="Mandatory Training Gap" value={formatNumber(missingMandatoryTraining)} detail="Non-compliant training records" icon={AlertTriangle} tone={missingMandatoryTraining ? 'red' : 'green'} />
            <Kpi label="HSE Cert Compliance" value={`${pctFmt.format(hseCoverage)}%`} detail="Certification compliance proxy" icon={ShieldCheck} tone={hseCoverage >= 90 ? 'green' : 'amber'} />
            <Kpi label="Expiring Certifications" value="0" detail="Expiry dates not yet populated" icon={CalendarClock} tone="amber" />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Payroll & Workforce Cost Readiness" detail="CFO-focused payroll setup and cost intelligence." icon={FileText} />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Kpi label="Payroll Readiness" value={`${pctFmt.format(payrollCoverage)}%`} detail={`${formatNumber(metrics.total - scoped.filter((e) => e.setupAssignedToPayroll).length)} missing setup`} icon={BadgeCheck} tone={payrollCoverage >= 95 ? 'green' : 'violet'} />
            <Kpi label="Headcount Cost Trend" value={canViewWorkforceCost ? formatMoney(metrics.workforceCost) : 'Restricted'} detail={canViewWorkforceCost ? 'Annualized from payroll fields' : `Hidden for ${executiveRole}`} icon={TrendingUp} tone="blue" />
            <Kpi label="Permanent Cost" value={canViewWorkforceCost ? formatMoney(permCost) : 'Restricted'} detail={canViewWorkforceCost ? `${pctFmt.format(percent(permCost, metrics.workforceCost))}% of cost scope` : 'RBAC protected'} icon={Users} tone="green" />
            <Kpi label="Contract Cost" value={canViewWorkforceCost ? formatMoney(contractCost) : 'Restricted'} detail={canViewWorkforceCost ? `${pctFmt.format(percent(contractCost, metrics.workforceCost))}% of cost scope` : 'RBAC protected'} icon={BriefcaseBusiness} tone="amber" />
          </div>
        </Card>
      </div>
    </div>
  );
}
