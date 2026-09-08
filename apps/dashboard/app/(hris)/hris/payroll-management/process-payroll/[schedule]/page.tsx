import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';

export async function generateMetadata({ params }: { params: Promise<{ schedule: string }> }): Promise<Metadata> {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  return { title: scope ? `${scope.label} · Process Payroll` : 'Process Payroll' };
}

export default async function ProcessPayrollScheduleRedirectPage({
  params,
}: {
  params: Promise<{ schedule: string }>;
}) {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  if (!scope) notFound();
  redirect(`/hris/payroll-management/process-payroll?schedule=${encodeURIComponent(scope.id)}`);
}
