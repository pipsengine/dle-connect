'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import {
  buildSalarySetupExportReport,
  salarySetupCsvFromRecords,
  type SalarySetupExportRecord,
} from '@/lib/payroll-salary-setup-export';
import { downloadExcelFile } from '@/lib/excel-export';
import {
  AccordionSection,
  DonutChart,
  FilterSelect,
  HorizontalBarChart,
  InsightCard,
  MetadataPill,
  PanelShell,
  PremiumKpiCard,
  SetupTone,
  StatusPill,
  WorkflowTimeline,
  WorkspaceTabs,
  setupToneStyles,
} from './salary-setup-ui';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Lock,
  MoreHorizontal,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';

type Role = 'Payroll Officer' | 'Finance Controller' | 'HR Director' | 'HR Manager' | 'Executive Management' | 'Auditor' | 'Employee';
type WorkspaceTab = 'salaries' | 'validation' | 'workflow' | 'analytics' | 'audit';

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
  salaryStructure?: string;
  payCurrency: string;
  paymentRun: string;
  paymentType: string;
  nhfApplicable: boolean;
  setupAssignedToPayroll: boolean;
  payrollStatus: 'Ready' | 'Review' | 'Blocked';
  riskSeverity: 'Low' | 'Medium' | 'High';
  exceptionCount: number;
  exceptions: string[];
  deferredWarnings?: string[];
  isDailyRate: boolean;
  ratePerDay: number | null;
  ratePerHour: number | null;
  hoursPerDay: number;
  earningProfile: string;
  earningProfileId: string;
  basePay: number | null;
  allowances: number | null;
  taxablePay: number | null;
  nonTaxablePay: number | null;
  earningLines: Array<{ code: string; name: string; taxable: boolean; percentOfGross: number; calculation?: string; runFrequency?: string; includeInMonthlyPayroll?: boolean; amount: number | null }>;
  annualBenefitLines: Array<{ code: string; name: string; taxable: boolean; percentOfGross: number; calculation?: string; runFrequency?: string; includeInMonthlyPayroll?: boolean; amount: number | null }>;
  pension: number | null;
  paye: number | null;
  otherDeductions: number | null;
  deductionLines?: Array<{ code: string; label: string; amount: number | null }>;
  grossPay: number | null;
  deductions: number | null;
  netPay: number | null;
  timesheetDaysWorked?: number | null;
  timesheetBookedHours?: number | null;
};

type SalaryTableColumn = {
  id: string;
  label: string;
  group: 'employee' | 'contract' | 'earnings' | 'deductions' | 'totals' | 'meta';
  kind: 'checkbox' | 'employee' | 'text' | 'money' | 'days' | 'rate' | 'status' | 'actions';
  sticky?: 'left-check' | 'left-employee';
  getMoney?: (record: PayrollRecord) => number | null;
  getText?: (record: PayrollRecord) => string;
};

const earningLineAmount = (record: PayrollRecord, pattern: RegExp) => {
  const line = (record.earningLines || []).find((item) => pattern.test(String(item.code || '')) || pattern.test(String(item.name || '')));
  return line?.amount ?? null;
};

const deductionLineAmount = (record: PayrollRecord, pattern: RegExp) => {
  const line = (record.deductionLines || []).find((item) => pattern.test(String(item.code || '')) || pattern.test(String(item.label || '')));
  if (line?.amount != null) return line.amount;
  if (/PAYE/i.test(pattern.source)) return record.paye;
  if (/PENSION/i.test(pattern.source)) return record.pension;
  if (/OTHER/i.test(pattern.source)) return record.otherDeductions;
  return null;
};

const STANDARD_EARNING_COLUMNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'earning-basic', label: 'Basic Salary', pattern: /(_BASIC|^BASIC$)|BASIC SALARY/i },
  { id: 'earning-housing', label: 'Housing', pattern: /HOUSIN|HOUSING/i },
  { id: 'earning-other', label: 'Other Allowance', pattern: /OTHALL|OTHER ALLOW/i },
  { id: 'earning-transport', label: 'Transport Allowance', pattern: /TRANSP|TRANSPORT/i },
  { id: 'earning-furniture', label: 'Furniture Allowance', pattern: /FURN|FURNITURE/i },
  { id: 'earning-utilities', label: 'Utilities', pattern: /UTILIT|UTILIT/i },
];

const CONTRACT_EARNING_COLUMNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'earning-weekday', label: 'Weekday Earning', pattern: /^JCWEEKDAY$/i },
  { id: 'earning-weekday-nt', label: 'Weekday Allowance (NT)', pattern: /JCWEEKDAY_NT|WEEKDAY ALLOWANCE NON TAX/i },
  { id: 'earning-weekday-ovt', label: 'Weekday Overtime', pattern: /WEEKDAYOVT|WEEKDAY OVT/i },
  { id: 'earning-pubhol', label: 'Public Holiday', pattern: /PUBHOL|PUBLIC HOLIDAY/i },
  { id: 'earning-saturday', label: 'Saturday Earning', pattern: /SATEARN|SATURDAY EARNING/i },
  { id: 'earning-sunday', label: 'Sunday Earning', pattern: /SUNDAYEARN|SUNDAY EARNING/i },
  { id: 'earning-meal', label: 'Meal Allowance', pattern: /^MEAL$/i },
];

