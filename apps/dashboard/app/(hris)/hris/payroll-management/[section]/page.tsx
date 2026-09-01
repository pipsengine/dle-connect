import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';
import PayrollManagementClient from '../PayrollManagementClient';

const titleCase = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  const schedule = payrollScheduleScopeFromSection(section);
  return { title: schedule?.label || titleCase(section || 'Payroll Management') };
}

export default async function PayrollManagementSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const schedule = payrollScheduleScopeFromSection(section);
  if (schedule) redirect(schedule.processHref);
  return <PayrollManagementClient initialNow={new Date().toISOString()} initialSection={section} />;
}
