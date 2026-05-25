import EmploymentHistoryClient from './EmploymentHistoryClient';

export default async function EmploymentHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const raw = sp.employeeId;
  const employeeId = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  return <EmploymentHistoryClient initialNow={new Date().toISOString()} employeeId={employeeId} />;
}

