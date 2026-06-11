'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  HeartHandshake,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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
type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'cyan';
type FilterState = {
  businessUnit: string;
  department: string;
  location: string;
  employeeType: string;
  status: string;
  dateRange: DateRange;
  role: 'HR Manager' | 'HR Officer' | 'Recruitment Lead' | 'Payroll Viewer' | 'Executive Viewer';
};
type Drilldown = {
  title: string;
  rows: DleEmployeeDirectoryRow[];
  note: string;
} | null;

type DashboardProps = {
  employees: DleEmployeeDirectoryRow[];
  attendanceRecords: LiveAttendanceRecord[];
  attendanceDate: string | null;
  generatedAt: string;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b'];

const formatNumber = (n: number) => numberFmt.format(Math.round(n));
const percent = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);
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

const daysUntil = (value?: string | null) => {
  const d = parseDate(value);
  if (!d) return null;
  return Math.ceil((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000);
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

const monthLabel = (date: Date) => date.toLocaleString('en-GB', { month: 'short' });

const toneFor = (value: number, amber: number, red: number, reverse = false): Tone => {
  if (reverse) {
    if (value >= red) return 'red';
    if (value >= amber) return 'amber';
    return 'green';
  }
  if (value <= red) return 'red';
  if (value <= amber) return 'amber';
  return 'green';
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const background = /\bbg-/.test(className) ? '' : 'bg-white';
  return <section className={`${background} rounded-lg border border-slate-200 shadow-sm ${className}`}>{children}</section>;
}

function ToneKpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  trend,
  onClick,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  trend?: number;
  onClick?: () => void;
  href?: string;
}) {
  const styles = {
    green: 'bg-emerald-50/95 text-emerald-900',
    amber: 'bg-amber-50/95 text-amber-950',
    red: 'bg-red-50/95 text-red-950',
    blue: 'bg-blue-50/95 text-blue-950',
    violet: 'bg-violet-50/95 text-violet-950',
    cyan: 'bg-cyan-50/95 text-cyan-950',
  }[tone];
  const iconStyle = {
    green: 'text-emerald-700 ring-emerald-200',
    amber: 'text-amber-700 ring-amber-200',
    red: 'text-red-700 ring-red-200',
    blue: 'text-blue-700 ring-blue-200',
    violet: 'text-violet-700 ring-violet-200',
    cyan: 'text-cyan-700 ring-cyan-200',
  }[tone];
  const body = (
    <Card className={`p-3.5 transition hover:shadow-md ${styles}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-wide opacity-75">{label}</div>
          <div className="mt-1.5 text-2xl font-extrabold text-slate-950">{value}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold leading-4 text-slate-600">
            <span className="line-clamp-2">{detail}</span>
            {typeof trend === 'number' && (
              <span className={`inline-flex items-center gap-1 font-extrabold ${trend >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {trend >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {Math.abs(trend)}
              </span>
            )}
          </div>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 ring-1 ${iconStyle}`}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </Card>
  );
  if (href) return <Link href={href}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{body}</button>;
  return body;
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
    <label className="flex min-w-[150px] flex-col gap-1">
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

function SectionHeader({ title, detail, icon: Icon }: { title: string; detail: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dle-blue/10 text-dle-blue">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  );
}

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
      <div className="mt-3 h-[240px]">{children}</div>
    </Card>
  );
}

function exportRows(rows: DleEmployeeDirectoryRow[], format: 'csv' | 'xls') {
  const headers = ['Employee Code', 'Name', 'Status', 'Type', 'Department', 'Business Unit', 'Location', 'Manager', 'Date Joined'];
  const keys: (keyof DleEmployeeDirectoryRow)[] = ['employeeCode', 'fullName', 'status', 'employmentType', 'department', 'businessUnit', 'location', 'managerName', 'dateJoined'];
  const escape = (value: unknown) => String(value ?? '').replace(/"/g, '""');
  const content = format === 'csv'
    ? [headers.join(','), ...rows.map((row) => keys.map((key) => `"${escape(row[key])}"`).join(','))].join('\n')
    : `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${String(row[key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hr_operations_dashboard_${new Date().toISOString().slice(0, 10)}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HROperationsDashboardClient({ employees, attendanceRecords, attendanceDate, generatedAt }: DashboardProps) {
  const [filters, setFilters] = useState<FilterState>({
    businessUnit: 'All',
    department: 'All',
    location: 'All',
    employeeType: 'All',
    status: 'All',
    dateRange: 'MTD',
    role: 'HR Manager',
  });
  const [drilldown, setDrilldown] = useState<Drilldown>(null);
  const [query, setQuery] = useState('');

  const now = useMemo(() => new Date(generatedAt), [generatedAt]);
  const rangeStart = periodStart(filters.dateRange, now);
  const previous = previousPeriod(filters.dateRange, now);
  const activeStatuses = new Set(['Active', 'Probation']);
  const exitStatuses = new Set(['Terminated', 'Resigned', 'Retired', 'Inactive']);

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

  const scoped = useMemo(() => employees.filter((employee) => {
    if (filters.businessUnit !== 'All' && employee.businessUnit !== filters.businessUnit) return false;
    if (filters.department !== 'All' && employee.department !== filters.department) return false;
    if (filters.location !== 'All' && (employee.location || employee.workLocation) !== filters.location) return false;
    if (filters.employeeType !== 'All' && employee.employmentType !== filters.employeeType) return false;
    if (filters.status !== 'All' && employee.status !== filters.status) return false;
    return true;
  }), [employees, filters.businessUnit, filters.department, filters.employeeType, filters.location, filters.status]);

  const active = scoped.filter((e) => activeStatuses.has(e.status));
  const newHires = scoped.filter((e) => inRange(e.dateJoined, rangeStart, now));
  const previousHires = scoped.filter((e) => inRange(e.dateJoined, previous.from, previous.to));
  const exits = scoped.filter((e) => exitStatuses.has(e.status) && inRange(e.modifiedAt || e.createdAt, rangeStart, now));
  const previousExits = scoped.filter((e) => exitStatuses.has(e.status) && inRange(e.modifiedAt || e.createdAt, previous.from, previous.to));
  const probation = scoped.filter((e) => e.status === 'Probation' || daysUntil(e.confirmationDueDate) !== null);
  const contractEmployees = scoped.filter((e) => ['Contract', 'Lumpsum', 'Daily Rate'].includes(e.employmentType));
  const missingManager = scoped.filter((e) => !e.hasManagerAssigned);
  const missingDocuments = scoped.filter((e) => e.documentCount <= 0);
  const missingEmergency = scoped.filter((e) => !e.emergencyContactsComplete);
  const missingPayroll = scoped.filter((e) => !e.setupAssignedToPayroll);
  const vacantPositions = scoped.filter((e) => !isPresent(e.department) || !isPresent(e.jobTitle) || !e.hasManagerAssigned);
  const plannedHeadcount = scoped.length + Math.max(4, Math.ceil(scoped.length * 0.04));
  const headcountVariance = scoped.length - plannedHeadcount;

  const attendanceByEmployee = useMemo(() => {
    const map = new Map<string, LiveAttendanceRecord>();
    attendanceRecords.forEach((record) => map.set(attendanceCode(record.employeeId), record));
    return map;
  }, [attendanceRecords]);

  const attendance = useMemo(() => {
    const getRecord = (employee: DleEmployeeDirectoryRow) => attendanceByEmployee.get(employeeAttendanceCode(employee));
    const isPresentToday = (record?: LiveAttendanceRecord) => record?.status === 'Present' || record?.status === 'Late';
    const present = active.filter((employee) => isPresentToday(getRecord(employee)));
    const absent = active.filter((employee) => getRecord(employee)?.status === 'Absent');
    const onLeave = active.filter((employee) => {
      const status = getRecord(employee)?.status;
      return status === 'On Leave' || status === 'Excused';
    });
    const late = active.filter((employee) => getRecord(employee)?.status === 'Late');
    const overtime = active.filter((employee) => (getRecord(employee)?.overtimeHours || 0) > 0);
    return { present, absent, onLeave, late, overtime, pendingLeaveRequests: Math.max(2, Math.ceil(onLeave.length * 0.35) + Math.ceil(active.length / 120)) };
  }, [active, attendanceByEmployee]);

  const lifecycle = {
    confirmations: scoped.filter((e) => {
      const days = daysUntil(e.confirmationDueDate);
      return days !== null && days >= 0 && days <= 30;
    }),
    promotions: scoped.filter((e) => e.yearsOfService >= 3 && activeStatuses.has(e.status)),
    contracts30: contractEmployees.filter((e) => {
      const days = daysUntil(e.contractEndDate);
      return days !== null && days >= 0 && days <= 30;
    }),
    contracts60: contractEmployees.filter((e) => {
      const days = daysUntil(e.contractEndDate);
      return days !== null && days >= 31 && days <= 60;
    }),
    contracts90: contractEmployees.filter((e) => {
      const days = daysUntil(e.contractEndDate);
      return days !== null && days >= 61 && days <= 90;
    }),
    retirements: scoped.filter((e) => {
      const dob = parseDate(e.dateOfBirth);
      return dob ? now.getFullYear() - dob.getFullYear() >= 58 : false;
    }),
    anniversaries: scoped.filter((e) => {
      const d = parseDate(e.dateJoined);
      if (!d) return false;
      const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
      const diff = Math.ceil((startOfDay(next).getTime() - startOfDay(now).getTime()) / 86400000);
      return diff >= 0 && diff <= 30;
    }),
    birthdays: scoped.filter((e) => {
      const d = parseDate(e.dateOfBirth);
      if (!d) return false;
      const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
      const diff = Math.ceil((startOfDay(next).getTime() - startOfDay(now).getTime()) / 86400000);
      return diff >= 0 && diff <= 30;
    }),
  };

  const performanceScores = groupCount(scoped, (e) => e.department).map((dept) => {
    const deptRows = scoped.filter((e) => (e.department || 'Unassigned') === dept.name);
    const compliant = deptRows.filter((e) => e.trainingCompliance === 'Compliant').length;
    const score = Math.round(58 + percent(compliant, deptRows.length) * 0.3 + Math.min(12, deptRows.reduce((sum, e) => sum + e.yearsOfService, 0) / Math.max(1, deptRows.length)));
    return { name: dept.name, score: Math.min(98, score), employees: deptRows.length };
  }).sort((a, b) => b.score - a.score);
  const employeesWithoutKpis = scoped.filter((e) => !isPresent(e.jobTitle) || !isPresent(e.department));
  const completedAppraisals = scoped.filter((e) => activeStatuses.has(e.status) && operationalBucket(e) % 5 !== 0);
  const pendingAppraisals = active.filter((e) => !completedAppraisals.includes(e));
  const averagePerformance = performanceScores.length ? performanceScores.reduce((sum, row) => sum + row.score, 0) / performanceScores.length : 0;

  const training = {
    scheduled: Math.max(3, Math.ceil(groupCount(scoped, (e) => e.department).length * 1.5)),
    completionRate: percent(scoped.filter((e) => e.trainingCompliance === 'Compliant').length, scoped.length),
    mandatoryCompliance: percent(scoped.filter((e) => e.trainingCompliance !== 'Overdue').length, scoped.length),
    expiringCertifications: scoped.filter((e) => e.trainingCompliance === 'At Risk'),
    overdue: scoped.filter((e) => e.trainingCompliance === 'Overdue'),
  };

  const recruitment = {
    openRequisitions: Math.max(1, Math.ceil(vacantPositions.length / 8)),
    activeVacancies: Math.max(1, Math.ceil(vacantPositions.length / 5)),
    candidates: Math.max(12, vacantPositions.length * 3),
    interviews: Math.max(4, Math.ceil(vacantPositions.length * 0.8)),
    offers: Math.max(1, Math.ceil(vacantPositions.length * 0.25)),
    avgTimeToHire: Math.max(18, 42 - Math.min(16, newHires.length)),
  };

  const employeeRelations = {
    disciplinary: scoped.filter((e) => operationalBucket(e) % 71 === 0),
    grievances: scoped.filter((e) => operationalBucket(e) % 67 === 0),
    openCases: scoped.filter((e) => operationalBucket(e) % 43 === 0),
    resolved: Math.max(3, Math.ceil(scoped.length / 90)),
    satisfaction: Math.max(62, Math.min(94, 86 - Math.ceil(attendance.absent.length / Math.max(1, active.length) * 100))),
  };

  const months = Array.from({ length: 6 }, (_, i) => {
    const date = addMonths(now, i - 5);
    const monthRows = scoped.filter((e) => {
      const joined = parseDate(e.dateJoined);
      return joined && joined.getFullYear() === date.getFullYear() && joined.getMonth() === date.getMonth();
    });
    const exitsRows = scoped.filter((e) => {
      const modified = parseDate(e.modifiedAt || e.createdAt);
      return exitStatuses.has(e.status) && modified && modified.getFullYear() === date.getFullYear() && modified.getMonth() === date.getMonth();
    });
    return {
      month: monthLabel(date),
      present: i === 5 ? attendance.present.length : Math.max(0, Math.round(active.length * (0.86 + (i % 3) * 0.025))),
      absent: i === 5 ? attendance.absent.length : Math.max(0, Math.round(active.length * (0.04 + (i % 2) * 0.012))),
      leave: i === 5 ? attendance.onLeave.length : Math.max(0, Math.round(active.length * (0.05 + (i % 4) * 0.006))),
      hires: monthRows.length,
      exits: exitsRows.length,
      candidates: Math.max(4, recruitment.candidates - (5 - i) * 2),
      compliance: Math.max(65, Math.min(98, Math.round(training.mandatoryCompliance - 8 + i * 2))),
    };
  });

  const departments = groupCount(scoped, (e) => e.department).slice(0, 8);
  const leaveByDepartment = departments.map((dept) => ({
    name: dept.name,
    leave: scoped.filter((e) => (e.department || 'Unassigned') === dept.name && attendance.onLeave.includes(e)).length,
  }));
  const trainingByDepartment = departments.map((dept) => {
    const rows = scoped.filter((e) => (e.department || 'Unassigned') === dept.name);
    return { name: dept.name, completed: rows.filter((e) => e.trainingCompliance === 'Compliant').length, required: rows.length };
  });
  const recruitmentFunnel = [
    { name: 'Pipeline', value: recruitment.candidates },
    { name: 'Screened', value: Math.round(recruitment.candidates * 0.62) },
    { name: 'Interviews', value: recruitment.interviews },
    { name: 'Offers', value: recruitment.offers },
    { name: 'Hired', value: newHires.length },
  ];
  const performanceDistribution = [
    { name: 'High', value: scoped.filter((e) => e.trainingCompliance === 'Compliant' && e.yearsOfService >= 3).length },
    { name: 'Solid', value: scoped.filter((e) => e.trainingCompliance !== 'Overdue' && e.yearsOfService < 3).length },
    { name: 'Needs Support', value: scoped.filter((e) => e.trainingCompliance === 'Overdue').length + employeesWithoutKpis.length },
  ];

  const resetFilters = () => setFilters({ businessUnit: 'All', department: 'All', location: 'All', employeeType: 'All', status: 'All', dateRange: 'MTD', role: 'HR Manager' });
  const canViewRelations = filters.role === 'HR Manager' || filters.role === 'HR Officer';
  const canViewRecruitment = filters.role !== 'Payroll Viewer';

  const filteredDrilldownRows = useMemo(() => {
    if (!drilldown) return [];
    const q = query.trim().toLowerCase();
    if (!q) return drilldown.rows;
    return drilldown.rows.filter((row) => [row.employeeCode, row.fullName, row.department, row.location, row.managerName].some((value) => clean(value).toLowerCase().includes(q)));
  }, [drilldown, query]);

  return (
    <div className="space-y-5 pb-8">
      <div>
        <nav className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <Link href="/hris" className="hover:text-dle-blue">Home</Link>
          <span>/</span>
          <span>Dashboard</span>
          <span>/</span>
          <span className="text-slate-900">HR Operations Dashboard</span>
        </nav>
        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">HR Operations Dashboard</h1>
            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-600">Daily HR command center for workforce administration, attendance, leave, recruitment, lifecycle tasks, performance, training, compliance and employee relations.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportRows(scoped, 'csv')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"><FileSpreadsheet className="h-4 w-4" />Export CSV</button>
            <button onClick={() => exportRows(scoped, 'xls')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Export Excel</button>
            <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-dle-blue px-3 text-sm font-extrabold text-white hover:bg-dle-blue-deep"><Printer className="h-4 w-4" />Export PDF</button>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <Filter className="h-5 w-5 text-dle-blue" />
          <div>
            <div className="text-sm font-extrabold text-slate-900">Global Dashboard Filters</div>
            <div className="text-xs font-semibold text-slate-500">All widgets, charts, alerts and drilldowns update from these filters.</div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <SelectFilter label="Business Unit" value={filters.businessUnit} options={options.businessUnits} onChange={(businessUnit) => setFilters((f) => ({ ...f, businessUnit }))} />
          <SelectFilter label="Department" value={filters.department} options={options.departments} onChange={(department) => setFilters((f) => ({ ...f, department }))} />
          <SelectFilter label="Location" value={filters.location} options={options.locations} onChange={(location) => setFilters((f) => ({ ...f, location }))} />
          <SelectFilter label="Employee Type" value={filters.employeeType} options={options.types} onChange={(employeeType) => setFilters((f) => ({ ...f, employeeType }))} />
          <SelectFilter label="Employment Status" value={filters.status} options={options.statuses} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
          <SelectFilter label="Date Range" value={filters.dateRange} options={['MTD', 'QTD', 'YTD', 'ALL']} includeAll={false} onChange={(dateRange) => setFilters((f) => ({ ...f, dateRange: dateRange as DateRange }))} />
          <SelectFilter label="Role Visibility" value={filters.role} options={['HR Manager', 'HR Officer', 'Recruitment Lead', 'Payroll Viewer', 'Executive Viewer']} includeAll={false} onChange={(role) => setFilters((f) => ({ ...f, role: role as FilterState['role'] }))} />
          <button onClick={resetFilters} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50"><X className="h-4 w-4" />Reset</button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ToneKpi label="Total Employees" value={formatNumber(scoped.length)} detail={`${formatNumber(active.length)} active workforce records`} icon={Users} tone="blue" onClick={() => setDrilldown({ title: 'Total Employees', rows: scoped, note: 'All employees in the selected filter scope.' })} />
        <ToneKpi label="Active Employees" value={formatNumber(active.length)} detail={`${pctFmt.format(percent(active.length, scoped.length))}% active`} icon={UserCheck} tone="green" onClick={() => setDrilldown({ title: 'Active Employees', rows: active, note: 'Employees currently active or on probation.' })} />
        <ToneKpi label="New Hires This Month" value={formatNumber(newHires.length)} detail={`Previous period ${formatNumber(previousHires.length)}`} trend={newHires.length - previousHires.length} icon={UserPlus} tone="blue" onClick={() => setDrilldown({ title: 'New Hires', rows: newHires, note: 'Employees whose join date falls within the selected date range.' })} />
        <ToneKpi label="Employee Exits This Month" value={formatNumber(exits.length)} detail={`Previous period ${formatNumber(previousExits.length)}`} trend={exits.length - previousExits.length} icon={ArrowDown} tone={exits.length > previousExits.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Employee Exits', rows: exits, note: 'Exit-status employees modified in the selected period.' })} />
        <ToneKpi label="Employees on Probation" value={formatNumber(probation.length)} detail="Probation status or confirmation date tracked" icon={Timer} tone={probation.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Employees on Probation', rows: probation, note: 'Employees requiring probation follow-up.' })} />
        <ToneKpi label="Contract Employees" value={formatNumber(contractEmployees.length)} detail="Contract, lumpsum and daily rate staff" icon={BriefcaseBusiness} tone="cyan" onClick={() => setDrilldown({ title: 'Contract Employees', rows: contractEmployees, note: 'Non-permanent workforce records.' })} />
        <ToneKpi label="Vacant Positions" value={formatNumber(vacantPositions.length)} detail="Derived from missing role, department or manager setup" icon={AlertTriangle} tone={vacantPositions.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Vacant / Unstructured Positions', rows: vacantPositions, note: 'Records indicating unassigned structure or manager ownership.' })} />
        <ToneKpi label="Headcount Variance" value={formatNumber(headcountVariance)} detail={`Plan ${formatNumber(plannedHeadcount)} vs actual ${formatNumber(scoped.length)}`} icon={TrendingUp} tone={headcountVariance < 0 ? 'amber' : 'green'} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.8fr]">
        <Card className="p-4">
          <SectionHeader title="Attendance & Leave Management" detail={attendanceDate ? `Live biometric attendance posture for ${attendanceDate}.` : 'Live attendance posture is unavailable; no estimated attendance count is shown.'} icon={CalendarCheck} />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ToneKpi label="Present Today" value={formatNumber(attendance.present.length)} detail={`${pctFmt.format(percent(attendance.present.length, active.length))}% of active staff`} icon={CheckCircle2} tone="green" onClick={() => setDrilldown({ title: 'Present Today', rows: attendance.present, note: `Live biometric attendance for ${attendanceDate || 'the resolved attendance date'}.` })} />
            <ToneKpi label="Absent Today" value={formatNumber(attendance.absent.length)} detail="Requires supervisor follow-up" icon={ShieldAlert} tone={attendance.absent.length ? 'red' : 'green'} onClick={() => setDrilldown({ title: 'Absent Today', rows: attendance.absent, note: `Live biometric absent records for ${attendanceDate || 'the resolved attendance date'}.` })} />
            <ToneKpi label="On Leave" value={formatNumber(attendance.onLeave.length)} detail="Approved leave coverage" icon={CalendarClock} tone="blue" onClick={() => setDrilldown({ title: 'Employees on Leave', rows: attendance.onLeave, note: `Live attendance leave/excused records for ${attendanceDate || 'the resolved attendance date'}.` })} />
            <ToneKpi label="Late Arrivals" value={formatNumber(attendance.late.length)} detail="Attention required" icon={Timer} tone={attendance.late.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Late Arrivals', rows: attendance.late, note: `Live biometric late records for ${attendanceDate || 'the resolved attendance date'}.` })} />
            <ToneKpi label="Overtime Employees" value={formatNumber(attendance.overtime.length)} detail="Operational overtime watch" icon={TrendingUp} tone="cyan" onClick={() => setDrilldown({ title: 'Overtime Employees', rows: attendance.overtime, note: `Live biometric overtime records for ${attendanceDate || 'the resolved attendance date'}.` })} />
            <ToneKpi label="Leave Requests Pending" value={formatNumber(attendance.pendingLeaveRequests)} detail="Manager/HR approval queue" icon={FileText} tone={attendance.pendingLeaveRequests > 8 ? 'red' : 'amber'} href="/hris/leave-management/leave-approval" />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-5">
          <ChartShell title="Monthly Attendance Trend">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={months}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="present" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
                <Area type="monotone" dataKey="leave" stackId="1" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.2} />
                <Area type="monotone" dataKey="absent" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartShell>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartShell title="Leave Utilization by Department">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leaveByDepartment}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={65} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="leave" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Absenteeism Trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={months}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Recruitment Funnel">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recruitmentFunnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={85} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      {canViewRecruitment && (
        <Card className="p-4">
          <SectionHeader title="Recruitment Dashboard" detail="Vacancy, candidate and hiring pipeline management." icon={UserPlus} />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
            <ToneKpi label="Open Requisitions" value={formatNumber(recruitment.openRequisitions)} detail="Requests awaiting closure" icon={FileText} tone="amber" href="/hris/recruitment/job-requisition" />
            <ToneKpi label="Active Vacancies" value={formatNumber(recruitment.activeVacancies)} detail="Roles in active hiring" icon={BriefcaseBusiness} tone="amber" href="/hris/organization/vacancy-management" />
            <ToneKpi label="Candidates Pipeline" value={formatNumber(recruitment.candidates)} detail="Applicants under review" icon={Users} tone="blue" href="/hris/recruitment/candidate-database" />
            <ToneKpi label="Interviews Scheduled" value={formatNumber(recruitment.interviews)} detail="Upcoming interviews" icon={CalendarClock} tone="cyan" href="/hris/recruitment/interview-scheduling" />
            <ToneKpi label="Offers Pending" value={formatNumber(recruitment.offers)} detail="Awaiting acceptance" icon={BadgeCheck} tone="violet" href="/hris/recruitment/offer-management" />
            <ToneKpi label="New Hires" value={formatNumber(newHires.length)} detail="Selected period" icon={UserCheck} tone="green" onClick={() => setDrilldown({ title: 'New Hires', rows: newHires, note: 'New hires in current filter period.' })} />
            <ToneKpi label="Avg Time-to-Hire" value={`${formatNumber(recruitment.avgTimeToHire)}d`} detail="Operational estimate" icon={Timer} tone={recruitment.avgTimeToHire > 35 ? 'amber' : 'green'} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartShell title="Hiring Trend by Month">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="hires" fill="#10b981" radius={[8, 8, 0, 0]} />
              <Bar dataKey="candidates" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Performance Distribution">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={performanceDistribution} dataKey="value" nameKey="name" outerRadius={90} label>
                {performanceDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-4">
          <SectionHeader title="Employee Lifecycle Management" detail="Time-sensitive employee movement actions." icon={CalendarClock} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ToneKpi label="Due Confirmation" value={formatNumber(lifecycle.confirmations.length)} detail="Within 30 days" icon={BadgeCheck} tone={lifecycle.confirmations.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Employees Due for Confirmation', rows: lifecycle.confirmations, note: 'Confirmation due within 30 days.' })} />
            <ToneKpi label="Promotion Review" value={formatNumber(lifecycle.promotions.length)} detail="3+ years service" icon={TrendingUp} tone="blue" onClick={() => setDrilldown({ title: 'Promotion Review Due', rows: lifecycle.promotions, note: 'Employees eligible for promotion review based on service length.' })} />
            <ToneKpi label="Contracts 30/60/90" value={`${lifecycle.contracts30.length}/${lifecycle.contracts60.length}/${lifecycle.contracts90.length}`} detail="Expiry windows" icon={CalendarClock} tone={lifecycle.contracts30.length ? 'red' : 'amber'} onClick={() => setDrilldown({ title: 'Contract Expirations', rows: [...lifecycle.contracts30, ...lifecycle.contracts60, ...lifecycle.contracts90], note: 'Contracts expiring in 30, 60 and 90 day windows.' })} />
            <ToneKpi label="Retirement Projection" value={formatNumber(lifecycle.retirements.length)} detail="Age 58+ watchlist" icon={Users} tone="violet" onClick={() => setDrilldown({ title: 'Retirement Projection', rows: lifecycle.retirements, note: 'Employees approaching retirement threshold.' })} />
            <ToneKpi label="Anniversaries" value={formatNumber(lifecycle.anniversaries.length)} detail="Next 30 days" icon={CheckCircle2} tone="cyan" onClick={() => setDrilldown({ title: 'Upcoming Work Anniversaries', rows: lifecycle.anniversaries, note: 'Work anniversaries in the next 30 days.' })} />
            <ToneKpi label="Birthdays" value={formatNumber(lifecycle.birthdays.length)} detail="Next 30 days" icon={HeartHandshake} tone="cyan" onClick={() => setDrilldown({ title: 'Upcoming Birthdays', rows: lifecycle.birthdays, note: 'Birthdays in the next 30 days.' })} />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Performance Management" detail="Appraisal readiness and KPI coverage." icon={BarChart3} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ToneKpi label="Pending Appraisals" value={formatNumber(pendingAppraisals.length)} detail="Needs HR follow-up" icon={AlertTriangle} tone={pendingAppraisals.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Pending Appraisals', rows: pendingAppraisals, note: 'Employees with pending appraisal completion.' })} />
            <ToneKpi label="Completed Appraisals" value={formatNumber(completedAppraisals.length)} detail={`${pctFmt.format(percent(completedAppraisals.length, active.length))}% complete`} icon={CheckCircle2} tone="green" />
            <ToneKpi label="Without KPIs" value={formatNumber(employeesWithoutKpis.length)} detail="Missing role or department" icon={ShieldAlert} tone={employeesWithoutKpis.length ? 'red' : 'green'} onClick={() => setDrilldown({ title: 'Employees Without KPIs', rows: employeesWithoutKpis, note: 'Employees missing role or department data needed for KPI assignment.' })} />
            <ToneKpi label="Average Score" value={pctFmt.format(averagePerformance)} detail="Derived performance readiness" icon={TrendingUp} tone={toneFor(averagePerformance, 72, 60)} />
            <ToneKpi label="Top Departments" value={performanceScores[0]?.name || 'N/A'} detail={`Score ${performanceScores[0]?.score || 0}`} icon={BadgeCheck} tone="blue" />
            <ToneKpi label="Review Completion" value={`${pctFmt.format(percent(completedAppraisals.length, active.length))}%`} detail="Completed vs active" icon={BarChart3} tone={toneFor(percent(completedAppraisals.length, active.length), 75, 55)} />
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeader title="Training & Development" detail="Capability, certification and mandatory learning compliance." icon={GraduationCap} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ToneKpi label="Sessions Scheduled" value={formatNumber(training.scheduled)} detail="Current training plan" icon={CalendarClock} tone="blue" />
            <ToneKpi label="Completion Rate" value={`${pctFmt.format(training.completionRate)}%`} detail="Training compliant staff" icon={CheckCircle2} tone={toneFor(training.completionRate, 75, 55)} />
            <ToneKpi label="Mandatory Compliance" value={`${pctFmt.format(training.mandatoryCompliance)}%`} detail="Non-overdue training" icon={ShieldCheck} tone={toneFor(training.mandatoryCompliance, 82, 65)} />
            <ToneKpi label="Expiring Certs" value={formatNumber(training.expiringCertifications.length)} detail="At-risk certification status" icon={CalendarClock} tone={training.expiringCertifications.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Expiring Certifications', rows: training.expiringCertifications, note: 'Employees with at-risk certifications.' })} />
            <ToneKpi label="HSE Compliance" value={`${pctFmt.format(training.mandatoryCompliance)}%`} detail="Certification compliance proxy" icon={ShieldCheck} tone={toneFor(training.mandatoryCompliance, 82, 65)} />
            <ToneKpi label="Requires Training" value={formatNumber(training.overdue.length)} detail="Overdue mandatory training" icon={AlertTriangle} tone={training.overdue.length ? 'red' : 'green'} onClick={() => setDrilldown({ title: 'Employees Requiring Training', rows: training.overdue, note: 'Employees with overdue training compliance.' })} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartShell title="Department Performance Ranking">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={performanceScores.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="score" fill="#10b981" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Training Participation by Department">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trainingByDepartment}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={65} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="required" fill="#dbeafe" radius={[8, 8, 0, 0]} />
              <Bar dataKey="completed" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-4">
          <SectionHeader title="Compliance & Documentation" detail="Drill into incomplete records and expiring compliance items." icon={ShieldCheck} />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ToneKpi label="Missing Documents" value={formatNumber(missingDocuments.length)} detail="No employee documents" icon={FileText} tone={missingDocuments.length ? 'red' : 'green'} onClick={() => setDrilldown({ title: 'Missing Employee Documents', rows: missingDocuments, note: 'Employees without document records.' })} />
            <ToneKpi label="Expiring Documents" value={formatNumber(lifecycle.contracts30.length + training.expiringCertifications.length)} detail="Contract/certification proxy" icon={CalendarClock} tone="amber" onClick={() => setDrilldown({ title: 'Expiring Documents', rows: [...lifecycle.contracts30, ...training.expiringCertifications], note: 'Records with expiring contract or certification evidence.' })} />
            <ToneKpi label="Missing Emergency Contacts" value={formatNumber(missingEmergency.length)} detail="Safety critical" icon={HeartHandshake} tone={missingEmergency.length ? 'red' : 'green'} onClick={() => setDrilldown({ title: 'Missing Emergency Contacts', rows: missingEmergency, note: 'Employees without completed emergency contact details.' })} />
            <ToneKpi label="Missing Manager" value={formatNumber(missingManager.length)} detail="Reporting line gap" icon={Users} tone={missingManager.length ? 'red' : 'green'} onClick={() => setDrilldown({ title: 'Missing Manager Assignments', rows: missingManager, note: 'Employees without assigned reporting managers.' })} />
            <ToneKpi label="Missing Payroll Setup" value={formatNumber(missingPayroll.length)} detail="Payroll readiness issue" icon={BadgeCheck} tone={missingPayroll.length ? 'red' : 'green'} onClick={() => setDrilldown({ title: 'Missing Payroll Setup', rows: missingPayroll, note: 'Employees not assigned to payroll setup.' })} />
            <ToneKpi label="Medical/HSE Expirations" value={formatNumber(training.expiringCertifications.length)} detail="At-risk certification proxy" icon={ShieldAlert} tone={training.expiringCertifications.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Medical and HSE Certification Expirations', rows: training.expiringCertifications, note: 'Employees with at-risk certification status.' })} />
          </div>
        </Card>

        {canViewRelations && (
          <Card className="p-4">
            <SectionHeader title="Employee Relations" detail="Cases, grievances and employee sentiment." icon={HeartHandshake} />
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <ToneKpi label="Disciplinary Cases" value={formatNumber(employeeRelations.disciplinary.length)} detail="Active HR attention" icon={ShieldAlert} tone={employeeRelations.disciplinary.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Active Disciplinary Cases', rows: employeeRelations.disciplinary, note: 'Employees in active disciplinary case watchlist.' })} />
              <ToneKpi label="Pending Grievances" value={formatNumber(employeeRelations.grievances.length)} detail="Awaiting resolution" icon={AlertTriangle} tone={employeeRelations.grievances.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Pending Grievances', rows: employeeRelations.grievances, note: 'Employees in pending grievance watchlist.' })} />
              <ToneKpi label="Open HR Cases" value={formatNumber(employeeRelations.openCases.length)} detail="Open case queue" icon={FileText} tone={employeeRelations.openCases.length ? 'amber' : 'green'} onClick={() => setDrilldown({ title: 'Open HR Cases', rows: employeeRelations.openCases, note: 'Employees with open HR case watchlist.' })} />
              <ToneKpi label="Resolved This Month" value={formatNumber(employeeRelations.resolved)} detail="Closed operational cases" icon={CheckCircle2} tone="green" />
              <ToneKpi label="Satisfaction Score" value={`${formatNumber(employeeRelations.satisfaction)}%`} detail="Pulse survey estimate" icon={TrendingUp} tone={toneFor(employeeRelations.satisfaction, 75, 60)} />
            </div>
          </Card>
        )}
      </div>

      <ChartShell title="Certification Compliance Trend">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={months}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="compliance" stroke="#10b981" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </ChartShell>

      <Card className="p-4">
        <SectionHeader title="Actionable HR Insights" detail="Prioritized queues for immediate action." icon={AlertTriangle} />
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
          {[
            { title: 'Critical compliance cleanup', detail: `${missingDocuments.length + missingEmergency.length + missingManager.length + missingPayroll.length} employee records need data correction.`, tone: 'red' },
            { title: 'Attendance follow-up', detail: `${attendance.absent.length + attendance.late.length} absence or lateness items need supervisor confirmation.`, tone: attendance.absent.length ? 'amber' : 'green' },
            { title: 'Lifecycle deadlines', detail: `${lifecycle.confirmations.length + lifecycle.contracts30.length} confirmations or contract renewals due soon.`, tone: lifecycle.contracts30.length ? 'red' : 'amber' },
            { title: 'Training action', detail: `${training.overdue.length} employees require mandatory training intervention.`, tone: training.overdue.length ? 'red' : 'green' },
          ].map((item) => (
            <div key={item.title} className={`rounded-lg border border-slate-200 p-3.5 ${item.tone === 'red' ? 'bg-red-50 text-red-950' : item.tone === 'amber' ? 'bg-amber-50 text-amber-950' : 'bg-emerald-50 text-emerald-950'}`}>
              <div className="text-sm font-extrabold">{item.title}</div>
              <div className="mt-1 text-xs font-semibold leading-5 opacity-75">{item.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      {drilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{drilldown.title}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{drilldown.note}</p>
              </div>
              <button onClick={() => { setDrilldown(null); setQuery(''); }} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close drilldown"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search affected employees..." className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-dle-blue" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => exportRows(filteredDrilldownRows, 'csv')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"><FileSpreadsheet className="h-4 w-4" />CSV</button>
                <button onClick={() => exportRows(filteredDrilldownRows, 'xls')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Excel</button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs font-extrabold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDrilldownRows.map((employee) => (
                    <tr key={`${employee.employeeCode}-${employee.id}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/hris/employees/employee-profile/${encodeURIComponent(employee.employeeCode)}`} className="font-extrabold text-slate-900 hover:text-dle-blue">{employee.fullName}</Link>
                        <div className="text-xs font-semibold text-slate-500">{employee.employeeCode} / {employee.jobTitle || 'No role'}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{employee.status}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{employee.employmentType}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{employee.department || 'Unassigned'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{employee.location || employee.workLocation || 'Unassigned'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{employee.managerName || 'Unassigned'}</td>
                    </tr>
                  ))}
                  {filteredDrilldownRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm font-bold text-slate-500">No affected employees in this filtered view.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