const DEDUCTION_COLUMNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'deduction-paye', label: 'PAYE', pattern: /PAYE/i },
  { id: 'deduction-pension', label: 'Pension', pattern: /PENSION/i },
  { id: 'deduction-nhf', label: 'NHF', pattern: /NHF/i },
  { id: 'deduction-loan', label: 'Loan Recovery', pattern: /LOAN/i },
  { id: 'deduction-other', label: 'Other Deductions', pattern: /OTHER/i },
];

const SALARY_TABLE_GROUPS: Array<{ id: SalaryTableColumn['group']; label: string }> = [
  { id: 'employee', label: 'Employee' },
  { id: 'contract', label: 'Contract / Timesheet' },
  { id: 'earnings', label: 'Earnings Breakdown' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'totals', label: 'Totals' },
  { id: 'meta', label: 'Status' },
];

const buildSalaryTableColumns = (records: PayrollRecord[]): SalaryTableColumn[] => {
  const matchedCodes = new Set<string>();
  [...STANDARD_EARNING_COLUMNS, ...CONTRACT_EARNING_COLUMNS].forEach((column) => {
    records.forEach((record) => {
      const line = (record.earningLines || []).find((item) => column.pattern.test(String(item.code || '')) || column.pattern.test(String(item.name || '')));
      if (line?.code) matchedCodes.add(String(line.code).toUpperCase());
    });
  });

  const extraEarningColumns = Array.from(
    records.reduce((map, record) => {
      (record.earningLines || []).forEach((line) => {
        const code = String(line.code || '').trim();
        if (!code || matchedCodes.has(code.toUpperCase())) return;
        if (!map.has(code)) map.set(code, String(line.name || code));
      });
      return map;
    }, new Map<string, string>()).entries(),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, label]) => ({
      id: `earning-${code.toLowerCase()}`,
      label,
      pattern: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }));

  const columns: SalaryTableColumn[] = [
    { id: 'select', label: '', group: 'employee', kind: 'checkbox', sticky: 'left-check' },
    { id: 'employee', label: 'Employee', group: 'employee', kind: 'employee', sticky: 'left-employee' },
    { id: 'department', label: 'Department', group: 'employee', kind: 'text', getText: (record) => record.department || '—' },
    { id: 'grade', label: 'Grade', group: 'employee', kind: 'text', getText: (record) => record.salaryGrade || '—' },
    { id: 'payroll-group', label: 'Payroll Group', group: 'employee', kind: 'text', getText: (record) => record.payrollGroup || '—' },
    { id: 'days-worked', label: 'Days Worked', group: 'contract', kind: 'days', getText: (record) => (record.isDailyRate ? String(record.timesheetDaysWorked ?? '—') : '—') },
    { id: 'daily-rate', label: 'Daily Rate', group: 'contract', kind: 'rate', getMoney: (record) => (record.isDailyRate ? record.ratePerDay : null) },
    { id: 'hours-worked', label: 'Hours Worked', group: 'contract', kind: 'text', getText: (record) => (record.isDailyRate && record.timesheetBookedHours != null ? String(record.timesheetBookedHours) : '—') },
  ];

  [...STANDARD_EARNING_COLUMNS, ...CONTRACT_EARNING_COLUMNS, ...extraEarningColumns].forEach((column) => {
    columns.push({
      id: column.id,
      label: column.label,
      group: 'earnings',
      kind: 'money',
      getMoney: (record) => earningLineAmount(record, column.pattern),
    });
  });

  DEDUCTION_COLUMNS.forEach((column) => {
    columns.push({
      id: column.id,
      label: column.label,
      group: 'deductions',
      kind: 'money',
      getMoney: (record) => deductionLineAmount(record, column.pattern),
    });
  });

  columns.push(
    { id: 'gross-pay', label: 'Gross Salary', group: 'totals', kind: 'money', getMoney: (record) => record.grossPay },
    { id: 'net-pay', label: 'Net Salary', group: 'totals', kind: 'money', getMoney: (record) => record.netPay },
    { id: 'status', label: 'Status', group: 'meta', kind: 'status' },
    { id: 'actions', label: 'Actions', group: 'meta', kind: 'actions' },
  );

  return columns;
};

