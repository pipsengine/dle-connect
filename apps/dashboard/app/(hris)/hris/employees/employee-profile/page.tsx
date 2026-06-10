import EmployeeProfileClient from './EmployeeProfileClient';

export default async function EmployeeProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const raw = sp.employeeId;
  const employeeId = typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  return <EmployeeProfileClient employeeId={employeeId} initialNow={new Date().toISOString()} />;
}
