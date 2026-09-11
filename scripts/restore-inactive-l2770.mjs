/**
 * Recreate lumpsum L2770 as an inactive historical employee, leaving
 * P0467 (employee_id 2481) as the live permanent payroll identity.
 * Does not create a login for L2770 — usr-L2770 remains the P0467 account.
 */
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const OLD = 'L2770';
const LIVE = 'P0467';
const LIVE_ID = 2481;

const LUMPSUM_GRADE = 'LUMPSUMREMTAX - LUMPSUM REMUNERATION TAX';
const LUMPSUM_CATEGORY = 'CONTRACT ON LUMPSUM';
const LUMPSUM_PERIOD = 468749.25;
const LUMPSUM_ANNUAL = 5624991;
const LUMPSUM_PAYE = 59374.87;

const PAYROLL_PAGE_PERMS = [
  'page.payroll.management.view',
  'page.payroll.management.bank-finance.view',
  'reports.payroll.bank-schedule.view',
  'button.payroll.post.view',
];

const PAYROLL_OPERATOR_ROLES = ['Payroll Officer', 'Payroll Administrator', 'Payroll Supervisor'];

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

const LUMPSUM_EARNINGS = [earningLine('LUMPSUM_ALLOWANCE', 'LUMPSUM ALLOWANCE', LUMPSUM_PERIOD)];
const LUMPSUM_DEDUCTIONS = [{ code: 'PAYE', name: 'PAYE Tax', amount: LUMPSUM_PAYE, taxableAmount: null }];

const patchJsonFile = (filePath, mutate) => {
  if (!fs.existsSync(filePath)) return false;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  mutate(parsed);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
};

loadEnv();

const dle = await new sql.ConnectionPool({
  server: process.env.DLE_ENTERPRISE_DB_HOST,
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
}).connect();

const live = await dle.request().query(`
  SELECT employee_id, employee_code, employment_status, employment_type
  FROM [hris].[Employees]
  WHERE employee_id = ${LIVE_ID}
`);
if (!live.recordset.length || live.recordset[0].employee_code !== LIVE) {
  await dle.close();
  throw new Error(`Live employee ${LIVE} (id ${LIVE_ID}) was not found as expected`);
}

const tx = new sql.Transaction(dle);
await tx.begin();
const req = () => new sql.Request(tx);