type PayrollPayload = {
  generatedAt: string;
  source: string;
  period?: string;
  periodLabel: string;
  toleranceMode?: boolean;
  enterpriseSourceActive?: boolean;
  dataMode?: string;
  permissions: { canViewMoney: boolean; canExport: boolean };
  summary: {
    totalEmployees: number;
    payrollEligible: number;
    readyEmployees: number;
    reviewEmployees: number;
    blockedEmployees: number;
    payrollCoveragePct: number;
    grossPay: number;
    netPay: number;
    exceptionCount: number;
    deferredExceptionCount?: number;
  };
  records: PayrollRecord[];
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-GB');
const pctFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

const money = (value: number | null | undefined, canView = true) => (!canView || value === null || value === undefined ? 'Restricted' : moneyFmt.format(value));
const number = (value: number) => numberFmt.format(value);

const statusTone = (status: string): SetupTone => (status === 'Ready' ? 'green' : status === 'Blocked' ? 'red' : status === 'Review' ? 'amber' : 'blue');
const setupStatusLabel = (record: PayrollRecord) => {
  if (!record.setupAssignedToPayroll) return 'Missing Pay';
  if (record.payrollStatus === 'Ready') return 'Assigned';
  if (record.payrollStatus === 'Blocked') return 'Blocked';
  return 'Review';
};
const setupStatusTone = (record: PayrollRecord): SetupTone => {
  if (!record.setupAssignedToPayroll) return 'red';
  return statusTone(record.payrollStatus);
};

const workspaceTabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'salaries', label: 'Employee Salaries' },
  { id: 'validation', label: 'Validation Center' },
  { id: 'workflow', label: 'Workflow Status' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'audit', label: 'Audit Trail' },
];

const quickActions = [
  { label: 'Assign Salary', icon: Wallet },
  { label: 'Bulk Assign', icon: Users },
  { label: 'Salary Review', icon: BadgeCheck },
  { label: 'Mass Update', icon: FileSpreadsheet },
  { label: 'Import Excel', icon: Upload },
  { label: 'Validate Payroll', icon: ShieldCheck },
  { label: 'Approve Setup', icon: CheckCircle2 },
  { label: 'Lock Salary', icon: Lock },
  { label: 'Salary History', icon: History },
  { label: 'Audit Log', icon: ClipboardList },
] as const;

const PAGE_SIZE = 50;

