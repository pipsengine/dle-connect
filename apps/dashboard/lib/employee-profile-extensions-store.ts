import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ProfileMedicalHSE = {
  medicalFitnessStatus: string | null;
  bloodGroup: string | null;
  knownAllergies: string | null;
  medicalRestrictions: string | null;
  fitToWorkStatus: string | null;
  incidentHistory: Array<{ id: string; at: string; title: string; severity: 'high' | 'medium' | 'low'; status: string }>;
  hseCertifications: Array<{ id: string; name: string; expiryDate?: string | null; status: 'Valid' | 'Expired' }>;
};

export type ProfileTrainingRecord = {
  id: string;
  trainingName: string;
  provider: string;
  completionDate?: string | null;
  expiryDate?: string | null;
  status: 'Completed' | 'Pending' | 'Expired';
  score?: number | null;
};

export type ProfileAssetItem = {
  id: string;
  assetType: string;
  assetTag: string;
  assetName: string;
  serialNumber?: string | null;
  assignedDate: string;
  condition: 'Good' | 'Fair' | 'Needs Repair';
  returnStatus: 'Assigned' | 'Returned';
  returnDate?: string | null;
};

export type ProfilePerformanceSummary = {
  currentRating: 'A' | 'B' | 'C' | 'D' | '-';
  lastReviewAt?: string | null;
  goals: Array<{ id: string; title: string; progressPct: number; status: 'On Track' | 'At Risk' | 'Completed' }>;
  managerFeedback?: string | null;
  aiSignals: Array<{ id: string; title: string; severity: 'high' | 'medium' | 'low'; confidence: number }>;
};

export type ProfileDisciplinaryRecord = {
  id: string;
  caseType: string;
  dateReported: string;
  description: string;
  actionTaken?: string | null;
  status: 'Open' | 'Closed' | 'Appealed';
  approver?: string | null;
};

export type EmployeeProfileExtensions = {
  medicalHse?: ProfileMedicalHSE;
  training?: ProfileTrainingRecord[];
  assets?: ProfileAssetItem[];
  performanceSummary?: ProfilePerformanceSummary;
  disciplinary?: ProfileDisciplinaryRecord[];
  updatedAt?: string;
};

type StoreShape = Record<string, EmployeeProfileExtensions>;

const resolvePath = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  const root = cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
  return path.join(root, 'data', 'hris', 'employee-profile-extensions.json');
};

const readStore = async (): Promise<StoreShape> => {
  try {
    const raw = await readFile(resolvePath(), 'utf8');
    const parsed = JSON.parse(raw) as StoreShape;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = async (store: StoreShape) => {
  await writeFile(resolvePath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
};

export const readEmployeeProfileExtensions = async (employeeCode: string) => {
  const store = await readStore();
  return store[String(employeeCode || '').trim().toUpperCase()] || {};
};

export const writeEmployeeProfileExtensions = async (employeeCode: string, patch: EmployeeProfileExtensions) => {
  const key = String(employeeCode || '').trim().toUpperCase();
  if (!key) return null;
  const store = await readStore();
  const current = store[key] || {};
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store[key] = next;
  await writeStore(store);
  return next;
};
