/**
 * Resignation Management store — JSON persistence under data/hris.
 * Server-only. Client UIs must import from resignation-management-shared.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculatePayrollEarnings } from '@/lib/payroll-earnings-engine';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import {
  type ResignationEarningLine,
  type ResignationKpi,
  type ResignationPayload,
  type ResignationProgressItem,
  type ResignationRecord,
  type ResignationStatus,
  type ResignationWorkflowStage,
  currentResignationPeriod,
  formatResignationDate,
  noticeBalanceDays,
  periodLabelFromCode,
  previousResignationPeriod,
} from '@/lib/resignation-management-shared';

export type {
  ResignationRecord,
  ResignationPayload,
  ResignationStatus,
  ResignationKpi,
} from '@/lib/resignation-management-shared';

export {
  formatResignationDate,
  periodLabelFromCode,
  currentResignationPeriod,
  previousResignationPeriod,
  noticeBalanceDays,
  noticeStatusLabel,
  formatNoticeMonths,
  resignationProfileHref,
  resignationFinalPayrollHref,
} from '@/lib/resignation-management-shared';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'));
const FILE_PATH = path.join(DATA_DIR, 'resignation-management.json');

const compact = (value: unknown) => String(value || '').trim();
const nowIso = () => new Date().toISOString();

const defaultProgress = (): ResignationProgressItem[] => [
  { id: 'handover', label: 'Handover Checklist', status: 'Not Started' },
  { id: 'clearance', label: 'Exit Clearance', status: 'Not Started' },
  { id: 'asset', label: 'Asset Return', status: 'Not Started' },
  { id: 'payroll', label: 'Final Payroll Processing', status: 'Not Started' },
  { id: 'interview', label: 'Exit Interview', status: 'Not Started' },
  { id: 'access', label: 'Access Deactivation', status: 'Not Started' },
  { id: 'benefits', label: 'Benefits Closure', status: 'Not Started' },
];

const defaultWorkflow = (status: ResignationStatus, submittedAt?: string | null): ResignationWorkflowStage[] => {
  const stages: ResignationWorkflowStage[] = [
    { id: 'submit', label: 'Employee Submission', status: 'Pending', at: null },
    { id: 'manager', label: 'Line Manager Review', status: 'Pending', at: null },
    { id: 'hr', label: 'HR Review', status: 'Pending', at: null },
    { id: 'exit', label: 'Final Exit Approval', status: 'Pending', at: null },
  ];
  const mark = (index: number, value: ResignationWorkflowStage['status']) => {
    for (let i = 0; i < stages.length; i += 1) {
      if (i < index) stages[i].status = 'Completed';
      else if (i === index) stages[i].status = value;
      else stages[i].status = 'Pending';
    }
  };
  switch (status) {
    case 'Draft':
      break;
    case 'Submitted':
      mark(0, 'Completed');
      stages[0].at = submittedAt || nowIso();
      mark(1, 'In Review');
      break;
    case 'Manager Review':
      mark(0, 'Completed');
      stages[0].at = submittedAt || nowIso();
      mark(1, 'In Review');
      break;
    case 'HR Review':
      mark(1, 'Completed');
      mark(2, 'In Review');
      stages[0].at = submittedAt || nowIso();
      break;
    case 'Serving Notice':
    case 'Handover':
    case 'Clearance':
    case 'Final Payroll':
      mark(2, 'Completed');
      mark(3, 'In Review');
      stages[0].at = submittedAt || nowIso();
      break;
    case 'Completed':
      stages.forEach((stage) => {
        stage.status = 'Completed';
      });
      stages[0].at = submittedAt || nowIso();
      break;
    default:
      mark(0, 'Completed');
      stages[0].at = submittedAt || nowIso();
  }
  return stages;
};

const clearancePctFromProgress = (progress: ResignationProgressItem[]) => {
  if (!progress.length) return 0;
  const score = progress.reduce((sum, item) => sum + (item.status === 'Completed' ? 1 : item.status === 'In Progress' ? 0.5 : 0), 0);
  return Math.round((score / progress.length) * 100);
};

const readJson = async (): Promise<ResignationRecord[]> => {
  try {
    const parsed = JSON.parse(await readFile(FILE_PATH, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.resignations) ? parsed.resignations : [];
    return rows.filter((row: ResignationRecord) => row?.id && row?.employeeCode);
  } catch {
    return [];
  }
};

const writeJson = async (resignations: ResignationRecord[]) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify({ resignations, updatedAt: nowIso() }, null, 2), 'utf8');
};

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = compact(right).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a || !b) return false;
  return a === b || a.replace(/^P/, '') === b.replace(/^P/, '');
};

const daysBetween = (from?: string | null, to?: string | null) => {
  if (!from || !to) return 0;
  const a = new Date(`${from.slice(0, 10)}T00:00:00.000Z`);
  const b = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
};

const servedDays = (resignationDate?: string | null, lastWorkingDay?: string | null) => {
  if (!resignationDate) return 0;
  const end = lastWorkingDay || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const capped = end < today ? end : today;
  return daysBetween(resignationDate, capped);
};

const buildKpis = (current: ResignationRecord[], prior: ResignationRecord[]): ResignationKpi[] => {
  const count = (rows: ResignationRecord[], statuses: ResignationStatus[]) =>
    rows.filter((row) => statuses.includes(row.status)).length;
  const pairs: Array<[ResignationKpi['id'], string, ResignationStatus[], ResignationKpi['tone']]> = [
    ['new', 'New Resignations', ['Submitted', 'Draft'], 'blue'],
    ['review', 'Under Review', ['Manager Review', 'HR Review'], 'amber'],
    ['notice', 'Serving Notice', ['Serving Notice'], 'mint'],
    ['clearance', 'Clearance in Progress', ['Clearance', 'Handover'], 'purple'],
    ['payroll', 'Final Payroll Pending', ['Final Payroll'], 'rose'],
    ['completed', 'Completed Exits', ['Completed'], 'green'],
  ];
  return pairs.map(([id, label, statuses, tone]) => {
    const value = count(current, statuses);
    const was = count(prior, statuses);
    const diff = value - was;
    return {
      id,
      label,
      value,
      display: String(value),
      deltaLabel: `${diff >= 0 ? '↑ +' : '↓ '}${Math.abs(diff)} vs last month`,
      tone,
    };
  });
};

const tabCountsFor = (rows: ResignationRecord[]) => {
  const counts: Record<string, number> = {
    All: rows.length,
    Submitted: 0,
    'Manager Review': 0,
    'HR Review': 0,
    'Notice Period': 0,
    Handover: 0,
    Clearance: 0,
    'Final Payroll': 0,
    Completed: 0,
    Exceptions: 0,
  };
  for (const row of rows) {
    if (row.status === 'Submitted' || row.status === 'Draft') counts.Submitted += 1;
    else if (row.status === 'Manager Review') counts['Manager Review'] += 1;
    else if (row.status === 'HR Review') counts['HR Review'] += 1;
    else if (row.status === 'Serving Notice') counts['Notice Period'] += 1;
    else if (row.status === 'Handover') counts.Handover += 1;
    else if (row.status === 'Clearance') counts.Clearance += 1;
    else if (row.status === 'Final Payroll') counts['Final Payroll'] += 1;
    else if (row.status === 'Completed') counts.Completed += 1;
    else if (row.status === 'Exception' || row.status === 'Cancelled') counts.Exceptions += 1;
  }
  return counts;
};

const findEmployee = async (employeeCode: string) => {
  const source = await readPayrollEmployees().catch(() => null);
  const code = compact(employeeCode).toUpperCase();
  return (source?.employees || []).find((row) => {
    const rowCode = compact(row.employeeCode || row.employeeId).toUpperCase();
    return rowCode === code || rowCode.replace(/^P/, '') === code.replace(/^P/, '');
  }) || null;
};

const resolveEarningsPackage = (employee: NonNullable<Awaited<ReturnType<typeof findEmployee>>>, period: string) => {
  const currency: 'NGN' | 'USD' = /USD|US\$/i.test(String(employee.payCurrency || '')) ? 'USD' : 'NGN';
  const earnings = calculatePayrollEarnings(employee, { period, useHrisPackageLines: true });
  const lines: ResignationEarningLine[] = (earnings.paidEarningLines || [])
    .filter((line) => line.includeInMonthlyPayroll !== false && Number(line.amount || 0) > 0)
    .map((line) => ({
      code: compact(line.code) || compact(line.name),
      name: compact(line.name) || compact(line.code) || 'Earning',
      amount: Math.round(Number(line.amount || 0) * 100) / 100,
    }));
  const basicSalary = Math.max(0, Number(earnings.basePay || employee.basicSalary || 0));
  const grossMonthly = Math.max(
    basicSalary,
    Number(earnings.grossPay || employee.periodSalary || lines.reduce((sum, line) => sum + line.amount, 0)),
  );
  return {
    currency,
    basicSalary: Math.round(basicSalary * 100) / 100,
    grossMonthly: Math.round(grossMonthly * 100) / 100,
    earningsBreakdown: lines.length
      ? lines
      : basicSalary > 0
        ? [
            { code: 'BASIC', name: 'Basic Salary', amount: Math.round(basicSalary * 100) / 100 },
            ...(grossMonthly > basicSalary
              ? [{ code: 'ALLOW', name: 'Allowances', amount: Math.round((grossMonthly - basicSalary) * 100) / 100 }]
              : []),
          ]
        : [],
    grade: compact(employee.jobGrade || employee.salaryGrade) || '—',
  };
};

export const searchEmployeesForResignation = async (query: string, limit = 12) => {
  const q = compact(query).toLowerCase();
  if (q.length < 2) return [];
  const source = await readPayrollEmployees();
  const period = currentResignationPeriod();
  return source.employees
    .filter((row) => `${row.fullName} ${row.employeeCode} ${row.employeeId} ${row.department}`.toLowerCase().includes(q))
    .slice(0, limit)
    .map((row) => {
      const pack = resolveEarningsPackage(row, period);
      return {
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        employeeName: row.fullName,
        department: row.department,
        position: row.jobTitle,
        employmentType: row.employmentType,
        grade: pack.grade,
        managerName: row.managerName || '',
        workLocation: row.location || '',
        dateOfJoining: row.contractStartDate || null,
        email: row.officialEmail || row.email || '',
        phone: row.primaryPhone || row.phone || '',
        status: row.status,
        currency: pack.currency,
        basicSalary: pack.basicSalary,
        grossMonthly: pack.grossMonthly,
        earningsBreakdown: pack.earningsBreakdown,
      };
    });
};

export const listResignations = async (period?: string) => {
  const periodCode = period || currentResignationPeriod();
  return (await readJson()).filter((row) => row.period === periodCode);
};

export const getResignation = async (id: string) =>
  (await readJson()).find((row) => row.id === id) || null;

export const findResignationByEmployee = async (input: {
  employeeCode?: string | null;
  employeeId?: string | null;
}) => {
  const all = await readJson();
  const open = all.find((row) =>
    !['Completed', 'Cancelled'].includes(row.status)
    && (codesMatch(row.employeeCode, input.employeeCode)
      || codesMatch(row.employeeId, input.employeeId)
      || codesMatch(row.employeeCode, input.employeeId)
      || codesMatch(row.employeeId, input.employeeCode)),
  );
  if (open) return open;
  // Do not surface cancelled drafts as active linked resignations.
  return null;
};

export const buildResignationPayload = async (input?: {
  period?: string;
  selectedId?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
}): Promise<ResignationPayload> => {
  const period = input?.period || currentResignationPeriod();
  const all = await readJson();
  const resignations = all
    .filter((row) => row.period === period)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const priorPeriod = previousResignationPeriod(period);
  const prior = priorPeriod ? all.filter((row) => row.period === priorPeriod) : [];

  let selectedId = input?.selectedId || null;
  if (!selectedId && (input?.employeeCode || input?.employeeId)) {
    const hit = resignations.find((row) =>
      codesMatch(row.employeeCode, input.employeeCode)
      || codesMatch(row.employeeId, input.employeeId)
      || codesMatch(row.employeeCode, input.employeeId),
    );
    selectedId = hit?.id || null;
  }
  if (!selectedId) selectedId = resignations[0]?.id || null;

  return {
    generatedAt: nowIso(),
    period,
    periodLabel: periodLabelFromCode(period),
    resignations,
    kpis: buildKpis(resignations, prior),
    tabCounts: tabCountsFor(resignations),
    selectedId,
    selected: resignations.find((row) => row.id === selectedId) || null,
    filterOptions: {
      departments: [...new Set(resignations.map((row) => row.department).filter(Boolean))].sort(),
      managers: [...new Set(resignations.map((row) => row.managerName).filter(Boolean))].sort(),
      statuses: ['Draft', 'Submitted', 'Manager Review', 'HR Review', 'Serving Notice', 'Handover', 'Clearance', 'Final Payroll', 'Completed', 'Cancelled', 'Exception'],
    },
  };
};

export const createResignation = async (input: {
  actor: string;
  period?: string;
  employeeCode: string;
  resignationDate?: string | null;
  lastWorkingDay?: string | null;
  noticePeriodDays?: number;
  reasonForLeaving?: string;
  remarks?: string;
  email?: string;
  phone?: string;
  alternativeEmail?: string;
  address?: string;
  nextOfKinName?: string;
  nextOfKinRelationship?: string;
  nextOfKinPhone?: string;
  nextOfKinEmail?: string;
  propertyAcknowledged?: boolean;
  submissionChannel?: string;
  /** When false, build in memory only — do not write JSON. */
  persist?: boolean;
}) => {
  const period = input.period || currentResignationPeriod();
  const code = compact(input.employeeCode).toUpperCase();
  if (!code) throw new Error('Employee code is required.');
  const persist = input.persist !== false;

  const all = await readJson();
  const open = all.find((row) =>
    row.period === period
    && codesMatch(row.employeeCode, code)
    && !['Completed', 'Cancelled'].includes(row.status),
  );
  const employee = await findEmployee(code);
  if (!employee) throw new Error(`Employee ${code} was not found.`);
  const pack = resolveEarningsPackage(employee, period);

  // Only reuse an existing open resignation when actually persisting.
  if (persist && open) {
    if (!open.earningsBreakdown?.length || !open.grossMonthly) {
      const index = all.findIndex((row) => row.id === open.id);
      const enriched: ResignationRecord = {
        ...open,
        grade: open.grade || pack.grade,
        currency: open.currency || pack.currency,
        basicSalary: open.basicSalary || pack.basicSalary,
        grossMonthly: open.grossMonthly || pack.grossMonthly,
        earningsBreakdown: open.earningsBreakdown?.length ? open.earningsBreakdown : pack.earningsBreakdown,
        updatedAt: nowIso(),
      };
      if (index >= 0) {
        all[index] = enriched;
        await writeJson(all);
      }
      return enriched;
    }
    return open;
  }

  const resignationDate = input.resignationDate || new Date().toISOString().slice(0, 10);
  const noticePeriodDays = Math.max(0, Number(input.noticePeriodDays || 30));
  const lastWorkingDay = input.lastWorkingDay
    || new Date(Date.UTC(
      Number(resignationDate.slice(0, 4)),
      Number(resignationDate.slice(5, 7)) - 1,
      Number(resignationDate.slice(8, 10)) + noticePeriodDays,
    )).toISOString().slice(0, 10);
  const progress = defaultProgress();
  const status: ResignationStatus = 'Draft';
  const referenceNumber = persist
    ? `RES-${period.replace('-', '')}-${String(all.filter((row) => row.period === period).length + 1).padStart(4, '0')}`
    : 'Auto-generated';

  const record: ResignationRecord = {
    id: persist ? `RES-${period.replace('-', '')}-${code}` : `PREVIEW-${code}`,
    referenceNumber,
    period,
    employeeId: employee.employeeId || code,
    employeeCode: employee.employeeCode || code,
    employeeName: employee.fullName || code,
    department: employee.department || '—',
    position: employee.jobTitle || '—',
    employmentType: employee.employmentType || '—',
    grade: pack.grade,
    managerName: employee.managerName || '—',
    hrReviewer: '—',
    workLocation: employee.location || '—',
    dateOfJoining: employee.contractStartDate || null,
    email: input.email || employee.officialEmail || employee.email || '',
    phone: input.phone || employee.primaryPhone || employee.phone || '',
    alternativeEmail: input.alternativeEmail || '',
    address: input.address || '',
    resignationDate,
    lastWorkingDay,
    noticePeriodDays,
    noticeServedDays: servedDays(resignationDate, lastWorkingDay),
    reasonForLeaving: input.reasonForLeaving || '',
    remarks: input.remarks || '',
    submissionChannel: input.submissionChannel || 'HRIS',
    submittedAt: null,
    status,
    clearancePct: clearancePctFromProgress(progress),
    finalPayrollStatus: 'Not Started',
    managementAcceptance: 'Pending',
    managementAcceptedAt: null,
    currency: pack.currency,
    basicSalary: pack.basicSalary,
    grossMonthly: pack.grossMonthly,
    earningsBreakdown: pack.earningsBreakdown,
    nextOfKinName: input.nextOfKinName || '',
    nextOfKinRelationship: input.nextOfKinRelationship || '',
    nextOfKinPhone: input.nextOfKinPhone || '',
    nextOfKinEmail: input.nextOfKinEmail || '',
    propertyAcknowledged: Boolean(input.propertyAcknowledged),
    progress,
    workflow: defaultWorkflow(status),
    comments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: input.actor,
    updatedBy: input.actor,
  };

  if (!persist) return record;

  // Replace any cancelled/draft leftovers for same employee+period.
  const next = all.filter((row) =>
    !(row.period === period && codesMatch(row.employeeCode, code) && ['Draft', 'Cancelled'].includes(row.status)),
  );
  next.push(record);
  await writeJson(next);
  return record;
};

