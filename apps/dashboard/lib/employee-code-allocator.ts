/**
 * Employee-code sequence rules.
 *
 * Next code is always occupied-max + 1 from live Employees and active drafts.
 * A drifted EmployeeCodeCounters.last_sequence must never skip unused numbers.
 */

export const formatNextEmployeeCode = (prefix: string, occupiedMax: number) => {
  const next = Math.max(0, Number(occupiedMax) || 0) + 1;
  const width = Math.max(4, String(next).length);
  return `${prefix}${String(next).padStart(width, '0')}`;
};

export const occupiedSequenceForNextCode = (occupiedMax: number, _counterMax?: number) => {
  void _counterMax;
  return Math.max(0, Number(occupiedMax) || 0);
};

export const shouldKeepReservedEmployeeCode = (reservedCode: string, nextOccupiedCode: string) => {
  const reserved = String(reservedCode || '').trim().toUpperCase();
  const next = String(nextOccupiedCode || '').trim().toUpperCase();
  return Boolean(reserved && next && reserved === next);
};
