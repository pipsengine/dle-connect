import EmployeeProfileClient from '../EmployeeProfileClient';

export default async function EmployeeProfileByIdPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  return <EmployeeProfileClient employeeId={employeeId} initialNow={new Date().toISOString()} />;
}

