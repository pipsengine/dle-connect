import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importSagePayrollEmployeesToDb, loadWorkspaceEnv, readEmployeeDirectoryFromDb, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { isDailyRatePayrollEmployee, markInactiveNonDailyContractEmployees, payrollActiveEmployees, withContractPayrollClassification } from '@/lib/payroll-employee-classification';
import { applyPayrollEmployeeOptions } from '@/lib/payroll-employee-options-store';
import { isGenericPayrollGrade } from '@/lib/payroll-earnings-engine';
import { payslipIdentityMap } from '@/lib/payroll-payslip-identity-store';
import { normalizePayrollMatchKey, readActiveSagePayrollEmployeesWithLatestPayslipLines, readSagePayrollEmployeeBankDetails } from '@/lib/sage-people-payroll-store';
import {
  buildSagePayrollContributionsFromLines,
  buildSagePayrollDeductionsFromLines,
} from '@/lib/sage-payroll-line-parser';

export type PayrollEmployeeSource = {
  employees: DleEmployeeDirectoryRow[];
  source: 'DLE_Enterprise HRIS' | 'Local HRIS payroll cache';
  databaseAvailable: boolean;
  warning: string | null;
};

type EmployeeSourceCache = {
  value?: PayrollEmployeeSource;
  expiresAt: number;
  staleUntil: number;
  pending?: Promise<PayrollEmployeeSource>;
};

export const payrollDataSourceInfo = (source: PayrollEmployeeSource) => ({
  source: source.source,
  databaseAvailable: source.databaseAvailable,
  warning: source.warning,
  employeeCount: source.employees.length,
});

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_ROOT = path.join(resolveDashboardRoot(), 'data', 'hris');
const str = (value: unknown) => String(value || '').trim();
const isTemporaryPfCode = (value: unknown) => /^PF\d+/i.test(str(value).replace(/[^a-z0-9]/gi, ''));
const EXCLUDED_PAYROLL_EMPLOYEE_KEYS = new Set(['P0000', 'PHUGHES', 'IT0092']);
const employeeKey = (value: unknown) => str(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const isExcludedFromHrisPayroll = (employee: Pick<DleEmployeeDirectoryRow, 'employeeId' | 'employeeCode' | 'sourceEmployeeId' | 'fullName'>) =>
  [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId].some((value) => EXCLUDED_PAYROLL_EMPLOYEE_KEYS.has(employeeKey(value)))
  || employeeKey(employee.employeeCode).startsWith('PF');
const moneyFromRate = (rate: number) => (Number.isFinite(rate) && rate > 0 ? rate * 22 : 0);
const moneyOrNull = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const moneyFrom = (...values: unknown[]) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};
const dailyRateCode = (value: unknown) => /^C\d+/i.test(str(value));
const dailyWorkingDays = (hoursPerDay: number, hoursPerPeriod: unknown) => {
  const periodHours = Number(hoursPerPeriod || 0);
  return Number.isFinite(periodHours) && periodHours > 0 && hoursPerDay > 0 ? periodHours / hoursPerDay : 22;
};
loadWorkspaceEnv();
const SAGE_PAYROLL_ENRICH_ENABLED = !['0', 'false', 'no', 'off'].includes(String(process.env.HRIS_SAGE_PAYROLL_ENRICH ?? 'false').toLowerCase());
const EMPLOYEE_SOURCE_CACHE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_CACHE_MS || 300000);
const DIRECTORY_SOURCE_CACHE_MS = Number(process.env.HRIS_DIRECTORY_CACHE_MS || 600000);
const EMPLOYEE_SOURCE_STALE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_STALE_MS || 1800000);
const DIRECTORY_DB_CACHE_MS = Number(process.env.HRIS_DIRECTORY_DB_CACHE_MS || 300000);
const EMPLOYEE_SOURCE_FALLBACK_CACHE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_FALLBACK_CACHE_MS || 10000);
const EMPLOYEE_SOURCE_FALLBACK_STALE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_FALLBACK_STALE_MS || 60000);
const EMPLOYEE_SOURCE_DB_TIMEOUT_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_DB_TIMEOUT_MS || 60000);
const REQUIRE_HRIS_DB = !['0', 'false', 'no', 'off'].includes(String(process.env.HRIS_REQUIRE_DB_EMPLOYEE_SOURCE ?? 'true').toLowerCase());
const MIN_HRIS_EMPLOYEES = Number(process.env.HRIS_MIN_EMPLOYEE_SOURCE_COUNT || 100);
let employeeSourceCache: EmployeeSourceCache | null = null;

