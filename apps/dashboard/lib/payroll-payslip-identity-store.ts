import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SagePayrollEmployee } from '@/lib/sage-people-payroll-store';
import { normalizePayrollMatchKey, readActiveSagePayrollEmployees, readSagePayrollEmployeeBankDetails, type SagePayrollBankDetail } from '@/lib/sage-people-payroll-store';
import { withNormalizedBankCodes } from '@/lib/payroll-bank-constants';

export type PayslipEmployeeIdentity = {
  employeeId: string;
  employeeCode?: string;
  sourceEmployeeCode?: string;
  fullName?: string;
  jobTitle?: string;
  department?: string;
  businessUnit?: string;
  location?: string;
  payrollGroup?: string;
  salaryGrade?: string;
  payCurrency?: string;
  paymentRun?: string;
  paymentType?: string;
  bankName?: string;
  bankCode?: string;
  branchName?: string;
  branchCode?: string;
  accountNo?: string;
  accountName?: string;
  accountTypeId?: number | null;
  pensionProvider?: string;
  pensionPin?: string;
  taxIdentificationNumber?: string;
  migratedAt: string;
  migratedBy?: string;
  sourceSystem: 'Sage Payroll' | 'DLE HRIS';
};

const compact = (value: unknown) => String(value || '').trim();
const firstValue = (...values: unknown[]) => values.map(compact).find(Boolean) || '';
const jsonObject = (raw: string | null | undefined) => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};
const jsonValue = (raw: string | null | undefined, keys: string[]) => {
  const data = jsonObject(raw);
  return keys.map((key) => compact(data[key])).find(Boolean) || '';
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const resolveRuntimeDataDirs = () => {
  const cwd = process.cwd();
  const dirs = [
    process.env.DLE_PAYSLIP_IDENTITY_PATH ? path.dirname(path.resolve(process.env.DLE_PAYSLIP_IDENTITY_PATH)) : '',
    process.env.DLE_HRIS_DATA_DIR ? path.resolve(process.env.DLE_HRIS_DATA_DIR) : '',
    path.join(cwd, 'data', 'hris'),
    path.basename(cwd).toLowerCase() === 'site' ? path.join(path.dirname(cwd), 'runtime-data', 'hris') : '',
    path.join(cwd, 'runtime-data', 'hris'),
    path.join(resolveDashboardRoot(), 'data', 'hris'),
  ].filter(Boolean);
  return Array.from(new Set(dirs.map((dir) => path.resolve(dir))));
};

const IDENTITY_PATHS = [
  process.env.DLE_PAYSLIP_IDENTITY_PATH ? path.resolve(process.env.DLE_PAYSLIP_IDENTITY_PATH) : '',
  ...resolveRuntimeDataDirs().map((dir) => path.join(dir, 'payroll-payslip-identities.json')),
].filter(Boolean);

const pensionProviderFromSage = (employee: SagePayrollEmployee) => {
  return firstValue(employee.pensionProvider, jsonValue(employee.sageEmployeeDetailJson, ['PensionFundAdministrator', 'PensionFundAdmin', 'PensionProvider', 'PFA', 'PFADescription', 'RetirementFundName', 'PensionAdministrator']));
};

const pensionPinFromSage = (employee: SagePayrollEmployee) => {
  return firstValue(employee.pensionPin, jsonValue(employee.sageEmployeeDetailJson, ['PensionNo', 'PensionNumber', 'PensionPIN', 'PFANumber', 'PfaNumber', 'RSAPIN', 'RsaPin', 'RetirementSavingsAccountNo']));
};

export const payslipIdentityFromSage = (employee: SagePayrollEmployee, options?: { employeeId?: string; migratedBy?: string; bankDetail?: SagePayrollBankDetail }): PayslipEmployeeIdentity => {
  const bankName = firstValue(options?.bankDetail?.bankName, employee.bankName, jsonValue(employee.sageEmployeeDetailJson, ['BankName', 'Bank', 'EmployeeBankName', 'PaymentBankName']));
  const bankCode = firstValue(options?.bankDetail?.bankCode, employee.bankCode, jsonValue(employee.sageEmployeeDetailJson, ['BankCode', 'EmployeeBankCode', 'PaymentBankCode']));
  const branchCode = firstValue(options?.bankDetail?.branchCode, employee.branchCode, jsonValue(employee.sageEmployeeDetailJson, ['BranchCode', 'BankBranchCode', 'SortCode', 'SortCodeNo']));
  const normalizedBank = withNormalizedBankCodes({ bankName, bankCode, branchCode });
  return {
  employeeId: compact(options?.employeeId || employee.directoryEmployeeCode || employee.employeeCode),
  employeeCode: compact(employee.directoryEmployeeCode || employee.employeeCode),
  sourceEmployeeCode: compact(employee.employeeCode),
  fullName: compact(employee.displayName),
  jobTitle: compact(employee.jobTitle),
  department: compact(employee.departmentName || employee.hierarchyDepartmentName),
  businessUnit: compact(employee.companyCode || employee.companyName),
  location: compact(employee.siteName || employee.hierarchyLocationName || employee.physicalCityTown),
  payrollGroup: compact(employee.companyCode || employee.remunerationDefinition),
  salaryGrade: compact(employee.jobGradeCode || employee.jobGrade),
  payCurrency: compact(employee.companyCurrency || 'NGN'),
  paymentRun: compact(employee.paymentRunLong || employee.paymentRunShort),
  paymentType: compact(employee.paymentType),
  bankName,
  bankCode: normalizedBank.bankCode || bankCode,
  branchName: firstValue(options?.bankDetail?.branchName, employee.branchName, jsonValue(employee.sageEmployeeDetailJson, ['BranchName', 'BankBranchName', 'EmployeeBranchName'])),
  branchCode: normalizedBank.branchCode || branchCode,
  accountNo: firstValue(options?.bankDetail?.accountNo, employee.accountNo, jsonValue(employee.sageEmployeeDetailJson, ['AccountNo', 'AccountNumber', 'BankAccountNo', 'BankAccountNumber', 'EmployeeAccountNo', 'PaymentAccountNo'])),
  accountName: firstValue(options?.bankDetail?.accountName, employee.accountName, jsonValue(employee.sageEmployeeDetailJson, ['AccountName', 'BankAccountName', 'EmployeeAccountName', 'PaymentAccountName'])),
  accountTypeId: employee.accountTypeId ?? null,
  pensionProvider: pensionProviderFromSage(employee),
  pensionPin: pensionPinFromSage(employee),
  taxIdentificationNumber: compact(employee.taxNo),
  migratedAt: new Date().toISOString(),
  migratedBy: compact(options?.migratedBy),
  sourceSystem: 'Sage Payroll',
  };
};

export const hasPayslipBankIdentity = (identity: PayslipEmployeeIdentity) => Boolean(compact(identity.accountNo));
export const hasPayslipStatutoryIdentity = (identity: PayslipEmployeeIdentity) =>
  Boolean(compact(identity.taxIdentificationNumber) || compact(identity.pensionProvider) || compact(identity.pensionPin));

const mergeIdentity = (current: PayslipEmployeeIdentity | undefined, incoming: PayslipEmployeeIdentity): PayslipEmployeeIdentity => {
  const pick = (next: unknown, previous: unknown) => compact(next) || compact(previous) || undefined;
  return {
    ...current,
    ...incoming,
    employeeId: pick(incoming.employeeId, current?.employeeId) || '',
    employeeCode: pick(incoming.employeeCode, current?.employeeCode),
    sourceEmployeeCode: pick(incoming.sourceEmployeeCode, current?.sourceEmployeeCode),
    fullName: pick(incoming.fullName, current?.fullName),
    jobTitle: pick(incoming.jobTitle, current?.jobTitle),
    department: pick(incoming.department, current?.department),
    businessUnit: pick(incoming.businessUnit, current?.businessUnit),
    location: pick(incoming.location, current?.location),
    payrollGroup: pick(incoming.payrollGroup, current?.payrollGroup),
    salaryGrade: pick(incoming.salaryGrade, current?.salaryGrade),
    payCurrency: pick(incoming.payCurrency, current?.payCurrency),
    paymentRun: pick(incoming.paymentRun, current?.paymentRun),
    paymentType: pick(incoming.paymentType, current?.paymentType),
    bankName: pick(incoming.bankName, current?.bankName),
    bankCode: pick(incoming.bankCode, current?.bankCode),
    branchName: pick(incoming.branchName, current?.branchName),
    branchCode: pick(withNormalizedBankCodes({
      bankName: pick(incoming.bankName, current?.bankName),
      bankCode: pick(incoming.bankCode, current?.bankCode),
      branchCode: pick(incoming.branchCode, current?.branchCode),
    }).branchCode, pick(incoming.branchCode, current?.branchCode)),
    accountNo: pick(incoming.accountNo, current?.accountNo),
    accountName: pick(incoming.accountName, current?.accountName),
    accountTypeId: incoming.accountTypeId ?? current?.accountTypeId ?? null,
    pensionProvider: pick(incoming.pensionProvider, current?.pensionProvider),
    pensionPin: pick(incoming.pensionPin, current?.pensionPin),
    taxIdentificationNumber: pick(incoming.taxIdentificationNumber, current?.taxIdentificationNumber),
    migratedAt: incoming.migratedAt || current?.migratedAt || new Date().toISOString(),
    migratedBy: pick(incoming.migratedBy, current?.migratedBy),
    sourceSystem: incoming.sourceSystem || current?.sourceSystem || 'DLE HRIS',
  };
};

const IDENTITY_CACHE_MS = Number(process.env.HRIS_PAYSLIP_IDENTITY_CACHE_MS || 300000);
let identityCache: { expiresAt: number; value: PayslipEmployeeIdentity[] } | null = null;

export const invalidatePayslipIdentityCache = () => {
  identityCache = null;
};

export const readPayslipEmployeeIdentities = async (): Promise<PayslipEmployeeIdentity[]> => {
  const now = Date.now();
  if (identityCache && identityCache.expiresAt > now) return identityCache.value;
  for (const identityPath of IDENTITY_PATHS) {
    try {
      const parsed = JSON.parse(await readFile(identityPath, 'utf8'));
      const value = Array.isArray(parsed) ? parsed : [];
      identityCache = { value, expiresAt: Date.now() + IDENTITY_CACHE_MS };
      return value;
    } catch {
      // Try the next configured/runtime location.
    }
  }
  return [];
};

const PAYSLIP_IDENTITY_CACHE_MS = Number(process.env.HRIS_PAYSLIP_IDENTITY_CACHE_MS || 600000);
let payslipIdentityMapCache: { expiresAt: number; map: Map<string, PayslipEmployeeIdentity> } | null = null;

export const payslipIdentityMap = async () => {
  const now = Date.now();
  if (payslipIdentityMapCache && payslipIdentityMapCache.expiresAt > now) {
    return payslipIdentityMapCache.map;
  }
  const identities = await readPayslipEmployeeIdentities();
  const map = new Map<string, PayslipEmployeeIdentity>();
  const setAlias = (raw: string | undefined, identity: PayslipEmployeeIdentity) => {
    const key = normalizePayrollMatchKey(raw);
    if (!key) return;
    map.set(key, identity);
    if (/^\d+$/.test(key)) map.set(`P${key.padStart(4, '0')}`, identity);
    if (/^P\d+$/i.test(key)) {
      const numeric = key.replace(/^P/i, '').replace(/^0+/, '') || '0';
      map.set(numeric, identity);
      map.set(numeric.padStart(4, '0'), identity);
    }
  };
  identities.forEach((identity) => {
    [identity.employeeId, identity.employeeCode, identity.sourceEmployeeCode].forEach((key) => setAlias(key, identity));
  });
  payslipIdentityMapCache = { expiresAt: Date.now() + PAYSLIP_IDENTITY_CACHE_MS, map };
  return map;
};

export const syncPayslipIdentitiesFromSage = async (options?: { force?: boolean; migratedBy?: string }) => {
  const current = await readPayslipEmployeeIdentities();
  if (!options?.force && current.some(hasPayslipBankIdentity) && current.some(hasPayslipStatutoryIdentity)) return { synced: 0, skipped: true };
  const [sageEmployees, sageBankDetails] = await Promise.all([
    readActiveSagePayrollEmployees(),
    readSagePayrollEmployeeBankDetails().catch(() => [] as SagePayrollBankDetail[]),
  ]);
  const bankByEmployeeId = new Map(sageBankDetails.map((detail) => [Number(detail.employeeId), detail]));
  const identities = sageEmployees.map((employee) => payslipIdentityFromSage(employee, { migratedBy: options?.migratedBy || 'Payslip identity sync', bankDetail: bankByEmployeeId.get(Number(employee.employeeId)) }));
  const bankIdentities = identities.filter(hasPayslipBankIdentity);
  await writePayslipEmployeeIdentities(identities);
  return { synced: identities.length, bankIdentities: bankIdentities.length, skipped: false };
};

export const writePayslipEmployeeIdentities = async (records: PayslipEmployeeIdentity[]) => {
  const current = await readPayslipEmployeeIdentities();
  const next = new Map<string, PayslipEmployeeIdentity>();
  current.forEach((record) => {
    const key = normalizePayrollMatchKey(record.employeeId || record.employeeCode || record.sourceEmployeeCode);
    if (key) next.set(key, record);
  });
  records.forEach((record) => {
    const key = normalizePayrollMatchKey(record.employeeId || record.employeeCode || record.sourceEmployeeCode);
    if (key) next.set(key, mergeIdentity(next.get(key), record));
  });
  const payload = JSON.stringify(Array.from(next.values()).sort((a, b) => compact(a.employeeId).localeCompare(compact(b.employeeId))), null, 2);
  const writePaths = [
    ...IDENTITY_PATHS.filter((identityPath) => existsSync(identityPath)),
    ...IDENTITY_PATHS.filter((identityPath) => !existsSync(identityPath)),
  ];
  let lastError: unknown = null;
  for (const identityPath of writePaths) {
    try {
      await mkdir(path.dirname(identityPath), { recursive: true });
      await writeFile(identityPath, payload, 'utf8');
      payslipIdentityMapCache = null;
      return Array.from(next.values());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to write payslip identity store.');
};
