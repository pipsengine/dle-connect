import { hasPermission } from '@/lib/auth/session';
import type { PaymentRequestRow } from '@/lib/finance-intelligence/payment-requests-service';

export type PaymentAccessActor = {
  actorCode?: string;
  roles?: string[];
  permissions?: string[];
  isGlobalAdmin?: boolean;
};

const FINANCE_ELEVATED_ROLE = /^(super administrator|admin|system administrator|application administrator|cfo|finance manager|finance controller|finance administrator|finance payroll reviewer|accountant|accounts payable officer|accounts receivable officer|budget officer|treasury officer|executive director|executive management)$/i;

/** Finance / treasury / posting / global admin — may see all payment requests. */
export const canViewAllPaymentRequests = (actor: PaymentAccessActor) => {
  if (actor.isGlobalAdmin) return true;
  const permissions = actor.permissions || [];
  if (
    hasPermission(permissions, '*')
    || hasPermission(permissions, 'finance.*')
    || hasPermission(permissions, 'finance.view')
    || hasPermission(permissions, 'finance.approve')
    || hasPermission(permissions, 'finance.treasury.operate')
    || hasPermission(permissions, 'finance.posting.operate')
    || hasPermission(permissions, 'treasury.view')
    || hasPermission(permissions, 'treasury.edit')
    || hasPermission(permissions, 'treasury.*')
    || hasPermission(permissions, 'view_finance_intelligence')
    || hasPermission(permissions, 'view_finance_accounting')
  ) {
    return true;
  }
  return (actor.roles || []).some((role) => FINANCE_ELEVATED_ROLE.test(String(role || '').trim()));
};

/** Own request, assigned approver, or elevated finance/admin. */
export const canAccessPaymentRequest = (
  actor: PaymentAccessActor,
  request: Pick<PaymentRequestRow, 'requesterCode' | 'currentApproverCode' | 'beneficiaryCode'>,
) => {
  if (canViewAllPaymentRequests(actor)) return true;
  const code = String(actor.actorCode || '').trim().toLowerCase();
  if (!code) return false;
  return (
    String(request.requesterCode || '').trim().toLowerCase() === code
    || String(request.currentApproverCode || '').trim().toLowerCase() === code
    || String(request.beneficiaryCode || '').trim().toLowerCase() === code
  );
};
