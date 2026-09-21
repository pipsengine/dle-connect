/**
 * Re-assign in-flight Cost Centre Manager payments to the HR-confirmed department HOD.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-cost-centre-manager-approvers.mts
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/repair-cost-centre-manager-approvers.mts DLE260940
 */
import fs from 'node:fs';
import path from 'node:path';

const loadWorkspaceEnv = () => {
  for (const file of [path.resolve('.env'), path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
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

loadWorkspaceEnv();

const requestNumber = String(process.argv[2] || '').trim();

const main = async () => {
  const { repairPendingCostCentreManagerAssignments } = await import(
    '../apps/dashboard/lib/finance-intelligence/payment-requests-service.ts'
  );
  const result = await repairPendingCostCentreManagerAssignments(requestNumber || undefined);
  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
