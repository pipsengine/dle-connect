import type { Metadata } from 'next';
import NewFinalPayrollSettlementWorkspace from './NewFinalPayrollSettlementWorkspace';

export const metadata: Metadata = {
  title: 'New Final Payroll Settlement',
};

export default async function NewFinalPayrollSettlementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const pick = (key: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : Array.isArray(sp[key]) ? sp[key]![0] : undefined;
  return (
    <NewFinalPayrollSettlementWorkspace
      initialId={pick('id')}
      initialEmployeeCode={pick('employeeCode') || pick('code')}
    />
  );
}
