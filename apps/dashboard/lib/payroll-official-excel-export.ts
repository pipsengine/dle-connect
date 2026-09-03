/**
 * Official payroll Excel workbooks matching finance/HR sample layouts:
 * - Salaried salary schedule: DLE_AUGUST 2026 SALARY SCHEDULE
 *   Summary + PERM.STAFF + CONT. STAFF + company×PERM/CONT bank tabs + USD REPORT / USD BANK SCHD
 * - Dayrate bank schedule: DLE/DLPC BANK SCHD (Employee Bank Details)
 * - Dayrate schedule: DAYRATE PAYMENT SCHEDULE → SUMMARY + DLE/DLPC + bank sheets
 */
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import type { ExcelCell, ExcelWorksheetInput } from '@/lib/excel-export';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import {
  BANK_SCHEDULE_NGN_STAFF_PACKS,
  BANK_SCHEDULE_USD_STAFF_PACK,
  bankScheduleDisplayEmployeeCode,
  isDleUsdPayrollEmployee,
  resolveBankScheduleStaffPack,
  type BankScheduleStaffPack,
} from '@/lib/payroll-bank-schedule-packs';
import { buildPayrollAttendanceSheet, type PayrollAttendanceSheetRow } from '@/lib/timesheet-payroll-attendance-sheet';
import { isTimesheetCountableForPayroll, readTimesheetData } from '@/lib/timesheet-entry-store';
import { resolvePayrollCompany, type PayrollCompany } from '@/lib/payroll-schedule-scope';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

export type OfficialCompanyBucket = PayrollCompany;

export const resolveOfficialCompanyBucket = (record: {
  payrollGroup?: string | null;
  businessUnit?: string | null;
  location?: string | null;
  companyCode?: string | null;
  companyName?: string | null;
  department?: string | null;
}): OfficialCompanyBucket => resolvePayrollCompany(record);

export const officialCompanySummaryLabel = (bucket: OfficialCompanyBucket) => (bucket === 'DLPC' ? 'DLPC' : 'DLENG');

const splitPersonName = (
  fullName: string,
  firstName?: string | null,
  lastName?: string | null,
  middleName?: string | null,
) => {
  if (compact(firstName) || compact(lastName)) {
    return {
      firstName: compact(firstName) || compact(fullName),
      lastName: compact(lastName),
      secondName: compact(middleName),
    };
  }
  const cleaned = compact(fullName).replace(/^(Mr|Mrs|Miss|Ms|Dr|Engr)\.?\s+/i, '');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '', secondName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1], secondName: '' };
  return { firstName: parts[0], secondName: parts[1], lastName: parts.slice(2).join(' ') };
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
  if (/^N\d|^NYSC|^IT\d|^I\d/i.test(code) || /NYSC|INTERN|IT\b|STIPEND/.test(type)) return 'Intern';
  if (/LUMPSUM|CONTRACT/.test(type) || /^L\d/i.test(code)) return 'Lumpsum';
  return compact(record.employmentType) || 'Lumpsum';
};

/** USD REPORT / USD BANK SCHD: Sage-style numeric code with trailing underscore. */
const usdOfficialEmployeeCode = (record: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId'>) => {
  const code = officialEmployeeCode(record).replace(/_+$/, '');
  return code ? `${code}_` : '';
};

const compareOfficialCode = (
  a: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId'>,
  b: Pick<PayrollCalculationRecord, 'employeeCode' | 'employeeId'>,
) => officialEmployeeCode(a).localeCompare(officialEmployeeCode(b), undefined, { numeric: true, sensitivity: 'base' });

const compareContSchedule = (a: PayrollCalculationRecord, b: PayrollCalculationRecord) => {
  const rank = (record: PayrollCalculationRecord) => (contTypeOf(record) === 'Intern' ? 1 : 0);
  const byType = rank(a) - rank(b);
  if (byType !== 0) return byType;
  return compareOfficialCode(a, b);
};

const roleBlob = (record: { jobTitle?: string | null; fullName?: string | null; employmentType?: string | null; payrollGroup?: string | null; department?: string | null }) =>
  `${record.jobTitle || ''} ${record.fullName || ''} ${record.employmentType || ''} ${record.payrollGroup || ''} ${record.department || ''}`;

const isMdRole = (record: { jobTitle?: string | null; fullName?: string | null }) =>
  /\bMANAGING DIRECTOR\b|\bMD\s*\/\s*CEO\b|\bCHIEF EXECUTIVE\b/.test(upper(roleBlob(record)));

const isGmOpsRole = (record: { jobTitle?: string | null }) =>
  /GENERAL MANAGER[, ]*OPERATIONS|\bGM[, ]*OPS\b|\bGM OPERATIONS\b/.test(upper(record.jobTitle));

const isMubassRole = (record: { employmentType?: string | null; payrollGroup?: string | null; department?: string | null; fullName?: string | null }) =>
  /MUBASS|OUTSOURCE/.test(upper(roleBlob(record)));

const isNayakRole = (record: { fullName?: string | null; jobTitle?: string | null }) =>
  /NAYAK/.test(upper(`${record.fullName || ''} ${record.jobTitle || ''}`));

