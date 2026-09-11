import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';

export const timesheetAttendanceMatchKeys = (...values: Array<string | number | null | undefined>) => {
  const keys = new Set<string>();
  for (const value of values) {
    const normalized = normalizePayrollMatchKey(value);
    if (!normalized) continue;
    keys.add(normalized);
    const withoutTypePrefix = normalized.replace(/^[PCLNI]+(?=\d)/, '').replace(/^0+/, '');
    if (withoutTypePrefix) keys.add(withoutTypePrefix);
    const numeric = normalized.replace(/^[A-Z]+/, '').replace(/^0+/, '');
    if (numeric) keys.add(numeric);
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
