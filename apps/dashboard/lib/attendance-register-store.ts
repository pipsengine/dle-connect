import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type RegisterReviewStatus = 'Pending Review' | 'Verified' | 'Flagged' | 'Locked';

export type AttendanceRegisterControl = {
  id: string;
  employeeId: string;
  reviewStatus: RegisterReviewStatus;
  verifiedBy: string;
  payrollReady: boolean;
  note: string | null;
  reviewedAt: string;
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'hris');
const FILE_PATH = path.join(DATA_DIR, 'attendance-register.json');

const defaultControls: AttendanceRegisterControl[] = [];

const ensureStore = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await access(FILE_PATH);
  } catch {
    await writeFile(FILE_PATH, JSON.stringify(defaultControls, null, 2), 'utf8');
  }
};

export const readAttendanceRegisterControls = async (): Promise<AttendanceRegisterControl[]> => {
  await ensureStore();
  let stored: AttendanceRegisterControl[] = [];
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) stored = parsed as AttendanceRegisterControl[];
  } catch {
    stored = [];
  }

  const storedById = new Map(stored.map((item) => [item.id, item]));
  const merged = defaultControls.map((item) => ({ ...item, ...(storedById.get(item.id) || {}), id: item.id, employeeId: item.employeeId }));
  const extras = stored.filter((item) => !merged.some((mergedItem) => mergedItem.id === item.id));
  const next = [...merged, ...extras];
  await writeFile(FILE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

export const writeAttendanceRegisterControls = async (controls: AttendanceRegisterControl[]) => {
  await ensureStore();
  await writeFile(FILE_PATH, JSON.stringify(controls, null, 2), 'utf8');
};
