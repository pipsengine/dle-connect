import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { personGreetingName, composePersonDisplayName } from '../apps/dashboard/lib/person-display-name';

loadWorkspaceEnv();

const main = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) {
    console.log('NO_DB');
    return;
  }
  const r = await pool.request().query(`
    SELECT e.employee_code, e.full_name, e.preferred_name AS emp_preferred,
           p.title, p.first_name, p.middle_name, p.last_name, p.preferred_name AS p_preferred
    FROM [hris].[Employees] e
    LEFT JOIN [hris].[EmployeePersonalInfo] p ON p.employee_id = e.employee_id
    WHERE e.employee_code = N'P0146'
       OR e.full_name LIKE N'%OGBAISI%'
       OR e.full_name LIKE N'%ONUWABHAGBE%';
  `);
  for (const row of r.recordset || []) {
    const parts = {
      title: row.title,
      firstName: row.first_name,
      middleName: row.middle_name,
      lastName: row.last_name,
      preferredName: row.p_preferred || row.emp_preferred,
      fullName: row.full_name,
    };
    console.log(JSON.stringify({
      stored: row,
      composed: composePersonDisplayName(parts),
      greeting: personGreetingName(parts),
    }, null, 2));
  }
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
