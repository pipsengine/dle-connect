/**
 * One-off smoke test for ITSM tables. Run from repo root:
 * npx tsx apps/dashboard/scripts/smoke-itsm.mts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardRoot = path.resolve(__dirname, '..');

for (const file of ['.env', '.env.local']) {
  try {
    const text = readFileSync(path.join(dashboardRoot, file), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {
    /* optional */
  }
}

const { ensureItServiceDeskSchemaSql } = await import('../lib/it-service-desk-sql-schema.ts');

const config: sql.config = {
  server: process.env.DLE_ENTERPRISE_DB_HOST || '',
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  user: process.env.DLE_ENTERPRISE_DB_USER,
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD,
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  options: {
    encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true') !== 'false',
    trustServerCertificate: String(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE || 'true') !== 'false',
  },
};

if (!config.server || !config.user || !config.password) {
  console.error('Missing DLE_ENTERPRISE_DB_* env');
  process.exit(1);
}

const pool = await sql.connect(config);
await pool.request().query(ensureItServiceDeskSchemaSql);

const ticketId = `TK-SMOKE-${Date.now().toString().slice(-6)}`;
await pool
  .request()
  .input('TicketId', sql.NVarChar(40), ticketId)
  .input('Subject', sql.NVarChar(300), 'ITSM smoke test')
  .input('Status', sql.NVarChar(40), 'Open')
  .input('Priority', sql.NVarChar(20), 'High')
  .input('CreatedBy', sql.NVarChar(120), 'Smoke')
  .query(`
    INSERT INTO [it].[ItsmTickets] ([TicketId],[Subject],[Status],[Priority],[CreatedBy],[UpdatedBy])
    VALUES (@TicketId,@Subject,@Status,@Priority,@CreatedBy,@CreatedBy)
  `);

await pool
  .request()
  .input('TicketId', sql.NVarChar(40), ticketId)
  .query(`UPDATE [it].[ItsmTickets] SET [Status]=N'In Progress',[AssigneeName]=N'Smoke Agent',[UpdatedAt]=SYSUTCDATETIME() WHERE [TicketId]=@TicketId`);

const read = await pool
  .request()
  .input('TicketId', sql.NVarChar(40), ticketId)
  .query(`SELECT TicketId, Status, AssigneeName FROM [it].[ItsmTickets] WHERE [TicketId]=@TicketId`);

const tables = await pool.request().query(`
  SELECT t.name
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = N'it' AND t.name LIKE N'Itsm%'
  ORDER BY t.name
`);

console.log('ticket', read.recordset[0]);
console.log(
  'tables',
  tables.recordset.map((r: { name: string }) => r.name),
);
console.log('SMOKE_OK');
await pool.close();
