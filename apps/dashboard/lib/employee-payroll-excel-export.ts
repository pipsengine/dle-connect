/**
 * Preformatted Excel workbook for one employee’s payroll profile.
 * SpreadsheetML via excel-export: titled sheets, frozen header, number formats.
 */
import type { ExcelCell, ExcelWorkbookInput, ExcelWorksheetInput } from '@/lib/excel-export';
import {
  monthlyPayrollAmountFromLine,
  type FlexiblePayrollLineDraft,
  type PayrollLineFrequency,
} from '@/lib/payroll-package-lines';

export type EmployeePayrollExcelLineSection = {
  title: string;
  sheetName: string;
  description?: string;
  lineKind: 'earning' | 'deduction';
  lines: FlexiblePayrollLineDraft[];
};

export type EmployeePayrollExcelInput = {
  employeeCode: string;
  fullName: string;
  subtitle?: string;
  currency: string;
  summaryRows: Array<[string, ExcelCell]>;
  sections: EmployeePayrollExcelLineSection[];
};

const frequencyLabel = (frequency: PayrollLineFrequency) => {
  if (frequency === 'weekly') return 'Weekly';
  if (frequency === 'one-off') return 'This period only';
  return 'Monthly';
};

const lineAmount = (line: FlexiblePayrollLineDraft): number | '' => {
  const amount = Number(line.amount);
  return Number.isFinite(amount) ? amount : '';
};

const monthlyEquivalent = (line: FlexiblePayrollLineDraft): number | '' => {
  if (line.frequency === 'one-off') return '';
  const amount = lineAmount(line);
  if (amount === '') return '';
  return monthlyPayrollAmountFromLine(amount, line.frequency);
};

const round2 = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const uniqueSheetName = (name: string, used: Set<string>) => {
  const base = (name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let next = base;
  let suffix = 2;
  while (used.has(next)) {
    const ending = ` ${suffix++}`;
    next = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  used.add(next);
  return next;
};

const lineSheet = (
  section: EmployeePayrollExcelLineSection,
  identity: string,
  currency: string,
  usedNames: Set<string>,
): ExcelWorksheetInput => {
  const earning = section.lineKind === 'earning';
  const columns = earning
    ? ['Name', 'Code', `Amount (${currency})`, 'Frequency', 'Taxable', `Monthly equivalent (${currency})`]
    : ['Name', 'Code', `Amount (${currency})`, 'Frequency', `Monthly equivalent (${currency})`];
  const rows: ExcelCell[][] = section.lines.map((line) => {
    const row: ExcelCell[] = [
      line.name || '',
      line.code || '',
      lineAmount(line),
      frequencyLabel(line.frequency || 'monthly'),
    ];
    if (earning) row.push(line.taxable ? 'Yes' : 'No');
    row.push(monthlyEquivalent(line));
    return row;
  });
  const amountTotal = round2(section.lines.reduce((sum, line) => {
    const amount = lineAmount(line);
    return sum + (amount === '' ? 0 : amount);
  }, 0));
  const monthlyTotal = round2(section.lines.reduce((sum, line) => {
    const monthly = monthlyEquivalent(line);
    return sum + (monthly === '' ? 0 : monthly);
  }, 0));
  const hasMonthly = section.lines.some((line) => line.frequency !== 'one-off');
  const totalRow: ExcelCell[] = earning
    ? ['Total', '', amountTotal, '', '', hasMonthly ? monthlyTotal : '']
    : ['Total', '', amountTotal, '', hasMonthly ? monthlyTotal : ''];
  return {
    title: section.title,
    sheetName: uniqueSheetName(section.sheetName, usedNames),
    subtitle: [identity, section.description].filter(Boolean).join(' · '),
    columns,
    rows: [...rows, totalRow],
  };
};

export const buildEmployeePayrollExcelWorkbook = (input: EmployeePayrollExcelInput): ExcelWorkbookInput => {
  const currency = String(input.currency || 'NGN').toUpperCase() === 'USD' ? 'USD' : 'NGN';
  const identity = [input.employeeCode, input.fullName].filter(Boolean).join(' — ');
  const usedNames = new Set<string>();
  const summary: ExcelWorksheetInput = {
    title: `Employee Payroll — ${identity || 'Employee'}`,
    sheetName: uniqueSheetName('Payroll Summary', usedNames),
    subtitle: input.subtitle || `Amounts in ${currency}`,
    columns: ['Field', 'Value'],
    rows: input.summaryRows.map(([label, value]) => [label, value ?? '']),
  };
  const sections = input.sections
    .filter((section) => section.lines.length > 0)
    .map((section) => lineSheet(section, identity, currency, usedNames));
  return { worksheets: [summary, ...sections] };
};

export const employeePayrollExcelFileName = (employeeCode: string, fullName: string) => {
  const token = `${employeeCode}-${fullName}`
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `employee-payroll-${token || 'export'}.xls`;
};
