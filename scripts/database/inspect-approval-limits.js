const fs = require('fs');
const path = require('path');
const sql = require('mssql');

for (const file of [
  path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
  path.join(process.cwd(), 'apps', 'dashboard', '.env'),
]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

(async () => {
  const pool = await sql.connect({
    server: process.env.DLE_ENTERPRISE_DB_HOST,
    database: process.env.DLE_ENTERPRISE_DB_NAME,
    user: process.env.DLE_ENTERPRISE_DB_USER,
    password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
    options: {
      encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true').toLowerCase() === 'true',
      trustServerCertificate: true,
    },
  });

  const req = await pool.request().query(`
SELECT TOP 1 RequestNumber, NetAmount, CurrencyCode, Status, CurrentStage, PayloadJson, GrossAmount
FROM finance.PaymentRequests
ORDER BY COALESCE(SubmittedAt, CreatedAt) DESC`);
  console.log('=== Payment ===');
  console.log(JSON.stringify(req.recordset[0], null, 2));

  for (const table of ['ApprovalLimits', 'ApprovalMatrix', 'ApprovalBands', 'PaymentApprovalLimits']) {
    try {
      const result = await pool.request().query(`SELECT TOP 100 * FROM finance.[${table}]`);
      console.log(`\n=== ${table} (${result.recordset.length}) ===`);
      if (result.recordset[0]) console.log('cols', Object.keys(result.recordset[0]));
      console.log(JSON.stringify(result.recordset, null, 2).slice(0, 6000));
    } catch (error) {
      console.log(`\n=== ${table} missing: ${error.message} ===`);
    }
  }

  await pool.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
