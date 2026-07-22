import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { formatLeaveAllowanceAmount } from '@/lib/leave-allowance-policy';
import { buildLeaveReportExcelXml, leaveReportExcelFilename, leaveReportExcelResponseHeaders } from '@/lib/leave-excel-export';
import { auditLeaveAction, dormantLongPolicy, readLeaveManagementPayload, validateLeaveAction, type LeaveActionId, type LeaveRole } from '@/lib/leave-management-store';
import { buildLeaveReportTable, resolveLeaveReportId } from '@/lib/leave-reports-engine';
import { applyHrisLeaveWorkflowAction, closeLeaveYearRun, processLeaveAccrualRun, processLeaveCarryForwardRun } from '@/lib/leave-workflow-service';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { postLeaveAllowanceOnAnnualLeaveApproval } from '@/lib/payroll-leave-allowance-store';

const jsonOk = (data: any) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const cookieValue = (request: Request, name: string) => {
  const raw = request.headers.get('cookie') || '';
  for (const pair of raw.split(';')) {
    const [key, ...rest] = pair.split('=');
    if (String(key || '').trim() === name) return decodeURIComponent(rest.join('='));
  }
  return '';
};

const leaveRoleFromSession = (
  session: Awaited<ReturnType<typeof verifySessionToken>>,
  fallback?: string | null,
): LeaveRole | string => {
  const text = `${session?.roles?.join(' ') || ''} ${session?.isGlobalAdmin ? 'Super Administrator' : ''} ${fallback || ''}`.toLowerCase();
  if (session?.isGlobalAdmin || /super\s*admin|emergency system administration/.test(text)) return 'Super Administrator';
  if (/system\s*admin/.test(text)) return 'System Administrator';
  if (/hr\s*manager|hr\s*head|hr\s*director/.test(text)) return 'HR Manager';
  if (/hr\s*officer|hr\s*admin/.test(text)) return 'HR Officer';
  if (/department\s*manager|line\s*manager|head\s*of\s*department/.test(text)) return 'Department Manager';
  if (/supervisor|team\s*lead/.test(text)) return 'Supervisor';
  if (/payroll/.test(text)) return 'Payroll Officer';
  if (/executive|md\b|ceo\b|cfo\b/.test(text)) return 'Executive';
  if (/leave\s*admin/.test(text)) return 'Leave Administrator';
  if (/employee/.test(text)) return 'Employee';
  return fallback || 'Leave Administrator';
};

const resolveLeaveRole = async (request: NextRequest, bodyRole?: string | null) => {
  const headerRole = request.headers.get('x-hris-role');
  const queryRole = request.nextUrl.searchParams.get('role');
  const session = await verifySessionToken(cookieValue(request, AUTH_COOKIE));
  if (session) return leaveRoleFromSession(session, bodyRole || headerRole || queryRole);
  return bodyRole || headerRole || queryRole || 'Leave Administrator';
};

