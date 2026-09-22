import { resolveDepartmentLineManager } from '@/lib/department-reporting-manager-sync';
import { isGmEmployee } from '@/lib/finance-intelligence/approval-matrix-service';

const compact = (value: unknown) => String(value ?? '').trim();

export const COST_CENTRE_MANAGER_STAGE = 'Cost Centre Manager';

export const isCostCentreManagerStage = (stage?: string | null) =>
  /cost\s*centre\s*manager/i.test(compact(stage));

export const applyCostCentreManagerStage = async (
  stages: string[],
  input: {
    costCentre?: string | null;
    requesterCode?: string | null;
    department?: string | null;
  },
) => {
  const next = (stages || []).map((stage) => compact(stage)).filter(Boolean);
  const costCentre = compact(input.costCentre);
  if (!costCentre) {
    throw new Error('Cost Centre is required. Select a department as the cost centre.');
  }
  const manager = await resolveDepartmentLineManager(costCentre);
  if (!manager?.code) {
    throw new Error(`No line manager could be resolved for cost centre "${costCentre}". Choose a department that has a manager in HRIS.`);
  }

  const alreadyPresent = next.some(isCostCentreManagerStage);
  const reportingIndex = next.findIndex((stage) => /reporting\s*manager|line\s*manager/i.test(stage));

  if (isGmEmployee(manager.employee)) {
    return alreadyPresent ? next.filter((stage) => !isCostCentreManagerStage(stage)) : next;
  }

  try {
    const { resolvePaymentStageApprover } = await import('@/lib/finance-intelligence/payment-approval-notify');
    const reporting = reportingIndex >= 0
      ? await resolvePaymentStageApprover({
        stage: next[reportingIndex],
        requesterCode: input.requesterCode,
        department: input.department,
        principalOnly: true,
      })
      : null;
    const sameAsReporting = Boolean(
      reporting?.code
      && compact(reporting.code).toUpperCase() === compact(manager.code).toUpperCase(),
    );
    if (sameAsReporting) {
      return alreadyPresent ? next.filter((stage) => !isCostCentreManagerStage(stage)) : next;
    }
  } catch {
    // If reporting-manager lookup fails, still insert the cost-centre manager.
  }

  if (alreadyPresent) return next;
  const insertAt = reportingIndex >= 0 ? reportingIndex + 1 : 0;
  next.splice(insertAt, 0, COST_CENTRE_MANAGER_STAGE);
  return next;
};
