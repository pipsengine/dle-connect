import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { loadWorkspaceEnv, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import {
  approvedAnnualLeaveDaysForYear,
  employeeMatchKeys,
  isCountableLeaveAllowanceEvent,
  isLeaveAllowanceEligibleForYear,
  isLeaveAllowancePaymentCode,
  primaryAnnualLeaveApplicationForAllowance,
  LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS,
  type LeaveApplicationLike,
} from '@/lib/leave-allowance-policy';
import { calculateAnnualLeaveAllowanceAmount, calculatePayrollEarnings } from '@/lib/payroll-earnings-engine';
import { isEnterprisePayrollPeriod } from '@/lib/payroll-enterprise-source';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { syncSageSupplementalEarningAdjustments } from '@/lib/payroll-period-earning-adjustments-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';

export type PayrollLeaveAllowanceEvent = {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName?: string;
  period: string;
  leaveYear: number;
  leaveType: 'Annual Leave';
  days: number;
  code: string;
  description: string;
  amount: number;
  taxableAmount: number;
  status: 'Pending Approval' | 'Approved' | 'Posted' | 'Paid' | 'Reversed';
  source: 'Sage Payroll Migration' | 'ESS Leave Approval' | 'HR Leave Approval';
  requestId?: string;
  approvedAt?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
  audit: Array<{ at: string; actor: string; action: string; note?: string }>;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
export const normalizePayrollPeriod = (value?: string | null) => compact(value).replace(/\//g, '-').slice(0, 7);

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = process.env.DLE_HRIS_DATA_DIR
  ? path.resolve(process.env.DLE_HRIS_DATA_DIR)
  : path.join(resolveDashboardRoot(), 'data', 'hris');
const EVENTS_FILE_NAME = 'payroll-leave-allowance-events.json';
const PRIMARY_EVENTS_PATH = path.join(DATA_DIR, EVENTS_FILE_NAME);
const uniquePaths = (paths: Array<string | null | undefined>) => Array.from(new Set(paths.reduce<string[]>((items, item) => {
  if (item) items.push(path.normalize(item));
  return items;
}, [])));
const repoMirrorPath = (file: string) => {
  const normalizedFile = path.normalize(file);
  const markers = [
    path.normalize(path.join('deployment', 'iis', 'site', 'apps', 'dashboard', 'data', 'hris')),
    path.normalize(path.join('deployment', 'iis', 'site-publish', 'apps', 'dashboard', 'data', 'hris')),
  ];
  const marker = markers.find((candidate) => normalizedFile.toLowerCase().lastIndexOf(candidate.toLowerCase()) !== -1);
  if (!marker) return null;
  const markerIndex = normalizedFile.toLowerCase().lastIndexOf(marker.toLowerCase());
  const repoRoot = normalizedFile.slice(0, markerIndex);
  return path.join(repoRoot, 'apps', 'dashboard', 'data', 'hris', path.basename(normalizedFile));
};
const EVENTS_PATHS = uniquePaths([
  PRIMARY_EVENTS_PATH,
  repoMirrorPath(PRIMARY_EVENTS_PATH),
  path.join(resolveDashboardRoot(), 'data', 'hris', EVENTS_FILE_NAME),
  path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', EVENTS_FILE_NAME),
]);

let syncCache: { mtime: number; events: PayrollLeaveAllowanceEvent[]; path?: string } | null = null;

const config = () => {
  loadWorkspaceEnv();
  return {
    server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
    port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
    database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
    user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
    password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      instanceName: process.env.SAGE_PAYROLL_DB_INSTANCE || 'MSSQLSERVERPEOPL',
    },
    connectionTimeout: Number(process.env.SAGE_PAYROLL_DB_CONNECT_TIMEOUT || 15000),
    requestTimeout: Number(process.env.SAGE_PAYROLL_DB_REQUEST_TIMEOUT || 60000),
  };
};

const parseEvents = (raw: string): PayrollLeaveAllowanceEvent[] => {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed as PayrollLeaveAllowanceEvent[] : [];
};

const readEventsRaw = async (): Promise<PayrollLeaveAllowanceEvent[]> => {
  for (const file of EVENTS_PATHS) {
    try {
      return parseEvents(await readFile(file, 'utf8'));
    } catch {
      // Try the next candidate path.
    }
  }
  return syncCache?.events || [];
};

export const readPayrollLeaveAllowanceEvents = readEventsRaw;

const writeEventsFiles = async (events: PayrollLeaveAllowanceEvent[], required = false) => {
  const sorted = [...events].sort((a, b) => `${b.period}-${b.employeeCode}`.localeCompare(`${a.period}-${a.employeeCode}`));
  const content = JSON.stringify(sorted, null, 2);
  let lastError: unknown = null;
  let wrote = false;
  for (const file of EVENTS_PATHS) {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content, 'utf8');
      wrote = true;
      syncCache = { mtime: Date.now(), events: sorted, path: file };
    } catch (error) {
      lastError = error;
    }
  }
  if (wrote) return;
  if (required && lastError) throw lastError;
  if (lastError) {
    console.warn('[Leave Allowance] Local JSON write skipped:', lastError instanceof Error ? lastError.message : lastError);
  }
};

