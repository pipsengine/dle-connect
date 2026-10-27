/**
 * GM Operations Goal Seek — October sample at ₦1,332.99.
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/gm-operations-goal-seek.test.ts
 */
import assert from 'node:assert/strict';
import type { DleEmployeeDirectoryRow } from './dle-enterprise-db';
import {
  applyGmOperationsGoalSeek,
  evaluateGmOperationsGoalSeek,
  GM_OPERATIONS_FALLBACK_FX,
  GM_OPERATIONS_MONTHLY_NET_PER_LEG_USD,
  gmOperationsGoalSeekApplies,
  gmOperationsGoalSeekPackageFor,
  seekGmOperationsGoalSeekPackage,
} from './gm-operations-goal-seek';
import { septemberExcelNairaPackageFor } from './september-excel-naira-package';

const odulate = { employeeCode: 'P0442', fullName: 'Mrs ODULATE ABIODUN TEMITOPE' } as DleEmployeeDirectoryRow;

assert.equal(gmOperationsGoalSeekApplies(odulate, '2026-09'), false);
assert.equal(gmOperationsGoalSeekApplies(odulate, '2026-10'), true);
assert.equal(gmOperationsGoalSeekApplies({ employeeCode: 'P0364' }, '2026-10'), false);
assert.equal(septemberExcelNairaPackageFor(odulate, '2026-09')?.grossNgn, 6393380.73);
assert.equal(septemberExcelNairaPackageFor(odulate, '2026-10'), null);

const sample = seekGmOperationsGoalSeekPackage(GM_OPERATIONS_FALLBACK_FX);
assert.equal(sample.grossUsd, 4650.37);
assert.equal(sample.linesUsd.find((line) => line.code === 'EXP_SMGT_BASIC')?.amount, 930.07);
assert.equal(sample.linesUsd.find((line) => /HOUS/i.test(line.code))?.amount, 697.56);
assert.equal(sample.linesUsd.find((line) => /TRANS/i.test(line.code))?.amount, 465.04);
assert.equal(sample.linesUsd.find((line) => /OTHER/i.test(line.code))?.amount, 2557.7);
assert.equal(sample.grossNgn, 6198896.7);
assert.equal(sample.payeNgn, 1366807.51);
assert.equal(sample.payeUsd, 1025.37);
assert.equal(sample.netNgn, 4832089.19);
assert.equal(sample.netUsd, 3625);
assert.equal(sample.pensionRefundNgn, 223160.65);

const evaluated = evaluateGmOperationsGoalSeek(4650.37, 1332.99);
assert.equal(evaluated.dollarNet, 3625);
assert.ok(Math.abs(evaluated.netUsd - GM_OPERATIONS_MONTHLY_NET_PER_LEG_USD) < 0.01);

const applied = applyGmOperationsGoalSeek(odulate, '2026-10', 1332.99);
assert.equal(applied.periodSalary, 4650.37);
assert.equal(applied.localPeriodSalary, 6198896.7);
assert.equal(applied.payeCalculation?.monthlyPayeOverride, 1025.37);
assert.equal(applied.payeCalculation?.ngnMonthlyPayeOverride, 1366807.51);
assert.equal(applied.hasDualCurrencyPayroll, true);
assert.equal(applied.sageLocalPayrollEarnings?.length, 4);
assert.equal(gmOperationsGoalSeekPackageFor(odulate, '2026-08', 1332.99), null);

// Rate move: dollar net stays $3,625; naira cash and gross re-seek.
const at1600 = seekGmOperationsGoalSeekPackage(1600);
assert.equal(at1600.netUsd, 3625);
assert.ok(at1600.grossUsd > sample.grossUsd);
assert.ok(at1600.grossNgn > sample.grossNgn);

console.log('gm-operations-goal-seek.test.ts ok');
