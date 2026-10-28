import { getDleEnterpriseDbPool } from './apps/dashboard/lib/dle-enterprise-db.ts';

const pool = await getDleEnterpriseDbPool();
if (!pool) throw new Error('no pool');
const result = await pool.request().query(`
  SELECT
    r.run_id,
    emp.employeeCode,
    emp.fullName,
    emp.payCurrency,
    emp.grossPay,
    emp.taxablePay,
    emp.paye,
    line.code,
    line.name,
    line.amount
  FROM [hris].[PayrollRuns] r
  INNER JOIN [hris].[PayrollRunSnapshots] s ON s.run_id = r.run_id
  CROSS APPLY OPENJSON(s.snapshot_json, '$.records') WITH (
    employeeCode nvarchar(40) '$.employeeCode',
    fullName nvarchar(200) '$.fullName',
    payCurrency nvarchar(20) '$.payCurrency',
    grossPay decimal(18,2) '$.grossPay',
    taxablePay decimal(18,2) '$.taxablePay',
    paye decimal(18,2) '$.paye',
    earningLines nvarchar(max) '$.earningLines' AS JSON
  ) emp
  CROSS APPLY OPENJSON(emp.earningLines) WITH (
    code nvarchar(80) '$.code',
    name nvarchar(200) '$.name',
    amount decimal(18,2) '$.amount'
  ) line
  WHERE JSON_VALUE(r.run_json, '$.period') = N'2026-10'
    AND JSON_VALUE(r.run_json, '$.pack') = N'salaried'
    AND (
      line.code LIKE N'%LEAVE%'
      OR line.name LIKE N'%Leave%'
    )
  ORDER BY emp.employeeCode, line.code
`);
console.log(JSON.stringify(result.recordset, null, 2));
console.log('count', result.recordset.length);
await pool.close();