export const previewResignation = async (input: Parameters<typeof createResignation>[0]) =>
  createResignation({ ...input, persist: false });


export const updateResignation = async (input: {
  id: string;
  actor: string;
  patch?: Partial<ResignationRecord>;
  action?: 'save' | 'submit' | 'accept' | 'next' | 'cancel' | 'clarify';
  comment?: string;
}) => {
  const all = await readJson();
  const index = all.findIndex((row) => row.id === input.id);
  if (index < 0) throw new Error('Resignation not found.');
  let row: ResignationRecord = { ...all[index], ...(input.patch || {}) };

  row.noticeServedDays = servedDays(row.resignationDate, row.lastWorkingDay);
  row.clearancePct = clearancePctFromProgress(row.progress || []);

  if (input.action === 'submit') {
    if (!row.propertyAcknowledged) throw new Error('Company property acknowledgement is required.');
    if (!row.resignationDate || !row.lastWorkingDay) throw new Error('Resignation date and last working day are required.');
    row.status = 'Manager Review';
    row.submittedAt = nowIso();
    row.workflow = defaultWorkflow(row.status, row.submittedAt);
  }
  if (input.action === 'accept') {
    row.managementAcceptance = 'Accepted';
    row.managementAcceptedAt = nowIso();
    row.status = 'Serving Notice';
    row.workflow = defaultWorkflow(row.status, row.submittedAt);
  }
  if (input.action === 'next') {
    const order: ResignationStatus[] = ['Draft', 'Submitted', 'Manager Review', 'HR Review', 'Serving Notice', 'Handover', 'Clearance', 'Final Payroll', 'Completed'];
    const at = order.indexOf(row.status);
    row.status = order[Math.min(order.length - 1, Math.max(0, at) + 1)];
    if (row.status === 'Handover') {
      row.progress = row.progress.map((item) => item.id === 'handover' ? { ...item, status: 'In Progress' } : item);
    }
    if (row.status === 'Clearance') {
      row.progress = row.progress.map((item) =>
        item.id === 'handover' ? { ...item, status: 'Completed' } : item.id === 'clearance' ? { ...item, status: 'In Progress' } : item,
      );
    }
    if (row.status === 'Final Payroll') {
      row.finalPayrollStatus = 'Pending';
      row.progress = row.progress.map((item) =>
        item.id === 'clearance' ? { ...item, status: 'Completed' } : item.id === 'payroll' ? { ...item, status: 'In Progress' } : item,
      );
    }
    if (row.status === 'Completed') {
      row.finalPayrollStatus = 'Paid';
      row.progress = row.progress.map((item) => ({ ...item, status: 'Completed' }));
    }
    row.clearancePct = clearancePctFromProgress(row.progress);
    row.workflow = defaultWorkflow(row.status, row.submittedAt);
  }
  if (input.action === 'cancel') {
    row.status = 'Cancelled';
    row.workflow = defaultWorkflow(row.status, row.submittedAt);
  }
  if (input.action === 'clarify') {
    row.status = 'Exception';
  }

  if (compact(input.comment)) {
    row.comments = [
      ...row.comments,
      { id: `cmt-${Date.now()}`, body: compact(input.comment), actor: input.actor, createdAt: nowIso() },
    ];
  }

  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJson(all);
  return row;
};

