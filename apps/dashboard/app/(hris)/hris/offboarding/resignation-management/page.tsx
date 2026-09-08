import type { Metadata } from 'next';
import ResignationManagementWorkspace from './ResignationManagementWorkspace';

export const metadata: Metadata = {
  title: 'Resignation Management',
};

export default async function ResignationManagementPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const pick = (key: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : Array.isArray(sp[key]) ? sp[key]![0] : undefined;
  return (
    <ResignationManagementWorkspace
      initialPeriod={pick('period')}
      initialResignationId={pick('id')}
      initialEmployeeCode={pick('employeeCode') || pick('code')}
      initialEmployeeId={pick('employeeId')}
    />
  );
}