type DirectoryDbCache = {
  value: DleEmployeeDirectoryRow[] | null;
  expiresAt: number;
  pending?: Promise<DleEmployeeDirectoryRow[] | null>;
};

let directoryDbCache: DirectoryDbCache | null = null;

const fetchEmployeeDirectoryFromDb = async (): Promise<DleEmployeeDirectoryRow[] | null> => {
  const now = Date.now();
  if (directoryDbCache?.value && directoryDbCache.expiresAt > now) return directoryDbCache.value;
  if (directoryDbCache?.pending) return directoryDbCache.pending;
  const pending = withTimeout(readEmployeeDirectoryFromDb(), EMPLOYEE_SOURCE_DB_TIMEOUT_MS, 'DLE_Enterprise HRIS employee source timed out.')
    .then((value) => {
      directoryDbCache = { value, expiresAt: Date.now() + DIRECTORY_DB_CACHE_MS };
      return value;
    })
    .catch((error) => {
      if (directoryDbCache?.value) return directoryDbCache.value;
      throw error;
    })
    .finally(() => {
      if (directoryDbCache?.pending === pending) {
        directoryDbCache = { value: directoryDbCache?.value ?? null, expiresAt: directoryDbCache?.expiresAt ?? 0 };
      }
    });
  directoryDbCache = { value: directoryDbCache?.value ?? null, expiresAt: 0, pending };
  return pending;
};

export const countDirectReportsFromEmployees = (
  employees: DleEmployeeDirectoryRow[],
  manager: Pick<DleEmployeeDirectoryRow, 'fullName' | 'employeeCode' | 'employeeId'>,
) => {
  const code = str(manager.employeeCode).toLowerCase();
  const id = str(manager.employeeId).toLowerCase();
  const name = str(manager.fullName).toLowerCase();
  if (!code && !name && !id) return 0;
  const inactive = /terminated|resigned|retired|inactive|deceased|suspend/;
  return employees.filter((employee) => {
    const employeeCode = str(employee.employeeCode).toLowerCase();
    const employeeId = str(employee.employeeId).toLowerCase();
    if ((code && employeeCode === code) || (id && employeeId === id)) return false;
    if (inactive.test(String(employee.status || '').toLowerCase())) return false;
    const managerName = str(employee.managerName).toLowerCase();
    const functionalManager = str(employee.functionalManager).toLowerCase();
    const departmentHead = str(employee.departmentHead).toLowerCase();
    return (
      (name && (managerName === name || functionalManager === name || departmentHead === name))
      || (code && (managerName === code || functionalManager === code || departmentHead === code))
      || (id && (managerName === id || functionalManager === id || departmentHead === id))
    );
  }).length;
};

