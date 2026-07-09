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
