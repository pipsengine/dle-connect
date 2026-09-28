import { NextResponse } from 'next/server';
import { hasPermission } from '@/lib/auth/permission-match';
import { resolveAccessContext } from '@/lib/hris-access';
import {
  listPublicHolidays,
  listReviewSupervisors,
  listReviewTimesheets,
  listTimesheetEntrySheets,
  readTimesheetEntryById,
  resolveTimesheetEntry,
  savePublicHoliday,
  saveTimesheetEntry,
  searchTimesheetEntry,
  submitTimesheetEntry,
} from '@/lib/timesheet-entry-workspace';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const allowed = (request: Request) => {
  const permissions = (request.headers.get('x-auth-permissions') || '').split(',').map((item) => item.trim()).filter(Boolean);
  return hasPermission(permissions, 'view_timesheet_management') || request.headers.get('x-auth-global-admin') === '1';
};

export async function GET(request: Request) {
  if (!allowed(request)) return err(403, 'You do not have permission to open Timesheet Entry.');
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'resolve';
  try {
    if (mode === 'search') return ok(await searchTimesheetEntry(url.searchParams.get('kind') || '', url.searchParams.get('q') || '', url.searchParams.get('workDate') || ''));
    if (mode === 'list') return ok(await listTimesheetEntrySheets(url.searchParams.get('status') || ''));
    if (mode === 'review') return ok(await listReviewTimesheets({ periodId: url.searchParams.get('periodId') || '', workDate: url.searchParams.get('workDate') || '' }));
    if (mode === 'review-supervisors') return ok(await listReviewSupervisors({ periodId: url.searchParams.get('periodId') || '', workDate: url.searchParams.get('workDate') || '' }));
    if (mode === 'sheet') return ok(await readTimesheetEntryById(url.searchParams.get('id') || ''));
    if (mode === 'holidays') return ok(await listPublicHolidays());
    return ok(await resolveTimesheetEntry({
      periodId: url.searchParams.get('periodId') || '',
      workDate: url.searchParams.get('workDate') || '',
      supervisor: url.searchParams.get('supervisor') || '',
      supervisorCode: url.searchParams.get('supervisorCode') || '',
      shift: url.searchParams.get('shift') || 'Day',
      location: url.searchParams.get('location') || '',
    }));
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to load timesheet entry.');
  }
}

export async function POST(request: Request) {
  if (!allowed(request)) return err(403, 'You do not have permission to update Timesheet Entry.');
  const access = resolveAccessContext(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === 'save') {
      const saved = await saveTimesheetEntry({
        periodId: String(body.periodId || ''),
        workDate: String(body.workDate || ''),
        supervisor: String(body.supervisor || ''),
        location: String(body.location || ''),
        workCenter: String(body.workCenter || ''),
        shift: String(body.shift || 'Day'),
        lines: Array.isArray(body.lines) ? body.lines as never : [],
        actor: access.actor,
        action: body.intent === 'review' ? 'review' : 'save',
      });
      return ok(saved);
    }
    if (body.action === 'submit') return ok(await submitTimesheetEntry(String(body.id || ''), access.actor));
    if (body.action === 'save-holiday') {
      const id = await savePublicHoliday({
        name: String(body.name || ''),
        date: String(body.date || ''),
        holidayType: String(body.holidayType || 'Declared'),
        scope: String(body.scope || 'National'),
        region: String(body.region || ''),
        source: String(body.source || ''),
        actor: access.actor,
      });
      return ok({ id, holidays: await listPublicHolidays() });
    }
    return err(400, 'Unknown timesheet entry action.');
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to save the timesheet.');
  }
}
