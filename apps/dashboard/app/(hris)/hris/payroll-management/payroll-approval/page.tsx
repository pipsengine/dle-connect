import type { Metadata } from 'next';
import { payrollScheduleScopeFromSection, SALARIES_SUMMARY_VIEW_ID } from '@/lib/payroll-schedule-scope';
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
  const initialSchedule = raw === SALARIES_SUMMARY_VIEW_ID
    ? SALARIES_SUMMARY_VIEW_ID
    : payrollScheduleScopeFromSection(raw)?.id;
  return <PayrollApprovalWorkspace initialSchedule={initialSchedule} />;
}