const loadDirectoryEmployees = async (): Promise<PayrollEmployeeSource> => {
  let dbError: unknown = null;
  try {
    const employees = await fetchEmployeeDirectoryFromDb();
    if (employees && employees.length >= MIN_HRIS_EMPLOYEES) {
      const directoryEmployees = employees.filter((employee) => ![employee.employeeId, employee.employeeCode, employee.sourceEmployeeId].some(isTemporaryPfCode) && !isExcludedFromHrisPayroll(employee));
      const enriched = markInactiveNonDailyContractEmployees(directoryEmployees);
      return {
        employees: (await applyPayrollEmployeeOptions(enriched)).map((employee) => withContractPayrollClassification(employee)),
        source: 'DLE_Enterprise HRIS',
        databaseAvailable: true,
        warning: null,
      };
    }
    if (REQUIRE_HRIS_DB) {
      throw new Error(`DLE_Enterprise HRIS employee source returned ${employees?.length || 0} records; expected at least ${MIN_HRIS_EMPLOYEES}.`);
    }
  } catch (error) {
    dbError = error;
    if (REQUIRE_HRIS_DB) {
      throw new Error(error instanceof Error ? `Unable to read DLE_Enterprise HRIS employees: ${error.message}` : 'Unable to read DLE_Enterprise HRIS employees.');
    }
  }

  const cached = markInactiveNonDailyContractEmployees((await readCachedPayrollEmployees()).filter((employee) => ![employee.employeeId, employee.employeeCode, employee.sourceEmployeeId].some(isTemporaryPfCode) && !isExcludedFromHrisPayroll(employee)));
  return {
    employees: (await applyPayrollEmployeeOptions(cached)).map((employee) => withContractPayrollClassification(employee)),
    source: 'Local HRIS payroll cache',
    databaseAvailable: false,
    warning: dbError instanceof Error
      ? `DLE_Enterprise HRIS database is not available (${dbError.message}). Showing local cached payroll data because HRIS_REQUIRE_DB_EMPLOYEE_SOURCE is disabled.`
      : 'DLE_Enterprise HRIS database is not available. Showing local cached payroll data because HRIS_REQUIRE_DB_EMPLOYEE_SOURCE is disabled.',
  };
};

let directorySourceCache: EmployeeSourceCache | null = null;

export const invalidateDirectoryEmployeeCache = () => {
  directorySourceCache = null;
};

export const readDirectoryEmployees = async (): Promise<PayrollEmployeeSource> => {
  const now = Date.now();
  if (directorySourceCache?.value && directorySourceCache.expiresAt > now) return directorySourceCache.value;
  if (directorySourceCache?.pending) return directorySourceCache.pending;
  const pending = loadDirectoryEmployees().then((value) => {
    directorySourceCache = {
      value,
      expiresAt: Date.now() + DIRECTORY_SOURCE_CACHE_MS,
      staleUntil: Date.now() + DIRECTORY_SOURCE_CACHE_MS,
    };
    return value;
  });
  directorySourceCache = { value: directorySourceCache?.value, expiresAt: 0, staleUntil: 0, pending };
  return pending;
};

export const readPayrollEmployees = async (): Promise<PayrollEmployeeSource> => {
  const now = Date.now();
  if (employeeSourceCache?.value && employeeSourceCache.expiresAt > now) return employeeSourceCache.value;

  if (employeeSourceCache?.value && employeeSourceCache.staleUntil > now) {
    if (!employeeSourceCache.pending) {
      const staleValue = employeeSourceCache.value;
      const pending = loadPayrollEmployees()
        .then((value) => {
          const window = cacheWindow(value);
          employeeSourceCache = { value, expiresAt: Date.now() + window.expiresIn, staleUntil: Date.now() + window.staleFor };
          return value;
        })
        .catch(() => {
          const window = cacheWindow(staleValue);
          employeeSourceCache = { value: staleValue, expiresAt: Date.now() + window.expiresIn, staleUntil: Date.now() + window.staleFor };
          return staleValue;
        });
      employeeSourceCache.pending = pending;
      pending.catch(() => undefined);
    }
    return employeeSourceCache.value;
  }

  if (employeeSourceCache?.pending) return employeeSourceCache.pending;

  const pending = loadPayrollEmployees().then((value) => {
    const window = cacheWindow(value);
    employeeSourceCache = { value, expiresAt: Date.now() + window.expiresIn, staleUntil: Date.now() + window.staleFor };
    return value;
  });
  employeeSourceCache = { value: employeeSourceCache?.value, expiresAt: 0, staleUntil: 0, pending };
  return pending;
};

export const invalidatePayrollEmployeeCache = () => {
  employeeSourceCache = null;
  directorySourceCache = null;
  directoryDbCache = null;
};

