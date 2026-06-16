import { Suspense } from 'react';
import type { Metadata } from 'next';
import TimesheetEntryClient from '@/app/(hris)/hris/time-and-logs/timesheet-entry/TimesheetEntryClient';

export const metadata: Metadata = {
  title: 'Timesheet Entry',
};

export default function TimesheetEntryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TimesheetEntryClient />
    </Suspense>
  );
}
