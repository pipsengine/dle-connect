import { resolveDepartmentLineManager } from '@/lib/department-reporting-manager-sync';
import { isGmEmployee } from '@/lib/finance-intelligence/approval-matrix-service';
import { employeeMatchKeys, matchesEmployeeKeys } from '@/lib/leave-allowance-policy';
import { paymentEmployeeCodesMatch } from '@/lib/finance-intelligence/payment-access';
import { directoryPersonNamesMatch } from '@/lib/finance-intelligence/payment-person-match';

const compact = (value: unknown) => String(value ?? '').trim();

export const COST_CENTRE_MANAGER_STAGE = 'Cost Centre Manager';

export const isCostCentreManagerStage = (stage?: string | null) =>
  /cost\s*centre\s*manager/i.test(compact(stage));

const isReportingOrLineManagerStage = (stage: string) =>
  /reporting\s*manager|line\s*manager/i.test(compact(stage)) && !isCostCentreManagerStage(stage);

export type PaymentPrincipalRef = {
  code?: string | null;
  name?: string | null;
  employee?: {
    employeeCode?: string | null;
    employeeId?: string | null;
    sourceEmployeeId?: string | null;
    fullName?: string | null;
  } | null;
};

const embeddedStaffCode = (value: string) => {
  const match = compact(value).match(/\b((?:NYSC|[PLC])\d+)\b/i);
  return match?.[1]?.toUpperCase() || '';
};

/** Staff identifiers for one approver seat, including "P0442 - Name" and employee id aliases. */
export const paymentPrincipalCodes = (principal?: PaymentPrincipalRef | null) => {
  const raw = [
    principal?.code,
    principal?.employee?.employeeCode,
    principal?.employee?.employeeId,
    principal?.employee?.sourceEmployeeId,
  ].map(compact).filter(Boolean);
  const codes = new Set<string>();
  for (const value of raw) {
    codes.add(value);
    const embedded = embeddedStaffCode(value);
    if (embedded) codes.add(embedded);
  }
  return [...codes];
};

const principalName = (principal?: PaymentPrincipalRef | null) =>
  compact(principal?.employee?.fullName || principal?.name);

const looksLikeStageLabel = (value: string) =>
  /reporting manager|line manager|cost centre|project manager|finance manager|cost controller|general manager|^gm$|^cfo$|md\/ceo|managing director/i.test(value);

/**
 * True when two approval seats are the same person.
 * P0464, 0464, and "P0464 - Name" match. Distinct staff codes do not, even if the display names are similar.
 */
export const samePaymentPrincipal = (
  left?: PaymentPrincipalRef | null,
  right?: PaymentPrincipalRef | null,
) => {
  const leftCodes = paymentPrincipalCodes(left);
  const rightCodes = paymentPrincipalCodes(right);
  if (leftCodes.length && rightCodes.length) {
    return leftCodes.some((code) => rightCodes.some((other) =>
      paymentEmployeeCodesMatch(code, other) || matchesEmployeeKeys(code, employeeMatchKeys(other))));
  }
  const leftName = principalName(left);
  const rightName = principalName(right);
  if (!leftName || !rightName || looksLikeStageLabel(leftName) || looksLikeStageLabel(rightName)) return false;
  return directoryPersonNamesMatch(leftName, rightName);
};

const dropCostCentreStage = (stages: string[]) =>
  stages.filter((stage) => !isCostCentreManagerStage(stage));

export const applyCostCentreManagerStage = async (
  stages: string[],
  input: {
    costCentre?: string | null;
    requesterCode?: string | null;
    department?: string | null;
    projectCode?: string | null;
    supervisorName?: string | null;
    paymentType?: string | null;
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

  const reportingIndex = next.findIndex(isReportingOrLineManagerStage);

  // The GM seat is added once, last before CFO. Do not also insert Cost Centre Manager.
  if (isGmEmployee(manager.employee)) {
    return dropCostCentreStage(next);
  }

  const managerPrincipal: PaymentPrincipalRef = {
    code: manager.code,
    name: manager.name,
    employee: manager.employee,
  };

  let alreadyInWorkflow = false;
  try {
    const { resolvePaymentStageApprover } = await import('@/lib/finance-intelligence/payment-approval-notify');
    for (const stage of next) {
      if (isCostCentreManagerStage(stage)) continue;
      // Without a project, Project Manager resolution falls back to any directory PM.
      if (/project manager/i.test(stage) && !compact(input.projectCode)) continue;
      try {
        const approver = await resolvePaymentStageApprover({
          stage,
          requesterCode: input.requesterCode,
          department: input.department,
          costCentre,
          projectCode: input.projectCode,
          supervisorName: input.supervisorName,
          paymentType: input.paymentType,
          principalOnly: true,
        });
        if (samePaymentPrincipal(managerPrincipal, approver)) {
          alreadyInWorkflow = true;
          break;
        }
      } catch (error) {
        console.error('[payment-requests] cost-centre approver compare failed', stage, error);
      }
    }
  } catch (error) {
    console.error('[payment-requests] cost-centre approver compare failed', error);
  }

  // The line/reporting manager's department was also selected as the cost centre,
  // or this manager already holds another seat. They approve once.
  if (alreadyInWorkflow) return dropCostCentreStage(next);

  if (next.some(isCostCentreManagerStage)) return next;
  const insertAt = reportingIndex >= 0 ? reportingIndex + 1 : 0;
  next.splice(insertAt, 0, COST_CENTRE_MANAGER_STAGE);
  return next;
};
