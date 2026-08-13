/**
 * Smoke test: telephone allowance monthly/bimonthly calc + illegal transitions.
 * Usage: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/_smoke-telephone-allowance.mts
 */
import {
  assertTransition,
  buildLineFromEntitlements,
  recalcCycleTotals,
  resolveMonthlyAmount,
  type TelephoneEntitlement,
} from '../lib/telephone-allowance-cycle.ts';

const entitlements: TelephoneEntitlement[] = [
  {
    id: '1',
    employeeCode: 'P1001',
    employeeName: 'A',
    department: 'IT',
    jobTitle: 'Analyst',
    monthlyAmount: 10000,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'test',
  },
  {
    id: '2',
    employeeCode: 'P1002',
    employeeName: 'B',
    department: 'HR',
    jobTitle: 'Officer',
    monthlyAmount: 10000,
    effectiveFrom: '2026-08-01',
    effectiveTo: null,
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'test',
  },
  {
    id: '3',
    employeeCode: 'P1003',
    employeeName: 'C',
    department: 'Finance',
    jobTitle: 'Clerk',
    monthlyAmount: 10000,
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-07-31',
    status: 'Ended',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'test',
  },
  {
    id: '4a',
    employeeCode: 'P1004',
    employeeName: 'D',
    department: 'Ops',
    jobTitle: 'Lead',
    monthlyAmount: 10000,
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-07-31',
    status: 'Ended',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'test',
  },
  {
    id: '4b',
    employeeCode: 'P1004',
    employeeName: 'D',
    department: 'Ops',
    jobTitle: 'Lead',
    monthlyAmount: 15000,
    effectiveFrom: '2026-08-01',
    effectiveTo: null,
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'test',
  },
];

const pair = { month1: 7, month2: 8, label: 'Jul–Aug', code: 'JUL-AUG' } as const;

const a = buildLineFromEntitlements(entitlements, 'P1001', 2026, pair)!;
const b = buildLineFromEntitlements(entitlements, 'P1002', 2026, pair)!;
const c = buildLineFromEntitlements(entitlements, 'P1003', 2026, pair)!;
const d = buildLineFromEntitlements(entitlements, 'P1004', 2026, pair)!;

const checks: Array<[string, boolean]> = [
  ['A both months 10k', a.month1Amount === 10000 && a.month2Amount === 10000 && a.bimonthlyTotal === 20000],
  ['B August only', b.month1Amount === 0 && b.month2Amount === 10000 && b.bimonthlyTotal === 10000],
  ['C July only ended', c.month1Amount === 10000 && c.month2Amount === 0 && c.bimonthlyTotal === 10000],
  ['D rate change Aug', d.month1Amount === 10000 && d.month2Amount === 15000 && d.bimonthlyTotal === 25000],
  ['Never monthly x2 for B', b.bimonthlyTotal !== 20000],
];

const totals = recalcCycleTotals([a, b, c, d]);
checks.push(['Totals sum', totals.bimonthlyTotal === 20000 + 10000 + 10000 + 25000]);

let transitionOk = false;
try {
  assertTransition('DRAFT', 'PENDING_MD_APPROVAL');
} catch {
  transitionOk = true;
}
checks.push(['Illegal transition blocked', transitionOk]);

assertTransition('DRAFT', 'PENDING_HR_REVIEW');
checks.push(['Legal transition allowed', true]);

const july = resolveMonthlyAmount(entitlements, 'P1004', 2026, 7);
const aug = resolveMonthlyAmount(entitlements, 'P1004', 2026, 8);
checks.push(['Effective dated July rate', july.amount === 10000]);
checks.push(['Effective dated August rate', aug.amount === 15000]);

const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({ checks, totals, failed: failed.map(([n]) => n) }, null, 2));
if (failed.length) {
  console.error('SMOKE FAILED');
  process.exit(1);
}
console.log('SMOKE OK');
process.exit(0);
