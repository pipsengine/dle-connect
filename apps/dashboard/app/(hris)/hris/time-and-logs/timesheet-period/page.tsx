import { Suspense } from 'react';
import TimesheetPeriodClient from '@/app/(hris)/hris/time-and-logs/timesheet-period/TimesheetPeriodClient';

export default function TimesheetPeriodPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TimesheetPeriodClient />
    </Suspense>
  );
}
