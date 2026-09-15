/**
 * Live Project Health scores from SPI / CPI / man-hours / cost — not canned Healthy=88.
 * Run: npx tsx lib/projects-engineering/project-health.test.ts
 */
import assert from 'node:assert/strict';
import {
  commercialHealthScore,
  costHealthScore,
  deriveProjectHealth,
  healthFromScore,
  manHourHealthScore,
  overallHealthScore,
  scheduleHealthScore,
} from './project-health';

const project = {
  planned: 0,
  actual: 0,
  schedulePerformance: 1,
  costPerformance: 1,
  start: '2026-09-15',
  finish: '2026-09-15',
  contractValue: 0,
};

assert.equal(scheduleHealthScore(project), 100);
assert.equal(costHealthScore(0, 1), 'N/A');
assert.equal(costHealthScore(10_000_000, 1), 100);
assert.equal(costHealthScore(10_000_000, 0.85), 85);
assert.equal(manHourHealthScore(0, 0), 'N/A');
assert.equal(manHourHealthScore(1000, 40), 100);
assert.equal(manHourHealthScore(1000, 120), 80);
assert.equal(commercialHealthScore(0, 0), 'N/A');
assert.equal(commercialHealthScore(100, 90), 100);
assert.equal(commercialHealthScore(100, 125), 80);
assert.equal(healthFromScore(88), 'Healthy');
assert.equal(healthFromScore(72), 'Watch');
assert.equal(healthFromScore(48), 'Critical');

const behind = scheduleHealthScore({
  ...project,
  planned: 50,
  actual: 20,
  schedulePerformance: 1,
  start: '2026-01-01',
  finish: '2026-12-31',
});
assert.ok(behind < 50, `behind-schedule score should drop, got ${behind}`);

const empty = deriveProjectHealth({ project, budgetedHours: 0, utilizationPct: 0, eac: 0 });
assert.equal(empty.dimensions.find((row) => row.label === 'Man-Hours')?.value, 'N/A');
assert.equal(empty.dimensions.find((row) => row.label === 'Cost')?.value, 'N/A');
assert.equal(empty.dimensions.find((row) => row.label === 'Commercial')?.value, 'N/A');
assert.equal(empty.score, overallHealthScore(empty.dimensions));
assert.notEqual(empty.score, 88);

const live = deriveProjectHealth({
  project: { ...project, contractValue: 50_000_000, costPerformance: 0.9, schedulePerformance: 0.8, planned: 40, actual: 32 },
  budgetedHours: 8000,
  utilizationPct: 110,
  eac: 55_000_000,
});
assert.equal(live.dimensions.find((row) => row.label === 'Cost')?.value, 90);
assert.equal(live.dimensions.find((row) => row.label === 'Man-Hours')?.value, 90);
assert.equal(live.score, overallHealthScore(live.dimensions));
assert.ok(live.score < 100);

console.log('project-health.test.ts: ok', { empty: empty.score, live: live.score, behind });
