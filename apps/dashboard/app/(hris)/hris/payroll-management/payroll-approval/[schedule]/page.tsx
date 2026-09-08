import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';

export async function generateMetadata({ params }: { params: Promise<{ schedule: string }> }): Promise<Metadata> {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  return { title: scope ? `${scope.label} · Payroll Approval` : 'Payroll Approval' };
}

export default async function PayrollApprovalScheduleRedirectPage({
  params,
}: {
  params: Promise<{ schedule: string }>;
}) {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  if (!scope) notFound();
  redirect(`/hris/payroll-management/payroll-approval?schedule=${encodeURIComponent(scope.id)}`);
}
