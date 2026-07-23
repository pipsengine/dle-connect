import { NextResponse } from 'next/server';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import { findMissingTimesheetDays, getTimesheetRecaptureGate } from '@/lib/timesheet-recapture';
import { TIMESHEET_RECAPTURE_GUIDE } from '@/lib/timesheet-recapture-shared';
import { readTimesheetPeriod } from '@/lib/timesheet-entry-store';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = (value = today()) => `${value.slice(0, 8)}01`;

export async function GET(request: Request) {
  try {
    const access = resolveAccessContext(request);
    const uiPermissions = getUiPermissions(access);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || monthStart();
    const to = searchParams.get('to') || today();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return err(400, 'from and to must be YYYY-MM-DD dates.');
    }
    if (from > to) return err(400, 'from date cannot be after to date.');

    const period = await readTimesheetPeriod(new Date(`${to}T12:00:00`));
    const gate = await getTimesheetRecaptureGate(period.id);
    const missingDays = await findMissingTimesheetDays({ from, to, maxGaps: 500 });

    return ok({
      generatedAt: new Date().toISOString(),
      from,
      to,
      period: { id: period.id, name: period.name, status: period.status },
      permissions: {
        actor: uiPermissions.actor,
        role: uiPermissions.role,
        canRecapture: Boolean(uiPermissions.canApproveTimesheet || uiPermissions.canManageTimesheetPeriods),
      },
      gate,
      recaptureGates: missingDays.gateByPeriod,
      missingDays: missingDays.gaps,
      missingDayCount: missingDays.gaps.length,
      recaptureGuide: TIMESHEET_RECAPTURE_GUIDE,
    });
  } catch (error) {
    console.error('Timesheet recapture API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Unable to load timesheet recapture workspace.');
  }
}
