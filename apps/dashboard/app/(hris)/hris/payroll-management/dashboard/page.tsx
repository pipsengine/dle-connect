import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isRestrictedPayrollStageApprover } from '@/lib/access/payroll-access';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import PayrollManagementClient from '../PayrollManagementClient';

export const metadata: Metadata = {
  title: 'Payroll Dashboard',
};

export default async function PayrollDashboardPage() {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(AUTH_COOKIE)?.value);
  if (
    isRestrictedPayrollStageApprover({
      isGlobalAdmin: session?.isGlobalAdmin,
      roles: session?.roles,
      employeeCode: session?.employeeCode,
      username: session?.username,
    })
  ) {
    redirect('/hris/payroll-management/payroll-approval');
  }
  return <PayrollManagementClient initialNow={new Date().toISOString()} initialSection="dashboard" />;
}