/** Update a progress track item and optionally advance resignation status. */
export const syncResignationProgressItem = async (input: {
  resignationId: string;
  actor: string;
  progressId: 'handover' | 'clearance' | 'asset' | 'payroll';
  progressStatus: ResignationProgressItem['status'];
  advanceStatusTo?: ResignationStatus;
}) => {
  const all = await readJson();
  const index = all.findIndex((row) => row.id === input.resignationId);
  if (index < 0) throw new Error('Resignation not found.');
  let row: ResignationRecord = { ...all[index] };
  row.progress = (row.progress || defaultProgress()).map((item) =>
    item.id === input.progressId ? { ...item, status: input.progressStatus } : item,
  );
  row.clearancePct = clearancePctFromProgress(row.progress);
  if (input.advanceStatusTo) {
    row.status = input.advanceStatusTo;
    if (input.advanceStatusTo === 'Final Payroll') {
      row.finalPayrollStatus = 'Pending';
    }
    row.workflow = defaultWorkflow(row.status, row.submittedAt);
  }
  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJson(all);
  return row;
};

export const resignationsToCsv = (rows: ResignationRecord[]) => {
  const header = [
    'Employee', 'Employee ID', 'Department', 'Position', 'Resignation Date', 'Last Working Day',
    'Notice Period Days', 'Notice Served Days', 'Clearance %', 'Final Payroll', 'Status',
  ];
  const lines = rows.map((row) => [
    row.employeeName,
    row.employeeCode,
    row.department,
    row.position,
    formatResignationDate(row.resignationDate),
    formatResignationDate(row.lastWorkingDay),
    row.noticePeriodDays,
    row.noticeServedDays,
    row.clearancePct,
    row.finalPayrollStatus,
    row.status,
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
};
