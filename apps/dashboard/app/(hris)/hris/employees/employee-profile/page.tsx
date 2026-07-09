import EmployeeProfileClient from './EmployeeProfileClient';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';

export const dynamic = 'force-dynamic';

export default async function EmployeeProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const raw = sp.employeeId;
  let employeeId = typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  if (!employeeId) {
    const employees = (await readPayrollEmployees()).employees;
    employeeId = employees[0]?.employeeCode || '';
  }
  return <EmployeeProfileClient employeeId={employeeId} initialNow={new Date().toISOString()} initialMode={typeof sp.mode === 'string' ? sp.mode : undefined} initialTab={typeof sp.tab === 'string' ? sp.tab : undefined} />;
}
