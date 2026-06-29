export type PayrollLine = { code?: string; label: string; units?: number; amount: number; taxable?: boolean };

export type PayrollHistoryRow = {
  period: string;
  periodLabel?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  payDate?: string;
  payrollNumber?: string;
  payeReference?: string;
  grossPay: number;
  allowances?: number;
  pensionEmployee?: number;
  deductions: number;
  netPay: number;
  status: string;
  dataSource?: 'enterprise' | 'enterprise-db' | 'calculated' | 'sage';
  payslipType?: 'permanent' | 'non-permanent';
  earnings?: PayrollLine[];
  deductionLines?: Array<{ code?: string; label: string; units?: number; amount: number }>;
  employerContributionLines?: Array<{ code?: string; label: string; units?: number; amount: number }>;
  totalEmployerContributions?: number;
  employeeInfo?: Record<string, string | number>;
  statutoryInfo?: Record<string, string | number>;
  leaveInfo?: { annualLeaveEntitlement: number; leaveTaken: number; leaveBalance: number; carryForwardLeave: number };
  ytd?: { grossEarnings: number; taxPaid: number; pensionContribution: number; deductions: number; netEarnings: number };
  verification?: { qrCode: string; generatedAt: string; approvalStatus: string };
};

export type EssPayrollEmployee = {
  employeeId?: string;
  employeeCode?: string;
  fullName?: string;
  jobTitle?: string;
  department?: string;
  businessUnit?: string;
  location?: string;
  payrollGroup?: string;
  salaryGrade?: string;
  status?: string;
  photoUrl?: string;
  hasPhoto?: boolean;
};

export const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
export const money2Fmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (value: number) => moneyFmt.format(value || 0);
export const money2 = (value: number) => money2Fmt.format(value || 0);

export const fmtDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { timeZone: 'UTC' });
};

export const stableDateTime = (value: string) => {
  const iso = new Date(value).toISOString();
  return `${iso.slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}, ${iso.slice(11, 16)} UTC`;
};

const wordsUnderThousand = (value: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (value < 20) return ones[value];
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`;
  return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` and ${wordsUnderThousand(value % 100)}` : ''}`;
};

const numberToWords = (value: number): string => {
  const whole = Math.floor(Math.abs(value));
  if (!whole) return 'Zero';
  const scales: Array<[number, string]> = [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1_000, 'Thousand']];
  let remainder = whole;
  const parts: string[] = [];
  for (const [scale, label] of scales) {
    const count = Math.floor(remainder / scale);
    if (count) {
      parts.push(`${wordsUnderThousand(count)} ${label}`);
      remainder %= scale;
    }
  }
  if (remainder) parts.push(wordsUnderThousand(remainder));
  return parts.join(', ');
};

export const amountInWords = (value: number) => {
  const naira = Math.floor(Math.abs(value || 0));
  const kobo = Math.round((Math.abs(value || 0) - naira) * 100);
  return `${numberToWords(naira)} Naira${kobo ? `, ${numberToWords(kobo)} Kobo` : ''} Only`;
};

const matchesPayrollLine = (line: PayrollLine, matchers: string[]) => {
  const text = `${line.code || ''} ${line.label || ''}`.toUpperCase();
  return matchers.some((matcher) => text.includes(matcher));
};

export const lineAmount = (lines: PayrollLine[] | undefined, matchers: string[]): PayrollLine | null => {
  const matched = (lines || []).filter((line) => matchesPayrollLine(line, matchers));
  if (!matched.length) return null;
  const first = matched[0];
  return {
    ...first,
    units: matched.reduce((sum, line) => sum + Number(line.units || 0), 0),
    amount: matched.reduce((sum, line) => sum + Number(line.amount || 0), 0),
  };
};

export const nonZeroPayrollLine = (line: Pick<PayrollLine, 'amount'>) => Math.abs(Number(line.amount || 0)) > 0.004;

