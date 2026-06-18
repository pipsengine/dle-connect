import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, hasPermission, isPublicPath, verifySessionToken } from '@/lib/auth/session';

const requiredPermission = (pathname: string) => {
  if (pathname.startsWith('/api/current-user') || pathname.startsWith('/api/auth/me') || pathname.startsWith('/api/notifications')) return '';
  if (pathname.startsWith('/api/admin/users') || pathname.startsWith('/hris/administration/user-management')) return 'admin.users.view';
  if (pathname.startsWith('/api/admin/roles') || pathname.startsWith('/api/admin/access-control') || pathname.startsWith('/administration/access-control') || pathname.startsWith('/hris/administration/roles-and-permissions')) return 'admin.roles.view';
  if (pathname.startsWith('/api/admin/audit') || pathname.startsWith('/hris/administration/audit-trail')) return 'audit.view';
  if (pathname.startsWith('/administration/user-management')) return 'admin.users.view';
  if (pathname.startsWith('/administration/audit-trail')) return 'audit.view';
  if (pathname.startsWith('/administration/approval-workflow')) return 'workflow.configure';
  if (pathname.startsWith('/administration/system-settings')) return 'security.configure';
  if (pathname.startsWith('/administration/integrations')) return 'integration.view';
  if (pathname.startsWith('/administration/ai-and-automation')) return 'it.view';
  if (pathname.startsWith('/administration/compliance-and-governance')) return 'audit.view';
  if (pathname.startsWith('/administration')) return 'admin.roles.view';
  if (pathname.startsWith('/api/hris/payroll') || pathname.startsWith('/hris/payroll')) return 'payroll.view';
  if (pathname.startsWith('/api/hris/employees') || pathname.startsWith('/hris/employees')) return 'employees.view';
  if (pathname.startsWith('/api/hris/leave') || pathname.startsWith('/hris/leave-management')) return 'leave.view';
  if (pathname.startsWith('/api/hris/time-and-logs') || pathname.startsWith('/api/hris/workforce-management') || pathname.startsWith('/hris/workforce-management')) return 'hris.view';
  if (pathname.startsWith('/api/hris') || pathname.startsWith('/hris')) return 'hris.view';
  if (pathname.startsWith('/workforce-portal')) return '';
  if (pathname.startsWith('/api/operations-center') || pathname.startsWith('/operations-center/timesheets')) return 'operations.view';
  if (pathname.startsWith('/operations-center/workforce-allocation')) return 'operations.allocation.view';
  if (pathname.startsWith('/operations-center/resource-planning')) return 'operations.resource-planning.view';
  if (pathname.startsWith('/operations-center/daily-activity-reports')) return 'operations.daily-reports.create';
  if (pathname.startsWith('/operations-center/production-tracking')) return 'operations.production.view';
  if (pathname.startsWith('/operations-center')) return 'operations.view';
  if (pathname.startsWith('/finance-accounting')) return 'finance.view';
  if (pathname.startsWith('/procurement')) return 'procurement.view';
  if (pathname.startsWith('/projects-engineering')) return 'project.view';
  if (pathname.startsWith('/hse-management')) return 'hse.view';
  if (pathname.startsWith('/quality-management')) return 'quality.view';
  if (pathname.startsWith('/document-management')) return 'documents.view';
  return 'enterprise.view';
};

const isHrDepartmentUser = (session: Awaited<ReturnType<typeof verifySessionToken>>) => {
  if (!session) return false;
  if (session.isGlobalAdmin || session.roles.includes('Super Administrator')) return true;
  const text = `${session.department || ''} ${session.unit || ''} ${session.roles.join(' ')}`.toLowerCase();
  return /\bhr\b/.test(text) || text.includes('human resources') || text.includes('human resource') || text.includes('human capital');
};

const isHrSensitivePath = (pathname: string) => {
  if (!pathname.startsWith('/hris') && !pathname.startsWith('/api/hris')) return false;
  return !(
    pathname.startsWith('/hris/workforce-management') ||
    pathname.startsWith('/hris/time-and-logs') ||
    pathname.startsWith('/api/hris/time-and-logs') ||
    pathname.startsWith('/api/hris/workforce-management')
  );
};

const denied = (request: NextRequest, status = 403) => {
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json({ status: 'error', error: status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status });
  }
  const url = request.nextUrl.clone();
  url.pathname = status === 401 ? '/login' : '/access-denied';
  if (status === 401) url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/change-password')) {
    const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
    if (session?.isGlobalAdmin || (session && !session.firstLoginRequired && !session.passwordResetRequired)) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (!session) return denied(request, 401);

  if (!session.isGlobalAdmin && (session.firstLoginRequired || session.passwordResetRequired) && !pathname.startsWith('/change-password') && !pathname.startsWith('/api/auth/change-password')) {
    const url = request.nextUrl.clone();
    url.pathname = '/change-password';
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (isHrSensitivePath(pathname) && !isHrDepartmentUser(session)) return denied(request, 403);

  const permission = requiredPermission(pathname);
  if (permission && !hasPermission(session.permissions, permission)) return denied(request, 403);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-auth-user', session.username);
  requestHeaders.set('x-auth-roles', session.roles.join(','));
  requestHeaders.set('x-hris-actor', session.fullName || session.username);
  if (!requestHeaders.get('x-hris-role')) {
    requestHeaders.set('x-hris-role', session.roles.includes('Super Administrator') ? 'Super Administrator' : 'OrganizationAdmin');
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-auth-user', session.username);
  response.headers.set('x-auth-roles', session.roles.join(','));
  if (pathname.startsWith('/hris') || pathname.startsWith('/api/hris')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
