import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildNewHireChecklistWorkspace,
  updateNewHireChecklistTask,
  type ChecklistTaskStatus,
} from '@/lib/new-hire-checklist-service';

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
    const workspace = await buildNewHireChecklistWorkspace();
    return jsonOk(workspace);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load new hire checklist.');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'update-task').trim();
    if (action !== 'update-task') return jsonErr(400, 'Unsupported checklist action.');

    const employeeDbId = Number(body.employeeDbId);
    const externalId = String(body.externalId || '').trim();
    const status = String(body.status || '').trim() as ChecklistTaskStatus;
    if (!Number.isFinite(employeeDbId) || employeeDbId <= 0) return jsonErr(400, 'employeeDbId is required.');
    if (!externalId) return jsonErr(400, 'externalId is required.');
    if (!status) return jsonErr(400, 'status is required.');

    const result = await updateNewHireChecklistTask({
      employeeDbId,
      externalId,
      title: body.title,
      status,
      responsibleOfficer: body.responsibleOfficer,
      dueDate: body.dueDate ?? null,
      notes: body.notes ?? null,
      actor,
    });
    const workspace = await buildNewHireChecklistWorkspace();
    return jsonOk({ ...result, workspace });
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to update checklist task.');
  }
}
