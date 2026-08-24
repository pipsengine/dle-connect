/**
 * One-off tracer: node scripts/trace-payment-request.mjs DLPC26087
 * Loads .env.local and queries finance.PaymentRequests / PaymentRequestActions.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};

loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const key = String(process.argv[2] || '').trim();
if (!key) {
  console.error('Usage: node scripts/trace-payment-request.mjs <RequestNumber|RequestId>');
  process.exit(1);
}

const enabled = String(process.env.DLE_ENTERPRISE_DB_ENABLED || 'true').toLowerCase();
const server = process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER || process.env.MSSQL_SERVER || '';
const database = process.env.DLE_ENTERPRISE_DB_NAME || process.env.MSSQL_DATABASE || 'DLE_Enterprise';
const user = process.env.DLE_ENTERPRISE_DB_USER || process.env.MSSQL_USER || '';
const password = process.env.DLE_ENTERPRISE_DB_PASSWORD || process.env.MSSQL_PASSWORD || '';
const port = Number(process.env.DLE_ENTERPRISE_DB_PORT || process.env.MSSQL_PORT || 1433);
const encrypt = String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true').toLowerCase() !== 'false';
const trustServerCertificate = String(
  process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE || process.env.DLE_ENTERPRISE_DB_TRUST_CERT || 'true',
).toLowerCase() !== 'false';

if (['0', 'false', 'no', 'off'].includes(enabled) || !server || !user || !password) {
  console.log(JSON.stringify({
    found: false,
    error: 'Database connection env not configured in this workspace.',
    hasHost: Boolean(server),
    hasUser: Boolean(user),
    hasPassword: Boolean(password),
  }, null, 2));
  process.exit(0);
}

const pool = await sql.connect({
  server,
  port,
  database,
  user,
  password,
  options: {
    encrypt,
    trustServerCertificate,
    enableArithAbort: true,
  },
  connectionTimeout: 20000,
  requestTimeout: 30000,
});

try {
  const requestResult = await pool.request()
    .input('Key', sql.NVarChar(60), key)
    .query(`
SELECT TOP 1
  [RequestId], [RequestNumber], [Status], [CurrentStage],
  [CurrentApproverCode], [CurrentApproverName],
  [RequesterCode], [RequesterName], [ProjectCode], [Department], [Title],
  [CreatedAt], [UpdatedAt]
FROM [finance].[PaymentRequests]
WHERE [RequestNumber] = @Key OR [RequestId] = @Key
`);

  const row = requestResult.recordset?.[0];
  if (!row) {
    console.log(JSON.stringify({ found: false, key }, null, 2));
    process.exit(0);
  }

  const actionsResult = await pool.request()
    .input('RequestId', sql.NVarChar(60), String(row.RequestId))
    .query(`
SELECT
  [ActionType], [Stage], [ActorCode], [ActorName], [Comment], [Reason], [CreatedAt]
FROM [finance].[PaymentRequestActions]
WHERE [RequestId] = @RequestId
ORDER BY [CreatedAt] ASC
`);

  const actions = (actionsResult.recordset || []).map((action) => ({
    actionType: String(action.ActionType || ''),
    stage: String(action.Stage || ''),
    actorCode: String(action.ActorCode || ''),
    actorName: String(action.ActorName || ''),
    reason: String(action.Reason || ''),
    comment: String(action.Comment || ''),
    createdAt: action.CreatedAt ? new Date(action.CreatedAt).toISOString() : null,
  }));

  const decision = [...actions].reverse().find((action) =>
    /^(return|reject|clarify)$/i.test(action.actionType)
    || /return|reject|clarif/i.test(action.stage));

  console.log(JSON.stringify({
    found: true,
    requestId: row.RequestId,
    requestNumber: row.RequestNumber,
    status: row.Status,
    currentStage: row.CurrentStage,
    currentApproverCode: row.CurrentApproverCode,
    currentApproverName: row.CurrentApproverName,
    requesterCode: row.RequesterCode,
    requesterName: row.RequesterName,
    projectCode: row.ProjectCode,
    department: row.Department,
    title: row.Title,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
    latestReturnOrReject: decision || null,
    actions,
  }, null, 2));
} finally {
  await pool.close();
}