const cacheWindow = (source: PayrollEmployeeSource) => {
  if (source.databaseAvailable) {
    return { expiresIn: EMPLOYEE_SOURCE_CACHE_MS, staleFor: REQUIRE_HRIS_DB ? EMPLOYEE_SOURCE_CACHE_MS : EMPLOYEE_SOURCE_STALE_MS };
  }
  return { expiresIn: EMPLOYEE_SOURCE_FALLBACK_CACHE_MS, staleFor: EMPLOYEE_SOURCE_FALLBACK_STALE_MS };
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const jsonValue = (raw: string | null | undefined, keys: string[]) => {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const found = keys.map((key) => parsed[key]).find((value) => String(value || '').trim());
    return String(found || '').trim();
  } catch {
    return '';
  }
};

const sageLineItems = (raw: string | null | undefined) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    return parsed
      .map((line) => ({
        code: str(line.code),
        name: str(line.name) || str(line.code),
        amount: Number(line.amount || 0),
        taxableAmount: moneyOrNull(line.taxableAmount),
        ytdTotal: moneyOrNull(line.ytdTotal),
      }))
      .filter((line) => line.code && Number.isFinite(line.amount) && line.amount !== 0);
  } catch {
    return [];
  }
};

const sageStoredLineItems = (lines: Array<{ code: string; name: string; amount: number; ytdTotal?: number | null; taxableAmount?: number | null }>) =>
  lines.map((line) => ({
    code: line.code,
    name: line.name,
    amount: line.amount,
    ytdTotal: line.ytdTotal ?? null,
  }));

const maybeEnrichEmployeesFromSagePayroll = async (employees: DleEmployeeDirectoryRow[]) => {
  if (!SAGE_PAYROLL_ENRICH_ENABLED) return employees;
  return enrichEmployeesFromSagePayroll(employees);
};

