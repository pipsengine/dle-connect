import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import {
  createEmployeeFromDraftInDb,
  findDuplicateEmployeesInDb,
  findEmployeeByOfficialEmailInDb,
  getEmployeeDraftFromDb,
  humanizeEmployeeCreateDbError,
  isEmployeeCodeAlreadyIssuedInDb,
  nextEmployeeCodeFromDb,
  officialEmailAlreadyUsedMessage,
  saveEmployeeDraftToDb,
} from '@/lib/dle-enterprise-db';
import { payrollDataSourceInfo, readDirectoryEmployees, invalidatePayrollEmployeeCache } from '@/lib/payroll-employee-source';
import { writePayrollEmployeeOption, invalidatePayrollEmployeeOptionsCache } from '@/lib/payroll-employee-options-store';
import type { SagePayrollLineItem } from '@/lib/sage-payroll-line-parser';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Admin Officer'
  | 'Payroll Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'IT Administrator'
  | 'HSE Officer'
  | 'Auditor';

type EmploymentType =
  | 'Permanent'
  | 'Lumpsum'
  | 'Daily Rate'
  | 'Contract'
  | 'Temporary'
  | 'Intern'
  | 'Consultant'
  | 'Expatriate'
  | 'Industrial Trainee'
  | 'NYSC'
  | 'Outsourced Staff';

type EmploymentStatus =
  | 'Active'
  | 'On Leave'
  | 'Probation'
  | 'Confirmed'
  | 'Suspended'
  | 'Resigned'
  | 'Terminated'
  | 'Retired'
  | 'Contract'
  | 'Seconded'
  | 'Field Assignment';

type EmployeeDraftPayload = {
  personal: Record<string, any>;
  contact: Record<string, any>;
  employment: Record<string, any>;
  job: Record<string, any>;
  emergencyContacts: any[];
  documents: any[];
  payroll: Record<string, any>;
  onboardingChecklist: any[];
};

type DraftRecord = {
  draftId: string;
  status: 'draft' | 'submitted' | 'approved' | 'created';
  createdAt: string;
  updatedAt: string;
  draft: EmployeeDraftPayload;
  audit: { id: string; at: string; action: string; performedBy: Role; reason?: string }[];
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ status: 'error', error, ...(extra || {}) }, { status });

const ROLE_BY_CANONICAL: Record<string, Role> = {
  SUPERADMIN: 'Super Admin',
  HRDIRECTOR: 'HR Director',
  HRMANAGER: 'HR Manager',
  HROFFICER: 'HR Officer',
  ADMINOFFICER: 'Admin Officer',
  PAYROLLOFFICER: 'Payroll Officer',
  DEPARTMENTHEAD: 'Department Head',
  LINEMANAGER: 'Line Manager',
  ITADMINISTRATOR: 'IT Administrator',
  HSEOFFICER: 'HSE Officer',
  AUDITOR: 'Auditor',
};

