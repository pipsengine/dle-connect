/**
 * Asset Return store — JSON under data/hris, synced from resignations.
 * Server-only. Client UIs import asset-return-shared.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type AssetReturnCase,
  type AssetReturnCaseStatus,
  type AssetReturnLine,
  type AssetReturnPayload,
  type OffboardingModuleKpi,
  DEFAULT_ASSET_LINES,
  assetOutstandingCount,
  assetReturnPct,
} from '@/lib/asset-return-shared';
import {
  currentResignationPeriod,
  periodLabelFromCode,
  type ResignationRecord,
} from '@/lib/resignation-management-shared';
import {
  listResignations,
  syncResignationProgressItem,
} from '@/lib/resignation-management-store';

export type { AssetReturnCase, AssetReturnPayload } from '@/lib/asset-return-shared';
export { currentResignationPeriod as currentAssetReturnPeriod, periodLabelFromCode } from '@/lib/resignation-management-shared';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(process.env.DLE_HRIS_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'hris'));
const FILE_PATH = path.join(DATA_DIR, 'asset-return.json');

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

const readJson = async (): Promise<AssetReturnCase[]> => {
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeJson = async (rows: AssetReturnCase[]) => {
  await ensureDir();
  await writeFile(FILE_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
};

const defaultAssets = (employeeCode: string): AssetReturnLine[] =>
  DEFAULT_ASSET_LINES.map((item) => ({
    ...item,
    tagOrSerial: item.tagOrSerial === 'TBD' ? `${employeeCode}-${item.id.toUpperCase()}` : item.tagOrSerial,
    status: 'Outstanding' as const,
    returnedAt: null,
    returnedBy: null,
  }));

const deriveStatus = (pct: number, assets: AssetReturnLine[]): AssetReturnCaseStatus => {
  if (pct >= 100) return 'Completed';
  if (pct > 0 || assets.some((item) => item.status !== 'Outstanding')) return 'In Progress';
  return 'Not Started';
};

const fromResignation = (row: ResignationRecord, actor: string, existing?: AssetReturnCase | null): AssetReturnCase => {
  const assets = existing?.assets?.length ? existing.assets : defaultAssets(row.employeeCode);
  const completionPct = assetReturnPct(assets);
  return {
    id: existing?.id || `AST-${row.id}`,
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
    status: existing?.status === 'Blocked' && completionPct < 100 ? 'Blocked' : deriveStatus(completionPct, assets),
    completionPct,
    outstandingCount: assetOutstandingCount(assets),
    assets,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: actor,
  };
};

const eligibleResignation = (row: ResignationRecord) =>
  ['Clearance', 'Final Payroll', 'Completed', 'Handover'].includes(row.status);

export const syncAssetReturnFromResignations = async (period?: string, actor = 'System') => {
  const periodCode = period || currentResignationPeriod();
  const resignations = (await listResignations(periodCode)).filter(eligibleResignation);
  const all = await readJson();
  const byResignation = new Map(all.filter((row) => row.period === periodCode).map((row) => [row.resignationId, row]));
  const nextPeriodRows = resignations.map((row) => fromResignation(row, actor, byResignation.get(row.id) || null));
  const others = all.filter((row) => row.period !== periodCode);
  await writeJson([...others, ...nextPeriodRows]);
  return nextPeriodRows;
};

const buildKpis = (cases: AssetReturnCase[]): OffboardingModuleKpi[] => {
  const inProgress = cases.filter((row) => row.status === 'In Progress').length;
  const completed = cases.filter((row) => row.status === 'Completed').length;
  const notStarted = cases.filter((row) => row.status === 'Not Started').length;
  const outstanding = cases.reduce((sum, row) => sum + row.outstandingCount, 0);
  const avg = cases.length
    ? Math.round(cases.reduce((sum, row) => sum + row.completionPct, 0) / cases.length)
    : 0;
  return [
    { id: 'total', label: 'Asset Cases', value: cases.length, display: String(cases.length), deltaLabel: 'This period', tone: 'blue' },
    { id: 'pending', label: 'Not Started', value: notStarted, display: String(notStarted), deltaLabel: 'Awaiting return', tone: 'amber' },
    { id: 'progress', label: 'In Progress', value: inProgress, display: String(inProgress), deltaLabel: 'Partial returns', tone: 'purple' },
    { id: 'done', label: 'Completed', value: completed, display: String(completed), deltaLabel: 'All closed', tone: 'green' },
    { id: 'out', label: 'Outstanding Items', value: outstanding, display: String(outstanding), deltaLabel: 'Across cases', tone: 'rose' },
    { id: 'avg', label: 'Avg Returned', value: avg, display: `${avg}%`, deltaLabel: 'Across cases', tone: 'mint' },
  ];
};

const tabCountsFor = (cases: AssetReturnCase[]) => {
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

export const buildAssetReturnPayload = async (input?: {
  period?: string;
  selectedId?: string | null;
  employeeCode?: string | null;
  employeeId?: string | null;
  actor?: string;
}): Promise<AssetReturnPayload> => {
  const period = input?.period || currentResignationPeriod();
  const cases = await syncAssetReturnFromResignations(period, input?.actor || 'System');
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

export const updateAssetReturnCase = async (input: {
  id: string;
  actor: string;
  assetId?: string;
  assetStatus?: AssetReturnLine['status'];
  action?: 'save' | 'complete' | 'block' | 'reopen';
  note?: string;
  tagOrSerial?: string;
  condition?: string;
}) => {
  const all = await readJson();
  const index = all.findIndex((row) => row.id === input.id);
  if (index < 0) throw new Error('Asset return case not found.');
  let row: AssetReturnCase = { ...all[index], assets: [...all[index].assets] };

  if (input.assetId && input.assetStatus) {
    row.assets = row.assets.map((asset) => {
      if (asset.id !== input.assetId) return asset;
      const closed = input.assetStatus !== 'Outstanding';
      return {
        ...asset,
        status: input.assetStatus!,
        note: input.note ?? asset.note,
        tagOrSerial: input.tagOrSerial ?? asset.tagOrSerial,
        condition: input.condition ?? asset.condition,
        returnedAt: closed ? nowIso() : null,
        returnedBy: closed ? input.actor : null,
      };
    });
  }

  if (input.action === 'complete') {
    row.assets = row.assets.map((asset) => ({
      ...asset,
      status: asset.status === 'Outstanding' ? 'Returned' : asset.status,
      returnedAt: asset.returnedAt || nowIso(),
      returnedBy: asset.returnedBy || input.actor,
    }));
  }
  if (input.action === 'block') row.status = 'Blocked';
  if (input.action === 'reopen') row.status = 'In Progress';

  row.completionPct = assetReturnPct(row.assets);
  row.outstandingCount = assetOutstandingCount(row.assets);
  if (input.action !== 'block') row.status = deriveStatus(row.completionPct, row.assets);
  row.updatedAt = nowIso();
  row.updatedBy = input.actor;
  all[index] = row;
  await writeJson(all);

  const progressStatus = row.status === 'Completed' ? 'Completed' : row.status === 'Not Started' ? 'Not Started' : 'In Progress';
  await syncResignationProgressItem({
    resignationId: row.resignationId,
    actor: input.actor,
    progressId: 'asset',
    progressStatus,
  });

  return row;
};

export const assetReturnsToCsv = (rows: AssetReturnCase[]) => {
  const header = ['Employee', 'Employee ID', 'Department', 'Outstanding', 'Completion %', 'Status', 'Resignation'];
  const lines = rows.map((row) => [
    row.employeeName,
    row.employeeCode,
    row.department,
    row.outstandingCount,
    row.completionPct,
    row.status,
    row.resignationReference,
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
};
