import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';
import { readPayrollEmployees } from './payroll-employee-source';

export type ConfirmationRisk = 'Low' | 'Medium' | 'High';
export type ConfirmationStage = 'Probation Active' | 'Due Soon' | 'Overdue' | 'Confirmed' | 'Review Required';
export type ConfirmationReadiness = 'Ready' | 'Needs Review' | 'Incomplete';

export type ConfirmationOutcomeDecision = 'Confirm' | 'Extend' | 'Do Not Confirm';

export type ConfirmationOutcomeRecord = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  decision: ConfirmationOutcomeDecision;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  probationEndDate?: string;
  source: string;
  /** Outcomes never auto-terminate employment — status sink only. */
  autoTerminate: false;
};

export type EmployeeConfirmationRecord = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  division: string;
  businessUnit: string;
  location: string;
  managerName: string;
  hrBusinessPartner: string;
  employmentType: string;
  currentStatus: string;
  dateJoined: string | null;
  probationStartDate: string | null;
  probationEndDate: string | null;
  confirmationDueDate: string | null;
  daysToConfirmation: number | null;
  daysOverdue: number | null;
  stage: ConfirmationStage;
  readiness: ConfirmationReadiness;
  confirmationStatus: 'Pending' | 'Confirmed' | 'Not Applicable' | 'Review Required';
  documentsStatus: 'Missing' | 'Partial' | 'Complete';
  managerAssigned: boolean;
  serviceYears: number;
  risk: ConfirmationRisk;
  riskReason: string;
  lastUpdated: string;
};

