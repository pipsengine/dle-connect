import { getDleEnterpriseDbPool } from '../lib/dle-enterprise-db.ts';

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) { console.error('No HRIS pool'); process.exit(1); }

  const checks = await pool.request().query(`
    SELECT cc.name AS constraint_name, cc.definition
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID('hris.Employees')
  `);
  console.log('=== CHECK constraints on hris.Employees ===');
  for (const row of checks.recordset) console.log(`${row.constraint_name}: ${row.definition}`);

  const distinctTypes = await pool.request().query(`
    SELECT employment_type, COUNT(*) AS n FROM [hris].[Employees] GROUP BY employment_type ORDER BY n DESC
  `);
  console.log('\n=== Existing employment_type values ===');
  console.table(distinctTypes.recordset);

  const distinctStatus = await pool.request().query(`
    SELECT employment_status, COUNT(*) AS n FROM [hris].[Employees] GROUP BY employment_status ORDER BY n DESC
  `);
  console.log('\n=== Existing employment_status values ===');
  console.table(distinctStatus.recordset);

  await pool.close();
};

main().catch((e) => { console.error(e); process.exit(1); });