export const writePayrollLeaveAllowanceEvents = async (
  events: PayrollLeaveAllowanceEvent[],
  options?: { required?: boolean },
) => writeEventsFiles(events, options?.required === true);

export const readPayrollLeaveAllowanceEventsSync = () => {
  for (const file of EVENTS_PATHS) {
    try {
      if (!existsSync(file)) continue;
      const stat = statSync(file) as { mtimeMs: number };
      if (syncCache && syncCache.path === file && syncCache.mtime === stat.mtimeMs) return syncCache.events;
      const events = parseEvents(readFileSync(file, 'utf8'));
      syncCache = { mtime: stat.mtimeMs, events, path: file };
      return events;
    } catch {
      // Try the next candidate path.
    }
  }
  return syncCache?.events || [];
};

export const leaveAllowanceEventsForEmployeePeriod = (employee: DleEmployeeDirectoryRow, period?: string) => {
  const normalizedPeriod = normalizePayrollPeriod(period);
  if (!normalizedPeriod) return [];
  const employeeKeys = [
    employee.employeeId,
    employee.employeeCode,
    employee.sourceEmployeeId,
  ].map(normalizePayrollMatchKey).filter(Boolean);
  return readPayrollLeaveAllowanceEventsSync().filter((event) => {
    if (!isCountableLeaveAllowanceEvent(event)) return false;
    if (event.period !== normalizedPeriod) return false;
    const eventKeys = [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).filter(Boolean);
    return eventKeys.some((key) => employeeKeys.includes(key));
  });
};

export const hasLeaveAllowanceInYear = async (employee: DleEmployeeDirectoryRow, leaveYear: number, excludeRequestId?: string) => {
  const employeeKeys = employeeMatchKeys(employee.employeeId, employee.employeeCode || employee.sourceEmployeeId);
  return (await readPayrollLeaveAllowanceEvents()).some((event) => {
    if (event.leaveYear !== leaveYear || event.leaveType !== 'Annual Leave') return false;
    if (excludeRequestId && event.requestId === excludeRequestId) return false;
    if (!isCountableLeaveAllowanceEvent(event)) return false;
    const eventKeys = [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).filter(Boolean);
    return eventKeys.some((key) => employeeKeys.includes(key));
  });
};

