/**
 * Controlled JSON → DLE Enterprise SQL import for Performance Management.
 * Idempotent via [hris].[PerformanceMigrations].
 *
 * Run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/import-performance-domain-sql.mts
 *
 * Optional:
 *   PERFORMANCE_ALLOW_SYNTHETIC_IMPORT=true  — allow unresolved EMP-* historical rows
 *   (enabled by default for the repo seed domain.json cutover)
 */
process.env.PERFORMANCE_ALLOW_SYNTHETIC_IMPORT = process.env.PERFORMANCE_ALLOW_SYNTHETIC_IMPORT || 'true';

import { importPerformanceDomainJsonToSql, getPerformanceSqlHealth } from '../apps/dashboard/lib/performance-sql-repository';

const actor = process.argv[2] || process.env.USER || process.env.USERNAME || 'Import Script';

try {
  const result = await importPerformanceDomainJsonToSql(String(actor));
  const health = await getPerformanceSqlHealth();
  console.log(JSON.stringify({
    ok: true,
    import: result,
    health: {
      source: health.source,
      databaseAvailable: health.databaseAvailable,
      migrationStatus: health.migrationStatus,
      recordCounts: health.recordCounts,
      warning: health.warning,
      updatedAt: health.updatedAt,
    },
  }, null, 2));
  if (!result.imported && result.status !== 'Completed') {
    process.exit(2);
  }
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
