import { readEmployeeDirectoryFromDb } from '@/lib/dle-enterprise-db';
import { readLiveDailyAttendance } from '@/lib/biometric-live-attendance-store';
import HRISDashboardLayout from '@hris/components/layout/dashboard-layout';
import ExecutiveHRDashboardClient from './ExecutiveHRDashboardClient';

export const dynamic = 'force-dynamic';

export default async function ExecutiveHRDashboard() {
  const employees = (await readEmployeeDirectoryFromDb().catch(() => null)) || [];
  const attendance = await readLiveDailyAttendance().catch(() => null);
  return (
    <HRISDashboardLayout>
      <ExecutiveHRDashboardClient employees={employees} attendanceRecords={attendance?.records || []} attendanceDate={attendance?.attendanceDate || null} generatedAt={new Date().toISOString()} />
    </HRISDashboardLayout>
  );
}
