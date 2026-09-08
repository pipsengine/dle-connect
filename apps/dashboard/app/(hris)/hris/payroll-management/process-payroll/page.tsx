import type { Metadata } from 'next';
import { payrollScheduleScopeFromSection } from '@/lib/payroll-schedule-scope';
import ProcessPayrollWorkspace from './ProcessPayrollWorkspace';

export const metadata: Metadata = {
  title: 'Process Payroll',
};

export default async function ProcessPayrollPage({
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
  return <ProcessPayrollWorkspace initialSchedule={scope?.id} />;
}