const isUsdGmSpCfoRole = (record: { jobTitle?: string | null; fullName?: string | null }) =>
  !isMdRole(record) && !isNayakRole(record);

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
  | 'middleName'
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
  const names = splitPersonName(
    record.fullName || dir?.fullName || '',
    dir?.firstName,
    dir?.lastName,
    dir?.middleName,
  );
  const companyBucket = resolveOfficialCompanyBucket({
    payrollGroup: record.payrollGroup,
    businessUnit: record.businessUnit || dir?.businessUnit,
    location: record.location || dir?.location,
    companyCode: record.companyCode || dir?.companyCode,
    companyName: record.companyName || dir?.companyName,
    department: record.department || dir?.department,
  });
  const computedAge = ageFromDob(dir?.dateOfBirth);
  const ageValue = Number(dir?.age || 0) || (typeof computedAge === 'number' ? computedAge : Number(computedAge) || 0);
  return {
    ...record,
    _firstName: names.firstName,
    _lastName: names.lastName,
    _secondName: names.secondName,
    _gender: compact(dir?.gender),
    _dob: compact(dir?.dateOfBirth).slice(0, 10),
    _dateJoined: compact(dir?.dateJoined).slice(0, 10),
    _age: ageValue > 0 ? ageValue : '',
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

const bankEmployeeName = (record: Enriched | PayrollCalculationRecord) => {
  if ('_lastName' in record) {
    const named = compact([record._lastName, record._firstName, record._secondName].filter(Boolean).join(' '));
    if (named) return named;
  }
  return compact(record.fullName);
};

/** —— Bank schedule —— */
export type OfficialExportCurrencyScope = 'ngn' | 'usd' | 'all';

const normalizeExportCurrencyScope = (value?: string | null): OfficialExportCurrencyScope => {
  const token = compact(value).toLowerCase();
  if (token === 'usd' || token === 'dle-usd' || token === 'dle_usd') return 'usd';
  if (token === 'all') return 'all';
  return 'ngn';
};

const filterRecordsByCurrencyScope = <T extends Pick<PayrollCalculationRecord, 'payCurrency' | 'payrollGroup'>>(
  records: T[],
  scope: OfficialExportCurrencyScope,
) => {
  if (scope === 'usd') return records.filter((record) => isDleUsdPayrollEmployee(record));
  if (scope === 'ngn') return records.filter((record) => !isDleUsdPayrollEmployee(record));
  return records;
};

export const buildOfficialBankScheduleWorksheets = (
  records: PayrollCalculationRecord[],
  options?: {
    periodLabel?: string;
    titlePrefix?: string;
    /** staff-packs = Permanent / Contract Lumpsum / IT NYSC (+ optional DLE USD); company = DLE/DLPC; salary-schedule = DLE/DLPC × PERM/CONT + USD BANK SCHD */
    mode?: 'staff-packs' | 'company' | 'salary-schedule';
    /** Default ngn — DLE_USD never mixes into NGN packs. Use usd for the separate DLE USD export. */
    currencyScope?: OfficialExportCurrencyScope | string | null;
    /** Append trailing aggregate row with employee code = headcount, AUGUST sample format. */
    appendCompanyTotalRow?: boolean;
    /**
     * In company-mode, overrides any bucket-filtering and uses THESE EXACT RECORD LISTS per bucket.
     * Use this when the detail sheet and bank sheet MUST have exactly the same set of employees,
     * in exactly the same order, with exactly the same headcount — so detail-headcount, bank-headcount,
     * and SUMMARY.headcount all agree to the same integer (no payable() exclusion drift).
     */
    enforceCompanyBucketsFrom?: Array<{ bucket: OfficialCompanyBucket; records: PayrollCalculationRecord[] }>;
    /** When set, only that company's bank sheets are written (DLE Salaries vs DLPC Salaries). */
    company?: PayrollCompany | null;
  },
): ExcelWorksheetInput[] => {
  const periodLabel = options?.periodLabel || 'Payroll Period';
  const mode = options?.mode || 'staff-packs';
  const currencyScope = normalizeExportCurrencyScope(options?.currencyScope);
  const scopedRecords = filterRecordsByCurrencyScope(records, currencyScope);
  const payable = (record: PayrollCalculationRecord) =>
    Number(record.netPay || 0) !== 0 || compact(record.accountNo);

  if (mode === 'company') {
    const configs: Array<{
      bucket: OfficialCompanyBucket;
      sheetName: string;
      includeLocation: boolean;
      records: PayrollCalculationRecord[];
    }> = (() => {
      if (options?.enforceCompanyBucketsFrom?.length) {
        const byBucket = new Map<OfficialCompanyBucket, PayrollCalculationRecord[]>();
        for (const entry of options.enforceCompanyBucketsFrom) byBucket.set(entry.bucket, entry.records);
        return [
          { bucket: 'DLE' as OfficialCompanyBucket, sheetName: 'DLE BANK SCHD', includeLocation: false, records: byBucket.get('DLE') || [] },
          { bucket: 'DLPC' as OfficialCompanyBucket, sheetName: 'DLPC.BANK.SCHD', includeLocation: true, records: byBucket.get('DLPC') || [] },
        ];
      }
      const dle = scopedRecords.filter((r) => resolveOfficialCompanyBucket(r) === 'DLE').filter(payable);
      const dlpc = scopedRecords.filter((r) => resolveOfficialCompanyBucket(r) === 'DLPC').filter(payable);
      return [
        { bucket: 'DLE' as OfficialCompanyBucket, sheetName: 'DLE BANK SCHD', includeLocation: false, records: dle },
        { bucket: 'DLPC' as OfficialCompanyBucket, sheetName: 'DLPC.BANK.SCHD', includeLocation: true, records: dlpc },
      ];
    })().filter((config) => {
      if (!config.records.length) return false;
      if (options?.company === 'DLPC') return config.bucket === 'DLPC';
      if (options?.company === 'DLE') return config.bucket === 'DLE';
      return true;
    });

    return configs.map((config) => {
      const headcount = config.records.length;
      const rows = config.records.map((record) => {
        const base: ExcelCell[] = [
          officialEmployeeCode(record),
          compact(record.fullName),
          compact(record.bankName),
          compact(record.accountNo),
          compact(record.sortCode || record.branchCode || record.bankCode),
          roundMoney(Number(record.netPay || 0)),
        ];
        if (config.includeLocation) base.push(compact(record.location));
        return base;
      });

      if (options?.appendCompanyTotalRow) {
        const totalNet = roundMoney(config.records.reduce((sum, r) => sum + Number(r.netPay || 0), 0));
        const totalRow: ExcelCell[] = config.includeLocation
          ? [headcount, '', '', '', '', totalNet, '']
          : [headcount, '', '', '', '', totalNet];
        rows.push(totalRow);
      }

      const titleRow: ExcelCell[] = config.includeLocation
        ? ['Contractor Bank Details', '', '', '', '', '', '']
        : ['Contractor Bank Details', '', '', '', '', ''];
      const headerRow: string[] = config.includeLocation
        ? ['Contractor Code', 'Contractor Name', 'Bank', 'Account No', 'Sort Code', 'Amount Payable', 'Location']
        : ['Contractor Code', 'Contractor Name', 'Bank', 'Account No', 'Sort Code', 'Amount Payable'];
      return {
        title: config.sheetName || 'Employee Bank Details',
        sheetName: config.sheetName,
        columns: headerRow,
        rows: [titleRow, headerRow as unknown as ExcelCell[], ...rows],
        exactReferenceDayrateMode: true,
      };
    });
  }

  if (mode === 'salary-schedule') {
    const ngn = scopedRecords.filter((record) => !record.isDailyRate && !isDleUsdPayrollEmployee(record));
    const usd = scopedRecords.filter((record) => !record.isDailyRate && isDleUsdPayrollEmployee(record));
    const permanent = ngn.filter((record) => !isContractOrStipend(record)).slice().sort(compareOfficialCode);
    const contract = ngn.filter((record) => isContractOrStipend(record)).slice().sort(compareContSchedule);
    const configs: Array<{ sheetName: string; records: PayrollCalculationRecord[]; usd?: boolean }> = [];
    if (currencyScope !== 'usd') {
      const permDlpc = permanent.filter((record) => resolveOfficialCompanyBucket(record) === 'DLPC');
      const permDle = permanent.filter((record) => resolveOfficialCompanyBucket(record) === 'DLE');
      const contDle = contract.filter((record) => resolveOfficialCompanyBucket(record) === 'DLE');
      const contDlpc = contract.filter((record) => resolveOfficialCompanyBucket(record) === 'DLPC');
      if (permDlpc.length) configs.push({ sheetName: 'DLPC.PERM.BANK.SCHD', records: permDlpc });
      if (permDle.length) configs.push({ sheetName: 'DLE.PERM.BANK.SCHD', records: permDle });
      if (contDle.length) configs.push({ sheetName: 'DLE.CONT.BANK.SCHD', records: contDle });
      if (contDlpc.length) configs.push({ sheetName: 'DLPC.CONT.BANK.SCHD', records: contDlpc });
    }
    if (currencyScope !== 'ngn' && usd.length) {
      if (options?.company !== 'DLPC') configs.push({ sheetName: 'USD BANK SCHD', records: usd.slice().sort(compareOfficialCode), usd: true });
    }
    if (options?.company === 'DLPC') {
      const dlpcOnly = configs.filter((config) => /DLPC/i.test(config.sheetName));
      configs.length = 0;
      configs.push(...dlpcOnly);
    } else if (options?.company === 'DLE') {
      const dleOnly = configs.filter((config) => !/DLPC/i.test(config.sheetName));
      configs.length = 0;
      configs.push(...dleOnly);
    }
    const columns = ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'];
    return configs.map((config) => {
      const rows = config.records.map((record) => [
        config.usd ? usdOfficialEmployeeCode(record) : officialEmployeeCode(record),
        bankEmployeeName(record),
        compact(record.bankName),
        compact(record.accountNo),
        compact(record.sortCode || record.branchCode || record.bankCode),
        roundMoney(Number(record.netPay || 0)),
        compact(record.location),
      ] as ExcelCell[]);
      const totalNet = roundMoney(config.records.reduce((sum, record) => sum + Number(record.netPay || 0), 0));
      rows.push([config.records.length, '', '', '', '', totalNet, '']);
      return {
        title: 'Employee Bank Details',
        sheetName: config.sheetName,
        columns,
        rows,
        exactReferenceDayrateMode: true,
        banner: 'Employee Bank Details',
      };
    });
  }

  const packs = currencyScope === 'usd'
    ? [BANK_SCHEDULE_USD_STAFF_PACK]
    : currencyScope === 'all'
      ? [...BANK_SCHEDULE_NGN_STAFF_PACKS, BANK_SCHEDULE_USD_STAFF_PACK]
      : BANK_SCHEDULE_NGN_STAFF_PACKS;

  return packs.map((pack) => {
    const packId = pack.id as BankScheduleStaffPack;
    const rows = scopedRecords
      .filter((record) => !record.isDailyRate)
      .filter((record) => resolveBankScheduleStaffPack(record) === packId)
      .filter(payable)
      .map((record) => [
        bankScheduleDisplayEmployeeCode(record, packId === 'dle-usd' ? 'permanent' : packId),
        compact(record.fullName),
        compact(record.bankName),
        compact(record.accountNo),
        compact(record.sortCode || record.branchCode || record.bankCode),
        roundMoney(Number(record.netPay || 0)),
        compact(record.location),
      ] as ExcelCell[]);
    const columns: string[] = ['Employee Code', 'Employee Name', 'Bank', 'Account No', 'Sort Code', 'NET Salary', 'Location'];
    const titleRow: ExcelCell[] = ['Employee Bank Details', '', '', '', '', '', ''];
    const headerRow = columns.slice();
    return {
      title: 'Employee Bank Details',
      subtitle: `${options?.titlePrefix || 'Bank Payment Schedule'} · ${periodLabel} · ${pack.label}`,
      sheetName: pack.sheetName,
      columns,
      rows: [titleRow, headerRow as unknown as ExcelCell[], ...rows],
    };
  });
};

/** —— Salaried / stipend salary schedule (PERM.STAFF / CONT. STAFF / USD REPORT layout) —— */
type DeductionColumnDef = { label: string; pattern: RegExp; fallback?: (r: Enriched) => number };

const EARNING_PATTERN_BY_LABEL: Record<string, RegExp> = {
  'ARREARS (Earning)': /^ARREARS$/i,
  'BASIC SALARY (Earning)': /(?<!EXP_.{0,30})(BASIC(?!1_LUMPSUM)|SNM_BASIC|MD BASIC)/i,
  'FURNITURE (Earning)': /^FURNITURE$/i,
  'FURNITURE ALLOWANCE (Earning)': /FURNITURE ALLOW/i,
  'HOUSING (Earning)': /^(HOUSING|SNMHOUSING)(?!.*EXP)/i,
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
  'TRANSPORT ALLOWANCE (Earning)': /TRANSPORT ALLOW|(?<!EXP_.{0,20})(?<!SNM)(?<!TCM)(?<!WEEKLY)^TRANS/i,
  'UTILITIES (Earning)': /^UTILITIES$/i,
  'UTILITY (Earning)': /^UTILITY$/i,
  'Weekly Transport ': /WEEKLY TRANSPORT|TRANSPORT_WK/i,
  'Weekly Transport': /WEEKLY TRANSPORT|TRANSPORT_WK/i,
  'EXP_ SMGT BASIC (Earning)': /EXP_?\s*SMGT BASIC|EXP_BASIC/i,
  'EXP_ SMGT OTHER ALLOWANCE (Earning)': /EXP_?\s*SMGT OTHER|EXP_OTHALL/i,
  'EXP_SMGT HOUSING (Earning)': /EXP_SMGT HOUSING|EXP_HOUSING/i,
  'EXP_SNMG TRANSPORT (Earning)': /EXP_SNMG TRANSPORT|EXP_TRANSP/i,
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
  'MEAL (Earning)',
  'Meal Allowance (Earning)',
  'MEDICAL (Earning)',
  'OTHER ALLOWANCE (Earning)',
  'OVERTIME (Earning)',
  'PENSION REFUND (Earning)',
  'SENIOR MANAGEMENT HOUSING_TAX (Earning)',
  'SENIOR MANAGEMENT OTHER ALLOWANCE_T (Earning)',
  'SENIOR MANAGER TRANSPORT (Earning)',
  'SITE ALLOWANCE (Earning)',
  'SNR UNION (Earning)',
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
  'SITE ALLOWANCE (Earning)',
  'TCM TRANSPORT (Earning)',
  'Weekly Transport ',
] as const;

const USD_EARNING_LABELS = [
  'BASIC SALARY (Earning)',
  'EXP_ SMGT BASIC (Earning)',
  'EXP_ SMGT OTHER ALLOWANCE (Earning)',
  'EXP_SMGT HOUSING (Earning)',
  'EXP_SNMG TRANSPORT (Earning)',
] as const;

const PERM_DEDUCTION_COLUMNS: DeductionColumnDef[] = [
  { label: 'NHF - National Housing Fund (Deduction)', pattern: /^NHF$/i },
  { label: 'PAYE Tax (Deduction)', pattern: /^PAYE$/i, fallback: (r) => Number(r.paye || 0) },
  { label: 'Column2', pattern: /^COLUMN2$/i },
  { label: 'Pension (Deduction)', pattern: /^PENSION_EE$|^PENSION$/i, fallback: (r) => Number(r.pensionEmployee || r.pension || 0) },
  { label: 'PENSION EE2 (Deduction)', pattern: /PENSION_EE2|VOLPENS|ADDITIONAL EMPLOYEE PENSION/i },
  { label: 'UNION DUES (Deduction)', pattern: /UNION/i },
];

const CONT_DEDUCTION_COLUMNS: DeductionColumnDef[] = [
  { label: 'PAYE Tax (Deduction)', pattern: /^PAYE$/i, fallback: (r) => Number(r.paye || 0) },
];

const PERM_TAIL_COLUMNS = [
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
  'RENT (Provisions)',
  'Provisions Total',
  'Period Salary',
  'Annual Salary',
  'Gross Earnings',
  'Net Pay',
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
  if (record.isDailyRate || total <= 0) return { itf: 0, nsitf: 0 };
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

const companyGroupFooter = (records: Enriched[]): ExcelCell[][] => {
  const buckets = new Map<string, Enriched[]>();
  for (const record of records) {
    const label = compact(record._companyHa) || 'Unassigned';
    const list = buckets.get(label) || [];
    list.push(record);
    buckets.set(label, list);
  }
  const rows: ExcelCell[][] = [
    [],
    ['', 'Row Labels', 'Count of Company (HA)', 'Sum of Gross Earnings', 'Sum of Net Pay'],
  ];
  let totalGross = 0;
  let totalNet = 0;
  for (const [label, list] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const gross = roundMoney(list.reduce((sum, record) => sum + Number(record.grossPay || 0), 0));
    const net = roundMoney(list.reduce((sum, record) => sum + Number(record.netPay || 0), 0));
    totalGross = roundMoney(totalGross + gross);
    totalNet = roundMoney(totalNet + net);
    rows.push(['', label, list.length, gross, net]);
  }
  rows.push(['', 'Grand Total', records.length, totalGross, totalNet]);
  return rows;
};

const padRow = (values: ExcelCell[], width: number): ExcelCell[] => {
  const next = values.slice();
  while (next.length < width) next.push('');
  return next;
};

const buildSalariedSheet = (
  records: Enriched[],
  sheetName: 'PERM.STAFF' | 'CONT. STAFF',
  periodLabel: string,
): ExcelWorksheetInput => {
  const isPerm = sheetName === 'PERM.STAFF';
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
    'Earning Total',
    ...deductionColumns.map((item) => item.label),
    isPerm ? 'Deduction total' : 'Deduction Total',
    ...(isPerm ? PERM_TAIL_COLUMNS : CONT_TAIL_COLUMNS),
  ];

  const dataRows = records.map((record) => {
    const earningTotal = roundMoney((record.earningLines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0))
      || roundMoney(Number(record.grossPay || 0));
    const deductionTotal = roundMoney(Number(record.totalDeductions || record.deductions || 0));
    const { itf, nsitf } = splitEmployerStatutory(record);
    const pensionEr = roundMoney(Number(record.pensionEmployer || 0));
    const usdEr = record.payCurrency === 'USD' ? pensionEr : 0;
    const companyTotal = roundMoney(itf + nsitf + pensionEr);
    const rentProvision = 0;
    const lifeAssuranceProvision = 0;
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
    values.push(earningTotal);

    for (const column of deductionColumns) {
      if (column.label === 'Column2') {
        values.push('');
        continue;
      }
      const fromLines = lineAmount(record.deductionLines, column.pattern);
      values.push(fromLines || (column.fallback ? roundMoney(column.fallback(record)) : 0));
    }
    values.push(deductionTotal);

    if (isPerm) {
      const provisionsTotal = roundMoney(lifeAssuranceProvision + rentProvision);
      values.push(
        itf,
        nsitf,
        record.payCurrency === 'USD' ? 0 : pensionEr,
        usdEr,
        companyTotal,
        lifeAssuranceProvision,
        rentProvision,
        provisionsTotal,
        periodSalary,
        roundMoney(periodSalary * 12),
        roundMoney(Number(record.grossPay || 0)),
        roundMoney(Number(record.netPay || 0)),
        ...haTailValues(record),
      );
    } else {
      values.push(
        rentProvision,
        rentProvision,
        periodSalary,
        roundMoney(periodSalary * 12),
        roundMoney(Number(record.grossPay || 0)),
        roundMoney(Number(record.netPay || 0)),
        ...haTailValues(record),
      );
    }

    return values;
  });

  const rows = [
    ...dataRows,
    padRow([records.length], columns.length),
    ...companyGroupFooter(records).map((row) => padRow(row, columns.length)),
  ];

  return {
    title: isPerm ? `Permanent Staff Payroll Detail - ${periodLabel}` : `Contract / Stipend Staff Payroll Detail - ${periodLabel}`,
    sheetName,
    columns,
    rows,
    exactReferenceDayrateMode: true,
  };
};

const usdEarningValue = (record: Enriched, label: string) => {
  if (label === 'BASIC SALARY (Earning)') {
    return lineAmount(record.earningLines, /^(BASIC|BASIC SALARY|BASICPAY)$/i);
  }
  return earningValue(record, label);
};

const buildUsdReportSheet = (records: Enriched[], periodLabel: string): ExcelWorksheetInput => {
  const columns = [
    'Employee Code',
    'EmployeeSurname',
    'EmployeeFirstName',
    'EmployeeSecondName',
    'Age',
    'Date of Birth',
    'Gender',
    'Date Joined Group',
    'Job Title Long Description',
    ...USD_EARNING_LABELS,
    'Earning Total',
    'PAYE Tax (Deduction)',
    'Pension (Deduction)',
    'Deduction Total',
    'ITF Levy (CompanyContribution)',
    'NSITF - Nigeria Social Insurance Tr (CompanyContribution)',
    'CompanyContribution Total',
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
  ];

  const dataRows = records.map((record) => {
    const earningTotal = roundMoney((record.earningLines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0))
      || roundMoney(Number(record.grossPay || 0));
    const deductionTotal = roundMoney(Number(record.totalDeductions || record.deductions || 0));
    const { itf, nsitf } = splitEmployerStatutory(record);
    const periodSalary = roundMoney(Number(record.periodPackageGross || record.grossPay || 0));
    return [
      usdOfficialEmployeeCode(record),
      record._lastName,
      record._firstName,
      record._secondName,
      record._age,
      record._dob,
      record._gender,
      record._dateJoined,
      record._jobTitle,
      ...USD_EARNING_LABELS.map((label) => usdEarningValue(record, label)),
      earningTotal,
      lineAmount(record.deductionLines, /^PAYE$/i) || roundMoney(Number(record.paye || 0)),
      lineAmount(record.deductionLines, /^PENSION_EE$|^PENSION$/i) || roundMoney(Number(record.pensionEmployee || record.pension || 0)),
      deductionTotal,
      itf,
      nsitf,
      roundMoney(itf + nsitf),
      periodSalary,
      roundMoney(periodSalary * 12),
      roundMoney(Number(record.grossPay || 0)),
      roundMoney(Number(record.netPay || 0)),
      roundMoney(Number(record.taxablePay || record.grossPay || 0)),
      record._companyHa,
      record._departmentHa,
      record._employeeTypeHa,
      record._locationHa,
      record._pensionHa,
    ] as ExcelCell[];
  });

  const totalGross = roundMoney(records.reduce((sum, record) => sum + Number(record.grossPay || 0), 0));
  const totalNet = roundMoney(records.reduce((sum, record) => sum + Number(record.netPay || 0), 0));
  const totalRow = padRow([records.length], columns.length);
  const earningTotalIdx = columns.indexOf('Earning Total');
  const netIdx = columns.indexOf('Net Pay');
  if (earningTotalIdx >= 0) totalRow[earningTotalIdx] = totalGross;
  if (netIdx >= 0) totalRow[netIdx] = totalNet;

  return {
    title: `DLE USD Payroll Detail - ${periodLabel}`,
    sheetName: 'USD REPORT',
    columns,
    rows: [...dataRows, totalRow],
    exactReferenceDayrateMode: true,
  };
};

const periodMonthToken = (periodLabel: string) => {
  const match = compact(periodLabel).match(/January|February|March|April|May|June|July|August|September|October|November|December/i);
  return (match?.[0] || 'PERIOD').toUpperCase();
};

const summaryBucket = (list: PayrollCalculationRecord[]) => ({
  net: roundMoney(list.reduce((sum, record) => sum + Number(record.netPay || 0), 0)),
  count: list.length,
});

const summaryHasFigure = (list: PayrollCalculationRecord[]) => {
  const bucket = summaryBucket(list);
  return bucket.net !== 0 || bucket.count > 0;
};

const buildSalaryCostSummaryWorksheet = (input: {
  periodLabel: string;
  permanent: PayrollCalculationRecord[];
  contract: PayrollCalculationRecord[];
  dayrate: PayrollCalculationRecord[];
  usd: PayrollCalculationRecord[];
}): ExcelWorksheetInput => {
  const month = periodMonthToken(input.periodLabel);
  const columns = ['EMPLOYEE CATEGORY', `${month} (NGN)`, 'NO OF STAFF'];
  const ngnPermanent = input.permanent.filter((record) => !isMubassRole(record));
  const mubass = [...input.permanent, ...input.contract, ...input.dayrate].filter((record) => isMubassRole(record));
  const dleContract = [...input.contract, ...input.dayrate].filter((record) => resolveOfficialCompanyBucket(record) === 'DLE' && !isMubassRole(record));
  const dlpcContract = [...input.contract, ...input.dayrate].filter((record) => resolveOfficialCompanyBucket(record) === 'DLPC' && !isMubassRole(record));
  const md = ngnPermanent.filter((record) => isMdRole(record));
  const gmOps = ngnPermanent.filter((record) => isGmOpsRole(record) && !isMdRole(record));
  const dleStaff = ngnPermanent.filter((record) => resolveOfficialCompanyBucket(record) === 'DLE' && !isMdRole(record) && !isGmOpsRole(record));
  const dlpcStaff = ngnPermanent.filter((record) => resolveOfficialCompanyBucket(record) === 'DLPC' && !isMdRole(record) && !isGmOpsRole(record));
  const line = (label: string, list: PayrollCalculationRecord[]): ExcelCell[] => {
    const bucket = summaryBucket(list);
    return [label, bucket.net, bucket.count];
  };
  const maybeLine = (label: string, list: PayrollCalculationRecord[]) =>
    (summaryHasFigure(list) ? line(label, list) : null);
  const subtotal = [...dleContract, ...dlpcContract, ...dleStaff, ...dlpcStaff, ...gmOps, ...md];
  const grand = [...subtotal, ...mubass];
  const usdMd = input.usd.filter((record) => isMdRole(record));
  const usdNayak = input.usd.filter((record) => isNayakRole(record));
  const usdGm = input.usd.filter((record) => isUsdGmSpCfoRole(record));
  const ngnLines = [
    maybeLine('DLE Contract ', dleContract),
    maybeLine('DLPC Contract', dlpcContract),
    maybeLine('DLE Staff', dleStaff),
    maybeLine('Dlpc Staff', dlpcStaff),
    maybeLine('GM Ops', gmOps),
    maybeLine('MD', md),
  ].filter((row): row is ExcelCell[] => Boolean(row));
  const mubassLine = maybeLine('Mubass (Outsourced)', mubass);
  const usdLines = [
    maybeLine('GM Ops, Mgr SP & CFO', usdGm),
    maybeLine('MD ', usdMd),
    maybeLine('Nayak ', usdNayak),
  ].filter((row): row is ExcelCell[] => Boolean(row));
  const rows: ExcelCell[][] = [...ngnLines];
  if (mubassLine) {
    if (ngnLines.length) rows.push(['', summaryBucket(subtotal).net, '']);
    rows.push(mubassLine);
  }
  if (ngnLines.length || mubassLine) {
    rows.push(['GRAND TOTAL', summaryBucket(grand).net, summaryBucket(grand).count]);
  }
  if (usdLines.length) {
    if (rows.length) rows.push([]);
    rows.push(['USD', '', '']);
    rows.push(...usdLines);
    rows.push(['', summaryBucket(input.usd).net, summaryBucket(input.usd).count]);
  }
  return {
    title: 'PAYROLL COST - NET',
    sheetName: 'Summary',
    columns,
    rows,
    exactReferenceDayrateMode: true,
    banner: 'PAYROLL COST - NET',
  };
};

export const buildOfficialSalariedDetailWorksheets = (
  records: PayrollCalculationRecord[],
  options?: {
    periodLabel?: string;
    directoryEmployees?: DirectoryEnrichment[];
    /** Default all — NGN PERM/CONT plus USD REPORT in one salary-schedule workbook. */
    currencyScope?: OfficialExportCurrencyScope | string | null;
    dayrateRecords?: PayrollCalculationRecord[];
    includeSummary?: boolean;
    includeBankSheets?: boolean;
    company?: PayrollCompany | null;
  },
): ExcelWorksheetInput[] => {
  const currencyScope = normalizeExportCurrencyScope(options?.currencyScope);
  const company = options?.company || null;
  const dirMap = directoryByKeys(options?.directoryEmployees || []);
  const enrichOne = (record: PayrollCalculationRecord) =>
    enrich(record, dirMap.get(upper(record.employeeCode)) || dirMap.get(upper(record.employeeId)) || dirMap.get(upper(record.fullName)));
  const inCompany = (record: PayrollCalculationRecord) => !company || resolveOfficialCompanyBucket(record) === company;
  const salaried = records.filter((record) => !record.isDailyRate && inCompany(record));
  const ngn = filterRecordsByCurrencyScope(salaried, 'ngn').map(enrichOne);
  const usd = filterRecordsByCurrencyScope(salaried, 'usd').map(enrichOne);
  const periodLabel = options?.periodLabel || 'Payroll Period';
  const permanent = ngn.filter((record) => !isContractOrStipend(record)).slice().sort(compareOfficialCode);
  const contract = ngn.filter((record) => isContractOrStipend(record)).slice().sort(compareContSchedule);
  const usdSorted = usd.slice().sort(compareOfficialCode);
  const includeSummary = options?.includeSummary !== false;
  const includeBankSheets = options?.includeBankSheets !== false;

  if (currencyScope === 'usd') {
    const sheets: ExcelWorksheetInput[] = usdSorted.length ? [buildUsdReportSheet(usdSorted, periodLabel)] : [];
    if (includeBankSheets) {
      sheets.push(...buildOfficialBankScheduleWorksheets(salaried, {
        periodLabel,
        mode: 'salary-schedule',
        currencyScope: 'usd',
        company,
      }));
    }
    return sheets;
  }

  const sheets: ExcelWorksheetInput[] = [];
  if (includeSummary) {
    sheets.push(buildSalaryCostSummaryWorksheet({
      periodLabel,
      permanent,
      contract,
      dayrate: [],
      usd: currencyScope === 'ngn' ? [] : usdSorted,
    }));
  }
  sheets.push(buildSalariedSheet(permanent, 'PERM.STAFF', periodLabel));
  sheets.push(buildSalariedSheet(contract, 'CONT. STAFF', periodLabel));
  if (includeBankSheets) {
    const banks = buildOfficialBankScheduleWorksheets(salaried, {
      periodLabel,
      mode: 'salary-schedule',
      currencyScope,
      company,
    });
    const ngnBanks = banks.filter((sheet) => sheet.sheetName !== 'USD BANK SCHD');
    const usdBank = banks.filter((sheet) => sheet.sheetName === 'USD BANK SCHD');
    sheets.push(...ngnBanks);
    if (currencyScope !== 'ngn' && company !== 'DLPC' && usdSorted.length) {
      sheets.push(buildUsdReportSheet(usdSorted, periodLabel), ...usdBank);
    }
  } else if (currencyScope !== 'ngn' && company !== 'DLPC' && usdSorted.length) {
    sheets.push(buildUsdReportSheet(usdSorted, periodLabel));
  }
  return sheets;
};

/** —— Dayrate schedule (matches HR Dayrate Payment Schedule template) —— */
const DAYRATE_DLE_COLUMNS = [
  'Contractor Code',
  'First Name',
  'Last Name',
  'Job Title',
  'Location',
  'Daily Rate',
  'AGE',
  'Gender',
  'Total Weekday',
  'Weekday OVT',
  'Total Saturday',
  'Total Sunday',
  'Night Worked',
  'Wkd Earning',
  'Wkd Ovt Amt',
  'Sat Ovt Amt',
  'Sun Ovt Amt',
  'Night Amt',
  'Meal Allowance',
  'Transport',
  'Site Allowance',
  'TCM Meal',
  'TCM TRANSPORT',
  'Arrears',
  'Total Earnings',
  'WHT',
  'Gross Amount',
  'Amount Payable',
] as const;

const DAYRATE_DLPC_COLUMNS = [
  'Contractor Code',
  'First Name',
  'Last Name',
  'Job Title',
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
  'Total Earnings',
  'WHT',
  'Gross Amount',
  'Amount Payable',
] as const;

const buildDayrateDetailSheet = (
  records: Enriched[],
  attendance: Map<string, PayrollAttendanceSheetRow>,
  sheetName: 'DLE' | 'DLPC',
  periodLabel: string,
  options?: { appendTotalRow?: boolean },
): ExcelWorksheetInput => {
  const columns = sheetName === 'DLE' ? [...DAYRATE_DLE_COLUMNS] : [...DAYRATE_DLPC_COLUMNS];
  const headcount = records.length;
  const blankOr = (value: number | null | undefined) => {
    const num = Number(value || 0);
    return num === 0 ? '' : roundMoney(num);
  };
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
    const site = lineAmount(record.earningLines, /SITE ALLOW/i) || Number(att?.siteAllowanceTotal || 0);
    const tcmMeal = lineAmount(record.earningLines, /TCMMEAL/i);
    const tcmTransport = lineAmount(record.earningLines, /TCM.?TRANS/i);
    const arrears = lineAmount(record.earningLines, /ARREARS/i);
    const totalEarnings = roundMoney(Number(record.grossPay || 0))
      || roundMoney(wkdEarning + wkdOvtAmt + satAmt + sunAmt + phAmt + nightAmt + meal + transport + site + tcmMeal + tcmTransport + arrears);
    const wht = roundMoney(Number(record.paye || 0)) || roundMoney(totalEarnings * 0.05);
    const netPay = roundMoney(Number(record.netPay || 0)) || roundMoney(totalEarnings - wht);

    if (sheetName === 'DLE') {
      return [
        code,
        record._firstName || att?.firstName || '',
        record._lastName || att?.lastName || '',
        record._jobTitle || att?.jobTitle || '',
        record._location || att?.location || '',
        roundMoney(dailyRate),
        record._age || '',
        record._gender || '',
        weekDays,
        weekdayOvtHrs,
        satHrs,
        sunHrs,
        nightDays,
        roundMoney(wkdEarning),
        blankOr(wkdOvtAmt),
        blankOr(satAmt),
        blankOr(sunAmt),
        blankOr(nightAmt),
        roundMoney(meal),
        blankOr(transport),
        blankOr(site),
        blankOr(tcmMeal),
        blankOr(tcmTransport),
        blankOr(arrears),
        roundMoney(totalEarnings),
        roundMoney(wht),
        roundMoney(totalEarnings),
        roundMoney(netPay),
      ] as ExcelCell[];
    }

    return [
      code,
      record._firstName || att?.firstName || '',
      record._lastName || att?.lastName || '',
      record._jobTitle || att?.jobTitle || '',
      roundMoney(dailyRate),
      record._age || '',
      record._gender || '',
      weekDays,
      weekdayOvtHrs,
      satHrs,
      sunHrs,
      phHrs,
      nightDays,
      roundMoney(wkdEarning),
      blankOr(wkdOvtAmt),
      blankOr(satAmt),
      blankOr(sunAmt),
      blankOr(phAmt),
      blankOr(nightAmt),
      roundMoney(meal),
      blankOr(transport),
      roundMoney(totalEarnings),
      roundMoney(wht),
      roundMoney(totalEarnings),
      roundMoney(netPay),
    ] as ExcelCell[];
  });

  if (options?.appendTotalRow) {
    const empty = (_idx: number) => '';
    if (sheetName === 'DLE') {
      const totals = records.reduce(
        (acc, record) => {
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
          const nightAmt = lineAmount(record.earningLines, /NIGHT/i)
            || Number(att?.nightWorkedTotal || 0)
            || roundMoney(1100 * nightDays);
          const meal = lineAmount(record.earningLines, /^MEAL$|MEAL ALLOW|PER_MEAL/i)
            || roundMoney(500 * weekDays);
          const transport = lineAmount(record.earningLines, /TRANSPORT ALLOW|EXP_TRANS|^TRANSPORT$/i);
          const site = lineAmount(record.earningLines, /SITE ALLOW/i) || Number(att?.siteAllowanceTotal || 0);
          const tcmMeal = lineAmount(record.earningLines, /TCMMEAL/i);
          const tcmTransport = lineAmount(record.earningLines, /TCM.?TRANS/i);
          const arrears = lineAmount(record.earningLines, /ARREARS/i);
          const totalEarnings = Number(record.grossPay || 0)
            || wkdEarning + wkdOvtAmt + satAmt + sunAmt + nightAmt + meal + transport + site + tcmMeal + tcmTransport + arrears;
          const wht = Number(record.paye || 0) || totalEarnings * 0.05;
          const netPay = Number(record.netPay || 0) || totalEarnings - wht;
          return {
            dailyRate: acc.dailyRate + dailyRate,
            weekDays: acc.weekDays + weekDays,
            weekdayOvtHrs: acc.weekdayOvtHrs + weekdayOvtHrs,
            satHrs: acc.satHrs + satHrs,
            sunHrs: acc.sunHrs + sunHrs,
            nightDays: acc.nightDays + nightDays,
            wkdEarning: acc.wkdEarning + wkdEarning,
            wkdOvtAmt: acc.wkdOvtAmt + wkdOvtAmt,
            satAmt: acc.satAmt + satAmt,
            sunAmt: acc.sunAmt + sunAmt,
            nightAmt: acc.nightAmt + nightAmt,
            meal: acc.meal + meal,
            transport: acc.transport + transport,
            site: acc.site + site,
            tcmMeal: acc.tcmMeal + tcmMeal,
            tcmTransport: acc.tcmTransport + tcmTransport,
            arrears: acc.arrears + arrears,
            totalEarnings: acc.totalEarnings + totalEarnings,
            wht: acc.wht + wht,
            netPay: acc.netPay + netPay,
          };
        },
        {
          dailyRate: 0, weekDays: 0, weekdayOvtHrs: 0, satHrs: 0, sunHrs: 0, nightDays: 0,
          wkdEarning: 0, wkdOvtAmt: 0, satAmt: 0, sunAmt: 0, nightAmt: 0, meal: 0,
          transport: 0, site: 0, tcmMeal: 0, tcmTransport: 0, arrears: 0,
          totalEarnings: 0, wht: 0, netPay: 0,
        },
      );
      const row: ExcelCell[] = [
        headcount, empty(1), empty(2), empty(3), empty(4),
        roundMoney(totals.dailyRate),
        empty(6), empty(7),
        roundMoney(totals.weekDays),
        roundMoney(totals.weekdayOvtHrs),
        roundMoney(totals.satHrs),
        roundMoney(totals.sunHrs),
        roundMoney(totals.nightDays),
        roundMoney(totals.wkdEarning),
        blankOr(totals.wkdOvtAmt),
        blankOr(totals.satAmt),
        blankOr(totals.sunAmt),
        blankOr(totals.nightAmt),
        roundMoney(totals.meal),
        blankOr(totals.transport),
        blankOr(totals.site),
        blankOr(totals.tcmMeal),
        blankOr(totals.tcmTransport),
        blankOr(totals.arrears),
        roundMoney(totals.totalEarnings),
        roundMoney(totals.wht),
        roundMoney(totals.totalEarnings),
        roundMoney(totals.netPay),
      ];
      rows.push(row);
    } else {
      const totals = records.reduce(
        (acc, record) => {
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
          const totalEarnings = Number(record.grossPay || 0)
            || wkdEarning + wkdOvtAmt + satAmt + sunAmt + phAmt + nightAmt + meal + transport;
          const wht = Number(record.paye || 0) || totalEarnings * 0.05;
          const netPay = Number(record.netPay || 0) || totalEarnings - wht;
          return {
            dailyRate: acc.dailyRate + dailyRate,
            weekDays: acc.weekDays + weekDays,
            weekdayOvtHrs: acc.weekdayOvtHrs + weekdayOvtHrs,
            satHrs: acc.satHrs + satHrs,
            sunHrs: acc.sunHrs + sunHrs,
            phHrs: acc.phHrs + phHrs,
            nightDays: acc.nightDays + nightDays,
            wkdEarning: acc.wkdEarning + wkdEarning,
            wkdOvtAmt: acc.wkdOvtAmt + wkdOvtAmt,
            satAmt: acc.satAmt + satAmt,
            sunAmt: acc.sunAmt + sunAmt,
            phAmt: acc.phAmt + phAmt,
            nightAmt: acc.nightAmt + nightAmt,
            meal: acc.meal + meal,
            transport: acc.transport + transport,
            totalEarnings: acc.totalEarnings + totalEarnings,
            wht: acc.wht + wht,
            netPay: acc.netPay + netPay,
          };
        },
        {
          dailyRate: 0, weekDays: 0, weekdayOvtHrs: 0, satHrs: 0, sunHrs: 0, phHrs: 0, nightDays: 0,
          wkdEarning: 0, wkdOvtAmt: 0, satAmt: 0, sunAmt: 0, phAmt: 0, nightAmt: 0, meal: 0,
          transport: 0, totalEarnings: 0, wht: 0, netPay: 0,
        },
      );
      const row: ExcelCell[] = [
        headcount, empty(1), empty(2), empty(3),
        roundMoney(totals.dailyRate),
        empty(5), empty(6),
        roundMoney(totals.weekDays),
        roundMoney(totals.weekdayOvtHrs),
        roundMoney(totals.satHrs),
        roundMoney(totals.sunHrs),
        roundMoney(totals.phHrs),
        roundMoney(totals.nightDays),
        roundMoney(totals.wkdEarning),
        blankOr(totals.wkdOvtAmt),
        blankOr(totals.satAmt),
        blankOr(totals.sunAmt),
        blankOr(totals.phAmt),
        blankOr(totals.nightAmt),
        roundMoney(totals.meal),
        blankOr(totals.transport),
        roundMoney(totals.totalEarnings),
        roundMoney(totals.wht),
        roundMoney(totals.totalEarnings),
        roundMoney(totals.netPay),
      ];
      rows.push(row);
    }
  }

  return {
    title: sheetName,
    sheetName,
    columns,
    rows,
    exactReferenceDayrateMode: true,
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
  options?: { period?: string; periodLabel?: string; directoryEmployees?: DirectoryEnrichment[]; company?: PayrollCompany | null },
): Promise<ExcelWorksheetInput[]> => {
  const period = options?.period || '';
  const periodLabel = options?.periodLabel || period || 'Payroll Period';
  const dirMap = directoryByKeys(options?.directoryEmployees || []);
  const dayrate = records
    .filter((record) => record.isDailyRate || upper(record.employmentType).includes('DAILY'))
    .map((record) => enrich(record, dirMap.get(upper(record.employeeCode)) || dirMap.get(upper(record.employeeId))));
  const attendance = period ? await loadDayrateAttendanceByEmpCode(period) : new Map<string, PayrollAttendanceSheetRow>();

  const dleAll = dayrate.filter((record) => record._companyBucket === 'DLE');
  const dlpcAll = dayrate.filter((record) => record._companyBucket === 'DLPC');
  const dle = options?.company === 'DLPC' ? [] : dleAll;
  const dlpc = options?.company === 'DLE' ? [] : dlpcAll;

  const summaryPeriodLabel = /^([A-Z]+)\s+(\d{4})$/i.test(periodLabel.trim())
    ? periodLabel.trim()
    : /^([A-Z]+)\s+(\d{4})/i.exec(periodLabel)?.[0] || periodLabel.trim();

  const summaryTitleRow = [
    `${summaryPeriodLabel.toUpperCase()} DAYRATE PAYMENT SCHEDULE`,
    '',
    '',
    '',
  ] as ExcelCell[];
  const summaryHeaderRow: ExcelCell[] = ['COMPANY', 'HEADCOUNT', 'GROSS AMOUNT', 'AMOUNT PAYABLE'];
  const grossDle = roundMoney(dle.reduce((sum, row) => sum + Number(row.grossPay || 0), 0));
  const netDle = roundMoney(dle.reduce((sum, row) => sum + Number(row.netPay || 0), 0));
  const grossDlpc = roundMoney(dlpc.reduce((sum, row) => sum + Number(row.grossPay || 0), 0));
  const netDlpc = roundMoney(dlpc.reduce((sum, row) => sum + Number(row.netPay || 0), 0));
  const summaryRows: ExcelCell[][] = [
    summaryTitleRow,
    summaryHeaderRow,
    ...(dle.length ? [['DLE', dle.length, grossDle, netDle] as ExcelCell[]] : []),
    ...(dlpc.length ? [['DLPC', dlpc.length, grossDlpc, netDlpc] as ExcelCell[]] : []),
    ...(dle.length || dlpc.length
      ? [[
          'Total',
          dle.length + dlpc.length,
          roundMoney(grossDle + grossDlpc),
          roundMoney(netDle + netDlpc),
        ] as ExcelCell[]]
      : []),
  ];

  const dleDetail = buildDayrateDetailSheet(dle, attendance, 'DLE', periodLabel, { appendTotalRow: true });
  const dlpcDetail = buildDayrateDetailSheet(dlpc, attendance, 'DLPC', periodLabel, { appendTotalRow: true });
  const bankSheets = buildOfficialBankScheduleWorksheets([...dle, ...dlpc], {
    periodLabel,
    titlePrefix: 'Dayrate Bank Schedule',
    mode: 'company',
    appendCompanyTotalRow: true,
    company: options?.company,
    enforceCompanyBucketsFrom: [
      ...(dle.length ? [{ bucket: 'DLE' as const, records: dle }] : []),
      ...(dlpc.length ? [{ bucket: 'DLPC' as const, records: dlpc }] : []),
    ],
  });

  return [
    {
      title: 'SUMMARY',
      sheetName: 'SUMMARY',
      columns: ['COMPANY', 'HEADCOUNT', 'GROSS AMOUNT', 'AMOUNT PAYABLE'],
      rows: summaryRows,
      exactReferenceDayrateMode: true,
    },
    ...(dle.length ? [dleDetail] : []),
    ...(dlpc.length ? [dlpcDetail] : []),
    ...bankSheets,
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
  /** usd = USD REPORT + USD BANK SCHD only. Otherwise the full salary-schedule workbook for the period. */
  currencyScope?: OfficialExportCurrencyScope | string | null;
  company?: PayrollCompany | null;
}): Promise<ExcelWorksheetInput[]> => {
  const report = compact(input.report) || 'payroll-register';
  const pack = compact(input.pack) || 'salaried';
  const company = input.company || null;
  const requestedScope = compact(input.currencyScope).toLowerCase();
  const currencyScope = requestedScope === 'usd' || requestedScope === 'dle-usd' || requestedScope === 'dle_usd'
    ? 'usd'
    : requestedScope === 'ngn' || requestedScope === 'naira'
      ? 'ngn'
      : 'all';

  const salarySchedule = (scope: OfficialExportCurrencyScope) =>
    buildOfficialSalariedDetailWorksheets(input.salariedRecords, {
      periodLabel: input.periodLabel,
      directoryEmployees: input.directoryEmployees,
      currencyScope: scope,
      company,
    });

  if (report === 'bank-schedule' || report === 'bank-payment-report') {
    if (pack === 'daily-rate') {
      return buildOfficialBankScheduleWorksheets(input.dayrateRecords, {
        periodLabel: input.periodLabel,
        titlePrefix: 'Dayrate Bank Schedule',
        mode: 'company',
        company,
      });
    }
    if (currencyScope === 'usd') {
      return buildOfficialBankScheduleWorksheets(input.salariedRecords, {
        periodLabel: input.periodLabel,
        titlePrefix: 'DLE USD Bank Schedule',
        mode: 'salary-schedule',
        currencyScope: 'usd',
        company: company || 'DLE',
      });
    }
    return buildOfficialBankScheduleWorksheets(input.salariedRecords, {
        periodLabel: input.periodLabel,
        titlePrefix: 'Salaried Bank Schedule',
        mode: 'salary-schedule',
        currencyScope,
        company,
      });
  }

  if (report === 'dayrate-schedule') {
    return buildOfficialDayrateScheduleWorksheets(input.dayrateRecords, {
      period: input.period,
      periodLabel: input.periodLabel,
      directoryEmployees: input.directoryEmployees,
      company,
    });
  }

  if (report === 'payroll-detail' || report === 'payroll-register' || report === 'salary-analysis') {
    if (pack === 'daily-rate') {
      return buildOfficialDayrateScheduleWorksheets(input.dayrateRecords, {
        period: input.period,
        periodLabel: input.periodLabel,
        directoryEmployees: input.directoryEmployees,
        company,
      });
    }
    return salarySchedule(currencyScope);
  }

  return [];
};

export const isOfficialPayrollExcelReport = (report: string) =>
  ['bank-schedule', 'bank-payment-report', 'payroll-register', 'payroll-detail', 'salary-analysis', 'dayrate-schedule'].includes(compact(report));
