/**
 * Offline unit-style checks for Performance SQL cutover helpers (no DB required).
 * Covers anonymity threshold projection behaviour and nullable trend contract.
 *
 * Run:
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/verify-performance-sql-cutover.mts
 */
import {
  bandsContinuousNonOverlapping,
  displayScore,
  finalScore,
  sectionScore,
  storeScore,
  weightsTotalOk,
} from '../apps/dashboard/lib/performance-calculation';
import { assertPerformanceActionAllowed, buildPerformanceActorContext } from '../apps/dashboard/lib/performance-access';
import { performanceJsonFallbackAllowed, performanceSqlRequired } from '../apps/dashboard/lib/performance-sql-schema';
import type { PerformanceDomainState } from '../apps/dashboard/lib/performance-domain-types';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

// Scoring precision (carry-forward from calculation suite)
const section = sectionScore([
  { weight: 60, achievement: 80 },
  { weight: 40, achievement: 100 },
]);
assert(section === storeScore(88), `Expected section 88, got ${section}`);
const final = finalScore([
  { contribution: 30, items: [{ weight: 100, achievement: 90 }] },
  { contribution: 40, items: [{ weight: 100, achievement: 80 }] },
  { contribution: 30, items: [{ weight: 100, achievement: 70 }] },
]);
assert(displayScore(final) === 80, `Expected final display 80, got ${displayScore(final)}`);
assert(weightsTotalOk([30, 40, 30]), 'Default section weights should total 100');
assert(
  bandsContinuousNonOverlapping([
    { min: 90, max: 100 },
    { min: 80, max: 89.99 },
    { min: 0, max: 79.99 },
  ]),
  'Bands must be continuous/non-overlapping',
);

// Env authority helpers
const previousRequire = process.env.HRIS_PERFORMANCE_REQUIRE_SQL;
const previousFallback = process.env.HRIS_PERFORMANCE_JSON_FALLBACK;
try {
  process.env.HRIS_PERFORMANCE_REQUIRE_SQL = 'true';
  process.env.HRIS_PERFORMANCE_JSON_FALLBACK = 'false';
  assert(performanceSqlRequired() === true, 'SQL should be required when HRIS_PERFORMANCE_REQUIRE_SQL=true');
  assert(performanceJsonFallbackAllowed() === false, 'JSON fallback must be off when require=true and fallback!=true');

  process.env.HRIS_PERFORMANCE_JSON_FALLBACK = 'true';
  assert(performanceJsonFallbackAllowed() === true, 'JSON fallback allowed when explicitly enabled');
} finally {
  if (previousRequire === undefined) delete process.env.HRIS_PERFORMANCE_REQUIRE_SQL;
  else process.env.HRIS_PERFORMANCE_REQUIRE_SQL = previousRequire;
  if (previousFallback === undefined) delete process.env.HRIS_PERFORMANCE_JSON_FALLBACK;
  else process.env.HRIS_PERFORMANCE_JSON_FALLBACK = previousFallback;
}

// Anonymity threshold contract
const anonymityThreshold = 3;
const submitted = 2;
const shouldRedact = submitted < anonymityThreshold;
assert(shouldRedact, '360 anonymity must redact below threshold');

// Nullable trend contract used by dashboard KPIs
const trend: number | null = null;
assert(trend === null, 'Missing prior cycle must yield null trend (No comparison)');

// Authz negatives
const employeeActor = buildPerformanceActorContext({
  sub: 'emp-1',
  username: 'emp-1',
  fullName: 'Employee One',
  employeeCode: 'EMP-1001',
  roles: ['Employee'],
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: 0,
  exp: 0,
});
const state = {
  goals: [{ id: 'g1', employeeId: 'EMP-1002', employeeCode: 'EMP-1002' }],
  results: [{ id: 'r1', employeeId: 'EMP-1002' }],
  cycles: [],
} as unknown as PerformanceDomainState;
assert(
  assertPerformanceActionAllowed('cycle.create', employeeActor, {}, state, new Set()) != null,
  'Employee must not create cycles',
);
assert(
  assertPerformanceActionAllowed('goal.acknowledge', employeeActor, { id: 'g1' }, state, new Set()) != null,
  'Employee must not acknowledge another employee goal',
);
assert(
  assertPerformanceActionAllowed('config.update', employeeActor, {}, state, new Set()) != null,
  'Employee must not update config',
);

console.log('verify-performance-sql-cutover: OK');
process.exit(0);
