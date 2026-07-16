/**
 * Lightweight verification for PRD §11 scoring rules (no vitest required).
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/verify-performance-calculation.mts
 */
import {
  bandsContinuousNonOverlapping,
  displayScore,
  finalScore,
  sectionScore,
  storeScore,
  weightsTotalOk,
} from '../apps/dashboard/lib/performance-calculation';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

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

console.log('verify-performance-calculation: OK');
