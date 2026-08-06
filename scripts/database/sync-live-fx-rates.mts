/**
 * Force-sync live market FX rates into finance.FxRates.
 *
 * Usage:
 *   npx --yes tsx --tsconfig apps/dashboard/tsconfig.json scripts/database/sync-live-fx-rates.mts
 */
import { loadWorkspaceEnv } from '../../apps/dashboard/lib/dle-enterprise-db.ts';
import { ensureLiveFxRates } from '../../apps/dashboard/lib/finance-intelligence/fx-rates-service.ts';
import { getPrevailingFxRate } from '../../apps/dashboard/lib/finance-intelligence/approval-matrix-service.ts';

loadWorkspaceEnv();

const main = async () => {
  const sync = await ensureLiveFxRates({ force: true });
  console.log('Synced:', JSON.stringify(sync, null, 2));
  for (const ccy of ['USD', 'EUR', 'GBP']) {
    console.log(ccy, await getPrevailingFxRate(ccy));
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
