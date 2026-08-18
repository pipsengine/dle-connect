/**
 * Workforce Portal (ESS) is unpublished until go-live.
 * Flip this to true when the portal is ready to restore for users.
 */
export const WORKFORCE_PORTAL_ENABLED = false;

export const isWorkforcePortalPath = (pathname: string) =>
  pathname === '/workforce-portal'
  || pathname.startsWith('/workforce-portal/')
  || pathname === '/api/workforce-portal'
  || pathname.startsWith('/api/workforce-portal/');

/** Email leave approve/reject still needs these paths while the portal UI is dark. */
export const isWorkforcePortalExceptionPath = (pathname: string) =>
  pathname.startsWith('/workforce-portal/leave-approval/authorize')
  || pathname.startsWith('/api/workforce-portal/leave-email-action');
