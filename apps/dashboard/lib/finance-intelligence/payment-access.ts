import { hasPermission } from '@/lib/auth/session';
import type { FinanceNavLeaf, FinanceNavSection } from '@/lib/finance-intelligence/nav';
import type { PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';

export type PaymentAccessActor = {
  actorCode?: string;
  roles?: string[];
  permissions?: string[];
  isGlobalAdmin?: boolean;
  department?: string;
  unit?: string;
};

/** Directory employee code for Managing Director / MD-CEO (Mr CHRIS IJELI). */
export const MD_CEO_EMPLOYEE_CODE = 'P0413';

const MD_CEO_ROLE = /managing\s*director|md\s*\/?\s*ceo|chief\s*executive|\bmd\b|\bceo\b/i;
const MD_CEO_STAGE = /md\s*\/?\s*ceo|managing\s*director|chief\s*executive/i;

/** Finance department / unit labels (directory). Keep strict — avoid matching "Key Account", etc. */
const FINANCE_DEPARTMENT_TEXT = /\bfinance\b|\btreasury\b|\baccounting\b|accounts\s+payable|accounts\s+receivable|financial\s+control|finance\s+&\s+accounts|finance\s+and\s+accounts/i;

/** Explicit Finance specialist roles that may see all payment requests. */
const FINANCE_VIEW_ALL_ROLE = /^(cfo|finance manager|finance controller|finance administrator|finance payroll reviewer|accountant|accounts payable officer|accounts receivable officer|budget officer|treasury officer)$/i;

/** True when the signed-in actor is the MD/CEO seat (by code or role). */
export const isMdCeoActor = (actor: PaymentAccessActor) => {
  const code = String(actor.actorCode || '').trim().toUpperCase();
  if (code === MD_CEO_EMPLOYEE_CODE) return true;
  // Directory MD defaults to Enterprise role "Executive Director".
  return (actor.roles || []).some((role) => {
    const value = String(role || '').trim();
    return MD_CEO_ROLE.test(value) || /^executive director$/i.test(value);
  });
};

/** Global Super Administrator (session flag or Super Administrator role only). */
export const isGlobalSuperAdminActor = (actor: PaymentAccessActor) => {
  if (actor.isGlobalAdmin) return true;
  return (actor.roles || []).some((role) => /^super administrator$/i.test(String(role || '').trim()));
};

/** Finance department membership or core Finance specialist role. */
export const isFinanceDepartmentActor = (actor: PaymentAccessActor) => {
  const text = `${actor.department || ''} ${actor.unit || ''}`.trim().toLowerCase();
  if (text && FINANCE_DEPARTMENT_TEXT.test(text)) return true;
  return (actor.roles || []).some((role) => FINANCE_VIEW_ALL_ROLE.test(String(role || '').trim()));
};

/** Self-service permission: raise/view own payments without full Finance Intelligence. */
export const FINANCE_PAYMENTS_SELF_PERMISSION = 'finance.payments.self';

/**
 * Who may browse all payment requests in the system.
 * Only Global Super Admin and Finance department (or core Finance roles).
 * Managers / other departments must only see payments they raised.
 */
export const canViewAllPaymentRequests = (actor: PaymentAccessActor) => {
  if (isGlobalSuperAdminActor(actor)) return true;
  return isFinanceDepartmentActor(actor);
};

/** Raise and track own cash advances / supplier requests; open My Approval Inbox when assigned. */
export const canAccessPaymentSelfService = (actor: PaymentAccessActor) => {
  if (canViewAllPaymentRequests(actor)) return true;
  const permissions = actor.permissions || [];
  if (
    hasPermission(permissions, '*')
    || hasPermission(permissions, FINANCE_PAYMENTS_SELF_PERMISSION)
    || hasPermission(permissions, 'ess.view')
    || hasPermission(permissions, 'workflow.approve')
  ) {
    return true;
  }
  // Common staff / line roles that raise or approve employee payments.
  return (actor.roles || []).some((role) =>
    /^(employee|manager|supervisor|department head|project manager|project cost controller|lead)$/i.test(String(role || '').trim()));
};

/** Own request, assigned approver, prior workflow actor, or elevated finance/admin. */
export const canAccessPaymentRequest = (
  actor: PaymentAccessActor,
  request: Pick<PaymentRequestRow, 'requesterCode' | 'currentApproverCode' | 'beneficiaryCode'>,
  options?: { priorActorCodes?: Array<string | null | undefined> },
) => {
  if (canViewAllPaymentRequests(actor)) return true;
  const code = String(actor.actorCode || '').trim().toLowerCase();
  if (!code) return false;
  if (
    String(request.requesterCode || '').trim().toLowerCase() === code
    || String(request.currentApproverCode || '').trim().toLowerCase() === code
    || String(request.beneficiaryCode || '').trim().toLowerCase() === code
  ) {
    return true;
  }
  // After final approval, currentApprover is cleared — still allow anyone who already acted.
  return (options?.priorActorCodes || []).some((actorCode) =>
    String(actorCode || '').trim().toLowerCase() === code);
};

const codesMatch = (left?: string | null, right?: string | null) => {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  return Boolean(a && b && a === b);
};

/**
 * True when this actor is the person who should action the current approval stage.
 * Does not include Finance "view all" or Super Admin bypass — those belong on Payment Requests, not Inbox.
 */
export const isAssignedPaymentApprover = (
  actor: PaymentAccessActor,
  request: Pick<PaymentRequestRow, 'currentApproverCode' | 'currentStage' | 'status'>,
) => {
  if (!/pending|submitted|finance review/i.test(String(request.status || ''))) return false;
  if (codesMatch(actor.actorCode, request.currentApproverCode)) return true;
  if (isMdCeoActor(actor)) {
    const assigned = String(request.currentApproverCode || '').trim().toUpperCase();
    if (assigned === MD_CEO_EMPLOYEE_CODE) return true;
    if (MD_CEO_STAGE.test(String(request.currentStage || ''))) return true;
  }
  return false;
};

/** Requester viewing their own request (not also the assigned approver). */
export const isPaymentRequesterOnly = (
  actor: PaymentAccessActor,
  request: Pick<PaymentRequestRow, 'requesterCode' | 'currentApproverCode' | 'beneficiaryCode'>,
) => {
  if (canViewAllPaymentRequests(actor)) return false;
  const code = String(actor.actorCode || '').trim().toLowerCase();
  if (!code) return false;
  const isRequester = codesMatch(actor.actorCode, request.requesterCode)
    || codesMatch(actor.actorCode, request.beneficiaryCode);
  const isAssignedApprover = codesMatch(actor.actorCode, request.currentApproverCode);
  return isRequester && !isAssignedApprover;
};

/**
 * May Approve / Reject / Return / Clarify / Delegate on a pending request.
 * Assigned current approver, or Super Admin / System Administrator only.
 * Finance "view all" does not grant stage approval — that kept skipping the Finance Manager assignee.
 * MD/CEO may always act when the request is on the MD stage or assigned to the MD seat.
 */
export const canActOnPaymentApproval = (
  actor: PaymentAccessActor,
  request: Pick<PaymentRequestRow, 'requesterCode' | 'currentApproverCode' | 'currentStage' | 'status'>,
) => {
  if (!/pending|submitted|finance review/i.test(String(request.status || ''))) return false;
  if (isAssignedPaymentApprover(actor, request)) return true;
  if (actor.isGlobalAdmin) return true;
  return (actor.roles || []).some((role) =>
    /^(super administrator|system administrator|application administrator)$/i.test(String(role || '').trim()));
};

/** Requester/beneficiary may submit retirement for their paid cash advance. */
export const canSubmitCashAdvanceRetirement = (
  actor: PaymentAccessActor,
  request: Pick<PaymentRequestRow, 'paymentType' | 'status' | 'requesterCode' | 'beneficiaryCode'>,
) => {
  if (request.paymentType !== 'Cash Advance Payment') return false;
  if (!/^awaiting retirement$/i.test(String(request.status || ''))) return false;
  if (actor.isGlobalAdmin) return true;
  const code = String(actor.actorCode || '').trim().toLowerCase();
  if (!code) return false;
  return (
    String(request.requesterCode || '').trim().toLowerCase() === code
    || String(request.beneficiaryCode || '').trim().toLowerCase() === code
  );
};

/** Requester may edit a draft or a payment returned for correction, then submit/resubmit. */
export const canEditReturnedPaymentRequest = (
  actor: PaymentAccessActor,
  request: Pick<PaymentRequestRow, 'status' | 'requesterCode' | 'beneficiaryCode' | 'paymentType'>,
) => {
  if (!/^(draft|returned)$/i.test(String(request.status || ''))) return false;
  if (actor.isGlobalAdmin) return true;
  if (codesMatch(actor.actorCode, request.requesterCode)) return true;
  // Cash advances: beneficiary is usually the same employee who raised it.
  if (
    request.paymentType === 'Cash Advance Payment'
    && codesMatch(actor.actorCode, request.beneficiaryCode)
  ) {
    return true;
  }
  return false;
};

/** Fully approved (or later) payment document may be downloaded as PDF. */
export const canDownloadPaymentDocumentPdf = (
  request: Pick<PaymentRequestRow, 'status'>,
) => /ready for treasury|approved|payment scheduled|payment processing|paid|awaiting retirement|retirement submitted|treasury verification|retired|completed|closed|posted/i.test(
  String(request.status || ''),
);

/** Nav leaf ids under Payment Management that employees may see. */
export const EMPLOYEE_PAYMENT_NAV_IDS = new Set([
  'approval-dashboard', // rendered as "My Payments" for self-service
  'inbox',
  'payment-requests',
  'my-requests',
]);

const EMPLOYEE_PAYMENT_PATH_PREFIXES = [
  '/finance/approvals',
  '/finance/approvals/inbox',
  '/finance/approvals/payments',
  '/finance/approvals/my-requests',
  '/finance/approvals/cash-advances',
  '/finance/approvals/supplier-payments',
  '/finance/approvals/expense-payments',
  '/finance/approvals/request/',
];

const FINANCE_OPS_PATH_PREFIXES = [
  '/finance/approvals/advance-retirement',
  '/finance/approvals/treasury',
  '/finance/approvals/sage-posting',
  '/finance/approvals/batches',
  '/finance/approvals/other',
  '/finance/approvals/monitoring',
  '/finance/approvals/expense-claims',
  '/finance/approvals/budget',
  '/finance/approvals/fx-requests',
  '/finance/approvals/tax-payments',
  '/finance/approvals/write-offs',
  '/finance/approvals/asset-disposal',
  '/finance/approvals/project-variations',
  '/finance/approvals/report-signoff',
  '/finance/overview',
  '/finance/reporting',
  '/finance/analysis',
  '/finance/ai-copilot',
  '/finance/data-explorer',
  '/finance/distribution',
  '/finance/audit',
  '/finance/configuration',
];

const normalizeFinancePath = (pathname: string) => {
  const clean = String(pathname || '').split('?')[0].replace(/\/$/, '') || '/finance';
  return clean.startsWith('/finance') ? clean : `/finance${clean.startsWith('/') ? '' : '/'}${clean}`;
};

export const isEmployeePaymentPath = (pathname: string) => {
  const path = normalizeFinancePath(pathname);
  if (path === '/finance' || path === '/finance/approvals') return true;
  if (/^\/finance\/approvals\/request\/[^/]+$/.test(path)) return true;
  return EMPLOYEE_PAYMENT_PATH_PREFIXES.some((prefix) => {
    if (prefix.endsWith('/')) return path.startsWith(prefix);
    return path === prefix || path.startsWith(`${prefix}/`);
  });
};

export const isFinanceOpsOnlyPath = (pathname: string) => {
  const path = normalizeFinancePath(pathname);
  return FINANCE_OPS_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
};

/** Page-level gate for finance payment routes. */
export const canAccessFinancePaymentPage = (pathname: string, actor: PaymentAccessActor) => {
  const path = normalizeFinancePath(pathname);
  if (canViewAllPaymentRequests(actor)) return true;
  if (!canAccessPaymentSelfService(actor)) return false;
  if (isFinanceOpsOnlyPath(path)) return false;
  if (path === '/finance' || isEmployeePaymentPath(path)) return true;
  return false;
};

export const filterFinanceNavForActor = (
  sections: FinanceNavSection[],
  actor: PaymentAccessActor,
): FinanceNavSection[] => {
  if (canViewAllPaymentRequests(actor)) return sections;
  if (!canAccessPaymentSelfService(actor)) return [];

  return sections
    .filter((section) => section.id === 'approvals')
    .map((section) => ({
      ...section,
      href: '/finance/approvals',
      children: section.children
        .filter((child) => EMPLOYEE_PAYMENT_NAV_IDS.has(child.id))
        .map((child): FinanceNavLeaf => (
          child.id === 'approval-dashboard'
            ? { ...child, label: 'My Payments', href: '/finance/approvals' }
            : child
        )),
    }))
    .filter((section) => section.children.length > 0);
};
