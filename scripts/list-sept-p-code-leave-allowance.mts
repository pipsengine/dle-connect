/**
 * Read-only: among September P-code leave applicants, who is entitled to leave allowance and who has been paid.
 */
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import {
  earliestQualifyingAnnualLeaveForAllowance,
  employeeMatchKeys,
  isCountableLeaveAllowanceEvent,
  leaveAllowancePaymentPeriodForYear,
  LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS,
} from '../apps/dashboard/lib/leave-allowance-policy';
import { readPayrollLeaveAllowanceEvents } from '../apps/dashboard/lib/payroll-leave-allowance-store';
import { calculatePayrollForPeriod } from '../apps/dashboard/lib/payroll-calculation-service';
import { readPayrollEmployees } from '../apps/dashboard/lib/payroll-employee-source';
import { normalizePayrollMatchKey } from '../apps/dashboard/lib/sage-people-payroll-store';

loadWorkspaceEnv();

const CODES = ['P0044', 'P0050', 'P0146', 'P0272', 'P0399', 'P0452', 'P0453', 'P0461', 'P0462'];
const compact = (v: unknown) => String(v || '').trim();
const dateOnly = (v: unknown) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? compact(v).slice(0, 10) : d.toISOString().slice(0, 10);
};
const pCode = (value: unknown) => {
  const text = compact(value).toUpperCase();
  const match = text.match(/\bP?\d{3,5}\b/);
  if (!match) return '';
  const raw = match[0];
  return raw.startsWith('P') ? raw : `P${raw.padStart(4, '0')}`;
};

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    console.log('NO_DB');
    return;
  }
  const { employees } = await readPayrollEmployees();
  const events = await readPayrollLeaveAllowanceEvents();
  const payroll = await calculatePayrollForPeriod('2026-09', { pack: 'salaried', company: 'DLE' });
  const apps = await pool.request().query(`
SELECT [Id],[EmployeeId],[FullName],[LeaveType],[StartDate],[EndDate],[Days],[StatusName]
FROM [hris].[LeaveApplications]
WHERE [Id] NOT LIKE N'sage-leave-tx-%';`);

  const applications = (apps.recordset as Array<Record<string, unknown>>).map((row) => ({
    id: compact(row.Id),
    employeeId: compact(row.EmployeeId),
    fullName: compact(row.FullName),
    leaveType: compact(row.LeaveType),
    startDate: dateOnly(row.StartDate),
    endDate: dateOnly(row.EndDate),
    days: Number(row.Days || 0),
    status: compact(row.StatusName),
  }));

  const rows = CODES.map((code) => {
    const employee = employees.find((item) => pCode(item.employeeCode || item.employeeId) === code);
    const keys = employeeMatchKeys(employee?.employeeId || code, employee?.employeeCode || code);
    const also = employeeMatchKeys(code.replace(/^P/, ''), code);
    const allKeys = [...new Set([...keys, ...also, normalizePayrollMatchKey(code), normalizePayrollMatchKey(code.replace(/^P0*/, ''))])];
    const mine = applications.filter((application) =>
      allKeys.includes(normalizePayrollMatchKey(application.employeeId))
      || pCode(application.employeeId) === code,
    );
    const qualifying = earliestQualifyingAnnualLeaveForAllowance(mine, allKeys, 2026)
      || earliestQualifyingAnnualLeaveForAllowance(mine, mine.flatMap((item) => employeeMatchKeys(item.employeeId)), 2026);
    const paymentPeriod = leaveAllowancePaymentPeriodForYear(mine, allKeys, 2026)
      || (qualifying ? String(qualifying.startDate).slice(0, 7) : null);
    const yearEvents = events.filter((event) => {
      if (event.leaveYear !== 2026) return false;
      const eventKeys = [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey);
      return eventKeys.some((key) => allKeys.includes(key) || pCode(event.employeeCode) === code || pCode(event.employeeId) === code);
    });
    const countable = yearEvents.filter(isCountableLeaveAllowanceEvent);
    const reversed = yearEvents.filter((event) => event.status === 'Reversed');
    const payrollRecord = (payroll.records || []).find((record) => pCode(record.employeeCode || record.employeeId) === code);
    const leaveLine = (payrollRecord?.earningLines || []).find((line) =>
      /LEAVEALLOW/i.test(String(line.code || '')) || /\bLEAVE ALLOWANCE\b/i.test(String(line.name || '')),
    );
    const pendingAnnual = mine.filter((application) =>
      application.leaveType === 'Annual Leave'
      && Number(application.days || 0) >= LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS
      && !['Approved', 'Completed', 'Rejected', 'Cancelled', 'Withdrawn'].includes(application.status)
      && Number(String(application.startDate).slice(0, 4)) === 2026,
    );
    return {
      code,
      name: compact(employee?.fullName || mine[0]?.fullName),
      entitled: Boolean(qualifying),
      qualifyingStart: qualifying?.startDate || '',
      qualifyingDays: qualifying?.days || 0,
      qualifyingStatus: qualifying?.status || '',
      paymentPeriod: paymentPeriod || '',
      pendingWouldQualify: pendingAnnual.map((item) => `${item.status} ${item.days}d from ${item.startDate}`).join('; '),
      eventStatuses: yearEvents.map((event) => `${event.period}:${event.status}:${event.amount}`).join('; ') || 'none',
      countablePaidOrQueued: countable.map((event) => `${event.period} ${event.status} ₦${event.amount}`).join('; ') || '',
      reversed: reversed.map((event) => `${event.period} ${event.status}`).join('; ') || '',
      septemberPayslipLine: leaveLine ? `${leaveLine.code} ₦${leaveLine.amount}` : '',
    };
  });

  const entitled = rows.filter((row) => row.entitled);
  const paidOnPayslip = rows.filter((row) => row.septemberPayslipLine);
  const queued = rows.filter((row) => row.countablePaidOrQueued && !row.septemberPayslipLine);
  console.log(JSON.stringify({
    entitledCount: entitled.length,
    entitledCodes: entitled.map((row) => row.code),
    paidOnSeptemberPayslipCount: paidOnPayslip.length,
    queuedEventNotYetOnPayslip: queued.map((row) => row.code),
    rows,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 250).unref();
  });
