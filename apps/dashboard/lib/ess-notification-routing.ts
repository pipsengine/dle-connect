import type { SessionPayload } from '@/lib/auth/session';

const compact = (value: unknown) => String(value || '').trim();

export const isEssSelfServiceSession = (session: SessionPayload) =>
  Boolean(compact(session.employeeCode) || compact(session.employeeId))
  || session.permissions.includes('ess.view')
  || session.permissions.includes('profile.view');

const ESS_HREF_MAP: Array<[string, string]> = [
  ['/hris/employees/employee-profile', '/workforce-portal?tab=profile'],
  ['/hris/payroll/payslip-generation', '/workforce-portal?tab=payroll'],
  ['/hris/announcements', '/workforce-portal?tab=communication'],
  ['/hris/administration/approval-workflow', '/workforce-portal?tab=leave&leaveSection=Approvals'],
  ['/hris/time-and-logs/timesheet-approval', '/workforce-portal?tab=time'],
  ['/hris/performance-management/performance-reviews/internship-performance-review', '/workforce-portal?tab=performance&performanceSection=internship'],
  ['/hris/administration/audit-trail', '/workforce-portal?tab=security'],
  ['/workforce-portal?tab=leave', '/workforce-portal?tab=leave&leaveSection=Approvals'],
];

export const normalizeEssNotificationHref = (href?: string) => {
  const value = compact(href);
  if (!value) return undefined;
  if (value.startsWith('/workforce-portal')) return value;
  if (value.startsWith('/hris/employees/employee-profile')) return '/workforce-portal?tab=profile';
  const mapped = ESS_HREF_MAP.find(([from]) => value === from || value.startsWith(`${from}?`) || value.startsWith(`${from}/`));
  if (mapped) return mapped[1];
  if (value.startsWith('/hris/')) return '/workforce-portal?tab=dashboard';
  return value;
};

export const shouldUseEssNotificationRouting = (session: SessionPayload, essContext = false) =>
  essContext || isEssSelfServiceSession(session);

export const essSeedNotificationHrefs = (session: SessionPayload) => ({
  [`security-session-${session.sub}`]: '/workforce-portal?tab=security',
  [`profile-review-${session.sub}`]: '/workforce-portal?tab=profile',
  [`payslip-ready-${session.sub}`]: '/workforce-portal?tab=payroll',
  [`hr-message-${session.sub}`]: '/workforce-portal?tab=communication',
  [`approval-queue-${session.sub}`]: '/workforce-portal?tab=leave&leaveSection=Approvals',
  [`timesheet-approval-${session.sub}`]: '/workforce-portal?tab=time',
});

export const resolveNotificationHref = (session: SessionPayload, href?: string, essContext = false) => {
  if (!href) return undefined;
  return shouldUseEssNotificationRouting(session, essContext) ? normalizeEssNotificationHref(href) : href;
};

export const isLiveNotificationId = (id: string) => id.startsWith('live-');
