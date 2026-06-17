import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readEmployeeDirectoryFromDb, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { normalizePayrollMatchKey, readActiveSagePayrollEmployeesWithLatestPayslipLines } from '@/lib/sage-people-payroll-store';

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
const moneyFromRate = (rate: number) => (Number.isFinite(rate) && rate > 0 ? rate * 22 : 0);
const moneyOrNull = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const EMPLOYEE_SOURCE_CACHE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_CACHE_MS || 60000);
const EMPLOYEE_SOURCE_STALE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_STALE_MS || 900000);
const EMPLOYEE_SOURCE_FALLBACK_CACHE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_FALLBACK_CACHE_MS || 10000);
const EMPLOYEE_SOURCE_FALLBACK_STALE_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_FALLBACK_STALE_MS || 60000);
const EMPLOYEE_SOURCE_DB_TIMEOUT_MS = Number(process.env.HRIS_EMPLOYEE_SOURCE_DB_TIMEOUT_MS || 5000);
let employeeSourceCache: EmployeeSourceCache | null = null;

const cacheWindow = (source: PayrollEmployeeSource) => {
  if (source.databaseAvailable) {
    return { expiresIn: EMPLOYEE_SOURCE_CACHE_MS, staleFor: EMPLOYEE_SOURCE_STALE_MS };
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

const enrichEmployeesFromSagePayroll = async (employees: DleEmployeeDirectoryRow[]) => {
  try {
    const sageEmployees = await withTimeout(readActiveSagePayrollEmployeesWithLatestPayslipLines(), Number(process.env.SAGE_PAYROLL_ENRICH_TIMEOUT_MS || 20000), 'Sage payroll enrichment timed out.');
    const sageByKey = new Map(sageEmployees.flatMap((employee) => {
      const keys = [employee.directoryEmployeeCode, employee.employeeCode, employee.employeeCodeDisplay].map(normalizePayrollMatchKey).filter(Boolean);
      return keys.map((key) => [key, employee] as const);
    }));
    return employees.map((employee) => {
      const sage = sageByKey.get(normalizePayrollMatchKey(employee.employeeCode)) || sageByKey.get(normalizePayrollMatchKey(employee.employeeId));
      if (!sage) return employee;
      const pensionProvider = jsonValue(sage.sageEmployeeDetailJson, ['PensionFundAdministrator', 'PensionFundAdmin', 'PensionProvider', 'PFA', 'PFADescription', 'RetirementFundName']);
      const pensionPin = jsonValue(sage.sageEmployeeDetailJson, ['PensionNo', 'PensionNumber', 'PensionPIN', 'PFANumber', 'RSAPIN', 'RsaPin']);
      const earningLines = sageLineItems(sage.latestEarningLinesJson);
      const deductionLines = sageLineItems(sage.latestDeductionLinesJson);
      const contributionLines = sageLineItems(sage.latestContributionLinesJson);
      return {
        ...employee,
        bankName: employee.bankName || sage.bankName || '',
        accountNo: employee.accountNo || sage.accountNo || '',
        accountName: employee.accountName || sage.accountName || '',
        pensionProvider: employee.pensionProvider || pensionProvider,
        pensionPin: employee.pensionPin || pensionPin,
        taxIdentificationNumber: employee.taxIdentificationNumber || sage.taxNo || '',
        payCurrency: employee.payCurrency || sage.companyCurrency || 'NGN',
        paymentRun: employee.paymentRun || sage.paymentRunLong || sage.paymentRunShort || '',
        paymentType: employee.paymentType || sage.paymentType || '',
        sagePayrollEarnings: earningLines,
        sagePayrollDeductions: {
          paye: moneyOrNull(sage.latestPaye),
          pensionEmployee: moneyOrNull(sage.latestPensionEmployee),
          nhf: moneyOrNull(sage.latestNhf),
          other: moneyOrNull(sage.latestOtherDeductions),
          totalDeductions: moneyOrNull(sage.latestTotalDeductions),
          netPay: moneyOrNull(sage.latestNetPay),
          lines: deductionLines.map(({ taxableAmount: _taxableAmount, ...line }) => line),
        },
        sagePayrollContributions: {
          pensionEmployer: moneyOrNull(sage.latestPensionEmployer),
          nsitf: moneyOrNull(sage.latestNsitf),
          itf: moneyOrNull(sage.latestItf),
          totalEmployerContributions: moneyOrNull(sage.latestTotalEmployerContributions),
          lines: contributionLines.map(({ taxableAmount: _taxableAmount, ...line }) => line),
        },
      };
    });
  } catch {
    return employees;
  }
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
  payrollSource: 'Local HRIS payroll cache',
  payrollGroup: 'Monthly Payroll',
  salaryGrade: 'Unassigned',
  benefitGroup: '',
  payCurrency: 'NGN',
  paymentRun: 'Monthly',
  paymentType: 'Bank Transfer',
  bankName: '',
  accountNo: '',
  accountName: '',
  pensionProvider: '',
  pensionPin: '',
  taxIdentificationNumber: '',
  periodSalary: null,
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
  try {
    const employees = await withTimeout(readEmployeeDirectoryFromDb(), EMPLOYEE_SOURCE_DB_TIMEOUT_MS, 'DLE_Enterprise HRIS employee source timed out.');
    if (employees?.length) {
      return { employees: await enrichEmployeesFromSagePayroll(employees), source: 'DLE_Enterprise HRIS', databaseAvailable: true, warning: null };
    }
  } catch {
    // Fall through to cache; payroll pages should stay operational while DB connectivity is restored.
  }

  const cached = await readCachedPayrollEmployees();
  return {
    employees: cached,
    source: 'Local HRIS payroll cache',
    databaseAvailable: false,
    warning: 'DLE_Enterprise HRIS database is not available. Showing local cached payroll data until the database connection is restored.',
  };
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
