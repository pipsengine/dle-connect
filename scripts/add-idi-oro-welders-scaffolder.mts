/**
 * Add Idi-Oro welders Christian Oguwa + Fatai Shounde (P0033) under Akande,
 * and scaffolder Idika David (C2023) under Bello Femi.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/add-idi-oro-welders-scaffolder.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/add-idi-oro-welders-scaffolder.mts --apply
 */
import sql from 'mssql';
import {
  getDleEnterpriseDbPool,
  loadWorkspaceEnv,
  nextEmployeeCodeFromDb,
  previewNextEmployeeCodeFromDb,
  updateEmployeeContractPayrollClassificationInDb,
} from '../apps/dashboard/lib/dle-enterprise-db';
import { invalidatePayrollEmployeeCache } from '../apps/dashboard/lib/payroll-employee-source';
import { assignEmployeesToSupervisor } from '../apps/dashboard/lib/supervisor-assignment-store';

loadWorkspaceEnv();

const APPLY = process.argv.includes('--apply');
const WELDER_RATE = 13550;
const SCAFFOLDER_RATE = 13250;

const findByNameOrCode = async (pool: sql.ConnectionPool, pattern: string, code?: string) => {
  const rs = await pool.request()
    .input('pattern', sql.NVarChar(200), pattern)
    .input('code', sql.NVarChar(50), code || '')
    .query(`
      SELECT TOP 5 e.employee_id, e.employee_code, e.full_name, e.employment_status, e.employment_type,
             j.job_title, j.office_location, j.reporting_manager
      FROM [hris].[Employees] e
      LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
      WHERE (@code <> N'' AND UPPER(LTRIM(RTRIM(e.employee_code))) = UPPER(@code))
         OR e.full_name LIKE @pattern
      ORDER BY e.employee_code;
    `);
  return rs.recordset as Array<{
    employee_id: number;
    employee_code: string;
    full_name: string;
    employment_status: string;
    employment_type: string;
    job_title: string | null;
    office_location: string | null;
    reporting_manager: string | null;
  }>;
};