const sageLeaveAllowanceQuery = `
SELECT
  e.EmployeeCode AS employeeCode,
  ge.DisplayName AS fullName,
  ppg.StartDate AS periodStart,
  ppg.EndDate AS periodEnd,
  ppg.CalendarYear AS calendarYear,
  ppg.CalendarMonth AS calendarMonth,
  ed.DefCode AS code,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.ShortDescription)), ''), NULLIF(LTRIM(RTRIM(ed.LongDescription)), ''), ed.DefCode) AS description,
  pel.Total AS amount,
  pel.TaxableAmount AS taxableAmount
FROM Payroll.PayslipEarnLine pel
JOIN Payroll.Payslip p
  ON p.PayslipID = pel.PayslipID
JOIN Employee.EmployeePayPeriod epp
  ON epp.EmployeePayPeriodID = p.EmployeePayPeriodID
JOIN Company.PayPeriodGen ppg
  ON ppg.PayPeriodGenID = epp.PayPeriodGenID
JOIN Employee.Employee e
  ON e.EmployeeID = epp.EmployeeID
JOIN Entity.GenEntity ge
  ON ge.GenEntityID = e.GenEntityID
JOIN Payroll.EarningDef ed
  ON ed.EarningDefID = pel.DefID
WHERE
  ppg.CalendarYear >= YEAR(GETDATE()) - 1
  AND ISNULL(pel.Total, 0) <> 0
  AND (
    UPPER(ed.DefCode) IN ('LEAVEALLOW', 'SNR_LEAVETAX')
    OR UPPER(ed.DefCode) LIKE '%[_]LEAVE'
    OR UPPER(ed.DefCode) LIKE '%LEAVEALLOW%'
    OR UPPER(ed.ShortDescription) LIKE '%LEAVE ALLOWANCE%'
  )
ORDER BY ppg.CalendarYear DESC, ppg.CalendarMonth DESC, e.EmployeeCode;
`;

type SageLeaveRow = {
  employeeCode: string;
  fullName: string | null;
  calendarYear: number;
  calendarMonth: number;
  code: string;
  description: string;
  amount: number;
  taxableAmount: number | null;
};

export const readSageLeaveAllowanceEvents = async (): Promise<PayrollLeaveAllowanceEvent[]> => {
  const pool = new sql.ConnectionPool(config());
  await pool.connect();
  try {
    const result = await pool.request().query(sageLeaveAllowanceQuery);
    const now = new Date().toISOString();
    return (result.recordset as SageLeaveRow[]).map((row) => {
      const period = `${Number(row.calendarYear || 0)}-${String(Number(row.calendarMonth || 0)).padStart(2, '0')}`;
      const code = compact(row.code).toUpperCase() || 'LEAVEALLOW';
      const employeeCode = compact(row.employeeCode);
      return {
        id: `sage-${period}-${normalizePayrollMatchKey(employeeCode)}-${code}`,
        employeeId: employeeCode,
        employeeCode,
        fullName: compact(row.fullName),
        period,
        leaveYear: Number(row.calendarYear || period.slice(0, 4)),
        leaveType: 'Annual Leave' as const,
        days: 0,
        code,
        description: compact(row.description) || 'Leave Allowance',
        amount: roundMoney(Number(row.amount || 0)),
        taxableAmount: roundMoney(Number(row.taxableAmount ?? row.amount ?? 0)),
        status: 'Paid' as const,
        source: 'Sage Payroll Migration' as const,
        postedAt: `${period}-01T00:00:00.000Z`,
        createdAt: now,
        updatedAt: now,
        audit: [{ at: now, actor: 'Sage Payroll Migration', action: 'Imported paid leave allowance', note: `${code} ${period}` }],
      };
    }).filter((event) => event.employeeCode && isLeaveAllowancePaymentCode(event.code) && event.amount > 0);
  } finally {
    await pool.close();
  }
};

