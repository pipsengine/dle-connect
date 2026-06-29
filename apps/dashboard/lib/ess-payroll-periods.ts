import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { listPayrollRuns, type UnifiedPayrollRun } from '@/lib/payroll-run-store';

type PayslipBatch = { period: string; status: string };

const resolveRuntimeDataDirs = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  const dashboardRoot = cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
  const dirs = [
    process.env.DLE_PAYSLIP_BATCHES_PATH ? path.dirname(path.resolve(process.env.DLE_PAYSLIP_BATCHES_PATH)) : '',
    process.env.DLE_HRIS_DATA_DIR ? path.resolve(process.env.DLE_HRIS_DATA_DIR) : '',
    path.join(cwd, 'data', 'hris'),
    cwd.endsWith(`${path.sep}site`) ? path.join(path.dirname(cwd), 'runtime-data', 'hris') : '',
    path.join(dashboardRoot, 'data', 'hris'),
  ].filter(Boolean);
  return Array.from(new Set(dirs.map((dir) => path.resolve(dir))));
};

const BATCH_PATHS = [
  process.env.DLE_PAYSLIP_BATCHES_PATH ? path.resolve(process.env.DLE_PAYSLIP_BATCHES_PATH) : '',
  ...resolveRuntimeDataDirs().map((dir) => path.join(dir, 'payslip-generation-batches.json')),
].filter(Boolean);

const readReleasedPayslipBatchPeriodsSync = () => {
  const periods = new Set<string>();
  for (const batchPath of BATCH_PATHS) {
    try {
      if (!existsSync(batchPath)) continue;
      const parsed = JSON.parse(readFileSync(batchPath, 'utf8'));
      if (!Array.isArray(parsed)) continue;
      for (const batch of parsed as PayslipBatch[]) {
        if (!/^\d{4}-\d{2}$/.test(String(batch.period || ''))) continue;
        if (['Released', 'Partial'].includes(String(batch.status || ''))) periods.add(batch.period);
      }
      if (periods.size) return [...periods];
    } catch {
      continue;
    }
  }
  return [];
};

const readReleasedPayslipBatchPeriods = async () => {
  const periods = new Set(readReleasedPayslipBatchPeriodsSync());
  for (const batchPath of BATCH_PATHS) {
    try {
      const parsed = JSON.parse(await readFile(batchPath, 'utf8'));
      if (!Array.isArray(parsed)) continue;
      for (const batch of parsed as PayslipBatch[]) {
        if (!/^\d{4}-\d{2}$/.test(String(batch.period || ''))) continue;
        if (['Released', 'Partial'].includes(String(batch.status || ''))) periods.add(batch.period);
      }
    } catch {
      continue;
    }
  }
  return [...periods];
};

const essPayrollRunPublishedForEmployees = (run: UnifiedPayrollRun) => {
  if (!run.period) return false;
  // ESS only shows periods after payslips are explicitly published — not when payroll is merely calculated/released internally.
  if (!run.payslipsGeneratedAt) return false;
  return ['Released', 'Published', 'Posted', 'Closed', 'Locked', 'Partial'].includes(run.status);
};

/** ESS may only show payroll periods that HR has explicitly released to employees. */
export const listEssReleasedPayrollPeriods = async (limit = 24) => {
  const [runs, batchPeriods] = await Promise.all([listPayrollRuns(), readReleasedPayslipBatchPeriods()]);
  const periods = new Set<string>();
  for (const run of runs) {
    if (!essPayrollRunPublishedForEmployees(run)) continue;
    periods.add(run.period);
  }
  for (const period of batchPeriods) periods.add(period);
  return [...periods].sort((a, b) => b.localeCompare(a)).slice(0, limit);
};

export const latestEssReleasedPayrollPeriod = (periods: string[]) => periods[0] || null;
