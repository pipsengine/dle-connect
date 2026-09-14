/**
 * Confirm the six named production supervisors report to Momoh (C1882).
 * Dry run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/assign-momoh-named-supervisors.mts
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/assign-momoh-named-supervisors.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadWorkspaceEnv, readEmployeeDirectoryFromDb, type DleEmployeeDirectoryRow } from '../apps/dashboard/lib/dle-enterprise-db';
import { assignEmployeesToSupervisor, readSupervisorAssignments } from '../apps/dashboard/lib/supervisor-assignment-store';
import { extractSupervisorEmployeeCode, supervisorCodesMatch } from '../apps/dashboard/lib/timesheet-agege-blasting';

const MOMOH_CODE = 'C1882';
const BATCH = '2026-09-14-momoh-named-supervisors';

const TARGETS = [
  { sourceName: 'OLOKO KOLAWOLE', hintCodes: ['P0045'] },
  { sourceName: 'OWOLOJA AKANDE', hintCodes: ['P0072'] },
  { sourceName: 'OGUDU OGONNAYA DAVID', hintCodes: ['P0044'] },
  { sourceName: 'FEMI BELLO', hintCodes: ['C0585'] },
  { sourceName: 'UDEH DAVID', hintCodes: ['C2422'] },
  { sourceName: 'VINCENT OKEKE', hintCodes: ['C1533'] },
];

const loadEnvFiles = () => {
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
  loadWorkspaceEnv();
};

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const codeOf = (employee: DleEmployeeDirectoryRow) => upper(employee.employeeCode || employee.employeeId);
const tokens = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, ' ').split(' ').filter((part) => part.length > 1);
const nameHasAll = (fullName: string, sourceName: string) => {
  const haystack = tokens(fullName);
  return tokens(sourceName).every((token) => haystack.includes(token) || haystack.some((part) => part.includes(token) || token.includes(part)));
};

const managerCode = (value: unknown) => extractSupervisorEmployeeCode(clean(value)) || '';

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const directory = await readEmployeeDirectoryFromDb();
  if (!directory?.length) throw new Error('Employee directory is empty or DLE_Enterprise is not configured.');
  const assignments = await readSupervisorAssignments();
  const momoh = directory.find((employee) => codeOf(employee) === MOMOH_CODE);
  if (!momoh) throw new Error('Momoh C1882 was not found.');

  const matches = TARGETS.map((target) => {
    const hinted = directory.filter((employee) => target.hintCodes.includes(codeOf(employee)));
    const named = directory.filter((employee) => nameHasAll(employee.fullName, target.sourceName));
    const unique = [...new Map([...hinted, ...named].map((employee) => [codeOf(employee), employee])).values()];
    const preferred = hinted[0] || unique.find((employee) => !/inactive|terminated|resigned|retired|deceased|suspend/i.test(employee.status)) || unique[0] || null;
    const assignment = preferred
      ? assignments
        .filter((row) => upper(row.employeeCode) === codeOf(preferred))
        .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0]
      : null;
    return {
      sourceName: target.sourceName,
      employeeCode: preferred ? codeOf(preferred) : null,
      fullName: preferred?.fullName || null,
      status: preferred?.status || null,
      title: preferred?.jobTitle || null,
      location: preferred?.officeLocation || preferred?.location || null,
      workCenter: preferred?.workCenter || null,
      hrManager: preferred?.managerName || null,
      assignmentSupervisor: assignment ? `${assignment.supervisorEmployeeCode} ${assignment.supervisorName || ''}`.trim() : null,
      alreadyUnderMomoh: Boolean(
        preferred
        && (
          supervisorCodesMatch(managerCode(preferred.managerName), MOMOH_CODE)
          || supervisorCodesMatch(assignment?.supervisorEmployeeCode, MOMOH_CODE)
        ),
      ),
      otherMatches: unique.filter((employee) => codeOf(employee) !== (preferred ? codeOf(preferred) : '')).map((employee) => `${codeOf(employee)} ${employee.fullName} (${employee.status})`),
    };
  });

  const missing = matches.filter((row) => !row.employeeCode);
  const employeeCodes = matches.map((row) => row.employeeCode).filter((code): code is string => Boolean(code));
  if (missing.length) throw new Error(`Unresolved names: ${missing.map((row) => row.sourceName).join(', ')}`);

  console.log(apply ? 'APPLY' : 'DRY RUN');
  console.log(JSON.stringify({ momoh: `${MOMOH_CODE} ${momoh.fullName}`, matches }, null, 2));

  if (!apply) {
    console.log('\nRe-run with --apply to write reporting lines to C1882.');
    return;
  }

  const result = await assignEmployeesToSupervisor({
    supervisorEmployeeCode: MOMOH_CODE,
    employeeCodes,
    assignmentBatch: BATCH,
    assignmentGroup: 'IDI-ORO PRODUCTION SUPERVISORS',
    reason: 'Named Idi-Oro production supervisors report to Momoh Mohammed (C1882).',
    performedBy: 'scripts/assign-momoh-named-supervisors.mts',
    sourceRows: matches.map((row) => ({
      employeeCode: row.employeeCode,
      sourceLabel: row.sourceName,
      tradeRole: row.title,
      matchConfidence: 'NamedMomohSupervisor',
      matchNote: `${row.fullName} · ${row.location || 'no yard'}`,
    })),
  });

  console.log(JSON.stringify({ assigned: result, employeeCodes }, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
