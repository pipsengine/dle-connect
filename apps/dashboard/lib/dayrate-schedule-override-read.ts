/**
 * Read-only dayrate Excel overlay. Kept separate from apply/reconcile so the
 * payroll earnings engine can look up an override without circular imports.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import {
  canonicalContractEmployeeCode,
  dayrateBookedHours,
  type DayrateScheduleParseResult,
  type DayrateScheduleRow,
} from '@/lib/dayrate-schedule-xlsx';

export const HR_DAYRATE_SCHEDULE_OVERRIDE_SOURCE = 'HR Dayrate Schedule Override';

export type DayrateScheduleOverrideRecord = {
  period: string;
  fileName: string;
  title: string;
  appliedAt: string;
  appliedBy: string;
  rows: DayrateScheduleRow[];
  skipped: DayrateScheduleParseResult['skipped'];
  sheets: DayrateScheduleParseResult['sheets'];
};

type OverrideFile = { overrides: DayrateScheduleOverrideRecord[] };

const compact = (value: unknown) => String(value || '').trim();
const round1 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
const normalizePeriod = (value?: string | null) => compact(value).replace(/\//g, '-').replace(/^per-/i, '').slice(0, 7);

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const OVERRIDE_PATH = process.env.DLE_DAYRATE_SCHEDULE_OVERRIDE_PATH
  || (process.env.DLE_HRIS_DATA_DIR ? path.join(process.env.DLE_HRIS_DATA_DIR, 'dayrate-schedule-overrides.json') : '')
  || path.join(resolveDashboardRoot(), 'data', 'hris', 'dayrate-schedule-overrides.json');

let overrideCache: { mtime: number; file: OverrideFile } | null = null;

const emptyFile = (): OverrideFile => ({ overrides: [] });

export const dayrateScheduleOverridePath = () => OVERRIDE_PATH;

export const readDayrateScheduleOverrideFileSync = (): OverrideFile => {
  try {
    if (!existsSync(OVERRIDE_PATH)) return emptyFile();
    const stat = statSync(OVERRIDE_PATH) as { mtimeMs: number };
    if (overrideCache && overrideCache.mtime === stat.mtimeMs) return overrideCache.file;
    const parsed = JSON.parse(readFileSync(OVERRIDE_PATH, 'utf8')) as OverrideFile;
    const file = Array.isArray(parsed?.overrides) ? parsed : emptyFile();
    overrideCache = { mtime: stat.mtimeMs, file };
    return file;
  } catch {
    return emptyFile();
  }
};

export const clearDayrateScheduleOverrideReadCache = () => {
  overrideCache = null;
};

export const isHrDayrateScheduleOverrideSource = (value?: string | null) =>
  compact(value) === HR_DAYRATE_SCHEDULE_OVERRIDE_SOURCE;

export const readAppliedDayrateScheduleOverride = (period?: string) => {
  const normalized = normalizePeriod(period);
  if (!normalized) return null;
  return readDayrateScheduleOverrideFileSync().overrides.find((item) => item.period === normalized) || null;
};

const employeeMatchKeys = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode'> & { sourceEmployeeId?: string | null; fullName?: string | null }) =>
  [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId, employee.fullName]
    .flatMap((value) => [compact(value), normalizePayrollMatchKey(value), canonicalContractEmployeeCode(value)])
    .map((value) => value.toUpperCase())
    .filter(Boolean);

export const findDayrateScheduleOverrideRow = (
  period: string | undefined,
  employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode'> & { sourceEmployeeId?: string | null; fullName?: string | null },
) => {
  const applied = readAppliedDayrateScheduleOverride(period);
  if (!applied) return null;
  const keys = new Set(employeeMatchKeys(employee));
  return applied.rows.find((row) => keys.has(row.employeeCode.toUpperCase()) || keys.has(normalizePayrollMatchKey(row.employeeCode))) || null;
};

export const employeeHasAppliedDayrateScheduleOverride = (
  period: string | undefined,
  employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode'> & { sourceEmployeeId?: string | null; fullName?: string | null },
) => Boolean(findDayrateScheduleOverrideRow(period, employee));

export const applyDayrateScheduleOverrideToHoursMap = (
  period: string,
  map: Map<string, { daysWorked: number; bookedHours: number }>,
) => {
  const applied = readAppliedDayrateScheduleOverride(period);
  if (!applied?.rows.length) return map;

  const contractValues = new Set<{ daysWorked: number; bookedHours: number }>();
  for (const [key, data] of map.entries()) {
    if (canonicalContractEmployeeCode(key)) contractValues.add(data);
  }
  for (const [key, data] of [...map.entries()]) {
    if (contractValues.has(data) || canonicalContractEmployeeCode(key)) map.delete(key);
  }

  for (const row of applied.rows) {
    const daysWorked = round1(row.weekdayDays);
    const bookedHours = dayrateBookedHours(row);
    if (daysWorked <= 0 && bookedHours <= 0) continue;
    const keys = [row.employeeCode, row.employeeName, normalizePayrollMatchKey(row.employeeCode), normalizePayrollMatchKey(row.employeeName)]
      .map((value) => compact(value))
      .filter(Boolean);
    const data = { daysWorked, bookedHours };
    keys.forEach((key) => map.set(key, data));
  }
  return map;
};
