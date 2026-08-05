/**
 * One-off: remove finance payment requests so document numbering can restart.
 *
 * Default: yesterday (UTC date-1 and today) + any legacy PAY-* rows.
 * --all: delete every payment request.
 * --number=DLENGCA20260800001: delete matching RequestNumber(s) only.
 * --id=PREQ-...: delete matching RequestId(s) only.
 *
 * Usage:
 *   node scripts/database/purge-finance-payment-requests.js
 *   node scripts/database/purge-finance-payment-requests.js --all
 *   node scripts/database/purge-finance-payment-requests.js --number=DLENGCA20260800001
 */
const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

const loadEnv = () => {
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
};

loadEnv();

const purgeAll = process.argv.includes('--all');
const numberArg = process.argv.find((arg) => arg.startsWith('--number='));
const idArg = process.argv.find((arg) => arg.startsWith('--id='));
const requestNumbers = numberArg
  ? numberArg.slice('--number='.length).split(',').map((v) => v.trim()).filter(Boolean)
  : [];
const requestIds = idArg
  ? idArg.slice('--id='.length).split(',').map((v) => v.trim()).filter(Boolean)
  : [];

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

  const tableCheck = await pool.request().query(`
SELECT OBJECT_ID(N'[finance].[PaymentRequests]', N'U') AS PaymentRequestsId
`);
  if (!tableCheck.recordset?.[0]?.PaymentRequestsId) {
    console.log('finance.PaymentRequests does not exist — nothing to purge.');
    await pool.close();
    return;
  }

  const list = await pool.request().query(`
SELECT [RequestId], [RequestNumber], [PaymentType], [Status], [BeneficiaryCode], [CreatedAt]
FROM [finance].[PaymentRequests]
ORDER BY COALESCE([SubmittedAt], [CreatedAt]) DESC
`);
  const rows = list.recordset || [];
  console.log(`Found ${rows.length} payment request(s).`);
  for (const row of rows.slice(0, 40)) {
    console.log(`  ${row.RequestNumber} | ${row.PaymentType} | ${row.Status} | ${row.BeneficiaryCode} | ${row.CreatedAt}`);
  }

  let filterSql = '';
  const targetReq = pool.request();
  if (requestNumbers.length || requestIds.length) {
    const clauses = [];
    requestNumbers.forEach((number, i) => {
      const key = `num${i}`;
      targetReq.input(key, sql.NVarChar(60), number);
      clauses.push(`[RequestNumber] = @${key}`);
    });
    requestIds.forEach((id, i) => {
      const key = `rid${i}`;
      targetReq.input(key, sql.NVarChar(60), id);
      clauses.push(`[RequestId] = @${key}`);
    });
    filterSql = clauses.join(' OR ');
  } else if (purgeAll) {
    filterSql = '1=1';
  } else {
    filterSql = `(
      CAST([CreatedAt] AS DATE) >= DATEADD(day, -1, CAST(SYSUTCDATETIME() AS DATE))
      OR [RequestNumber] LIKE N'PAY-%'
    )`;
  }

  const targets = await targetReq.query(`
SELECT [RequestId], [RequestNumber]
FROM [finance].[PaymentRequests]
WHERE ${filterSql}
`);
  const ids = (targets.recordset || []).map((r) => String(r.RequestId));
  const modeLabel = requestNumbers.length || requestIds.length
    ? ' (explicit number/id)'
    : purgeAll
      ? ' (--all)'
      : ' (yesterday/today + PAY-*)';
  console.log(`Purging ${ids.length} request(s)${modeLabel}...`);

  if (!ids.length) {
    await pool.close();
    return;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const req = new sql.Request(tx);
    const params = ids.map((_, i) => `@id${i}`).join(', ');
    ids.forEach((id, i) => req.input(`id${i}`, sql.NVarChar(60), id));

    await req.query(`
IF OBJECT_ID(N'[finance].[PaymentRequestActions]', N'U') IS NOT NULL
  DELETE FROM [finance].[PaymentRequestActions] WHERE [RequestId] IN (${params});

IF OBJECT_ID(N'[finance].[CashAdvanceWaivers]', N'U') IS NOT NULL
BEGIN
  UPDATE [finance].[CashAdvanceWaivers]
  SET [Status] = N'Cancelled'
  WHERE [ConsumedByRequestId] IN (${params});

  DELETE FROM [finance].[CashAdvanceWaivers]
  WHERE [ConsumedByRequestId] IN (${params})
     OR ([Status] = N'Active' AND [CreatedAt] >= DATEADD(day, -2, SYSUTCDATETIME()));
END

DELETE FROM [finance].[PaymentRequests] WHERE [RequestId] IN (${params});
`);

    await tx.commit();
    console.log(`Deleted ${ids.length} payment request(s) and related actions/waivers.`);
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  const remaining = await pool.request().query(`
SELECT COUNT(*) AS Remaining FROM [finance].[PaymentRequests]
`);
  console.log(`Remaining payment requests: ${remaining.recordset?.[0]?.Remaining ?? '?'}`);
  await pool.close();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
