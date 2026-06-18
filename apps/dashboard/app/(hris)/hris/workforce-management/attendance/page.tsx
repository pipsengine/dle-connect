import AttendanceActivityClient from './AttendanceActivityClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function WorkforceAttendancePage() {
  return <AttendanceActivityClient initialNow={new Date().toISOString()} />;
}