const normalizeRole = (roles: string[] | undefined | null, headerRole: string): Role => {
  const all: Role[] = [
    'Super Admin', 'HR Director', 'HR Manager', 'HR Officer', 'Admin Officer',
    'Payroll Officer', 'Department Head', 'Line Manager', 'IT Administrator',
    'HSE Officer', 'Auditor',
  ];
  const fromSession = (roles || [])
    .map((role) => String(role || '').toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(Boolean)
    .map((canonical) => ROLE_BY_CANONICAL[canonical])
    .find(Boolean) as Role | undefined;
  if (fromSession) return fromSession;
  const fromHeader = String(headerRole || '').trim();
  if (fromHeader) {
    const key = fromHeader.toUpperCase().replace(/[^A-Z]/g, '');
    const lookup = ROLE_BY_CANONICAL[key] as Role | undefined;
    if (lookup && all.includes(lookup)) return lookup;
  }
  return 'Auditor';
};

const readAuthCookie = (request: Request) => {
  const cookieHeader = request.headers.get('cookie') || '';
  const pair = cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${AUTH_COOKIE}=`));
  if (!pair) return '';
  return decodeURIComponent(pair.split('=').slice(1).join('='));
};

const getRole = async (request: Request): Promise<Role> => {
  const session = await verifySessionToken(readAuthCookie(request)).catch(() => null);
  const header = String(request.headers.get('x-hris-role') || '').trim();
  if (!session) {
    const all: Role[] = [
      'Super Admin', 'HR Director', 'HR Manager', 'HR Officer', 'Admin Officer',
      'Payroll Officer', 'Department Head', 'Line Manager', 'IT Administrator',
      'HSE Officer', 'Auditor',
    ];
    const key = header.toUpperCase().replace(/[^A-Z]/g, '');
    const lookup = ROLE_BY_CANONICAL[key] as Role | undefined;
    return (lookup && all.includes(lookup) ? lookup : 'Auditor') as Role;
  }
  return normalizeRole(session.roles, header);
};

const permissions = (role: Role) => {
  const canCreate =
    role === 'Super Admin' || role === 'HR Director' || role === 'HR Manager' || role === 'HR Officer' || role === 'Admin Officer';
  const canCreateWithoutApproval = role === 'Super Admin' || role === 'HR Director';
  return { canCreate, canCreateWithoutApproval };
};

const storeDrafts = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeDrafts?: Map<string, DraftRecord> };
  if (!g.__dleHrisEmployeeDrafts) g.__dleHrisEmployeeDrafts = new Map();
  return g.__dleHrisEmployeeDrafts;
})();

const storeOverrides = (() => {
  const g = globalThis as unknown as { __dleHrisEmployeeOverrides?: Map<string, any> };
  if (!g.__dleHrisEmployeeOverrides) g.__dleHrisEmployeeOverrides = new Map();
  return g.__dleHrisEmployeeOverrides;
})();

const nowIso = () => new Date().toISOString();

const toDirectoryEmployee = (employee: any) => {
  const {
    employeeDbId,
    payrollSource,
    payrollGroup,
    salaryGrade,
    benefitGroup,
    payCurrency,
    paymentRun,
    paymentType,
    periodSalary,
    annualSalary,
    setupAssignedToPayroll,
    sourceSystem,
    sourceEmployeeId,
    sourceDraftId,
    sageEmployeeId,
    sageEmployeeCode,
    sageEntityCode,
    sageCompanyCode,
    sageCompanyName,
    sageStatusCode,
    sageStatusName,
    aiRiskScore,
    hasPhoto,
    ...directoryEmployee
  } = employee;

  const code = directoryEmployee.employeeCode || directoryEmployee.employeeId;
  return {
    ...directoryEmployee,
    hasPhoto: hasPhoto === true,
    photoUrl: hasPhoto && code ? `/api/hris/employees/${encodeURIComponent(code)}/photo` : undefined,
  };
};

const nextSeq = () => {
  const g = globalThis as unknown as { __dleHrisEmployeeSeq?: number };
  if (!g.__dleHrisEmployeeSeq) g.__dleHrisEmployeeSeq = 1;
  const cur = g.__dleHrisEmployeeSeq;
  g.__dleHrisEmployeeSeq = cur + 1;
  return cur;
};

const normalizeEmployeeId = (v: unknown) => {
  if (typeof v !== 'string') return '';
  return v.trim().toUpperCase();
};

const employeeTypePrefix = (employeeType: unknown) => {
  const normalized = typeof employeeType === 'string' ? employeeType.trim().toLowerCase() : '';
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
  return '';
};

const normalizeEmployeeCodeForPrefix = (employeeCode: string, prefix: string) => {
  const code = employeeCode.trim().toUpperCase();
  if ((prefix === 'N' || prefix === 'I') && code.startsWith(`P${prefix}`)) return code.slice(1);
  return code;
};

const isUniqueEmployeeId = async (employeeId: string) => {
  if (!employeeId) return true;
  if (storeOverrides.has(employeeId)) return false;
  for (const d of storeDrafts.values()) {
    const e = normalizeEmployeeId(d.draft?.employment?.employeeId);
    if (e && e === employeeId) return false;
  }
  const issuedInDb = await isEmployeeCodeAlreadyIssuedInDb(employeeId).catch(() => false);
  return !issuedInDb;
};

const finalizeEmployeeId = async (draft: EmployeeDraftPayload) => {
  const employeeType = draft.employment?.employmentType;
  const prefix = employeeTypePrefix(employeeType);
  if (!prefix) throw new Error('Employee Type must be Permanent, Lumpsum, Daily Rate, NYSC, IT, Intern, or Industrial Trainee');
  const dbEmployeeCode = await nextEmployeeCodeFromDb(employeeType);
  if (dbEmployeeCode) {
    const normalized = normalizeEmployeeCodeForPrefix(dbEmployeeCode, prefix);
    if (normalized.startsWith(prefix)) {
      const unique = await isUniqueEmployeeId(normalized);
      if (unique) return normalized;
    }
  }
  for (let i = 0; i < 1000; i++) {
    const n = nextSeq();
    const gen = `${prefix}${String(n).padStart(4, '0')}`;
    if (await isUniqueEmployeeId(gen)) return gen;
  }
  throw new Error('Unable to allocate employee ID');
};

const isStipendEmploymentType = (employeeType: unknown) => {
  const type = typeof employeeType === 'string' ? employeeType.trim().toUpperCase() : '';
  return type === 'NYSC' || type === 'IT' || type === 'INTERN' || type.includes('INDUSTRIAL TRAINEE') || type.includes('INDUSTRIAL TRAINING') || type.includes('INDUSTRIAL ATTACHMENT') || type.includes('INTERN');
};

const normalizePayrollPayloadBeforeCreate = (payload: EmployeeDraftPayload) => {
  if (!payload.payroll || typeof payload.payroll !== 'object') return;
  if (!payload.payroll.taxIdentificationNumber && payload.payroll.taxId) {
    payload.payroll.taxIdentificationNumber = String(payload.payroll.taxId).trim();
  }
  if (payload.payroll.nhfNumber && payload.payroll.nhfApplicable !== false && !payload.payroll.nhfApplicable) {
    payload.payroll.nhfApplicable = true;
  }
};

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const compact = (value: unknown) => String(value || '').trim();
const normalizedGrade = (value: unknown) => compact(value).toUpperCase().replace(/\s+/g, '');

const GRADE_EARNING_PROFILES: Record<string, { name: string; definitions: Array<{ code: string; name: string; taxable: boolean; percentOfGross: number; runFrequency?: string; includeInMonthlyPayroll?: boolean }> }> = {
  'junior-permanent': {
    name: 'Permanent Junior Staff',
    definitions: [
      { code: 'JNR_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.4 },
      { code: 'JNR_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.0696 },
      { code: 'JNR_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0328, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'JNR_MEDICAL', name: 'MEDICAL', taxable: true, percentOfGross: 0.06 },
      { code: 'JNR_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.3576 },
      { code: 'JNR_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.06 },
      { code: 'JNR_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.02 },
    ],
  },
  'senior-permanent': {
    name: 'Permanent Senior Staff',
    definitions: [
      { code: 'SNR_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.416 },
      { code: 'SNR_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.1128 },
      { code: 'SNR_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0313, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'SNR_MEDICAL', name: 'MEDICAL', taxable: true, percentOfGross: 0.0513 },
      { code: 'SNR_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.327 },
      { code: 'SNR_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.0411 },
      { code: 'SNR_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.0205 },
    ],
  },
  'management-permanent': {
    name: 'Permanent Management Staff',
    definitions: [
      { code: 'MGT_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.25 },
      { code: 'MGT_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.2 },
      { code: 'MGT_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0313, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'MGT_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.29 },
      { code: 'MGT_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.15 },
      { code: 'MGT_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.04 },
      { code: 'MGT_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.0387 },
    ],
  },
  'management-cola-permanent': {
    name: 'Permanent Management COLA Staff',
    definitions: [
      { code: 'MGT1COLA_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.4 },
      { code: 'MGT1COLA_HOUSIN', name: 'HOUSING', taxable: true, percentOfGross: 0.16 },
      { code: 'MGT1COLA_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.0256, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'MGT1COLA_OTHALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.232 },
      { code: 'MGT1COLA_TRANSP', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.12 },
      { code: 'MGT1COLA_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.032 },
      { code: 'MGT1COLA_UTILIT', name: 'UTILITIES', taxable: true, percentOfGross: 0.0304 },
    ],
  },
  'senior-management-permanent': {
    name: 'Permanent Senior Management Staff',
    definitions: [
      { code: 'SNM_BASIC', name: 'BASIC SALARY', taxable: true, percentOfGross: 0.2 },
      { code: 'SNM_HOUSE', name: 'HOUSING', taxable: true, percentOfGross: 0.1 },
      { code: 'SNM_LEAVE', name: 'LEAVE', taxable: true, percentOfGross: 0.025, runFrequency: 'leave-period', includeInMonthlyPayroll: false },
      { code: 'SNM_FURN', name: 'FURNITURE ALLOWANCE', taxable: true, percentOfGross: 0.075 },
      { code: 'SNM_OTHERALL', name: 'OTHER ALLOWANCE', taxable: true, percentOfGross: 0.43 },
      { code: 'SNM_TRANS', name: 'TRANSPORT ALLOWANCE', taxable: true, percentOfGross: 0.07 },
      { code: 'SNM_UTILITY', name: 'UTILITIES', taxable: true, percentOfGross: 0.1 },
    ],
  },
  'contract-lumpsum': {
    name: 'Contract Staff on Lumpsum',
    definitions: [
      { code: 'LUMPSUMTAX', name: 'LUMPSUM ALLOWANCE', taxable: true, percentOfGross: 1 },
    ],
  },
};

const BASIC_PERCENT_BY_PROFILE: Record<string, number> = {
  'junior-permanent': 0.4,
  'senior-permanent': 0.416,
  'management-permanent': 0.25,
  'management-cola-permanent': 0.4,
  'senior-management-permanent': 0.2,
  'contract-lumpsum': 1,
};

const resolveProfileFromDraft = (draft: EmployeeDraftPayload, employeeCode: string): keyof typeof GRADE_EARNING_PROFILES | 'stipend' | 'dayrate' | 'fallback' => {
  const salaryGrade = normalizedGrade(draft.payroll?.salaryGrade);
  const jobGrade = normalizedGrade(draft.job?.jobGrade);
  const grade = salaryGrade || jobGrade;
  const employmentType = compact(draft.employment?.employmentType || '').toUpperCase();
  const code = compact(employeeCode).toUpperCase();
  if (/^(P?IT|IT|I|P?NYSC|NYSC|N)\d+/.test(code) || /\b(INDUSTRIAL TRAINING|INDUSTRIAL TRAINEE|INTERN|NYSC|NATIONAL YOUTH SERVICE)\b/.test(employmentType)) return 'stipend';
  if (/^L\d+/.test(code) || /LUMPSUM|LUMP SUM/.test(employmentType)) return 'contract-lumpsum';
  if (/^C\d+/.test(code) || /DAILY RATE|DAY RATE/.test(employmentType)) return 'dayrate';
  if (/MGTCOLA|MGT COLA|MANAGEMENTCOLA|MANAGEMENT COLA/.test(grade)) return 'management-cola-permanent';
  if (/^(SNM|SMGT|SENIOR MANAGEMENT)/.test(grade)) return 'senior-management-permanent';
  if (/^(MGT|MGMT|MANAGEMENT)/.test(grade)) return 'management-permanent';
  if (/^(SS|SNR|SENIOR)/.test(grade)) return 'senior-permanent';
  if (/^(JS|JNR|JR|JUNIOR)/.test(grade)) return 'junior-permanent';
  if (/^P\d+/.test(code) || /PERMANENT/.test(employmentType)) return 'junior-permanent';
  if (/CONTRACT|TEMPORARY|CASUAL/.test(employmentType)) return 'contract-lumpsum';
  return 'fallback';
};

const expandGradeEarningLines = (draft: EmployeeDraftPayload, employeeCode: string): SagePayrollLineItem[] => {
  const profileId = resolveProfileFromDraft(draft, employeeCode);
  if (profileId === 'stipend' || profileId === 'dayrate' || profileId === 'fallback') return [];
  const profile = GRADE_EARNING_PROFILES[profileId];
  if (!profile) return [];
  const periodSalary = Number(draft.payroll?.periodSalary || 0);
  const annualSalary = Number(draft.payroll?.annualSalary || 0);
  const basicSalary = Number(draft.payroll?.basicSalary || 0);
  const basicPercent = BASIC_PERCENT_BY_PROFILE[profileId] || 0.4;
  let gross = 0;
  if (periodSalary > 0) {
    gross = periodSalary;
  } else if (annualSalary > 0) {
    gross = annualSalary / 12;
  } else if (basicSalary > 0 && basicPercent > 0) {
    gross = basicSalary / basicPercent;
  }
  if (gross <= 0) return [];
  const lines: SagePayrollLineItem[] = [];
  for (const def of profile.definitions) {
    if (def.includeInMonthlyPayroll === false && def.runFrequency) continue;
    const amount = roundMoney(gross * def.percentOfGross);
    if (amount <= 0) continue;
    lines.push({
      code: def.code,
      name: def.name,
      amount,
      taxableAmount: def.taxable ? amount : 0,
      ytdTotal: 0,
    });
  }
  return lines;
};

const parseTemplateLines = (template: unknown, taxableDefault: boolean): SagePayrollLineItem[] => {
  if (!template) return [];
  const text = compact(template);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    const array = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
    return array
      .map((entry: any) => {
        const code = String(entry?.code || entry?.key || '').trim() || String(entry?.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const name = String(entry?.name || entry?.description || code || 'Allowance').trim();
        const amount = roundMoney(Number(entry?.amount || entry?.value || 0));
        if (!code || amount <= 0) return null;
        const taxable = typeof entry?.taxable === 'boolean' ? entry.taxable : taxableDefault;
        return {
          code,
          name,
          amount,
          taxableAmount: taxable ? amount : 0,
          ytdTotal: 0,
        } as SagePayrollLineItem;
      })
      .filter(Boolean) as SagePayrollLineItem[];
  } catch {
    const parts = text.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
    return parts
      .map((part) => {
        const match = part.match(/^([^=:]+)[=:]\s*([\d,.]+)\s*(\(tax\))?\s*$/i);
        if (!match) return null;
        const name = match[1].trim();
        const amount = roundMoney(Number(String(match[2]).replace(/,/g, '')));
        const taxable = /tax/i.test(match[3] || '') || taxableDefault;
        const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24) || 'ALLOWANCE';
        if (amount <= 0) return null;
        return {
          code,
          name,
          amount,
          taxableAmount: taxable ? amount : 0,
          ytdTotal: 0,
        } as SagePayrollLineItem;
      })
      .filter(Boolean) as SagePayrollLineItem[];
  }
};

const mergeEarningLines = (groups: SagePayrollLineItem[][]): SagePayrollLineItem[] => {
  const byCode = new Map<string, SagePayrollLineItem>();
  for (const group of groups) {
    for (const line of group) {
      if (!line?.code) continue;
      const normalized = line.code.toUpperCase();
      const existing = byCode.get(normalized);
      if (!existing) {
        byCode.set(normalized, { ...line });
      } else {
        const amount = roundMoney(existing.amount + line.amount);
        byCode.set(normalized, {
          ...existing,
          amount,
          taxableAmount: roundMoney(Number(existing.taxableAmount || 0) + Number(line.taxableAmount || 0)),
        });
      }
    }
  }
  return [...byCode.values()];
};

const buildDefaultDeductionLines = (draft: EmployeeDraftPayload, _employeeCode: string, periodGross: number): SagePayrollLineItem[] => {
  const lines: SagePayrollLineItem[] = [];
  const nhfApplicable = draft.payroll?.nhfApplicable !== false;
  const nhfAmount = nhfApplicable && periodGross > 0 ? roundMoney(periodGross * 0.025) : 0;
  if (nhfAmount > 0) {
    lines.push({ code: 'NHF', name: 'National Housing Fund', amount: nhfAmount, taxableAmount: 0, ytdTotal: 0 });
  }
  const additionalPension = Number(draft.payroll?.additionalEmployeePensionMonthly || 0);
  if (additionalPension > 0) {
    lines.push({
      code: 'PENSION_EE2',
      name: 'Voluntary Additional Employee Pension',
      amount: roundMoney(additionalPension),
      taxableAmount: 0,
      ytdTotal: 0,
    });
  }
  return lines;
};

const buildSageJsonLinesForCreate = (draft: EmployeeDraftPayload, employeeCode: string) => {
  const gradeLines = expandGradeEarningLines(draft, employeeCode);
  const manualAllowanceLines = parseTemplateLines(draft.payroll?.allowancesTemplate, true);
  const manualDeductionLines = parseTemplateLines(draft.payroll?.deductionTemplate, false);
  const earningLines = mergeEarningLines([gradeLines, manualAllowanceLines]);
  const periodGross = earningLines.reduce((sum, line) => sum + line.amount, 0);
  const statutoryDeductions = buildDefaultDeductionLines(draft, employeeCode, periodGross);
  const deductionLines = mergeEarningLines([statutoryDeductions, manualDeductionLines]);
  return {
    earningLines,
    deductionLines,
    periodGross,
  };
};

const toProfileOverride = (employeeId: string, draft: EmployeeDraftPayload) => {
  const fullName = `${draft.personal?.firstName || ''} ${draft.personal?.lastName || ''}`.trim() || employeeId;
  const employmentType = (draft.employment?.employmentType as EmploymentType) || 'Permanent';
  const employmentStatus = (() => {
    const requested = draft.employment?.employmentStatus as EmploymentStatus | undefined;
    if (requested && requested !== 'Active' && requested !== 'Confirmed') return requested;
    if (employmentType === 'Permanent') return 'Probation';
    return requested || 'Active';
  })();
  const dateJoined = draft.employment?.dateJoined ? `${draft.employment.dateJoined}T00:00:00.000Z` : nowIso();
  const personalInfo: Record<string, string | null> = {
    title: draft.personal?.title || null,
    firstName: draft.personal?.firstName || null,
    middleName: draft.personal?.middleName || null,
    lastName: draft.personal?.lastName || null,
    preferredName: draft.personal?.preferredName || null,
    gender: draft.personal?.gender || null,
    dateOfBirth: draft.personal?.dateOfBirth ? `${draft.personal.dateOfBirth}T00:00:00.000Z` : null,
    maritalStatus: draft.personal?.maritalStatus || null,
    nationality: draft.personal?.nationality || null,
    stateOfOrigin: draft.personal?.stateOfOrigin || null,
    localGovernmentArea: draft.personal?.localGovernmentArea || null,
    religion: draft.personal?.religion || null,
    languagesSpoken: draft.personal?.languagesSpoken || null,
    personalEmail: draft.contact?.personalEmail || null,
    personalPhone: draft.contact?.primaryPhone || null,
    residentialAddress: draft.contact?.residentialAddress || null,
    permanentAddress: draft.contact?.permanentAddress || null,
  };
  const employmentDetails: Record<string, string | null> = {
    employeeId,
    employmentType,
    employmentStatus,
    dateJoined: draft.employment?.dateJoined || null,
    confirmationDate: draft.employment?.confirmationDueDate || null,
    probationStartDate: draft.employment?.probationStartDate || null,
    probationEndDate: draft.employment?.probationEndDate || null,
    contractStartDate: draft.employment?.contractStartDate || null,
    contractEndDate: draft.employment?.contractEndDate || null,
    exitDate: null,
    exitReason: null,
    rehireEligibility: null,
    workLocation: draft.employment?.workLocation || null,
    workMode: draft.employment?.workMode || null,
    shiftPattern: draft.employment?.shiftPattern || null,
    staffCategory: draft.employment?.staffCategory || null,
    employeeCategory: draft.employment?.employeeCategory || null,
    unionStatus: draft.employment?.unionStatus || null,
  };
  const jobDetails: Record<string, string | null> = {
    jobTitle: draft.job?.jobTitle || null,
    designation: draft.job?.designation || null,
    jobGrade: draft.job?.jobGrade || null,
    department: draft.job?.department || null,
    division: draft.job?.division || null,
    businessUnit: draft.job?.businessUnit || null,
    costCenter: draft.job?.costCenter || null,
    projectSite: draft.job?.projectSite || null,
    reportingManager: draft.job?.reportingManager || null,
    functionalManager: draft.job?.functionalManager || null,
    departmentHead: draft.job?.departmentHead || null,
    hrBusinessPartner: draft.job?.hrBusinessPartner || null,
    roleProfile: draft.job?.roleProfile || null,
    jobDescription: draft.job?.jobDescription || null,
    keyResponsibilities: draft.job?.keyResponsibilities || null,
  };
  const contacts: Record<string, string | null> = {
    officialEmail: draft.contact?.officialEmail || null,
    personalEmail: draft.contact?.personalEmail || null,
    officeExtension: draft.contact?.officeExtension || null,
    primaryPhone: draft.contact?.primaryPhone || null,
    alternativePhone: draft.contact?.alternatePhone || null,
    nearestBusStop: draft.contact?.nearestBusStop || null,
    city: draft.contact?.city || null,
    state: draft.contact?.state || null,
    country: draft.contact?.country || null,
    postalCode: draft.contact?.postalCode || null,
  };
  return {
    profile: {
      employeeId,
      fullName,
      jobTitle: draft.job?.jobTitle || '—',
      department: draft.job?.department || '—',
      businessUnit: draft.job?.businessUnit || '—',
      location: draft.job?.officeLocation || draft.employment?.workLocation || '—',
      employmentStatus,
      employmentType,
      reportingManager: draft.job?.reportingManager || '—',
      dateJoined,
      personalInfo,
      employmentDetails,
      jobDetails,
      contacts,
    },
    emergencyContacts: draft.emergencyContacts || [],
    documents: (draft.documents || []).map((d: any) => ({
      id: d.id || `doc-${Math.random().toString(16).slice(2)}`,
      category: d.category || 'Document',
      fileName: d.fileName || 'file',
      mimeType: d.mimeType || 'application/octet-stream',
      sizeBytes: typeof d.sizeBytes === 'number' ? d.sizeBytes : 0,
      status: 'Uploaded',
      uploadedAt: nowIso(),
      expiresAt: d.expiresAt ? `${d.expiresAt}T00:00:00.000Z` : null,
      verifiedBy: null,
    })),
    payroll: draft.payroll || {},
    onboardingChecklist: draft.onboardingChecklist || [],
  };
};

export async function POST(request: Request) {
  const role = await getRole(request);
  if (!permissions(role).canCreate) return jsonErr(403, 'Permission denied');
  const body = (await request.json().catch(() => null)) as any;
  if (!body || typeof body !== 'object') return jsonErr(400, 'Invalid JSON body');
  const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
  const mode = typeof body.mode === 'string' ? body.mode : 'create';
  if (!draftId) return jsonErr(400, 'draftId is required');
  const draftRec = storeDrafts.get(draftId) || ((await getEmployeeDraftFromDb(draftId)) as DraftRecord | null);
  if (!draftRec) return jsonErr(404, 'Draft not found');
  storeDrafts.set(draftId, draftRec);
  if (draftRec.status === 'created') return jsonErr(400, 'Draft already created');
  // Approval gate disabled for now: any creatable draft/submitted/approved record can be saved directly.
  if (!['draft', 'submitted', 'approved'].includes(String(draftRec.status || ''))) {
    return jsonErr(400, `Cannot create employee from draft status "${draftRec.status}".`);
  }

  normalizePayrollPayloadBeforeCreate(draftRec.draft);

  const officialEmail = String(draftRec.draft?.contact?.officialEmail || '').trim();
  if (officialEmail) {
    const owner = await findEmployeeByOfficialEmailInDb(officialEmail);
    if (owner) return jsonErr(409, officialEmailAlreadyUsedMessage(owner, officialEmail.toLowerCase()));
  }

  const duplicateMatches = await findDuplicateEmployeesInDb({
    firstName: draftRec.draft.personal?.firstName,
    lastName: draftRec.draft.personal?.lastName,
    dateOfBirth: draftRec.draft.personal?.dateOfBirth,
    gender: draftRec.draft.personal?.gender,
  }).catch(() => []);
  if (duplicateMatches.length) {
    const matches = duplicateMatches.map((m) => `${m.employeeCode}${m.dateOfBirth ? ` (DOB: ${m.dateOfBirth})` : ''}${m.fullName ? ` · ${m.fullName}` : ''}`).join('; ');
    const top = duplicateMatches.slice(0, 10).map((m) => ({
      employeeCode: m.employeeCode,
      fullName: m.fullName,
      dateOfBirth: m.dateOfBirth,
      gender: m.gender,
      dateJoined: m.dateJoined,
      employmentType: m.employmentType,
    }));
    return jsonErr(409, `Duplicate employee profile detected: ${matches}. Confirm the employee does not already exist in HRIS before creating.`, { duplicateMatches: top });
  }

  const isDayRate = employeeTypePrefix(draftRec.draft.employment?.employmentType) === 'C';
  const isStipend = isStipendEmploymentType(draftRec.draft.employment?.employmentType);
  const basicSalary = Number(draftRec.draft.payroll?.basicSalary || 0);
  const periodSalary = Number(draftRec.draft.payroll?.periodSalary || 0);
  const annualSalary = Number(draftRec.draft.payroll?.annualSalary || 0);
  const ratePerDay = Number(draftRec.draft.payroll?.ratePerDay || 0) || Number(draftRec.draft.payroll?.dailyRate || 0);
  if (!isStipend && !isDayRate && basicSalary <= 0 && periodSalary <= 0 && annualSalary <= 0) {
    return jsonErr(422, 'Payroll Salary is required. Provide at least one of: Basic Salary, Period (Monthly) Salary, or Annual Salary for non-stipend employees.');
  }
  if (isDayRate && ratePerDay <= 0 && basicSalary <= 0 && periodSalary <= 0) {
    return jsonErr(422, 'Daily Rate is required for Day Rate (casual) employees before they can be saved to payroll.');
  }
  if (!isStipend && !isDayRate) {
    const gradeSet = Boolean(draftRec.draft.payroll?.salaryGrade || draftRec.draft.job?.jobGrade);
    if (!gradeSet) {
      return jsonErr(422, 'Salary Grade (or Job Grade) is required for Permanent / Contract / Lumpsum employees so the payroll engine can assign the correct earning lines.');
    }
  }
  if (!isStipend) {
    const pensionProvider = String(draftRec.draft.payroll?.pensionProvider || '').trim();
    const bankAccountNo = String(draftRec.draft.payroll?.accountNumber || '').trim();
    const bankName = String(draftRec.draft.payroll?.bankName || '').trim();
    if (!pensionProvider && String(draftRec.draft.employment?.employmentType || '').trim().toUpperCase() !== 'DAILY RATE') {
      return jsonErr(422, 'Pension Provider (PFA) is required for salaried employees (PenCom compliance). Pick a PFA before saving; RSA PIN can be updated later after enrolment.');
    }
    if (!bankAccountNo || !bankName) {
      return jsonErr(422, 'Bank Account Number and Bank Name are required on every employee before they can be added to payroll.');
    }
    if (bankAccountNo && !/^\d{10}$/.test(bankAccountNo.replace(/\D/g, '').slice(-10))) {
      return jsonErr(422, `Invalid Bank Account Number "${bankAccountNo}". Nigerian bank accounts must be 10 digits (NNNNNNNNNN).`);
    }
  }

  let employeeId = '';
  try {
    employeeId = await finalizeEmployeeId(draftRec.draft);
  } catch (error) {
    return jsonErr(409, error instanceof Error ? error.message : 'Unable to allocate employee code');
  }
  draftRec.draft.employment.employeeId = employeeId;
  const override = toProfileOverride(employeeId, draftRec.draft);
  const startOnboarding = mode === 'create-and-start-onboarding';
  const { earningLines, deductionLines } = buildSageJsonLinesForCreate(draftRec.draft, employeeId);
  const sageEarningLinesJson = earningLines.length ? JSON.stringify(earningLines) : null;
  const sageDeductionLinesJson = deductionLines.length ? JSON.stringify(deductionLines) : null;
  const finalRatePerDay = Number(draftRec.draft.payroll?.ratePerDay || 0) || Number(draftRec.draft.payroll?.dailyRate || 0) || null;
  const finalRatePerHour = Number(draftRec.draft.payroll?.ratePerHour || 0) || null;
  const finalHoursPerDay = Number(draftRec.draft.payroll?.hoursPerDay || 0) || null;
  try {
    await createEmployeeFromDraftInDb(draftId, employeeId, draftRec.draft, role, startOnboarding, {
      sageEarningLinesJson,
      sageDeductionLinesJson,
      ratePerDay: finalRatePerDay,
      ratePerHour: finalRatePerHour,
      hoursPerDay: finalHoursPerDay,
      paymentRun: String(draftRec.draft.payroll?.paymentRun || draftRec.draft.payroll?.payrollGroup || 'MAIN').trim() || null,
      paymentType: String(draftRec.draft.payroll?.paymentType || 'Bank Transfer').trim() || null,
    });
    const additionalPensionMonthly = Number(draftRec.draft.payroll?.additionalEmployeePensionMonthly || 0) || null;
    const annualRentRelief = Number(draftRec.draft.payroll?.annualRentRelief || 0) || null;
    await writePayrollEmployeeOption({
      employeeId,
      employeeCode: employeeId,
      nhfApplicable: draftRec.draft.payroll?.nhfApplicable !== false,
      nhfNumber: String(draftRec.draft.payroll?.nhfNumber || '').trim() || null,
      additionalEmployeePensionMonthly: additionalPensionMonthly && additionalPensionMonthly > 0 ? additionalPensionMonthly : null,
      annualRentRelief: annualRentRelief && annualRentRelief > 0 ? annualRentRelief : null,
      payrollGroup: String(draftRec.draft.payroll?.payrollGroup || '').trim() || null,
      salaryGrade: String(draftRec.draft.payroll?.salaryGrade || '').trim() || null,
      jobGrade: String(draftRec.draft.job?.jobGrade || '').trim() || null,
      healthInsurancePlan: String(draftRec.draft.payroll?.healthInsurancePlan || '').trim() || null,
      benefitGroup: String(draftRec.draft.payroll?.benefitGroup || '').trim() || null,
      setupAssignedToPayroll: true,
      excludedFromPayrollRun: false,
      ratePerDay: finalRatePerDay && finalRatePerDay > 0 ? finalRatePerDay : null,
      ratePerHour: finalRatePerHour && finalRatePerHour > 0 ? finalRatePerHour : null,
      hoursPerDay: finalHoursPerDay && finalHoursPerDay > 0 ? finalHoursPerDay : null,
      updatedBy: role,
    });
  } catch (error) {
    const friendly = await humanizeEmployeeCreateDbError(error);
    return jsonErr(409, friendly instanceof Error ? friendly.message : 'Unable to create employee in DLE_Enterprise');
  }
  storeOverrides.set(employeeId, override);
  invalidatePayrollEmployeeCache();
  invalidatePayrollEmployeeOptionsCache();

  draftRec.status = 'created';
  draftRec.updatedAt = nowIso();
  draftRec.audit.unshift({ id: `audit-${Math.random().toString(16).slice(2)}`, at: draftRec.updatedAt, action: 'Employee created', performedBy: role });
  await saveEmployeeDraftToDb(draftRec);

  if (startOnboarding) {
    draftRec.audit.unshift({ id: `audit-${Math.random().toString(16).slice(2)}`, at: nowIso(), action: 'Onboarding started', performedBy: role });
    return jsonOk({ employeeId, startedOnboarding: true });
  }

  return jsonOk({ employeeId, startedOnboarding: false });
}

export async function GET() {
  try {
    const employeeSource = await readDirectoryEmployees();
    const directoryRows = employeeSource.employees.map(toDirectoryEmployee);
    const existingKeys = new Set(directoryRows.map((row) => normalizeEmployeeId(row.employeeId || row.employeeCode || '')));
    for (const [overrideId, override] of storeOverrides.entries()) {
      const key = normalizeEmployeeId(overrideId);
      if (existingKeys.has(key)) continue;
      const p = override?.profile || {};
      directoryRows.unshift({
        employeeId: p.employeeId || overrideId,
        employeeCode: p.employeeId || overrideId,
        employeeDbId: 0,
        id: p.employeeId || overrideId,
        fullName: p.fullName || overrideId,
        preferredName: p.preferredName || null,
        title: p.personalInfo?.title || '',
        firstName: p.personalInfo?.firstName || '',
        middleName: p.personalInfo?.middleName || '',
        lastName: p.personalInfo?.lastName || '',
        gender: p.personalInfo?.gender || '',
        dateOfBirth: p.personalInfo?.dateOfBirth ? p.personalInfo.dateOfBirth.slice(0, 10) : '',
        maritalStatus: p.personalInfo?.maritalStatus || '',
        email: p.contacts?.officialEmail || p.contacts?.personalEmail || '',
        officialEmail: p.contacts?.officialEmail || '',
        personalEmail: p.contacts?.personalEmail || '',
        phone: p.contacts?.primaryPhone || p.contacts?.officeExtension || '',
        primaryPhone: p.contacts?.primaryPhone || '',
        alternatePhone: p.contacts?.alternativePhone || p.contacts?.alternatePhone || '',
        officeExtension: p.contacts?.officeExtension || '',
        residentialAddress: p.contacts?.residentialAddress || '',
        permanentAddress: p.contacts?.permanentAddress || '',
        city: p.contacts?.city || '',
        state: p.contacts?.state || '',
        country: p.contacts?.country || '',
        postalCode: p.contacts?.postalCode || '',
        nearestBusStop: p.contacts?.nearestBusStop || '',
        nationality: p.personalInfo?.nationality || '',
        stateOfOrigin: p.personalInfo?.stateOfOrigin || '',
        localGovernmentArea: p.personalInfo?.localGovernmentArea || '',
        religion: p.personalInfo?.religion || '',
        languagesSpoken: p.personalInfo?.languagesSpoken || '',
        jobTitle: p.jobTitle || '',
        designation: p.jobDetails?.designation || '',
        jobGrade: p.jobDetails?.jobGrade || p.employmentDetails?.jobGrade || '',
        department: p.department || '',
        division: p.jobDetails?.division || '',
        businessUnit: p.businessUnit || '',
        costCenter: p.jobDetails?.costCenter || '',
        managerName: p.reportingManager || '',
        functionalManager: p.jobDetails?.functionalManager || '',
        departmentHead: p.jobDetails?.departmentHead || '',
        hrBusinessPartner: p.jobDetails?.hrBusinessPartner || '',
        location: p.location || '',
        workLocation: p.employmentDetails?.workLocation || '',
        officeLocation: p.jobDetails?.officeLocation || '',
        projectSite: p.jobDetails?.projectSite || '',
        staffCategory: p.employmentDetails?.staffCategory || '',
        employeeCategory: p.employmentDetails?.employeeCategory || '',
        employmentType: p.employmentType || '',
        status: p.employmentStatus || '',
        expatriate: false,
        fieldWorker: false,
        remoteWorker: false,
        dateJoined: p.dateJoined ? p.dateJoined.slice(0, 10) : '',
        probationStartDate: p.employmentDetails?.probationStartDate || '',
        probationEndDate: p.employmentDetails?.probationEndDate || '',
        confirmationDueDate: p.employmentDetails?.confirmationDate || '',
        contractStartDate: p.employmentDetails?.contractStartDate || '',
        yearsOfService: 0,
        emergencyContactsComplete: false,
        emergencyContactCount: 0,
        documentCount: 0,
        hasManagerAssigned: Boolean(p.reportingManager),
        hasPhoto: false,
        payrollSource: 'DLE_Enterprise HRIS (just-created)',
        payrollGroup: p.payroll?.payrollGroup || p.employmentDetails?.employeeCategory || '',
        salaryGrade: p.payroll?.salaryGrade || p.jobDetails?.jobGrade || '',
        benefitGroup: p.payroll?.benefitGroup || '',
        payCurrency: p.payroll?.payCurrency || 'NGN',
        paymentRun: p.payroll?.paymentRun || '',
        paymentType: p.payroll?.paymentType || 'Bank Transfer',
        accountNo: p.payroll?.accountNumber || '',
        accountName: p.payroll?.accountName || '',
        bankName: p.payroll?.bankName || '',
        pensionProvider: p.payroll?.pensionProvider || '',
        pensionPin: p.payroll?.pensionPin || '',
        taxIdentificationNumber: p.payroll?.taxIdentificationNumber || '',
        periodSalary: Number(p.payroll?.periodSalary || p.payroll?.basicSalary || 0) || null,
        basicSalary: Number(p.payroll?.basicSalary || 0) || null,
        annualSalary: Number(p.payroll?.annualSalary || 0) || null,
        ratePerDay: Number(p.payroll?.ratePerDay || p.payroll?.dailyRate || 0) || null,
        ratePerHour: Number(p.payroll?.ratePerHour || 0) || null,
        hoursPerDay: Number(p.payroll?.hoursPerDay || 0) || null,
        hoursPerPeriod: Number(p.payroll?.hoursPerPeriod || 0) || null,
        nhfApplicable: p.payroll?.nhfApplicable !== false,
        annualRentRelief: Number(p.payroll?.annualRentRelief || 0) || null,
        additionalEmployeePensionMonthly: Number(p.payroll?.additionalEmployeePensionMonthly || 0) || null,
        setupAssignedToPayroll: true,
        sagePayrollEarnings: [],
        sagePayrollDeductions: { paye: null, pensionEmployee: null, nhf: null, other: null, totalDeductions: null, lines: [] },
        sagePayrollContributions: { pensionEmployer: null, nsitf: null, itf: null, lines: [] },
        sourceSystem: 'DLE_Enterprise HRIS (override)',
        sourceEmployeeId: '',
        createdAt: nowIso(),
        modifiedAt: nowIso(),
        aiRiskScore: 30,
        trainingCompliance: 'Compliant',
      } as any);
    }
    return jsonOk({
      source: employeeSource.source,
      dataSource: payrollDataSourceInfo(employeeSource),
      syncedAt: nowIso(),
      employees: directoryRows,
    });
  } catch (error) {
    return jsonErr(502, error instanceof Error ? `Unable to read DLE_Enterprise HRIS employees: ${error.message}` : 'Unable to read DLE_Enterprise HRIS employees');
  }
}
