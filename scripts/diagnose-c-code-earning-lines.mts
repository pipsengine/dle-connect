import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { parseSagePayrollLineItems } from '../apps/dashboard/lib/sage-payroll-line-parser';
import { isHrisConfiguredPayrollLine } from '../apps/dashboard/lib/sage-payroll-line-parser';
import { effectiveHrisPayrollLines } from '../apps/dashboard/lib/payroll-package-lines';

loadWorkspaceEnv();

const PERIOD_CODES = new Set([
  'JCWEEKDAY', 'JCWEEKDAY_NT', 'WEEKDAYOVT', 'PUBHOL', 'PUBLIC_OVT',
  'SATEARN', 'SATURDAY_OVT', 'SUNDAYEARN', 'SUNDAY_OVT', 'REFUND',
]);

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    console.log('NO_DB');
    return;
  }
  const rs = await pool.request().query(`
    SELECT
      e.employee_code,
      e.full_name,
      e.employment_status,
      e.employment_type,
      payroll.rate_per_day,
      payroll.rate_per_hour,
      payroll.period_salary,
      payroll.latest_allowances,
      payroll.sage_payslip_period,
      payroll.sage_payslip_synced_at,
      payroll.setup_assigned_to_payroll,
      payroll.sage_earning_lines_json,
      payroll.modified_at
    FROM [hris].[Employees] e
    LEFT JOIN [hris].[EmployeePayrollSetup] payroll ON payroll.employee_id = e.employee_id
    WHERE e.employee_code LIKE N'C%'
    ORDER BY e.employee_code;
  `);

  const rows = rs.recordset || [];
  const summary = {
    totalCCodes: rows.length,
    active: 0,
    withRatePerDay: 0,
    withEarningJson: 0,
    withPayslipPeriod: 0,
    displayedLineCount: 0,
    periodStyleLineCount: 0,
    hrisConfiguredLineCount: 0,
    snapshotLineCount: 0,
    codeCounts: {} as Record<string, number>,
    employeesWithDisplayedLines: [] as Array<Record<string, unknown>>,
    employeesWithoutLines: [] as string[],
  };

  for (const row of rows) {
    const status = String(row.employment_status || '');
    if (/active/i.test(status) && !/inactive|terminat|resign|retired|deceased/i.test(status)) summary.active += 1;
    if (Number(row.rate_per_day || 0) > 0) summary.withRatePerDay += 1;
    const rawLines = parseSagePayrollLineItems(row.sage_earning_lines_json);
    if (rawLines.length) summary.withEarningJson += 1;
    if (row.sage_payslip_period) summary.withPayslipPeriod += 1;

    const displayed = effectiveHrisPayrollLines(rawLines);
    if (!displayed.length) {
      summary.employeesWithoutLines.push(`${row.employee_code} (${status || 'no status'})`);
    }

    const lines = displayed.map((line) => {
      const code = String(line.code || '').toUpperCase();
      const hris = isHrisConfiguredPayrollLine(line);
      summary.codeCounts[code] = (summary.codeCounts[code] || 0) + 1;
      summary.displayedLineCount += 1;
      if (PERIOD_CODES.has(code)) summary.periodStyleLineCount += 1;
      if (hris) summary.hrisConfiguredLineCount += 1;
      else summary.snapshotLineCount += 1;
      return {
        code,
        name: line.name,
        amount: line.amount,
        sourceAmount: line.sourceAmount,
        frequency: line.runFrequency || (hris ? 'monthly' : '(none — Sage snapshot default monthly)'),
        taxable: Number(line.taxableAmount ?? line.amount ?? 0) > 0,
        hrisConfigured: hris,
        periodStyle: PERIOD_CODES.has(code),
      };
    });

    if (lines.length) {
      summary.employeesWithDisplayedLines.push({
        employeeCode: row.employee_code,
        name: row.full_name,
        status,
        employmentType: row.employment_type,
        ratePerDay: Number(row.rate_per_day || 0) || null,
        periodSalary: Number(row.period_salary || 0) || null,
        sagePayslipPeriod: row.sage_payslip_period,
        sagePayslipSyncedAt: row.sage_payslip_synced_at,
        setupAssigned: Boolean(row.setup_assigned_to_payroll),
        packageModifiedAt: row.modified_at,
        lineCount: lines.length,
        lines,
      });
    }
  }

  console.log(JSON.stringify({
    totals: {
      totalCCodes: summary.totalCCodes,
      active: summary.active,
      withRatePerDay: summary.withRatePerDay,
      withEarningJson: summary.withEarningJson,
      withPayslipPeriod: summary.withPayslipPeriod,
      employeesShowingEarningLines: summary.employeesWithDisplayedLines.length,
      employeesWithoutDisplayedLines: summary.employeesWithoutLines.length,
      displayedLineCount: summary.displayedLineCount,
      hrisConfiguredLineCount: summary.hrisConfiguredLineCount,
      snapshotLineCount: summary.snapshotLineCount,
      periodStyleLineCount: summary.periodStyleLineCount,
      codeCounts: Object.fromEntries(Object.entries(summary.codeCounts).sort((a, b) => b[1] - a[1])),
    },
    employeesWithDisplayedLines: summary.employeesWithDisplayedLines,
    employeesWithoutDisplayedLines: summary.employeesWithoutLines,
  }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
