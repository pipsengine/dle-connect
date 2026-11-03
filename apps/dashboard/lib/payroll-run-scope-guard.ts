import { normalizePayrollRunPack } from '@/lib/payroll-employee-classification';
import {
  normalizePayrollCompany,
  payrollScheduleScopeById,
  payrollScheduleScopeLabel,
} from '@/lib/payroll-schedule-scope';
import {
  resolvePayrollRunCompany,
  resolvePayrollRunPack,
  type UnifiedPayrollRun,
} from '@/lib/payroll-run-store';

/** Refuse a save when the loaded run belongs to a different pack or company than the selected schedule. */
export const payrollRunScopeMismatchMessage = (
  run: Pick<UnifiedPayrollRun, 'id' | 'pack' | 'company'>,
  requested: { scheduleId?: string | null; pack?: string | null; company?: string | null; runId?: string | null },
) => {
  if (!requested.runId) return null;
  const schedule = payrollScheduleScopeById(requested.scheduleId);
  const requestedPack = schedule?.pack || (requested.pack ? normalizePayrollRunPack(requested.pack) : null);
  const requestedCompany = schedule?.company || normalizePayrollCompany(requested.company);
  const runPack = resolvePayrollRunPack(run);
  const runCompany = resolvePayrollRunCompany(run);
  const packMismatch = Boolean(requestedPack && runPack !== requestedPack);
  const companyMismatch = Boolean(requestedCompany && runCompany && runCompany !== requestedCompany);
  if (!packMismatch && !companyMismatch) return null;
  const requestedLabel = schedule?.label || payrollScheduleScopeLabel(requestedPack || runPack, requestedCompany || runCompany);
  const loadedLabel = runCompany ? payrollScheduleScopeLabel(runPack, runCompany) : runPack;
  return `This approval requires the loaded run to be ${requestedLabel}. ${loadedLabel} is still loaded. Reload the schedule and try again.`;
};
