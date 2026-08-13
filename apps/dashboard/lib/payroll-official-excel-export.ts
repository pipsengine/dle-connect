/**
 * Official payroll Excel workbooks matching finance/HR sample layouts:
 * - Salaried bank schedule: Permanent / Contract Lumpsum / IT NYSC sheets
 * - Dayrate bank schedule: DLE/DLPC BANK SCHD (Employee Bank Details)
 * - Salaried detail: JULY PAYROLL.xlsx → Perm.Staff / Cont. Staff
 * - Dayrate schedule: DAYRATE PAYMENT SCHEDULE → SUMMARY + DLE/DLPC + bank sheets
 */
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { ExcelCell, ExcelWorksheetInput } from '@/lib/excel-export';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import {
  BANK_SCHEDULE_STAFF_PACKS,
  bankScheduleDisplayEmployeeCode,
  resolveBankScheduleStaffPack,
  type BankScheduleStaffPack,
} from '@/lib/payroll-bank-schedule-packs';
import { buildPayrollAttendanceSheet, type PayrollAttendanceSheetRow } from '@/lib/timesheet-payroll-attendance-sheet';
import { isTimesheetCountableForPayroll, readTimesheetData } from '@/lib/timesheet-entry-store';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type OfficialCompanyBucket = 'DLE' | 'DLPC';

export const resolveOfficialCompanyBucket = (record: {
  payrollGroup?: string | null;
  businessUnit?: string | null;
  location?: string | null;
  companyCode?: string | null;
}): OfficialCompanyBucket => {
  const blob = `${record.companyCode || ''} ${record.payrollGroup || ''} ${record.businessUnit || ''} ${record.location || ''}`.toUpperCase();
  if (/\bDLPCG\b|\bDLPC\b|AGEGE/.test(blob)) return 'DLPC';
  return 'DLE';
};

export const officialCompanySummaryLabel = (bucket: OfficialCompanyBucket) => (bucket === 'DLPC' ? 'DLPC' : 'DLENG');

