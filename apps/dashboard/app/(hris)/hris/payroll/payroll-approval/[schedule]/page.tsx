import { notFound, redirect } from 'next/navigation';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';

export default async function PayrollApprovalLegacySchedulePage({ params }: { params: Promise<{ schedule: string }> }) {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  if (!scope) notFound();
  redirect(scope.approvalHref);
}
