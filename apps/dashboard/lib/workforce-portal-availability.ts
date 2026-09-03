/**
 * Workforce Portal (ESS) — enabled for all employees.
 */
export const WORKFORCE_PORTAL_ENABLED = true;

export const isWorkforcePortalPath = (pathname: string) =>
  pathname === '/workforce-portal'
  || pathname.startsWith('/workforce-portal/')
  || pathname === '/api/workforce-portal'
  || pathname.startsWith('/api/workforce-portal/');

/** Email leave approve/reject still needs these paths while the portal UI is dark. */
export const isWorkforcePortalExceptionPath = (pathname: string) =>
  pathname.startsWith('/workforce-portal/leave-approval/authorize')
  || pathname.startsWith('/api/workforce-portal/leave-email-action');
