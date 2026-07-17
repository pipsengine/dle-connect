/**
 * Smoke checks for Performance SQL cutover: schema/health, dashboard aggregates, write/read round-trip.
 *
 * Run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/smoke-performance-sql.mts
 */
import {
  applyPerformanceAction,
  buildPerformanceActorContext,
  processPerformanceWorkers,
  readPerformanceManagementPayload,
} from '../apps/dashboard/lib/performance-domain-store';
import { getPerformanceSqlHealth, readPerformanceDomainFromSql } from '../apps/dashboard/lib/performance-sql-repository';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const step = (label: string) => console.log(`[smoke] ${label}`);

const actorContext = buildPerformanceActorContext({
  sub: 'smoke-hr',
  username: 'smoke-hr',
  fullName: 'Smoke HR',
  employeeCode: 'SMOKE',
  roles: ['HR Officer'],
  permissions: ['performance.admin', 'hris.view', 'page.hris.management.view'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: 0,
  exp: 0,
});

step('health');
const health = await getPerformanceSqlHealth();
console.log('health', JSON.stringify(health));

assert(health.databaseAvailable, 'DLE Enterprise SQL must be available for smoke:performance-sql');
assert(health.source === 'DLE_Enterprise SQL', `Expected DLE_Enterprise SQL source, got ${health.source}`);

step('read domain');
const loaded = await readPerformanceDomainFromSql();
assert(Boolean(loaded?.state), 'Performance domain document must exist in SQL (run import:performance-domain-sql)');

step('dashboard payload');
const payload = await readPerformanceManagementPayload('dashboard', actorContext);
assert(payload.dashboard.employeesTrend === null || typeof payload.dashboard.employeesTrend === 'number', 'Trend must be number|null');
assert(payload.dashboard.systemStatus.attendanceDevicesLabel === 'Device registry', 'Device label must be registry status');
assert(Boolean(payload.dataSource?.source), 'Payload must expose dataSource metadata');
assert(payload.dashboard.systemStatus.dataSource === 'DLE_Enterprise SQL' || payload.dataSource?.source === 'DLE_Enterprise SQL', 'Dashboard must report SQL source');

step('analytics.refresh');
const before = payload.domain.audit.length;
const result = await applyPerformanceAction({
  action: 'analytics.refresh',
  actor: 'QA Smoke',
  actorRole: 'HR Officer',
}, actorContext);
assert(result.ok, result.error || 'analytics.refresh failed');

step('reload payload');
const after = await readPerformanceManagementPayload('dashboard', actorContext);
assert(after.domain.analytics != null, 'Analytics snapshot must exist after refresh');
assert(after.domain.audit.length >= before, 'Audit trail should grow or remain after refresh');

step('workers');
const worker = await processPerformanceWorkers('Smoke Worker');
console.log(JSON.stringify({
  ok: true,
  health,
  dashboard: {
    employees: after.dashboard.employees,
    goalCompletionPct: after.dashboard.goalCompletionPct,
    reviewsCompleted: after.dashboard.reviewsCompleted,
    dataSource: after.dataSource,
    systemStatus: after.dashboard.systemStatus,
  },
  action: { ok: result.ok, message: result.message },
  worker,
}, null, 2));

console.log('smoke-performance-sql: OK');
process.exit(0);
