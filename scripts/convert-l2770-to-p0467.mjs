/**
 * Convert Fawaz Adeshina from lumpsum L2770 to permanent P0467 so August
 * salaried payroll (salary schedule PERM.STAFF P0467) matches HRIS identity.
 * Keeps login username L2770. Bank details stay on the same employee_id.
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const OLD = 'L2770';
const NEXT = 'P0467';
const EMPLOYEE_ID = 2481;
const DISPLAY = 'P0467 - Mr FAWAZ ADESEGUN ADESHINA';
const ALT_DISPLAY = 'Mr FAWAZ ADESEGUN ADESHINA [P0467]';

const loadEnv = () => {
  for (const file of [path.join(process.cwd(), 'apps', 'dashboard', '.env'), path.join(process.cwd(), '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
};

const earningLine = (code, name, amount, taxable = true) => ({
  code,
  name,
  amount,
  sourceAmount: amount,
  runFrequency: 'monthly',
  includeInMonthlyPayroll: true,
  taxableAmount: taxable ? amount : 0,
  ytdTotal: 0,
});

const PACKAGE_EARNINGS = [
  earningLine('BASIC', 'BASIC SALARY', 237003.76),
  earningLine('HOUSING', 'HOUSING', 64264.48),
  earningLine('MEAL', 'Meal Allowance', 22000, false),
  earningLine('MEDICAL', 'MEDICAL', 29226.67),
  earningLine('OTHERALL', 'OTHER ALLOWANCE', 186298.63),
  earningLine('SNRUNION', 'SNR UNION', 45000),
  earningLine('TRANSPORT', 'TRANSPORT ALLOWANCE', 23415.52),
  earningLine('UTILITY', 'UTILITIES', 11679.27),
];

const PACKAGE_DEDUCTIONS = [
  { code: 'PAYE', name: 'PAYE Tax', amount: 81724.45, taxableAmount: null },
  { code: 'UNION', name: 'UNION DUES', amount: 5925.09, taxableAmount: null },
];

const PAYROLL_PAGE_PERMS = [
  'page.payroll.management.view',
  'page.payroll.management.bank-finance.view',
  'reports.payroll.bank-schedule.view',
  'button.payroll.post.view',
];

loadEnv();

const dle = await new sql.ConnectionPool({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const clash = await dle.request().query(`SELECT employee_id, employee_code FROM [hris].[Employees] WHERE employee_code = N'${NEXT}'`);
if (clash.recordset.length) {
  throw new Error(`${NEXT} already exists (employee_id ${clash.recordset[0].employee_id})`);
}

const tx = new sql.Transaction(dle);
await tx.begin();
const req = () => new sql.Request(tx);

try {
  await req()
    .input('employee_id', sql.BigInt, EMPLOYEE_ID)
    .input('employee_code', sql.NVarChar(50), NEXT)
    .query(`
      UPDATE [hris].[Employees]
      SET employee_code = @employee_code,
          employment_type = N'Permanent',
          modified_at = SYSUTCDATETIME(),
          modified_by = SUSER_SNAME()
      WHERE employee_id = @employee_id AND employee_code = N'${OLD}';
    `);

  await req()
    .input('employee_id', sql.BigInt, EMPLOYEE_ID)
    .query(`
      UPDATE [hris].[EmployeeJobInfo]
      SET job_title = N'HR Officer',
          designation = N'HUMAN RESOURCES OFFICER',
          job_grade = N'SS4',
          modified_at = SYSUTCDATETIME()
      WHERE employee_id = @employee_id;
    `);

  await req()
    .input('employee_id', sql.BigInt, EMPLOYEE_ID)
    .query(`
      UPDATE [hris].[EmployeeEmploymentInfo]
      SET staff_category = N'Permanent',
          employee_category = N'Permanent',
          modified_at = SYSUTCDATETIME()
      WHERE employee_id = @employee_id;
    `);

  await req()
    .input('employee_id', sql.BigInt, EMPLOYEE_ID)
    .input('earnings', sql.NVarChar(sql.MAX), JSON.stringify(PACKAGE_EARNINGS))
    .input('deductions', sql.NVarChar(sql.MAX), JSON.stringify(PACKAGE_DEDUCTIONS))
    .query(`
      UPDATE [hris].[EmployeePayrollSetup]
      SET salary_grade = N'SS4',
          period_salary = 569720.58,
          basic_salary = 237003.76,
          annual_salary = 6836647,
          latest_allowances = 618888.33,
          latest_deductions = 113624.24,
          rate_per_day = NULL,
          rate_per_hour = NULL,
          setup_assigned_to_payroll = 1,
          payment_run = N'Main Payment Run',
          sage_earning_lines_json = @earnings,
          sage_deduction_lines_json = @deductions,
          sage_payslip_period = N'2026-08',
          sage_payslip_synced_at = SYSUTCDATETIME(),
          modified_at = SYSUTCDATETIME()
      WHERE employee_id = @employee_id;
    `);

  await req().query(`
    UPDATE [hris].[EmployeeJobInfo]
    SET reporting_manager = CASE
          WHEN CHARINDEX(N'[L2770]', reporting_manager) > 0 THEN N'${ALT_DISPLAY}'
          ELSE N'${DISPLAY}'
        END,
        modified_at = SYSUTCDATETIME()
    WHERE reporting_manager LIKE N'%L2770%';
  `);

  await req().query(`
    IF OBJECT_ID(N'[hris].[SupervisorEmployeeAssignments]', N'U') IS NOT NULL
      UPDATE [hris].[SupervisorEmployeeAssignments]
      SET supervisor_employee_code = N'${NEXT}'
      WHERE supervisor_employee_code = N'${OLD}'
         OR supervisor_employee_code LIKE N'${OLD} - %';
  `);

  await req().query(`
    UPDATE [hris].[TelephoneAllowanceEntitlement]
    SET EmployeeCode = N'${NEXT}',
        JobTitle = N'HR Officer',
        UpdatedAt = SYSUTCDATETIME()
    WHERE EmployeeCode = N'${OLD}';
  `);

  await req().query(`
    UPDATE [hris].[PerformanceCycleEligibility]
    SET EmployeeCode = N'${NEXT}'
    WHERE EmployeeCode = N'${OLD}';
  `);

  await req().query(`
    IF OBJECT_ID(N'[fleet].[Drivers]', N'U') IS NOT NULL
      UPDATE [fleet].[Drivers] SET EmployeeCode = N'${NEXT}' WHERE EmployeeCode = N'${OLD}';
    IF OBJECT_ID(N'[fleet].[Trips]', N'U') IS NOT NULL
    BEGIN
      UPDATE [fleet].[Trips] SET LineManagerEmployeeCode = N'${NEXT}' WHERE LineManagerEmployeeCode = N'${OLD}';
      UPDATE [fleet].[Trips] SET RequesterEmployeeCode = N'${NEXT}' WHERE RequesterEmployeeCode = N'${OLD}';
    END
  `);

  const auth = await req().query(`
    SELECT UserId, UserJson FROM [security].[AuthUsers]
    WHERE UserId = N'usr-L2770' OR Username = N'${OLD}' OR EmployeeCode = N'${OLD}'
  `);
  for (const row of auth.recordset) {
    const user = JSON.parse(row.UserJson);
    const permissions = Array.from(new Set([...(user.permissions || []), ...PAYROLL_PAGE_PERMS, 'payroll.*', 'payroll.create', 'payroll.edit', 'payroll.view']));
    const roles = Array.from(new Set([...(user.roles || []), 'Payroll Officer', 'Payroll Administrator', 'Payroll Supervisor']));
    const nextUser = {
      ...user,
      employeeId: NEXT,
      employeeCode: NEXT,
      jobTitle: 'HR Officer',
      grade: 'SS4',
      employmentStatus: 'Active',
      roles,
      permissions,
      updatedAt: new Date().toISOString(),
    };
    await req()
      .input('UserId', sql.NVarChar(120), row.UserId)
      .input('EmployeeCode', sql.NVarChar(120), NEXT)
      .input('EmployeeId', sql.NVarChar(120), NEXT)
      .input('UserJson', sql.NVarChar(sql.MAX), JSON.stringify(nextUser))
      .query(`
        UPDATE [security].[AuthUsers]
        SET EmployeeCode = @EmployeeCode,
            EmployeeId = @EmployeeId,
            UserJson = @UserJson,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserId = @UserId;
      `);
  }

  await tx.commit();
} catch (error) {
  await tx.rollback().catch(() => undefined);
  await dle.close();
  throw error;
}

const verify = await dle.request().query(`
  SELECT e.employee_code, e.employment_type, e.employment_status, e.full_name,
         j.job_title, j.job_grade, j.designation,
         emp.staff_category,
         pay.salary_grade, pay.period_salary, pay.basic_salary, pay.bank_name, pay.account_number,
         pay.setup_assigned_to_payroll, pay.sage_earning_lines_json
  FROM [hris].[Employees] e
  LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
  LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = e.employee_id
  LEFT JOIN [hris].[EmployeePayrollSetup] pay ON pay.employee_id = e.employee_id
  WHERE e.employee_id = ${EMPLOYEE_ID}
`);

const authVerify = await dle.request().query(`
  SELECT Username, EmployeeCode, EmployeeId FROM [security].[AuthUsers] WHERE UserId = N'usr-L2770'
`);

const reports = await dle.request().query(`
  SELECT COUNT(*) AS n FROM [hris].[EmployeeJobInfo] WHERE reporting_manager LIKE N'%P0467%'
`);

await dle.close();

const row = verify.recordset[0];

const patchJsonFile = (filePath, mutate) => {
  if (!fs.existsSync(filePath)) return false;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  mutate(parsed);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
};

const usersPath = path.join(process.cwd(), 'apps', 'dashboard', 'data', 'auth', 'users.json');
const usersPatched = patchJsonFile(usersPath, (users) => {
  if (!Array.isArray(users)) return;
  for (const user of users) {
    if (user.id === 'usr-L2770' || user.username === OLD || user.employeeCode === OLD || user.employeeId === OLD) {
      user.employeeId = NEXT;
      user.employeeCode = NEXT;
      user.jobTitle = 'HR Officer';
      user.grade = 'SS4';
      user.employmentStatus = 'Active';
      user.roles = Array.from(new Set([...(user.roles || []), 'Payroll Officer', 'Payroll Administrator', 'Payroll Supervisor']));
      user.permissions = Array.from(new Set([...(user.permissions || []), ...PAYROLL_PAGE_PERMS, 'payroll.*', 'payroll.create', 'payroll.edit', 'payroll.view']));
      user.updatedAt = new Date().toISOString();
    }
    if (typeof user.reportingManager === 'string' && user.reportingManager.includes(OLD)) {
      user.reportingManager = user.reportingManager.includes(`[${OLD}]`)
        ? ALT_DISPLAY
        : DISPLAY;
    }
  }
});

console.log(JSON.stringify({
  ok: row?.employee_code === NEXT && row?.employment_type === 'Permanent' && Boolean(row?.account_number),
  employee: {
    ...row,
    sage_earning_lines_json: row?.sage_earning_lines_json ? JSON.parse(row.sage_earning_lines_json).map((line) => line.code) : [],
  },
  auth: authVerify.recordset[0],
  reportingLinesUpdated: reports.recordset[0]?.n,
  usersJsonPatched: usersPatched,
}, null, 2));
