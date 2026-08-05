import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { permissionsForRoles } from '@/lib/auth/rbac';
import { canViewAllPaymentRequests } from '@/lib/finance-intelligence/payment-access';
import { FINANCE_MODULE } from '@/lib/finance-intelligence/nav';

export default async function FinanceIndexPage() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const roles = session?.roles || [];
  const permissions = session?.isGlobalAdmin ? ['*'] : permissionsForRoles(roles);
  const viewAll = canViewAllPaymentRequests({
    actorCode: session?.employeeCode || session?.username || session?.sub || '',
    roles,
    permissions,
    isGlobalAdmin: Boolean(session?.isGlobalAdmin),
  });
  redirect(viewAll ? FINANCE_MODULE.homeHref : '/finance/approvals');
}
