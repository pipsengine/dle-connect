import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { employeeReportsToManager } from '@/lib/reporting-manager-match';
import { canAccessPaymentRequest, type PaymentAccessActor } from '@/lib/finance-intelligence/payment-access';

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type LineManagerDirectReport = {
  employeeCode: string;
  fullName: string;
  department: string;
};

const reportCache = new Map<string, { expiresAt: number; reports: LineManagerDirectReport[] }>();
const REPORT_CACHE_MS = 60_000;

/** Reporting manager only — not functional manager or department head. */
export const employeeHasLineManager = (
  employee: Pick<DleEmployeeDirectoryRow, 'managerName' | 'employeeCode' | 'employeeId'>,
  manager: Pick<DleEmployeeDirectoryRow, 'fullName' | 'employeeCode' | 'employeeId'>,
) => {
  const employeeCode = upper(employee.employeeCode || employee.employeeId);
  const managerCode = upper(manager.employeeCode || manager.employeeId);
  if (!employeeCode || !managerCode || employeeCode === managerCode) return false;
  return employeeReportsToManager(
    { managerName: employee.managerName, functionalManager: '', departmentHead: '' },
    manager,
  );
};

export const paymentOwnedByDirectReport = (
  request: { requesterCode?: string | null; beneficiaryCode?: string | null },
  reportCodes: string[],
) => {
  const reports = new Set(reportCodes.map(upper).filter(Boolean));
  if (!reports.size) return false;
  return reports.has(upper(request.requesterCode)) || reports.has(upper(request.beneficiaryCode));
};

export const listDirectReportsForLineManager = async (managerCode: string): Promise<LineManagerDirectReport[]> => {
  const code = upper(managerCode);
  if (!code) return [];
  const cached = reportCache.get(code);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.reports;

  const { readEmployeeDirectoryFromDb } = await import('@/lib/dle-enterprise-db');
  const directory = (await readEmployeeDirectoryFromDb()) || [];
  const manager = directory.find((employee) => upper(employee.employeeCode || employee.employeeId) === code);
  if (!manager) {
    reportCache.set(code, { expiresAt: now + REPORT_CACHE_MS, reports: [] });
    return [];
  }

  const reports = directory
    .filter((employee) => employeeHasLineManager(employee, manager))
    .map((employee) => ({
      employeeCode: compact(employee.employeeCode || employee.employeeId),
      fullName: compact(employee.fullName),
      department: compact(employee.department),
    }))
    .filter((employee) => employee.employeeCode)
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.employeeCode.localeCompare(b.employeeCode));

  const unique = [...new Map(reports.map((row) => [upper(row.employeeCode), row])).values()];
  reportCache.set(code, { expiresAt: now + REPORT_CACHE_MS, reports: unique });
  return unique;
};

export const canAccessPaymentRequestWithTeam = async (
  actor: PaymentAccessActor,
  request: { requesterCode?: string | null; currentApproverCode?: string | null; beneficiaryCode?: string | null },
  options?: { priorActorCodes?: Array<string | null | undefined> },
) => {
  if (canAccessPaymentRequest(actor, request, options)) return true;
  const reports = await listDirectReportsForLineManager(actor.actorCode || '');
  return canAccessPaymentRequest(actor, request, {
    ...options,
    directReportCodes: reports.map((row) => row.employeeCode),
  });
};
