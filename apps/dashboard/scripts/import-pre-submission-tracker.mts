/**
 * Replace the handwritten proposal-register load with the 2026 Pre-Submission Tracker workbook.
 * Rows stay on the Proposal Register and out of the live approval queues.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-pre-submission-tracker.mts --dry-run
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-pre-submission-tracker.mts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import XLSX from 'xlsx';

const dryRun = process.argv.includes('--dry-run');
const workbookPath = process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length)
  || 'G:/Files Implementations/1. Pre-Submission Tracker.xlsx';

for (const file of [resolve('.env'), resolve('apps/dashboard/.env')]) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* ignore */ }
}

const ACTOR = 'Pre-Submission Tracker Import';
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const cellText = (ws: XLSX.WorkSheet, row: number, column: number) => {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: column })];
  if (!cell) return '';
  if (cell.t === 'd') return String(cell.w || '').trim();
  return String(cell.v ?? cell.w ?? '').replace(/\s+/g, ' ').trim();
};

const isoDate = (display: string) => {
  const value = display.trim();
  const dayMonth = value.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?$/);
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = Number(dayMonth[2]);
    let year = dayMonth[3] ? Number(dayMonth[3]) : 2026;
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const named = value.match(/^(\d{1,2})-([A-Za-z]{3})(?:-(\d{2,4}))?$/);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    let year = named[3] ? Number(named[3]) : 2026;
    if (!month || !Number.isFinite(year)) return '';
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}`;
  }
  const numeric = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!numeric) return '';
  let year = Number(numeric[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(numeric[1])).padStart(2, '0')}-${String(Number(numeric[2])).padStart(2, '0')}`;
};

const kindOf = (text: string) => {
  const value = text.toLowerCase();
  if (/\beoi\b|expression of interest|pre-?qualif/.test(value)) return 'EOI';
  if (/\bitt\b|invitation to tender/.test(value)) return 'ITT';
  return 'RFQ';
};

type TrackerRow = {
  serial: string;
  unnumbered: boolean;
  reference: string;
  received: string;
  receivedText: string;
  client: string;
  subject: string;
  description: string;
  source: string;
  sector: string;
  deadline: string;
  deadlineText: string;
  decision: '' | 'Bid' | 'No Bid';
  rationale: string;
  priority: string;
  submitted: boolean;
  submittedText: string;
  submittedOn: string;
  proposalLead: string;
  salesLead: string;
  notes: string;
};

const wb = XLSX.readFile(workbookPath, { cellDates: true });
const ws = wb.Sheets['2026'];
if (!ws?.['!ref']) throw new Error(`The 2026 sheet was not found in ${workbookPath}.`);
const range = XLSX.utils.decode_range(ws['!ref']);
const rows: TrackerRow[] = [];
for (let r = 11; r <= range.e.r; r += 1) {
  const serialCell = cellText(ws, r, 1);
  const numbered = /^\d+$/.test(serialCell);
  if (!numbered) {
    const hasEntry = [2, 3, 4].some((column) => cellText(ws, r, column));
    if (!hasEntry) {
      if (rows.length) break;
      continue;
    }
  }
  const serial = numbered ? serialCell : `R${r + 1}`;
  const subject = cellText(ws, r, 4);
  const description = cellText(ws, r, 5);
  const decisionText = cellText(ws, r, 10).toLowerCase();
  const decision: TrackerRow['decision'] = decisionText === 'bid' ? 'Bid' : /no\s*-?\s*bid/.test(decisionText) ? 'No Bid' : '';
  const priorityText = cellText(ws, r, 12);
  const priority = /^(high|medium|low)$/i.test(priorityText) ? priorityText[0].toUpperCase() + priorityText.slice(1).toLowerCase() : '';
  const receivedText = cellText(ws, r, 2);
  const deadlineText = cellText(ws, r, 8);
  const submittedText = cellText(ws, r, 14);
  const sector = cellText(ws, r, 7);
  rows.push({
    serial,
    unnumbered: !numbered,
    reference: numbered ? `PST-2026-${serial.padStart(3, '0')}` : `PST-2026-${serial}`,
    received: isoDate(receivedText),
    receivedText,
    client: cellText(ws, r, 3),
    subject,
    description,
    source: cellText(ws, r, 6),
    sector: /^oil and gas$/i.test(sector) ? 'Oil and Gas' : /^non oil and gas$/i.test(sector) ? 'Non Oil and Gas' : sector ? sector : 'Unspecified',
    deadline: isoDate(deadlineText),
    deadlineText,
    decision,
    rationale: cellText(ws, r, 11),
    priority,
    submitted: /^submitted$/i.test(cellText(ws, r, 13)),
    submittedText,
    submittedOn: isoDate(submittedText),
    proposalLead: cellText(ws, r, 15),
    salesLead: cellText(ws, r, 16),
    notes: cellText(ws, r, 17),
  });
}

