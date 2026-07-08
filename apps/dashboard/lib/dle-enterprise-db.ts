import { readFileSync } from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import {
  buildSagePayrollContributionsFromLines,
  buildSagePayrollDeductionsFromLines,
  parseSagePayrollLineItems,
} from '@/lib/sage-payroll-line-parser';
import { resolvePayCurrency } from '@/lib/payroll-currency';
import { withNormalizedBankCodes } from '@/lib/payroll-bank-constants';
import { resolveNigeriaPersonalLocation } from '@/lib/nigeria-locations';

type DraftRecordLike = {
  draftId: string;
  status: 'draft' | 'submitted' | 'approved' | 'created' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  draft: any;
  audit?: { at?: string; action: string; performedBy: string; reason?: string; oldValue?: string; newValue?: string }[];
};

type DuplicateMatch = { employeeId?: string; draftId?: string; reason: string };

export type DleEmployeeDirectoryRow = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeDbId: number;
  fullName: string;
  preferredName?: string;
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  email: string;
  officialEmail: string;
  personalEmail: string;
  phone: string;
  primaryPhone: string;
  alternatePhone: string;
  officeExtension: string;
  residentialAddress: string;
  permanentAddress: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  jobTitle: string;
  designation: string;
  jobGrade: string;
  department: string;
  division: string;
  businessUnit: string;
  costCenter: string;
  managerName?: string;
  functionalManager?: string;
  departmentHead?: string;
  hrBusinessPartner?: string;
  location: string;
  workLocation: string;
  officeLocation: string;
  projectSite?: string;
  shift?: 'Day' | 'Night' | 'Rotational';
  staffCategory: string;
  employeeCategory: string;
  employmentType: string;
  status: string;
  nationality: string;
  stateOfOrigin: string;
  localGovernmentArea: string;
  religion: string;
  languagesSpoken: string;
  nearestBusStop: string;
  expatriate: boolean;
  fieldWorker: boolean;
  remoteWorker: boolean;
  dateJoined: string;
  probationStartDate: string;
  probationEndDate: string;
  confirmationDueDate: string;
  contractStartDate: string;
  yearsOfService: number;
  contractEndDate?: string;
  emergencyContactsComplete: boolean;
  emergencyContactCount: number;
  documentCount: number;
  hasManagerAssigned: boolean;
  hasPhoto: boolean;
  payrollSource: string;
  payrollGroup: string;
  salaryGrade: string;
  benefitGroup: string;
  payCurrency: string;
  paymentRun: string;
  paymentType: string;
  bankName?: string;
  bankCode?: string;
  branchName?: string;
  branchCode?: string;
  accountNo?: string;
  accountName?: string;
  pensionProvider?: string;
  pensionPin?: string;
  taxIdentificationNumber?: string;
  nhfApplicable?: boolean;
  annualRent?: number | null;
  annualRentRelief?: number | null;
  payeCalculation?: {
    excludedEarningCodes?: string[];
    includeRefundInTaxable?: boolean;
    disablePensionPayeRelief?: boolean;
    annualRentRelief?: number;
    usdFlatRate?: number;
    monthlyPayeOverride?: number;
  };
  periodSalary: number | null;
  basicSalary: number | null;
  latestAllowances: number | null;
  latestDeductions: number | null;
  annualSalary: number | null;
  ratePerHour: number | null;
  ratePerDay: number | null;
  hoursPerDay: number | null;
  hoursPerPeriod: number | null;
  sagePayslipPeriod?: string | null;
  sagePayrollEarnings?: Array<{
    code: string;
    name: string;
    amount: number;
    taxableAmount?: number | null;
    ytdTotal?: number | null;
  }>;
  sagePayrollDeductions?: {
    paye?: number | null;
    pensionEmployee?: number | null;
    nhf?: number | null;
    other?: number | null;
    totalDeductions?: number | null;
    netPay?: number | null;
    lines?: Array<{
      code: string;
      name: string;
      amount: number;
      ytdTotal?: number | null;
    }>;
  };
  sagePayrollContributions?: {
    pensionEmployer?: number | null;
    nsitf?: number | null;
    itf?: number | null;
    totalEmployerContributions?: number | null;
    lines?: Array<{
      code: string;
      name: string;
      amount: number;
      ytdTotal?: number | null;
    }>;
  };
  localPayrollGroup?: string | null;
  localPayCurrency?: string | null;
  localPeriodSalary?: number | null;
  localLatestDeductions?: number | null;
  sageLocalPayrollEarnings?: Array<{
    code: string;
    name: string;
    amount: number;
    taxableAmount?: number | null;
    ytdTotal?: number | null;
  }>;
  sageLocalPayrollDeductions?: {
    paye?: number | null;
    pensionEmployee?: number | null;
    nhf?: number | null;
    other?: number | null;
    totalDeductions?: number | null;
    netPay?: number | null;
    lines?: Array<{
      code: string;
      name: string;
      amount: number;
      ytdTotal?: number | null;
    }>;
  };
  hasDualCurrencyPayroll?: boolean;
  setupAssignedToPayroll: boolean;
  sourceSystem: string;
  sourceEmployeeId: string;
  createdAt: string;
  modifiedAt: string;
  aiRiskScore: number;
  trainingCompliance: 'Compliant' | 'Overdue' | 'At Risk';
  payrollClassification?: {
    isContractCode: boolean;
    isDailyRate: boolean;
    shouldDeactivate: boolean;
    payrollEligible: boolean;
    label: string;
    recommendation: string | null;
  };
};

export type DleContractDocumentRow = {
  id: string;
  category: string;
  name: string;
  version: number;
  mimeType: string;
  sizeBytes: number;
  signatureStatus: 'Missing' | 'Unsigned' | 'Signed';
  legalReviewStatus: 'Not Required' | 'Pending' | 'Approved' | 'Rejected';
  expiryDate: string | null;
  status: 'Active' | 'Archived';
  uploadedAt: string;
  uploadedBy: string;
};

export type DleEmployeeContractRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  contractReferenceNo: string;
  contractType: string;
  contractCategory: string;
  contractStatus: string;
  workflowStatus: string;
  startDate: string;
  endDate: string | null;
  probationApplicable: boolean;
  probationStartDate: string | null;
  probationEndDate: string | null;
  confirmationDueDate: string | null;
  department: string | null;
  jobTitle: string | null;
  jobGrade: string | null;
  workLocation: string | null;
  reportingManager: string | null;
  hrOfficer: string | null;
  renewalStatus: string;
  approvalStatus: 'Not Started' | 'In Progress' | 'Approved' | 'Rejected';
  documentStatus: 'Missing' | 'Partial' | 'Complete';
  lastAmendmentAt: string | null;
  terms: Record<string, unknown>;
  documents: DleContractDocumentRow[];
  approvals: any[];
  audit: any[];
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type SagePayrollEmployeeImportRow = {
  employeeId: number;
  employeeCode: string;
  directoryEmployeeCode: string;
  employeeCodeDisplay: string | null;
  entityCode: string;
  displayName: string | null;
  title: string | null;
  firstNames: string | null;
  middleName: string | null;
  knownAsName: string | null;
  lastName: string | null;
  gender: string | null;
  birthDate: Date | string | null;
  maritalStatus: string | null;
  idNumber: string | null;
  passportNo: string | null;
  emailAddress: string | null;
  homeTelNo: string | null;
  cellNo: string | null;
  workTelNo: string | null;
  physicalAddress: string | null;
  physicalCityTown: string | null;
  physicalProvince: string | null;
  physicalCountryCode: string | null;
  physicalPostalCode: string | null;
  postalAddress: string | null;
  postalCityTown: string | null;
  postalPostalCode: string | null;
  jobTitle: string | null;
  jobTitleCode: string | null;
  jobGrade: string | null;
  jobGradeCode: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  siteCode: string | null;
  siteName: string | null;
  hierarchyLocationCode: string | null;
  hierarchyLocationName: string | null;
  hierarchyDepartmentCode: string | null;
  hierarchyDepartmentName: string | null;
  hierarchyEmployeeTypeCode: string | null;
  hierarchyEmployeeTypeName: string | null;
  managerEmployeeId: number | null;
  managerEmployeeCode: string | null;
  managerName: string | null;
  nationality: string | null;
  dateEngaged: Date | string | null;
  dateJoinedGroup: Date | string | null;
  probationPeriodEndDate: Date | string | null;
  contractStartDate: Date | string | null;
  contractExpiryDate: Date | string | null;
  companyCode: string;
  companyName: string;
  companyCurrency: string | null;
  paymentRunShort: string | null;
  paymentRunLong: string | null;
  paymentTypeCode: string | null;
  paymentType: string | null;
  remunerationDefinition: string | null;
  taxNo: string | null;
  bankName: string | null;
  bankCode: string | null;
  branchName: string | null;
  branchCode: string | null;
  accountNo: string | null;
  accountName: string | null;
  accountTypeId: number | null;
  annualSalary: number | null;
  periodSalary: number | null;
  ratePerHour: number | null;
  ratePerDay: number | null;
  hoursPerDay: number | null;
  hoursPerPeriod: number | null;
  workMonday: boolean | null;
  workTuesday: boolean | null;
  workWednesday: boolean | null;
  workThursday: boolean | null;
  workFriday: boolean | null;
  workSaturday: boolean | null;
  workSunday: boolean | null;
  statusCode: string;
  statusName: string;
  terminationDate: string | null;
  sageEmployeeJson: string | null;
  sageEmployeeDetailJson: string | null;
  sageEmployeeContractJson: string | null;
  sageEntityJson: string | null;
  sageCompanyJson: string | null;
  sageEmployeeStatusJson: string | null;
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;
let workspaceEnvLoaded = false;

const bool = (v: string | undefined, fallback: boolean) => {
  if (v == null || v === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(v.toLowerCase());
};

export const loadWorkspaceEnv = () => {
  if (workspaceEnvLoaded) return;
  workspaceEnvLoaded = true;
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '..', '.env'),
  ];
  for (const file of candidates) {
    try {
      const raw = readFileSync(file, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx < 0) continue;
        const key = trimmed.slice(0, idx).trim();
        if (process.env[key]) continue;
        let value = trimmed.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        process.env[key] = value;
      }
    } catch {
      // Try the next workspace root candidate.
    }
  }
};

const config = (): sql.config | null => {
  loadWorkspaceEnv();
  if (!bool(process.env.DLE_ENTERPRISE_DB_ENABLED, true)) return null;
  const server = process.env.DLE_ENTERPRISE_DB_HOST;
  const database = process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise';
  const user = process.env.DLE_ENTERPRISE_DB_USER;
  const password = process.env.DLE_ENTERPRISE_DB_PASSWORD;
  if (!server || !user || !password) return null;

  return {
    server,
    port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
    database,
    user,
    password,
    options: {
      encrypt: bool(process.env.DLE_ENTERPRISE_DB_ENCRYPT, true),
      trustServerCertificate: bool(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE, true),
      enableArithAbort: true,
    },
    pool: {
      max: Number(process.env.DLE_ENTERPRISE_DB_POOL_MAX || 10),
      min: Number(process.env.DLE_ENTERPRISE_DB_POOL_MIN || 2),
      idleTimeoutMillis: Number(process.env.DLE_ENTERPRISE_DB_POOL_IDLE_TIMEOUT_MS || 120000),
    },
    requestTimeout: Number(process.env.DLE_ENTERPRISE_DB_REQUEST_TIMEOUT_MS || 60000),
    connectionTimeout: Number(process.env.DLE_ENTERPRISE_DB_CONNECTION_TIMEOUT_MS || 20000),
  };
};

const connectionConfigs = () => {
  const primary = config();
  if (!primary) return [];
  const fallbackHosts = (process.env.DLE_ENTERPRISE_DB_FALLBACK_HOSTS || (primary.server === 'host.docker.internal' ? 'localhost,127.0.0.1' : ''))
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
  const hosts = Array.from(new Set([primary.server, ...fallbackHosts]));
  return hosts.map((server) => ({ ...primary, server }));
};

