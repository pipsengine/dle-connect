import sql from 'mssql';

import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';

export const HRIS_LEAVE_SOURCE = 'DLE_Enterprise HRIS';

export type LeaveBalanceDetail = {
  leaveType: string;
  available: number;
  entitlement: number;
  used: number;
  pending: number;
  carryForward: number;
};

export type EmployeeLeaveSummary = {
  balances: Record<string, number>;
  balanceDetails: LeaveBalanceDetail[];
  history: {
    id: string;
    type: string;
    start: string;
    end: string;
    days: number;
    status: 'Approved' | 'Pending' | 'Rejected';
  }[];
  sourceSystem?: string | null;
  lastUpdatedAt?: string | null;
};

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const clean = (value: unknown) => String(value ?? '').trim();

export const normalizeLeaveTypeName = (value: string) => clean(value).replace(/\s+/g, ' ');

export const isLegacySageLeaveImport = (requestId: string) => /^sage-leave-tx-/i.test(clean(requestId));

const dateOnly = (value: Date | string | null | undefined) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const resolveLookupKeys = (employee: string | DleEmployeeDirectoryRow) => {
  const keys = new Set<string>();
  if (typeof employee === 'string') {
    const key = clean(employee);
    if (key) keys.add(key);
    return [...keys];
  }
  for (const key of [employee.employeeCode, employee.employeeId, employee.id]) {
    const value = clean(key);
    if (value) keys.add(value);
  }
  const legacyMatch = clean(employee.jobTitle).match(/^([A-Z]{2,5}\d{2,5})\s*-/i);
  if (legacyMatch?.[1]) keys.add(legacyMatch[1].toUpperCase());
  if (Number.isFinite(employee.employeeDbId) && employee.employeeDbId > 0) keys.add(String(employee.employeeDbId));
  return [...keys];
};

const leaveTypeSortRank = (leaveType: string) => {
  const normalized = leaveType.toLowerCase();
  if (normalized.includes('annual')) return 0;
  if (normalized.includes('sick')) return 1;
  if (normalized.includes('compassion')) return 2;
  if (normalized.includes('exam')) return 3;
  if (normalized.includes('carry')) return 4;
  if (normalized.includes('casual')) return 5;
  if (normalized.includes('maternity')) return 6;
  if (normalized.includes('paternity')) return 7;
  return 8;
};

const mapProfileHistoryStatus = (status: string): EmployeeLeaveSummary['history'][number]['status'] => {
  const normalized = clean(status).toLowerCase();
  if (['approved', 'completed'].includes(normalized)) return 'Approved';
  if (['rejected', 'cancelled', 'terminated', 'withdrawn'].includes(normalized)) return 'Rejected';
  return 'Pending';
};

const preferBalanceRow = (
  current: {
    LeaveType: string;
    CurrentBalance: number;
    AccruedBalance: number;
    UsedBalance: number;
    PendingBalance: number;
    CarryForwardBalance: number;
    SourceSystem: string;
    UpdatedAt: Date;
  } | undefined,
  candidate: {
    LeaveType: string;
    CurrentBalance: number;
    AccruedBalance: number;
    UsedBalance: number;
    PendingBalance: number;
    CarryForwardBalance: number;
    SourceSystem: string;
    UpdatedAt: Date;
  },
) => {
  if (!current) return candidate;
  const currentPending = Number(current.PendingBalance || 0);
  const candidatePending = Number(candidate.PendingBalance || 0);
  if (candidatePending !== currentPending) {
    return candidatePending > currentPending ? candidate : current;
  }
  const currentUpdated = current.UpdatedAt ? new Date(current.UpdatedAt).getTime() : 0;
  const candidateUpdated = candidate.UpdatedAt ? new Date(candidate.UpdatedAt).getTime() : 0;
  return candidateUpdated >= currentUpdated ? candidate : current;
};

const requireDbPool = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise HRIS database is not configured.');
  return pool;
};

