/**
 * Excel copy of the telephone allowance employee payment list.
 * SpreadsheetML (.xls) so Excel opens it without an extra workbook library.
 */
import { buildExcelWorkbookXml } from '@/lib/excel-export';
import { monthLabel, roundMoney, type TelephoneCycle } from '@/lib/telephone-allowance-cycle';

export const telephoneAllowanceScheduleWorkbookName = (cycleCode: string) =>
  `${cycleCode}-employee-payment-list.xls`;

export const telephoneAllowanceScheduleWorkbookMime = 'application/vnd.ms-excel';

const payableEmployees = (cycle: TelephoneCycle) =>
  (cycle.employees || []).filter((line) => line.changeBadge !== 'REMOVED' && line.bimonthlyTotal > 0);

export const buildTelephoneAllowanceScheduleWorkbook = (cycle: TelephoneCycle, approvedBy?: string | null) => {
  const lines = payableEmployees(cycle);
  const month1 = monthLabel(cycle.year, cycle.month1);
  const month2 = monthLabel(cycle.year, cycle.month2);
  const total = roundMoney(lines.reduce((sum, line) => sum + line.bimonthlyTotal, 0));
  const columns = [
    'Employee Code',
    'Employee Name',
    'Department',
    month1,
    month2,
    'Total (NGN)',
    'Bank',
    'Account Number',
    'Sort Code',
  ];
  const rows = lines.map((line) => [
    line.employeeCode,
    line.employeeName,
    line.department || '',
    roundMoney(line.month1Amount),
    roundMoney(line.month2Amount),
    roundMoney(line.bimonthlyTotal),
    line.bankName || '',
    String(line.accountNo || '').replace(/\s+/g, ''),
    String(line.sortCode || '').replace(/\s+/g, ''),
  ]);
  rows.push(['', 'Schedule total', '', '', '', total, `${lines.length} employees`, '', '']);

  return Buffer.from(buildExcelWorkbookXml({
    worksheets: [{
      title: `Telephone Allowance Payment Schedule ${cycle.cycleCode}`,
      subtitle: `${cycle.pairLabel} ${cycle.year} · ${month1} and ${month2} · Approved by HR: ${approvedBy || 'HR Manager'} · ${lines.length} employees · NGN ${total.toFixed(2)}`,
      sheetName: 'Payment list',
      columns,
      rows,
    }],
  }), 'utf8');
};
