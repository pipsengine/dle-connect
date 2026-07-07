import sql from 'mssql';
import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';

loadWorkspaceEnv();

const sageConfig = () => ({
  server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
  port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
  database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
  user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
  password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 20000,
  requestTimeout: 60000,
});

const main = async () => {
  console.log('Sage DB:', process.env.SAGE_PAYROLL_DB_NAME, '@', process.env.SAGE_PAYROLL_DB_HOST);
  const sagePool = new sql.ConnectionPool(sageConfig());
  await sagePool.connect();

  const sageRes = await sagePool.request().query(`
    SELECT
      e.EmployeeID, e.EmployeeCode, e.TerminationDate,
      es.Code AS StatusCode, es.ShortDescription AS StatusName,
      ge.Status AS EntityStatus, c.Status AS CompanyStatus,
      c.CompanyCode, ge.DisplayName
    FROM Employee.Employee e
    JOIN Entity.GenEntity ge ON ge.GenEntityID = e.GenEntityID
    JOIN Company.Company c ON c.CompanyID = e.CompanyID
    LEFT JOIN Employee.EmployeeStatus es ON es.EmployeeStatusID = e.EmployeeStatusID
    WHERE UPPER(REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', '')) LIKE 'IT01%'
    ORDER BY e.EmployeeCode
  `);
  console.log('\n=== Sage IT01xx employees ===');
  console.table(sageRes.recordset);

  await sagePool.close();

  const hrisPool = await getDleEnterpriseDbPool();
  if (!hrisPool) {
    console.error('No HRIS pool');
    process.exit(1);
  }

  const hrisIt = await hrisPool.request().query(`
    SELECT employee_id, employee_code, full_name, employment_status, employment_type
    FROM [hris].[Employees]
    WHERE employee_code LIKE 'IT01%'
    ORDER BY employee_code
  `);
  console.log('\n=== HRIS IT01xx employees ===');
  console.table(hrisIt.recordset);

  const hrisIt123 = await hrisPool.request().query(`
    SELECT employee_id, employee_code, full_name
    FROM [hris].[Employees]
    WHERE employee_code = 'IT0123'
  `);
  console.log('\n=== HRIS IT0123 ===');
  console.table(hrisIt123.recordset);

  const srcIt123 = await hrisPool.request().query(`
    SELECT employee_id, source_system, source_employee_id
    FROM [hris].[EmployeeSourceRecords]
    WHERE source_employee_id IN ('4258') OR employee_id IN (SELECT employee_id FROM [hris].[Employees] WHERE employee_code = 'IT0123')
  `);
  console.log('\n=== HRIS source records for IT0123 / sage 4258 ===');
  console.table(srcIt123.recordset);

  // Check identity property on hris.Employees.employee_id
  const idcol = await hrisPool.request().query(`
    SELECT c.name AS column_name, c.is_identity, ty.name AS data_type
    FROM sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID('hris.Employees') AND c.name = 'employee_id'
  `);
  console.log('\n=== hris.Employees.employee_id column ===');
  console.table(idcol.recordset);

  const triggers = await hrisPool.request().query(`
    SELECT t.name AS trigger_name, t.is_instead_of_trigger, OBJECT_NAME(t.parent_id) AS table_name
    FROM sys.triggers t
    WHERE OBJECT_NAME(t.parent_id) = 'Employees'
  `);
  console.log('\n=== Triggers on hris.Employees ===');
  console.table(triggers.recordset);

  await hrisPool.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