const enrichEmployeesFromSagePayroll = async (employees: DleEmployeeDirectoryRow[]) => {
  try {
    const [sageEmployees, sageBankDetails] = await withTimeout(
      Promise.all([
        readActiveSagePayrollEmployeesWithLatestPayslipLines(),
        readSagePayrollEmployeeBankDetails().catch(() => []),
      ]),
      Number(process.env.SAGE_PAYROLL_ENRICH_TIMEOUT_MS || 20000),
      'Sage payroll enrichment timed out.'
    );
    void importSagePayrollEmployeesToDb(sageEmployees).catch(() => undefined);
    const bankByEmployeeId = new Map(sageBankDetails.map((detail) => [Number(detail.employeeId), detail]));
    const sageByKey = new Map(sageEmployees.flatMap((employee) => {
      const keys = [employee.directoryEmployeeCode, employee.employeeCode, employee.employeeCodeDisplay].map(normalizePayrollMatchKey).filter(Boolean);
      return keys.map((key) => [key, employee] as const);
    }));
    return employees.map((employee) => {
      const sage = sageByKey.get(normalizePayrollMatchKey(employee.employeeCode)) || sageByKey.get(normalizePayrollMatchKey(employee.employeeId));
      if (!sage) return employee;
      const bankDetail = bankByEmployeeId.get(Number(sage.employeeId));
      const pensionProvider = str(sage.pensionProvider) || jsonValue(sage.sageEmployeeDetailJson, ['PensionFundAdministrator', 'PensionFundAdmin', 'PensionProvider', 'PFA', 'PFADescription', 'RetirementFundName']);
      const pensionPin = str(sage.pensionPin) || jsonValue(sage.sageEmployeeDetailJson, ['PensionNo', 'PensionNumber', 'PensionPIN', 'PFANumber', 'RSAPIN', 'RsaPin']);
      const liveEarningLines = sageLineItems(sage.latestEarningLinesJson);
      const liveDeductionLines = sageLineItems(sage.latestDeductionLinesJson);
      const liveContributionLines = sageLineItems(sage.latestContributionLinesJson);
      const earningLines = liveEarningLines.length ? liveEarningLines : (employee.sagePayrollEarnings || []);
      const deductionLines = liveDeductionLines.length ? liveDeductionLines : (employee.sagePayrollDeductions?.lines || []);
      const contributionLines = liveContributionLines.length ? liveContributionLines : (employee.sagePayrollContributions?.lines || []);
      const persistedDeductions = buildSagePayrollDeductionsFromLines(sageStoredLineItems(deductionLines));
      const hoursPerDay = moneyFrom(employee.hoursPerDay, sage.hoursPerDay, 8) || 8;
      const hoursPerPeriod = moneyFrom(employee.hoursPerPeriod, sage.hoursPerPeriod) || hoursPerDay * 22;
      const isDailyRate = isDailyRatePayrollEmployee(employee);
      const sageRatePerDay = moneyFrom(sage.ratePerDay);
      const sageRatePerHour = moneyFrom(sage.ratePerHour);
      const ratePerDay = moneyFrom(employee.ratePerDay, sageRatePerDay, sageRatePerHour ? sageRatePerHour * hoursPerDay : null);
      const ratePerHour = moneyFrom(employee.ratePerHour, sageRatePerHour, ratePerDay ? ratePerDay / hoursPerDay : null);
      const workingDays = dailyWorkingDays(hoursPerDay, hoursPerPeriod);
      const periodSalary = isDailyRate && ratePerDay
        ? Math.round(ratePerDay * workingDays * 100) / 100
        : moneyFrom(employee.periodSalary, sage.periodSalary, ratePerDay ? ratePerDay * workingDays : null);
      const sageGrade = str(sage.jobGradeCode) || str(sage.jobGrade);
      const salaryGrade = !isGenericPayrollGrade(employee.salaryGrade) ? employee.salaryGrade : sageGrade || employee.salaryGrade;
      return {
        ...employee,
        jobGrade: employee.jobGrade || str(sage.jobGrade) || sageGrade || '',
        salaryGrade,
        bankName: employee.bankName || bankDetail?.bankName || sage.bankName || '',
        bankCode: employee.bankCode || bankDetail?.bankCode || sage.bankCode || '',
        branchName: employee.branchName || bankDetail?.branchName || sage.branchName || '',
        branchCode: employee.branchCode || bankDetail?.branchCode || sage.branchCode || '',
        accountNo: employee.accountNo || bankDetail?.accountNo || sage.accountNo || '',
        accountName: employee.accountName || bankDetail?.accountName || sage.accountName || '',
        pensionProvider: employee.pensionProvider || pensionProvider,
        pensionPin: employee.pensionPin || pensionPin,
        taxIdentificationNumber: employee.taxIdentificationNumber || sage.taxNo || '',
        payCurrency: employee.payCurrency || sage.companyCurrency || 'NGN',
        paymentRun: employee.paymentRun || sage.paymentRunLong || sage.paymentRunShort || '',
        paymentType: employee.paymentType || sage.paymentType || '',
        periodSalary,
        annualSalary: moneyFrom(employee.annualSalary, sage.annualSalary, periodSalary ? periodSalary * 12 : null),
        ratePerDay,
        ratePerHour,
        hoursPerDay,
        hoursPerPeriod,
        sagePayrollEarnings: earningLines,
        sagePayrollDeductions: liveDeductionLines.length ? {
          paye: moneyOrNull(sage.latestPaye),
          pensionEmployee: moneyOrNull(sage.latestPensionEmployee),
          nhf: moneyOrNull(sage.latestNhf),
          other: moneyOrNull(sage.latestOtherDeductions),
          totalDeductions: moneyOrNull(sage.latestTotalDeductions),
          netPay: moneyOrNull(sage.latestNetPay),
          lines: sageStoredLineItems(deductionLines),
        } : persistedDeductions,
        sagePayrollContributions: liveContributionLines.length ? {
          pensionEmployer: moneyOrNull(sage.latestPensionEmployer),
          nsitf: moneyOrNull(sage.latestNsitf),
          itf: moneyOrNull(sage.latestItf),
          totalEmployerContributions: moneyOrNull(sage.latestTotalEmployerContributions),
          lines: sageStoredLineItems(contributionLines),
        } : buildSagePayrollContributionsFromLines(sageStoredLineItems(contributionLines)),
      };
    });
  } catch {
    return employees;
  }
};

