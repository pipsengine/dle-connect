/**
 * Apply Agege daily-rate supervisor roster to HRIS reporting lines.
 *
 * Skipped by design:
 *   - Jacob Akpo electrician/mechanic/scaffolder block (already Sunday Okewu P0436)
 *   - Kettle crew (stays on P0277 Akinsanya; Excel P0330 is Olukunle Oyeleye)
 *
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/import-agege-supervisor-assignments.mts
 *
 * Apply: add --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import { assignEmployeesToSupervisor } from '../apps/dashboard/lib/supervisor-assignment-store';

type RosterFile = {
  assignmentBatch: string;
  assignmentGroup: string;
  supervisorEmployeeCode: string;
  performedBy?: string;
  reason?: string;
  rows: Array<{
    sourceName: string;
    tradeRole?: string;
    employeeCode: string;
    matchConfidence?: string;
    matchNote?: string;
  }>;
};

const ROSTER_FILES = [
  '2026-09-02-agege-welders-grinders-shittu-wale.json',
  '2026-09-02-agege-fitters-raymond-adanou.json',
  '2026-09-02-agege-cnc-abel-daniel.json',
  '2026-09-02-agege-riggers-adeniyi-joseph.json',
  '2026-09-02-agege-painters-jimoh-gbadamosi.json',
];

const arg = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
};

const main = async () => {
  loadWorkspaceEnv();
  const apply = process.argv.includes('--apply');
  const rosterDir = path.resolve('scripts/database/supervisor-assignments');
  const summaries: Array<Record<string, unknown>> = [];

  for (const fileName of ROSTER_FILES) {
    const roster = JSON.parse(fs.readFileSync(path.join(rosterDir, fileName), 'utf8')) as RosterFile;
    const onlyCode = arg('--only').toUpperCase();
    const rows = onlyCode
      ? roster.rows.filter((row) => String(row.employeeCode || '').toUpperCase() === onlyCode)
      : roster.rows;
    if (!rows.length) continue;
    const employeeCodes = rows.map((row) => row.employeeCode);
    console.log(`${apply ? 'APPLY' : 'DRY RUN'}  ${roster.supervisorEmployeeCode}  ${roster.assignmentGroup}  ${employeeCodes.length} people`);
    if (!apply) {
      summaries.push({
        file: fileName,
        supervisor: roster.supervisorEmployeeCode,
        group: roster.assignmentGroup,
        employees: employeeCodes.length,
      });
      continue;
    }

    const result = await assignEmployeesToSupervisor({
      supervisorEmployeeCode: roster.supervisorEmployeeCode,
      employeeCodes,
      assignmentBatch: roster.assignmentBatch,
      assignmentGroup: roster.assignmentGroup,
      reason: roster.reason,
      performedBy: roster.performedBy || 'scripts/import-agege-supervisor-assignments.mts',
      sourceRows: rows.map((row) => ({
        employeeCode: row.employeeCode,
        sourceLabel: row.sourceName,
        tradeRole: row.tradeRole,
        matchConfidence: row.matchConfidence,
        matchNote: row.matchNote,
      })),
    });
    const matched = result.assignments.filter((row) => row.matchedStatus === 'Matched').length;
    const unresolved = result.assignments.filter((row) => row.matchedStatus !== 'Matched');
    summaries.push({
      file: fileName,
      supervisor: result.supervisor.reportingManagerLabel,
      group: result.assignmentGroup,
      matched,
      unresolved: unresolved.map((row) => `${row.employeeCode || row.sourceLabel}`),
    });
    if (unresolved.length) {
      console.log(`  Unresolved: ${unresolved.map((row) => row.employeeCode || row.sourceLabel).join(', ')}`);
    }
  }

  if (!apply) {
    console.log('\nSkipped: Jacob Akpo block (Sunday Okewu P0436). Kettle crew (P0277 Akinsanya).');
    console.log('Re-run with --apply to write reporting managers in HRIS.');
  }
  console.log(JSON.stringify(summaries, null, 2));
  process.exit(0);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
