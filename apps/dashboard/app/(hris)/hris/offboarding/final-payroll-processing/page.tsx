import type { Metadata } from 'next';
import FinalPayrollProcessingWorkspace from './FinalPayrollProcessingWorkspace';

export const metadata: Metadata = {
  title: 'Final Payroll Processing',
};

export default async function FinalPayrollProcessingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const pick = (key: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : Array.isArray(sp[key]) ? sp[key]![0] : undefined;
  return (
    <FinalPayrollProcessingWorkspace
      initialPeriod={pick('period')}
      initialSettlementId={pick('id')}
      initialEmployeeCode={pick('employeeCode') || pick('code')}
      initialEmployeeId={pick('employeeId')}
    />
  );
}
