import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';

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

const lineAmount = (lines: Array<Record<string, unknown>> | undefined, code: string) => {
  const line = (lines || []).find((item) => String(item.code || '').toUpperCase() === code.toUpperCase());
  return Number(line?.amount || 0);
};

const deductionAmount = (lines: PayrollReviewRecord['deductionLines'] | undefined, code: string) => {
  const line = (lines || []).find((item) => String(item.code || item.label || '').toUpperCase() === code.toUpperCase());
  return Number(line?.amount || 0);
};

const collectComponentDefs = (records: PayrollReviewRecord[]) => {
  const defs = new Map<string, ComponentDef>();

  const add = (key: string, label: string, amount: (record: PayrollReviewRecord) => number) => {
    if (!defs.has(key)) defs.set(key, { key, label, amount });
  };

  records.forEach((record) => {
    (record.earningLines || []).forEach((line) => {
      const code = String(line.code || '').trim();
      if (!code) return;
      const label = String(line.name || code);
      add(`earning:${code}`, label, (row) => lineAmount(row.earningLines as Array<Record<string, unknown>>, code));
    });
    (record.annualBenefitLines || []).forEach((line) => {
      const code = String(line.code || '').trim();
      if (!code) return;
      const label = `Benefit: ${String(line.name || code)}`;
      add(`benefit:${code}`, label, (row) => lineAmount(row.annualBenefitLines as Array<Record<string, unknown>>, code));
    });
    (record.deductionLines || []).forEach((line) => {
      const code = String(line.code || line.label || '').trim();
      if (!code) return;
      const label = String(line.label || code);
      add(`deduction:${code}`, label, (row) => deductionAmount(row.deductionLines, code));
    });
  });

  add('total:gross', 'Gross Salary', (row) => Number(row.grossPay || 0));
  add('total:deductions', 'Total Deductions', (row) => Number(row.deductions || 0));
  add('total:paye', 'PAYE', (row) => Number(row.paye || 0));
  add('total:pension', 'Pension', (row) => Number(row.pension || 0));
  add('total:net', 'Net Salary', (row) => Number(row.netPay || 0));

  return Array.from(defs.values()).sort((a, b) => a.label.localeCompare(b.label));
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
