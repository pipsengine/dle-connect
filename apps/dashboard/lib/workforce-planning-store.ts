import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type WorkforceRequestType = 'Add Headcount' | 'Backfill Gap' | 'Temporary Coverage' | 'Structure Review';
export type WorkforceRequestStatus = 'Submitted' | 'Under Review' | 'Approved' | 'Declined';

export type WorkforcePlanningRequestRecord = {
  id: string;
  planId: string;
  businessUnit: string;
  department: string;
  location: string;
  requestType: WorkforceRequestType;
  requestedFte: number;
  targetQuarter: string;
  requestedBy: string;
  justification: string;
  impactSummary: string;
  projectedApprovedFte: number;
  projectedFilledFte: number;
  projectedGapFte: number;
  incrementalBudgetUsd: number;
  status: WorkforceRequestStatus;
  createdAt: string;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'hris');
const FILE_PATH = path.join(DATA_DIR, 'workforce-planning-requests.json');

const ensureStore = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await access(FILE_PATH);
  } catch {
    await writeFile(FILE_PATH, JSON.stringify([], null, 2), 'utf8');
  }
};

export const readWorkforcePlanningRequests = async (): Promise<WorkforcePlanningRequestRecord[]> => {
  await ensureStore();
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as WorkforcePlanningRequestRecord[];
  } catch {
    // Fall back to an empty request queue if the file is missing or malformed.
  }

  await writeFile(FILE_PATH, JSON.stringify([], null, 2), 'utf8');
  return [];
};

export const writeWorkforcePlanningRequests = async (requests: WorkforcePlanningRequestRecord[]) => {
  await ensureStore();
  await writeFile(FILE_PATH, JSON.stringify(requests, null, 2), 'utf8');
};
