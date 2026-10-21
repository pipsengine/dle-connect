import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasFullCorporateOfficeAccess } from '@/lib/access/corporate-office-access';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { isSuperActor } from '@/lib/auth/role-delegation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { employeeHasCorrespondenceAccess } from '@/lib/corporate-office/front-desk-access';
import { CorporateOfficePortalShell } from './corporate-office-portal-shell';

export const metadata = {
  title: 'Corporate Office',
  description: 'Corporate Office portal — front desk correspondence register, routing, and handover.',
};

export default async function CorporateOfficeLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) redirect('/login?next=/corporate-office');
  const permissions = isSuperActor(session)
    ? ['*']
    : await effectivePermissionsForUser(session.sub, session.roles).catch(() => session.permissions || []);
  const globalAdmin = Boolean(session.isGlobalAdmin) || isSuperActor(session);
  const allowed = hasFullCorporateOfficeAccess(permissions, globalAdmin)
    || await employeeHasCorrespondenceAccess(session.employeeCode || '');
  if (!allowed) redirect('/access-denied');
  return <CorporateOfficePortalShell>{children}</CorporateOfficePortalShell>;
}
