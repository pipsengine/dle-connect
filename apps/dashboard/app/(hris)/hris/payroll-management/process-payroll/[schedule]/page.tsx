import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';
import PayrollManagementClient from '../../PayrollManagementClient';

export async function generateMetadata({ params }: { params: Promise<{ schedule: string }> }): Promise<Metadata> {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  return { title: scope ? `${scope.label} · Process Payroll` : 'Process Payroll' };
}

export default async function ProcessPayrollSchedulePage({ params }: { params: Promise<{ schedule: string }> }) {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  if (!scope) notFound();
  return <PayrollManagementClient initialNow={new Date().toISOString()} initialSection={scope.id} />;
}