/** Read leave balances and application history from DLE_Enterprise HRIS tables only. */
export async function readEmployeeLeaveFromHris(employee: string | DleEmployeeDirectoryRow): Promise<EmployeeLeaveSummary> {
  const pool = await requireDbPool();
  const keys = resolveLookupKeys(employee);
  if (!keys.length) {
    return { balances: {}, balanceDetails: [], history: [], sourceSystem: HRIS_LEAVE_SOURCE, lastUpdatedAt: null };
  }

  const balanceRequest = pool.request();
  keys.forEach((key, index) => balanceRequest.input(`employeeKey${index}`, sql.NVarChar(80), key));
  const balanceKeySql = keys.map((_, index) => `@employeeKey${index}`).join(', ');

  const balancesResult = await balanceRequest.query(`
SELECT [LeaveType], [CurrentBalance], [AccruedBalance], [UsedBalance], [PendingBalance], [CarryForwardBalance], [SourceSystem], [UpdatedAt]
FROM [hris].[LeaveBalances]
WHERE [EmployeeId] IN (${balanceKeySql})
ORDER BY [LeaveType];`);

  const historyRequest = pool.request();
  keys.forEach((key, index) => historyRequest.input(`employeeKey${index}`, sql.NVarChar(80), key));
  const historyResult = await historyRequest.query(`
SELECT TOP (50) [Id], [LeaveType], [StartDate], [EndDate], [Days], [StatusName], [SourceSystem], [UpdatedAt]
FROM [hris].[LeaveApplications]
WHERE [EmployeeId] IN (${balanceKeySql})
  AND [Id] NOT LIKE N'sage-leave-tx-%'
ORDER BY [StartDate] DESC, [UpdatedAt] DESC;`);

  const balanceRows = balancesResult.recordset as Array<{
    LeaveType: string;
    CurrentBalance: number;
    AccruedBalance: number;
    UsedBalance: number;
    PendingBalance: number;
    CarryForwardBalance: number;
    SourceSystem: string;
    UpdatedAt: Date;
  }>;

  const mergedRowsByLeaveType = new Map<string, (typeof balanceRows)[number]>();
  for (const row of balanceRows) {
    const leaveType = normalizeLeaveTypeName(row.LeaveType);
    if (!leaveType) continue;
    mergedRowsByLeaveType.set(leaveType, preferBalanceRow(mergedRowsByLeaveType.get(leaveType), row));
  }

  const balances: Record<string, number> = {};
  const balanceDetails: LeaveBalanceDetail[] = [];
  let lastUpdatedAt: string | null = null;

  for (const row of mergedRowsByLeaveType.values()) {
    const leaveType = normalizeLeaveTypeName(row.LeaveType);
    if (!leaveType) continue;
    const available = round2(Number(row.CurrentBalance || 0));
    const entitlement = round2(Number(row.AccruedBalance || 0));
    const used = round2(Number(row.UsedBalance || 0));
    const pending = round2(Number(row.PendingBalance || 0));
    const carryForward = round2(Number(row.CarryForwardBalance || 0));
    if (available <= 0 && entitlement <= 0 && used <= 0 && pending <= 0 && carryForward <= 0) continue;

    balances[leaveType] = available;
    balanceDetails.push({ leaveType, available, entitlement, used, pending, carryForward });
    const updatedAt = row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null;
    if (updatedAt && (!lastUpdatedAt || updatedAt > lastUpdatedAt)) lastUpdatedAt = updatedAt;
  }

  balanceDetails.sort((a, b) => leaveTypeSortRank(a.leaveType) - leaveTypeSortRank(b.leaveType) || a.leaveType.localeCompare(b.leaveType));

  const historyRows = historyResult.recordset as Array<{
    Id: string;
    LeaveType: string;
    StartDate: Date;
    EndDate: Date;
    Days: number;
    StatusName: string;
    UpdatedAt?: Date;
  }>;

  const history = historyRows.map((row) => ({
    id: row.Id,
    type: normalizeLeaveTypeName(row.LeaveType),
    start: dateOnly(row.StartDate),
    end: dateOnly(row.EndDate),
    days: round2(Number(row.Days || 0)),
    status: mapProfileHistoryStatus(row.StatusName),
  }));

  return {
    balances,
    balanceDetails,
    history,
    sourceSystem: HRIS_LEAVE_SOURCE,
    lastUpdatedAt,
  };
}

export async function ensureEmployeeLeaveFromHris(employee: DleEmployeeDirectoryRow) {
  return readEmployeeLeaveFromHris(employee);
}
