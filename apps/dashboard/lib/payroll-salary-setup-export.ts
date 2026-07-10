export type SalarySetupExportRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  businessUnit?: string;
  location?: string;
  jobTitle?: string;
  employmentType?: string;
  employmentStatus?: string;
  payrollGroup?: string;
  salaryGrade?: string;
  salaryStructure?: string;
  payCurrency?: string;
  paymentRun?: string;
  paymentType?: string;
  earningProfile?: string;
  nhfApplicable?: boolean;
  setupAssignedToPayroll?: boolean;
  payrollStatus?: string;
  isDailyRate?: boolean;
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  timesheetDaysWorked?: number | null;
  timesheetBookedHours?: number | null;
  earningLines?: Array<{ code?: string; name?: string; amount?: number | null }>;
  annualBenefitLines?: Array<{ code?: string; name?: string; amount?: number | null }>;
  deductionLines?: Array<{ code?: string; label?: string; amount?: number | null }>;
  basePay?: number | null;
  allowances?: number | null;
  taxablePay?: number | null;
  nonTaxablePay?: number | null;
  paye?: number | null;
  pension?: number | null;
  otherDeductions?: number | null;
  deductions?: number | null;
  grossPay?: number | null;
  netPay?: number | null;
};

export type SalarySetupExportColumn = {
  id: string;
  label: string;
  kind: 'text' | 'money' | 'boolean';
  getValue: (record: SalarySetupExportRecord) => string | number | boolean | null | undefined;
};

const earningLineAmount = (record: SalarySetupExportRecord, pattern: RegExp) => {
  const line = (record.earningLines || []).find((item) => pattern.test(String(item.code || '')) || pattern.test(String(item.name || '')));
  return line?.amount ?? null;
};

const deductionLineAmount = (record: SalarySetupExportRecord, pattern: RegExp) => {
  const line = (record.deductionLines || []).find((item) => pattern.test(String(item.code || '')) || pattern.test(String(item.label || '')));
  if (line?.amount != null) return line.amount;
  if (/PAYE/i.test(pattern.source)) return record.paye ?? null;
  if (/PENSION/i.test(pattern.source)) return record.pension ?? null;
  if (/OTHER/i.test(pattern.source)) return record.otherDeductions ?? null;
  return null;
};

const benefitLineAmount = (record: SalarySetupExportRecord, code: string) => {
  const line = (record.annualBenefitLines || []).find((item) => String(item.code || '').toUpperCase() === code.toUpperCase());
  return line?.amount ?? null;
};

const STANDARD_EARNING_COLUMNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'earning-basic', label: 'Basic Salary', pattern: /(_BASIC|^BASIC$)|BASIC SALARY/i },
  { id: 'earning-housing', label: 'Housing', pattern: /HOUSIN|HOUSING/i },
  { id: 'earning-other', label: 'Other Allowance', pattern: /OTHALL|OTHER ALLOW/i },
  { id: 'earning-transport', label: 'Transport Allowance', pattern: /TRANSP|TRANSPORT/i },
  { id: 'earning-furniture', label: 'Furniture Allowance', pattern: /FURN|FURNITURE/i },
  { id: 'earning-utilities', label: 'Utilities', pattern: /UTILIT|UTILIT/i },
];

const CONTRACT_EARNING_COLUMNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'earning-weekday', label: 'Weekday Earning', pattern: /^JCWEEKDAY$/i },
  { id: 'earning-weekday-nt', label: 'Weekday Allowance (NT)', pattern: /JCWEEKDAY_NT|WEEKDAY ALLOWANCE NON TAX/i },
  { id: 'earning-weekday-ovt', label: 'Weekday Overtime', pattern: /WEEKDAYOVT|WEEKDAY OVT/i },
  { id: 'earning-pubhol', label: 'Public Holiday', pattern: /PUBHOL|PUBLIC HOLIDAY/i },
  { id: 'earning-saturday', label: 'Saturday Earning', pattern: /SATEARN|SATURDAY EARNING/i },
  { id: 'earning-sunday', label: 'Sunday Earning', pattern: /SUNDAYEARN|SUNDAY EARNING/i },
  { id: 'earning-meal', label: 'Meal Allowance', pattern: /^MEAL$/i },
];