export const reconcilePayrollLeaveAllowanceEvents = async (
  applications: LeaveApplicationLike[] = [],
  options?: { persist?: boolean },
) => {
  const events = await readPayrollLeaveAllowanceEvents();
  if (!applications.length) return events;

  const now = new Date().toISOString();
  let changed = false;
  const reconciled = events.map((event) => {
    if (!isLeaveAllowancePaymentCode(event.code) || Number(event.amount || 0) <= 0) return event;
    const keys = [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).filter(Boolean);
    const approvedDays = approvedAnnualLeaveDaysForYear(applications, keys, event.leaveYear);
    const eligible = isLeaveAllowanceEligibleForYear(applications, keys, event.leaveYear);
    const linkedApplication = primaryAnnualLeaveApplicationForAllowance(applications, keys, event.leaveYear);

    if (eligible) {
      const next = {
        ...event,
        days: approvedDays,
        requestId: linkedApplication?.id || event.requestId,
        updatedAt: now,
        status: event.status === 'Reversed' ? 'Paid' as const : event.status,
      };
      if (next.days !== event.days || next.requestId !== event.requestId || next.status !== event.status) changed = true;
      return next;
    }

    if (['Approved', 'Posted', 'Paid'].includes(event.status)) {
      changed = true;
      return {
        ...event,
        days: approvedDays,
        status: 'Reversed' as const,
        requestId: linkedApplication?.id || event.requestId,
        updatedAt: now,
        audit: [
          ...(event.audit || []),
          {
            at: now,
            actor: 'Leave Allowance Policy',
            action: 'Reversed ineligible leave allowance',
            note: `Only ${approvedDays} approved annual leave day(s) recorded for ${event.leaveYear}; minimum 10 working days required.`,
          },
        ],
      };
    }

    if (event.days !== approvedDays) {
      changed = true;
      return { ...event, days: approvedDays, updatedAt: now };
    }

    return event;
  });

  if (changed && options?.persist !== false) await writePayrollLeaveAllowanceEvents(reconciled);
  return reconciled;
};

const loadLeaveApplicationsForReconciliation = async () => {
  const { readLeaveApplicationsForReconciliation } = await import('@/lib/leave-management-store');
  return readLeaveApplicationsForReconciliation();
};

export const syncSageLeaveAllowanceEvents = async (
  applications?: LeaveApplicationLike[],
  options?: { persist?: boolean },
) => {
  const resolvedApplications = applications ?? await loadLeaveApplicationsForReconciliation();
  const persist = options?.persist !== false;
  try {
    const [current, sageEvents] = await Promise.all([readPayrollLeaveAllowanceEvents(), readSageLeaveAllowanceEvents()]);
    const byId = new Map(current.map((event) => [event.id, event]));
    for (const sageEvent of sageEvents) {
      const existing = byId.get(sageEvent.id);
      byId.set(sageEvent.id, existing ? { ...existing, ...sageEvent, createdAt: existing.createdAt, audit: existing.audit?.length ? existing.audit : sageEvent.audit } : sageEvent);
    }
    if (persist) await writePayrollLeaveAllowanceEvents(Array.from(byId.values()));
    return reconcilePayrollLeaveAllowanceEvents(resolvedApplications, { persist });
  } catch {
    return reconcilePayrollLeaveAllowanceEvents(resolvedApplications, { persist });
  }
};

export const syncLeaveAllowanceEventsForPayroll = async (period?: string) => {
  const applications = await loadLeaveApplicationsForReconciliation();
  try {
    await syncSageSupplementalEarningAdjustments(period);
  } catch (error) {
    console.warn('[Payroll] Sage supplemental earning sync skipped:', error instanceof Error ? error.message : error);
  }
  if (period && isEnterprisePayrollPeriod(period)) {
    return reconcilePayrollLeaveAllowanceEvents(applications);
  }
  return syncSageLeaveAllowanceEvents(applications);
};

export type PostLeaveAllowanceResult = {
  posted: boolean;
  message: string;
  event?: PayrollLeaveAllowanceEvent;
};

