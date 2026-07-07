import sql from 'mssql';
import { loadWorkspaceEnv } from '../lib/dle-enterprise-db.ts';

loadWorkspaceEnv();

const code = process.argv[2] || 'IT0100';
const cfg = {
  server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
  port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
  database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
  user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
  password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

const main = async () => {
  console.log(`Probing Sage ${cfg.database}@${cfg.server} for code ${code}...`);
  for (let attempt = 1; attempt <= 12; attempt++) {
    let pool: sql.ConnectionPool | null = null;
    try {
      pool = new sql.ConnectionPool(cfg);
      await pool.connect();
      const res = await pool
        .request()
        .input('code', sql.NVarChar(50), code)
        .query(`
          SELECT e.EmployeeID, e.EmployeeCode, e.TerminationDate,
            es.Code AS StatusCode, es.ShortDescription AS StatusName,
            ge.Status AS EntityStatus, c.Status AS CompanyStatus, c.CompanyCode,
            ge.DisplayName, ge.DateEngaged
          FROM Employee.Employee e
          JOIN Entity.GenEntity ge ON ge.GenEntityID = e.GenEntityID
          JOIN Company.Company c ON c.CompanyID = e.CompanyID
          LEFT JOIN Employee.EmployeeStatus es ON es.EmployeeStatusID = e.EmployeeStatusID
          WHERE UPPER(REPLACE(LTRIM(RTRIM(e.EmployeeCode)),'_','')) = UPPER(REPLACE(LTRIM(RTRIM(@code)),'_',''))
        `);
      console.log(`Connected on attempt ${attempt}. Rows: ${res.recordset.length}`);
      if (res.recordset.length) console.table(res.recordset);
      else console.log(`${code} not present in ${cfg.database}.`);

      const dbs = await pool.request().query(`SELECT name FROM sys.databases WHERE name LIKE 'DLE%' ORDER BY name`);
      console.log('Available DLE databases on server:', dbs.recordset.map((r: any) => r.name).join(', '));
      await pool.close();
      return;
    } catch (error) {
      await pool?.close().catch(() => undefined);
      console.log(`  attempt ${attempt}/12 failed: ${error instanceof Error ? error.message : error}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.log('Unable to reach Sage after 12 attempts.');
};

main().catch((e) => { console.error(e); process.exit(1); });
