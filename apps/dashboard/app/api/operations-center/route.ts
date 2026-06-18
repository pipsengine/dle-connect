import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { readOperationsCenterPayload } from '@/lib/operations-center-store';

const ok = (data: unknown) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

export async function GET(request: NextRequest) {
  try {
    const session = await sessionFrom(request);
    if (!session) return err(401, 'Unauthenticated.');
    const section = request.nextUrl.searchParams.get('section') || 'operations-dashboard';
    const payload = await readOperationsCenterPayload({
      section,
      actor: session.fullName || session.username,
      roles: session.roles,
      permissions: session.permissions,
    });
    if (request.nextUrl.searchParams.get('format') === 'csv') {
      const rows = payload.timesheets.records.map((item) => [item.date, item.supervisor, item.workCenter, item.status, item.stage, item.employees, item.totalHours, item.payrollStatus]);
      const csv = [['Date', 'Supervisor', 'Work Center', 'Status', 'Stage', 'Employees', 'Hours', 'Payroll'], ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="operations-center-timesheets.csv"',
        },
      });
    }
    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load Operations Center.');
  }
}
