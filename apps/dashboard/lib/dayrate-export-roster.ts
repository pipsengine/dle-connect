/**
 * Unified dayrate export roster: applied HR Excel overlay when present,
 * otherwise live daily-rate payroll calculation records.
 */
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { readAppliedDayrateScheduleOverride } from '@/lib/dayrate-schedule-override-read';
import type { DayrateScheduleRow } from '@/lib/dayrate-schedule-xlsx';
import { canonicalContractEmployeeCode } from '@/lib/dayrate-schedule-xlsx';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { resolveOfficialCompanyBucket } from '@/lib/payroll-official-excel-export';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type DayrateExportRosterEntry = {
  scheduleRow: DayrateScheduleRow | null;
  record: PayrollCalculationRecord | null;
  company: 'DLE' | 'DLPC';
};

const recordMatchKeys = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId' | 'fullName'>) =>
  [record.employeeCode, record.employeeId, record.fullName]
    .flatMap((value) => [upper(value), normalizePayrollMatchKey(value), upper(canonicalContractEmployeeCode(value))])
    .filter(Boolean);

const scheduleMatchKeys = (row: DayrateScheduleRow) =>
  [row.employeeCode, row.employeeName, row.firstName, row.lastName]
    .flatMap((value) => [upper(value), normalizePayrollMatchKey(value), upper(canonicalContractEmployeeCode(value))])
    .filter(Boolean);

const indexCalculationRecords = (records: PayrollCalculationRecord[]) => {
  const map = new Map<string, PayrollCalculationRecord>();
  for (const record of records) {
    recordMatchKeys(record).forEach((key) => {
      if (!map.has(key)) map.set(key, record);
    });
  }
  return map;
};

const findCalculationRecord = (
  index: Map<string, PayrollCalculationRecord>,
  row: DayrateScheduleRow,
  directory: Map<string, DleEmployeeDirectoryRow>,
) => {
  for (const key of scheduleMatchKeys(row)) {
    const direct = index.get(key);
    if (direct) return direct;
  }
  for (const key of scheduleMatchKeys(row)) {
    const dir = directory.get(key);
    if (!dir) continue;
    for (const dirKey of [dir.employeeCode, dir.employeeId, dir.fullName]
      .flatMap((value) => [upper(value), normalizePayrollMatchKey(value), upper(canonicalContractEmployeeCode(value))])
      .filter(Boolean)) {
      const match = index.get(dirKey);
      if (match) return match;
    }
  }
  return null;
};

const indexDirectory = (employees: DleEmployeeDirectoryRow[]) => {
  const map = new Map<string, DleEmployeeDirectoryRow>();
  for (const employee of employees) {
    [employee.employeeCode, employee.employeeId, employee.fullName, employee.sourceEmployeeId]
      .flatMap((value) => [upper(value), normalizePayrollMatchKey(value), upper(canonicalContractEmployeeCode(value))])
      .filter(Boolean)
      .forEach((key) => {
        if (!map.has(key)) map.set(key, employee);
      });
  }
  return map;
};

const isDailyRateRecord = (record: PayrollCalculationRecord) =>
  record.isDailyRate || upper(record.employmentType).includes('DAILY');

export const buildDayrateExportRoster = (input: {
  period: string;
  calculatedRecords: PayrollCalculationRecord[];
  directoryEmployees?: DleEmployeeDirectoryRow[];
}): DayrateExportRosterEntry[] => {
  const applied = readAppliedDayrateScheduleOverride(input.period);
  const calcIndex = indexCalculationRecords(input.calculatedRecords.filter(isDailyRateRecord));
  const directory = indexDirectory(input.directoryEmployees || []);

  if (applied?.rows?.length) {
    const seen = new Set<string>();
    const entries: DayrateExportRosterEntry[] = [];
    for (const row of applied.rows) {
      const code = upper(canonicalContractEmployeeCode(row.employeeCode) || row.employeeCode);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      entries.push({
        scheduleRow: row,
        record: findCalculationRecord(calcIndex, row, directory),
        company: row.company === 'DLPC' ? 'DLPC' : 'DLE',
      });
    }
    return entries;
  }

  return input.calculatedRecords
    .filter(isDailyRateRecord)
    .map((record) => ({
      scheduleRow: null,
      record,
      company: resolveOfficialCompanyBucket(record),
    }));
};

export const dayrateExportRosterCount = (roster: DayrateExportRosterEntry[]) => ({
  total: roster.length,
  dle: roster.filter((entry) => entry.company === 'DLE').length,
  dlpc: roster.filter((entry) => entry.company === 'DLPC').length,
});