const seen = new Set<string>();
const problems: string[] = [];
for (const row of rows) {
  if (seen.has(row.reference)) problems.push(`Duplicate tracker reference ${row.reference}.`);
  seen.add(row.reference);
  if (!row.client) problems.push(`Tracker ${row.serial} has no client.`);
  if (!row.subject && !row.description) problems.push(`Tracker ${row.serial} has no subject or description.`);
  if (row.receivedText && !row.received) problems.push(`Tracker ${row.serial} date received "${row.receivedText}" was not read.`);
  if (row.deadlineText && !row.deadline) problems.push(`Tracker ${row.serial} deadline "${row.deadlineText}" was not read.`);
  if (row.submittedText && !row.submittedOn) problems.push(`Tracker ${row.serial} date submitted "${row.submittedText}" was not read.`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const titleOf = (row: TrackerRow) => (row.subject || row.description).slice(0, 300);
const notesOf = (row: TrackerRow) => [
  row.unnumbered ? `Pre-Submission Tracker 2026, sheet row ${row.serial.slice(1)}. The S/N cell was blank.` : `Pre-Submission Tracker 2026, S/N ${row.serial}.`,
  row.source ? `Source: ${row.source}.` : '',
  row.proposalLead ? `Proposal team lead: ${row.proposalLead}.` : '',
  row.salesLead ? `Sales team lead: ${row.salesLead}.` : '',
  row.decision ? `Bid or no bid: ${row.decision}.` : 'Bid or no bid was blank on the tracker.',
  row.rationale ? `Rationale: ${row.rationale}.` : '',
  row.submitted ? `Submission status: Submitted${row.submittedText ? ` on ${row.submittedText}` : ''}.` : 'Submission status was blank on the tracker.',
  row.notes ? `Notes: ${row.notes}.` : '',
  !row.subject ? 'The subject cell was blank. The description is used as the title.' : '',
].filter(Boolean).join(' ');

console.log(`Tracker rows: ${rows.length}`);
console.log({
  bid: rows.filter((row) => row.decision === 'Bid').length,
  noBid: rows.filter((row) => row.decision === 'No Bid').length,
  submitted: rows.filter((row) => row.submitted).length,
  oil: rows.filter((row) => row.sector === 'Oil and Gas').length,
  nonOil: rows.filter((row) => row.sector === 'Non Oil and Gas').length,
  unspecified: rows.filter((row) => row.sector === 'Unspecified').length,
});
console.log(rows.slice(0, 3).map((row) => `${row.reference} ${row.receivedText} -> ${row.received} | ${row.deadlineText} -> ${row.deadline} | ${row.client}`).join('\n'));

if (dryRun) {
  console.log('Dry run only. Nothing was written.');
  process.exit(0);
}

process.chdir(resolve('apps/dashboard'));
const [{ saveOpportunity, recordOpportunityAudit }, { getDleEnterpriseDbPool }, mssqlModule] = await Promise.all([
  import('@/lib/commercial/tender-store'),
  import('@/lib/dle-enterprise-db'),
  import('mssql'),
]);
const sql = (mssqlModule as { default?: typeof import('mssql') }).default ?? mssqlModule;
const pool = await getDleEnterpriseDbPool();

const removedChildren = await pool.request().query(`
  SELECT t.name AS TableName
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  INNER JOIN sys.columns c ON c.object_id = t.object_id
  WHERE s.name = N'commercial' AND c.name = N'OpportunityId' AND t.name <> N'TenderOpportunities'
`);
let removed = 0;
for (const table of removedChildren.recordset as Array<{ TableName: string }>) {
  if (!/^[A-Za-z0-9_]+$/.test(table.TableName)) continue;
  const result = await pool.request().query(`
    DELETE FROM [commercial].[${table.TableName}]
    WHERE [OpportunityId] IN (
      SELECT [OpportunityId] FROM [commercial].[TenderOpportunities]
      WHERE [SourceName] = N'Proposal Register 2026' OR [CreatedBy] = N'Proposal Register Import'
    )
  `);
  removed += result.rowsAffected[0] || 0;
}
const removedRows = await pool.request().query(`
  DELETE FROM [commercial].[TenderOpportunities]
  WHERE [SourceName] = N'Proposal Register 2026' OR [CreatedBy] = N'Proposal Register Import'
`);
console.log(`Removed ${removedRows.rowsAffected[0] || 0} handwritten register records and ${removed} related rows.`);

let inserted = 0;
let updated = 0;
for (const row of rows) {
  const existing = await pool.request()
    .input('ReferenceNo', sql.NVarChar(80), row.reference)
    .query(`SELECT [OpportunityId] FROM [commercial].[TenderOpportunities] WHERE [ReferenceNo]=@ReferenceNo`);
  const currentId = existing.recordset[0]?.OpportunityId as string | undefined;
  const kind = kindOf(`${row.subject} ${row.description}`);
  const officer = row.proposalLead || row.salesLead;
  const saved = await saveOpportunity({
    id: currentId || '',
    title: titleOf(row),
    description: row.description || row.subject,
    clientName: row.client,
    source: row.source || 'Pre-Submission Tracker',
    commercialKind: kind,
    opportunityType: kind,
    tenderType: kind,
    category: row.sector,
    referenceNo: row.reference,
    enquiryRef: row.serial,
    invitationDate: row.received,
    submissionDeadline: row.deadline,
    ownerName: officer,
    ownerEmployeeCode: '',
    priority: row.priority || 'Medium',
    estimatedValue: 0,
    currency: '',
    stage: 'Historical Register',
    teamNotes: notesOf(row),
    approvalNotes: row.rationale,
    saveMode: 'draft',
  }, ACTOR);
  if (!saved?.id) throw new Error(`Tracker ${row.serial} was not saved.`);

  await pool.request()
    .input('Id', sql.NVarChar(40), saved.id)
    .input('Kind', sql.NVarChar(10), kind)
    .input('Source', sql.NVarChar(80), row.source || 'Pre-Submission Tracker')
    .input('Sector', sql.NVarChar(80), row.sector)
    .input('Received', sql.Date, row.received || null)
    .input('Due', sql.Date, row.deadline || null)
    .input('Officer', sql.NVarChar(180), officer)
    .input('Priority', sql.NVarChar(20), row.priority)
    .input('Bid', sql.NVarChar(20), row.decision || null)
    .input('Prep', sql.NVarChar(20), row.submitted ? 'Submitted' : 'Not Started')
    .input('Notes', sql.NVarChar(sql.MAX), notesOf(row))
    .input('Rationale', sql.NVarChar(sql.MAX), row.rationale)
    .input('Actor', sql.NVarChar(120), ACTOR)
    .query(`
      UPDATE [commercial].[TenderOpportunities]
      SET [Status]=N'Historical',
          [Stage]=N'Historical Register',
          [CommercialReview]=N'Reviewed',
          [CommercialKind]=@Kind,
          [OpportunityType]=@Kind,
          [TenderType]=@Kind,
          [SourceName]=@Source,
          [Category]=@Sector,
          [InvitationDate]=@Received,
          [SubmissionDeadline]=@Due,
          [OwnerName]=@Officer,
          [OwnerEmployeeCode]=N'',
          [Priority]=@Priority,
          [BidDecision]=NULLIF(@Bid, N''),
          [GmBidDecision]=NULL,
          [PreparationStatus]=@Prep,
          [ClientStatus]=N'Pending',
          [AwardedToDle]=N'Pending Decision',
          [UrgentException]=0,
          [EstimatedValue]=0,
          [Currency]=N'',
          [TeamNotes]=@Notes,
          [ApprovalNotes]=@Rationale,
          [CreatedAt]=COALESCE(CAST(@Received AS DATETIME2), [CreatedAt]),
          [UpdatedAt]=COALESCE(CAST(@Received AS DATETIME2), [UpdatedAt]),
          [UpdatedBy]=@Actor
      WHERE [OpportunityId]=@Id
    `);

  if (row.submitted && row.submittedOn) {
    await pool.request()
      .input('Id', sql.NVarChar(40), `SUB-${row.reference}`.slice(0, 40))
      .input('OpportunityId', sql.NVarChar(40), saved.id)
      .input('Channel', sql.NVarChar(80), row.source || 'Pre-Submission Tracker')
      .input('Receipt', sql.NVarChar(150), row.reference)
      .input('SubmittedBy', sql.NVarChar(120), officer || ACTOR)
      .input('SubmittedAt', sql.DateTime2, new Date(`${row.submittedOn}T12:00:00Z`))
      .input('Notes', sql.NVarChar(sql.MAX), 'Recorded from the 2026 Pre-Submission Tracker.')
      .query(`
        IF NOT EXISTS (SELECT 1 FROM [commercial].[TenderSubmissions] WHERE [OpportunityId]=@OpportunityId AND [ReceiptReference]=@Receipt)
        INSERT INTO [commercial].[TenderSubmissions] ([SubmissionId],[OpportunityId],[Channel],[ReceiptReference],[SubmittedBy],[SubmittedAt],[Notes])
        VALUES (@Id,@OpportunityId,@Channel,@Receipt,@SubmittedBy,@SubmittedAt,@Notes)
      `);
  }
  if (!currentId) {
    await recordOpportunityAudit(saved.id, ACTOR, 'TRACKER_IMPORT', `Loaded from the 2026 Pre-Submission Tracker. S/N ${row.serial}.`);
    inserted += 1;
  } else {
    updated += 1;
  }
}

const check = await pool.request().query(`
  SELECT
    SUM(CASE WHEN [ReferenceNo] LIKE N'PST-2026-%' AND [Status]=N'Historical' THEN 1 ELSE 0 END) AS TrackerRows,
    SUM(CASE WHEN [SourceName]=N'Proposal Register 2026' OR [CreatedBy]=N'Proposal Register Import' THEN 1 ELSE 0 END) AS HandwrittenRows
  FROM [commercial].[TenderOpportunities]
`);
console.log(`Inserted ${inserted}, updated ${updated}.`);
console.log(check.recordset[0]);
process.exit(0);
