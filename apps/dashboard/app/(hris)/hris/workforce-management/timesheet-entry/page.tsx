import { Suspense } from 'react';
import TimesheetEntryClient from '@/app/(hris)/hris/time-and-logs/timesheet-entry/TimesheetEntryClient';

export default function WorkforceTimesheetEntryPage() {
  return (
    <Suspense fallback={<div>Loading timesheet entry...</div>}>
      <TimesheetEntryClient variant="workforce-supervisor" />
    </Suspense>
  );
}