const DEDUCTION_COLUMNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: 'deduction-paye', label: 'PAYE', pattern: /PAYE/i },
  { id: 'deduction-pension', label: 'Pension', pattern: /PENSION/i },
  { id: 'deduction-nhf', label: 'NHF', pattern: /NHF/i },
  { id: 'deduction-loan', label: 'Loan Recovery', pattern: /LOAN/i },
  { id: 'deduction-other', label: 'Other Deductions', pattern: /OTHER/i },
];

const textColumn = (id: string, label: string, getValue: (record: SalarySetupExportRecord) => string) => ({
  id,
  label,
  kind: 'text' as const,
  getValue,
});

const moneyColumn = (id: string, label: string, getValue: (record: SalarySetupExportRecord) => number | null | undefined) => ({
  id,
  label,
  kind: 'money' as const,
  getValue,
});

const boolColumn = (id: string, label: string, getValue: (record: SalarySetupExportRecord) => boolean | null | undefined) => ({
  id,
  label,
  kind: 'boolean' as const,
  getValue,
});

export const buildSalarySetupExportColumns = (records: SalarySetupExportRecord[]): SalarySetupExportColumn[] => {
  const matchedEarningCodes = new Set<string>();
  const matchedDeductionCodes = new Set<string>();

  [...STANDARD_EARNING_COLUMNS, ...CONTRACT_EARNING_COLUMNS].forEach((column) => {
    records.forEach((record) => {
      const line = (record.earningLines || []).find((item) => column.pattern.test(String(item.code || '')) || column.pattern.test(String(item.name || '')));
      if (line?.code) matchedEarningCodes.add(String(line.code).toUpperCase());
    });
  });

  DEDUCTION_COLUMNS.forEach((column) => {
    records.forEach((record) => {
      const line = (record.deductionLines || []).find((item) => column.pattern.test(String(item.code || '')) || column.pattern.test(String(item.label || '')));
      if (line?.code) matchedDeductionCodes.add(String(line.code).toUpperCase());
    });
  });

  const extraEarningColumns = Array.from(
    records.reduce((map, record) => {
      (record.earningLines || []).forEach((line) => {
        const code = String(line.code || '').trim();
        if (!code || matchedEarningCodes.has(code.toUpperCase())) return;
        if (!map.has(code)) map.set(code, String(line.name || code));
      });
      return map;
    }, new Map<string, string>()).entries(),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, label]) => ({
      id: `earning-${code.toLowerCase()}`,
      label,
      pattern: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }));

  const benefitColumns = Array.from(
    records.reduce((map, record) => {
      (record.annualBenefitLines || []).forEach((line) => {
        const code = String(line.code || '').trim();
        if (!code) return;
        if (!map.has(code)) map.set(code, String(line.name || code));
      });
      return map;
    }, new Map<string, string>()).entries(),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, label]) => ({ id: `benefit-${code.toLowerCase()}`, label: `Benefit: ${label}`, code }));

  const extraDeductionColumns = Array.from(
    records.reduce((map, record) => {
      (record.deductionLines || []).forEach((line) => {
        const code = String(line.code || line.label || '').trim();
        if (!code || matchedDeductionCodes.has(code.toUpperCase())) return;
        if (!map.has(code)) map.set(code, String(line.label || code));
      });
      return map;
    }, new Map<string, string>()).entries(),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([code, label]) => ({
      id: `deduction-${code.toLowerCase()}`,
      label,
      pattern: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    }));

  const columns: SalarySetupExportColumn[] = [
    textColumn('employee-id', 'Employee ID', (record) => record.employeeId || ''),
    textColumn('employee-name', 'Employee Name', (record) => record.fullName || ''),
    textColumn('department', 'Department', (record) => record.department || ''),
    textColumn('business-unit', 'Business Unit', (record) => record.businessUnit || ''),
    textColumn('location', 'Location', (record) => record.location || ''),
    textColumn('job-title', 'Job Title', (record) => record.jobTitle || ''),
    textColumn('employment-type', 'Employment Type', (record) => record.employmentType || ''),
    textColumn('employment-status', 'Employment Status', (record) => record.employmentStatus || ''),
    textColumn('grade', 'Grade', (record) => record.salaryGrade || ''),
    textColumn('salary-structure', 'Salary Structure', (record) => record.salaryStructure || ''),
    textColumn('payroll-group', 'Payroll Group', (record) => record.payrollGroup || ''),
    textColumn('earning-profile', 'Earning Profile', (record) => record.earningProfile || ''),
    textColumn('payment-run', 'Payment Run', (record) => record.paymentRun || ''),
    textColumn('payment-type', 'Payment Type', (record) => record.paymentType || ''),
    textColumn('currency', 'Currency', (record) => record.payCurrency || ''),
    boolColumn('nhf-applicable', 'NHF Applicable', (record) => record.nhfApplicable ?? null),
    boolColumn('setup-assigned', 'Assigned to Payroll', (record) => record.setupAssignedToPayroll ?? null),
    textColumn('setup-status', 'Payroll Status', (record) => record.payrollStatus || ''),
    textColumn('days-worked', 'Days Worked', (record) => (record.isDailyRate ? String(record.timesheetDaysWorked ?? '') : '')),
    moneyColumn('daily-rate', 'Daily Rate', (record) => (record.isDailyRate ? record.ratePerDay : null)),
    textColumn('hours-worked', 'Hours Worked', (record) => (record.isDailyRate && record.timesheetBookedHours != null ? String(record.timesheetBookedHours) : '')),
    moneyColumn('hourly-rate', 'Hourly Rate', (record) => record.ratePerHour ?? null),
  ];

  [...STANDARD_EARNING_COLUMNS, ...CONTRACT_EARNING_COLUMNS, ...extraEarningColumns].forEach((column) => {
    columns.push(moneyColumn(column.id, column.label, (record) => earningLineAmount(record, column.pattern)));
  });

  benefitColumns.forEach((column) => {
    columns.push(moneyColumn(column.id, column.label, (record) => benefitLineAmount(record, column.code)));
  });

  columns.push(
    moneyColumn('base-pay', 'Base Pay', (record) => record.basePay),
    moneyColumn('allowances', 'Allowances', (record) => record.allowances),
    moneyColumn('taxable-pay', 'Taxable Pay', (record) => record.taxablePay),
    moneyColumn('non-taxable-pay', 'Non-Taxable Pay', (record) => record.nonTaxablePay),
  );

  [...DEDUCTION_COLUMNS, ...extraDeductionColumns].forEach((column) => {
    columns.push(moneyColumn(column.id, column.label, (record) => deductionLineAmount(record, column.pattern)));
  });

  columns.push(
    moneyColumn('total-deductions', 'Total Deductions', (record) => record.deductions),
    moneyColumn('gross-pay', 'Gross Salary', (record) => record.grossPay),
    moneyColumn('net-pay', 'Net Salary', (record) => record.netPay),
  );

  return columns;
};

const exportCellValue = (column: SalarySetupExportColumn, record: SalarySetupExportRecord) => {
  const value = column.getValue(record);
  if (column.kind === 'money') return value == null || value === '' ? '' : Number(value);
  if (column.kind === 'boolean') return value == null ? '' : value ? 'Yes' : 'No';
  return value ?? '';
};

export const buildSalarySetupExportReport = (records: SalarySetupExportRecord[]) => {
  const columns = buildSalarySetupExportColumns(records);
  return {
    columns: columns.map((column) => column.label),
    rows: records.map((record) => columns.map((column) => exportCellValue(column, record))),
  };
};

export const salarySetupCsvFromRecords = (records: SalarySetupExportRecord[]) => {
  const report = buildSalarySetupExportReport(records);
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = report.rows.map((row) => row.map(escape).join(','));
  return [report.columns.join(','), ...lines].join('\n');
};
