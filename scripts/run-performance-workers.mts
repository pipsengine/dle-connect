/**
 * Idempotent Performance Management worker: probation alerts + outbox delivery.
 *
 * Run on a schedule (e.g. every 15 minutes):
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/run-performance-workers.mts
 */
import { processPerformanceWorkers } from '../apps/dashboard/lib/performance-domain-store';

const actor = process.argv[2] || 'Performance Worker';

try {
  const result = await processPerformanceWorkers(String(actor));
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
