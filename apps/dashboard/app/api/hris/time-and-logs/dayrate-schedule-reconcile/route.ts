import { NextResponse } from 'next/server';
import { AUTH_COOKIE, hasPermission as hasAccPermission, verifySessionToken } from '@/lib/auth/session';
import { isHrPortalUser } from '@/lib/access/route-access';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import { getActivePayrollPeriod, listPayrollPeriods } from '@/lib/payroll-period-store';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { buildTimesheetHoursMapForPayrollPeriod } from '@/lib/timesheet-entry-store';
import {
  applyDayrateScheduleOverride,
  buildDayrateScheduleReconcile,
  clearDayrateScheduleOverride,
  previewDayrateScheduleWorkbook,
  readAppliedDayrateScheduleOverride,
} from '@/lib/dayrate-schedule-override-store';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const MAX_XLSX_BYTES = 12 * 1024 * 1024;

const tokenFrom = (request: Request) =>
  request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');

const sessionFrom = (request: Request) =>
  verifySessionToken(tokenFrom(request) ? decodeURIComponent(tokenFrom(request) || '') : '');

const workbookFromBase64 = (value: unknown, fileName: unknown) => {
  const name = String(fileName || '').trim() || 'dayrate-payment-schedule.xlsx';
  if (!/\.xlsx$/i.test(name)) throw Object.assign(new Error('Upload a .xlsx Dayrate Payment Schedule workbook.'), { status: 400 });
  const raw = String(value || '').trim();
  if (!raw) throw Object.assign(new Error('Workbook file is required.'), { status: 400 });
  const payload = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length) throw Object.assign(new Error('Workbook file is empty or not valid base64.'), { status: 400 });
  if (buffer.length > MAX_XLSX_BYTES) throw Object.assign(new Error('Workbook is larger than 12 MB.'), { status: 400 });
  return { buffer, fileName: name };
};

const appliedMeta = (applied: ReturnType<typeof readAppliedDayrateScheduleOverride>) => {
  if (!applied) return null;
  return {
    period: applied.period,
    fileName: applied.fileName,
    title: applied.title,
    appliedAt: applied.appliedAt,
    appliedBy: applied.appliedBy,
    employeeCount: applied.rows.length,
    sheets: applied.sheets,
    skippedCount: applied.skipped.length,
  };
};

async function actorContext(request: Request) {
  const session = await sessionFrom(request);
  const access = resolveAccessContext(request);
  const uiPermissions = getUiPermissions(access);
  const canApply = Boolean(
    (session && (isHrPortalUser(session) || session.isGlobalAdmin))
    || hasAccPermission(access.accPermissions, '*')
    || hasAccPermission(access.accPermissions, 'timesheet.hr.approve')
    || hasAccPermission(access.accPermissions, 'timesheet.payroll.approve'),
  );
  return {
    session,
    actor: session?.fullName || session?.username || uiPermissions.actor || 'HR',
    role: uiPermissions.role,
    canApply,
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await actorContext(request);
    const { searchParams } = new URL(request.url);
    const { activePeriod, periods } = await listPayrollPeriods();
    const period = (searchParams.get('period') || activePeriod || await getActivePayrollPeriod()).slice(0, 7);
    const applied = readAppliedDayrateScheduleOverride(period);
    let reconcile = null;
    if (applied) {
      const employees = (await readPayrollEmployees()).employees;
      const timesheetHours = await buildTimesheetHoursMapForPayrollPeriod(period, { ignoreDayrateScheduleOverride: true });
      reconcile = buildDayrateScheduleReconcile(applied.rows, employees, timesheetHours);
    }
    return ok({
      generatedAt: new Date().toISOString(),
      period,
      periods: periods.map((item) => ({ period: item.period, periodLabel: item.periodLabel, status: item.status })),
      permissions: { actor: ctx.actor, role: ctx.role, canApply: ctx.canApply },
      applied: appliedMeta(applied),
      reconcile,
      guide: {
        title: 'Dayrate Payment Schedule',
        points: [
          'Upload the official DLE / DLPC Dayrate Payment Schedule workbook. Excel is the source of truth for this payroll period.',
          'C-codes in Excel are paid from weekday days, OT, weekend, public holiday, night amount, site, TCM, transport, and arrears.',
          'Meal stays auto ₦500 × weekday days. Do not import Excel meal, gross, net, WHT, or bank sheets.',
          'C-codes booked in DLE Connect but missing from Excel are dropped from daily-rate pay. Day timesheets are not rewritten.',
        ],
      },
    });
  } catch (error) {
    console.error('Dayrate schedule reconcile API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Unable to load dayrate schedule workspace.');
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await actorContext(request);
    const body = await request.json().catch(() => ({})) as {
      action?: string;
      period?: string;
      fileName?: string;
      fileBase64?: string;
    };
    const period = String(body.period || '').trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) return err(400, 'Payroll period is required (YYYY-MM).');

    if (body.action === 'preview') {
      const file = workbookFromBase64(body.fileBase64, body.fileName);
      const preview = await previewDayrateScheduleWorkbook({ period, workbook: file.buffer });
      return ok({
        period,
        action: 'preview',
        fileName: file.fileName,
        title: preview.parsed.title,
        sheets: preview.parsed.sheets,
        skipped: preview.parsed.skipped,
        reconcile: preview.reconcile,
      });
    }

    if (!ctx.canApply) return err(403, 'Only HR or Payroll can apply or clear the dayrate schedule overlay.');

    if (body.action === 'apply') {
      const file = workbookFromBase64(body.fileBase64, body.fileName);
      const applied = await applyDayrateScheduleOverride({
        period,
        fileName: file.fileName,
        workbook: file.buffer,
        actor: ctx.actor,
      });
      const employees = (await readPayrollEmployees()).employees;
      const timesheetHours = await buildTimesheetHoursMapForPayrollPeriod(period, { ignoreDayrateScheduleOverride: true });
      const reconcile = buildDayrateScheduleReconcile(applied.rows, employees, timesheetHours);
      return ok({
        period,
        action: 'apply',
        applied: appliedMeta(applied),
        reconcile,
      });
    }

    if (body.action === 'clear') {
      const cleared = await clearDayrateScheduleOverride(period);
      return ok({ period: cleared.period, action: 'clear', applied: null, reconcile: null });
    }

    return err(400, 'Unknown action. Use preview, apply, or clear.');
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 400;
    console.error('Dayrate schedule reconcile API Error:', error);
    return err(status >= 400 && status < 600 ? status : 400, error instanceof Error ? error.message : 'Unable to process dayrate schedule workbook.');
  }
}
