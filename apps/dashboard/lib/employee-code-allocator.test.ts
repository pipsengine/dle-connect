/**
 * Permanent / Lumpsum / Daily Rate next-code rules.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/employee-code-allocator.test.ts
 */
import {
  formatNextEmployeeCode,
  occupiedSequenceForNextCode,
  shouldKeepReservedEmployeeCode,
} from './employee-code-allocator';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(formatNextEmployeeCode('P', 467) === 'P0468', 'next after P0467 must be P0468');
assert(formatNextEmployeeCode('P', 471) === 'P0472', 'occupied 471 still formats P0472');
assert(formatNextEmployeeCode('L', 2795) === 'L2796', 'lumpsum keeps native width past 4 digits');
assert(formatNextEmployeeCode('NYSC', 41) === 'NYSC0042', 'NYSC uses the NYSC prefix');

assert(occupiedSequenceForNextCode(467, 471) === 467, 'stale counter 471 must not beat live P0467');
assert(occupiedSequenceForNextCode(467, 0) === 467, 'missing counter still uses live occupancy');
assert(occupiedSequenceForNextCode(467, 467) === 467, 'aligned counter stays on occupancy');
assert(
  formatNextEmployeeCode('P', occupiedSequenceForNextCode(467, 471)) === 'P0468',
  'P0467 + drifted counter 471 must still preview P0468',
);

assert(shouldKeepReservedEmployeeCode('P0468', 'P0468') === true, 'keep a reserved code that is the next occupied slot');
assert(shouldKeepReservedEmployeeCode('P0472', 'P0468') === false, 'discard a skipped reservation such as P0472');
assert(shouldKeepReservedEmployeeCode('p0468', 'P0468') === true, 'reserved-code compare is case-insensitive');
assert(shouldKeepReservedEmployeeCode('', 'P0468') === false, 'empty reservation is not kept');

console.log('employee-code-allocator tests passed');
