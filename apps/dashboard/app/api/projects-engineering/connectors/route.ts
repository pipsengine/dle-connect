import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { canAccessProjectsEngineeringPortal } from '@/lib/access/projects-engineering-access';
import { PM_CONNECTORS } from '@/lib/projects-engineering/connectors';

const getSession = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions || [], session.isGlobalAdmin)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    status: 'success',
    data: {
      connectors: PM_CONNECTORS,
      counts: {
        total: PM_CONNECTORS.length,
        healthy: PM_CONNECTORS.filter((item) => item.status === 'Healthy').length,
        watch: PM_CONNECTORS.filter((item) => item.status === 'Watch').length,
        notConfigured: PM_CONNECTORS.filter((item) => item.status === 'Not configured').length,
      },
    },
  });
}
