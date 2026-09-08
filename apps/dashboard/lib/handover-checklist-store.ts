/**
 * Handover Checklist store — JSON under data/hris, synced from resignations.
 * Server-only. Client UIs import handover-checklist-shared.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type HandoverCase,
  type HandoverCaseStatus,
  type HandoverChecklistItem,
  type HandoverPayload,
  type OffboardingModuleKpi,
  DEFAULT_HANDOVER_ITEMS,
  handoverCompletionPct,
} from '@/lib/handover-checklist-shared';
import {
  currentResignationPeriod,
  periodLabelFromCode,
  type ResignationRecord,
} from '@/lib/resignation-management-shared';
import {
  listResignations,
  syncResignationProgressItem,
} from '@/lib/resignation-management-store';

export type { HandoverCase, HandoverPayload } from '@/lib/handover-checklist-shared';
export { currentResignationPeriod as currentHandoverPeriod, periodLabelFromCode } from '@/lib/resignation-management-shared';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'));
const FILE_PATH = path.join(DATA_DIR, 'handover-checklist.json');

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

const readJson = async (): Promise<HandoverCase[]> => {
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeJson = async (rows: HandoverCase[]) => {
  await ensureDir();
  await writeFile(FILE_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
};

const defaultItems = (): HandoverChecklistItem[] =>
  DEFAULT_HANDOVER_ITEMS.map((item) => ({ ...item, status: 'Pending' as const }));

const deriveStatus = (pct: number, items: HandoverChecklistItem[]): HandoverCaseStatus => {
  if (items.some((item) => item.status === 'In Progress') || (pct > 0 && pct < 100)) return 'In Progress';
  if (pct >= 100) return 'Completed';
  return 'Not Started';
};

const fromResignation = (row: ResignationRecord, actor: string, existing?: HandoverCase | null): HandoverCase => {
  const items = existing?.items?.length ? existing.items : defaultItems();
  const completionPct = handoverCompletionPct(items);
  return {
    id: existing?.id || `HO-${row.id}`,
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
    status: existing?.status === 'Blocked' ? 'Blocked' : deriveStatus(completionPct, items),
    completionPct,
    items,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: actor,
  };
};

const eligibleResignation = (row: ResignationRecord) =>
  ['Handover', 'Clearance', 'Final Payroll', 'Completed', 'Serving Notice'].includes(row.status);

/** Sync handover cases from resignations for the period. */
export const syncHandoverFromResignations = async (period?: string, actor = 'System') => {
  const periodCode = period || currentResignationPeriod();
  const resignations = (await listResignations(periodCode)).filter(eligibleResignation);
  const all = await readJson();
  const byResignation = new Map(all.filter((row) => row.period === periodCode).map((row) => [row.resignationId, row]));
  const nextPeriodRows = resignations.map((row) => fromResignation(row, actor, byResignation.get(row.id) || null));
  const others = all.filter((row) => row.period !== periodCode);
  const merged = [...others, ...nextPeriodRows];
  await writeJson(merged);
  return nextPeriodRows;
};

const buildKpis = (cases: HandoverCase[]): OffboardingModuleKpi[] => {
  const inProgress = cases.filter((row) => row.status === 'In Progress').length;
  const completed = cases.filter((row) => row.status === 'Completed').length;
  const notStarted = cases.filter((row) => row.status === 'Not Started').length;
  const blocked = cases.filter((row) => row.status === 'Blocked').length;
  const avg = cases.length
    ? Math.round(cases.reduce((sum, row) => sum + row.completionPct, 0) / cases.length)
    : 0;
  return [
    { id: 'total', label: 'Active Handovers', value: cases.length, display: String(cases.length), deltaLabel: 'This period', tone: 'blue' },
    { id: 'pending', label: 'Not Started', value: notStarted, display: String(notStarted), deltaLabel: 'Awaiting kickoff', tone: 'amber' },
    { id: 'progress', label: 'In Progress', value: inProgress, display: String(inProgress), deltaLabel: 'Checklist open', tone: 'purple' },
    { id: 'done', label: 'Completed', value: completed, display: String(completed), deltaLabel: 'Ready for clearance', tone: 'green' },
    { id: 'blocked', label: 'Blocked', value: blocked, display: String(blocked), deltaLabel: 'Needs attention', tone: 'rose' },
    { id: 'avg', label: 'Avg Completion', value: avg, display: `${avg}%`, deltaLabel: 'Across cases', tone: 'mint' },
  ];
};

const tabCountsFor = (cases: HandoverCase[]) => {
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

export const buildHandoverPayload = async (input?: {
  period?: string;
  selectedId?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  actor?: string;
}): Promise<HandoverPayload> => {
  const period = input?.period || currentResignationPeriod();
  const cases = await syncHandoverFromResignations(period, input?.actor || 'System');
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

export const updateHandoverCase = async (input: {
  id: string;
  actor: string;
  itemId?: string;
  itemStatus?: HandoverChecklistItem['status'];
  action?: 'save' | 'complete' | 'block' | 'reopen';
  note?: string;
}) => {
  const all = await readJson();
  const index = all.findIndex((row) => row.id === input.id);
  if (index < 0) throw new Error('Handover case not found.');
  let row: HandoverCase = { ...all[index], items: [...all[index].items] };

  if (input.itemId && input.itemStatus) {
    row.items = row.items.map((item) =>
      item.id === input.itemId
        ? { ...item, status: input.itemStatus!, note: input.note ?? item.note }
        : item,
    );
  }

  if (input.action === 'complete') {
    row.items = row.items.map((item) => ({ ...item, status: 'Completed' }));
  }
  if (input.action === 'block') row.status = 'Blocked';
  if (input.action === 'reopen') {
    row.status = 'In Progress';
    if (row.items.every((item) => item.status === 'Completed')) {
      row.items = row.items.map((item, i) => (i === 0 ? { ...item, status: 'In Progress' } : item));
    }
  }

  row.completionPct = handoverCompletionPct(row.items);
  if (row.status !== 'Blocked') row.status = deriveStatus(row.completionPct, row.items);
  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJson(all);

  const progressStatus = row.status === 'Completed' ? 'Completed' : row.status === 'Not Started' ? 'Not Started' : 'In Progress';
  await syncResignationProgressItem({
    resignationId: row.resignationId,
    actor: input.actor,
    progressId: 'handover',
    progressStatus,
    advanceStatusTo: input.action === 'complete' || row.status === 'Completed' ? 'Clearance' : undefined,
  });

  return row;
};

export const handoversToCsv = (rows: HandoverCase[]) => {
  const header = ['Employee', 'Employee ID', 'Department', 'Position', 'Last Working Day', 'Completion %', 'Status', 'Resignation'];
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