const enrichEmployeesFromPayslipIdentities = async (
  employees: DleEmployeeDirectoryRow[],
  identities?: Awaited<ReturnType<typeof payslipIdentityMap>>,
) => {
  try {
    const identityMap = identities || await payslipIdentityMap();
    return employees.map((employee) => {
      const keys = [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId]
        .map(normalizePayrollMatchKey)
        .filter(Boolean);
      const identity = keys.map((key) => identityMap.get(key)).find(Boolean);
      if (!identity?.salaryGrade) return employee;
      const authoritativeGrade = str(identity.salaryGrade);
      if (!authoritativeGrade || !isGenericPayrollGrade(employee.salaryGrade)) return employee;
      return {
        ...employee,
        salaryGrade: authoritativeGrade,
        jobGrade: str(employee.jobGrade) || authoritativeGrade,
      };
    });
  } catch {
    return employees;
  }
};

const enrichPayrollEmployeeMaster = async (employees: DleEmployeeDirectoryRow[]) => {
  const [sageEnriched, identities] = await Promise.all([
    maybeEnrichEmployeesFromSagePayroll(employees),
    payslipIdentityMap().catch(() => new Map()),
  ]);
  return enrichEmployeesFromPayslipIdentities(sageEnriched, identities);
};

const emptyEmployee = (employeeId: string, fullName: string): DleEmployeeDirectoryRow => ({
  id: employeeId,
  employeeId,
  employeeCode: employeeId,
  employeeDbId: Math.abs(employeeId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)),
  fullName,
  title: '',
  firstName: fullName.split(' ')[0] || fullName,
  middleName: '',
  lastName: fullName.split(' ').slice(1).join(' '),
  gender: '',
  dateOfBirth: '',
  maritalStatus: '',
  email: '',
  officialEmail: '',
  personalEmail: '',
  phone: '',
  primaryPhone: '',
  alternatePhone: '',
  officeExtension: '',
  residentialAddress: '',
  permanentAddress: '',
  city: '',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '',
  jobTitle: 'Unassigned Job Title',
  designation: '',
  jobGrade: '',
  department: 'Unassigned Department',
  division: 'Unassigned Division',
  businessUnit: 'DLE Corporate',
  costCenter: '',
  location: 'Lagos HQ',
  workLocation: 'Lagos HQ',
  officeLocation: 'Lagos HQ',
  staffCategory: '',
  employeeCategory: '',
  employmentType: 'Permanent',
  status: 'Active',
  nationality: 'Nigerian',
  stateOfOrigin: '',
  localGovernmentArea: '',
  religion: '',
  languagesSpoken: '',
  nearestBusStop: '',
  expatriate: false,
  fieldWorker: false,
  remoteWorker: false,
  dateJoined: '',
  probationStartDate: '',
  probationEndDate: '',
  confirmationDueDate: '',
  contractStartDate: '',
  yearsOfService: 0,
  emergencyContactsComplete: false,
  emergencyContactCount: 0,
  documentCount: 0,
  hasManagerAssigned: false,
  hasPhoto: false,
  payrollSource: 'Local HRIS payroll cache',
  payrollGroup: 'Monthly Payroll',
  salaryGrade: 'Unassigned',
  benefitGroup: '',
  payCurrency: 'NGN',
  paymentRun: 'Monthly',
  paymentType: 'Bank Transfer',
  bankName: '',
  bankCode: '',
  branchName: '',
  branchCode: '',
  accountNo: '',
  accountName: '',
  pensionProvider: '',
  pensionPin: '',
  taxIdentificationNumber: '',
  periodSalary: null,
  basicSalary: null,
  latestAllowances: null,
  latestDeductions: null,
  annualSalary: null,
  ratePerHour: null,
  ratePerDay: null,
  hoursPerDay: 8,
  hoursPerPeriod: 176,
  setupAssignedToPayroll: true,
  sourceSystem: 'Local HRIS payroll cache',
  sourceEmployeeId: employeeId,
  createdAt: '',
  modifiedAt: '',
  aiRiskScore: 0,
  trainingCompliance: 'Compliant',
});

