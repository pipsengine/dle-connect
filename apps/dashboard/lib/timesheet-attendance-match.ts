import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';

const NAME_STOP_WORDS = new Set(['MR', 'MRS', 'MISS', 'MS', 'DR', 'THE', 'AND']);

/** Order-insensitive name key so FEMI BELLO matches BELLO FEMI. */
export const timesheetAttendanceNameKey = (value: string | number | null | undefined) => {
  const tokens = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !NAME_STOP_WORDS.has(token));
  if (tokens.length < 2) return '';
  return `N:${[...tokens].sort().join('|')}`;
};

export const timesheetAttendanceMatchKeys = (...values: Array<string | number | null | undefined>) => {
  const keys = new Set<string>();
  for (const value of values) {
    const raw = String(value ?? '').trim().toUpperCase();
    const normalized = normalizePayrollMatchKey(value);
    if (normalized) {
      keys.add(normalized);
      const prefixed = raw.replace(/[^A-Z0-9]/g, '').match(/^([PCLNI]+)0*(\d+)$/);
      if (prefixed) {
        keys.add(`${prefixed[1]}${prefixed[2]}`);
        if (prefixed[1] === 'C' && prefixed[2].length === 5 && prefixed[2].startsWith('1')) {
          keys.add(`C${prefixed[2].slice(1)}`);
        }
      } else {
        const withoutTypePrefix = normalized.replace(/^[PCLNI]+(?=\d)/, '').replace(/^0+/, '');
        if (withoutTypePrefix) keys.add(withoutTypePrefix);
        const numeric = normalized.replace(/^[A-Z]+/, '').replace(/^0+/, '');
        if (numeric) keys.add(numeric);
      }
    }
    const nameKey = timesheetAttendanceNameKey(raw);
    if (nameKey) keys.add(nameKey);
  }
  return [...keys];
};

/**
 * Agege Cutting / Blasting / Galvanizing share one gate. Many biometric users have
 * office/terminal Unassigned, so a strict location filter would mark present staff Absent.
 * Match the supervisor's crew from the whole day's clocks, then apply supervisor keys.
 */
export const clockingRecordsForSupervisorCrew = <T extends { employeeId: string; employeeName?: string | null }>(
  records: T[],
  allowedSupervisorKeys: Set<string>,
) => {
  if (!allowedSupervisorKeys.size) return [];
  return records.filter((record) =>
    timesheetAttendanceMatchKeys(record.employeeId, record.employeeName).some((key) => allowedSupervisorKeys.has(key)),
  );
};
