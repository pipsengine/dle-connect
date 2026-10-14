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
const day = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
};
const rows = await pool.request().query(`
  SELECT OpportunityId, ReferenceNo, Title, OpportunityType, TenderType, Status, Stage, Priority, BidDecision,
    OwnerName, PreparationStatus, ClientStatus, AwardedToDle,
    SubmissionDeadline, ClosingDate, ClarificationDeadline, InvitationDate, UpdatedAt
  FROM commercial.TenderOpportunities
  ORDER BY UpdatedAt DESC
`);
console.log('COUNT', rows.recordset.length);
for (const row of rows.recordset) {
  console.log([
    row.ReferenceNo,
    row.OpportunityType,
    row.TenderType,
    row.Status,
    row.Stage,
    row.BidDecision,
    row.PreparationStatus,
    row.ClientStatus,
    row.AwardedToDle,
    row.OwnerName || '-',
    day(row.SubmissionDeadline),
    day(row.ClosingDate),
    day(row.ClarificationDeadline),
    String(row.Title || '').slice(0, 70),
  ].join(' | '));
}
const subs = await pool.request().query(`SELECT OpportunityId, COUNT(1) AS N FROM commercial.TenderSubmissions GROUP BY OpportunityId`);
console.log('SUBMISSIONS', subs.recordset.map((row) => row.OpportunityId + ':' + row.N).join(' ; ') || 'none');
await pool.close();