const createWelder = async (pool: sql.ConnectionPool, code: string) => {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const employeeRs = await new sql.Request(tx)
      .input('employee_code', sql.NVarChar(50), code)
      .input('full_name', sql.NVarChar(250), 'CHRISTIAN OGUWA')
      .input('preferred_name', sql.NVarChar(150), 'Christain Oguwa')
      .input('employment_status', sql.VarChar(40), 'Active')
      .input('employment_type', sql.VarChar(40), 'Daily Rate')
      .query(`
        INSERT [hris].[Employees](employee_code, full_name, preferred_name, employment_status, employment_type)
        OUTPUT INSERTED.employee_id
        VALUES (@employee_code, @full_name, @preferred_name, @employment_status, @employment_type);
      `);
    const employeeId = Number(employeeRs.recordset[0].employee_id);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('first_name', sql.NVarChar(100), 'CHRISTIAN')
      .input('last_name', sql.NVarChar(100), 'OGUWA')
      .input('title', sql.NVarChar(40), 'Mr')
      .query(`
        INSERT [hris].[EmployeePersonalInfo](employee_id, title, first_name, last_name)
        VALUES (@employee_id, @title, @first_name, @last_name);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .query(`
        INSERT [hris].[EmployeeContactInfo](employee_id)
        VALUES (@employee_id);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('staff_category', sql.NVarChar(100), 'CONTRACT ON DAY RATE')
      .input('employee_category', sql.NVarChar(100), 'CONTRACT ON DAY RATE')
      .input('work_location', sql.NVarChar(150), 'IDI_ORO')
      .query(`
        INSERT [hris].[EmployeeEmploymentInfo](employee_id, staff_category, employee_category, work_location)
        VALUES (@employee_id, @staff_category, @employee_category, @work_location);
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('job_title', sql.NVarChar(150), 'WELDER')
      .input('department', sql.NVarChar(150), 'PRODUCTION')
      .input('business_unit', sql.NVarChar(150), 'DLE')
      .input('office_location', sql.NVarChar(150), 'IDI_ORO')
      .input('work_center', sql.NVarChar(180), 'Welding')
      .input('reporting_manager', sql.NVarChar(250), 'P0072 - Mr OWOLOJA AKANDE')
      .query(`
        INSERT [hris].[EmployeeJobInfo](
          employee_id, job_title, department, business_unit, office_location, work_center, reporting_manager,
          is_people_manager, is_budget_owner
        ) VALUES (
          @employee_id, @job_title, @department, @business_unit, @office_location, @work_center, @reporting_manager, 0, 0
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('reason', sql.NVarChar(500), 'Added Christian Oguwa as Idi-Oro welder under Akande (P0072)')
      .query(`
        INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
        VALUES (@employee_id, N'Create employee', SUSER_SNAME(), @reason);
      `);

    await tx.commit();
    return employeeId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
};

const alignIdikaLocation = async (pool: sql.ConnectionPool, employeeId: number) => {
  await pool.request()
    .input('employee_id', sql.BigInt, employeeId)
    .query(`
      UPDATE [hris].[EmployeeJobInfo]
      SET office_location = N'IDI_ORO',
          work_center = COALESCE(NULLIF(work_center, N''), N'Scaffolding'),
          modified_at = SYSUTCDATETIME()
      WHERE employee_id = @employee_id;
      UPDATE [hris].[EmployeeEmploymentInfo]
      SET work_location = N'IDI_ORO',
          modified_at = SYSUTCDATETIME()
      WHERE employee_id = @employee_id;
    `);
};

const main = async () => {
  console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY-RUN (pass --apply to persist)');
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise DB pool unavailable');

  const oguwaHits = await findByNameOrCode(pool, '%OGUWA%');
  const fataiHits = await findByNameOrCode(pool, '%SHONDE%', 'P0033');
  const idikaHits = await findByNameOrCode(pool, '%IDIKA%', 'C2023');
  const fatai = fataiHits.find((row) => row.employee_code === 'P0033') || fataiHits[0];
  const idika = idikaHits.find((row) => row.employee_code === 'C2023') || idikaHits[0];

  console.log('Oguwa matches:', oguwaHits);
  console.log('Fatai:', fatai);
  console.log('Idika:', idika);

  if (!fatai) throw new Error('Fatai Shonde/Shounde (P0033) was not found');
  if (!idika) throw new Error('Idika David (C2023) was not found');

  let oguwaCode = oguwaHits[0]?.employee_code || '';
  if (!APPLY) {
    if (!oguwaCode) {
      const preview = await previewNextEmployeeCodeFromDb('Daily Rate');
      console.log(`Would create CHRISTIAN OGUWA as ${preview}, Welder, IDI_ORO, rate ${WELDER_RATE}, supervisor P0072`);
    } else {
      console.log(`Would keep existing ${oguwaCode} ${oguwaHits[0].full_name} and assign to P0072`);
    }
    console.log(`Would assign ${fatai.employee_code} ${fatai.full_name} to P0072 Akande as Welder`);
    console.log(`Would assign ${idika.employee_code} ${idika.full_name} to C0585 Bello Femi as Scaffolder (rate ${SCAFFOLDER_RATE} already on file)`);
    await pool.close();
    return;
  }

  if (!oguwaCode) {
    oguwaCode = await nextEmployeeCodeFromDb('Daily Rate') || '';
    if (!oguwaCode) throw new Error('Could not allocate next daily-rate employee code');
    const employeeId = await createWelder(pool, oguwaCode);
    await updateEmployeeContractPayrollClassificationInDb({
      employeeDbId: employeeId,
      action: 'activate-daily-rate',
      payrollGroup: 'DLE',
      ratePerDay: WELDER_RATE,
      reason: 'Activate Christian Oguwa as Idi-Oro daily-rate welder',
    });
    console.log(`Created ${oguwaCode} CHRISTIAN OGUWA id=${employeeId}`);
  }

  await assignEmployeesToSupervisor({
    supervisorEmployeeCode: 'P0072',
    employeeCodes: [oguwaCode, fatai.employee_code],
    assignmentBatch: `2026-09-15-idi-oro-welders-akande`,
    assignmentGroup: 'WELDERS',
    performedBy: 'hris.add-crew',
    reason: 'Add Christian Oguwa and Fatai Shounde to Idi-Oro welding crew under Akande',
    sourceRows: [
      { employeeCode: oguwaCode, sourceLabel: 'Christain Oguwa', tradeRole: 'Welder', matchConfidence: 'DirectEmployeeCode' },
      { employeeCode: fatai.employee_code, sourceLabel: 'Fatai Shounde', tradeRole: 'Welder', matchConfidence: 'DirectEmployeeCode', matchNote: 'HRIS name is FATAI AJISAFE SHONDE (P0033).' },
    ],
  });

  await alignIdikaLocation(pool, Number(idika.employee_id));
  await assignEmployeesToSupervisor({
    supervisorEmployeeCode: 'C0585',
    employeeCodes: [idika.employee_code],
    assignmentBatch: `2026-09-15-idi-oro-scaffolders-femi`,
    assignmentGroup: 'SCAFFOLDERS',
    performedBy: 'hris.add-crew',
    reason: 'Add Idika David to Idi-Oro scaffolder crew under Bello Femi',
    sourceRows: [
      { employeeCode: idika.employee_code, sourceLabel: 'Idika David', tradeRole: 'Scaffolder', matchConfidence: 'DirectEmployeeCode', matchNote: 'HRIS name is DAVID IDIKA (C2023).' },
    ],
  });

  invalidatePayrollEmployeeCache();
  console.log('Done.', { oguwaCode, fatai: fatai.employee_code, idika: idika.employee_code });
  await pool.close();
};

await main();
