/**
 * Import Sage 300 People leave balances into HRIS without touching Connect leave setup.
 *
 * Safety:
 *   - Does not change leave types, policies, or live Connect applications.
 *   - Inserts Sage balances only where no HRIS row exists for that employee + leave type.
 *   - Updates only rows whose SourceSystem is Sage (or blank).
 *   - Skips rows owned by DLE_Enterprise HRIS.
 *
 * Dry run (default):
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/import-sage-leave-balances.mts
 *
 * Apply:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/import-sage-leave-balances.mts --apply
 *
 * Optional:
 *   --code=P0146
 *   --limit=50
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { syncSageLeaveToHris } from '../apps/dashboard/lib/sage-leave-sync';

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

const main = async () => {
  loadEnvFiles();
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const codeArg = args.find((arg) => arg.startsWith('--code='));
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const employeeCode = codeArg ? codeArg.split('=')[1]?.trim() : '';
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

  const result = await syncSageLeaveToHris({
    employeeCodes: employeeCode ? [employeeCode] : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    dryRun: !apply,
  });

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    linkedEmployees: result.linkedEmployees,
    insertBalances: result.inserted,
    updateSageBalances: result.updated,
    skippedHrisOwned: result.skippedHris,
    skippedUnmappedTypes: result.skippedUnmapped,
    skippedEmpty: result.skippedEmpty,
    skippedPolicy: result.skippedPolicy,
    sageHistoryRows: result.transactionsInserted,
    samples: result.samples,
    note: apply
      ? 'Sage balances imported. HRIS-owned leave rows, policies, and live applications were left unchanged.'
      : 'No writes. Re-run with --apply to import Sage balances that are missing or still Sage-owned.',
  }, null, 2));
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
