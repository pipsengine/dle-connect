import { NextResponse } from 'next/server';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import {
  calculateTimesheetPeriod,
  readTimesheetPeriodSummaries,
  updateTimesheetPeriodStatus,
  type TimesheetPeriod,
} from '@/lib/timesheet-entry-store';

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

type PeriodPayload = {
  action?: 'OPEN_PERIOD' | 'CLOSE_PERIOD';
  year?: number;
  month?: number;
  periodId?: string;
};

const monthDateFromPayload = (payload: PeriodPayload) => {
  if (payload.year && payload.month) {
    if (payload.month < 1 || payload.month > 12) throw new Error('Month must be between 1 and 12.');
    return new Date(payload.year, payload.month - 1, 15);
  }
  if (payload.periodId) {
    const match = payload.periodId.match(/^per-(\d{4})-(\d{2})$/);
    if (!match) throw new Error('Invalid period id.');
    return new Date(Number(match[1]), Number(match[2]) - 1, 15);
  }
  throw new Error('A period month or period id is required.');
};

const buildPayload = async (request: Request) => {
  const access = resolveAccessContext(request);
  const permissions = getUiPermissions(access);
  const currentPeriod = calculateTimesheetPeriod(new Date());

  return {
    generatedAt: new Date().toISOString(),
    periodRule: {
      description: 'Each monthly timesheet period runs from the 16th of the previous month to the 15th of the selected month.',
      startDay: 16,
      endDay: 15,
    },
    currentPeriodId: currentPeriod.id,
    periods: await readTimesheetPeriodSummaries(14),
    permissions: {
      actor: access.actor,
      role: access.role,
      canManagePeriod: permissions.canManageTimesheetPeriods || access.role === 'OrganizationAdmin',
    },
  };
};

export async function GET(request: Request) {
  try {
    return ok(await buildPayload(request));
  } catch (error) {
    console.error('Timesheet Period API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Internal Server Error');
  }
}

export async function PATCH(request: Request) {
  const access = resolveAccessContext(request);
  const permissions = getUiPermissions(access);

  if (!permissions.canManageTimesheetPeriods && access.role !== 'OrganizationAdmin') {
    return err(403, 'You do not have permission to manage timesheet periods.');
  }

  try {
    const payload = await request.json() as PeriodPayload;
    if (!payload.action || !['OPEN_PERIOD', 'CLOSE_PERIOD'].includes(payload.action)) {
      return err(400, 'Action must be OPEN_PERIOD or CLOSE_PERIOD.');
    }

    const periodDate = monthDateFromPayload(payload);
    const targetPeriod = calculateTimesheetPeriod(periodDate);
    const currentPeriod = calculateTimesheetPeriod(new Date());
    if (targetPeriod.endDate > currentPeriod.endDate) {
      return err(400, 'Future timesheet periods are not available yet.');
    }
    const status: TimesheetPeriod['status'] = payload.action === 'OPEN_PERIOD' ? 'Open' : 'Closed';
    await updateTimesheetPeriodStatus(periodDate, status, access.actor);

    return ok(await buildPayload(request));
  } catch (error) {
    console.error('Timesheet Period API Error:', error);
    return err(400, error instanceof Error ? error.message : 'Unable to update timesheet period.');
  }
}