const readJson = async <T,>(fileName: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(path.join(DATA_ROOT, fileName), 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const readCachedPayrollEmployees = async () => {
  const rows = await readJson<any[]>('timesheet-entry.json', []);
  const byEmployee = new Map<string, DleEmployeeDirectoryRow>();
  for (const row of rows) {
    const employeeId = str(row.employeeId);
    if (!employeeId || byEmployee.has(employeeId)) continue;
    const rate = Number(row.labourRateNgn || 0);
    const employee = emptyEmployee(employeeId, str(row.employeeName) || employeeId);
    employee.department = str(row.department) || employee.department;
    employee.businessUnit = str(row.businessUnit) || employee.businessUnit;
    employee.location = str(row.location) || str(row.site) || employee.location;
    employee.workLocation = employee.location;
    employee.officeLocation = employee.location;
    employee.jobTitle = str(row.mode) || employee.jobTitle;
    employee.managerName = str(row.supervisor) || employee.managerName;
    employee.hasManagerAssigned = Boolean(employee.managerName);
    employee.payrollGroup = str(row.mode).toLowerCase().includes('daily') ? 'Daily Rate' : 'Monthly Payroll';
    employee.employmentType = str(row.employeeId).startsWith('C') ? 'Contract' : 'Permanent';
    employee.salaryGrade = 'Cache';
    employee.ratePerHour = rate || null;
    employee.ratePerDay = rate ? rate * 8 : null;
    employee.periodSalary = moneyFromRate(rate) || null;
    employee.annualSalary = employee.periodSalary ? employee.periodSalary * 12 : null;
    employee.fieldWorker = true;
    byEmployee.set(employeeId, employee);
  }
  return Array.from(byEmployee.values());
};

const loadPayrollEmployees = async (): Promise<PayrollEmployeeSource> => {
  let dbError: unknown = null;
  try {
    const employees = await fetchEmployeeDirectoryFromDb();
    if (employees && employees.length >= MIN_HRIS_EMPLOYEES) {
      const payrollEmployees = employees.filter((employee) => ![employee.employeeId, employee.employeeCode, employee.sourceEmployeeId].some(isTemporaryPfCode) && !isExcludedFromHrisPayroll(employee));
      const activePayrollEmployees = payrollActiveEmployees(await enrichPayrollEmployeeMaster(payrollEmployees));
      return { employees: await applyPayrollEmployeeOptions(activePayrollEmployees), source: 'DLE_Enterprise HRIS', databaseAvailable: true, warning: null };
    }
    if (REQUIRE_HRIS_DB) {
      throw new Error(`DLE_Enterprise HRIS employee source returned ${employees?.length || 0} records; expected at least ${MIN_HRIS_EMPLOYEES}. Payroll cannot use the local cache in production.`);
    }
  } catch (error) {
    dbError = error;
    if (REQUIRE_HRIS_DB) {
      throw new Error(error instanceof Error ? `Unable to read DLE_Enterprise HRIS employees: ${error.message}` : 'Unable to read DLE_Enterprise HRIS employees.');
    }
  }

  const cached = await applyPayrollEmployeeOptions(payrollActiveEmployees((await readCachedPayrollEmployees()).filter((employee) => ![employee.employeeId, employee.employeeCode, employee.sourceEmployeeId].some(isTemporaryPfCode) && !isExcludedFromHrisPayroll(employee))));
  return {
    employees: cached,
    source: 'Local HRIS payroll cache',
    databaseAvailable: false,
    warning: dbError instanceof Error
      ? `DLE_Enterprise HRIS database is not available (${dbError.message}). Showing local cached payroll data because HRIS_REQUIRE_DB_EMPLOYEE_SOURCE is disabled.`
      : 'DLE_Enterprise HRIS database is not available. Showing local cached payroll data because HRIS_REQUIRE_DB_EMPLOYEE_SOURCE is disabled.',
  };
};
