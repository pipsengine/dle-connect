/**
 * Move an in-flight telephone allowance cycle onto an expense payment
 * waiting for the Finance Manager.
 * Usage: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/scripts/handoff-telephone-expense-payment.mts CALL-2026-SEP-OCT-001
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const envFiles = [
  path.join(repoRoot, 'deployment', 'iis', 'site', 'apps', 'dashboard', '.env'),
  path.join(repoRoot, 'deployment', 'iis', 'site', '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
  path.join(repoRoot, '.env'),
];
for (const envPath of envFiles) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const cycleCode = String(process.argv[2] || '').trim();
if (!cycleCode) {
  console.error('Cycle code is required.');
  process.exit(1);
}

const { handoffInFlightCycleToExpensePayment } = await import('../lib/telephone-allowance-store');
const cycle = await handoffInFlightCycleToExpensePayment(
  cycleCode,
  'System',
  'HR',
  'Moved from telephone CFO authorization. Expense payment approval starts with the Finance Manager, then the CFO, then the MD.',
);

console.log(JSON.stringify({
  ok: true,
  cycleCode: cycle.cycleCode,
  status: cycle.status,
  amount: cycle.bimonthlyTotal,
  beneficiaries: cycle.beneficiaryCount,
  expensePaymentRequestId: cycle.expensePaymentRequestId,
  expensePaymentRequestNumber: cycle.expensePaymentRequestNumber,
}, null, 2));
