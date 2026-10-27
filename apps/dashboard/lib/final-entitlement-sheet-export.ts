/**
 * Official DLE Final Entitlement Sheet as Excel-compatible HTML.
 * Client-safe.
 */
import {
  entitlementSheetFileName,
  formatEntitlementDate,
  formatEntitlementHeaderMoney,
  formatEntitlementMoney,
  formatEntitlementStaffName,
  type FinalEntitlementSheet,
} from '@/lib/final-entitlement-sheet';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const moneyCell = (amount: number) => escapeHtml(formatEntitlementMoney(amount));

export const buildFinalEntitlementSheetHtml = (sheet: FinalEntitlementSheet) => {
  const officialAllowanceCount = 3;
  const officialDeductionCount = 5;
  const coreRows = Math.max(officialAllowanceCount, officialDeductionCount);
  const allowanceRows = Array.from({ length: coreRows }).map((_, index) => {
    const allowance = index < officialAllowanceCount ? sheet.allowances[index] : undefined;
    const deduction = index < officialDeductionCount ? sheet.deductions[index] : undefined;
    return `<tr class="${index === 1 ? 'peach-row' : 'plain'}">
      <td class="sn">${allowance ? index + 1 : ''}</td>
      <td>${allowance ? escapeHtml(allowance.label) : ''}</td>
      <td class="num">${allowance ? moneyCell(allowance.amount) : ''}</td>
      <td>${deduction ? escapeHtml(deduction.label) : ''}</td>
      <td class="num">${deduction ? moneyCell(deduction.amount) : ''}</td>
    </tr>`;
  }).join('');
  const extraAllowances = sheet.allowances.slice(officialAllowanceCount).map((row, index) => `<tr class="plain">
      <td class="sn">${officialAllowanceCount + index + 1}</td>
      <td>${escapeHtml(row.label)}</td>
      <td class="num">${moneyCell(row.amount)}</td>
      <td></td>
      <td class="num"></td>
    </tr>`).join('');
  const extraDeductions = sheet.deductions.slice(officialDeductionCount).map((row) => `<tr class="plain">
      <td class="sn"></td>
      <td></td>
      <td class="num"></td>
      <td>${escapeHtml(row.label)}</td>
      <td class="num">${moneyCell(row.amount)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sheet.title)}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; color: #1f2937; }
    table.sheet { border-collapse: collapse; width: 100%; max-width: 980px; }
    td, th { border: 1px solid #c5cdd6; padding: 6px 8px; font-size: 12px; vertical-align: middle; }
    .brand { font-size: 22px; font-weight: 800; color: #00a6ff; letter-spacing: 1px; border: 0; }
    .title { text-align: center; font-size: 16px; font-weight: 800; letter-spacing: 1px; border: 0; }
    .peach { background: #f8d3b0; font-weight: 700; }
    .section { background: #4b5563; color: #fff; font-weight: 800; }
    .total { background: #4b5563; color: #fff; font-weight: 800; }
    .net { background: #4b5563; color: #fff; font-weight: 800; }
    .peach-row td { background: #f8d3b0; }
    .num { text-align: right; mso-number-format:"\\#\\,\\#\\#0.00"; }
    .sn { width: 36px; text-align: center; }
    .muted { color: #4b5563; }
    .alt td { background: #fff7ed; }
    .plain td { background: #fff; }
  </style>
</head>
<body>
  <table class="sheet">
    <tr>
      <td class="brand" colspan="2">DL DORMAN LONG</td>
      <td class="title" colspan="3">${escapeHtml(sheet.title)}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">STAFF NAME</td>
      <td colspan="3">${escapeHtml(formatEntitlementStaffName(sheet.employeeName, sheet.employeeCode))}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">DESIGNATION</td>
      <td colspan="3">${escapeHtml(sheet.designation || '—')}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">DEPARTMENT</td>
      <td colspan="3">${escapeHtml(sheet.department || '—')}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">DATE OF EMPLOYMENT</td>
      <td colspan="3">${escapeHtml(formatEntitlementDate(sheet.dateOfEmployment))}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">DATE OF EXIT</td>
      <td colspan="3">${escapeHtml(formatEntitlementDate(sheet.dateOfExit))}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">No of days worked in the year</td>
      <td class="num">${sheet.daysWorkedInYear || '-'}</td>
      <td class="peach">Total Working Days</td>
      <td class="num">${sheet.totalWorkingDays}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">${sheet.leaveYear} Leave Allowance</td>
      <td class="num">${escapeHtml(formatEntitlementHeaderMoney(sheet.annualLeaveAllowance))}</td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td class="section" colspan="5">A &nbsp; EMPLOYER COLUMN</td>
    </tr>
    <tr class="section">
      <th class="sn">S/N</th>
      <th>ALLOWANCES</th>
      <th>ENTITLED ALLOWANCE (Monthly Salary)</th>
      <th>DEDUCTION</th>
      <th>DEDUCTION AMOUNT</th>
    </tr>
    ${allowanceRows}
    ${extraAllowances}
    ${extraDeductions}
    <tr class="total">
      <td colspan="2">AMOUNT DUE TO EMPLOYEE</td>
      <td class="num">${moneyCell(sheet.amountDueToEmployee)}</td>
      <td>AMOUNT DUE TO DLE</td>
      <td class="num">${moneyCell(sheet.amountDueToDle)}</td>
    </tr>
    <tr>
      <td class="section" colspan="5">B &nbsp; NETTING OFF</td>
    </tr>
    <tr class="net">
      <td colspan="2">AMOUNT DUE TO EMPLOYEE</td>
      <td class="num">${moneyCell(sheet.netDueToEmployee)}</td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td class="peach" colspan="2">PREPARED BY:</td>
      <td>${escapeHtml(sheet.preparedBy || '—')}</td>
      <td class="peach">APPROVED BY:</td>
      <td>${escapeHtml(sheet.approvedBy || '')}</td>
    </tr>
    <tr>
      <td class="peach" colspan="2">DATE</td>
      <td>${escapeHtml(formatEntitlementDate(sheet.preparedDate))}</td>
      <td class="peach">DATE</td>
      <td>${sheet.approvedDate ? escapeHtml(formatEntitlementDate(sheet.approvedDate)) : ''}</td>
    </tr>
  </table>
</body>
</html>`;
};

export const downloadFinalEntitlementSheet = (sheet: FinalEntitlementSheet) => {
  const blob = new Blob([buildFinalEntitlementSheetHtml(sheet)], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = entitlementSheetFileName(sheet);
  link.click();
  URL.revokeObjectURL(url);
};