export const postLeaveAllowanceOnAnnualLeaveApproval = async (input: {
  employee: DleEmployeeDirectoryRow;
  applications: LeaveApplicationLike[];
  leaveType: string;
  days: number;
  startDate: string;
  period?: string;
  leaveYear?: number;
  requestId?: string;
  source: PayrollLeaveAllowanceEvent['source'];
  actor: string;
}): Promise<PostLeaveAllowanceResult> => {
  const leaveType = compact(input.leaveType);
  const days = Number(input.days || 0);
  if (leaveType !== 'Annual Leave' || days < LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS) {
    return { posted: false, message: 'Annual leave allowance not applicable for this request.' };
  }
  const startDate = compact(input.startDate);
  const period = normalizePayrollPeriod(input.period || activePayrollPeriod() || startDate.slice(0, 7));
  const leaveYear = Number(input.leaveYear || startDate.slice(0, 4) || new Date().getFullYear());
  const employeeKeys = employeeMatchKeys(input.employee.employeeId, input.employee.employeeCode || input.employee.sourceEmployeeId);
  const approvedDays = approvedAnnualLeaveDaysForYear(input.applications, employeeKeys, leaveYear);
  if (!isLeaveAllowanceEligibleForYear(input.applications, employeeKeys, leaveYear)) {
    return {
      posted: false,
      message: `Leave allowance not posted: only ${approvedDays} approved annual leave day(s) recorded for ${leaveYear}; minimum ${LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS} required.`,
    };
  }
  const annualBenefit = calculatePayrollEarnings(input.employee).annualBenefitLines.find(
    (line) => line.name.toLowerCase().includes('leave') || line.code.toUpperCase().includes('LEAVE'),
  );
  const allowanceAmount = Number(annualBenefit?.amount || 0) || calculateAnnualLeaveAllowanceAmount(input.employee);
  if (allowanceAmount <= 0) {
    return { posted: false, message: 'Leave allowance amount could not be calculated for this employee profile.' };
  }
  try {
    const event = await upsertApprovedLeaveAllowanceEvent({
      employee: input.employee,
      period,
      leaveYear,
      days: approvedDays || days,
      amount: allowanceAmount,
      taxableAmount: annualBenefit?.taxable === false ? 0 : allowanceAmount,
      source: input.source,
      requestId: input.requestId,
      actor: input.actor,
      note: `Approved ${approvedDays || days} days Annual Leave; payable once for ${leaveYear}.`,
    });
    return { posted: true, message: `Leave allowance ${event.code} posted to ${event.period} payroll.`, event };
  } catch (error) {
    return { posted: false, message: error instanceof Error ? error.message : 'Leave allowance was not posted.' };
  }
};

export const upsertApprovedLeaveAllowanceEvent = async (input: {
  employee: DleEmployeeDirectoryRow;
  period: string;
  leaveYear: number;
  days: number;
  amount: number;
  taxableAmount?: number;
  source: PayrollLeaveAllowanceEvent['source'];
  requestId?: string;
  actor: string;
  note?: string;
}) => {
  const period = normalizePayrollPeriod(input.period);
  if (!period) throw new Error('Payroll period is required for leave allowance posting.');
  if (Number(input.days || 0) < LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS) {
    throw new Error(`Leave allowance requires at least ${LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS} approved annual leave working days.`);
  }
  if (await hasLeaveAllowanceInYear(input.employee, input.leaveYear, input.requestId)) {
    throw new Error(`Leave allowance has already been paid or approved for ${input.leaveYear}.`);
  }
  const now = new Date().toISOString();
  const employeeCode = compact(input.employee.employeeCode || input.employee.employeeId);
  const requestKey = input.requestId ? normalizePayrollMatchKey(input.requestId) : String(Date.now());
  const event: PayrollLeaveAllowanceEvent = {
    id: `ess-${input.leaveYear}-${normalizePayrollMatchKey(employeeCode)}-${requestKey}`,
    employeeId: input.employee.employeeId,
    employeeCode,
    fullName: input.employee.fullName,
    period,
    leaveYear: input.leaveYear,
    leaveType: 'Annual Leave',
    days: Math.max(0, Number(input.days || 0)),
    code: 'LEAVEALLOW',
    description: 'Leave Allowance',
    amount: roundMoney(Number(input.amount || 0)),
    taxableAmount: roundMoney(Number(input.taxableAmount ?? input.amount ?? 0)),
    status: 'Approved',
    source: input.source,
    requestId: input.requestId,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    audit: [{ at: now, actor: input.actor, action: 'Approved leave allowance for payroll', note: input.note }],
  };
  const events = await readPayrollLeaveAllowanceEvents();
  await writePayrollLeaveAllowanceEvents([event, ...events.filter((item) => item.id !== event.id)], { required: true });
  return event;
};