try {
  const existingOld = await req().query(`
    SELECT employee_id FROM [hris].[Employees] WHERE employee_code = N'${OLD}'
  `);
  let oldId = existingOld.recordset[0]?.employee_id ? Number(existingOld.recordset[0].employee_id) : 0;

  if (!oldId) {
    const inserted = await req().query(`
      INSERT [hris].[Employees](employee_code, full_name, preferred_name, employment_status, employment_type)
      OUTPUT INSERTED.employee_id
      SELECT N'${OLD}', full_name, preferred_name, N'Inactive', N'Lumpsum'
      FROM [hris].[Employees]
      WHERE employee_id = ${LIVE_ID};
    `);
    oldId = Number(inserted.recordset[0].employee_id);

    await req().query(`
      INSERT [hris].[EmployeePersonalInfo](
        employee_id, title, first_name, middle_name, last_name, preferred_name, gender, date_of_birth,
        marital_status, nationality, state_of_origin, local_government_area, religion, languages_spoken
      )
      SELECT ${oldId}, title, first_name, middle_name, last_name, preferred_name, gender, date_of_birth,
             marital_status, nationality, state_of_origin, local_government_area, religion, languages_spoken
      FROM [hris].[EmployeePersonalInfo]
      WHERE employee_id = ${LIVE_ID};
    `);

    await req().query(`
      INSERT [hris].[EmployeeContactInfo](
        employee_id, official_email, personal_email, primary_phone, alternate_phone, office_extension,
        residential_address, permanent_address, nearest_bus_stop, city, state, country, postal_code
      )
      SELECT ${oldId}, NULL, personal_email, primary_phone, alternate_phone, office_extension,
             residential_address, permanent_address, nearest_bus_stop, city, state, country, postal_code
      FROM [hris].[EmployeeContactInfo]
      WHERE employee_id = ${LIVE_ID};
    `);

    await req().query(`
      INSERT [hris].[EmployeeEmploymentInfo](
        employee_id, staff_category, employee_category, date_joined, probation_start_date, probation_end_date,
        confirmation_due_date, contract_start_date, contract_end_date, work_mode, work_location, shift_pattern,
        union_status, expatriate_status, onboarding_scheduled
      )
      SELECT ${oldId}, N'${LUMPSUM_CATEGORY}', N'${LUMPSUM_CATEGORY}', date_joined, probation_start_date, probation_end_date,
             confirmation_due_date, contract_start_date, contract_end_date, work_mode, work_location, shift_pattern,
             union_status, expatriate_status, onboarding_scheduled
      FROM [hris].[EmployeeEmploymentInfo]
      WHERE employee_id = ${LIVE_ID};
    `);

    await req().query(`
      INSERT [hris].[EmployeeJobInfo](
        employee_id, job_title, designation, job_grade, department, division, business_unit, cost_center, project_site,
        office_location, work_center, reporting_manager, functional_manager, department_head, hr_business_partner,
        role_profile, job_description, key_responsibilities, is_people_manager, is_budget_owner
      )
      SELECT ${oldId}, N'HR Officer', designation, N'${LUMPSUM_GRADE}', department, division, business_unit, cost_center, project_site,
             office_location, work_center, reporting_manager, functional_manager, department_head, hr_business_partner,
             role_profile, job_description, key_responsibilities, is_people_manager, is_budget_owner
      FROM [hris].[EmployeeJobInfo]
      WHERE employee_id = ${LIVE_ID};
    `);

    await req()
      .input('earnings', sql.NVarChar(sql.MAX), JSON.stringify(LUMPSUM_EARNINGS))
      .input('deductions', sql.NVarChar(sql.MAX), JSON.stringify(LUMPSUM_DEDUCTIONS))
      .query(`
        INSERT [hris].[EmployeePayrollSetup](
          employee_id, payroll_group, salary_grade, basic_salary, pay_frequency, bank_name, account_number, account_name,
          pension_provider, pension_pin, tax_identification_number, benefit_group, pay_currency, payment_type, payment_run,
          remuneration_structure, annual_salary, period_salary, rate_per_hour, rate_per_day, hours_per_day, hours_per_period,
          setup_assigned_to_payroll, bank_code, branch_name, branch_code, latest_allowances, latest_deductions,
          sage_payslip_period, sage_earning_lines_json, sage_deduction_lines_json, sage_contribution_lines_json
        )
        SELECT ${oldId}, payroll_group, N'${LUMPSUM_GRADE}', ${LUMPSUM_PERIOD}, pay_frequency, bank_name, account_number, account_name,
               pension_provider, pension_pin, tax_identification_number, benefit_group, pay_currency, N'Cash', N'Main Payment Run',
               remuneration_structure, ${LUMPSUM_ANNUAL}, ${LUMPSUM_PERIOD}, NULL, NULL, hours_per_day, hours_per_period,
               0, bank_code, branch_name, branch_code, ${LUMPSUM_PERIOD}, ${LUMPSUM_PAYE},
               sage_payslip_period, @earnings, @deductions, sage_contribution_lines_json
        FROM [hris].[EmployeePayrollSetup]
        WHERE employee_id = ${LIVE_ID};
      `);

    await req().query(`
      INSERT [hris].[EmployeeSourceRecords](
        employee_id, source_system, source_employee_id, source_employee_code, source_status_code, source_status_name, raw_payload_json
      )
      VALUES (
        ${oldId},
        N'DLE HRIS conversion',
        N'L2770-inactive-archive',
        N'${OLD}',
        N'I',
        N'Inactive',
        N'{"reason":"Archive lumpsum L2770 after conversion to permanent P0467"}'
      );
    `);
  } else {
    await req().query(`
      UPDATE [hris].[Employees]
      SET employment_status = N'Inactive',
          employment_type = N'Lumpsum',
          modified_at = SYSUTCDATETIME(),
          modified_by = SUSER_SNAME()
      WHERE employee_id = ${oldId};
    `);
    await req().query(`
      UPDATE [hris].[EmployeeEmploymentInfo]
      SET staff_category = N'${LUMPSUM_CATEGORY}',
          employee_category = N'${LUMPSUM_CATEGORY}',
          modified_at = SYSUTCDATETIME()
      WHERE employee_id = ${oldId};
    `);
    await req().query(`
      UPDATE [hris].[EmployeeJobInfo]
      SET job_title = N'HR Officer',
          job_grade = N'${LUMPSUM_GRADE}',
          modified_at = SYSUTCDATETIME()
      WHERE employee_id = ${oldId};
    `);
    await req()
      .input('earnings', sql.NVarChar(sql.MAX), JSON.stringify(LUMPSUM_EARNINGS))
      .input('deductions', sql.NVarChar(sql.MAX), JSON.stringify(LUMPSUM_DEDUCTIONS))
      .query(`
        UPDATE [hris].[EmployeePayrollSetup]
        SET salary_grade = N'${LUMPSUM_GRADE}',
            period_salary = ${LUMPSUM_PERIOD},
            basic_salary = ${LUMPSUM_PERIOD},
            annual_salary = ${LUMPSUM_ANNUAL},
            latest_allowances = ${LUMPSUM_PERIOD},
            latest_deductions = ${LUMPSUM_PAYE},
            setup_assigned_to_payroll = 0,
            sage_earning_lines_json = @earnings,
            sage_deduction_lines_json = @deductions,
            modified_at = SYSUTCDATETIME()
        WHERE employee_id = ${oldId};
      `);
  }

  await req().query(`
    UPDATE [hris].[Employees]
    SET employment_status = N'Active',
        employment_type = N'Permanent',
        modified_at = SYSUTCDATETIME(),
        modified_by = SUSER_SNAME()
    WHERE employee_id = ${LIVE_ID};
  `);

  await req().query(`
    UPDATE [hris].[EmployeePayrollSetup]
    SET setup_assigned_to_payroll = 1,
        modified_at = SYSUTCDATETIME()
    WHERE employee_id = ${LIVE_ID};
  `);

  const auth = await req().query(`
    SELECT UserId, UserJson FROM [security].[AuthUsers]
    WHERE UserId = N'usr-L2770' OR Username = N'${OLD}' OR EmployeeCode IN (N'${OLD}', N'${LIVE}')
  `);
  for (const row of auth.recordset) {
    const user = JSON.parse(row.UserJson);
    const permissions = Array.from(new Set([...(user.permissions || []), ...PAYROLL_PAGE_PERMS, 'payroll.*', 'payroll.create', 'payroll.edit', 'payroll.view']));
    const roles = Array.from(new Set([...(user.roles || []), ...PAYROLL_OPERATOR_ROLES]));
    const nextUser = {
      ...user,
      employeeId: LIVE,
      employeeCode: LIVE,
      jobTitle: 'HR Officer',
      grade: 'SS4',
      employmentStatus: 'Active',
      status: 'Active',
      roles,
      permissions,
      updatedAt: new Date().toISOString(),
    };
    await req()
      .input('UserId', sql.NVarChar(120), row.UserId)
      .input('EmployeeCode', sql.NVarChar(120), LIVE)
      .input('EmployeeId', sql.NVarChar(120), LIVE)
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

  await req().query(`
    INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
    VALUES (${oldId}, N'Archive inactive lumpsum after permanent conversion', SUSER_SNAME(), N'L2770 inactivated; live identity is P0467');
  `);
  await req().query(`
    INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
    VALUES (${LIVE_ID}, N'Confirm permanent payroll identity after L2770 archive', SUSER_SNAME(), N'P0467 remains Active Permanent with payroll assignment');
  `);

  await tx.commit();
} catch (error) {
  await tx.rollback().catch(() => undefined);
  await dle.close();
  throw error;
}

const verify = await dle.request().query(`
  SELECT e.employee_id, e.employee_code, e.employment_type, e.employment_status, e.full_name,
         j.job_title, j.job_grade,
         emp.staff_category,
         pay.salary_grade, pay.period_salary, pay.basic_salary, pay.bank_name, pay.account_number,
         pay.setup_assigned_to_payroll, pay.tax_identification_number,
         c.official_email
  FROM [hris].[Employees] e
  LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
  LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = e.employee_id
  LEFT JOIN [hris].[EmployeePayrollSetup] pay ON pay.employee_id = e.employee_id
  LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
  WHERE e.employee_code IN (N'${OLD}', N'${LIVE}')
  ORDER BY e.employee_code
`);

const authVerify = await dle.request().query(`
  SELECT Username, EmployeeCode, EmployeeId, UserJson FROM [security].[AuthUsers] WHERE UserId = N'usr-L2770'
`);

await dle.close();

const usersPatched = patchJsonFile(path.join(process.cwd(), 'apps', 'dashboard', 'data', 'auth', 'users.json'), (users) => {
  if (!Array.isArray(users)) return;
  for (const user of users) {
    if (user.id === 'usr-L2770' || user.username === OLD) {
      user.employeeId = LIVE;
      user.employeeCode = LIVE;
      user.jobTitle = 'HR Officer';
      user.grade = 'SS4';
      user.employmentStatus = 'Active';
      user.status = 'Active';
      user.roles = Array.from(new Set([...(user.roles || []), ...PAYROLL_OPERATOR_ROLES]));
      user.permissions = Array.from(new Set([...(user.permissions || []), ...PAYROLL_PAGE_PERMS, 'payroll.*', 'payroll.create', 'payroll.edit', 'payroll.view']));
      user.updatedAt = new Date().toISOString();
    }
  }
});

const optionsPatched = patchJsonFile(path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'payroll-employee-options.json'), (options) => {
  if (!Array.isArray(options)) return;
  const stamp = new Date().toISOString();
  const upsert = (code, extra) => {
    const idx = options.findIndex((row) => String(row.employeeCode || row.employeeId || '').toUpperCase() === code);
    const next = {
      employeeId: code,
      employeeCode: code,
      nhfApplicable: false,
      updatedAt: stamp,
      updatedBy: 'Archive L2770 inactive after P0467 conversion',
      ...extra,
    };
    if (idx >= 0) options[idx] = { ...options[idx], ...next };
    else options.push(next);
  };
  upsert(OLD, { setupAssignedToPayroll: false, excludedFromPayrollRun: true });
  upsert(LIVE, { setupAssignedToPayroll: true, excludedFromPayrollRun: false });
});

