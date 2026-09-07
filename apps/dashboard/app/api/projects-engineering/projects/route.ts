import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { canAccessProjectsEngineeringPortal } from '@/lib/access/projects-engineering-access';
import { projects } from '@/lib/projects-engineering/data';
import { pmQuery } from '@/lib/projects-engineering/db';
import { parseProjectCreate } from '@/lib/projects-engineering/validators';

const getSession = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions || [], session.isGlobalAdmin)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  try {
    const rows = await pmQuery('SELECT TOP 200 * FROM pm.Projects WHERE IsDeleted=0 ORDER BY ModifiedAt DESC');
    return NextResponse.json({ status: 'success', data: { projects: rows, source: 'sql' } });
  } catch {
    return NextResponse.json({
      status: 'success',
      data: {
        projects,
        source: 'demo',
        warning: 'SQL pm.Projects unavailable — serving portfolio demo data until DLE_SQL_CONNECTION_STRING / schema is applied.',
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions || [], session.isGlobalAdmin)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseProjectCreate(body);
  if (parsed.error || !parsed.data) {
    return NextResponse.json({ status: 'error', error: parsed.error || 'Invalid project request' }, { status: 400 });
  }

  return NextResponse.json(
    {
      status: 'success',
      data: {
        message: 'Validated. Wire to pm.usp_ProjectCreate with authenticated actor context.',
        project: parsed.data,
        actor: session.username,
      },
    },
    { status: 202 },
  );
}
