/**
 * Clear a mistaken ProjectCode and re-route to Non-project approval (RM → FM for ≤₦200k).
 *
 * Usage:
 *   npx tsx scripts/fix-payment-request-clear-project.mts DLE26091
 *   npx tsx scripts/fix-payment-request-clear-project.mts PREQ-1788247609868
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const key = String(process.argv[2] || '').trim();
if (!key) {
  console.error('Usage: npx tsx scripts/fix-payment-request-clear-project.mts <RequestNumber|RequestId>');
  process.exit(1);
}

const {
  getPaymentRequestById,
  repairMisroutedProjectPathWithoutProject,
} = await import('../lib/finance-intelligence/payment-requests-service.ts');
const { ensureFinanceDb } = await import('../lib/finance-intelligence/store.ts');

const pool = await ensureFinanceDb();
if (!pool) {
  console.error(JSON.stringify({ ok: false, error: 'Finance database unavailable' }));
  process.exit(1);
}

const lookup = await pool.request()
  .input('Key', sql.NVarChar(60), key)
  .query(`
SELECT TOP 1 [RequestId], [RequestNumber], [ProjectCode], [PayloadJson], [CurrentStage], [Status]
FROM [finance].[PaymentRequests]
WHERE [RequestNumber] = @Key OR [RequestId] = @Key
`);

const found = lookup.recordset?.[0];
if (!found) {
  console.error(JSON.stringify({ ok: false, error: `Request not found: ${key}` }));
  process.exit(1);
}

const requestId = String(found.RequestId);
let payload: Record<string, unknown> = {};
try {
  payload = found.PayloadJson ? JSON.parse(String(found.PayloadJson)) : {};
} catch {
  payload = {};
}

// Drop project references from payload so the UI and matrix stay non-project.
delete payload.projectCode;
delete payload.project;
delete payload.projectName;
payload.pathType = 'Non-project';
payload.repairedStages = true;
payload.repairReason = 'Cleared mistaken project selection; re-routed to Non-project (Reporting Manager → Finance Manager).';

await pool.request()
  .input('RequestId', sql.NVarChar(60), requestId)
  .input('PayloadJson', sql.NVarChar(sql.MAX), JSON.stringify(payload))
  .query(`
UPDATE [finance].[PaymentRequests]
SET [ProjectCode] = NULL,
    [PayloadJson] = @PayloadJson,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [RequestId] = @RequestId
`);

const before = {
  requestId,
  requestNumber: String(found.RequestNumber || ''),
  projectCode: found.ProjectCode || null,
  currentStage: found.CurrentStage || null,
  status: found.Status || null,
};

const row = await getPaymentRequestById(requestId);
if (!row) {
  console.error(JSON.stringify({ ok: false, error: 'Request cleared but reload failed', before }));
  process.exit(1);
}

const repaired = await repairMisroutedProjectPathWithoutProject(row);

console.log(JSON.stringify({
  ok: true,
  before,
  after: {
    requestId: repaired.requestId,
    requestNumber: repaired.requestNumber,
    projectCode: repaired.projectCode || null,
    pathType: repaired.payload?.pathType || null,
    matrixRuleName: repaired.payload?.matrixRuleName || null,
    stages: repaired.payload?.stages || null,
    currentStage: repaired.currentStage,
    currentApproverCode: repaired.currentApproverCode,
    currentApproverName: repaired.currentApproverName,
    status: repaired.status,
  },
}, null, 2));

process.exit(0);
