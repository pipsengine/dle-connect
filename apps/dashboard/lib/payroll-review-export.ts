import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { summarizePayrollComponentKey } from '@/lib/payroll-earning-summary';

export const previousPayrollPeriod = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) return '';
  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

type PayrollReviewRecord = Pick<
  PayrollCalculationRecord,
  | 'employeeId'
  | 'fullName'
  | 'department'
  | 'salaryGrade'
  | 'grossPay'
  | 'netPay'
  | 'deductions'
  | 'paye'
  | 'pension'
  | 'earningLines'
  | 'annualBenefitLines'
  | 'deductionLines'
>;

type ComponentDef = {
  key: string;
  label: string;
  amount: (record: PayrollReviewRecord) => number;
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const lineBucketAmount = (
  lines: Array<Record<string, unknown>> | undefined,
  kind: 'earning' | 'benefit' | 'deduction',
  targetKey: string,
) => {
  let total = 0;
  for (const line of lines || []) {
    const code = String(line.code || line.label || '').trim();
    const name = String(line.name || line.label || code).trim();
    if (!code && !name) continue;
    const summarized = summarizePayrollComponentKey(kind, code, name);
    if (summarized.key !== targetKey) continue;
    total += Number(line.amount || 0);
  }
  return roundMoney(total);
};

const collectComponentDefs = (records: PayrollReviewRecord[]) => {
  const defs = new Map<string, ComponentDef>();

  const add = (key: string, label: string, amount: (record: PayrollReviewRecord) => number) => {
    if (!defs.has(key)) defs.set(key, { key, label, amount });
  };

  records.forEach((record) => {
    (record.earningLines || []).forEach((line) => {
      const code = String(line.code || '').trim();
      const name = String(line.name || code).trim();
      if (!code && !name) return;
      const summarized = summarizePayrollComponentKey('earning', code, name);
      add(summarized.key, summarized.label, (row) =>
        lineBucketAmount(row.earningLines as Array<Record<string, unknown>>, 'earning', summarized.key));
    });
    (record.annualBenefitLines || []).forEach((line) => {
      const code = String(line.code || '').trim();
      const name = String(line.name || code).trim();
      if (!code && !name) return;
      const summarized = summarizePayrollComponentKey('benefit', code, name);
      add(summarized.key, summarized.label, (row) =>
        lineBucketAmount(row.annualBenefitLines as Array<Record<string, unknown>>, 'benefit', summarized.key));
    });
    (record.deductionLines || []).forEach((line) => {
      const code = String(line.code || line.label || '').trim();
      const name = String(line.label || code).trim();
      if (!code && !name) return;
      const summarized = summarizePayrollComponentKey('deduction', code, name);
      add(summarized.key, summarized.label, (row) =>
        lineBucketAmount(row.deductionLines as unknown as Array<Record<string, unknown>>, 'deduction', summarized.key));
    });
  });

  // Ensure HR-required summary columns always appear when any staff have the underlying lines.
  add('earning:BASIC_EARNING', 'Basic earning', (row) =>
    lineBucketAmount(row.earningLines as Array<Record<string, unknown>>, 'earning', 'earning:BASIC_EARNING'));
  add('deduction:UNION_DEDUCTIONS', 'Union Deductions', (row) =>
    lineBucketAmount(row.deductionLines as unknown as Array<Record<string, unknown>>, 'deduction', 'deduction:UNION_DEDUCTIONS'));

  add('total:gross', 'Gross Salary', (row) => Number(row.grossPay || 0));
  add('total:deductions', 'Total Deductions', (row) => Number(row.deductions || 0));
  add('total:paye', 'PAYE', (row) => Number(row.paye || 0));
  add('total:pension', 'Pension', (row) => Number(row.pension || 0));
  add('total:net', 'Net Salary', (row) => Number(row.netPay || 0));

  const preferredOrder = [
    'earning:BASIC_EARNING',
    'deduction:UNION_DEDUCTIONS',
    'total:gross',
    'total:deductions',
    'total:paye',
    'total:pension',
    'total:net',
  ];
  return Array.from(defs.values()).sort((a, b) => {
    const ai = preferredOrder.indexOf(a.key);
    const bi = preferredOrder.indexOf(b.key);
    if (ai >= 0 || bi >= 0) {
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    }
    return a.label.localeCompare(b.label);
  });
};

const pctChange = (previous: number, current: number) => {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return 100;
  return roundMoney(((current - previous) / previous) * 100);
};

export const buildPayrollReviewExportReport = (
  currentRecords: PayrollReviewRecord[],
  previousRecords: PayrollReviewRecord[],
  currentPeriodLabel: string,
  previousPeriodLabel: string,
) => {
  const allRecords = [...currentRecords, ...previousRecords];
  const components = collectComponentDefs(allRecords);
  const previousByEmployee = new Map(previousRecords.map((record) => [record.employeeId, record]));
  const currentByEmployee = new Map(currentRecords.map((record) => [record.employeeId, record]));
  const employeeIds = Array.from(new Set([...currentByEmployee.keys(), ...previousByEmployee.keys()])).sort((a, b) => a.localeCompare(b));

  const columns = [
    'Employee ID',
    'Employee Name',
    'Department',
    'Grade',
    ...components.flatMap((component) => [
      `${component.label} (${previousPeriodLabel})`,
      `${component.label} (${currentPeriodLabel})`,
      `${component.label} Variance`,
      `${component.label} % Change`,
    ]),
  ];

  const rows = employeeIds.map((employeeId) => {
    const current = currentByEmployee.get(employeeId);
    const previous = previousByEmployee.get(employeeId);
    const base = current || previous;
    const row: Array<string | number> = [
      employeeId,
      base?.fullName || '',
      base?.department || '',
      base?.salaryGrade || '',
    ];

    const emptyRecord: PayrollReviewRecord = {
      employeeId,
      fullName: base?.fullName || '',
      department: base?.department || '',
      salaryGrade: base?.salaryGrade || '',
      grossPay: 0,
      netPay: 0,
      deductions: 0,
      paye: 0,
      pension: 0,
      earningLines: [],
      annualBenefitLines: [],
      deductionLines: [],
    };

    components.forEach((component) => {
      const prevValue = roundMoney(component.amount(previous || emptyRecord));
      const currentValue = roundMoney(component.amount(current || emptyRecord));
      const variance = roundMoney(currentValue - prevValue);
      row.push(prevValue, currentValue, variance, pctChange(prevValue, currentValue));
    });

    return row;
  });

  return { columns, rows };
};
