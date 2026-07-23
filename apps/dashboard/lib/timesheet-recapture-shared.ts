/** Client-safe recapture guide + shared gap typing (no Node/SQL imports). */

export const TIMESHEET_RECAPTURE_GUIDE = {
  title: 'Timesheet Recapture Guide',
  summary: 'Use this when days were omitted or incomplete. Recapture is allowed until payroll is submitted for approval.',
  steps: [
    {
      title: '1. Find missing days',
      detail: 'Open Timesheet Reports → Missing Days / Recapture. Review employees and dates without a payable work day in the selected range.',
    },
    {
      title: '2. Open or reopen the day',
      detail: 'If no sheet exists, create a Draft day sheet. If the sheet is already in approval, use Recapture Reopen — this returns it for correction with a full audit trail.',
    },
    {
      title: '3. Capture and re-submit',
      detail: 'In Timesheet Entry, book hours/allocations on the returned or draft sheet, then Submit again so the normal approval chain restarts.',
    },
    {
      title: '4. Hard stop after payroll submit',
      detail: 'Once any payroll run for that period is Submitted (or later in approval/release), timesheet recapture is blocked. Use payroll Request Revision first if the period must change.',
    },
  ],
  rules: [
    'Draft / Returned / Rejected sheets can be edited directly while the timesheet period is Open.',
    'Submitted through GM-reviewed sheets must be reopened (Returned) before capture changes.',
    'HR payroll-ready (HR_Acknowledged) sheets need HR/Payroll recapture unlock, and only before payroll submit.',
    'Locked timesheets and Closed/Locked periods cannot be recaptured here.',
    'Never silent-edit an approved sheet — always reopen so approvals restart.',
  ],
} as const;

export type MissingTimesheetDay = {
  id: string;
  employeeKey: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  date: string;
  weekday: string;
  reason: 'no-entry' | 'needs-reopen' | 'editable-incomplete';
  headerId: string | null;
  headerStatus: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  workCenterName: string | null;
  recaptureAllowed: boolean;
  blockReason: string | null;
  suggestedAction: 'open-draft' | 'reopen' | 'continue-edit' | 'blocked';
};
