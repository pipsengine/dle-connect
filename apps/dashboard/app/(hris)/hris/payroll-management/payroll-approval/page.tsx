import type { Metadata } from 'next';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';
import PayrollApprovalWorkspace from './PayrollApprovalWorkspace';

export const metadata: Metadata = {
  title: 'Payroll Approval',
};

export default async function PayrollApprovalPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const raw = typeof sp.schedule === 'string'
    ? sp.schedule
    : Array.isArray(sp.schedule)
      ? sp.schedule[0]
      : undefined;
  const scope = payrollScheduleScopeFromSection(raw);
  return <PayrollApprovalWorkspace initialSchedule={scope?.id} />;
}
