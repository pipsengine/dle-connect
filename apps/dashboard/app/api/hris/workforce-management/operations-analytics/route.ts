import { NextResponse } from 'next/server';
import { readWorkforceOperationsAnalytics, workforceOperationsRowsToCsv } from '@/lib/workforce-operations-analytics-store';
import { calendarPayrollPeriod } from '@/lib/payroll-periods';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || calendarPayrollPeriod();
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const view = (searchParams.get('view') || 'summary').toLowerCase();
    const rebuildSnapshot = searchParams.get('rebuildSnapshot') === 'true' || searchParams.get('verify') === 'true';
    const role = request.headers.get('x-hris-role') || 'HR Manager';

    const payload = await readWorkforceOperationsAnalytics({
      period,
      rebuildSnapshot,
      actor: role,
    });

    if (format === 'csv') {
      const rows = view === 'detail'
        ? payload.detailRows.map((row) => ({
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            department: row.department,
            location: row.location,
            supervisor: row.supervisorName,
            workCenter: row.workCenterName,
            projectCode: row.projectCode,
            projectName: row.projectName,
            timesheetDate: row.timesheetDate,
            periodDaysWorked: row.periodDaysWorked,
            payrollSnapshotDays: row.payrollSnapshotDays,
            verifyStatus: row.verifyStatus,
            payableDay: row.payableDay,
            bookedHours: row.bookedHours,
            attendanceHours: row.attendanceHours,
            overtimeHours: row.overtimeHours,
            productiveHours: row.productiveHours,
            idleHours: row.idleHours,
            timesheetStatus: row.timesheetStatus,
            payrollStatus: row.payrollStatus,
            exceptions: row.exceptions.join('; '),
            risk: row.risk,
          }))
        : payload.employeeSummaries.map((row) => ({
            employeeId: row.employeeId,
            employeeNo: row.employeeNo,
            employeeName: row.employeeName,
            department: row.department,
            location: row.location,
            supervisor: row.supervisorName,
            workCenter: row.workCenterName,
            projectCode: row.projectCode,
            periodDaysWorked: row.periodDaysWorked,
            payrollSnapshotDays: row.payrollSnapshotDays,
            verifyStatus: row.verifyStatus,
            bookedHours: row.bookedHours,
            overtimeHours: row.overtimeHours,
            productiveHours: row.productiveHours,
            idleHours: row.idleHours,
            payrollReadyDates: row.payrollReadyDates,
            exceptions: row.exceptions.join('; '),
            risk: row.risk,
          }));
      const csv = workforceOperationsRowsToCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="workforce-operations-${view}-${period}.csv"`,
        },
      });
    }

    return ok(payload);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load workforce operations analytics');
  }
}
