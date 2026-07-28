/**
 * One-shot: purge classic Ada/CO-REV bootstrap demo from Performance SQL DomainJson.
 * Run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/purge-performance-demo-sql.mts
 */
import {
  getPerformanceSqlHealth,
  readPerformanceDomainFromSql,
  writePerformanceDomainToSql,
} from '../apps/dashboard/lib/performance-sql-repository';
import { stripDemoPerformanceSeed } from '../apps/dashboard/lib/performance-demo-seed';

const actor = process.argv[2] || process.env.USER || process.env.USERNAME || 'Purge Script';

try {
  const loaded = await readPerformanceDomainFromSql();
  if (!loaded?.state) {
    console.log(JSON.stringify({ ok: false, error: 'No performance domain document in SQL.' }, null, 2));
    process.exit(2);
  }

  const before = {
    goals: loaded.state.goals?.length || 0,
    objectives: loaded.state.companyObjectives?.length || 0,
    eligibility: loaded.state.eligibility?.length || 0,
    probation: loaded.state.probation?.length || 0,
    tasks: loaded.state.tasks?.length || 0,
  };

  const cleaned = stripDemoPerformanceSeed(loaded.state) as typeof loaded.state;
  cleaned.cycles = (cleaned.cycles || []).map((cycle) => ({
    ...cycle,
    eligibilityCount: (cleaned.eligibility || []).filter((row) => row.cycleId === cycle.id && row.included).length,
  }));
  cleaned.updatedAt = new Date().toISOString();
  cleaned.audit = [
    {
      id: `aud-purge-${Date.now().toString(36)}`,
      at: cleaned.updatedAt,
      actor: String(actor),
      actorRole: 'System',
      action: 'Purged demo performance seed',
      entityType: 'PerformanceDomain',
      entityId: 'root',
      after: 'Removed bootstrap demo employees, objectives, and goals from SQL',
    },
    ...(cleaned.audit || []),
  ].slice(0, 2000);

  const meta = await writePerformanceDomainToSql(cleaned, String(actor));
  const health = await getPerformanceSqlHealth();

  console.log(JSON.stringify({
    ok: true,
    before,
    after: {
      goals: cleaned.goals?.length || 0,
      objectives: cleaned.companyObjectives?.length || 0,
      eligibility: cleaned.eligibility?.length || 0,
      probation: cleaned.probation?.length || 0,
      tasks: cleaned.tasks?.length || 0,
    },
    write: {
      source: meta.source,
      updatedAt: meta.updatedAt,
      recordCounts: meta.recordCounts,
    },
    health: {
      recordCounts: health.recordCounts,
      updatedAt: health.updatedAt,
    },
  }, null, 2));
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
