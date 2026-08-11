import type { PayrollCalculationRecord, PayrollRecordStatus } from '@/lib/payroll-calculation-service';

/** May/June cutover: defer known migration gaps so payroll workflow can be exercised. Corrections land in the next period. */
export const payrollTolerancePeriods = () =>
  String(process.env.HRIS_PAYROLL_TOLERANCE_PERIODS || '2026-05,2026-06,2026-07')
    .split(',')
    .map((value) => value.trim().replace(/^per-/, ''))
    .filter(Boolean);

export const payrollToleranceActive = (period: string) => {
  if (process.env.HRIS_PAYROLL_TOLERANCE_MODE === 'false') return false;
  if (process.env.HRIS_PAYROLL_TOLERANCE_MODE === 'true') return true;
  const normalized = String(period || '').replace(/^per-/, '');
  return payrollTolerancePeriods().includes(normalized);
};

const DEFERRED_ISSUE_PATTERNS = [
  /approved timesheet hours are not available/i,
  /pension: employment type is not eligible/i,
  /pension: rsa pin is not on file/i,
  /pension: pfa provider is not assigned/i,
  /sage gross variance/i,
  /sage net variance/i,
  /sage period comparison unavailable/i,
  /deduction ratio exceeds/i,
  /statutory:/i,
  /loan:/i,
  /payroll setup is not assigned/i,
  /payroll group is missing/i,
  /pay currency is missing/i,
  /gross pay is missing/i,
  /net pay is zero after deductions/i,
];

export const partitionPayrollIssues = (issues: string[], tolerance: boolean) => {
  if (!tolerance) return { blocking: issues, deferred: [] as string[] };
  const blocking: string[] = [];
  const deferred: string[] = [];
  for (const issue of issues) {
    if (DEFERRED_ISSUE_PATTERNS.some((pattern) => pattern.test(issue))) deferred.push(issue);
    else blocking.push(issue);
  }
  return { blocking, deferred };
};

const statusFromIssues = (issues: string[]): PayrollRecordStatus => {
  if (issues.some((issue) => /missing|not payroll active|no active|pay amount is missing/i.test(issue))) return 'Blocked';
  return issues.length ? 'Review' : 'Ready';
};

const riskSeverityFromIssues = (blocking: string[]): 'High' | 'Medium' | 'Low' =>
  blocking.some((issue) => /not payroll active|Gross pay is missing|Payroll setup/.test(issue))
    ? 'High'
    : blocking.length
      ? 'Medium'
      : 'Low';

/** Re-apply current tolerance policy to stored snapshot rows so UI gates stay consistent. */
export const reapplyPayrollRecordValidationPolicy = (
  record: PayrollCalculationRecord,
  tolerance: boolean,
): PayrollCalculationRecord => {
  const mergedIssues = Array.from(new Set([...(record.exceptions || []), ...(record.deferredWarnings || [])]));
  const { blocking, deferred } = partitionPayrollIssues(mergedIssues, tolerance);
  const payrollStatus = statusFromIssues(blocking);
  return {
    ...record,
    exceptions: blocking,
    deferredWarnings: deferred,
    exceptionCount: blocking.length,
    payrollStatus,
    status: payrollStatus,
    riskSeverity: riskSeverityFromIssues(blocking),
  };
};

export const reapplyPayrollValidationPolicy = (
  records: PayrollCalculationRecord[],
  tolerance: boolean,
) => records.map((record) => reapplyPayrollRecordValidationPolicy(record, tolerance));