const splitPersonName = (fullName: string, firstName?: string | null, lastName?: string | null) => {
  if (compact(firstName) || compact(lastName)) {
    return { firstName: compact(firstName) || compact(fullName), lastName: compact(lastName) };
  }
  const cleaned = compact(fullName).replace(/^(Mr|Mrs|Miss|Ms|Dr|Engr)\.?\s+/i, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const employeeCodeOf = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId'>) =>
  compact(record.employeeCode || record.employeeId);

/** Sage JULY PAYROLL / bank schedule style: permanent codes without leading P. */
const officialEmployeeCode = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId'>) => {
  const code = employeeCodeOf(record);
  if (/^P\d+$/i.test(code)) return code.slice(1);
  return code;
};

const lineAmount = (
  lines: Array<{ code?: string | null; name?: string | null; label?: string | null; amount?: number | null }> | undefined,
  pattern: RegExp,
) =>
  roundMoney(
    (lines || []).reduce((sum, line) => {
      const token = `${line.code || ''} ${line.name || ''} ${line.label || ''}`;
      return pattern.test(token) ? sum + Number(line.amount || 0) : sum;
    }, 0),
  );

const isContractOrStipend = (record: PayrollCalculationRecord) => {
  const type = upper(record.employmentType);
  const code = employeeCodeOf(record);
  const profile = upper(record.earningProfileId || record.earningProfile);
  if (record.isDailyRate) return true;
  if (/^L\d|^N\d|^I\d/i.test(code)) return true;
  if (/LUMPSUM|CONTRACT|NYSC|INTERN|STIPEND/.test(type)) return true;
  if (/contract|lumpsum|stipend|nysc|intern/.test(profile)) return true;
  return false;
};

const contTypeOf = (record: PayrollCalculationRecord) => {
  const code = employeeCodeOf(record);
  const type = upper(record.employmentType);
  if (/^N\d/i.test(code) || /NYSC/.test(type)) return 'NYSC';
  if (/^I\d/i.test(code) || /INTERN|IT\b/.test(type)) return 'IT';
  if (/LUMPSUM|CONTRACT/.test(type) || /^L\d/i.test(code)) return 'Lumpsum';
  return compact(record.employmentType) || 'Contract';
};

const haLabel = (code: string, name?: string | null) => {
  const c = compact(code);
  const n = compact(name);
  if (!c && !n) return '';
  if (!n || upper(c) === upper(n)) return c || n;
  if (upper(n).startsWith(upper(c))) return n;
  return `${c} - ${n}`;
};

type DirectoryEnrichment = Pick<
  DleEmployeeDirectoryRow,
  | 'employeeCode'
  | 'employeeId'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'gender'
  | 'dateOfBirth'
  | 'dateJoined'
  | 'jobTitle'
  | 'location'
  | 'department'
  | 'businessUnit'
  | 'pensionProvider'
  | 'salaryGrade'
  | 'jobGrade'
  | 'employmentType'
  | 'managerName'
  | 'yearsOfService'
> & {
  companyCode?: string | null;
  companyName?: string | null;
  reportingManager?: string | null;
  age?: number | null;
};

const ageFromDob = (dob?: string | null) => {
  const raw = compact(dob).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const born = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return '';
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const md = now.getUTCMonth() * 100 + now.getUTCDate();
  const bmd = born.getUTCMonth() * 100 + born.getUTCDate();
  if (md < bmd) age -= 1;
  return age > 0 && age < 120 ? age : '';
};

const directoryByKeys = (employees: DirectoryEnrichment[]) => {
  const map = new Map<string, DirectoryEnrichment>();
  for (const employee of employees) {
    [employee.employeeCode, employee.employeeId, employee.fullName]
      .map((value) => upper(value))
      .filter(Boolean)
      .forEach((key) => map.set(key, employee));
  }
  return map;
};

const enrich = (record: PayrollCalculationRecord, dir?: DirectoryEnrichment | null) => {
  const names = splitPersonName(record.fullName || dir?.fullName || '', dir?.firstName, dir?.lastName);
  const companyBucket = resolveOfficialCompanyBucket({
    payrollGroup: record.payrollGroup,
    businessUnit: record.businessUnit || dir?.businessUnit,
    location: record.location || dir?.location,
    companyCode: dir?.companyCode,
  });
  return {
    ...record,
    _firstName: names.firstName,
    _lastName: names.lastName,
    _gender: compact(dir?.gender),
    _dob: compact(dir?.dateOfBirth).slice(0, 10),
    _dateJoined: compact(dir?.dateJoined).slice(0, 10),
    _age: Number(dir?.age || 0) || ageFromDob(dir?.dateOfBirth) || dir?.yearsOfService || '',
    _companyBucket: companyBucket,
    _companyHa: haLabel(
      companyBucket === 'DLPC' ? 'DLPCG' : 'DLENG',
      dir?.companyName || (companyBucket === 'DLPC' ? 'DLPCG' : 'DLENG'),
    ),
    _departmentHa: haLabel(compact(record.department || dir?.department).split(/\s*-\s*/)[0] || record.department, record.department || dir?.department),
    _employeeTypeHa: haLabel(compact(record.employmentType || dir?.employmentType), record.employmentType || dir?.employmentType),
    _locationHa: haLabel(compact(record.location || dir?.location).split(/\s*-\s*/)[0] || record.location, record.location || dir?.location),
    _pensionHa: haLabel(compact(dir?.pensionProvider), dir?.pensionProvider),
    _profileHa: haLabel(compact(record.salaryGrade || dir?.salaryGrade || dir?.jobGrade), record.salaryGrade || dir?.salaryGrade || dir?.jobGrade),
    _supervisorHa: compact(dir?.reportingManager || dir?.managerName),
    _jobTitle: compact(record.jobTitle || dir?.jobTitle),
    _location: compact(record.location || dir?.location),
  };
};

type Enriched = ReturnType<typeof enrich>;

/** —— Bank schedule —— */
export const buildOfficialBankScheduleWorksheets = (
  records: PayrollCalculationRecord[],
  options?: {
    periodLabel?: string;
    titlePrefix?: string;
    /** staff-packs = Permanent / Contract Lumpsum / IT NYSC; company = DLE/DLPC */
    mode?: 'staff-packs' | 'company';
  },
): ExcelWorksheetInput[] => {
  const periodLabel = options?.periodLabel || 'Payroll Period';
  const mode = options?.mode || 'staff-packs';
  const payable = (record: PayrollCalculationRecord) =>
    Number(record.netPay || 0) !== 0 || compact(record.accountNo);

  if (mode === 'company') {
    const buckets: OfficialCompanyBucket[] = ['DLE', 'DLPC'];
    return buckets.map((bucket) => {
      const rows = records
        .filter((record) => resolveOfficialCompanyBucket(record) === bucket)
        .filter(payable)
        .map((record) => [
          officialEmployeeCode(record),
          compact(record.fullName),
          compact(record.bankName),
          compact(record.accountNo),
          compact(record.sortCode || record.branchCode || record.bankCode),
          roundMoney(Number(record.netPay || 0)),
          compact(record.location),
        ] as ExcelCell[]);
      return {
        title: 'Employee Bank Details',
        subtitle: `${options?.titlePrefix || 'Bank Payment Schedule'} · ${periodLabel} · ${bucket}`,
        sheetName: `${bucket} BANK SCHD`,
        columns: ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'],
        rows,
      };
    });
  }

  return BANK_SCHEDULE_STAFF_PACKS.map((pack) => {
    const packId = pack.id as BankScheduleStaffPack;
    const rows = records
      .filter((record) => !record.isDailyRate)
      .filter((record) => resolveBankScheduleStaffPack(record) === packId)
      .filter(payable)
      .map((record) => [
        bankScheduleDisplayEmployeeCode(record, packId),
        compact(record.fullName),
        compact(record.bankName),
        compact(record.accountNo),
        compact(record.sortCode || record.branchCode || record.bankCode),
        roundMoney(Number(record.netPay || 0)),
        compact(record.location),
      ] as ExcelCell[]);
    return {
      title: 'Employee Bank Details',
      subtitle: `${options?.titlePrefix || 'Bank Payment Schedule'} · ${periodLabel} · ${pack.label}`,
      sheetName: pack.sheetName,
      columns: ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'],
      rows,
    };
  });
};

/** —— Salaried / stipend JULY PAYROLL detail (exact sample column sets) —— */
type DeductionColumnDef = { label: string; pattern: RegExp; fallback?: (r: Enriched) => number };

const EARNING_PATTERN_BY_LABEL: Record<string, RegExp> = {
  'ARREARS (Earning)': /^ARREARS$/i,
  'BASIC SALARY (Earning)': /BASIC(?!1_LUMPSUM)|SNM_BASIC|EXP_BASIC|MD BASIC/i,
  'FURNITURE (Earning)': /^FURNITURE$/i,
  'FURNITURE ALLOWANCE (Earning)': /FURNITURE ALLOW/i,
  'HOUSING (Earning)': /^(HOUSING|SNMHOUSING|EXP_HOUSING)/i,
  'IT ALLOWANCE (Earning)': /IT ALLOW/i,
  'JNR MEDICAL (Earning)': /JNR.?MEDICAL/i,
  'JNR OTHER ALLOWANCE (Earning)': /JNR.?OTHER/i,
  'Jnr Staff_Meal Allowance (Earning)': /JNR.?STAFF.?MEAL|PER_MEAL_JNR/i,
  'JNR UTILITY (Earning)': /JNR.?UTIL/i,
  'JUNIOR UNION (Earning)': /JUNIOR UNION|JNR_UNION(?!_DUES)/i,
  'Leave Allowance (Earning)': /LEAVE ALLOW/i,
  'LUMPSUM ALLOWANCE (Earning)': /LUMPSUM ALLOW/i,
  'LUMSUM AMOUNT (Earning)': /LUMSUM AMOUNT|BASIC1_LUMPSUM|LUMPSUMTAX|LUMSUM/i,
  'MD BASIC (Earning)': /MD BASIC/i,
  'MEAL (Earning)': /^MEAL$/i,
  'Meal Allowance (Earning)': /MEAL ALLOW|PER_MEAL(?!_JNR)/i,
  'MEAL ALLOWANCE (Earning)': /MEAL ALLOW|PER_MEAL(?!_JNR)/i,
  'MEDICAL (Earning)': /MEDICAL/i,
  'NIGHT ALLOWANCE (Earning)': /NIGHT ALLOW|JCWEEKDAY_NT|NIGHT/i,
  'NYSC ALLOWANCE (Earning)': /NYSC/i,
  'OTHER ALLOWANCE (Earning)': /OTHER ALLOW|SNMOTHER|EXP_OTHALL|OTHALL/i,
  'OVERTIME (Earning)': /OVERTIME|WEEKDAYOVT|SATEARN|SUNDAYEARN|PUBHOL/i,
  'PENSION REFUND (Earning)': /PENSION.?REFUND/i,
  'REFUND (Earning)': /^REFUND$/i,
  'SENIOR MANAGEMENT HOUSING_TAX (Earning)': /SENIOR MANAGEMENT HOUSING|SNMHOUSINGTAX/i,
  'SENIOR MANAGEMENT OTHER ALLOWANCE_T (Earning)': /SENIOR MANAGEMENT OTHER|SNMOTHERALL/i,
  'SENIOR MANAGER TRANSPORT (Earning)': /SENIOR MANAGER TRANSPORT|SNMTRANSP|SNM_TRANS/i,
  'SITE ALLOWANCE (Earning)': /SITE ALLOW/i,
  'SNR UNION (Earning)': /SNR UNION(?! DUES)/i,
  'STOCK COUNT (Earning)': /STOCK COUNT/i,
  'TCM TRANSPORT (Earning)': /TCM.?TRANS/i,
  'TRANSPORT ALLOWANCE (Earning)': /TRANSPORT ALLOW|EXP_TRANS|^TRANS/i,
  'UTILITIES (Earning)': /^UTILITIES$/i,
  'UTILITY (Earning)': /^UTILITY$/i,
};

const PERM_EARNING_LABELS = [
  'BASIC SALARY (Earning)',
  'FURNITURE (Earning)',
  'FURNITURE ALLOWANCE (Earning)',
  'HOUSING (Earning)',
  'JNR MEDICAL (Earning)',
  'JNR OTHER ALLOWANCE (Earning)',
  'Jnr Staff_Meal Allowance (Earning)',
  'JNR UTILITY (Earning)',
  'JUNIOR UNION (Earning)',
  'Leave Allowance (Earning)',
  'MD BASIC (Earning)',
  'MEAL (Earning)',
  'Meal Allowance (Earning)',
  'MEDICAL (Earning)',
  'OTHER ALLOWANCE (Earning)',
  'OVERTIME (Earning)',
  'PENSION REFUND (Earning)',
  'REFUND (Earning)',
  'SENIOR MANAGEMENT HOUSING_TAX (Earning)',
  'SENIOR MANAGEMENT OTHER ALLOWANCE_T (Earning)',
  'SENIOR MANAGER TRANSPORT (Earning)',
  'SITE ALLOWANCE (Earning)',
  'SNR UNION (Earning)',
  'STOCK COUNT (Earning)',
  'TCM TRANSPORT (Earning)',
  'TRANSPORT ALLOWANCE (Earning)',
  'UTILITIES (Earning)',
  'UTILITY (Earning)',
] as const;

const CONT_EARNING_LABELS = [
  'ARREARS (Earning)',
  'IT ALLOWANCE (Earning)',
  'LUMPSUM ALLOWANCE (Earning)',
  'LUMSUM AMOUNT (Earning)',
  'MEAL (Earning)',
  'MEAL ALLOWANCE (Earning)',
  'NIGHT ALLOWANCE (Earning)',
  'NYSC ALLOWANCE (Earning)',
  'OVERTIME (Earning)',
  'REFUND (Earning)',
  'SITE ALLOWANCE (Earning)',
  'STOCK COUNT (Earning)',
  'TCM TRANSPORT (Earning)',
] as const;

const PERM_DEDUCTION_COLUMNS: DeductionColumnDef[] = [
  { label: 'NHF - National Housing Fund (Deduction)', pattern: /^NHF$/i },
  { label: 'PAYE Tax (Deduction)', pattern: /^PAYE$/i, fallback: (r) => Number(r.paye || 0) },
  { label: 'Pension (Deduction)', pattern: /^PENSION_EE$|^PENSION$/i, fallback: (r) => Number(r.pensionEmployee || r.pension || 0) },
  { label: 'PENSION EE2 (Deduction)', pattern: /PENSION_EE2|VOLPENS|ADDITIONAL EMPLOYEE PENSION/i },
  { label: 'TAX (Deduction)', pattern: /^TAX$/i },
  { label: 'UNION DUES (Deduction)', pattern: /UNION/i },
];

const CONT_DEDUCTION_COLUMNS: DeductionColumnDef[] = [
  { label: 'PAYE Tax (Deduction)', pattern: /^PAYE$/i, fallback: (r) => Number(r.paye || 0) },
];

const PERM_TAIL_COLUMNS = [
  'Earning Total',
  'Deduction Total',
  'ITF Levy (CompanyContribution)',
  'NSITF - Nigeria Social Insurance Tr (CompanyContribution)',
  'Pension (CompanyContribution)',
  'PENSION EMPLOYER CONTRIBUTION- USD (CompanyContribution)',
  'CompanyContribution Total',
  'LIFE ASSURANCE (Provisions)',
  'RENT (Provisions)',
  'Provisions Total',
  'Period Salary',
  'Annual Salary',
  'Gross Earnings',
  'Net Pay',
  'Taxable Earnings',
  'Company (HA)',
  'Department (HA)',
  'Employee Type (HA)',
  'Location (HA)',
  'Nigeria - Pension Fund (HA)',
  'Profile (HA)',
  'Project (HA)',
  'Supervisor (HA)',
] as const;

const CONT_TAIL_COLUMNS = [
  'Earning Total',
  'Deduction Total',
  'RENT (Provisions)',
  'Provisions Total',
  'Period Salary',
  'Annual Salary',
  'Gross Earnings',
  'Net Pay',
  'Taxable Earnings',
  'Company (HA)',
  'Department (HA)',
  'Employee Type (HA)',
  'Location (HA)',
  'Nigeria - Pension Fund (HA)',
  'Profile (HA)',
  'Project (HA)',
  'Supervisor (HA)',
] as const;

const knownEarningPatterns = () => Object.values(EARNING_PATTERN_BY_LABEL);

const dynamicEarningLabels = (records: Enriched[], reservedLabels: string[]) => {
  const seen = new Set(reservedLabels);
  const extra: string[] = [];
  for (const record of records) {
    for (const line of record.earningLines || []) {
      const code = compact(line.code);
      const name = compact((line as { name?: string }).name || line.label || code);
      if (!code && !name) continue;
      if (Number(line.amount || 0) === 0) continue;
      if (knownEarningPatterns().some((pattern) => pattern.test(`${code} ${name}`))) continue;
      const label = `${name || code} (Earning)`;
      if (seen.has(label)) continue;
      seen.add(label);
      extra.push(label);
    }
  }
  return extra.sort();
};

const earningValue = (record: Enriched, label: string) => {
  const pattern = EARNING_PATTERN_BY_LABEL[label];
  if (pattern) return lineAmount(record.earningLines, pattern);
  const bare = label.replace(/\s*\(Earning\)$/i, '');
  return lineAmount(record.earningLines, new RegExp(`^${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
};

const splitEmployerStatutory = (record: Enriched) => {
  const gross = Number(record.grossPay || 0);
  const onePct = roundMoney(gross * 0.01);
  const total = Number(record.statutoryEmployer || 0);
  if (total <= 0) return { itf: onePct, nsitf: onePct };
  // JULY PAYROLL sample uses 1% ITF + 1% NSITF of gross when employer statutory ≈ 2%.
  if (Math.abs(total - onePct * 2) <= 1) return { itf: onePct, nsitf: onePct };
  const half = roundMoney(total / 2);
  return { itf: half, nsitf: roundMoney(total - half) };
};

const haTailValues = (record: Enriched): ExcelCell[] => [
  record._companyHa,
  record._departmentHa,
  record._employeeTypeHa,
  record._locationHa,
  record._pensionHa,
  record._profileHa,
  '',
  record._supervisorHa,
];

const buildSalariedSheet = (
  records: Enriched[],
  sheetName: 'Perm.Staff' | 'Cont. Staff',
  periodLabel: string,
): ExcelWorksheetInput => {
  const isPerm = sheetName === 'Perm.Staff';
  const baseEarnings = [...(isPerm ? PERM_EARNING_LABELS : CONT_EARNING_LABELS)];
  const extraEarnings = dynamicEarningLabels(records, baseEarnings);
  const earningLabels = [...baseEarnings, ...extraEarnings];
  const deductionColumns = isPerm ? PERM_DEDUCTION_COLUMNS : CONT_DEDUCTION_COLUMNS;
  const identity = isPerm
    ? ['Employee Code', 'EmployeeSurname', 'EmployeeFirstName', 'Age', 'Date of Birth', 'Gender', 'Date Joined Group', 'Job Title Long Description']
    : ['Employee Code', 'Cont Type', 'EmployeeSurname', 'EmployeeFirstName', 'Age', 'Date of Birth', 'Gender', 'Date Joined Group', 'Job Title Long Description'];
  const columns = [
    ...identity,
    ...earningLabels,
    ...deductionColumns.map((item) => item.label),
    ...(isPerm ? PERM_TAIL_COLUMNS : CONT_TAIL_COLUMNS),
  ];

  const rows = records.map((record) => {
    const earningTotal = roundMoney((record.earningLines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0))
      || roundMoney(Number(record.grossPay || 0));
    const deductionTotal = roundMoney(Number(record.totalDeductions || record.deductions || 0));
    const { itf, nsitf } = splitEmployerStatutory(record);
    const pensionEr = roundMoney(Number(record.pensionEmployer || 0));
    const usdEr = record.payCurrency === 'USD' ? pensionEr : 0;
    const companyTotal = roundMoney(itf + nsitf + pensionEr);
    const rentProvision = 208333.33;
    const periodSalary = roundMoney(Number(record.periodPackageGross || record.grossPay || 0));
    const values: ExcelCell[] = isPerm
      ? [
          officialEmployeeCode(record),
          record._lastName,
          record._firstName,
          record._age,
          record._dob,
          record._gender,
          record._dateJoined,
          record._jobTitle,
        ]
      : [
          officialEmployeeCode(record),
          contTypeOf(record),
          record._lastName,
          record._firstName,
          record._age,
          record._dob,
          record._gender,
          record._dateJoined,
          record._jobTitle,
        ];

    for (const label of earningLabels) values.push(earningValue(record, label));

    for (const column of deductionColumns) {
      const fromLines = lineAmount(record.deductionLines, column.pattern);
      values.push(fromLines || (column.fallback ? roundMoney(column.fallback(record)) : 0));
    }

    if (isPerm) {
      values.push(
        earningTotal,
        deductionTotal,
        itf,
        nsitf,
        record.payCurrency === 'USD' ? 0 : pensionEr,
        usdEr,
        companyTotal,
        0,
        rentProvision,
        rentProvision,
        periodSalary,
        roundMoney(periodSalary * 12),
        roundMoney(Number(record.grossPay || 0)),
        roundMoney(Number(record.netPay || 0)),
        roundMoney(Number(record.taxablePay || record.grossPay || 0)),
        ...haTailValues(record),
      );
    } else {
      values.push(
        earningTotal,
        deductionTotal,
        rentProvision,
        rentProvision,
        periodSalary,
        roundMoney(periodSalary * 12),
        roundMoney(Number(record.grossPay || 0)),
        roundMoney(Number(record.netPay || 0)),
        roundMoney(Number(record.taxablePay || record.grossPay || 0)),
        ...haTailValues(record),
      );
    }

    return values;
  });

  return {
    title: isPerm ? `Permanent Staff Payroll Detail - ${periodLabel}` : `Contract / Stipend Staff Payroll Detail - ${periodLabel}`,
    subtitle: `${records.length} employees · official JULY PAYROLL layout`,
    sheetName,
    columns,
    rows,
  };
};

export const buildOfficialSalariedDetailWorksheets = (
  records: PayrollCalculationRecord[],
  options?: { periodLabel?: string; directoryEmployees?: DirectoryEnrichment[] },
): ExcelWorksheetInput[] => {
  const dirMap = directoryByKeys(options?.directoryEmployees || []);
  const enriched = records
    .filter((record) => !record.isDailyRate)
    .map((record) => enrich(record, dirMap.get(upper(record.employeeCode)) || dirMap.get(upper(record.employeeId)) || dirMap.get(upper(record.fullName))));
  const permanent = enriched.filter((record) => !isContractOrStipend(record));
  const contract = enriched.filter((record) => isContractOrStipend(record));
  const periodLabel = options?.periodLabel || 'Payroll Period';
  return [
    buildSalariedSheet(permanent, 'Perm.Staff', periodLabel),
    buildSalariedSheet(contract, 'Cont. Staff', periodLabel),
  ];
};

/** —— Dayrate schedule —— */
const DAYRATE_DLE_COLUMNS = [
  'Emp. Code',
  'First Name',
  'Last Name',
  'Job Title',
  'Location',
  'Old Rate',
  'Daily Rate',
  'AGE',
  'Gender',
  'Total Weekday',
  'Weekday OVT',
  'Total Saturday',
  'Total Sunday',
  'Public Holiday',
  'Night Worked',
  'Wkd Earning',
  'Wkd Ovt Amt',
  'Sat Ovt Amt',
  'Sun Ovt Amt',
  'PH Amt',
  'Night Amt',
  'Meal Allowance',
  'Transport',
  'Stock Count',
  'Site Allowance',
  'TCM Meal',
  'TCM TRANSPORT',
  'Total Earnings',
  'WHT',
  'Gross Salary',
  'Net Pay',
] as const;

const DAYRATE_DLPC_COLUMNS = [
  'Emp. Code',
  'First Name',
  'Last Name',
  'Job Title',
  'Old Rate',
  'Daily Rate',
  'Age',
  'Gender',
  'Total Weekday',
  'Weekday OVT',
  'Total Saturday',
  'Total Sunday',
  'Public Holiday',
  'Night Worked',
  'Wkd Earning',
  'Wkd Ovt Amt',
  'Sat Ovt Amt',
  'Sun Ovt Amt',
  'PH Amt',
  'Night Amt',
  'Meal Allowance',
  'Transport',
  'Stock Count',
  'Total Earnings',
  'WHT',
  'Gross Salary',
  'Net Pay',
  'Total Earning- Transport',
] as const;

const buildDayrateDetailSheet = (
  records: Enriched[],
  attendance: Map<string, PayrollAttendanceSheetRow>,
  sheetName: 'DLE' | 'DLPC',
  periodLabel: string,
): ExcelWorksheetInput => {
  const columns = sheetName === 'DLE' ? [...DAYRATE_DLE_COLUMNS] : [...DAYRATE_DLPC_COLUMNS];
  const rows = records.map((record) => {
    const code = officialEmployeeCode(record);
    const att = attendance.get(upper(code))
      || attendance.get(upper(employeeCodeOf(record)))
      || attendance.get(upper(record.fullName))
      || attendance.get(upper(`${record._firstName} ${record._lastName}`));
    const dailyRate = Number(record.ratePerDay || 0)
      || (att && att.weekDaysWorked > 0 ? roundMoney(Number(att.weekDayTotal || 0) / att.weekDaysWorked) : 0);
    const weekDays = Number(att?.weekDaysWorked ?? record.timesheetDaysWorked ?? 0);
    const weekdayOvtHrs = Number(att?.weekdayOvertimeHours ?? 0);
    const satHrs = Number(att?.saturdayHours ?? 0);
    const sunHrs = Number(att?.sundayHours ?? 0);
    const phHrs = Number(att?.publicHolidayHours ?? 0);
    const nightDays = Number(att?.nightWorkedDays ?? 0);

    const wkdEarning = lineAmount(record.earningLines, /JCWEEKDAY(?!_NT)/i) + lineAmount(record.earningLines, /JCWEEKDAY_NT/i)
      || Number(att?.weekDayTotal || 0)
      || roundMoney(weekDays * dailyRate);
    const wkdOvtAmt = lineAmount(record.earningLines, /WEEKDAYOVT/i)
      || Number(att?.weekdayOvertimeTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 1.5 * weekdayOvtHrs) : 0);
    const satAmt = lineAmount(record.earningLines, /SATEARN/i)
      || Number(att?.saturdayTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 1.5 * satHrs) : 0);
    const sunAmt = lineAmount(record.earningLines, /SUNDAYEARN/i)
      || Number(att?.sundayTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 2 * sunHrs) : 0);
    const phAmt = lineAmount(record.earningLines, /PUBHOL/i)
      || Number(att?.publicHolidayTotal || 0)
      || (dailyRate > 0 ? roundMoney((dailyRate / 8) * 2 * phHrs) : 0);
    const nightAmt = lineAmount(record.earningLines, /NIGHT/i)
      || Number(att?.nightWorkedTotal || 0)
      || roundMoney(1100 * nightDays);
    const meal = lineAmount(record.earningLines, /^MEAL$|MEAL ALLOW|PER_MEAL/i)
      || roundMoney(500 * weekDays);
    const transport = lineAmount(record.earningLines, /TRANSPORT ALLOW|EXP_TRANS|^TRANSPORT$/i);
    const stock = lineAmount(record.earningLines, /STOCK/i);
    const site = lineAmount(record.earningLines, /SITE ALLOW/i) || Number(att?.siteAllowanceTotal || 0);
    const tcmMeal = lineAmount(record.earningLines, /TCMMEAL/i);
    const tcmTransport = lineAmount(record.earningLines, /TCM.?TRANS/i);
    const totalEarnings = roundMoney(Number(record.grossPay || 0))
      || roundMoney(wkdEarning + wkdOvtAmt + satAmt + sunAmt + phAmt + nightAmt + meal + transport + stock + site + tcmMeal + tcmTransport);
    const wht = roundMoney(Number(record.paye || 0)) || roundMoney(totalEarnings * 0.05);
    const netPay = roundMoney(Number(record.netPay || 0)) || roundMoney(totalEarnings - wht);
    const totalEarningMinusTransport = roundMoney(wkdEarning + wkdOvtAmt + satAmt + sunAmt + phAmt + nightAmt + meal + stock);

    if (sheetName === 'DLE') {
      return [
        code,
        record._firstName || att?.firstName || '',
        record._lastName || att?.lastName || '',
        record._jobTitle || att?.jobTitle || '',
        record._location || att?.location || '',
        '',
        roundMoney(dailyRate),
        record._age || '',
        record._gender || '',
        weekDays,
        weekdayOvtHrs,
        satHrs,
        sunHrs,
        phHrs,
        nightDays,
        wkdEarning,
        wkdOvtAmt,
        satAmt,
        sunAmt,
        phAmt,
        nightAmt,
        meal,
        transport,
        stock,
        site,
        tcmMeal,
        tcmTransport,
        totalEarnings,
        wht,
        totalEarnings,
        netPay,
      ] as ExcelCell[];
    }

    return [
      code,
      record._firstName || att?.firstName || '',
      record._lastName || att?.lastName || '',
      record._jobTitle || att?.jobTitle || '',
      '',
      roundMoney(dailyRate),
      record._age || '',
      record._gender || '',
      weekDays,
      weekdayOvtHrs,
      satHrs,
      sunHrs,
      phHrs,
      nightDays,
      wkdEarning,
      wkdOvtAmt,
      satAmt,
      sunAmt,
      phAmt,
      nightAmt,
      meal,
      transport,
      stock,
      totalEarnings,
      wht,
      totalEarnings,
      netPay,
      totalEarningMinusTransport,
    ] as ExcelCell[];
  });

  return {
    title: `Daily Rate Payment Detail (${sheetName}) - ${periodLabel}`,
    subtitle: `${records.length} employees · official dayrate schedule layout`,
    sheetName,
    columns,
    rows,
  };
};

export const loadDayrateAttendanceByEmpCode = async (period: string) => {
  const periodId = period.startsWith('per-') ? period : `per-${period}`;
  const periodToken = period.replace(/^per-/, '');
  try {
    const { headers, lines } = await readTimesheetData({ softFail: true });
    const periodHeaders = (headers || []).filter((header) => {
      if (!isTimesheetCountableForPayroll(header.status)) return false;
      return header.periodId === periodId
        || compact(header.periodId).includes(periodToken)
        || compact((header as { periodName?: string }).periodName).includes(periodToken);
    });
    const headerIds = new Set(periodHeaders.map((header) => header.id));
    const headerById = new Map(periodHeaders.map((header) => [header.id, header]));
    const attendanceRows = (lines || [])
      .filter((line) => headerIds.has(line.headerId))
      .map((line) => {
        const header = headerById.get(line.headerId);
        return {
          lineId: line.id,
          timesheetDate: compact(header?.timesheetDate).slice(0, 10),
          employeeId: line.employeeId,
          employeeNo: line.employeeNo,
          employeeName: line.employeeName,
          jobTitle: compact((line as { jobTitle?: string }).jobTitle),
          location: compact((line as { location?: string }).location),
          shiftLabel: compact((line as { shiftLabel?: string }).shiftLabel),
          projectCode: compact(line.projectAllocations?.[0]?.projectCode || 'General'),
          projectSite: compact((line as { projectSite?: string }).projectSite),
          lineRemarks: compact(line.remarks),
          idleReasons: compact(line.idleAllocations?.[0]?.reasonName),
          attendanceHours: Number(line.attendanceDuration || 0),
          usedHours: Number(line.usedHours || 0),
          productiveHours: Number(line.usedHours || line.totalHours || 0),
          totalHours: Number(line.totalHours || 0),
          dayWorked: undefined as number | undefined,
          labourRateNgn: Number((line as { labourRateNgn?: number }).labourRateNgn || 0) || undefined,
        };
      });
    const sheet = buildPayrollAttendanceSheet({ rows: attendanceRows, canViewCosts: true });
    const map = new Map<string, PayrollAttendanceSheetRow>();
    for (const row of sheet) {
      map.set(upper(row.empCode), row);
      map.set(upper(`${row.firstName} ${row.lastName}`), row);
    }
    return map;
  } catch (error) {
    console.warn('[OfficialExcel] Dayrate attendance load skipped:', error instanceof Error ? error.message : error);
    return new Map<string, PayrollAttendanceSheetRow>();
  }
};

export const buildOfficialDayrateScheduleWorksheets = async (
  records: PayrollCalculationRecord[],
  options?: { period?: string; periodLabel?: string; directoryEmployees?: DirectoryEnrichment[] },
): Promise<ExcelWorksheetInput[]> => {
  const period = options?.period || '';
  const periodLabel = options?.periodLabel || period || 'Payroll Period';
  const dirMap = directoryByKeys(options?.directoryEmployees || []);
  const dayrate = records
    .filter((record) => record.isDailyRate || upper(record.employmentType).includes('DAILY'))
    .map((record) => enrich(record, dirMap.get(upper(record.employeeCode)) || dirMap.get(upper(record.employeeId))));
  const attendance = period ? await loadDayrateAttendanceByEmpCode(period) : new Map<string, PayrollAttendanceSheetRow>();

  const dle = dayrate.filter((record) => record._companyBucket === 'DLE');
  const dlpc = dayrate.filter((record) => record._companyBucket === 'DLPC');

  const summaryRows: ExcelCell[][] = [
    ['DLENG', dle.length, roundMoney(dle.reduce((sum, row) => sum + Number(row.grossPay || 0), 0)), roundMoney(dle.reduce((sum, row) => sum + Number(row.netPay || 0), 0))],
    ['DLPC', dlpc.length, roundMoney(dlpc.reduce((sum, row) => sum + Number(row.grossPay || 0), 0)), roundMoney(dlpc.reduce((sum, row) => sum + Number(row.netPay || 0), 0))],
    [
      'Total',
      dle.length + dlpc.length,
      roundMoney(dayrate.reduce((sum, row) => sum + Number(row.grossPay || 0), 0)),
      roundMoney(dayrate.reduce((sum, row) => sum + Number(row.netPay || 0), 0)),
    ],
  ];

  return [
    {
      title: `DAILY RATE PAYMENT SCHEDULE SUMMARY (${periodLabel})`,
      subtitle: 'Official dayrate company summary',
      sheetName: 'SUMMARY',
      columns: ['Company', 'Headcount', 'Gross pay', 'Net pay'],
      rows: summaryRows,
    },
    buildDayrateDetailSheet(dle, attendance, 'DLE', periodLabel),
    buildDayrateDetailSheet(dlpc, attendance, 'DLPC', periodLabel),
    ...buildOfficialBankScheduleWorksheets(dayrate, {
      periodLabel,
      titlePrefix: 'Dayrate Bank Schedule',
      mode: 'company',
    }),
  ];
};

export const buildOfficialPayrollExcelWorksheets = async (input: {
  report: string;
  pack?: string | null;
  period: string;
  periodLabel: string;
  salariedRecords: PayrollCalculationRecord[];
  dayrateRecords: PayrollCalculationRecord[];
  directoryEmployees?: DirectoryEnrichment[];
}): Promise<ExcelWorksheetInput[]> => {
  const report = compact(input.report) || 'payroll-register';
  const pack = compact(input.pack) || 'salaried';

  if (report === 'bank-schedule' || report === 'bank-payment-report') {
    if (pack === 'daily-rate') {
      return buildOfficialBankScheduleWorksheets(input.dayrateRecords, {
        periodLabel: input.periodLabel,
        titlePrefix: 'Dayrate Bank Schedule',
        mode: 'company',
      });
    }
    if (pack === 'all') {
      return [
        ...buildOfficialBankScheduleWorksheets(input.salariedRecords, {
          periodLabel: input.periodLabel,
          titlePrefix: 'Salaried Bank Schedule',
          mode: 'staff-packs',
        }),
        ...buildOfficialBankScheduleWorksheets(input.dayrateRecords, {
          periodLabel: input.periodLabel,
          titlePrefix: 'Dayrate Bank Schedule',
          mode: 'company',
        }),
      ];
    }
    return buildOfficialBankScheduleWorksheets(input.salariedRecords, {
      periodLabel: input.periodLabel,
      titlePrefix: 'Salaried Bank Schedule',
      mode: 'staff-packs',
    });
  }

  if (report === 'dayrate-schedule') {
    return buildOfficialDayrateScheduleWorksheets(input.dayrateRecords, {
      period: input.period,
      periodLabel: input.periodLabel,
      directoryEmployees: input.directoryEmployees,
    });
  }

  if (report === 'payroll-detail' || report === 'payroll-register' || report === 'salary-analysis') {
    if (pack === 'daily-rate') {
      return buildOfficialDayrateScheduleWorksheets(input.dayrateRecords, {
        period: input.period,
        periodLabel: input.periodLabel,
        directoryEmployees: input.directoryEmployees,
      });
    }
    if (pack === 'all') {
      const salariedSheets = buildOfficialSalariedDetailWorksheets(input.salariedRecords, {
        periodLabel: input.periodLabel,
        directoryEmployees: input.directoryEmployees,
      });
      const dayrateSheets = await buildOfficialDayrateScheduleWorksheets(input.dayrateRecords, {
        period: input.period,
        periodLabel: input.periodLabel,
        directoryEmployees: input.directoryEmployees,
      });
      return [...salariedSheets, ...dayrateSheets];
    }
    return buildOfficialSalariedDetailWorksheets(input.salariedRecords, {
      periodLabel: input.periodLabel,
      directoryEmployees: input.directoryEmployees,
    });
  }

  return [];
};

export const isOfficialPayrollExcelReport = (report: string) =>
  ['bank-schedule', 'bank-payment-report', 'payroll-register', 'payroll-detail', 'salary-analysis', 'dayrate-schedule'].includes(compact(report));
