import EmploymentHistoryClient from '../EmploymentHistoryClient';

export default async function EmploymentHistoryByEmployeePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  return <EmploymentHistoryClient initialNow={new Date().toISOString()} employeeId={employeeId} />;
}

