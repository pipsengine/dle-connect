import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildInductionScheduleWorkspace,
  upsertInductionSession,
  type InductionKind,
  type InductionStatus,
} from '@/lib/induction-schedule-service';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return session?.fullName || session?.username || session?.sub || 'HR User';
};

export async function GET() {
  try {
    const workspace = await buildInductionScheduleWorkspace();
    return jsonOk(workspace);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load induction schedule.');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'upsert-session').trim();
    if (action !== 'upsert-session') return jsonErr(400, 'Unsupported induction action.');

    const employeeCode = String(body.employeeCode || '').trim();
    const employeeName = String(body.employeeName || '').trim();
    const kind = String(body.kind || '').trim() as InductionKind;
    const status = String(body.status || 'Scheduled').trim() as InductionStatus;
    const scheduledFor = String(body.scheduledFor || '').trim();
    if (!employeeCode) return jsonErr(400, 'employeeCode is required.');
    if (!employeeName) return jsonErr(400, 'employeeName is required.');
    if (!kind) return jsonErr(400, 'kind is required.');
    if (!scheduledFor) return jsonErr(400, 'scheduledFor is required.');

    const session = await upsertInductionSession({
      id: body.id,
      employeeDbId: body.employeeDbId == null ? null : Number(body.employeeDbId),
      employeeCode,
      employeeName,
      department: body.department,
      jobTitle: body.jobTitle,
      location: body.location,
      kind,
      status,
      scheduledFor,
      facilitator: body.facilitator,
      venue: body.venue,
      notes: body.notes,
      actor,
    });
    const workspace = await buildInductionScheduleWorkspace();
    return jsonOk({ session, workspace, message: 'Induction session saved.' });
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to save induction session.');
  }
}
