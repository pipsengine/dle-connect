import EmployeeProfileClient from './EmployeeProfileClient';
import { readEmployeeDirectoryFromDb } from '@/lib/dle-enterprise-db';

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
    const employees = await readEmployeeDirectoryFromDb().catch(() => null);
    employeeId = employees?.[0]?.employeeCode || '';
  }
  return <EmployeeProfileClient employeeId={employeeId} initialNow={new Date().toISOString()} />;
}