const pool = async () => {
  const configs = connectionConfigs();
  if (!configs.length) return null;
  if (!poolPromise) {
    poolPromise = (async () => {
      let lastError: unknown = null;
      for (const cfg of configs) {
        try {
          return await new sql.ConnectionPool(cfg).connect();
        } catch (error) {
          lastError = error;
          console.warn(`[DLE Enterprise DB] Connection attempt failed for ${cfg.server}:${cfg.port}:`, error instanceof Error ? error.message : error);
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Unable to connect to DLE Enterprise database.');
    })().catch((error) => {
      poolPromise = null;
      console.warn('[DLE Enterprise DB] SQL persistence unavailable; will retry on the next request:', error instanceof Error ? error.message : error);
      throw error;
    });
  }
  try {
    return await poolPromise;
  } catch {
    return null;
  }
};

export const getDleEnterpriseDbPool = pool;

export type DleEnterpriseDatabaseInfo = {
  enabled: boolean;
  configured: boolean;
  host: string;
  database: string;
  connected: boolean;
  error: string | null;
};

export const describeDleEnterpriseDatabase = (): Omit<DleEnterpriseDatabaseInfo, 'connected' | 'error'> => {
  loadWorkspaceEnv();
  const enabled = bool(process.env.DLE_ENTERPRISE_DB_ENABLED, true);
  const host = String(process.env.DLE_ENTERPRISE_DB_HOST || '').trim();
  const database = String(process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise').trim();
  const configured = Boolean(enabled && host && process.env.DLE_ENTERPRISE_DB_USER && process.env.DLE_ENTERPRISE_DB_PASSWORD);
  return { enabled, configured, host, database };
};

export const probeDleEnterpriseDatabase = async (): Promise<DleEnterpriseDatabaseInfo> => {
  const meta = describeDleEnterpriseDatabase();
  if (!meta.configured) {
    return { ...meta, connected: false, error: 'DLE_ENTERPRISE_DB_* environment variables are not fully configured on this server.' };
  }
  try {
    const connection = await getDleEnterpriseDbPool();
    if (!connection) {
      return { ...meta, connected: false, error: 'Unable to open a connection pool to DLE_Enterprise.' };
    }
    const result = await connection.request().query('SELECT DB_NAME() AS databaseName');
    const databaseName = String(result.recordset?.[0]?.databaseName || meta.database);
    return { ...meta, database: databaseName, connected: true, error: null };
  } catch (error) {
    return {
      ...meta,
      connected: false,
      error: error instanceof Error ? error.message : 'DLE_Enterprise connection probe failed.',
    };
  }
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const nullable = (v: unknown) => {
  const s = str(v);
  return s ? s : null;
};
const dateOrNull = (v: unknown) => {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const boolVal = (v: unknown) => (typeof v === 'boolean' ? v : !!v);
const numOrNull = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isoDate = (v: unknown) => {
  if (!v) return '';
  const date = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const isoDateTime = (v: unknown) => {
  if (!v) return '';
  const date = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const sourceDate = (v: unknown) => {
  const d = isoDate(v);
  return d || null;
};

const isLocalNationality = (value: unknown) => {
  const normalized = str(value).toLowerCase().replace(/[^a-z]/g, '');
  return ['nigeria', 'nigerian', 'ng'].includes(normalized);
};

const composedEmployeeFullName = (row: Record<string, unknown>, fallback: string) => {
  const firstName = str(row.first_name);
  const middleName = str(row.middle_name);
  const parts = [
    str(row.title),
    firstName,
    middleName && !firstName.toLowerCase().includes(middleName.toLowerCase()) ? middleName : '',
    str(row.last_name),
  ].filter(Boolean);
  return parts.join(' ') || str(row.full_name) || fallback;
};

const employeeTypeCode = (employeeType: string) => {
  const normalized = employeeType.trim().toLowerCase();
  if (normalized === 'permanent') return 'P';
  if (normalized === 'lumpsum') return 'L';
  if (normalized === 'daily rate') return 'C';
  if (normalized === 'nysc' || normalized.includes('nysc')) return 'N';
  if (
    normalized === 'it' ||
    normalized === 'intern' ||
    normalized.includes('industrial trainee') ||
    normalized.includes('industrial training') ||
    normalized.includes('industrial attachment') ||
    normalized.includes('intern')
  ) return 'I';
  return null;
};

const employeeCodePrefixForTypeCode = (typeCode: string | null) => (typeCode === 'N' ? 'NYSC' : typeCode === 'I' ? 'IT' : typeCode || '');

const inferEmployeeTypeCode = (...values: unknown[]) => employeeTypeCode(values.map((value) => str(value)).filter(Boolean).join(' '));

const employeeTypeCodeFromRawCode = (employeeCode: string) => {
  const raw = str(employeeCode).toUpperCase();
  if (/^P?N/.test(raw)) return 'N';
  if (/^P?I/.test(raw)) return 'I';
  return null;
};

const normalizeEmployeeCodeForType = (employeeCode: string, typeCode: string | null) => {
  const raw = str(employeeCode).toUpperCase().replace(/_/g, '');
  if (!raw) return raw;
  if ((typeCode === 'N' || typeCode === 'I') && raw.startsWith(`P${typeCode}`)) return raw.slice(1);
  if (typeCode && !/^[PCLNIF]/.test(raw)) return `${typeCode}${raw}`;
  return raw;
};

const sageEmployeeCode = (employee: SagePayrollEmployeeImportRow) => {
  const raw = str(employee.directoryEmployeeCode || employee.employeeCode).toUpperCase();
  const typeCode =
    inferEmployeeTypeCode(employee.hierarchyEmployeeTypeName, employee.jobTitle, employee.departmentName) ||
    employeeTypeCodeFromRawCode(raw);
  const base = normalizeEmployeeCodeForType(raw, typeCode || (/^[PCLF]/.test(raw) ? null : 'P'));
  const currency = str(employee.companyCurrency).toUpperCase();
  const companyCode = str(employee.companyCode).toUpperCase();
  if (currency && currency !== 'NGN') return `${base}-${currency}`;
  if (companyCode && !['DLE', 'DORMANLONG'].includes(companyCode) && !base.includes(companyCode)) return `${base}-${companyCode}`;
  return base;
};

const sageEmployeeType = (employeeCode: string) => {
  if (employeeCode.startsWith('N')) return 'NYSC';
  if (employeeCode.startsWith('I')) return 'Industrial Trainee';
  if (employeeCode.startsWith('L')) return 'Lumpsum';
  if (employeeCode.startsWith('C')) return 'Contract';
  return 'Permanent';
};

const monthlyGrossFromSagePayroll = (employee: SagePayrollEmployeeImportRow) => {
  const periodSalary = numOrNull(employee.periodSalary) || 0;
  if (periodSalary > 0) return periodSalary;
  const annualSalary = numOrNull(employee.annualSalary) || 0;
  return annualSalary > 0 ? annualSalary / 12 : null;
};

const annualGrossFromSagePayroll = (employee: SagePayrollEmployeeImportRow, monthlyGross: number | null) => {
  const annualSalary = numOrNull(employee.annualSalary) || 0;
  if (annualSalary > 0) return annualSalary;
  return monthlyGross && monthlyGross > 0 ? monthlyGross * 12 : null;
};

const permanentBasicRate = (jobGrade: unknown, employeeType: string) => {
  if (employeeType === 'Lumpsum') return 0.6;
  const grade = str(jobGrade).toUpperCase();
  if (/MGTCOLA|MGT COLA|MANAGEMENTCOLA|MANAGEMENT COLA/.test(grade)) return 0.4;
  if (/^(SNM|SMGT|SENIOR MANAGEMENT)/.test(grade)) return 0.2;
  if (/^(MGT|MGMT|MANAGEMENT)/.test(grade)) return 0.25;
  if (/^(SS|SNR|SENIOR)/.test(grade)) return 0.416;
  if (/^(JS|JNR|JR|JUNIOR)/.test(grade)) return 0.4;
  return 1;
};

const migratedBasicSalaryFromGross = (employee: SagePayrollEmployeeImportRow, employeeType: string, monthlyGross: number | null) => {
  if (!monthlyGross || monthlyGross <= 0) return null;
  if (!['Permanent', 'Lumpsum'].includes(employeeType)) return monthlyGross;
  return monthlyGross * permanentBasicRate(employee.jobGradeCode || employee.jobGrade, employeeType);
};

const sageStatus = (statusName: unknown, statusCode: unknown) => {
  const code = str(statusCode).toUpperCase();
  const name = str(statusName).toLowerCase();
  if (code === 'A' || name === 'active') return 'Active';
  if (code === 'R' || name.includes('re-instate') || name.includes('reinstate')) return 'Active';
  return str(statusName) || 'Active';
};

const sageFullName = (employee: SagePayrollEmployeeImportRow, employeeCode: string) => {
  const firstNames = str(employee.firstNames);
  const middleName = str(employee.middleName);
  const parts = [
    str(employee.title),
    firstNames,
    middleName && !firstNames.toLowerCase().includes(middleName.toLowerCase()) ? middleName : '',
    str(employee.lastName),
  ].filter(Boolean).join(' ');
  if (parts) return parts;
  const display = str(employee.displayName);
  if (display) return display;
  return parts || employeeCode;
};

const parseSourceJson = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const sourceFieldValuesJson = (employee: SagePayrollEmployeeImportRow) => {
  const sources: [string, unknown][] = [
    ['Employee.Employee', employee.sageEmployeeJson],
    ['Employee.EmployeeDetail', employee.sageEmployeeDetailJson],
    ['Employee.EmployeeContract', employee.sageEmployeeContractJson],
    ['Entity.GenEntity', employee.sageEntityJson],
    ['Company.Company', employee.sageCompanyJson],
    ['Employee.EmployeeStatus', employee.sageEmployeeStatusJson],
  ];

  const fields: { sourceTable: string; columnName: string; value: string | null }[] = [];
  for (const [sourceTable, json] of sources) {
    const row = parseSourceJson(json);
    if (!row) continue;
    for (const [columnName, value] of Object.entries(row)) {
      fields.push({
        sourceTable,
        columnName,
        value: value == null ? null : value instanceof Date ? value.toISOString() : String(value),
      });
    }
  }

  return JSON.stringify(fields);
};

const yearsSince = (v: unknown) => {
  if (!v) return 0;
  const date = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(date.getTime())) return 0;
  const today = new Date();
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (start > current) return 0;
  let years = current.getUTCFullYear() - start.getUTCFullYear();
  const anniversaryThisYear = new Date(Date.UTC(current.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  if (current < anniversaryThisYear) years -= 1;
  return Math.max(0, years);
};

const snapshot = (rec: Pick<DraftRecordLike, 'draft'>) => {
  const p = rec.draft?.personal || {};
  const c = rec.draft?.contact || {};
  const e = rec.draft?.employment || {};
  const j = rec.draft?.job || {};
  return {
    employeeCode: nullable(e.employeeId),
    fullName: `${str(p.firstName)} ${str(p.lastName)}`.trim() || null,
    officialEmail: nullable(c.officialEmail),
    personalEmail: nullable(c.personalEmail),
    primaryPhone: nullable(c.primaryPhone),
    dateOfBirth: dateOrNull(p.dateOfBirth),
    department: nullable(j.department),
    jobTitle: nullable(j.jobTitle),
  };
};

const saveAudit = async (tx: sql.Transaction, rec: DraftRecordLike) => {
  for (const item of rec.audit || []) {
    await new sql.Request(tx)
      .input('draft_id', sql.NVarChar(40), rec.draftId)
      .input('audit_action', sql.NVarChar(150), item.action)
      .input('performed_by', sql.NVarChar(128), item.performedBy)
      .input('reason', sql.NVarChar(1000), item.reason || null)
      .input('old_value', sql.NVarChar(sql.MAX), item.oldValue || null)
      .input('new_value', sql.NVarChar(sql.MAX), item.newValue || null)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM [hris].[EmployeeDraftAuditLog]
          WHERE draft_id = @draft_id AND audit_action = @audit_action AND performed_by = @performed_by
            AND ISNULL(old_value, '') = ISNULL(@old_value, '') AND ISNULL(new_value, '') = ISNULL(@new_value, '')
        )
        INSERT [hris].[EmployeeDraftAuditLog](draft_id, audit_action, performed_by, reason, old_value, new_value)
        VALUES (@draft_id, @audit_action, @performed_by, @reason, @old_value, @new_value);
      `);
  }
};

export const getEmployeeDraftFromDb = async (draftId: string): Promise<DraftRecordLike | null> => {
  const p = await pool();
  if (!p) return null;
  const rs = await p
    .request()
    .input('draft_id', sql.NVarChar(40), draftId)
    .query(`
      SELECT draft_id, draft_status, draft_payload_json, created_at, COALESCE(modified_at, created_at) AS updated_at
      FROM [hris].[EmployeeDrafts]
      WHERE draft_id = @draft_id;
      SELECT audit_action, performed_by, reason, old_value, new_value, audit_at
      FROM [hris].[EmployeeDraftAuditLog]
      WHERE draft_id = @draft_id
      ORDER BY audit_at DESC, audit_id DESC;
    `);
  const recordsets = rs.recordsets as sql.IRecordSet<any>[];
  const row = recordsets[0]?.[0];
  if (!row) return null;
  return {
    draftId: row.draft_id,
    status: row.draft_status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    draft: JSON.parse(row.draft_payload_json),
    audit: (recordsets[1] || []).map((x: any) => ({
      id: `${row.draft_id}-${new Date(x.audit_at).getTime()}`,
      at: new Date(x.audit_at).toISOString(),
      action: x.audit_action,
      performedBy: x.performed_by,
      reason: x.reason || undefined,
      oldValue: x.old_value || undefined,
      newValue: x.new_value || undefined,
    })),
  };
};

export const listEmployeeDraftsByStatusFromDb = async (statuses: string[]): Promise<DraftRecordLike[]> => {
  const p = await pool();
  if (!p || !statuses.length) return [];
  const placeholders = statuses.map((_, index) => `@status_${index}`).join(', ');
  const request = p.request();
  statuses.forEach((status, index) => request.input(`status_${index}`, sql.VarChar(30), status));
  const rs = await request.query(`
    SELECT draft_id, draft_status, draft_payload_json, created_at, COALESCE(modified_at, created_at) AS updated_at
    FROM [hris].[EmployeeDrafts]
    WHERE draft_status IN (${placeholders})
    ORDER BY COALESCE(modified_at, created_at) DESC;
  `);
  return (rs.recordset || []).map((row: any) => ({
    draftId: row.draft_id,
    status: row.draft_status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    draft: JSON.parse(row.draft_payload_json),
    audit: [],
  }));
};

export const saveEmployeeDraftToDb = async (rec: DraftRecordLike) => {
  const p = await pool();
  if (!p) return false;
  const s = snapshot(rec);
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('draft_id', sql.NVarChar(40), rec.draftId)
      .input('draft_status', sql.VarChar(30), rec.status)
      .input('draft_payload_json', sql.NVarChar(sql.MAX), JSON.stringify(rec.draft))
      .input('employee_code', sql.NVarChar(50), s.employeeCode)
      .input('full_name', sql.NVarChar(250), s.fullName)
      .input('official_email', sql.NVarChar(320), s.officialEmail)
      .input('personal_email', sql.NVarChar(320), s.personalEmail)
      .input('primary_phone', sql.NVarChar(50), s.primaryPhone)
      .input('date_of_birth', sql.Date, s.dateOfBirth)
      .input('department', sql.NVarChar(150), s.department)
      .input('job_title', sql.NVarChar(150), s.jobTitle)
      .query(`
        MERGE [hris].[EmployeeDrafts] AS target
        USING (SELECT @draft_id AS draft_id) AS source
        ON target.draft_id = source.draft_id
        WHEN MATCHED THEN UPDATE SET
          draft_status = @draft_status,
          draft_payload_json = @draft_payload_json,
          employee_code = @employee_code,
          full_name = @full_name,
          official_email = @official_email,
          personal_email = @personal_email,
          primary_phone = @primary_phone,
          date_of_birth = @date_of_birth,
          department = @department,
          job_title = @job_title,
          submitted_at = CASE WHEN @draft_status = 'submitted' AND submitted_at IS NULL THEN SYSUTCDATETIME() ELSE submitted_at END,
          modified_at = SYSUTCDATETIME(),
          modified_by = SUSER_SNAME()
        WHEN NOT MATCHED THEN INSERT (
          draft_id, draft_status, draft_payload_json, employee_code, full_name, official_email, personal_email,
          primary_phone, date_of_birth, department, job_title
        ) VALUES (
          @draft_id, @draft_status, @draft_payload_json, @employee_code, @full_name, @official_email, @personal_email,
          @primary_phone, @date_of_birth, @department, @job_title
        );
      `);
    await saveAudit(tx, rec);
    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
};

export const deleteEmployeeDraftFromDb = async (draftId: string) => {
  const p = await pool();
  if (!p) return false;
  await p.request().input('draft_id', sql.NVarChar(40), draftId).query(`
    UPDATE [hris].[EmployeeDrafts]
    SET draft_status = 'cancelled', modified_at = SYSUTCDATETIME(), modified_by = SUSER_SNAME()
    WHERE draft_id = @draft_id AND draft_status <> 'created';
  `);
  return true;
};

export const findEmployeeDuplicatesInDb = async (payload: any): Promise<DuplicateMatch[]> => {
  const p = await pool();
  if (!p) return [];
  const fullName = str(payload.fullName).toLowerCase();
  const officialEmail = str(payload.officialEmail).toLowerCase();
  const personalEmail = str(payload.personalEmail).toLowerCase();
  const primaryPhone = str(payload.primaryPhone).replace(/\s+/g, '');
  const dob = dateOrNull(payload.dateOfBirth);
  const rs = await p
    .request()
    .input('full_name', sql.NVarChar(250), fullName || null)
    .input('official_email', sql.NVarChar(320), officialEmail || null)
    .input('personal_email', sql.NVarChar(320), personalEmail || null)
    .input('primary_phone', sql.NVarChar(50), primaryPhone || null)
    .input('date_of_birth', sql.Date, dob)
    .query(`
      SELECT TOP (12) e.employee_code AS employeeId,
        CASE
          WHEN @official_email IS NOT NULL AND LOWER(c.official_email) = @official_email THEN 'Same official email'
          WHEN @personal_email IS NOT NULL AND LOWER(c.personal_email) = @personal_email THEN 'Same personal email'
          WHEN @primary_phone IS NOT NULL AND REPLACE(c.primary_phone, ' ', '') = @primary_phone THEN 'Same phone number'
          ELSE 'Same name and date of birth'
        END AS reason
      FROM [hris].[Employees] e
      LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
      LEFT JOIN [hris].[EmployeePersonalInfo] pinfo ON pinfo.employee_id = e.employee_id
      WHERE (
        (@official_email IS NOT NULL AND LOWER(c.official_email) = @official_email)
        OR (@personal_email IS NOT NULL AND LOWER(c.personal_email) = @personal_email)
        OR (@primary_phone IS NOT NULL AND REPLACE(c.primary_phone, ' ', '') = @primary_phone)
        OR (@full_name IS NOT NULL AND LOWER(e.full_name) = @full_name AND @date_of_birth IS NOT NULL AND pinfo.date_of_birth = @date_of_birth)
      );

      SELECT TOP (12) draft_id AS draftId,
        CASE
          WHEN @official_email IS NOT NULL AND LOWER(official_email) = @official_email THEN 'Draft with same official email'
          WHEN @personal_email IS NOT NULL AND LOWER(personal_email) = @personal_email THEN 'Draft with same personal email'
          WHEN @primary_phone IS NOT NULL AND REPLACE(primary_phone, ' ', '') = @primary_phone THEN 'Draft with same phone number'
          ELSE 'Draft with same name and date of birth'
        END AS reason
      FROM [hris].[EmployeeDrafts]
      WHERE draft_status IN ('draft', 'submitted', 'approved') AND (
        (@official_email IS NOT NULL AND LOWER(official_email) = @official_email)
        OR (@personal_email IS NOT NULL AND LOWER(personal_email) = @personal_email)
        OR (@primary_phone IS NOT NULL AND REPLACE(primary_phone, ' ', '') = @primary_phone)
        OR (@full_name IS NOT NULL AND LOWER(full_name) = @full_name AND @date_of_birth IS NOT NULL AND date_of_birth = @date_of_birth)
      );
    `);
  const recordsets = rs.recordsets as sql.IRecordSet<any>[];
  return [
    ...(recordsets[0] || []).map((x: any) => ({ employeeId: x.employeeId, reason: x.reason })),
    ...(recordsets[1] || []).map((x: any) => ({ draftId: x.draftId, reason: x.reason })),
  ];
};

const DIRECTORY_EMPLOYEE_FROM_SQL = `
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeePersonalInfo] pinfo ON pinfo.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeeContactInfo] contact ON contact.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeePayrollSetup] payroll ON payroll.employee_id = v.employee_id
    LEFT JOIN (
      SELECT employee_id, COUNT_BIG(*) AS emergency_contact_count
      FROM [hris].[EmployeeEmergencyContacts]
      GROUP BY employee_id
    ) ec ON ec.employee_id = v.employee_id
    LEFT JOIN (
      SELECT employee_id, COUNT_BIG(*) AS document_count
      FROM [hris].[EmployeeDocuments]
      GROUP BY employee_id
    ) doc ON doc.employee_id = v.employee_id`;

const DIRECTORY_EMPLOYEE_SELECT_SQL = `
    SELECT
      v.employee_id,
      v.employee_code,
      v.full_name,
      v.preferred_name,
      v.employment_status,
      v.employment_type,
      pinfo.title,
      pinfo.first_name,
      pinfo.middle_name,
      pinfo.last_name,
      pinfo.gender,
      pinfo.date_of_birth,
      pinfo.marital_status,
      pinfo.nationality,
      pinfo.state_of_origin,
      pinfo.local_government_area,
      pinfo.religion,
      pinfo.languages_spoken,
      v.official_email,
      v.personal_email,
      v.primary_phone,
      v.city,
      v.state,
      v.country,
      v.date_joined,
      v.work_mode,
      v.work_location,
      v.job_title,
      v.designation,
      v.job_grade,
      v.department,
      v.division,
      v.business_unit,
      v.cost_center,
      v.project_site,
      v.reporting_manager,
      v.created_at,
      v.modified_at,
      j.office_location,
      j.functional_manager,
      j.department_head,
      j.hr_business_partner,
      contact.alternate_phone,
      contact.office_extension,
      contact.residential_address,
      contact.permanent_address,
      contact.nearest_bus_stop,
      contact.postal_code,
      emp.staff_category,
      emp.employee_category,
      emp.probation_start_date,
      emp.probation_end_date,
      emp.confirmation_due_date,
      emp.contract_start_date,
      emp.shift_pattern,
      emp.contract_end_date,
      emp.expatriate_status,
      payroll.payroll_group,
      payroll.salary_grade,
      payroll.benefit_group,
      payroll.pay_currency,
      payroll.payment_run,
      payroll.payment_type,
      payroll.bank_name,
      payroll.bank_code,
      payroll.branch_name,
      payroll.branch_code,
      payroll.account_number,
      payroll.account_name,
      payroll.pension_provider,
      payroll.pension_pin,
      payroll.tax_identification_number,
      payroll.period_salary,
      payroll.basic_salary,
      payroll.latest_allowances,
      payroll.latest_deductions,
      payroll.sage_payslip_period,
      payroll.sage_earning_lines_json,
      payroll.sage_deduction_lines_json,
      payroll.sage_contribution_lines_json,
      payroll.sage_payslip_synced_at,
      payroll.sage_local_payroll_group,
      payroll.sage_local_pay_currency,
      payroll.sage_local_period_salary,
      payroll.sage_local_latest_deductions,
      payroll.sage_local_earning_lines_json,
      payroll.sage_local_deduction_lines_json,
      payroll.sage_local_contribution_lines_json,
      payroll.annual_salary,
      payroll.rate_per_hour,
      payroll.rate_per_day,
      payroll.hours_per_day,
      payroll.hours_per_period,
      payroll.setup_assigned_to_payroll,
      ISNULL(ec.emergency_contact_count, 0) AS emergency_contact_count,
      ISNULL(doc.document_count, 0) AS document_count,
      CASE
        WHEN pinfo.photo_data IS NOT NULL AND DATALENGTH(pinfo.photo_data) > 0 THEN 1
        WHEN pinfo.photo_size_bytes IS NOT NULL AND pinfo.photo_size_bytes > 0 THEN 1
        ELSE 0
      END AS has_photo
    ${DIRECTORY_EMPLOYEE_FROM_SQL}`;

const mapDirectoryEmployeeRow = (row: any): DleEmployeeDirectoryRow => {
  const rawEmployeeCode = str(row.employee_code);
  const rawEmploymentType = str(row.employment_type) || 'Not assigned';
  const typeCode = employeeTypeCodeFromRawCode(rawEmployeeCode) || inferEmployeeTypeCode(rawEmploymentType, row.staff_category, row.employee_category, row.job_title);
  const employeeCode = normalizeEmployeeCodeForType(rawEmployeeCode, typeCode);
  const employmentType = typeCode === 'N' ? 'NYSC' : typeCode === 'I' ? 'Industrial Trainee' : rawEmploymentType;
  const status = str(row.employment_status) || 'Inactive';
  const workMode = str(row.work_mode);
  const workLocation = str(row.work_location);
  const officeLocation = str(row.office_location);
  const projectSite = str(row.project_site);
  const nationality = str(row.nationality) || 'Not recorded';
  const emergencyContactCount = Number(row.emergency_contact_count || 0);
  const documentCount = Number(row.document_count || 0);
  const contractEndDate = isoDate(row.contract_end_date);
  const missingProfileBits = [row.official_email, row.primary_phone, row.date_joined, row.reporting_manager].filter((x) => !str(x)).length;
  const aiRiskScore = Math.min(95, missingProfileBits * 18 + (emergencyContactCount === 0 ? 18 : 0) + (documentCount === 0 ? 12 : 0));
  const resolvedLocation = resolveNigeriaPersonalLocation({
    nationality: row.nationality,
    country: row.country,
    stateOfOrigin: row.state_of_origin,
    localGovernmentArea: row.local_government_area,
    contactState: row.state,
    city: row.city,
  });

  return {
    id: employeeCode,
    employeeId: employeeCode,
    employeeCode,
    employeeDbId: Number(row.employee_id),
    fullName: composedEmployeeFullName(row, employeeCode),
    preferredName: str(row.preferred_name) || undefined,
    title: str(row.title),
    firstName: str(row.first_name),
    middleName: str(row.middle_name),
    lastName: str(row.last_name),
    gender: str(row.gender),
    dateOfBirth: isoDate(row.date_of_birth),
    maritalStatus: str(row.marital_status),
    email: str(row.official_email),
    officialEmail: str(row.official_email),
    personalEmail: str(row.personal_email),
    phone: str(row.primary_phone),
    primaryPhone: str(row.primary_phone),
    alternatePhone: str(row.alternate_phone),
    officeExtension: str(row.office_extension),
    residentialAddress: str(row.residential_address),
    permanentAddress: str(row.permanent_address),
    city: str(row.city),
    state: resolvedLocation.contactState || str(row.state),
    country: str(row.country),
    postalCode: str(row.postal_code),
    jobTitle: str(row.job_title) || 'Unassigned Job Title',
    designation: str(row.designation),
    jobGrade: str(row.job_grade),
    department: str(row.department) || 'Unassigned Department',
    division: str(row.division) || 'Unassigned Division',
    businessUnit: str(row.business_unit) || 'Unassigned Business Unit',
    costCenter: str(row.cost_center),
    managerName: str(row.reporting_manager) || undefined,
    functionalManager: str(row.functional_manager) || undefined,
    departmentHead: str(row.department_head) || undefined,
    hrBusinessPartner: str(row.hr_business_partner) || undefined,
    location: officeLocation || workLocation || 'Unassigned Location',
    workLocation,
    officeLocation,
    projectSite: projectSite || undefined,
    shift: (['Day', 'Night', 'Rotational'].includes(str(row.shift_pattern)) ? str(row.shift_pattern) : undefined) as DleEmployeeDirectoryRow['shift'],
    staffCategory: str(row.staff_category),
    employeeCategory: str(row.employee_category),
    employmentType,
    status,
    nationality,
    stateOfOrigin: resolvedLocation.stateOfOrigin,
    localGovernmentArea: resolvedLocation.localGovernmentArea,
    religion: str(row.religion),
    languagesSpoken: str(row.languages_spoken),
    nearestBusStop: str(row.nearest_bus_stop),
    expatriate: str(row.expatriate_status).toLowerCase() === 'expatriate' && !isLocalNationality(nationality),
    fieldWorker: Boolean(projectSite) || ['Daily Rate', 'Lumpsum'].includes(employmentType),
    remoteWorker: workMode.toLowerCase() === 'remote',
    dateJoined: isoDate(row.date_joined),
    probationStartDate: isoDate(row.probation_start_date),
    probationEndDate: isoDate(row.probation_end_date),
    confirmationDueDate: isoDate(row.confirmation_due_date),
    contractStartDate: isoDate(row.contract_start_date),
    yearsOfService: yearsSince(row.date_joined),
    contractEndDate: contractEndDate || undefined,
    emergencyContactsComplete: emergencyContactCount > 0,
    emergencyContactCount,
    documentCount,
    hasManagerAssigned: Boolean(str(row.reporting_manager)),
    hasPhoto: Number(row.has_photo || 0) === 1,
    payrollSource: 'DLE_Enterprise HRIS',
    payrollGroup: str(row.payroll_group),
    salaryGrade: str(row.salary_grade),
    benefitGroup: str(row.benefit_group),
    payCurrency: resolvePayCurrency({
      payCurrency: str(row.pay_currency),
      payrollGroup: str(row.payroll_group),
      salaryGrade: str(row.salary_grade),
      jobGrade: str(row.job_grade),
      businessUnit: str(row.business_unit),
    }),
    paymentRun: str(row.payment_run),
    paymentType: str(row.payment_type),
    bankName: str(row.bank_name),
    bankCode: withNormalizedBankCodes({
      bankName: str(row.bank_name),
      bankCode: str(row.bank_code),
      branchCode: str(row.branch_code),
    }).bankCode,
    branchName: str(row.branch_name),
    branchCode: withNormalizedBankCodes({
      bankName: str(row.bank_name),
      bankCode: str(row.bank_code),
      branchCode: str(row.branch_code),
    }).branchCode,
    accountNo: str(row.account_number),
    accountName: str(row.account_name),
    pensionProvider: str(row.pension_provider),
    pensionPin: str(row.pension_pin),
    taxIdentificationNumber: str(row.tax_identification_number),
    periodSalary: Number(row.period_salary || 0) || null,
    basicSalary: Number(row.basic_salary || 0) || null,
    latestAllowances: Number(row.latest_allowances || 0) || null,
    latestDeductions: Number(row.latest_deductions || 0) || null,
    sagePayslipPeriod: str(row.sage_payslip_period) || null,
    sagePayrollEarnings: parseSagePayrollLineItems(row.sage_earning_lines_json),
    sagePayrollDeductions: buildSagePayrollDeductionsFromLines(parseSagePayrollLineItems(row.sage_deduction_lines_json)),
    sagePayrollContributions: buildSagePayrollContributionsFromLines(parseSagePayrollLineItems(row.sage_contribution_lines_json)),
    localPayrollGroup: str(row.sage_local_payroll_group) || null,
    localPayCurrency: str(row.sage_local_pay_currency) || null,
    localPeriodSalary: Number(row.sage_local_period_salary || 0) || null,
    localLatestDeductions: Number(row.sage_local_latest_deductions || 0) || null,
    sageLocalPayrollEarnings: parseSagePayrollLineItems(row.sage_local_earning_lines_json),
    sageLocalPayrollDeductions: buildSagePayrollDeductionsFromLines(parseSagePayrollLineItems(row.sage_local_deduction_lines_json)),
    hasDualCurrencyPayroll: Boolean(str(row.sage_local_payroll_group) && str(row.sage_local_earning_lines_json)),
    annualSalary: Number(row.annual_salary || 0) || null,
    ratePerHour: Number(row.rate_per_hour || 0) || null,
    ratePerDay: Number(row.rate_per_day || 0) || null,
    hoursPerDay: Number(row.hours_per_day || 0) || null,
    hoursPerPeriod: Number(row.hours_per_period || 0) || null,
    setupAssignedToPayroll: Boolean(row.setup_assigned_to_payroll),
    sourceSystem: 'DLE_Enterprise HRIS',
    sourceEmployeeId: '',
    createdAt: isoDateTime(row.created_at),
    modifiedAt: isoDateTime(row.modified_at),
    aiRiskScore,
    trainingCompliance: aiRiskScore >= 70 ? 'Overdue' : aiRiskScore >= 40 ? 'At Risk' : 'Compliant',
  };
};

export const readEmployeeFromDbByCode = async (employeeCode: string): Promise<DleEmployeeDirectoryRow | null> => {
  const code = str(employeeCode);
  if (!code) return null;
  const p = await pool();
  if (!p) return null;
  const rs = await p.request()
    .input('employee_code', sql.NVarChar(50), code)
    .query(`${DIRECTORY_EMPLOYEE_SELECT_SQL}
    WHERE v.employee_code = @employee_code`);
  const row = rs.recordset?.[0];
  return row ? mapDirectoryEmployeeRow(row) : null;
};

export const countDirectReportsFromDb = async (employee: Pick<DleEmployeeDirectoryRow, 'fullName' | 'employeeCode'>) => {
  const code = str(employee.employeeCode);
  const fullName = str(employee.fullName);
  if (!code && !fullName) return 0;
  const p = await pool();
  if (!p) return 0;
  const rs = await p.request()
    .input('employee_code', sql.NVarChar(50), code)
    .input('full_name', sql.NVarChar(200), fullName)
    .query(`
      SELECT COUNT_BIG(1) AS team_size
      FROM [hris].[EmployeeMasterView] v
      LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
      WHERE (@employee_code = '' OR v.employee_code <> @employee_code)
        AND ISNULL(v.employment_status, '') NOT LIKE '%terminated%'
        AND ISNULL(v.employment_status, '') NOT LIKE '%resigned%'
        AND ISNULL(v.employment_status, '') NOT LIKE '%retired%'
        AND ISNULL(v.employment_status, '') NOT LIKE '%inactive%'
        AND ISNULL(v.employment_status, '') NOT LIKE '%deceased%'
        AND ISNULL(v.employment_status, '') NOT LIKE '%suspend%'
        AND (
          (@full_name <> '' AND v.reporting_manager = @full_name)
          OR (@employee_code <> '' AND v.reporting_manager = @employee_code)
          OR (@full_name <> '' AND j.functional_manager = @full_name)
          OR (@full_name <> '' AND j.department_head = @full_name)
        )`);
  return Number(rs.recordset[0]?.team_size || 0);
};

export const readEmployeeDirectoryFromDb = async (): Promise<DleEmployeeDirectoryRow[] | null> => {
  const p = await pool();
  if (!p) return null;
  const rs = await p.request().query(`${DIRECTORY_EMPLOYEE_SELECT_SQL}
    ORDER BY v.employee_code`);
  return (rs.recordset || []).map(mapDirectoryEmployeeRow);
};

export type TimesheetApprovalEmployeeMeta = {
  employeeCode: string;
  fullName: string;
  department: string;
  businessUnit: string;
  employmentType: string;
  salaryGrade: string;
  costCenter: string;
  location: string;
  payrollGroup: string;
  ratePerHour: number | null;
  ratePerDay: number | null;
};

let timesheetApprovalEmployeeMetaCache: { expiresAt: number; value: Map<string, TimesheetApprovalEmployeeMeta> } | null = null;

const normalizeEmployeeLookupKey = (value: unknown) => String(value || '').trim().toLowerCase();

const storeEmployeeMeta = (lookup: Map<string, TimesheetApprovalEmployeeMeta>, meta: TimesheetApprovalEmployeeMeta) => {
  for (const key of [meta.employeeCode, meta.fullName]) {
    const normalized = normalizeEmployeeLookupKey(key);
    if (normalized) lookup.set(normalized, meta);
  }
};

export const readTimesheetApprovalEmployeeMeta = async (_keys?: string[]): Promise<Map<string, TimesheetApprovalEmployeeMeta>> => {
  const now = Date.now();
  if (timesheetApprovalEmployeeMetaCache && timesheetApprovalEmployeeMetaCache.expiresAt > now) {
    return timesheetApprovalEmployeeMetaCache.value;
  }

  const p = await pool();
  if (!p) return new Map();

  const rs = await p.request().query(`
    SELECT
      v.employee_code,
      v.full_name,
      v.department,
      v.business_unit,
      v.employment_type,
      v.cost_center,
      COALESCE(NULLIF(v.work_location, ''), NULLIF(j.office_location, ''), '') AS location,
      payroll.salary_grade,
      payroll.payroll_group,
      payroll.rate_per_hour,
      payroll.rate_per_day
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeePayrollSetup] payroll ON payroll.employee_id = v.employee_id
  `);

  const lookup = new Map<string, TimesheetApprovalEmployeeMeta>();
  for (const row of rs.recordset || []) {
    storeEmployeeMeta(lookup, {
      employeeCode: str(row.employee_code),
      fullName: str(row.full_name),
      department: str(row.department) || 'Unassigned',
      businessUnit: str(row.business_unit) || 'DLE',
      employmentType: str(row.employment_type) || 'Unassigned',
      salaryGrade: str(row.salary_grade) || str(row.employment_type) || 'Unassigned',
      costCenter: str(row.cost_center) || str(row.department) || 'Unassigned',
      location: str(row.location) || 'Unassigned',
      payrollGroup: str(row.payroll_group) || 'Monthly Payroll',
      ratePerHour: numOrNull(row.rate_per_hour),
      ratePerDay: numOrNull(row.rate_per_day),
    });
  }

  timesheetApprovalEmployeeMetaCache = {
    expiresAt: now + Number(process.env.HRIS_TIMESHEET_APPROVAL_EMPLOYEE_CACHE_MS || 300000),
    value: lookup,
  };
  return lookup;
};

export const invalidateTimesheetApprovalEmployeeMetaCache = () => {
  timesheetApprovalEmployeeMetaCache = null;
};

const contractTypeFromEmployment = (employmentType: string, jobTitle: string, staffCategory: string) => {
  const v = `${employmentType} ${jobTitle} ${staffCategory}`.toLowerCase();
  if (v.includes('nysc')) return 'NYSC Placement';
  if (v.includes('industrial')) return 'Industrial Training';
  if (v.includes('consult')) return 'Consultancy Contract';
  if (v.includes('outsourced')) return 'Outsourced Staff Contract';
  if (v.includes('expatriate')) return 'Expatriate Contract';
  if (v.includes('daily') || v.includes('lumpsum') || v.includes('contract')) return 'Project-Based Contract';
  if (v.includes('temporary') || v.includes('intern')) return 'Temporary Contract';
  return 'Permanent Employment';
};

const contractStatusFromDates = (endDate: string | null, employmentStatus: string) => {
  const s = employmentStatus.toLowerCase();
  if (s.includes('terminated') || s.includes('resigned') || s.includes('retired')) return 'Terminated';
  if (!endDate) return 'Active';
  const endMs = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(endMs)) return 'Active';
  const days = Math.ceil((endMs - Date.now()) / (24 * 3600 * 1000));
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Due for Renewal';
  return 'Active';
};

const contractDocumentCategory = (category: string, fileName: string) => {
  const v = `${category} ${fileName}`.toLowerCase();
  if (v.includes('renewal')) return 'Renewal Letter';
  if (v.includes('amend')) return 'Amendment Letter';
  if (v.includes('offer')) return 'Offer Letter';
  if (v.includes('accept') || v.includes('signed')) return 'Signed Acceptance Copy';
  if (v.includes('legal')) return 'Legal Review Document';
  if (v.includes('termination')) return 'Termination Letter';
  return 'Employment Contract';
};

const contractDocumentStatus = (docs: DleContractDocumentRow[]): DleEmployeeContractRow['documentStatus'] => {
  if (docs.length === 0) return 'Missing';
  const hasContract = docs.some((d) => d.status === 'Active' && d.category === 'Employment Contract');
  const hasSigned = docs.some((d) => d.status === 'Active' && (d.signatureStatus === 'Signed' || d.category === 'Signed Acceptance Copy'));
  return hasContract && hasSigned ? 'Complete' : 'Partial';
};

const defaultContractTerms = (row: any, durationMonths: number | null) => ({
  durationMonths,
  workingHours: str(row.shift_pattern) ? `${str(row.shift_pattern)} shift` : null,
  workMode: str(row.work_mode) || 'Onsite',
  noticePeriodDays: null,
  renewalClause: row.contract_end_date ? 'Renewal subject to HR approval, business need, and documented performance review.' : null,
  terminationClause: 'Termination subject to DLE policy, statutory requirements, and approved exit workflow.',
  confidentialityClause: 'Employee must protect DLE confidential information, project records, client data, and operational documents.',
  nonCompeteClause: null,
  probationClause: row.probation_end_date ? 'Probation applies until the recorded probation end date.' : null,
  benefitsEligibility: str(row.employee_category) || str(row.staff_category) || null,
  leaveEligibility: 'Based on employment category and HR policy.',
  medicalEligibility: 'Based on employment category and HR policy.',
  pensionEligibility: contractTypeFromEmployment(str(row.employment_type), str(row.job_title), str(row.staff_category)) === 'Permanent Employment' ? 'Eligible subject to statutory rules' : 'Subject to contract terms',
  allowancesEligibility: 'Subject to contract terms and approved assignment.',
  overtimeEligibility: 'Subject to role, shift, and line-manager approval.',
  projectAssignmentClause: str(row.project_site) ? `Assigned to ${str(row.project_site)} unless reassigned through HR workflow.` : null,
  hseComplianceRequirement: 'Must comply with DLE HSE rules, site induction, PPE, and mandatory training.',
  travelRequirement: str(row.work_location) || str(row.office_location) || null,
});

export const readEmployeeContractsFromDb = async (employeeCode?: string): Promise<DleEmployeeContractRow[] | null> => {
  const p = await pool();
  if (!p) return null;
  const req = p.request().input('employee_code', sql.NVarChar(50), employeeCode ? employeeCode.trim().toUpperCase() : null);
  const rs = await req.query(`
    SELECT
      v.employee_id,
      v.employee_code,
      v.full_name,
      v.employment_status,
      v.employment_type,
      v.date_joined,
      v.work_mode,
      v.work_location,
      v.job_title,
      v.job_grade,
      v.department,
      v.project_site,
      v.reporting_manager,
      v.created_at,
      v.modified_at,
      j.office_location,
      j.hr_business_partner,
      emp.staff_category,
      emp.employee_category,
      emp.probation_start_date,
      emp.probation_end_date,
      emp.confirmation_due_date,
      emp.contract_start_date,
      emp.contract_end_date,
      emp.shift_pattern
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = v.employee_id
    WHERE (@employee_code IS NULL OR UPPER(v.employee_code) = @employee_code)
    ORDER BY v.employee_code;
  `);

  const rows = rs.recordset || [];
  if (rows.length === 0) return [];
  const ids = rows.map((r: any) => Number(r.employee_id)).filter((n: number) => Number.isFinite(n));
  const docsByEmployee = new Map<number, DleContractDocumentRow[]>();

  if (ids.length > 0) {
    const docReq = p.request();
    ids.forEach((id: number, idx: number) => docReq.input(`id${idx}`, sql.BigInt, id));
    const docRs = await docReq.query(`
      SELECT
        employee_id,
        document_id,
        document_category,
        file_name,
        mime_type,
        size_bytes,
        expires_at,
        document_status,
        verified_at,
        verified_by,
        created_at,
        created_by
      FROM [hris].[EmployeeDocuments]
      WHERE employee_id IN (${ids.map((_, idx) => `@id${idx}`).join(',')})
        AND (
          LOWER(document_category) LIKE '%contract%'
          OR LOWER(document_category) LIKE '%offer%'
          OR LOWER(document_category) LIKE '%agreement%'
          OR LOWER(file_name) LIKE '%contract%'
          OR LOWER(file_name) LIKE '%offer%'
          OR LOWER(file_name) LIKE '%agreement%'
          OR LOWER(file_name) LIKE '%accept%'
        )
      ORDER BY employee_id, created_at DESC, document_id DESC;
    `);

    for (const d of docRs.recordset || []) {
      const employeeId = Number(d.employee_id);
      const category = contractDocumentCategory(str(d.document_category), str(d.file_name));
      const statusRaw = str(d.document_status).toLowerCase();
      const doc: DleContractDocumentRow = {
        id: `db-doc-${String(d.document_id)}`,
        category,
        name: str(d.file_name) || `${category}.pdf`,
        version: 1,
        mimeType: str(d.mime_type) || 'application/octet-stream',
        sizeBytes: Number(d.size_bytes || 0),
        signatureStatus: statusRaw === 'verified' || category === 'Signed Acceptance Copy' ? 'Signed' : 'Unsigned',
        legalReviewStatus: category === 'Legal Review Document' ? (statusRaw === 'rejected' ? 'Rejected' : statusRaw === 'verified' ? 'Approved' : 'Pending') : 'Not Required',
        expiryDate: isoDate(d.expires_at) || null,
        status: statusRaw === 'expired' || statusRaw === 'rejected' ? 'Archived' : 'Active',
        uploadedAt: isoDateTime(d.created_at) || new Date().toISOString(),
        uploadedBy: str(d.created_by) || str(d.verified_by) || 'DLE_Enterprise HRIS',
      };
      docsByEmployee.set(employeeId, [...(docsByEmployee.get(employeeId) || []), doc]);
    }
  }

  return rows.map((row: any) => {
    const employeeCode = str(row.employee_code).toUpperCase();
    const startDate = isoDate(row.contract_start_date) || isoDate(row.date_joined) || '';
    const endDate = isoDate(row.contract_end_date) || null;
    const contractType = contractTypeFromEmployment(str(row.employment_type), str(row.job_title), str(row.staff_category));
    const contractStatus = contractStatusFromDates(endDate, str(row.employment_status));
    const docs = docsByEmployee.get(Number(row.employee_id)) || [];
    const startMs = startDate ? new Date(`${startDate}T00:00:00.000Z`).getTime() : NaN;
    const endMs = endDate ? new Date(`${endDate}T00:00:00.000Z`).getTime() : NaN;
    const durationMonths = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(1, Math.round((endMs - startMs) / (30.4375 * 24 * 3600 * 1000))) : null;
    const createdAt = isoDateTime(row.created_at) || new Date().toISOString();
    const updatedAt = isoDateTime(row.modified_at) || createdAt;

    return {
      id: `db-contract-${employeeCode}`,
      employeeId: employeeCode,
      employeeName: str(row.full_name) || employeeCode,
      contractReferenceNo: `DLE-HRIS-${employeeCode}`,
      contractType,
      contractCategory: str(row.staff_category) || str(row.employee_category) || 'Standard',
      contractStatus,
      workflowStatus: contractStatus === 'Expired' ? 'Expired' : contractStatus === 'Terminated' ? 'Terminated' : 'Active',
      startDate,
      endDate,
      probationApplicable: Boolean(row.probation_start_date || row.probation_end_date || row.confirmation_due_date),
      probationStartDate: isoDate(row.probation_start_date) || null,
      probationEndDate: isoDate(row.probation_end_date) || null,
      confirmationDueDate: isoDate(row.confirmation_due_date) || null,
      department: str(row.department) || null,
      jobTitle: str(row.job_title) || null,
      jobGrade: str(row.job_grade) || null,
      workLocation: str(row.work_location) || str(row.office_location) || null,
      reportingManager: str(row.reporting_manager) || null,
      hrOfficer: str(row.hr_business_partner) || null,
      renewalStatus: contractStatus === 'Due for Renewal' ? 'Renewal Required' : contractStatus === 'Expired' ? 'Overdue' : endDate ? 'Monitored' : 'Not Required',
      approvalStatus: 'Approved' as const,
      documentStatus: contractDocumentStatus(docs),
      lastAmendmentAt: null,
      terms: defaultContractTerms(row, durationMonths),
      documents: docs,
      approvals: [],
      audit: [
        {
          id: `db-aud-${employeeCode}-loaded`,
          at: updatedAt,
          action: 'Contract loaded from DLE_Enterprise HRIS employment records',
          performedBy: 'DLE_Enterprise HRIS',
          reason: 'Derived from EmployeeEmploymentInfo and EmployeeMasterView',
        },
      ],
      createdBy: 'DLE_Enterprise HRIS',
      createdAt,
      updatedBy: 'DLE_Enterprise HRIS',
      updatedAt,
    };
  });
};

export const readEmployeeContractFromDb = async (contractId: string): Promise<DleEmployeeContractRow | null> => {
  const id = contractId.startsWith('db-contract-') ? contractId.slice('db-contract-'.length) : contractId;
  const rows = await readEmployeeContractsFromDb(id);
  return rows?.[0] || null;
};

export const importSagePayrollEmployeesToDb = async (employees: SagePayrollEmployeeImportRow[]) => {
  const p = await pool();
  if (!p) return null;

  let inserted = 0;
  let updated = 0;
  const failures: { employeeId: string; employeeCode: string; error: string }[] = [];

  for (const employee of employees) {
    const employeeCode = sageEmployeeCode(employee);
    const employeeType = sageEmployeeType(employeeCode);
    const fullName = sageFullName(employee, employeeCode);
    const firstName = str(employee.firstNames) || fullName;
    const lastName = str(employee.lastName) || fullName;
    const sourceEmployeeId = String(employee.employeeId);
    const nationality = str(employee.nationality);
    const isExpatriate = Boolean(nationality && !isLocalNationality(nationality));
    const monthlyGrossSalary = monthlyGrossFromSagePayroll(employee);
    const annualGrossSalary = annualGrossFromSagePayroll(employee, monthlyGrossSalary);
    const migratedBasicSalary = migratedBasicSalaryFromGross(employee, employeeType, monthlyGrossSalary);
    const rawPayloadJson = JSON.stringify({ ...employee, directoryEmployeeCode: employeeCode });
    const sourceFieldsJson = sourceFieldValuesJson(employee);
    const tx = new sql.Transaction(p);

    try {
      await tx.begin();
      const request = new sql.Request(tx)
        .input('employee_code', sql.NVarChar(50), employeeCode)
        .input('full_name', sql.NVarChar(250), fullName)
        .input('employment_status', sql.VarChar(40), sageStatus(employee.statusName, employee.statusCode))
        .input('employment_type', sql.VarChar(40), employeeType)
        .input('source_employee_id', sql.NVarChar(80), sourceEmployeeId)
        .input('preferred_name', sql.NVarChar(150), str(employee.knownAsName) || null)
        .input('title', sql.NVarChar(30), str(employee.title) || null)
        .input('first_name', sql.NVarChar(100), firstName.slice(0, 100))
        .input('middle_name', sql.NVarChar(100), str(employee.middleName) || null)
        .input('last_name', sql.NVarChar(100), lastName.slice(0, 100))
        .input('gender', sql.NVarChar(40), str(employee.gender) || null)
        .input('date_of_birth', sql.Date, sourceDate(employee.birthDate))
        .input('marital_status', sql.NVarChar(50), str(employee.maritalStatus) || null)
        .input('nationality', sql.NVarChar(100), nationality || null)
        .input('state_of_origin', sql.NVarChar(100), isLocalNationality(nationality) ? str(employee.physicalProvince) || null : null)
        .input('official_email', sql.NVarChar(320), str(employee.emailAddress) || null)
        .input('primary_phone', sql.NVarChar(50), str(employee.cellNo) || null)
        .input('alternate_phone', sql.NVarChar(50), str(employee.homeTelNo || employee.workTelNo) || null)
        .input('office_extension', sql.NVarChar(30), str(employee.workTelNo) || null)
        .input('residential_address', sql.NVarChar(1000), str(employee.physicalAddress) || null)
        .input('permanent_address', sql.NVarChar(1000), str(employee.postalAddress || employee.physicalAddress) || null)
        .input('city', sql.NVarChar(120), str(employee.physicalCityTown || employee.postalCityTown) || null)
        .input('state', sql.NVarChar(120), str(employee.physicalProvince) || null)
        .input('country', sql.NVarChar(120), str(employee.physicalCountryCode) || null)
        .input('postal_code', sql.NVarChar(30), str(employee.physicalPostalCode || employee.postalPostalCode) || null)
        .input('employee_type_name', sql.NVarChar(100), str(employee.hierarchyEmployeeTypeName) || employeeType)
        .input('date_joined_group', sql.Date, sourceDate(employee.dateJoinedGroup))
        .input('date_engaged', sql.Date, sourceDate(employee.dateEngaged))
        .input('probation_end_date', sql.Date, sourceDate(employee.probationPeriodEndDate))
        .input('contract_start_date', sql.Date, sourceDate(employee.contractStartDate))
        .input('contract_end_date', sql.Date, sourceDate(employee.contractExpiryDate))
        .input('work_location', sql.NVarChar(150), str(employee.siteName || employee.hierarchyLocationName) || null)
        .input('expatriate_status', sql.NVarChar(80), isExpatriate ? 'Expatriate' : 'Local')
        .input('job_title', sql.NVarChar(150), str(employee.jobTitle) || null)
        .input('job_grade', sql.NVarChar(80), str(employee.jobGradeCode || employee.jobGrade) || null)
        .input('designation', sql.NVarChar(150), str(employee.jobTitleCode) || null)
        .input('department', sql.NVarChar(150), str(employee.departmentName || employee.hierarchyDepartmentName) || null)
        .input('department_code', sql.NVarChar(80), str(employee.departmentCode || employee.hierarchyDepartmentCode) || null)
        .input('company_code', sql.NVarChar(80), str(employee.companyCode) || null)
        .input('company_name', sql.NVarChar(150), str(employee.companyName) || null)
        .input('company_currency', sql.NVarChar(10), str(employee.companyCurrency) || null)
        .input('payment_type', sql.NVarChar(100), str(employee.paymentType) || null)
        .input('payment_run', sql.NVarChar(150), str(employee.paymentRunLong || employee.paymentRunShort) || null)
        .input('remuneration_definition', sql.NVarChar(250), str(employee.remunerationDefinition) || null)
        .input('tax_no', sql.NVarChar(80), str(employee.taxNo) || null)
        .input('bank_name', sql.NVarChar(150), str(employee.bankName) || null)
        .input('account_number', sql.NVarChar(50), str(employee.accountNo) || null)
        .input('account_name', sql.NVarChar(250), str(employee.accountName) || null)
        .input('annual_salary', sql.Decimal(19, 4), annualGrossSalary)
        .input('period_salary', sql.Decimal(19, 4), monthlyGrossSalary)
        .input('basic_salary', sql.Decimal(19, 4), migratedBasicSalary)
        .input('rate_per_hour', sql.Decimal(19, 4), numOrNull(employee.ratePerHour))
        .input('rate_per_day', sql.Decimal(19, 4), numOrNull(employee.ratePerDay))
        .input('hours_per_day', sql.Decimal(9, 4), numOrNull(employee.hoursPerDay))
        .input('hours_per_period', sql.Decimal(9, 4), numOrNull(employee.hoursPerPeriod))
        .input('site_code', sql.NVarChar(150), str(employee.siteCode || employee.hierarchyLocationCode) || null)
        .input('site_name', sql.NVarChar(150), str(employee.siteName || employee.hierarchyLocationName) || null)
        .input('manager_name', sql.NVarChar(250), str(employee.managerName) || null)
        .input('source_employee_code', sql.NVarChar(80), str(employee.employeeCode) || null)
        .input('source_entity_code', sql.NVarChar(80), str(employee.entityCode) || null)
        .input('source_status_code', sql.NVarChar(80), str(employee.statusCode) || null)
        .input('source_status_name', sql.NVarChar(150), str(employee.statusName) || null)
        .input('raw_payload_json', sql.NVarChar(sql.MAX), rawPayloadJson)
        .input('source_fields_json', sql.NVarChar(sql.MAX), sourceFieldsJson);

      const result = await request.query(`
        DECLARE @employee_id bigint;
        DECLARE @was_insert bit = 0;

        SELECT @employee_id = employee_id
        FROM [hris].[EmployeeSourceRecords] WITH (UPDLOCK, HOLDLOCK)
        WHERE source_system = N'Sage 300 People Payroll'
          AND source_employee_id = @source_employee_id;

        IF @employee_id IS NULL
        BEGIN
          SELECT @employee_id = employee_id
          FROM [hris].[Employees] WITH (UPDLOCK, HOLDLOCK)
          WHERE employee_code = @employee_code;

          IF @employee_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM [hris].[EmployeeSourceRecords] src
              WHERE src.employee_id = @employee_id
                AND src.source_system = N'Sage 300 People Payroll'
                AND src.source_employee_id <> @source_employee_id
            )
          BEGIN
            SELECT NULL AS employee_id, 0 AS was_insert, N'duplicate-sage-record' AS skip_reason;
            RETURN;
          END;
        END;

        IF @employee_id IS NOT NULL
        BEGIN
          DECLARE @primary_source_employee_id nvarchar(80);
          SELECT TOP 1 @primary_source_employee_id = src.source_employee_id
          FROM [hris].[EmployeeSourceRecords] src
          WHERE src.employee_id = @employee_id
            AND src.source_system = N'Sage 300 People Payroll'
          ORDER BY TRY_CONVERT(int, src.source_employee_id), src.source_employee_id;

          IF @primary_source_employee_id IS NOT NULL AND @primary_source_employee_id <> @source_employee_id
          BEGIN
            SELECT NULL AS employee_id, 0 AS was_insert, N'non-primary-sage-record' AS skip_reason;
            RETURN;
          END;
        END;

        IF @employee_id IS NULL
        BEGIN
          INSERT [hris].[Employees](employee_code, full_name, employment_status, employment_type)
          VALUES (@employee_code, @full_name, @employment_status, @employment_type);
          SET @employee_id = CONVERT(bigint, SCOPE_IDENTITY());
          SET @was_insert = 1;
        END
        ELSE
        BEGIN
          UPDATE [hris].[Employees]
          SET full_name = @full_name,
              employment_status = @employment_status,
              employment_type = @employment_type,
              modified_at = SYSUTCDATETIME(),
              modified_by = SUSER_SNAME()
          WHERE employee_id = @employee_id;
        END;

        MERGE [hris].[EmployeePersonalInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          title = COALESCE(NULLIF(@title, N''), target.title),
          first_name = COALESCE(NULLIF(@first_name, N''), target.first_name),
          middle_name = COALESCE(NULLIF(@middle_name, N''), target.middle_name),
          last_name = COALESCE(NULLIF(@last_name, N''), target.last_name),
          preferred_name = COALESCE(NULLIF(@preferred_name, N''), target.preferred_name),
          gender = COALESCE(NULLIF(@gender, N''), target.gender),
          date_of_birth = COALESCE(@date_of_birth, target.date_of_birth),
          marital_status = COALESCE(NULLIF(@marital_status, N''), target.marital_status),
          nationality = COALESCE(NULLIF(@nationality, N''), target.nationality),
          state_of_origin = COALESCE(NULLIF(@state_of_origin, N''), target.state_of_origin),
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, title, first_name, middle_name, last_name, preferred_name, gender, date_of_birth, marital_status, nationality, state_of_origin
        )
        VALUES (
          @employee_id, @title, @first_name, @middle_name, @last_name, @preferred_name, @gender, @date_of_birth, @marital_status, @nationality, @state_of_origin
        );

        MERGE [hris].[EmployeeContactInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          official_email = CASE
            WHEN @official_email IS NOT NULL AND EXISTS (SELECT 1 FROM [hris].[EmployeeContactInfo] c WHERE c.official_email = @official_email AND c.employee_id <> @employee_id)
              THEN target.official_email
            ELSE COALESCE(NULLIF(@official_email, N''), target.official_email)
          END,
          primary_phone = COALESCE(NULLIF(@primary_phone, N''), target.primary_phone),
          alternate_phone = COALESCE(NULLIF(@alternate_phone, N''), target.alternate_phone),
          office_extension = COALESCE(NULLIF(@office_extension, N''), target.office_extension),
          residential_address = COALESCE(NULLIF(@residential_address, N''), target.residential_address),
          permanent_address = COALESCE(NULLIF(@permanent_address, N''), target.permanent_address),
          city = COALESCE(NULLIF(@city, N''), target.city),
          state = COALESCE(NULLIF(@state, N''), target.state),
          country = COALESCE(NULLIF(@country, N''), target.country),
          postal_code = COALESCE(NULLIF(@postal_code, N''), target.postal_code),
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, official_email, primary_phone, alternate_phone, office_extension, residential_address, permanent_address, city, state, country, postal_code
        )
        VALUES (
          @employee_id,
          CASE WHEN @official_email IS NOT NULL AND EXISTS (SELECT 1 FROM [hris].[EmployeeContactInfo] c WHERE c.official_email = @official_email) THEN NULL ELSE @official_email END,
          @primary_phone,
          @alternate_phone,
          @office_extension,
          @residential_address,
          @permanent_address,
          @city,
          @state,
          @country,
          @postal_code
        );

        MERGE [hris].[EmployeeEmploymentInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          staff_category = COALESCE(NULLIF(@employee_type_name, N''), target.staff_category),
          employee_category = COALESCE(NULLIF(@employee_type_name, N''), target.employee_category),
          date_joined = CASE
            WHEN @date_joined_group IS NOT NULL OR @date_engaged IS NOT NULL
              THEN COALESCE(@date_joined_group, @date_engaged)
            ELSE target.date_joined
          END,
          probation_end_date = COALESCE(@probation_end_date, target.probation_end_date),
          contract_start_date = COALESCE(@contract_start_date, target.contract_start_date),
          contract_end_date = COALESCE(@contract_end_date, target.contract_end_date),
          work_location = COALESCE(NULLIF(@work_location, N''), target.work_location),
          expatriate_status = COALESCE(NULLIF(@expatriate_status, N''), target.expatriate_status),
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, staff_category, employee_category, date_joined, probation_end_date, contract_start_date, contract_end_date, work_location, expatriate_status
        ) VALUES (
          @employee_id, @employee_type_name, @employee_type_name, COALESCE(@date_joined_group, @date_engaged), @probation_end_date, @contract_start_date, @contract_end_date, @work_location, @expatriate_status
        );

        MERGE [hris].[EmployeeJobInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          job_title = COALESCE(NULLIF(@job_title, N''), target.job_title),
          designation = COALESCE(NULLIF(@designation, N''), target.designation),
          job_grade = COALESCE(NULLIF(@job_grade, N''), target.job_grade),
          department = COALESCE(NULLIF(@department, N''), target.department),
          division = COALESCE(NULLIF(@department_code, N''), target.division),
          business_unit = COALESCE(NULLIF(@company_code, N''), target.business_unit),
          cost_center = COALESCE(NULLIF(@department_code, N''), target.cost_center),
          project_site = COALESCE(NULLIF(@site_code, N''), target.project_site),
          office_location = COALESCE(NULLIF(@site_name, N''), target.office_location),
          reporting_manager = COALESCE(NULLIF(@manager_name, N''), target.reporting_manager),
          role_profile = COALESCE(NULLIF(@employee_type_name, N''), target.role_profile),
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, job_title, designation, job_grade, department, division, business_unit, cost_center, project_site, office_location, reporting_manager, role_profile
        ) VALUES (
          @employee_id, @job_title, @designation, @job_grade, @department, @department_code, @company_code, @department_code, @site_code, @site_name, @manager_name, @employee_type_name
        );

        MERGE [hris].[EmployeePayrollSetup] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          payroll_group = COALESCE(NULLIF(@company_code, N''), target.payroll_group),
          salary_grade = COALESCE(NULLIF(@job_grade, N''), target.salary_grade),
          basic_salary = COALESCE(NULLIF(@basic_salary, 0), target.basic_salary),
          pay_frequency = COALESCE(NULLIF(@payment_run, N''), target.pay_frequency),
          bank_name = COALESCE(NULLIF(@bank_name, N''), target.bank_name),
          account_number = COALESCE(NULLIF(@account_number, N''), target.account_number),
          account_name = COALESCE(NULLIF(@account_name, N''), target.account_name),
          tax_identification_number = COALESCE(NULLIF(@tax_no, N''), target.tax_identification_number),
          pay_currency = COALESCE(NULLIF(@company_currency, N''), target.pay_currency),
          payment_type = COALESCE(NULLIF(@payment_type, N''), target.payment_type),
          payment_run = COALESCE(NULLIF(@payment_run, N''), target.payment_run),
          remuneration_structure = COALESCE(NULLIF(@remuneration_definition, N''), target.remuneration_structure),
          annual_salary = COALESCE(NULLIF(@annual_salary, 0), target.annual_salary),
          period_salary = COALESCE(NULLIF(@period_salary, 0), target.period_salary),
          rate_per_hour = COALESCE(NULLIF(@rate_per_hour, 0), target.rate_per_hour),
          rate_per_day = COALESCE(NULLIF(@rate_per_day, 0), target.rate_per_day),
          hours_per_day = COALESCE(NULLIF(@hours_per_day, 0), target.hours_per_day),
          hours_per_period = COALESCE(NULLIF(@hours_per_period, 0), target.hours_per_period),
          setup_assigned_to_payroll = 1,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, payroll_group, salary_grade, basic_salary, pay_frequency, bank_name, account_number, account_name,
          tax_identification_number, pay_currency, payment_type, payment_run, remuneration_structure, annual_salary,
          period_salary, rate_per_hour, rate_per_day, hours_per_day, hours_per_period, setup_assigned_to_payroll
        )
        VALUES (
          @employee_id, @company_code, @job_grade, @basic_salary, @payment_run, @bank_name, @account_number, @account_name,
          @tax_no, @company_currency, @payment_type, @payment_run, @remuneration_definition, @annual_salary,
          @period_salary, @rate_per_hour, @rate_per_day, @hours_per_day, @hours_per_period, 1
        );

        MERGE [hris].[EmployeeSourceRecords] AS target
        USING (SELECT N'Sage 300 People Payroll' AS source_system, @source_employee_id AS source_employee_id) AS source
        ON target.source_system = source.source_system
        AND target.source_employee_id = source.source_employee_id
        WHEN MATCHED THEN UPDATE SET
          employee_id = @employee_id,
          source_employee_code = @source_employee_code,
          source_entity_code = @source_entity_code,
          source_company_code = @company_code,
          source_company_currency = @company_currency,
          source_pay_run = @payment_run,
          source_remuneration_definition = @remuneration_definition,
          source_status_code = @source_status_code,
          source_status_name = @source_status_name,
          raw_payload_json = @raw_payload_json,
          imported_at = SYSUTCDATETIME(),
          imported_by = SUSER_SNAME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, source_system, source_employee_id, source_employee_code, source_entity_code, source_company_code,
          source_company_currency, source_pay_run, source_remuneration_definition, source_status_code, source_status_name, raw_payload_json
        ) VALUES (
          @employee_id, N'Sage 300 People Payroll', @source_employee_id, @source_employee_code, @source_entity_code, @company_code,
          @company_currency, @payment_run, @remuneration_definition, @source_status_code, @source_status_name, @raw_payload_json
        );

        DECLARE @employee_source_record_id bigint;
        SELECT @employee_source_record_id = employee_source_record_id
        FROM [hris].[EmployeeSourceRecords]
        WHERE source_system = N'Sage 300 People Payroll'
          AND source_employee_id = @source_employee_id;

        MERGE [hris].[EmployeeSourceFieldValues] AS target
        USING (
          SELECT
            @employee_source_record_id AS employee_source_record_id,
            N'Sage 300 People Payroll' AS source_system,
            @source_employee_id AS source_employee_id,
            JSON_VALUE([value], '$.sourceTable') AS source_table,
            JSON_VALUE([value], '$.columnName') AS source_column_name,
            JSON_VALUE([value], '$.value') AS source_value
          FROM OPENJSON(@source_fields_json)
          WHERE JSON_VALUE([value], '$.sourceTable') IS NOT NULL
            AND JSON_VALUE([value], '$.columnName') IS NOT NULL
        ) AS source
        ON target.employee_source_record_id = source.employee_source_record_id
        AND target.source_table = source.source_table
        AND target.source_column_name = source.source_column_name
        WHEN MATCHED THEN UPDATE SET
          source_value = source.source_value,
          imported_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_source_record_id, source_system, source_employee_id, source_table, source_column_name, source_value
        ) VALUES (
          source.employee_source_record_id, source.source_system, source.source_employee_id, source.source_table, source.source_column_name, source.source_value
        );

        INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
        VALUES (@employee_id, N'Sage payroll employee import', SUSER_SNAME(), N'Imported/upserted from Sage 300 People Payroll');

        SELECT @employee_id AS employee_id, @was_insert AS was_insert, NULL AS skip_reason;
      `);

      const importRow = result.recordset[0];
      if (!importRow?.employee_id) {
        await tx.rollback();
        continue;
      }

      await tx.commit();
      if (importRow.was_insert) inserted++;
      else updated++;
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      failures.push({
        employeeId: String(employee.employeeId || ''),
        employeeCode,
        error: error instanceof Error ? error.message : 'Unknown import error',
      });
    }
  }

  return {
    sourceCount: employees.length,
    inserted,
    updated,
    failed: failures.length,
    failures: failures.slice(0, 50),
  };
};

export const previewNextEmployeeCodeFromDb = async (employeeType: string) => {
  const code = employeeTypeCode(employeeType);
  if (!code) return null;
  const p = await pool();
  if (!p) return null;
  if (code === 'N' || code === 'I') {
    const employeeCodePrefix = employeeCodePrefixForTypeCode(code);
    const rs = await p
      .request()
      .input('type_code', sql.Char(1), code)
      .input('employee_code_prefix', sql.NVarChar(10), employeeCodePrefix)
      .query(`
        SELECT
          ISNULL((
            SELECT MAX(TRY_CONVERT(int,
              CASE
                WHEN employee_code LIKE 'P' + @employee_code_prefix + '[0-9]%' THEN SUBSTRING(employee_code, LEN(@employee_code_prefix) + 2, 20)
                WHEN employee_code LIKE @employee_code_prefix + '[0-9]%' THEN SUBSTRING(employee_code, LEN(@employee_code_prefix) + 1, 20)
              END
            ))
            FROM [hris].[Employees]
            WHERE employee_code LIKE @employee_code_prefix + '[0-9]%'
              OR employee_code LIKE 'P' + @employee_code_prefix + '[0-9]%'
          ), 0) AS latest_employee,
          ISNULL((
            SELECT last_sequence
            FROM [hris].[EmployeeCodeCounters]
            WHERE employee_type_code = @type_code
          ), 0) AS latest_counter;
      `);
    const row = rs.recordset[0];
    const next = Math.max(Number(row?.latest_employee || 0), Number(row?.latest_counter || 0)) + 1;
    return `${employeeCodePrefix}${String(next).padStart(4, '0')}`;
  }
  const rs = await p
    .request()
    .input('type_code', sql.Char(1), code)
    .query(`
      SELECT
        ISNULL((
          SELECT MAX(TRY_CONVERT(int, SUBSTRING(employee_code, 2, 20)))
          FROM [hris].[Employees]
          WHERE employee_code LIKE @type_code + '[0-9][0-9][0-9][0-9]%'
            AND TRY_CONVERT(int, SUBSTRING(employee_code, 2, 20)) IS NOT NULL
        ), 0) AS latest_employee,
        ISNULL((
          SELECT last_sequence
          FROM [hris].[EmployeeCodeCounters]
          WHERE employee_type_code = @type_code
        ), 0) AS latest_counter;
    `);
  const row = rs.recordset[0];
  const next = Math.max(Number(row?.latest_employee || 0), Number(row?.latest_counter || 0)) + 1;
  return `${code}${String(next).padStart(4, '0')}`;
};

export const nextEmployeeCodeFromDb = async (employeeType: string) => {
  const p = await pool();
  if (!p) return null;
  const typeCode = employeeTypeCode(employeeType);
  if (typeCode === 'N' || typeCode === 'I') {
    const employeeCodePrefix = employeeCodePrefixForTypeCode(typeCode);
    const tx = new sql.Transaction(p);
    await tx.begin();
    try {
      const rs = await new sql.Request(tx)
        .input('type_code', sql.Char(1), typeCode)
        .input('employee_code_prefix', sql.NVarChar(10), employeeCodePrefix)
        .query(`
          SELECT
            ISNULL((
              SELECT MAX(TRY_CONVERT(int,
                CASE
                  WHEN employee_code LIKE 'P' + @employee_code_prefix + '[0-9]%' THEN SUBSTRING(employee_code, LEN(@employee_code_prefix) + 2, 20)
                  WHEN employee_code LIKE @employee_code_prefix + '[0-9]%' THEN SUBSTRING(employee_code, LEN(@employee_code_prefix) + 1, 20)
                END
              ))
              FROM [hris].[Employees]
              WHERE employee_code LIKE @employee_code_prefix + '[0-9]%'
                OR employee_code LIKE 'P' + @employee_code_prefix + '[0-9]%'
            ), 0) AS latest_employee,
            ISNULL((
              SELECT last_sequence
              FROM [hris].[EmployeeCodeCounters] WITH (UPDLOCK, HOLDLOCK)
              WHERE employee_type_code = @type_code
            ), 0) AS latest_counter;
        `);
      const row = rs.recordset[0];
      const next = Math.max(Number(row?.latest_employee || 0), Number(row?.latest_counter || 0)) + 1;
      await new sql.Request(tx)
        .input('type_code', sql.Char(1), typeCode)
        .input('last_sequence', sql.Int, next)
        .query(`
          MERGE [hris].[EmployeeCodeCounters] AS target
          USING (SELECT @type_code AS employee_type_code, @last_sequence AS last_sequence) AS source
          ON target.employee_type_code = source.employee_type_code
          WHEN MATCHED THEN UPDATE SET last_sequence = source.last_sequence
          WHEN NOT MATCHED THEN INSERT (employee_type_code, last_sequence) VALUES (source.employee_type_code, source.last_sequence);
        `);
      await tx.commit();
      return `${employeeCodePrefix}${String(next).padStart(4, '0')}`;
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    }
  }
  const request = p.request();
  request.input('EmployeeTypeName', sql.NVarChar(40), employeeType);
  request.output('EmployeeCode', sql.NVarChar(50));
  const rs = await request.execute('[hris].[usp_AllocateEmployeeCode]');
  return normalizeEmployeeCodeForType(String(rs.output.EmployeeCode || ''), typeCode);
};

export const updateEmployeeDailyRatePayInDb = async (input: {
  employeeDbId: number;
  payrollGroup?: string | null;
  salaryGrade?: string | null;
  payCurrency?: string | null;
  paymentRun?: string | null;
  paymentType?: string | null;
  periodSalary?: number | null;
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  hoursPerDay?: number | null;
  hoursPerPeriod?: number | null;
}) => {
  const p = await pool();
  if (!p) return false;
  await p.request()
    .input('employee_id', sql.BigInt, input.employeeDbId)
    .input('payroll_group', sql.NVarChar(100), nullable(input.payrollGroup))
    .input('salary_grade', sql.NVarChar(80), nullable(input.salaryGrade))
    .input('pay_currency', sql.NVarChar(10), nullable(input.payCurrency || 'NGN'))
    .input('payment_run', sql.NVarChar(80), nullable(input.paymentRun || 'Daily Timesheet'))
    .input('payment_type', sql.NVarChar(80), nullable(input.paymentType || 'Timesheet Rate'))
    .input('period_salary', sql.Decimal(19, 4), numOrNull(input.periodSalary))
    .input('rate_per_day', sql.Decimal(19, 4), numOrNull(input.ratePerDay))
    .input('rate_per_hour', sql.Decimal(19, 4), numOrNull(input.ratePerHour))
    .input('hours_per_day', sql.Decimal(9, 4), numOrNull(input.hoursPerDay))
    .input('hours_per_period', sql.Decimal(9, 4), numOrNull(input.hoursPerPeriod))
    .query(`
      MERGE [hris].[EmployeePayrollSetup] AS target
      USING (SELECT @employee_id AS employee_id) AS source
      ON target.employee_id = source.employee_id
      WHEN MATCHED THEN UPDATE SET
        payroll_group = COALESCE(@payroll_group, target.payroll_group),
        salary_grade = COALESCE(@salary_grade, target.salary_grade),
        pay_currency = COALESCE(@pay_currency, target.pay_currency),
        payment_run = COALESCE(@payment_run, target.payment_run),
        payment_type = COALESCE(@payment_type, target.payment_type),
        period_salary = @period_salary,
        rate_per_day = @rate_per_day,
        rate_per_hour = @rate_per_hour,
        hours_per_day = @hours_per_day,
        hours_per_period = @hours_per_period,
        setup_assigned_to_payroll = 1
      WHEN NOT MATCHED THEN INSERT (
        employee_id, payroll_group, salary_grade, pay_currency, payment_run, payment_type,
        period_salary, rate_per_day, rate_per_hour, hours_per_day, hours_per_period, setup_assigned_to_payroll
      ) VALUES (
        @employee_id, @payroll_group, @salary_grade, @pay_currency, @payment_run, @payment_type,
        @period_salary, @rate_per_day, @rate_per_hour, @hours_per_day, @hours_per_period, 1
      );
    `);
  return true;
};

export const updateEmployeeContractPayrollClassificationInDb = async (input: {
  employeeDbId: number;
  action: 'deactivate-non-daily' | 'activate-daily-rate';
  reason?: string | null;
}) => {
  const p = await pool();
  if (!p) return false;
  const employmentStatus = input.action === 'deactivate-non-daily' ? 'Inactive' : 'Active';
  const employmentType = input.action === 'deactivate-non-daily' ? 'Contract' : 'Daily Rate';
  await p.request()
    .input('employee_id', sql.BigInt, input.employeeDbId)
    .input('employment_status', sql.VarChar(40), employmentStatus)
    .input('employment_type', sql.VarChar(40), employmentType)
    .query(`
      UPDATE [hris].[Employees]
      SET employment_status = @employment_status,
          employment_type = @employment_type,
          modified_at = SYSUTCDATETIME(),
          modified_by = SUSER_SNAME()
      WHERE employee_id = @employee_id;
    `);
  if (input.action === 'activate-daily-rate') {
    await updateEmployeeDailyRatePayInDb({
      employeeDbId: input.employeeDbId,
      payrollGroup: 'DLE',
      salaryGrade: 'Daily Rate',
      paymentRun: 'Daily Timesheet',
      paymentType: 'Timesheet Rate',
    });
  }
  await p.request()
    .input('employee_id', sql.BigInt, input.employeeDbId)
    .input('reason', sql.NVarChar(500), nullable(input.reason || 'Contract payroll classification updated from employee directory'))
    .query(`
      INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
      VALUES (@employee_id, N'Contract payroll classification', SUSER_SNAME(), @reason);
    `);
  return true;
};

export type PayrollIdentityMigrationInput = {
  employeeDbId: number;
  payrollGroup?: string | null;
  salaryGrade?: string | null;
  payCurrency?: string | null;
  paymentRun?: string | null;
  paymentType?: string | null;
  periodSalary?: number | null;
  annualSalary?: number | null;
  ratePerDay?: number | null;
  ratePerHour?: number | null;
  hoursPerDay?: number | null;
  hoursPerPeriod?: number | null;
  bankName?: string | null;
  accountNo?: string | null;
  accountName?: string | null;
  pensionProvider?: string | null;
  pensionPin?: string | null;
  taxIdentificationNumber?: string | null;
};

export const upsertEmployeePayrollIdentityFromSageInDb = async (input: PayrollIdentityMigrationInput) => {
  const p = await pool();
  if (!p) return false;
  await p.request()
    .input('employee_id', sql.BigInt, input.employeeDbId)
    .input('payroll_group', sql.NVarChar(100), nullable(input.payrollGroup))
    .input('salary_grade', sql.NVarChar(80), nullable(input.salaryGrade))
    .input('pay_currency', sql.NVarChar(10), nullable(input.payCurrency || 'NGN'))
    .input('payment_run', sql.NVarChar(80), nullable(input.paymentRun))
    .input('payment_type', sql.NVarChar(80), nullable(input.paymentType))
    .input('period_salary', sql.Decimal(19, 4), numOrNull(input.periodSalary))
    .input('annual_salary', sql.Decimal(19, 4), numOrNull(input.annualSalary))
    .input('rate_per_day', sql.Decimal(19, 4), numOrNull(input.ratePerDay))
    .input('rate_per_hour', sql.Decimal(19, 4), numOrNull(input.ratePerHour))
    .input('hours_per_day', sql.Decimal(9, 4), numOrNull(input.hoursPerDay))
    .input('hours_per_period', sql.Decimal(9, 4), numOrNull(input.hoursPerPeriod))
    .input('bank_name', sql.NVarChar(150), nullable(input.bankName))
    .input('account_number', sql.NVarChar(50), nullable(input.accountNo))
    .input('account_name', sql.NVarChar(250), nullable(input.accountName))
    .input('pension_provider', sql.NVarChar(150), nullable(input.pensionProvider))
    .input('pension_pin', sql.NVarChar(80), nullable(input.pensionPin))
    .input('tax_identification_number', sql.NVarChar(80), nullable(input.taxIdentificationNumber))
    .query(`
      MERGE [hris].[EmployeePayrollSetup] AS target
      USING (SELECT @employee_id AS employee_id) AS source
      ON target.employee_id = source.employee_id
      WHEN MATCHED THEN UPDATE SET
        payroll_group = COALESCE(@payroll_group, target.payroll_group),
        salary_grade = COALESCE(@salary_grade, target.salary_grade),
        pay_currency = COALESCE(@pay_currency, target.pay_currency),
        payment_run = COALESCE(@payment_run, target.payment_run),
        payment_type = COALESCE(@payment_type, target.payment_type),
        period_salary = COALESCE(@period_salary, target.period_salary),
        annual_salary = COALESCE(@annual_salary, target.annual_salary),
        rate_per_day = COALESCE(@rate_per_day, target.rate_per_day),
        rate_per_hour = COALESCE(@rate_per_hour, target.rate_per_hour),
        hours_per_day = COALESCE(@hours_per_day, target.hours_per_day),
        hours_per_period = COALESCE(@hours_per_period, target.hours_per_period),
        bank_name = COALESCE(@bank_name, target.bank_name),
        account_number = COALESCE(@account_number, target.account_number),
        account_name = COALESCE(@account_name, target.account_name),
        pension_provider = COALESCE(@pension_provider, target.pension_provider),
        pension_pin = COALESCE(@pension_pin, target.pension_pin),
        tax_identification_number = COALESCE(@tax_identification_number, target.tax_identification_number),
        setup_assigned_to_payroll = 1,
        modified_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        employee_id, payroll_group, salary_grade, pay_currency, payment_run, payment_type,
        period_salary, annual_salary, rate_per_day, rate_per_hour, hours_per_day, hours_per_period,
        bank_name, account_number, account_name, pension_provider, pension_pin, tax_identification_number,
        setup_assigned_to_payroll
      ) VALUES (
        @employee_id, @payroll_group, @salary_grade, @pay_currency, @payment_run, @payment_type,
        @period_salary, @annual_salary, @rate_per_day, @rate_per_hour, @hours_per_day, @hours_per_period,
        @bank_name, @account_number, @account_name, @pension_provider, @pension_pin, @tax_identification_number,
        1
      );
    `);
  return true;
};

export const createEmployeeFromDraftInDb = async (draftId: string, employeeCode: string, draft: any, role: string, startOnboarding: boolean) => {
  const p = await pool();
  if (!p) return false;
  const personal = draft.personal || {};
  const contact = draft.contact || {};
  const employment = draft.employment || {};
  const job = draft.job || {};
  const payroll = draft.payroll || {};
  const fullName = `${str(personal.firstName)} ${str(personal.lastName)}`.trim() || employeeCode;

  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    const employeeRs = await new sql.Request(tx)
      .input('employee_code', sql.NVarChar(50), employeeCode)
      .input('full_name', sql.NVarChar(250), fullName)
      .input('preferred_name', sql.NVarChar(150), nullable(personal.preferredName))
      .input('employment_status', sql.VarChar(40), (() => {
        const requested = nullable(employment.employmentStatus);
        const employmentType = nullable(employment.employmentType) || 'Permanent';
        if (requested && requested !== 'Active' && requested !== 'Confirmed') return requested;
        if (employmentType === 'Permanent') return 'Probation';
        return requested || 'Active';
      })())
      .input('employment_type', sql.VarChar(40), nullable(employment.employmentType) || 'Permanent')
      .query(`
        INSERT [hris].[Employees](employee_code, full_name, preferred_name, employment_status, employment_type)
        OUTPUT INSERTED.employee_id
        VALUES (@employee_code, @full_name, @preferred_name, @employment_status, @employment_type);
      `);
    const employeeId = employeeRs.recordset[0].employee_id as number;

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('source_draft_id', sql.NVarChar(80), draftId)
      .input('raw_payload_json', sql.NVarChar(sql.MAX), JSON.stringify({ draftId, source: 'EmployeeDrafts' }))
      .query(`
        MERGE [hris].[EmployeeSourceRecords] AS target
        USING (SELECT N'DLE Employee Draft' AS source_system, @source_draft_id AS source_employee_id) AS source
        ON target.source_system = source.source_system
        AND target.source_employee_id = source.source_employee_id
        WHEN MATCHED THEN UPDATE SET
          employee_id = @employee_id,
          raw_payload_json = @raw_payload_json,
          imported_at = SYSUTCDATETIME(),
          imported_by = SUSER_SNAME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, source_system, source_employee_id, raw_payload_json
        ) VALUES (
          @employee_id, N'DLE Employee Draft', @source_draft_id, @raw_payload_json
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('title', sql.NVarChar(30), nullable(personal.title))
      .input('first_name', sql.NVarChar(100), nullable(personal.firstName) || fullName)
      .input('middle_name', sql.NVarChar(100), nullable(personal.middleName))
      .input('last_name', sql.NVarChar(100), nullable(personal.lastName) || fullName)
      .input('preferred_name', sql.NVarChar(150), nullable(personal.preferredName))
      .input('gender', sql.NVarChar(40), nullable(personal.gender))
      .input('date_of_birth', sql.Date, dateOrNull(personal.dateOfBirth))
      .input('marital_status', sql.NVarChar(50), nullable(personal.maritalStatus))
      .input('nationality', sql.NVarChar(100), nullable(personal.nationality))
      .input('state_of_origin', sql.NVarChar(100), nullable(personal.stateOfOrigin))
      .input('local_government_area', sql.NVarChar(120), nullable(personal.localGovernmentArea))
      .input('religion', sql.NVarChar(80), nullable(personal.religion))
      .input('languages_spoken', sql.NVarChar(500), nullable(personal.languagesSpoken))
      .input('photo_file_name', sql.NVarChar(260), nullable(personal.photoFileName))
      .input('photo_mime_type', sql.NVarChar(120), nullable(personal.photoMimeType))
      .input('photo_size_bytes', sql.BigInt, numOrNull(personal.photoSizeBytes))
      .query(`
        INSERT [hris].[EmployeePersonalInfo](
          employee_id, title, first_name, middle_name, last_name, preferred_name, gender, date_of_birth, marital_status,
          nationality, state_of_origin, local_government_area, religion, languages_spoken, photo_file_name, photo_mime_type, photo_size_bytes
        ) VALUES (
          @employee_id, @title, @first_name, @middle_name, @last_name, @preferred_name, @gender, @date_of_birth, @marital_status,
          @nationality, @state_of_origin, @local_government_area, @religion, @languages_spoken, @photo_file_name, @photo_mime_type, @photo_size_bytes
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('official_email', sql.NVarChar(320), nullable(contact.officialEmail))
      .input('personal_email', sql.NVarChar(320), nullable(contact.personalEmail))
      .input('primary_phone', sql.NVarChar(50), nullable(contact.primaryPhone))
      .input('alternate_phone', sql.NVarChar(50), nullable(contact.alternatePhone))
      .input('office_extension', sql.NVarChar(30), nullable(contact.officeExtension))
      .input('residential_address', sql.NVarChar(1000), nullable(contact.residentialAddress))
      .input('permanent_address', sql.NVarChar(1000), nullable(contact.permanentAddress))
      .input('nearest_bus_stop', sql.NVarChar(250), nullable(contact.nearestBusStop))
      .input('city', sql.NVarChar(120), nullable(contact.city))
      .input('state', sql.NVarChar(120), nullable(contact.state))
      .input('country', sql.NVarChar(120), nullable(contact.country))
      .input('postal_code', sql.NVarChar(30), nullable(contact.postalCode))
      .query(`
        INSERT [hris].[EmployeeContactInfo](
          employee_id, official_email, personal_email, primary_phone, alternate_phone, office_extension, residential_address,
          permanent_address, nearest_bus_stop, city, state, country, postal_code
        ) VALUES (
          @employee_id, @official_email, @personal_email, @primary_phone, @alternate_phone, @office_extension, @residential_address,
          @permanent_address, @nearest_bus_stop, @city, @state, @country, @postal_code
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('staff_category', sql.NVarChar(100), nullable(employment.staffCategory))
      .input('employee_category', sql.NVarChar(100), nullable(employment.employeeCategory))
      .input('date_joined', sql.Date, dateOrNull(employment.dateJoined))
      .input('probation_start_date', sql.Date, dateOrNull(employment.probationStartDate))
      .input('probation_end_date', sql.Date, dateOrNull(employment.probationEndDate))
      .input('confirmation_due_date', sql.Date, dateOrNull(employment.confirmationDueDate))
      .input('contract_start_date', sql.Date, dateOrNull(employment.contractStartDate))
      .input('contract_end_date', sql.Date, dateOrNull(employment.contractEndDate))
      .input('work_mode', sql.NVarChar(50), nullable(employment.workMode))
      .input('work_location', sql.NVarChar(150), nullable(employment.workLocation))
      .input('shift_pattern', sql.NVarChar(80), nullable(employment.shiftPattern))
      .input('union_status', sql.NVarChar(80), nullable(employment.unionStatus))
      .input('expatriate_status', sql.NVarChar(80), nullable(employment.expatriateStatus))
      .input('onboarding_scheduled', sql.Bit, boolVal(employment.onboardingScheduled))
      .query(`
        INSERT [hris].[EmployeeEmploymentInfo](
          employee_id, staff_category, employee_category, date_joined, probation_start_date, probation_end_date,
          confirmation_due_date, contract_start_date, contract_end_date, work_mode, work_location, shift_pattern,
          union_status, expatriate_status, onboarding_scheduled
        ) VALUES (
          @employee_id, @staff_category, @employee_category, @date_joined, @probation_start_date, @probation_end_date,
          @confirmation_due_date, @contract_start_date, @contract_end_date, @work_mode, @work_location, @shift_pattern,
          @union_status, @expatriate_status, @onboarding_scheduled
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('job_title', sql.NVarChar(150), nullable(job.jobTitle))
      .input('designation', sql.NVarChar(150), nullable(job.designation))
      .input('job_grade', sql.NVarChar(80), nullable(job.jobGrade))
      .input('department', sql.NVarChar(150), nullable(job.department))
      .input('division', sql.NVarChar(150), nullable(job.division))
      .input('business_unit', sql.NVarChar(150), nullable(job.businessUnit))
      .input('cost_center', sql.NVarChar(80), nullable(job.costCenter))
      .input('project_site', sql.NVarChar(150), nullable(job.projectSite))
      .input('office_location', sql.NVarChar(150), nullable(job.officeLocation))
      .input('reporting_manager', sql.NVarChar(250), nullable(job.reportingManager))
      .input('functional_manager', sql.NVarChar(250), nullable(job.functionalManager))
      .input('department_head', sql.NVarChar(250), nullable(job.departmentHead))
      .input('hr_business_partner', sql.NVarChar(250), nullable(job.hrBusinessPartner))
      .input('role_profile', sql.NVarChar(150), nullable(job.roleProfile))
      .input('job_description', sql.NVarChar(sql.MAX), nullable(job.jobDescription))
      .input('key_responsibilities', sql.NVarChar(sql.MAX), nullable(job.keyResponsibilities))
      .input('is_people_manager', sql.Bit, boolVal(job.isPeopleManager))
      .input('is_budget_owner', sql.Bit, boolVal(job.isBudgetOwner))
      .query(`
        INSERT [hris].[EmployeeJobInfo](
          employee_id, job_title, designation, job_grade, department, division, business_unit, cost_center, project_site,
          office_location, reporting_manager, functional_manager, department_head, hr_business_partner, role_profile,
          job_description, key_responsibilities, is_people_manager, is_budget_owner
        ) VALUES (
          @employee_id, @job_title, @designation, @job_grade, @department, @division, @business_unit, @cost_center, @project_site,
          @office_location, @reporting_manager, @functional_manager, @department_head, @hr_business_partner, @role_profile,
          @job_description, @key_responsibilities, @is_people_manager, @is_budget_owner
        );
      `);

    for (const ec of draft.emergencyContacts || []) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('external_contact_id', sql.NVarChar(80), nullable(ec.id))
        .input('full_name', sql.NVarChar(250), nullable(ec.fullName) || 'Emergency Contact')
        .input('relationship', sql.NVarChar(100), nullable(ec.relationship) || 'Other')
        .input('phone_number', sql.NVarChar(50), nullable(ec.phoneNumber) || 'N/A')
        .input('alternate_phone', sql.NVarChar(50), nullable(ec.alternatePhone))
        .input('email', sql.NVarChar(320), nullable(ec.email))
        .input('address', sql.NVarChar(1000), nullable(ec.address))
        .input('is_primary', sql.Bit, boolVal(ec.isPrimary))
        .input('is_next_of_kin', sql.Bit, boolVal(ec.isNextOfKin))
        .input('is_beneficiary', sql.Bit, boolVal(ec.isBeneficiary))
        .query(`
          INSERT [hris].[EmployeeEmergencyContacts](
            employee_id, external_contact_id, full_name, relationship, phone_number, alternate_phone, email, address,
            is_primary, is_next_of_kin, is_beneficiary
          ) VALUES (
            @employee_id, @external_contact_id, @full_name, @relationship, @phone_number, @alternate_phone, @email, @address,
            @is_primary, @is_next_of_kin, @is_beneficiary
          );
        `);
    }

    for (const doc of draft.documents || []) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('draft_id', sql.NVarChar(40), draftId)
        .input('external_document_id', sql.NVarChar(80), nullable(doc.id))
        .input('document_category', sql.NVarChar(120), nullable(doc.category) || 'Document')
        .input('file_name', sql.NVarChar(260), nullable(doc.fileName) || 'file')
        .input('mime_type', sql.NVarChar(120), nullable(doc.mimeType) || 'application/octet-stream')
        .input('size_bytes', sql.BigInt, numOrNull(doc.sizeBytes) || 0)
        .input('expires_at', sql.Date, dateOrNull(doc.expiresAt))
        .input('document_status', sql.VarChar(30), nullable(doc.status) || 'Uploaded')
        .query(`
          INSERT [hris].[EmployeeDocuments](
            employee_id, draft_id, external_document_id, document_category, file_name, mime_type, size_bytes, expires_at, document_status
          ) VALUES (
            @employee_id, @draft_id, @external_document_id, @document_category, @file_name, @mime_type, @size_bytes, @expires_at, @document_status
          );
        `);
    }

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('payroll_group', sql.NVarChar(100), nullable(payroll.payrollGroup))
      .input('salary_grade', sql.NVarChar(80), nullable(payroll.salaryGrade))
      .input('basic_salary', sql.Decimal(19, 4), numOrNull(payroll.basicSalary))
      .input('pay_frequency', sql.NVarChar(50), nullable(payroll.payFrequency))
      .input('bank_name', sql.NVarChar(150), nullable(payroll.bankName))
      .input('account_number', sql.NVarChar(50), nullable(payroll.accountNumber))
      .input('account_name', sql.NVarChar(250), nullable(payroll.accountName))
      .input('pension_provider', sql.NVarChar(150), nullable(payroll.pensionProvider))
      .input('pension_pin', sql.NVarChar(80), nullable(payroll.pensionPin))
      .input('tax_identification_number', sql.NVarChar(80), nullable(payroll.taxIdentificationNumber))
      .input('benefit_group', sql.NVarChar(120), nullable(payroll.benefitGroup))
      .input('setup_assigned_to_payroll', sql.Bit, boolVal(payroll.setupAssignedToPayroll))
      .query(`
        INSERT [hris].[EmployeePayrollSetup](
          employee_id, payroll_group, salary_grade, basic_salary, pay_frequency, bank_name, account_number, account_name,
          pension_provider, pension_pin, tax_identification_number, benefit_group, setup_assigned_to_payroll
        ) VALUES (
          @employee_id, @payroll_group, @salary_grade, @basic_salary, @pay_frequency, @bank_name, @account_number, @account_name,
          @pension_provider, @pension_pin, @tax_identification_number, @benefit_group, @setup_assigned_to_payroll
        );
      `);

    for (const item of draft.onboardingChecklist || []) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('draft_id', sql.NVarChar(40), draftId)
        .input('external_checklist_id', sql.NVarChar(80), nullable(item.id))
        .input('title', sql.NVarChar(250), nullable(item.title) || 'Onboarding task')
        .input('checklist_status', sql.VarChar(30), nullable(item.status) || 'Pending')
        .input('responsible_officer', sql.NVarChar(150), nullable(item.responsibleOfficer))
        .input('due_date', sql.Date, dateOrNull(item.dueDate))
        .input('notes', sql.NVarChar(1000), nullable(item.notes))
        .query(`
          INSERT [hris].[EmployeeOnboardingChecklist](
            employee_id, draft_id, external_checklist_id, title, checklist_status, responsible_officer, due_date, notes
          ) VALUES (
            @employee_id, @draft_id, @external_checklist_id, @title, @checklist_status, @responsible_officer, @due_date, @notes
          );
        `);
    }

    await new sql.Request(tx)
      .input('draft_id', sql.NVarChar(40), draftId)
      .input('employee_code', sql.NVarChar(50), employeeCode)
      .query(`
        UPDATE [hris].[EmployeeDrafts]
        SET draft_status = 'created',
            created_employee_code = @employee_code,
            modified_at = SYSUTCDATETIME(),
            modified_by = SUSER_SNAME()
        WHERE draft_id = @draft_id;
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('audit_action', sql.NVarChar(150), startOnboarding ? 'Employee created and onboarding started' : 'Employee created')
      .input('performed_by', sql.NVarChar(128), role)
      .query(`
        INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by)
        VALUES (@employee_id, @audit_action, @performed_by);
      `);

    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
};

export type HrisEmployeeProfileSyncInput = {
  employeeCode: string;
  fullName?: string | null;
  preferredName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  businessUnit?: string | null;
  reportingManager?: string | null;
  employmentStatus?: string | null;
  employmentType?: string | null;
  personalInfo?: Record<string, string | null | undefined>;
  contacts?: Record<string, string | null | undefined>;
  employmentDetails?: Record<string, string | null | undefined>;
  jobDetails?: Record<string, string | null | undefined>;
  payrollSetup?: Record<string, string | null | undefined>;
  emergencyContacts?: Array<{
    fullName: string;
    relationship?: string;
    phoneNumber?: string;
    address?: string;
    isPrimary?: boolean;
    isNextOfKin?: boolean;
  }>;
};

export const syncHrisEmployeeProfileToDb = async (input: HrisEmployeeProfileSyncInput): Promise<boolean> => {
  const employeeCode = str(input.employeeCode);
  if (!employeeCode) return false;
  const p = await pool();
  if (!p) return false;

  const personal = input.personalInfo || {};
  const contacts = input.contacts || {};
  const employment = input.employmentDetails || {};
  const job = input.jobDetails || {};
  const payroll = input.payrollSetup || {};
  const fullName =
    str(input.fullName) ||
    `${str(personal.firstName)} ${str(personal.lastName)}`.trim() ||
    employeeCode;
  const preferredName = nullable(personal.preferredName ?? input.preferredName);
  const employmentStatus = nullable(employment.employmentStatus ?? input.employmentStatus) || 'Active';
  const employmentType = nullable(employment.employmentType ?? input.employmentType) || 'Permanent';

  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    const lookup = await new sql.Request(tx)
      .input('employee_code', sql.NVarChar(50), employeeCode)
      .query(`SELECT employee_id FROM [hris].[Employees] WHERE employee_code = @employee_code;`);
    const employeeId = Number(lookup.recordset?.[0]?.employee_id || 0);
    if (!employeeId) {
      await tx.rollback().catch(() => undefined);
      return false;
    }

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('full_name', sql.NVarChar(250), fullName)
      .input('preferred_name', sql.NVarChar(150), preferredName)
      .input('employment_status', sql.VarChar(40), employmentStatus)
      .input('employment_type', sql.VarChar(40), employmentType)
      .query(`
        UPDATE [hris].[Employees]
        SET full_name = @full_name,
            preferred_name = @preferred_name,
            employment_status = @employment_status,
            employment_type = @employment_type,
            modified_at = SYSUTCDATETIME(),
            modified_by = SUSER_SNAME()
        WHERE employee_id = @employee_id;
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('title', sql.NVarChar(30), nullable(personal.title))
      .input('first_name', sql.NVarChar(100), nullable(personal.firstName))
      .input('middle_name', sql.NVarChar(100), nullable(personal.middleName))
      .input('last_name', sql.NVarChar(100), nullable(personal.lastName))
      .input('preferred_name', sql.NVarChar(150), preferredName)
      .input('gender', sql.NVarChar(40), nullable(personal.gender))
      .input('date_of_birth', sql.Date, dateOrNull(personal.dateOfBirth))
      .input('marital_status', sql.NVarChar(50), nullable(personal.maritalStatus))
      .input('nationality', sql.NVarChar(100), nullable(personal.nationality))
      .input('state_of_origin', sql.NVarChar(100), nullable(personal.stateOfOrigin))
      .input('local_government_area', sql.NVarChar(120), nullable(personal.localGovernmentArea))
      .input('religion', sql.NVarChar(80), nullable(personal.religion))
      .input('languages_spoken', sql.NVarChar(500), nullable(personal.languagesSpoken))
      .query(`
        MERGE [hris].[EmployeePersonalInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          title = @title,
          first_name = @first_name,
          middle_name = @middle_name,
          last_name = @last_name,
          preferred_name = @preferred_name,
          gender = @gender,
          date_of_birth = @date_of_birth,
          marital_status = @marital_status,
          nationality = @nationality,
          state_of_origin = @state_of_origin,
          local_government_area = @local_government_area,
          religion = @religion,
          languages_spoken = @languages_spoken,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, title, first_name, middle_name, last_name, preferred_name, gender, date_of_birth,
          marital_status, nationality, state_of_origin, local_government_area, religion, languages_spoken
        ) VALUES (
          @employee_id, @title, @first_name, @middle_name, @last_name, @preferred_name, @gender, @date_of_birth,
          @marital_status, @nationality, @state_of_origin, @local_government_area, @religion, @languages_spoken
        );
      `);

    const officialEmail = nullable(contacts.officialEmail);
    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('official_email', sql.NVarChar(320), officialEmail)
      .input('personal_email', sql.NVarChar(320), nullable(contacts.personalEmail ?? personal.personalEmail))
      .input('primary_phone', sql.NVarChar(50), nullable(contacts.primaryPhone ?? personal.personalPhone))
      .input('alternate_phone', sql.NVarChar(50), nullable(contacts.alternativePhone))
      .input('office_extension', sql.NVarChar(30), nullable(contacts.officeExtension))
      .input('residential_address', sql.NVarChar(1000), nullable(contacts.residentialAddress ?? personal.residentialAddress))
      .input('permanent_address', sql.NVarChar(1000), nullable(contacts.permanentAddress ?? personal.permanentAddress))
      .input('nearest_bus_stop', sql.NVarChar(250), nullable(contacts.nearestBusStop))
      .input('city', sql.NVarChar(120), nullable(contacts.city))
      .input('state', sql.NVarChar(120), nullable(contacts.state))
      .input('country', sql.NVarChar(120), nullable(contacts.country))
      .input('postal_code', sql.NVarChar(30), nullable(contacts.postalCode))
      .query(`
        MERGE [hris].[EmployeeContactInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          official_email = CASE
            WHEN @official_email IS NOT NULL AND EXISTS (
              SELECT 1 FROM [hris].[EmployeeContactInfo] c
              WHERE c.official_email = @official_email AND c.employee_id <> @employee_id
            ) THEN target.official_email
            ELSE @official_email
          END,
          personal_email = @personal_email,
          primary_phone = @primary_phone,
          alternate_phone = @alternate_phone,
          office_extension = @office_extension,
          residential_address = @residential_address,
          permanent_address = @permanent_address,
          nearest_bus_stop = @nearest_bus_stop,
          city = @city,
          state = @state,
          country = @country,
          postal_code = @postal_code,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, official_email, personal_email, primary_phone, alternate_phone, office_extension,
          residential_address, permanent_address, nearest_bus_stop, city, state, country, postal_code
        ) VALUES (
          @employee_id,
          CASE WHEN @official_email IS NOT NULL AND EXISTS (SELECT 1 FROM [hris].[EmployeeContactInfo] c WHERE c.official_email = @official_email) THEN NULL ELSE @official_email END,
          @personal_email, @primary_phone, @alternate_phone, @office_extension,
          @residential_address, @permanent_address, @nearest_bus_stop, @city, @state, @country, @postal_code
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('staff_category', sql.NVarChar(100), nullable(employment.staffCategory))
      .input('employee_category', sql.NVarChar(100), nullable(employment.employeeCategory))
      .input('date_joined', sql.Date, dateOrNull(employment.dateJoined))
      .input('probation_start_date', sql.Date, dateOrNull(employment.probationStartDate))
      .input('probation_end_date', sql.Date, dateOrNull(employment.probationEndDate))
      .input('confirmation_due_date', sql.Date, dateOrNull(employment.confirmationDate))
      .input('contract_start_date', sql.Date, dateOrNull(employment.contractStartDate))
      .input('contract_end_date', sql.Date, dateOrNull(employment.contractEndDate))
      .input('work_mode', sql.NVarChar(50), nullable(employment.workMode))
      .input('work_location', sql.NVarChar(150), nullable(employment.workLocation))
      .input('shift_pattern', sql.NVarChar(80), nullable(employment.shiftPattern))
      .input('union_status', sql.NVarChar(80), nullable(employment.unionStatus))
      .query(`
        MERGE [hris].[EmployeeEmploymentInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          staff_category = @staff_category,
          employee_category = @employee_category,
          date_joined = @date_joined,
          probation_start_date = @probation_start_date,
          probation_end_date = @probation_end_date,
          confirmation_due_date = @confirmation_due_date,
          contract_start_date = @contract_start_date,
          contract_end_date = @contract_end_date,
          work_mode = @work_mode,
          work_location = @work_location,
          shift_pattern = @shift_pattern,
          union_status = @union_status,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, staff_category, employee_category, date_joined, probation_start_date, probation_end_date,
          confirmation_due_date, contract_start_date, contract_end_date, work_mode, work_location, shift_pattern, union_status
        ) VALUES (
          @employee_id, @staff_category, @employee_category, @date_joined, @probation_start_date, @probation_end_date,
          @confirmation_due_date, @contract_start_date, @contract_end_date, @work_mode, @work_location, @shift_pattern, @union_status
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('job_title', sql.NVarChar(150), nullable(job.jobTitle ?? input.jobTitle))
      .input('designation', sql.NVarChar(150), nullable(job.designation))
      .input('job_grade', sql.NVarChar(80), nullable(job.jobGrade))
      .input('department', sql.NVarChar(150), nullable(job.department ?? input.department))
      .input('division', sql.NVarChar(150), nullable(job.division))
      .input('business_unit', sql.NVarChar(150), nullable(job.businessUnit ?? input.businessUnit))
      .input('cost_center', sql.NVarChar(80), nullable(job.costCenter))
      .input('project_site', sql.NVarChar(150), nullable(job.projectSite))
      .input('office_location', sql.NVarChar(150), nullable(job.officeSite ?? job.location))
      .input('reporting_manager', sql.NVarChar(250), nullable(job.reportingManager ?? input.reportingManager))
      .input('functional_manager', sql.NVarChar(250), nullable(job.functionalManager))
      .input('department_head', sql.NVarChar(250), nullable(job.departmentHead))
      .input('hr_business_partner', sql.NVarChar(250), nullable(job.hrBusinessPartner))
      .input('role_profile', sql.NVarChar(150), nullable(job.roleProfile))
      .input('job_description', sql.NVarChar(sql.MAX), nullable(job.jobDescription))
      .input('key_responsibilities', sql.NVarChar(sql.MAX), nullable(job.keyResponsibilities))
      .query(`
        MERGE [hris].[EmployeeJobInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          job_title = @job_title,
          designation = @designation,
          job_grade = @job_grade,
          department = @department,
          division = @division,
          business_unit = @business_unit,
          cost_center = @cost_center,
          project_site = @project_site,
          office_location = @office_location,
          reporting_manager = @reporting_manager,
          functional_manager = @functional_manager,
          department_head = @department_head,
          hr_business_partner = @hr_business_partner,
          role_profile = @role_profile,
          job_description = @job_description,
          key_responsibilities = @key_responsibilities,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, job_title, designation, job_grade, department, division, business_unit, cost_center,
          project_site, office_location, reporting_manager, functional_manager, department_head, hr_business_partner,
          role_profile, job_description, key_responsibilities
        ) VALUES (
          @employee_id, @job_title, @designation, @job_grade, @department, @division, @business_unit, @cost_center,
          @project_site, @office_location, @reporting_manager, @functional_manager, @department_head, @hr_business_partner,
          @role_profile, @job_description, @key_responsibilities
        );
      `);

    if (nullable(payroll.bankName) || nullable(payroll.accountNumber) || nullable(payroll.accountName) || nullable(payroll.branchName)) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('bank_name', sql.NVarChar(150), nullable(payroll.bankName))
        .input('branch_name', sql.NVarChar(150), nullable(payroll.branchName))
        .input('account_number', sql.NVarChar(50), nullable(payroll.accountNumber))
        .input('account_name', sql.NVarChar(200), nullable(payroll.accountName))
        .query(`
          MERGE [hris].[EmployeePayrollSetup] AS target
          USING (SELECT @employee_id AS employee_id) AS source
          ON target.employee_id = source.employee_id
          WHEN MATCHED THEN UPDATE SET
            bank_name = COALESCE(@bank_name, target.bank_name),
            branch_name = COALESCE(@branch_name, target.branch_name),
            account_number = COALESCE(@account_number, target.account_number),
            account_name = COALESCE(@account_name, target.account_name),
            modified_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (
            employee_id, bank_name, branch_name, account_number, account_name
          ) VALUES (
            @employee_id, @bank_name, @branch_name, @account_number, @account_name
          );
        `);
    }

    for (const ec of input.emergencyContacts || []) {
      const fullName = str(ec.fullName);
      if (!fullName) continue;
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('external_contact_id', sql.NVarChar(80), `ess-${fullName.slice(0, 40).replace(/\s+/g, '-').toLowerCase()}`)
        .input('full_name', sql.NVarChar(250), fullName)
        .input('relationship', sql.NVarChar(100), nullable(ec.relationship) || 'Other')
        .input('phone_number', sql.NVarChar(50), nullable(ec.phoneNumber) || 'N/A')
        .input('address', sql.NVarChar(1000), nullable(ec.address))
        .input('is_primary', sql.Bit, ec.isPrimary ? 1 : 0)
        .input('is_next_of_kin', sql.Bit, ec.isNextOfKin ? 1 : 0)
        .query(`
          MERGE [hris].[EmployeeEmergencyContacts] AS target
          USING (
            SELECT @employee_id AS employee_id, @external_contact_id AS external_contact_id
          ) AS source
          ON target.employee_id = source.employee_id
            AND target.external_contact_id = source.external_contact_id
          WHEN MATCHED THEN UPDATE SET
            full_name = @full_name,
            relationship = @relationship,
            phone_number = @phone_number,
            address = @address,
            is_primary = @is_primary,
            is_next_of_kin = @is_next_of_kin
          WHEN NOT MATCHED THEN INSERT (
            employee_id, external_contact_id, full_name, relationship, phone_number, address, is_primary, is_next_of_kin, is_beneficiary
          ) VALUES (
            @employee_id, @external_contact_id, @full_name, @relationship, @phone_number, @address, @is_primary, @is_next_of_kin, 0
          );
        `);
    }

    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    console.error('syncHrisEmployeeProfileToDb failed', error);
    return false;
  }
};

export const readEmployeePhotoFromDb = async (employeeCode: string): Promise<{ data: Buffer; mimeType: string; fileName: string } | null> => {
  const code = str(employeeCode);
  if (!code) return null;
  const p = await pool();
  if (!p) return null;
  try {
    const rs = await p
      .request()
      .input('employee_code', sql.NVarChar(50), code)
      .query(`
        SELECT TOP 1
          pinfo.photo_data,
          pinfo.photo_mime_type,
          pinfo.photo_file_name
        FROM [hris].[Employees] e
        INNER JOIN [hris].[EmployeePersonalInfo] pinfo ON pinfo.employee_id = e.employee_id
        WHERE e.employee_code = @employee_code
          AND pinfo.photo_data IS NOT NULL
          AND DATALENGTH(pinfo.photo_data) > 0
      `);
    const row = rs.recordset?.[0];
    if (!row?.photo_data) return null;
    const data = Buffer.isBuffer(row.photo_data) ? row.photo_data : Buffer.from(row.photo_data);
    if (!data.length) return null;
    return {
      data,
      mimeType: str(row.photo_mime_type) || 'image/jpeg',
      fileName: str(row.photo_file_name) || `${code}.jpg`,
    };
  } catch (error) {
    if (error instanceof Error && /Invalid column name 'photo_data'/.test(error.message)) return null;
    throw error;
  }
};
