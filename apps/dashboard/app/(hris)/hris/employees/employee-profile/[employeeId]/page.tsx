import EmployeeProfileClient from '../EmployeeProfileClient';

export default async function EmployeeProfileByIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { employeeId } = await params;
  const sp = (await searchParams) || {};
  return (
    <EmployeeProfileClient
      employeeId={employeeId}
      initialNow={new Date().toISOString()}
      initialMode={typeof sp.mode === 'string' ? sp.mode : undefined}
      initialTab={typeof sp.tab === 'string' ? sp.tab : undefined}
    />
  );
}

