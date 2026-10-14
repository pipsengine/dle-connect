import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
};
loadEnvFile(path.join(repo, '.env'));
loadEnvFile(path.join(repo, 'apps/dashboard/.env'));

const pool = await sql.connect({
  server: process.env.DLE_ENTERPRISE_DB_HOST || process.env.DLE_ENTERPRISE_DB_SERVER,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME,
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
});

const tables = await pool.request().query(`
  SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'commercial' AND TABLE_NAME LIKE 'Tender%'
  ORDER BY TABLE_NAME
`);
console.log('TABLES', tables.recordset.map((row) => row.TABLE_NAME).join(', '));

const audit = await pool.request().query(`
  SELECT TOP 30 ActionName, Details, ActorName, CreatedAt, OpportunityId
  FROM commercial.TenderAudit
  ORDER BY CreatedAt DESC
`);
for (const row of audit.recordset) {
  const when = new Date(row.CreatedAt).toISOString();
  console.log('AUDIT', when, row.OpportunityId, row.ActionName, '|', String(row.Details || '').slice(0, 140));
}

const counts = await pool.request().query(`
  SELECT 'tasks' AS Kind, OpportunityId, COUNT(1) AS N FROM commercial.TenderTasks GROUP BY OpportunityId
  UNION ALL
  SELECT 'docs', OpportunityId, COUNT(1) FROM commercial.TenderDocuments GROUP BY OpportunityId
  UNION ALL
  SELECT 'lines', OpportunityId, COUNT(1) FROM commercial.TenderLines GROUP BY OpportunityId
  UNION ALL
  SELECT 'approvals', OpportunityId, COUNT(1) FROM commercial.TenderApprovals GROUP BY OpportunityId
`);
console.log('COUNTS', counts.recordset.map((row) => `${row.Kind}:${row.OpportunityId}:${row.N}`).join(' | ') || 'none');

const full = await pool.request().query(`
  SELECT OpportunityId, ReferenceNo, Title, Status, Stage, BidDecision, PreparationStatus, ClientStatus,
    AwardedToDle, OwnerName, CreatedAt, UpdatedAt, AssignedAt, AcknowledgedAt, ClosingDate, SubmissionDeadline
  FROM commercial.TenderOpportunities
`);
for (const row of full.recordset) {
  console.log('ROW', row.ReferenceNo, 'created', row.CreatedAt, 'updated', row.UpdatedAt, 'assigned', row.AssignedAt, 'ack', row.AcknowledgedAt);
}
await pool.close();
