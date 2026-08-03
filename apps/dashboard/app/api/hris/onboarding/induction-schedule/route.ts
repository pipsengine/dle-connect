import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  buildInductionScheduleWorkspace,
  previewDepartmentStops,
  scheduleInductionTour,
  updateInductionStop,
  type InductionStopStatus,
} from '@/lib/induction-schedule-service';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const resolveActor = async () => {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  return session?.fullName || session?.username || session?.sub || 'HR User';
};

const resolveBaseUrl = async () => {
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host');
  const proto = headerStore.get('x-forwarded-proto') || 'https';
  return host ? `${proto}://${host}` : null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('preview') === 'stops') {
      const startDate = String(searchParams.get('startDate') || new Date().toISOString());
      const departments = searchParams.getAll('department').map((item) => item.trim()).filter(Boolean);
      const stops = await previewDepartmentStops({ startDate, departments });
      return jsonOk({ stops });
    }
    const workspace = await buildInductionScheduleWorkspace();
    return jsonOk(workspace);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load induction schedule.');
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolveActor();
    const baseUrl = await resolveBaseUrl();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'schedule-tour').trim();

    if (action === 'schedule-tour') {
      const result = await scheduleInductionTour({
        tourId: body.tourId,
        hireName: body.hireName,
        hireEmail: body.hireEmail,
        employeeCode: body.employeeCode,
        employeeDbId: body.employeeDbId == null || body.employeeDbId === '' ? null : Number(body.employeeDbId),
        destinationDepartment: body.destinationDepartment,
        startDate: body.startDate,
        notes: body.notes,
        departments: Array.isArray(body.departments) ? body.departments : [],
        stopOverrides: Array.isArray(body.stopOverrides) ? body.stopOverrides : [],
        notifyManagers: body.notifyManagers !== false,
        actor,
        baseUrl,
      });
      return jsonOk({
        tour: result.tour,
        workspace: result.workspace,
        notifications: result.notifications,
        notifiedCount: result.notifiedCount,
        message: `Induction tour scheduled. ${result.notifiedCount} manager notification${result.notifiedCount === 1 ? '' : 's'} sent.`,
      });
    }

    if (action === 'update-stop') {
      const tourId = String(body.tourId || '').trim();
      const stopId = String(body.stopId || '').trim();
      if (!tourId || !stopId) return jsonErr(400, 'tourId and stopId are required.');
      const result = await updateInductionStop({
        tourId,
        stopId,
        status: body.status ? String(body.status).trim() as InductionStopStatus : undefined,
        scheduledFor: body.scheduledFor,
        facilitatorName: body.facilitatorName,
        facilitatorEmail: body.facilitatorEmail,
        facilitatorEmployeeCode: body.facilitatorEmployeeCode,
        venue: body.venue,
        notes: body.notes,
        notifyManager: Boolean(body.notifyManager),
        actor,
        baseUrl,
      });
      return jsonOk({
        tour: result.tour,
        workspace: result.workspace,
        notification: result.notification,
        message: 'Induction stop updated.',
      });
    }

    return jsonErr(400, 'Unsupported induction action.');
  } catch (error) {
    return jsonErr(400, error instanceof Error ? error.message : 'Unable to save induction schedule.');
  }
}
