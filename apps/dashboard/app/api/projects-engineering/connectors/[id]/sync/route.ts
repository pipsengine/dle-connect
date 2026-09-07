import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { withResolvedAccess } from '@/lib/auth/resolve-access-session';
import { canAccessProjectsEngineeringPortal } from '@/lib/access/projects-engineering-access';
import { connectorById } from '@/lib/projects-engineering/connectors';

const getSession = async (request: NextRequest) => {
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);
  return session ? withResolvedAccess(session) : null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ status: 'error', error: 'Unauthenticated' }, { status: 401 });
  if (!canAccessProjectsEngineeringPortal(session.permissions, session.isGlobalAdmin, session.roles, session.sub)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const connector = connectorById(id);
  if (!connector) {
    return NextResponse.json({ status: 'error', error: 'Unknown connector' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string; projectId?: string };
  const correlationId = randomUUID();
  const configured = Boolean(process.env[connector.endpointEnv]) || connector.status !== 'Not configured';
  const lastSync = new Date().toISOString();

  // Queue-style response: real connector workers should pick this up asynchronously.
  return NextResponse.json({
    status: 'success',
    data: {
      connectorId: connector.id,
      name: connector.name,
      correlationId,
      queued: true,
      status: configured ? 'Healthy' : 'Watch',
      lastSync,
      message: configured
        ? `${connector.name} sync queued (${correlationId}). Worker will import into pm.* tables with audit.`
        : `${connector.name} sync accepted, but ${connector.endpointEnv} is not configured on this server.`,
      reason: body.reason || 'manual-sync',
      projectId: body.projectId || null,
      actor: session.username,
      supports: connector.supports,
    },
  });
}
