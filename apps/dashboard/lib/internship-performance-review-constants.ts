export const INTERNSHIP_REVIEW_CRITERIA = [
  'Demonstrates relevant technical skills and knowledge',
  'Manages time effectively and meets deadlines',
  'Completes assigned tasks with minimal errors and omissions',
  'Identifies problems independently; is self-driven and takes responsibility for tasks',
  'Works collaboratively with colleagues and communicates clearly and professionally',
  'Accepts and implements feedback effectively',
  'Demonstrates willingness to learn new skills',
  'Shows continuous improvement and potential to succeed as a trainee in the department',
  'Demonstrates professionalism in appearance, attitude, and conduct',
  'Suggests new ideas to improve processes or solve problems',
  'Consistently produces accurate, reliable and high-quality work',
] as const;

export const INTERNSHIP_RATING_LABELS: Record<number, string> = {
  5: 'Excellent',
  4: 'Good',
  3: 'Average',
  2: 'Fair',
  1: 'Poor',
};

export const INTERNSHIP_REVIEW_CYCLE = 'One-Year Internship Review';

export const INTERNSHIP_HR_ACTIONS = [
  'Commence trainee placement process',
  'Extend internship',
  'Close internship / exit process',
  'Hold pending manpower availability',
] as const;

export const INTERNSHIP_REVIEW_BASE_ROUTE = 'performance-reviews/internship-performance-review';

export const internshipReviewHref = (sub = '') =>
  `/hris/performance-management/${INTERNSHIP_REVIEW_BASE_ROUTE}${sub ? `/${sub.replace(/^\/+/, '')}` : ''}`;

export const ESS_INTERNSHIP_SECTION = 'internship';

export const internshipEssHref = (options?: { id?: string; action?: 'evaluate' | 'approve' }) => {
  const params = new URLSearchParams({
    tab: 'performance',
    performanceSection: ESS_INTERNSHIP_SECTION,
  });
  if (options?.id) params.set('internshipReviewId', options.id);
  if (options?.action) params.set('internshipAction', options.action);
  return `/workforce-portal?${params.toString()}`;
};

export const compareEmployeeCodesSerial = (left: string, right: string) =>
  String(left || '').localeCompare(String(right || ''), undefined, { numeric: true, sensitivity: 'base' });

export const parseInternshipReviewRoute = (route: string) => {
  const normalized = route.replace(/^\/+/, '');
  const prefix = INTERNSHIP_REVIEW_BASE_ROUTE;
  if (normalized !== prefix && !normalized.startsWith(`${prefix}/`)) {
    return { kind: 'none' as const };
  }
  const rest = normalized.slice(prefix.length).replace(/^\/+/, '');
  if (!rest) return { kind: 'dashboard' as const };
  if (rest === 'new') return { kind: 'new' as const };
  if (rest === 'my-tasks') return { kind: 'tasks' as const };
  if (rest === 'reports') return { kind: 'reports' as const };
  if (rest === 'settings') return { kind: 'settings' as const };
  const parts = rest.split('/');
  const id = parts[0] || '';
  if (parts[1] === 'evaluate') return { kind: 'evaluate' as const, id };
  if (parts[1] === 'approve') return { kind: 'approve' as const, id };
  if (parts[1] === 'hr-action') return { kind: 'hr-action' as const, id };
  return { kind: 'detail' as const, id };
};