const identitiesPatched = patchJsonFile(path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'payroll-payslip-identities.json'), (identities) => {
  if (!Array.isArray(identities)) return;
  const liveIdentity = identities.find((row) => String(row.employeeCode || '').toUpperCase() === LIVE);
  const hasOld = identities.some((row) => String(row.employeeCode || '').toUpperCase() === OLD);
  if (!hasOld && liveIdentity) {
    const insertAt = identities.findIndex((row) => String(row.employeeCode || '').toUpperCase() === LIVE);
    identities.splice(insertAt, 0, {
      ...liveIdentity,
      employeeId: OLD,
      employeeCode: OLD,
      sourceEmployeeCode: OLD,
      jobTitle: 'HR Officer',
      migratedAt: new Date().toISOString(),
      migratedBy: 'Archive inactive lumpsum L2770 after conversion to P0467',
    });
  }
});

const authUser = authVerify.recordset[0] ? JSON.parse(authVerify.recordset[0].UserJson) : null;
const byCode = Object.fromEntries(verify.recordset.map((row) => [row.employee_code, row]));

console.log(JSON.stringify({
  ok: Boolean(
    byCode[OLD]?.employment_status === 'Inactive'
    && byCode[OLD]?.employment_type === 'Lumpsum'
    && Number(byCode[OLD]?.setup_assigned_to_payroll) === 0
    && !byCode[OLD]?.official_email
    && byCode[LIVE]?.employment_status === 'Active'
    && byCode[LIVE]?.employment_type === 'Permanent'
    && Number(byCode[LIVE]?.setup_assigned_to_payroll) === 1
    && Boolean(byCode[LIVE]?.account_number)
    && authVerify.recordset[0]?.EmployeeCode === LIVE
  ),
  employees: verify.recordset,
  auth: {
    Username: authVerify.recordset[0]?.Username,
    EmployeeCode: authVerify.recordset[0]?.EmployeeCode,
    EmployeeId: authVerify.recordset[0]?.EmployeeId,
    roles: authUser?.roles,
    hasManagementView: (authUser?.permissions || []).includes('page.payroll.management.view'),
    hasBankFinanceView: (authUser?.permissions || []).includes('page.payroll.management.bank-finance.view'),
    hasBankSchedule: (authUser?.permissions || []).includes('reports.payroll.bank-schedule.view'),
    hasPayrollCreate: (authUser?.permissions || []).includes('payroll.create'),
  },
  usersJsonPatched: usersPatched,
  optionsPatched,
  identitiesPatched,
}, null, 2));