export type EmployeeConfirmationPayload = {
  generatedAt: string;
  source: string;
  records: EmployeeConfirmationRecord[];
  summary: {
    totalMonitored: number;
    probationActive: number;
    dueSoon: number;
    overdue: number;
    confirmed: number;
    ready: number;
    incomplete: number;
    highRisk: number;
  };
  filterOptions: {
    departments: string[];
    locations: string[];
    stages: ConfirmationStage[];
    risks: ConfirmationRisk[];
    readiness: ConfirmationReadiness[];
  };
  insights: Array<{ id: string; tone: ConfirmationRisk; title: string; detail: string }>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const OUTCOMES_CANDIDATES = [
  path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris'),
  path.join(process.cwd(), 'data', 'hris'),
];

const resolveOutcomesPath = async () => {
  for (const dir of OUTCOMES_CANDIDATES) {
    const file = path.join(dir, 'confirmation-outcomes.json');
    try {
      await access(file);
      return { dir, file };
    } catch {
      /* continue */
    }
  }
  const dir = OUTCOMES_CANDIDATES[0];
  await mkdir(dir, { recursive: true });
  return { dir, file: path.join(dir, 'confirmation-outcomes.json') };
};

const dateOnly = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const deriveRecord = (row: DleEmployeeDirectoryRow, now: Date): EmployeeConfirmationRecord | null => {
  const status = row.status || 'Inactive';
  const statusLower = status.toLowerCase();
  const confirmationDueDate = dateOnly(row.confirmationDueDate);
  const probationEndDate = dateOnly(row.probationEndDate);
  const probationStartDate = dateOnly(row.probationStartDate);
  const dueDate = confirmationDueDate || probationEndDate;
  const due = dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null;
  const days = due ? daysBetween(now, due) : null;
  const isConfirmed = statusLower === 'confirmed';
  const isProbation = statusLower === 'probation' || Boolean(probationStartDate || probationEndDate || confirmationDueDate);
  const shouldMonitor = isProbation || isConfirmed || (days !== null && days <= 90);

  if (!shouldMonitor) return null;

  const daysToConfirmation = days !== null && days >= 0 ? days : null;
  const daysOverdue = days !== null && days < 0 ? Math.abs(days) : null;

  let documentsStatus: EmployeeConfirmationRecord['documentsStatus'] = 'Missing';
  if (row.documentCount >= 3) documentsStatus = 'Complete';
  else if (row.documentCount > 0) documentsStatus = 'Partial';

  let readiness: ConfirmationReadiness = 'Ready';
  if (!row.hasManagerAssigned || documentsStatus === 'Missing' || !dueDate) readiness = 'Incomplete';
  else if (documentsStatus === 'Partial' || !row.hrBusinessPartner) readiness = 'Needs Review';

  let stage: ConfirmationStage = 'Probation Active';
  if (isConfirmed) stage = 'Confirmed';
  else if (daysOverdue !== null) stage = 'Overdue';
  else if (daysToConfirmation !== null && daysToConfirmation <= 30) stage = 'Due Soon';
  else if (readiness !== 'Ready') stage = 'Review Required';

  const confirmationStatus = isConfirmed ? 'Confirmed' : isProbation ? 'Pending' : readiness === 'Incomplete' ? 'Review Required' : 'Not Applicable';

  let risk: ConfirmationRisk = 'Low';
  let riskReason = 'Confirmation record is within expected review controls.';
  if (!isConfirmed && (daysOverdue !== null || readiness === 'Incomplete')) {
    risk = 'High';
    riskReason = daysOverdue !== null ? 'Confirmation is overdue.' : 'Required confirmation evidence is incomplete.';
  } else if (!isConfirmed && (daysToConfirmation !== null && daysToConfirmation <= 30 || readiness === 'Needs Review')) {
    risk = 'Medium';
    riskReason = daysToConfirmation !== null && daysToConfirmation <= 30 ? 'Confirmation is due within 30 days.' : 'Record needs HR or manager review.';
  }

  return {
    id: row.employeeId,
    employeeId: row.employeeId,
    employeeCode: row.employeeCode,
    employeeName: row.fullName,
    jobTitle: row.jobTitle,
    department: row.department,
    division: row.division,
    businessUnit: row.businessUnit,
    location: row.location,
    managerName: row.managerName || 'Not assigned',
    hrBusinessPartner: row.hrBusinessPartner || 'Not assigned',
    employmentType: row.employmentType,
    currentStatus: status,
    dateJoined: dateOnly(row.dateJoined),
    probationStartDate,
    probationEndDate,
    confirmationDueDate,
    daysToConfirmation,
    daysOverdue,
    stage,
    readiness,
    confirmationStatus,
    documentsStatus,
    managerAssigned: row.hasManagerAssigned,
    serviceYears: row.yearsOfService,
    risk,
    riskReason,
    lastUpdated: row.modifiedAt || row.createdAt,
  };
};

export const readEmployeeConfirmationFromDb = async (): Promise<EmployeeConfirmationPayload> => {
  const now = new Date();
  const employeeSource = await readPayrollEmployees();
  const employees = employeeSource.employees;
  const records = employees
    .map((row) => deriveRecord(row, now))
    .filter((row): row is EmployeeConfirmationRecord => Boolean(row))
    .sort((a, b) => {
      const riskWeight: Record<ConfirmationRisk, number> = { High: 0, Medium: 1, Low: 2 };
      const byRisk = riskWeight[a.risk] - riskWeight[b.risk];
      if (byRisk !== 0) return byRisk;
      return (a.confirmationDueDate || a.probationEndDate || '9999-12-31').localeCompare(b.confirmationDueDate || b.probationEndDate || '9999-12-31');
    });

  const summary = {
    totalMonitored: records.length,
    probationActive: records.filter((r) => r.stage === 'Probation Active').length,
    dueSoon: records.filter((r) => r.stage === 'Due Soon').length,
    overdue: records.filter((r) => r.stage === 'Overdue').length,
    confirmed: records.filter((r) => r.stage === 'Confirmed').length,
    ready: records.filter((r) => r.readiness === 'Ready').length,
    incomplete: records.filter((r) => r.readiness === 'Incomplete').length,
    highRisk: records.filter((r) => r.risk === 'High').length,
  };

  const insights: EmployeeConfirmationPayload['insights'] = [];
  if (summary.overdue > 0) {
    insights.push({
      id: 'overdue',
      tone: 'High',
      title: `${summary.overdue} confirmation${summary.overdue === 1 ? '' : 's'} overdue`,
      detail: 'Prioritise overdue probation outcomes and route approval decisions through employee status.',
    });
  }
  if (summary.incomplete > 0) {
    insights.push({
      id: 'incomplete',
      tone: 'High',
      title: `${summary.incomplete} record${summary.incomplete === 1 ? '' : 's'} missing confirmation controls`,
      detail: 'Manager assignment, documents, and due dates should be complete before confirmation approval.',
    });
  }
  if (summary.dueSoon > 0) {
    insights.push({
      id: 'due-soon',
      tone: 'Medium',
      title: `${summary.dueSoon} confirmation${summary.dueSoon === 1 ? '' : 's'} due within 30 days`,
      detail: 'Start manager assessment and HR review before the confirmation date.',
    });
  }
  if (insights.length === 0) {
    insights.push({
      id: 'stable',
      tone: 'Low',
      title: 'No urgent confirmation exceptions detected',
      detail: 'Current probation and confirmation records are within normal control thresholds.',
    });
  }

  return {
    generatedAt: now.toISOString(),
    source: employeeSource.source,
    records,
    summary,
    filterOptions: {
      departments: uniqueSorted(records.map((r) => r.department)),
      locations: uniqueSorted(records.map((r) => r.location)),
      stages: ['Probation Active', 'Due Soon', 'Overdue', 'Confirmed', 'Review Required'],
      risks: ['High', 'Medium', 'Low'],
      readiness: ['Ready', 'Needs Review', 'Incomplete'],
    },
    insights,
  };
};

const readOutcomesFile = async (): Promise<ConfirmationOutcomeRecord[]> => {
  try {
    const { file } = await resolveOutcomesPath();
    await access(file);
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as { outcomes?: ConfirmationOutcomeRecord[] };
    return Array.isArray(parsed.outcomes) ? parsed.outcomes : [];
  } catch {
    return [];
  }
};

/** Persist PM / HR confirmation decisions without mutating payroll employment status. */
export const recordConfirmationOutcome = async (input: {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  decision: ConfirmationOutcomeDecision;
  reason: string;
  decidedBy: string;
  decidedAt?: string;
  probationEndDate?: string;
  source?: string;
}): Promise<ConfirmationOutcomeRecord> => {
  const { dir, file } = await resolveOutcomesPath();
  await mkdir(dir, { recursive: true });
  const outcomes = await readOutcomesFile();
  const record: ConfirmationOutcomeRecord = {
    id: `conf-out-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    employeeId: input.employeeId,
    employeeCode: input.employeeCode,
    employeeName: input.employeeName,
    decision: input.decision,
    reason: input.reason,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt || new Date().toISOString(),
    probationEndDate: input.probationEndDate,
    source: input.source || 'performance-management',
    autoTerminate: false,
  };
  outcomes.unshift(record);
  await writeFile(file, JSON.stringify({ updatedAt: new Date().toISOString(), outcomes: outcomes.slice(0, 2000) }, null, 2), 'utf8');
  return record;
};

export const listConfirmationOutcomes = async () => readOutcomesFile();
