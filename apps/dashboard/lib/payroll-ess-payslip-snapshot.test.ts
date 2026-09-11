import assert from 'node:assert/strict';
import {
  preferredPayrollCalculationRecord,
  payslipSnapshotPreferenceScore,
} from './payroll-ess-payslip-store.ts';
import type { PayrollPeriodSnapshotRow } from './payroll-run-store.ts';
import type { PayrollCalculationRecord } from './payroll-calculation-service.ts';
import type { PayrollRunSnapshot } from './payroll-run-store.ts';

const record = (code: string, gross: number, net: number): PayrollCalculationRecord => ({
  employeeCode: code,
  employeeId: code,
  grossPay: gross,
  netPay: net,
} as PayrollCalculationRecord);

const snapshot = (action: string, capturedAt: string, records: PayrollCalculationRecord[]): PayrollRunSnapshot => ({
  capturedAt,
  capturedBy: 'test',
  action,
  summary: {},
  records,
});

const row = (
  runId: string,
  status: string,
  action: string,
  capturedAt: string,
  records: PayrollCalculationRecord[],
  extra?: Partial<PayrollPeriodSnapshotRow>,
): PayrollPeriodSnapshotRow => ({
  period: '2026-08',
  runId,
  pack: extra?.pack ?? (runId.includes('daily-rate') ? 'daily-rate' : 'salaried'),
  company: extra?.company ?? (runId.endsWith('DLPC') ? 'DLPC' : runId.endsWith('DLE') ? 'DLE' : null),
  status,
  payslipsGeneratedAt: extra?.payslipsGeneratedAt ?? null,
  snapshot: snapshot(action, capturedAt, records),
});

const dle = record('P0146', 907410, 727535);
const dlpc = record('P0013', 903791.86, 724830.84);
const combinedWrong = record('P0146', 1, 1);

const candidates = [
  row('payroll-2026-08-daily-rate-DLE', 'Finance Approved', 'finance-manager-approve', '2026-09-11T08:20:29.001Z', [record('C1065', 50000, 45000)]),
  row('payroll-2026-08-salaried', 'Computed', 'create-run', '2026-08-31T16:21:48.812Z', [combinedWrong, dlpc]),
  row('payroll-2026-08-salaried-DLE', 'Published', 'generate-payslips', '2026-09-11T15:26:28.567Z', [dle], { payslipsGeneratedAt: '2026-09-11T15:26:28.553Z' }),
  row('payroll-2026-08-salaried-DLPC', 'Approved', 'md-ceo-approve', '2026-09-03T16:41:28.670Z', [dlpc]),
];

const christian = preferredPayrollCalculationRecord(candidates, ['P0146']);
assert.equal(christian?.netPay, 727535, 'DLE published snapshot wins over last SQL row and the old combined run');
assert.equal(christian?.grossPay, 907410, 'DLE gross comes from generate-payslips');

const samuel = preferredPayrollCalculationRecord(candidates, ['P0013']);
assert.equal(samuel?.netPay, 724830.84, 'DLPC employee still matches the DLPC salary snapshot');

const missing = preferredPayrollCalculationRecord(candidates, ['P9999']);
assert.equal(missing, null, 'unknown employee is not forced onto another company snapshot');

const published = payslipSnapshotPreferenceScore(candidates[2]);
const approved = payslipSnapshotPreferenceScore(candidates[3]);
assert.equal(published.score > approved.score, true, 'published generate-payslips outranks MD/CEO approve');

console.log('payroll-ess-payslip-snapshot.test.ts: ok');
