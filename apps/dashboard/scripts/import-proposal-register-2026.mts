/**
 * Load the 2026 handwritten proposal register as historical records.
 * These rows stay out of the GM and MD queues and out of the live dashboard.
 * Run after the site that understands Historical status has been published.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-proposal-register-2026.mts --dry-run
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/import-proposal-register-2026.mts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROPOSAL_REGISTER_2026, type ProposalRegisterRow } from './proposal-register-2026.data.ts';

const dryRun = process.argv.includes('--dry-run');

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

const ACTOR = 'Proposal Register Import';
const SOURCE = 'Proposal Register 2026';

const referenceOf = (row: ProposalRegisterRow) => row.reference || `PR-${row.serial}`;

const kindOf = (description: string) => {
  const text = description.toLowerCase();
  if (/\beoi\b|expression of interest|pre-?qualif/.test(text)) return { kind: 'EOI' as const, stated: true };
  if (/\bitt\b|invitation to tender/.test(text)) return { kind: 'ITT' as const, stated: true };
  if (/\brfq\b|request for quotation|\bquotation\b/.test(text)) return { kind: 'RFQ' as const, stated: true };
  return { kind: 'RFQ' as const, stated: false };
};

const sectorOf = (text: string) => {
  const value = text.toLowerCase();
  if (/pipeline|\blng\b|oil|gas|fpso|wellhead|bonga|separator|vessel|knockout|flowline|subsea/.test(value)) return 'Oil & Gas';
  if (/fabricat|spool|galvaniz/.test(value)) return 'Fabrication';
  if (/building|church|secretariat|construct/.test(value)) return 'Construction';
  return 'Engineering';
};

const emailOk = (row: ProposalRegisterRow) => {
  const email = String(row.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  if (/email/i.test(row.note || '') && /unclear|legible|partly/i.test(row.note || '')) return '';
  return email;
};

const phoneOk = (row: ProposalRegisterRow) => {
  const phone = String(row.phone || '').trim();
  if (!/\d{7,}/.test(phone)) return '';
  if (/phone/i.test(row.note || '') && /unclear|legible|partly/i.test(row.note || '')) return '';
  return phone;
};

const notesFor = (row: ProposalRegisterRow, stated: boolean, kind: string) => {
  const parts = [
    `Book serial ${row.serial}. Loaded from the 2026 handwritten proposal register for records and trends.`,
    row.handler ? `Handler as written: ${row.handler}.` : '',
    stated ? `The register states ${kind}.` : 'The register did not state ITT, RFQ or EOI; stored as RFQ for trend grouping.',
    row.note || '',
  ];
  if (row.email && !emailOk(row)) parts.push(`Email as written was not stored because the reading is uncertain: ${row.email}.`);
  if (row.phone && !phoneOk(row)) parts.push(`Phone as written was not stored because the reading is uncertain: ${row.phone}.`);
  return parts.filter(Boolean).join(' ');
};

const seen = new Map<string, number>();
for (const row of PROPOSAL_REGISTER_2026) {
  const reference = referenceOf(row);
  if (seen.has(reference)) throw new Error(`Duplicate reference ${reference}.`);
  seen.set(reference, row.serial);
  if (!row.client.trim() || !row.description.trim()) throw new Error(`Serial ${row.serial} is missing a client or description.`);
}

const summary = PROPOSAL_REGISTER_2026.reduce((counts, row) => {
  const { kind, stated } = kindOf(row.description);
  counts[stated ? kind : 'RFQ (unstated)'] += 1;
  return counts;
}, { ITT: 0, RFQ: 0, EOI: 0, 'RFQ (unstated)': 0 } as Record<string, number>);

console.log(`Proposal register rows: ${PROPOSAL_REGISTER_2026.length}`);
console.log(summary);
console.log('Serials 2926-2935 are not on the photographs and are not invented. Blank lines, including 2975, are skipped.');

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
let inserted = 0;
let repaired = 0;
let skipped = 0;

for (const row of PROPOSAL_REGISTER_2026) {
  const reference = referenceOf(row);
  const { kind, stated } = kindOf(row.description);
  const existing = await pool.request()
    .input('ReferenceNo', sql.NVarChar(80), reference)
    .query(`SELECT [OpportunityId],[Status],[SourceName] FROM [commercial].[TenderOpportunities] WHERE [ReferenceNo]=@ReferenceNo`);
  const current = existing.recordset[0] as { OpportunityId: string; Status: string; SourceName: string } | undefined;
  if (current && current.Status === 'Historical') {
    skipped += 1;
    continue;
  }
  if (current && current.SourceName !== SOURCE) {
    console.log(`Skipped ${reference}: reference already belongs to ${current.SourceName || 'another record'}.`);
    skipped += 1;
    continue;
  }

  const saved = current
    ? { id: current.OpportunityId }
    : await saveOpportunity({
      title: row.description.slice(0, 300),
      description: row.description,
      clientName: row.client,
      contactPerson: row.contact || '',
      email: emailOk(row),
      phone: phoneOk(row),
      source: SOURCE,
      commercialKind: kind,
      opportunityType: kind,
      tenderType: kind,
      category: sectorOf(`${row.client} ${row.description}`),
      referenceNo: reference,
      enquiryRef: reference.replace(/^PR-/, ''),
      invitationDate: row.received || '',
      submissionDeadline: row.due || '',
      ownerName: row.handler || '',
      ownerEmployeeCode: '',
      estimatedValue: 0,
      currency: '',
      stage: 'Historical Register',
      teamNotes: notesFor(row, stated, kind),
      saveMode: 'draft',
    }, ACTOR);

  if (!saved?.id) throw new Error(`Serial ${row.serial} was not saved.`);

  await pool.request()
    .input('Id', sql.NVarChar(40), saved.id)
    .input('Kind', sql.NVarChar(10), kind)
    .input('Received', sql.Date, row.received || null)
    .input('Due', sql.Date, row.due || null)
    .input('Handler', sql.NVarChar(180), row.handler || '')
    .input('Actor', sql.NVarChar(120), ACTOR)
    .query(`
      UPDATE [commercial].[TenderOpportunities]
      SET [Status]=N'Historical',
          [Stage]=N'Historical Register',
          [CommercialReview]=N'Reviewed',
          [CommercialKind]=@Kind,
          [OpportunityType]=@Kind,
          [TenderType]=@Kind,
          [SourceName]=N'Proposal Register 2026',
          [InvitationDate]=@Received,
          [SubmissionDeadline]=@Due,
          [OwnerName]=@Handler,
          [OwnerEmployeeCode]=N'',
          [PreparationStatus]=N'Not Started',
          [ClientStatus]=N'Pending',
          [AwardedToDle]=N'Pending Decision',
          [BidDecision]=NULL,
          [GmBidDecision]=NULL,
          [UrgentException]=0,
          [EstimatedValue]=0,
          [Currency]=N'',
          [CreatedAt]=COALESCE(CAST(@Received AS DATETIME2), [CreatedAt]),
          [UpdatedAt]=COALESCE(CAST(@Received AS DATETIME2), [UpdatedAt]),
          [UpdatedBy]=@Actor
      WHERE [OpportunityId]=@Id
    `);
  if (!current) {
    await recordOpportunityAudit(saved.id, ACTOR, 'HISTORICAL_REGISTER', `Loaded from the 2026 proposal register for records and trends. Book serial ${row.serial}.`);
    inserted += 1;
  } else {
    repaired += 1;
  }
  if ((inserted + repaired) % 25 === 0) console.log(`Written ${inserted + repaired}…`);
}

console.log(`Inserted ${inserted}, repaired ${repaired}, skipped ${skipped}.`);
process.exit(0);
