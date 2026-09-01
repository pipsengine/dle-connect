import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';
import PayrollApprovalClient from '../../../payroll/payroll-approval/PayrollApprovalClient';

export async function generateMetadata({ params }: { params: Promise<{ schedule: string }> }): Promise<Metadata> {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  return { title: scope ? `${scope.label} · Payroll Approval` : 'Payroll Approval' };
}

export default async function PayrollApprovalSchedulePage({ params }: { params: Promise<{ schedule: string }> }) {
  const { schedule } = await params;
  const scope = payrollScheduleScopeFromSection(schedule);
  if (!scope) notFound();
  return <PayrollApprovalClient initialNow={new Date().toISOString()} initialSchedule={scope.id} />;
}