export async function GET(request: NextRequest) {
  try {
    const role = await resolveLeaveRole(request);
    const section = request.nextUrl.searchParams.get('section') || 'dashboard';
    const format = request.nextUrl.searchParams.get('format');
    const reportParam = request.nextUrl.searchParams.get('report');
    const forceSync = format === 'allowance-exceptions-csv' || format === 'excel';
    const payload = await readLeaveManagementPayload(
      section === 'dashboard' && format === 'excel' ? 'leave-reports' : section,
      role,
      forceSync ? { forceSync: true } : undefined,
    );
    if (format === 'excel') {
      const reportId = resolveLeaveReportId(reportParam) || 'utilization';
      const table = buildLeaveReportTable(reportId, payload);
      const xml = buildLeaveReportExcelXml(table);
      return new NextResponse(xml, { headers: leaveReportExcelResponseHeaders(leaveReportExcelFilename(table)) });
    }
    if (format === 'allowance-exceptions-csv') {
      const rows = payload.allowanceExceptions.map((item) => [
        item.severity,
        item.employeeId,
        item.fullName,
        item.department,
        item.leaveYear,
        item.payrollPeriod,
        item.requestDays,
        item.approvedAnnualLeaveDays,
        formatLeaveAllowanceAmount(item.allowanceAmount),
        item.allowanceStatus,
        item.eventStatus,
        item.linkedRequestId || '',
        item.recommendation,
      ]);
      const csv = [['Severity', 'Employee ID', 'Employee', 'Department', 'Leave Year', 'Payroll Period', 'Request Days', 'Approved Annual Days', 'Allowance Amount', 'Allowance Status', 'Event Status', 'Linked Request', 'Recommendation'], ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="leave-allowance-exceptions.csv"' } });
    }
    if (format === 'csv') {
      const rows = payload.applications.map((item) => [
        item.id,
        item.employeeId,
        item.fullName,
        item.leaveType,
        item.startDate,
        item.endDate,
        item.days,
        item.status,
        item.stage,
        item.policyComplianceStatus,
      ]);
      const csv = [['Request ID', 'Employee ID', 'Employee', 'Leave Type', 'Start', 'End', 'Days', 'Status', 'Stage', 'Compliance'], ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="leave-management.csv"' } });
    }
    return jsonOk(payload);
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load Leave Management.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const role = await resolveLeaveRole(request, body.role ? String(body.role) : null);
    const action = String(body.action || '') as LeaveActionId;
    const section = String(body.section || 'dashboard');
    const payload = await readLeaveManagementPayload(section, role);
    const validation = validateLeaveAction(action, role, payload, body);
    if (!validation.ok) return jsonErr(validation.status, validation.message);
    let leaveAllowanceMessage: string | null = null;
    if (['approve', 'bulk-approve', 'post-to-payroll'].includes(action)) {
      const bodyEmployeeId = String(body.employeeId || body.employeeCode || '').trim();
      const application = body.record
        ? payload.applications.find((item) => item.id === String(body.record))
        : bodyEmployeeId
          ? payload.applications.find((item) => item.employeeId === bodyEmployeeId)
          : null;
      const leaveType = String(body.leaveType || application?.leaveType || 'Annual Leave');
      const days = Number(body.days || application?.days || 0);
      const period = String(body.payrollPeriod || body.period || activePayrollPeriod() || application?.startDate?.slice(0, 7) || new Date().toISOString().slice(0, 7));
      const leaveYear = Number(body.leaveYear || application?.startDate?.slice(0, 4) || period.slice(0, 4) || new Date().getFullYear());
      if (leaveType === 'Annual Leave' && days >= dormantLongPolicy.allowanceMinimumAnnualDays) {
        const employeeSource = await readPayrollEmployees();
        const employee = employeeSource.employees.find((item) => item.employeeId === (application?.employeeId || bodyEmployeeId) || item.employeeCode === (application?.employeeId || bodyEmployeeId));
        if (employee && application) {
          const result = await postLeaveAllowanceOnAnnualLeaveApproval({
            employee,
            applications: payload.applications,
            leaveType,
            days,
            startDate: application.startDate,
            period,
            leaveYear,
            requestId: String(body.record || application.id || ''),
            source: 'HR Leave Approval',
            actor: String(body.actor || role),
          });
          leaveAllowanceMessage = result.message;
        }
      }
    }
    const actor = String(body.actor || role);
    const applicationId = String(body.record || body.applicationId || '').trim();
    let workflowMessage: string | undefined;

    if (['approve', 'reject', 'bulk-approve', 'bulk-reject', 'cancel', 'withdraw', 'recall'].includes(action) && applicationId) {
      const workflow = await applyHrisLeaveWorkflowAction({
        action,
        applicationId,
        actor,
        role: role as LeaveRole,
        reason: body.reason ? String(body.reason) : undefined,
      });
      workflowMessage = `Leave application ${applicationId} updated to ${workflow.status}.`;
    }

    if (action === 'process-accrual') {
      const result = await processLeaveAccrualRun(actor);
      workflowMessage = result.message;
    }
    if (action === 'process-carry-forward') {
      const result = await processLeaveCarryForwardRun(actor);
      workflowMessage = result.message;
      await readLeaveManagementPayload('leave-balances', role, { forceSync: true });
    }
    if (action === 'close-year') {
      const result = await closeLeaveYearRun(actor);
      workflowMessage = result.message;
      await readLeaveManagementPayload('leave-balances', role, { forceSync: true });
    }

    await auditLeaveAction({
      user: actor,
      role: payload.role,
      action,
      record: applicationId || String(body.record || section),
      oldValue: body.oldValue ? String(body.oldValue) : null,
      newValue: body.newValue ? String(body.newValue) : leaveAllowanceMessage || workflowMessage || validation.message,
      comments: body.comments ? String(body.comments) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
    });
    return jsonOk({ message: leaveAllowanceMessage || workflowMessage || validation.message, payload: await readLeaveManagementPayload(section, role, { forceSync: true }) });
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to process leave action.');
  }
}
