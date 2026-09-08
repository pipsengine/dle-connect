/**
 * Exit Clearance store — JSON under data/hris, synced from resignations.
 * Server-only. Client UIs import exit-clearance-shared.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type ExitClearanceCase,
  type ExitClearanceCaseStatus,
  type ExitClearanceLine,
  type ExitClearancePayload,
  type OffboardingModuleKpi,
  DEFAULT_CLEARANCE_LINES,
  exitClearancePct,
} from '@/lib/exit-clearance-shared';
import {
  currentResignationPeriod,
  periodLabelFromCode,
  type ResignationRecord,
} from '@/lib/resignation-management-shared';
import {
  listResignations,
  syncResignationProgressItem,
} from '@/lib/resignation-management-store';

export type { ExitClearanceCase, ExitClearancePayload } from '@/lib/exit-clearance-shared';
export { currentResignationPeriod as currentExitClearancePeriod, periodLabelFromCode } from '@/lib/resignation-management-shared';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'));
const FILE_PATH = path.join(DATA_DIR, 'exit-clearance.json');

const compact = (value: unknown) => String(value || '').trim();
const nowIso = () => new Date().toISOString();

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = compact(left).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const b = compact(right).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a || !b) return false;
  return a === b || a.replace(/^P/, '') === b.replace(/^P/, '');
};

const ensureDir = async () => {
  await mkdir(DATA_DIR, { recursive: true });
};

const readJson = async (): Promise<ExitClearanceCase[]> => {
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeJson = async (rows: ExitClearanceCase[]) => {
  await ensureDir();
  await writeFile(FILE_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
};

const defaultLines = (): ExitClearanceLine[] =>
  DEFAULT_CLEARANCE_LINES.map((line) => ({
    ...line,
    status: 'Pending' as const,
    clearedAt: null,
    clearedBy: null,
  }));

const deriveStatus = (pct: number, lines: ExitClearanceLine[]): ExitClearanceCaseStatus => {
  if (lines.some((line) => line.status === 'Blocked')) return 'Blocked';
  if (pct >= 100) return 'Completed';
  if (pct > 0 || lines.some((line) => line.status === 'In Progress' || line.status === 'Cleared')) return 'In Progress';
  return 'Not Started';
};

const fromResignation = (row: ResignationRecord, actor: string, existing?: ExitClearanceCase | null): ExitClearanceCase => {
  const lines = existing?.lines?.length ? existing.lines : defaultLines();
  const completionPct = exitClearancePct(lines);
  return {
    id: existing?.id || `CLR-${row.id}`,
    period: row.period,
    resignationId: row.id,
    resignationReference: row.referenceNumber,
    employeeId: row.employeeId,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    department: row.department,
    position: row.position,
    managerName: row.managerName,
    resignationDate: row.resignationDate,
    lastWorkingDay: row.lastWorkingDay,
    resignationStatus: row.status,
    status: existing?.status === 'Blocked' && completionPct < 100 ? 'Blocked' : deriveStatus(completionPct, lines),
    completionPct,
    lines,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: actor,
  };
};

const eligibleResignation = (row: ResignationRecord) =>
  ['Clearance', 'Final Payroll', 'Completed', 'Handover'].includes(row.status);

export const syncExitClearanceFromResignations = async (period?: string, actor = 'System') => {
  const periodCode = period || currentResignationPeriod();
  const resignations = (await listResignations(periodCode)).filter(eligibleResignation);
  const all = await readJson();
  const byResignation = new Map(all.filter((row) => row.period === periodCode).map((row) => [row.resignationId, row]));
  const nextPeriodRows = resignations.map((row) => fromResignation(row, actor, byResignation.get(row.id) || null));
  const others = all.filter((row) => row.period !== periodCode);
  await writeJson([...others, ...nextPeriodRows]);
  return nextPeriodRows;
};

const buildKpis = (cases: ExitClearanceCase[]): OffboardingModuleKpi[] => {
  const inProgress = cases.filter((row) => row.status === 'In Progress').length;
  const completed = cases.filter((row) => row.status === 'Completed').length;
  const notStarted = cases.filter((row) => row.status === 'Not Started').length;
  const blocked = cases.filter((row) => row.status === 'Blocked').length;
  const avg = cases.length
    ? Math.round(cases.reduce((sum, row) => sum + row.completionPct, 0) / cases.length)
    : 0;
  return [
    { id: 'total', label: 'Active Clearances', value: cases.length, display: String(cases.length), deltaLabel: 'This period', tone: 'blue' },
    { id: 'pending', label: 'Not Started', value: notStarted, display: String(notStarted), deltaLabel: 'Awaiting departments', tone: 'amber' },
    { id: 'progress', label: 'In Progress', value: inProgress, display: String(inProgress), deltaLabel: 'Depts clearing', tone: 'purple' },
    { id: 'done', label: 'Completed', value: completed, display: String(completed), deltaLabel: 'Ready for payroll', tone: 'green' },
    { id: 'blocked', label: 'Blocked', value: blocked, display: String(blocked), deltaLabel: 'Exceptions', tone: 'rose' },
    { id: 'avg', label: 'Avg Clearance', value: avg, display: `${avg}%`, deltaLabel: 'Across cases', tone: 'mint' },
  ];
};

const tabCountsFor = (cases: ExitClearanceCase[]) => {
  const counts: Record<string, number> = {
    All: cases.length,
    'Not Started': 0,
    'In Progress': 0,
    Completed: 0,
    Blocked: 0,
  };
  for (const row of cases) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  return counts;
};

export const buildExitClearancePayload = async (input?: {
  period?: string;
  selectedId?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  actor?: string;
}): Promise<ExitClearancePayload> => {
  const period = input?.period || currentResignationPeriod();
  const cases = await syncExitClearanceFromResignations(period, input?.actor || 'System');
  cases.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  let selectedId = input?.selectedId || null;
  if (!selectedId && (input?.employeeCode || input?.employeeId)) {
    const hit = cases.find((row) =>
      codesMatch(row.employeeCode, input.employeeCode)
      || codesMatch(row.employeeId, input.employeeId)
      || codesMatch(row.employeeCode, input.employeeId),
    );
    selectedId = hit?.id || null;
  }
  if (!selectedId) selectedId = cases[0]?.id || null;

  return {
    generatedAt: nowIso(),
    period,
    periodLabel: periodLabelFromCode(period),
    cases,
    kpis: buildKpis(cases),
    tabCounts: tabCountsFor(cases),
    selectedId,
    selected: cases.find((row) => row.id === selectedId) || null,
    filterOptions: {
      departments: [...new Set(cases.map((row) => row.department).filter(Boolean))].sort(),
      statuses: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
    },
  };
};

export const updateExitClearanceCase = async (input: {
  id: string;
  actor: string;
  lineId?: string;
  lineStatus?: ExitClearanceLine['status'];
  action?: 'save' | 'complete' | 'block' | 'reopen';
  note?: string;
}) => {
  const all = await readJson();
  const index = all.findIndex((row) => row.id === input.id);
  if (index < 0) throw new Error('Exit clearance case not found.');
  let row: ExitClearanceCase = { ...all[index], lines: [...all[index].lines] };

  if (input.lineId && input.lineStatus) {
    row.lines = row.lines.map((line) => {
      if (line.id !== input.lineId) return line;
      const cleared = input.lineStatus === 'Cleared';
      return {
        ...line,
        status: input.lineStatus!,
        note: input.note ?? line.note,
        clearedAt: cleared ? nowIso() : null,
        clearedBy: cleared ? input.actor : null,
      };
    });
  }

  if (input.action === 'complete') {
    row.lines = row.lines.map((line) => ({
      ...line,
      status: 'Cleared',
      clearedAt: line.clearedAt || nowIso(),
      clearedBy: line.clearedBy || input.actor,
    }));
  }
  if (input.action === 'block') row.status = 'Blocked';
  if (input.action === 'reopen') row.status = 'In Progress';

  row.completionPct = exitClearancePct(row.lines);
  if (input.action !== 'block') row.status = deriveStatus(row.completionPct, row.lines);
  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJson(all);

  const progressStatus = row.status === 'Completed' ? 'Completed' : row.status === 'Not Started' ? 'Not Started' : 'In Progress';
  await syncResignationProgressItem({
    resignationId: row.resignationId,
    actor: input.actor,
    progressId: 'clearance',
    progressStatus,
    advanceStatusTo: input.action === 'complete' || row.status === 'Completed' ? 'Final Payroll' : undefined,
  });

  return row;
};

export const exitClearancesToCsv = (rows: ExitClearanceCase[]) => {
  const header = ['Employee', 'Employee ID', 'Department', 'Position', 'Last Working Day', 'Clearance %', 'Status', 'Resignation'];
  const lines = rows.map((row) => [
    row.employeeName,
    row.employeeCode,
    row.department,
    row.position,
    row.lastWorkingDay || '',
    row.completionPct,
    row.status,
    row.resignationReference,
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
};
