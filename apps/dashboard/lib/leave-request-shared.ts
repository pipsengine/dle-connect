const clean = (value: unknown) => String(value || '').trim();

export type LeaveWorkflowStage = 'Employee' | 'Supervisor' | 'HR' | 'Final Approval' | 'Closed';

export type LeaveNormalizedStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Withdrawn'
  | 'Cancelled'
  | 'Terminated'
  | 'Completed';

export const isLeaveEssRequest = (item: {
  category?: string;
  startDate?: string | null;
  endDate?: string | null;
}) => /leave/i.test(clean(item.category)) && Boolean(item.startDate && item.endDate);

export const isTerminalLeaveStatus = (status: string) =>
  ['Approved', 'Rejected', 'Terminated', 'Closed', 'Completed', 'Cancelled', 'Withdrawn'].includes(status);

export const isPendingLeaveStatus = (status: string) => !isTerminalLeaveStatus(status);

const LINE_MANAGER_EMAIL_SENT = /line manager email delivered/i;
const LINE_MANAGER_STAGE_DONE = /line manager\s*\/\s*supervisor approval completed|routed to hr manager/i;

/**
 * True once the line manager has approved, or the approval email was already sent.
 * The portal repair job must not send another line-manager approval email after this.
 */
export const lineManagerApprovalAlreadyRecorded = (request: {
  status?: string | null;
  comments?: Array<{ comment?: string | null }> | null;
  workflow?: Array<{ stage?: string | null; status?: string | null }> | null;
}) => {
  const status = clean(request.status);
  if (['HR Review', 'Approved', 'Rejected', 'Terminated', 'Closed', 'Cancelled', 'Withdrawn', 'Completed'].includes(status)) {
    return true;
  }
  if ((request.comments || []).some((entry) => {
    const comment = clean(entry?.comment);
    return LINE_MANAGER_EMAIL_SENT.test(comment) || LINE_MANAGER_STAGE_DONE.test(comment);
  })) {
    return true;
  }
  return (request.workflow || []).some((step) =>
    /line manager|supervisor/i.test(clean(step?.stage))
    && /completed|approved/i.test(clean(step?.status)));
};

/** Repair may send the line-manager approval email only while that stage is still open. */
export const leaveRequestStillNeedsLineManagerEmail = (request: {
  category?: string | null;
  status?: string | null;
  comments?: Array<{ comment?: string | null }> | null;
  workflow?: Array<{ stage?: string | null; status?: string | null }> | null;
}) => {
  if (clean(request.category) && !/leave/i.test(clean(request.category))) return false;
  if (lineManagerApprovalAlreadyRecorded(request)) return false;
  const status = clean(request.status);
  if (status === 'Line Manager Review' || status === 'Submitted') return true;
  if (status !== 'Under Review') return false;
  const hrIsCurrent = (request.workflow || []).some((step) =>
    /hr manager|^hr$/i.test(clean(step?.stage)) && /current/i.test(clean(step?.status)));
  return !hrIsCurrent;
};

export const workflowStageForEssStatus = (
  rawStatus: string,
  normalized: LeaveNormalizedStatus,
): LeaveWorkflowStage => {
  const lower = clean(rawStatus).toLowerCase();
  if (lower === 'line manager review') return 'Supervisor';
  if (lower === 'hr review') return 'HR';
  if (normalized === 'Draft') return 'Employee';
  if (normalized === 'Submitted') return 'Supervisor';
  if (normalized === 'Under Review') return 'HR';
  if (normalized === 'Approved' || normalized === 'Completed') return 'Final Approval';
  return 'Closed';
};

export const approvalStatusForEss = (normalized: LeaveNormalizedStatus, rawStatus: string) => {
  const lower = clean(rawStatus).toLowerCase();
  if (lower === 'line manager review') return 'Awaiting Line Manager';
  if (lower === 'hr review') return 'Awaiting HR';
  if (['Approved', 'Completed'].includes(normalized)) return 'Approved';
  if (normalized === 'Rejected') return 'Rejected';
  if (['Cancelled', 'Withdrawn', 'Terminated'].includes(normalized)) return normalized;
  return 'Pending';
};