export const standardLines = (lines: PayrollLine[] | undefined, defs: Array<[string, string[]]>) => {
  const source = lines || [];
  const standard = defs
    .map(([, matchers]) => lineAmount(source, matchers))
    .filter((line): line is PayrollLine => line !== null && nonZeroPayrollLine(line));
  const unmatched = source.filter((line) =>
    nonZeroPayrollLine(line) &&
    !defs.some(([, matchers]) => matchesPayrollLine(line, matchers)),
  );
  return [...standard, ...unmatched];
};

export const visibleInfoRow = ([, value]: [string, unknown]) => {
  const text = String(value || '').trim();
  if (!text || text === '—' || text === '-') return false;
  return !/^(not configured|not applicable|n\/a)$/i.test(text);
};

export const nonZeroSummaryRow = ([, value]: [string, string]) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const numeric = Number(text.replace(/[^\d.-]/g, ''));
  return !Number.isFinite(numeric) || Math.abs(numeric) > 0.004;
};

export function buildPayslipModel(
  selected: PayrollHistoryRow,
  employee?: EssPayrollEmployee | null,
  generatedAt?: string,
) {
  const info = selected.employeeInfo || {};
  const statutory = selected.statutoryInfo || {};
  const leave = selected.leaveInfo || { annualLeaveEntitlement: 0, leaveTaken: 0, leaveBalance: 0, carryForwardLeave: 0 };
  const ytd = selected.ytd || { grossEarnings: 0, taxPaid: 0, pensionContribution: 0, deductions: 0, netEarnings: 0 };
  const verification = selected.verification || {
    qrCode: `DLE|${employee?.employeeId || ''}|${selected.period}`,
    generatedAt: generatedAt || new Date().toISOString(),
    approvalStatus: 'Payroll Approved',
  };
  const isNonPermanentPayslip = selected.payslipType === 'non-permanent';
  const permanentEarnings = standardLines(selected.earnings, [
    ['Basic Salary', ['BASIC', 'WEEKDAY EARNING', 'JCWEEKDAY']],
    ['Housing Allowance', ['HOUSING', 'HOUSE']],
    ['Transport Allowance', ['TRANSPORT', 'TRANS']],
    ['Other Allowance', ['OTHERALL', 'OTHER ALLOWANCE']],
    ['Utility Allowance', ['UTILITY', 'UTILITIES']],
    ['Furniture Allowance', ['FURNITURE', 'FURN']],
    ['Leave Allowance', ['LEAVE ALLOWANCE', 'LEAVE_ALLOW']],
    ['Medical Allowance', ['MEDICAL']],
    ['Meal Allowance', ['MEAL']],
    ['Shift Allowance', ['SHIFT']],
    ['Overtime', ['OVERTIME', 'OVT', 'WEEKDAY OVT']],
    ['Bonus', ['BONUS']],
    ['Other Earnings', ['REFUND', 'OTHER PAY', 'OTHER EARNINGS', 'HIGH TAX']],
  ]);
  const nonPermanentEarnings = (selected.earnings || []).filter(nonZeroPayrollLine);
  const earnings = isNonPermanentPayslip ? nonPermanentEarnings : permanentEarnings;
  const earningsTotal = earnings.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const grossPay = Math.max(Number(selected.grossPay || 0), earningsTotal);
  const deductions = standardLines(selected.deductionLines, [
    ['PAYE Tax', ['PAYE']],
    ['Pension Employee Contribution', ['PENSION']],
    ['NHF', ['NHF']],
    ['NHIA', ['NHIA']],
    ['Cooperative Deduction', ['COOPERATIVE']],
    ['Loan Repayment', ['LOAN']],
    ['Union Dues', ['UNION']],
    ['Absence/Late Penalty', ['ABSENCE', 'LATE']],
    ['Other Deductions', ['OTHER']],
  ]);
  const employerLines = standardLines(selected.employerContributionLines as PayrollLine[] | undefined, [
    ['Pension Employer Contribution', ['PENSION_EMPLOYER', 'PENSION EMPLOYER']],
    ['NSITF', ['NSITF']],
    ['ITF Levy', ['ITF']],
    ['Industrial Training Fund', ['INDUSTRIAL TRAINING']],
    ['Group Life Insurance', ['GROUP LIFE']],
    ['Other Employer Contributions', ['OTHER EMPLOYER']],
  ]);
  const totalEmployer = selected.totalEmployerContributions ?? employerLines.reduce((sum, line) => sum + line.amount, 0);
  const payeTax = lineAmount(deductions, ['PAYE'])?.amount ?? ytd.taxPaid ?? 0;
  const pensionEmployee = selected.pensionEmployee ?? lineAmount(deductions, ['PENSION'])?.amount ?? ytd.pensionContribution ?? 0;

  return {
    info,
    statutory,
    leave,
    ytd,
    verification,
    isNonPermanentPayslip,
    earnings,
    grossPay,
    deductions,
    employerLines,
    totalEmployer,
    payeTax,
    pensionEmployee,
    employeeRows: [
      ['Employee Code', info.employeeCode || employee?.employeeCode],
      ['Employee Name', info.employeeName || employee?.fullName],
      ['Employee Category', info.employeeCategory || employee?.payrollGroup],
      ['Department', info.department || employee?.department],
      ['Unit', info.unit || employee?.businessUnit],
      ['Designation / Job Title', info.designation || employee?.jobTitle],
      ['Grade Level', info.gradeLevel || employee?.salaryGrade],
      ['Employment Type', info.employmentType || 'Permanent'],
      ['Date of Employment', fmtDate(String(info.dateOfEmployment || ''))],
      ['Employee Status', info.employeeStatus || employee?.status || 'Active'],
    ] as Array<[string, unknown]>,
    bankRows: [
      ['Bank Name', statutory.bankName || 'Stanbic IBTC'],
      ['Account Number', statutory.accountNumber || 'Not configured'],
      ...(isNonPermanentPayslip ? [] : [
        ['Pension Fund Administrator', statutory.pensionFundAdministrator || 'Not configured'],
        ['Pension Number', statutory.pensionNumber || 'Not configured'],
        ['NHF Number', statutory.nhfNumber || 'Not applicable'],
      ] as Array<[string, unknown]>),
      ['Tax Number', statutory.taxNumber || selected.payeReference || 'Not configured'],
      ...(isNonPermanentPayslip ? [] : [['NHIA Number', statutory.nhiaNumber || 'Not applicable']] as Array<[string, unknown]>),
      ['Employee Address', info.address || 'Not configured'],
    ] as Array<[string, unknown]>,
    leaveRows: [
      ['Annual Leave Entitlement', `${leave.annualLeaveEntitlement} days`],
      ['Leave Taken', `${leave.leaveTaken} days`],
      ['Leave Balance', `${leave.leaveBalance} days`],
      ['Carry Forward Leave', `${leave.carryForwardLeave} days`],
    ] as Array<[string, string]>,
    ytdRows: [
      ['YTD Gross Earnings', money2(ytd.grossEarnings)],
      ['YTD Net Earnings', money2(ytd.netEarnings)],
      ['YTD Tax Paid', money2(ytd.taxPaid)],
      ['YTD Pension Contribution', money2(ytd.pensionContribution)],
      ['YTD NHF', money2(lineAmount(deductions, ['NHF'])?.amount || 0)],
      ['YTD Bonuses', money2(lineAmount(earnings, ['BONUS'])?.amount || 0)],
      ['YTD Leave Allowance', money2(lineAmount(earnings, ['LEAVE ALLOWANCE', 'LEAVE_ALLOW'])?.amount || 0)],
      ['YTD Deductions', money2(ytd.deductions)],
    ] as Array<[string, string]>,
  };
}