export default function EmployeeSalarySetupClient({ initialNow }: { initialNow: string }) {
  useEffect(() => {
    document.title = 'Employee Salary Setup | DLE Digital Enterprise';
  }, []);

  const [role, setRole] = useState<Role>('Payroll Officer');
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('salaries');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All Status');
  const [group, setGroup] = useState('All Groups');
  const [grade, setGrade] = useState('All Grades');
  const [department, setDepartment] = useState('All Departments');
  const [employmentType, setEmploymentType] = useState('All Types');
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [savingNhf, setSavingNhf] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hris/payroll-management', { headers: { 'x-hris-role': role }, cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<PayrollPayload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Employee salary setup request failed (${res.status})`);
      const data = json.data;
      setPayload(data);
      setSelectedId((current) => current || data.records[0]?.employeeId || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load employee salary setup');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const records = payload?.records || [];
  const canViewMoney = Boolean(payload?.permissions.canViewMoney);
  const lastLoaded = payload?.generatedAt || initialNow;

  const payrollGroups = useMemo(() => ['All Groups', ...Array.from(new Set(records.map((r) => r.payrollGroup).filter(Boolean))).sort()], [records]);
  const salaryGrades = useMemo(() => ['All Grades', ...Array.from(new Set(records.map((r) => r.salaryGrade).filter(Boolean))).sort()], [records]);
  const departments = useMemo(() => ['All Departments', ...Array.from(new Set(records.map((r) => r.department).filter(Boolean))).sort()], [records]);
  const employmentTypes = useMemo(() => ['All Types', ...Array.from(new Set(records.map((r) => r.employmentType).filter(Boolean))).sort()], [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((record) => {
      if (status !== 'All Status' && record.payrollStatus !== status.replace(' Status', '')) return false;
      if (group !== 'All Groups' && record.payrollGroup !== group) return false;
      if (grade !== 'All Grades' && record.salaryGrade !== grade) return false;
      if (department !== 'All Departments' && record.department !== department) return false;
      if (employmentType !== 'All Types' && record.employmentType !== employmentType) return false;
      if (!q) return true;
      return [record.employeeId, record.fullName, record.department, record.jobTitle, record.payrollGroup, record.salaryGrade, record.businessUnit].some((value) =>
        String(value || '').toLowerCase().includes(q),
      );
    });
  }, [department, employmentType, grade, group, query, records, status]);

  useEffect(() => setPage(1), [query, status, group, grade, department, employmentType]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = filtered.find((record) => record.employeeId === selectedId) || pageRows[0] || null;
  const salaryTableColumns = useMemo(() => buildSalaryTableColumns(records), [records]);
  const salaryTableColumnCount = salaryTableColumns.length;

  const missingPay = records.filter((record) => !record.basePay || record.basePay <= 0).length;
  const avgGross = records.length ? records.reduce((sum, r) => sum + (r.grossPay || 0), 0) / records.length : 0;
  const validationIssues = records.flatMap((record) =>
    record.exceptions.map((issue) => ({
      employeeId: record.employeeId,
      employeeName: record.fullName,
      issue,
      severity: record.riskSeverity,
      kind: 'blocking' as const,
    })),
  );
  const deferredValidationIssues = records.flatMap((record) =>
    (record.deferredWarnings || []).map((issue) => ({
      employeeId: record.employeeId,
      employeeName: record.fullName,
      issue,
      severity: 'Low' as const,
      kind: 'deferred' as const,
    })),
  );
  const criticalCount = validationIssues.filter((item) => item.severity === 'High').length;
  const warningCount = validationIssues.filter((item) => item.severity === 'Medium').length;
  const infoCount = validationIssues.filter((item) => item.severity === 'Low').length + deferredValidationIssues.length;

  const departmentPayroll = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((record) => {
      const key = record.department || 'Unassigned';
      map.set(key, (map.get(key) || 0) + (record.grossPay || 0));
    });
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value: canViewMoney ? Math.round(value) : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [canViewMoney, records]);

  const salaryDistribution = useMemo(() => {
    const buckets = [
      { label: 'Below ₦200k', min: 0, max: 200000 },
      { label: '₦200k – ₦400k', min: 200000, max: 400000 },
      { label: '₦400k – ₦600k', min: 400000, max: 600000 },
      { label: '₦600k – ₦1M', min: 600000, max: 1000000 },
      { label: 'Above ₦1M', min: 1000000, max: Number.POSITIVE_INFINITY },
    ];
    return buckets.map((bucket) => ({
      label: bucket.label,
      value: records.filter((record) => {
        const gross = record.grossPay || 0;
        return gross >= bucket.min && gross < bucket.max;
      }).length,
    }));
  }, [records]);

  const workflowSteps = (record: PayrollRecord | null) => {
    if (!record) return [];
    const reviewed = record.payrollStatus !== 'Blocked';
    const approved = record.payrollStatus === 'Ready';
    return [
      { role: 'HR Officer', status: reviewed ? ('done' as const) : ('pending' as const), timestamp: reviewed ? 'Reviewed' : 'Pending' },
      { role: 'Payroll Supervisor', status: reviewed ? ('done' as const) : ('pending' as const), timestamp: reviewed ? 'Validated' : 'Awaiting' },
      { role: 'Payroll Manager', status: approved ? ('done' as const) : record.payrollStatus === 'Blocked' ? ('blocked' as const) : ('pending' as const), timestamp: approved ? 'Approved' : 'Pending' },
      { role: 'Finance', status: approved ? ('done' as const) : ('pending' as const) },
      { role: 'CFO', status: approved ? ('done' as const) : ('pending' as const) },
    ];
  };

  const toggleRow = (employeeId: string) => {
    setSelectedIds((current) => (current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId]));
  };

  const togglePage = () => {
    const ids = pageRows.map((row) => row.employeeId);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => (allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids]))));
  };

  const clearFilters = () => {
    setQuery('');
    setStatus('All Status');
    setGroup('All Groups');
    setGrade('All Grades');
    setDepartment('All Departments');
    setEmploymentType('All Types');
  };

  const exportCsv = () => {
    const blob = new Blob([salarySetupCsvFromRecords(filtered as SalarySetupExportRecord[])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee-salary-setup.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const report = buildSalarySetupExportReport(filtered as SalarySetupExportRecord[]);
    downloadExcelFile({
      title: 'Employee Salary Setup',
      subtitle: `${filtered.length} employees · ${payload?.periodLabel || payload?.period || 'Current period'}`,
      sheetName: 'Salary Setup',
      columns: report.columns,
      rows: report.rows,
      fileName: `employee-salary-setup-${payload?.period || 'export'}.xls`,
    });
  };

  const setNhfApplicability = async (employeeId: string, nhfApplicable: boolean) => {
    setSavingNhf(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/payroll-management', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': role },
        body: JSON.stringify({
          action: 'set-nhf-applicability',
          employeeId,
          nhfApplicable,
          actor: role,
          comment: nhfApplicable ? 'Enabled NHF from employee salary setup' : 'Disabled NHF from employee salary setup',
        }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to save NHF option');
      setToast(nhfApplicable ? 'NHF enabled for selected employee.' : 'NHF disabled for selected employee.');
      await load();
      setSelectedId(employeeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save NHF option');
    } finally {
      setSavingNhf(false);
    }
  };

  const primaryGroup = records[0]?.payrollGroup || 'DLE';
  const primaryRun = records[0]?.paymentRun || 'Main';
  const primaryCurrency = records[0]?.payCurrency || 'NGN';

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-10">
      <div className="mx-auto max-w-[1680px] space-y-6 px-6 pt-2">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-violet-600 text-white shadow-lg shadow-violet-600/20">
                <UserCog className="h-7 w-7" />
              </span>
              <div>
                <h1 className="text-[32px] font-bold leading-tight text-[#0F172A]">Employee Salary Setup</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#475569]">
                  Manage employee-level payroll assignments, salary structures, pay components, payment runs, validations, approvals, and audit readiness.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <MetadataPill label="Payroll Group" value={primaryGroup} />
              <MetadataPill label="Payment Run" value={primaryRun} />
              <MetadataPill label="Currency" value={primaryCurrency} />
              <MetadataPill label="Loaded Date" value={new Date(lastLoaded).toLocaleDateString('en-GB')} />
              <MetadataPill label="Source System" value={payload?.source || 'DLE_Enterprise HRIS'} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100">
              {['Payroll Officer', 'Finance Controller', 'HR Director', 'HR Manager', 'Executive Management', 'Auditor', 'Employee'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
            <button type="button" onClick={exportExcel} disabled={!payload?.permissions.canExport} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40">
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>
            <button type="button" onClick={exportCsv} disabled={!payload?.permissions.canExport} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0F172A] px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </header>

        {error ? <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
        {toast ? <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div> : null}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <PremiumKpiCard label="Total Employees" value={number(payload?.summary.totalEmployees || 0)} subtitle={`${number(payload?.summary.payrollEligible || 0)} payroll eligible`} icon={Users} tone="blue" />
          <PremiumKpiCard label="Total Monthly Payroll" value={money(payload?.summary.grossPay, canViewMoney)} subtitle="Gross payroll cost" trend={5.2} icon={Banknote} tone="green" />
          <PremiumKpiCard label="Avg Gross Salary" value={money(avgGross, canViewMoney)} subtitle="Across active population" trend={3.6} icon={Wallet} tone="green" />
          <PremiumKpiCard label="Pending Review" value={number(payload?.summary.reviewEmployees || 0)} subtitle="Needs validation" icon={BadgeCheck} tone="amber" onClick={() => setStatus('Review')} />
          <PremiumKpiCard label="Missing Pay" value={number(missingPay)} subtitle={`${pctFmt.format((missingPay / Math.max(records.length, 1)) * 100)}% of employees`} icon={AlertTriangle} tone="red" />
          <PremiumKpiCard label="Net Payroll" value={money(payload?.summary.netPay, canViewMoney)} subtitle="After deductions" trend={4.8} icon={Banknote} tone="violet" />
          <PremiumKpiCard label="Payroll Validation" value={number(payload?.summary.exceptionCount || validationIssues.length)} subtitle={payload?.toleranceMode ? `${payload?.summary.deferredExceptionCount || deferredValidationIssues.length} deferred to cutover` : 'Blocking setup issues'} icon={ShieldCheck} tone="blue" onClick={() => setWorkspaceTab('validation')} />
        </section>

        <div className="sticky top-0 z-20 -mx-1 rounded-[18px] border border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => setToast(`${label} workspace action queued for payroll operations.`)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569] transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2563EB]"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B]">{selectedIds.length} selected</span>
              <select className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#0F172A] outline-none">
                <option>Bulk actions</option>
                <option>Assign payroll group</option>
                <option>Validate selected</option>
                <option>Export selected</option>
              </select>
            </div>
          </div>
        </div>

        <PanelShell title="Employee Salary Workspace" subtitle="Search, filter, validate, and manage employee compensation setup.">
          <WorkspaceTabs tabs={workspaceTabs} active={workspaceTab} onChange={setWorkspaceTab} badges={{ validation: (validationIssues.length + deferredValidationIssues.length) || undefined }} />

          {workspaceTab === 'salaries' ? (
            <>
              <div className="border-b border-[#E5E7EB] p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[240px] flex-[2]">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Search</span>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search employees, departments, grades, payroll groups..."
                        className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white pl-9 pr-9 text-sm font-medium outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100"
                      />
                      {query ? (
                        <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]">
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </label>
                  {showFilters ? (
                    <>
                      <FilterSelect label="Department" value={department} onChange={setDepartment} options={departments} />
                      <FilterSelect label="Grade" value={grade} onChange={setGrade} options={salaryGrades} />
                      <FilterSelect label="Payroll Group" value={group} onChange={setGroup} options={payrollGroups} />
                      <FilterSelect label="Employment Type" value={employmentType} onChange={setEmploymentType} options={employmentTypes} />
                      <FilterSelect label="Status" value={status} onChange={setStatus} options={['All Status', 'Ready', 'Review', 'Blocked']} />
                    </>
                  ) : null}
                  <div className="flex gap-2 pb-0.5">
                    <button type="button" onClick={() => setShowFilters((value) => !value)} className="h-10 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9]">
                      {showFilters ? 'Hide filters' : 'Show filters'}
                    </button>
                    <button type="button" onClick={clearFilters} className="h-10 rounded-xl border border-[#E5E7EB] px-3 text-xs font-semibold text-[#475569] hover:bg-[#F1F5F9]">
                      Clear filters
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-w-0 border-r border-[#E5E7EB]">
                  <div className="max-h-[620px] overflow-auto">
                    <table className="min-w-[2400px] w-full text-left">
                      <thead className="sticky top-0 z-10 bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                        <tr>
                          {SALARY_TABLE_GROUPS.map((group) => {
                            const span = salaryTableColumns.filter((column) => column.group === group.id).length;
                            if (!span) return null;
                            return (
                              <th key={group.id} colSpan={span} className="border-b border-[#E5E7EB] px-3 py-2 text-center text-[10px] font-black tracking-[0.14em] text-[#475569]">
                                {group.label}
                              </th>
                            );
                          })}
                        </tr>
                        <tr>
                          {salaryTableColumns.map((column) => (
                            <th
                              key={column.id}
                              className={`border-b border-[#E5E7EB] px-3 py-3 whitespace-nowrap ${
                                column.sticky === 'left-check'
                                  ? 'sticky left-0 z-20 bg-[#F8FAFC]'
                                  : column.sticky === 'left-employee'
                                    ? 'sticky left-12 z-20 bg-[#F8FAFC]'
                                    : ''
                              } ${column.kind === 'money' || column.kind === 'days' || column.kind === 'rate' ? 'text-right' : ''}`}
                            >
                              {column.kind === 'checkbox' ? (
                                <input type="checkbox" checked={pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.employeeId))} onChange={togglePage} className="rounded border-slate-300" />
                              ) : (
                                column.label
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {loading ? (
                          Array.from({ length: 8 }).map((_, index) => (
                            <tr key={index} className="animate-pulse">
                              <td colSpan={salaryTableColumnCount} className="px-4 py-4">
                                <div className="h-10 rounded-lg bg-slate-100" />
                              </td>
                            </tr>
                          ))
                        ) : pageRows.length ? (
                          pageRows.map((record) => {
                            const active = selected?.employeeId === record.employeeId;
                            return (
                              <tr
                                key={record.employeeId}
                                onClick={() => setSelectedId(record.employeeId)}
                                className={`cursor-pointer transition-colors hover:bg-[#F1F5F9] ${active ? 'bg-blue-50/70' : indexEven(record.employeeId) ? 'bg-white' : 'bg-[#FCFDFF]'}`}
                              >
                                {salaryTableColumns.map((column) => {
                                  if (column.kind === 'checkbox') {
                                    return (
                                      <td key={column.id} className="sticky left-0 z-10 bg-inherit px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <input type="checkbox" checked={selectedIds.includes(record.employeeId)} onChange={() => toggleRow(record.employeeId)} className="rounded border-slate-300" />
                                      </td>
                                    );
                                  }
                                  if (column.kind === 'employee') {
                                    return (
                                      <td key={column.id} className="sticky left-12 z-10 bg-inherit px-4 py-3">
                                        <div className="flex items-center gap-3">
                                          <EmployeeAvatar fullName={record.fullName} employeeCode={record.employeeId} tryPhoto size="sm" />
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-[#0F172A]">{record.fullName}</p>
                                            <p className="text-xs text-[#64748B]">{record.employeeId}</p>
                                          </div>
                                          {record.exceptionCount > 0 ? (
                                            <span title="Validation issue">
                                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                                            </span>
                                          ) : null}
                                        </div>
                                      </td>
                                    );
                                  }
                                  if (column.kind === 'status') {
                                    return (
                                      <td key={column.id} className="px-4 py-3">
                                        <StatusPill label={setupStatusLabel(record)} tone={setupStatusTone(record)} />
                                      </td>
                                    );
                                  }
                                  if (column.kind === 'actions') {
                                    return (
                                      <td key={column.id} className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-1">
                                          <button type="button" onClick={() => setSelectedId(record.employeeId)} className="rounded-lg p-2 text-[#64748B] hover:bg-blue-50 hover:text-[#2563EB]" title="View">
                                            <Eye className="h-4 w-4" />
                                          </button>
                                          <button type="button" className="rounded-lg p-2 text-[#64748B] hover:bg-slate-100" title="More">
                                            <MoreHorizontal className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </td>
                                    );
                                  }
                                  if (column.kind === 'money') {
                                    const value = column.getMoney?.(record) ?? null;
                                    const isNet = column.id === 'net-pay';
                                    return (
                                      <td key={column.id} className={`px-3 py-3 text-sm font-semibold whitespace-nowrap text-right ${isNet ? 'text-emerald-700' : 'text-[#0F172A]'}`}>
                                        {value != null && value !== 0 ? money(value, canViewMoney) : '—'}
                                      </td>
                                    );
                                  }
                                  if (column.kind === 'rate') {
                                    const value = column.getMoney?.(record) ?? null;
                                    return (
                                      <td key={column.id} className="px-3 py-3 text-sm font-semibold whitespace-nowrap text-right text-[#0F172A]">
                                        {value != null && value > 0 ? money(value, canViewMoney) : '—'}
                                      </td>
                                    );
                                  }
                                  const text = column.getText?.(record) || '—';
                                  return (
                                    <td key={column.id} className={`px-3 py-3 text-sm whitespace-nowrap ${column.kind === 'days' ? 'text-right font-semibold text-[#0F172A]' : 'text-[#475569]'}`}>
                                      {text}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={salaryTableColumnCount} className="px-4 py-10 text-center text-sm font-medium text-[#64748B]">
                              No employees match the current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] px-4 py-3">
                    <p className="text-xs font-medium text-[#64748B]">
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={page <= 1} onClick={() => setPage(1)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronsLeft className="h-4 w-4" />
                      </button>
                      <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="px-3 text-xs font-semibold text-[#0F172A]">
                        Page {page} of {pageCount}
                      </span>
                      <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button type="button" disabled={page >= pageCount} onClick={() => setPage(pageCount)} className="rounded-lg border border-[#E5E7EB] p-2 disabled:opacity-40">
                        <ChevronsRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <aside className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto p-4">
                  {selected ? (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <EmployeeAvatar fullName={selected.fullName} employeeCode={selected.employeeId} tryPhoto size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-semibold text-[#0F172A]">{selected.fullName}</p>
                          <p className="text-sm text-[#64748B]">{selected.employeeId}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <StatusPill label={setupStatusLabel(selected)} tone={setupStatusTone(selected)} />
                            <StatusPill label={selected.payrollStatus} tone={statusTone(selected.payrollStatus)} />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['Department', selected.department],
                          ['Business Unit', selected.businessUnit],
                          ['Location', selected.location],
                          ['Grade', selected.salaryGrade],
                          ['Payroll Group', selected.payrollGroup],
                          ['Employment Type', selected.employmentType],
                          ...(selected.isDailyRate
                            ? [
                                ['Days Worked', selected.timesheetDaysWorked != null ? String(selected.timesheetDaysWorked) : '—'],
                                ['Hours Worked', selected.timesheetBookedHours != null ? String(selected.timesheetBookedHours) : '—'],
                                ['Daily Rate', selected.ratePerDay ? money(selected.ratePerDay, canViewMoney) : '—'],
                              ]
                            : []),
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                            <p className="text-[11px] font-semibold uppercase text-[#94A3B8]">{label}</p>
                            <p className="mt-1 text-sm font-medium text-[#0F172A]">{value || '—'}</p>
                          </div>
                        ))}
                      </div>

                      <DonutChart
                        centerLabel="Gross"
                        centerValue={canViewMoney ? moneyFmt.format(selected.grossPay || 0).replace('NGN', '₦') : '—'}
                        rows={[
                          { label: 'Basic', value: selected.basePay || 0, color: '#2563EB' },
                          { label: 'Allowances', value: selected.allowances || 0, color: '#10B981' },
                          { label: 'Deductions', value: selected.deductions || 0, color: '#EF4444' },
                          { label: 'Net Pay', value: selected.netPay || 0, color: '#7C3AED' },
                        ]}
                      />

                      <AccordionSection title="Earnings" count={selected.earningLines.length} defaultOpen>
                        <div className="space-y-2">
                          {(selected.earningLines.length ? selected.earningLines : [{ code: 'NONE', name: 'No earning lines', amount: null }]).map((line) => (
                            <div key={line.code} className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate text-[#475569]">{line.name}</span>
                              <span className="font-semibold text-[#0F172A]">{money(line.amount, canViewMoney)}</span>
                            </div>
                          ))}
                        </div>
                      </AccordionSection>

                      <AccordionSection title="Deductions" count={selected.deductionLines?.length || 3}>
                        <div className="space-y-2">
                          {(selected.deductionLines?.length
                            ? selected.deductionLines
                            : [
                                { label: 'PAYE', amount: selected.paye },
                                { label: 'Pension', amount: selected.pension },
                                { label: 'Other', amount: selected.otherDeductions },
                              ]
                          ).map((line) => (
                            <div key={line.label} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-[#475569]">{line.label}</span>
                              <span className="font-semibold text-[#0F172A]">{money(line.amount, canViewMoney)}</span>
                            </div>
                          ))}
                        </div>
                      </AccordionSection>

                      <AccordionSection title="Workflow Status">
                        <WorkflowTimeline steps={workflowSteps(selected)} />
                      </AccordionSection>

                      <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#0F172A]">NHF Applicability</p>
                            <p className="mt-1 text-xs text-[#64748B]">Controls statutory deduction on payslip.</p>
                          </div>
                          <StatusPill label={selected.nhfApplicable ? 'NHF On' : 'NHF Off'} tone={selected.nhfApplicable ? 'green' : 'slate'} />
                        </div>
                        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3">
                          <span className="text-xs font-medium text-[#475569]">Apply NHF deduction</span>
                          <input type="checkbox" checked={selected.nhfApplicable} disabled={savingNhf} onChange={(event) => void setNhfApplicability(selected.employeeId, event.target.checked)} className="h-5 w-5 rounded border-slate-300 text-[#2563EB]" />
                        </label>
                      </div>

                      <Link href={`/hris/employees/employee-profile?employeeId=${encodeURIComponent(selected.employeeId)}`} className="flex w-full items-center justify-center rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">
                        View Full Employee Profile
                      </Link>
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-[#64748B]">Select an employee to view salary details.</p>
                  )}
                </aside>
              </div>
            </>
          ) : null}

          {workspaceTab === 'validation' ? (
            <div className="p-5">
              {payload?.enterpriseSourceActive ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                  <p className="font-semibold">DLE_Enterprise is the authoritative payroll source for {payload.periodLabel || payload.period}.</p>
                  <p className="mt-1 text-emerald-900">Validation uses DLE_Enterprise employee setup, timesheets, and payroll rules only. Sage comparison is disabled from June 2026 onward.</p>
                </div>
              ) : payload?.toleranceMode ? (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
                  <p className="font-semibold">May/June cutover tolerance is active for {payload.periodLabel || payload.period}.</p>
                  <p className="mt-1 text-blue-900">Sage variance, pension setup gaps, and timesheet deferrals are informational only. Only blocking master-data issues stop payroll release.</p>
                </div>
              ) : null}
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className={`rounded-xl border p-4 ${setupToneStyles.red.chip}`}>
                  <p className="text-sm font-medium">Critical</p>
                  <p className="mt-1 text-3xl font-bold">{criticalCount}</p>
                  <p className="mt-1 text-xs opacity-80">Blocking payroll release</p>
                </div>
                <div className={`rounded-xl border p-4 ${setupToneStyles.amber.chip}`}>
                  <p className="text-sm font-medium">Warning</p>
                  <p className="mt-1 text-3xl font-bold">{warningCount}</p>
                  <p className="mt-1 text-xs opacity-80">Needs review before approval</p>
                </div>
                <div className={`rounded-xl border p-4 ${setupToneStyles.blue.chip}`}>
                  <p className="text-sm font-medium">Information</p>
                  <p className="mt-1 text-3xl font-bold">{infoCount}</p>
                  <p className="mt-1 text-xs opacity-80">Deferred / informational checks</p>
                </div>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-y-auto">
                {[...validationIssues, ...deferredValidationIssues].slice(0, 120).map((item, index) => (
                  <button
                    key={`${item.employeeId}-${item.kind}-${index}`}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.employeeId);
                      setWorkspaceTab('salaries');
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">{item.employeeName}</p>
                      <p className="text-xs text-[#64748B]">{item.employeeId}</p>
                      <p className="mt-1 text-sm text-[#475569]">{item.issue}</p>
                    </div>
                    <StatusPill
                      label={item.kind === 'deferred' ? 'Deferred' : item.severity}
                      tone={item.kind === 'deferred' ? 'blue' : item.severity === 'High' ? 'red' : item.severity === 'Medium' ? 'amber' : 'blue'}
                    />
                  </button>
                ))}
                {!validationIssues.length && !deferredValidationIssues.length ? <p className="py-8 text-center text-sm text-[#64748B]">No validation issues found.</p> : null}
              </div>
            </div>
          ) : null}

          {workspaceTab === 'workflow' ? (
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
              {filtered.slice(0, 12).map((record) => (
                <div key={record.employeeId} className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <EmployeeAvatar fullName={record.fullName} employeeCode={record.employeeId} tryPhoto size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">{record.fullName}</p>
                      <p className="text-xs text-[#64748B]">{record.employeeId}</p>
                    </div>
                    <StatusPill label={record.payrollStatus} tone={statusTone(record.payrollStatus)} />
                  </div>
                  <WorkflowTimeline steps={workflowSteps(record)} />
                </div>
              ))}
            </div>
          ) : null}

          {workspaceTab === 'analytics' ? (
            <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2">
              <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5">
                <h3 className="text-base font-semibold text-[#0F172A]">Payroll Cost by Department</h3>
                <div className="mt-4">
                  <DonutChart centerLabel="Departments" centerValue={String(departmentPayroll.length)} rows={departmentPayroll} />
                </div>
              </div>
              <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5">
                <h3 className="text-base font-semibold text-[#0F172A]">Salary Distribution</h3>
                <div className="mt-4">
                  <HorizontalBarChart rows={salaryDistribution} />
                </div>
              </div>
            </div>
          ) : null}

          {workspaceTab === 'audit' ? (
            <div className="space-y-3 p-5">
              {filtered.slice(0, 20).map((record) => (
                <div key={record.employeeId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{record.fullName}</p>
                    <p className="text-xs text-[#64748B]">Last payroll setup review · {payload?.periodLabel || 'Current period'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill label={record.setupAssignedToPayroll ? 'Assigned' : 'Unassigned'} tone={record.setupAssignedToPayroll ? 'green' : 'red'} />
                    <StatusPill label={`${record.exceptionCount} issues`} tone={record.exceptionCount ? 'amber' : 'green'} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </PanelShell>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-4">
          <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-[#0F172A]">Payroll Cost by Department</h3>
            <div className="mt-4">
              <DonutChart centerLabel="Gross" centerValue={canViewMoney ? moneyFmt.format(payload?.summary.grossPay || 0).replace('NGN', '₦') : '—'} rows={departmentPayroll} />
            </div>
          </div>
          <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-[#0F172A]">Salary Distribution</h3>
            <div className="mt-4">
              <HorizontalBarChart rows={salaryDistribution} />
            </div>
          </div>
          <InsightCard
            title="AI Insights"
            items={[
              `${missingPay} employees are missing base or period salary.`,
              `${payload?.summary.reviewEmployees || 0} employees require payroll setup review.`,
              `${payload?.summary.blockedEmployees || 0} employees are blocked from payroll posting.`,
              avgGross > 0 ? `Average gross salary is ${money(avgGross, canViewMoney)} across the active population.` : 'Average gross salary will appear once payroll values are loaded.',
            ]}
          />
          <div className="rounded-[18px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#7C3AED]" />
              <h3 className="text-base font-semibold text-[#0F172A]">Validation Summary</h3>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{criticalCount}</p>
                <p className="text-xs font-medium text-red-700">Critical</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{warningCount}</p>
                <p className="text-xs font-medium text-amber-700">Warning</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{infoCount}</p>
                <p className="text-xs font-medium text-blue-700">Info</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function indexEven(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i)) % 2;
  return hash === 0;
}
