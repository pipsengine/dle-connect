import { readEmployeeDirectoryFromDb } from '@/lib/dle-enterprise-db';
import { readLiveDailyAttendance } from '@/lib/biometric-live-attendance-store';
import ExecutiveHRDashboardClient from '../../../../(dashboard)/dashboard/executive-hr-dashboard/ExecutiveHRDashboardClient';

export const dynamic = 'force-dynamic';

export default async function HRISExecutiveDashboard() {
  const employees = (await readEmployeeDirectoryFromDb().catch(() => null)) || [];
  const attendance = await readLiveDailyAttendance().catch(() => null);
  return <ExecutiveHRDashboardClient employees={employees} attendanceRecords={attendance?.records || []} attendanceDate={attendance?.attendanceDate || null} generatedAt={new Date().toISOString()} />;
}
