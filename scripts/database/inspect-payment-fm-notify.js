const fs = require('node:fs');
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

  const requests = await pool.request().query(`
SELECT TOP 5 RequestId, RequestNumber, Status, CurrentStage, CurrentApproverCode, CurrentApproverName,
  RequesterCode, RequesterName, SubmittedAt, UpdatedAt, PayloadJson
FROM [finance].[PaymentRequests]
ORDER BY COALESCE(SubmittedAt, CreatedAt) DESC`);
  console.log('=== Recent payment requests ===');
  for (const row of requests.recordset || []) {
    let stages = [];
    try { stages = JSON.parse(row.PayloadJson || '{}').stages || []; } catch {}
    console.log(JSON.stringify({
      RequestNumber: row.RequestNumber,
      Status: row.Status,
      CurrentStage: row.CurrentStage,
      CurrentApproverCode: row.CurrentApproverCode,
      CurrentApproverName: row.CurrentApproverName,
      RequesterCode: row.RequesterCode,
      stages,
      UpdatedAt: row.UpdatedAt,
    }));
  }

  if (requests.recordset?.[0]?.RequestId) {
    const id = requests.recordset[0].RequestId;
    const actions = await pool.request().input('id', sql.NVarChar(60), id).query(`
SELECT ActionType, Stage, ActorCode, ActorName, CreatedAt
FROM [finance].[PaymentRequestActions]
WHERE RequestId = @id
ORDER BY CreatedAt ASC`);
    console.log('\n=== Actions for latest ===');
    for (const row of actions.recordset || []) console.log(JSON.stringify(row));
  }

  const rapheal = await pool.request().query(`
SELECT employee_code, full_name, employment_status
FROM [hris].[Employees]
WHERE employee_code = 'P0429' OR full_name LIKE '%IYANDA%' OR full_name LIKE '%RAPHEAL%' OR full_name LIKE '%RAPHAEL%'`);
  console.log('\n=== Rapheal in HRIS ===');
  for (const row of rapheal.recordset || []) console.log(JSON.stringify(row));

  // Notifications file on server-ish path relative to cwd
  const notifPaths = [
    path.join(process.cwd(), 'data', 'enterprise', 'notifications.json'),
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'enterprise', 'notifications.json'),
  ];
  for (const p of notifPaths) {
    if (!fs.existsSync(p)) {
      console.log('\nNo notifications file at', p);
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const items = (raw.notifications || []).filter((n) =>
      /P0429|iyanda|rapheal|raphael|payment approval|Finance Manager/i.test(JSON.stringify(n)));
    console.log('\nMatching notifications in', p, ':', items.length);
    for (const n of items.slice(-10)) {
      console.log(JSON.stringify({
        id: n.id,
        title: n.title,
        recipientEmployeeCode: n.recipientEmployeeCode,
        recipientRoles: n.recipientRoles,
        body: String(n.body || '').slice(0, 160),
        createdAt: n.createdAt,
        href: n.href,
      }));
    }
  }

  await pool.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
