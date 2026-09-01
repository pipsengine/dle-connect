/**
 * Payroll is four independent schedules:
 * DLE Salaries, DLPC Salaries, DLE Day-rate, DLPC Day-rate.
 * Company matches payment-management sites (DLE / DLPC, including DLENG / DLPCG).
 */
import type { PayrollRunPack } from '@/lib/payroll-employee-classification';

export type PayrollCompany = 'DLE' | 'DLPC';

export const PAYROLL_COMPANIES: PayrollCompany[] = ['DLE', 'DLPC'];

export type PayrollScheduleScopeId = 'dle-salaries' | 'dlpc-salaries' | 'dle-dayrate' | 'dlpc-dayrate';

export type PayrollScheduleScope = {
  id: PayrollScheduleScopeId;
  company: PayrollCompany;
  pack: PayrollRunPack;
  label: string;
  shortLabel: string;
  href: string;
  processHref: string;
  approvalHref: string;
  bankLabel: string;
  kindLabel: string;
};

const processHrefFor = (id: PayrollScheduleScopeId) => `/hris/payroll-management/process-payroll/${id}`;
const approvalHrefFor = (id: PayrollScheduleScopeId) => `/hris/payroll-management/payroll-approval/${id}`;

export const PAYROLL_SCHEDULE_SCOPES: PayrollScheduleScope[] = [
  {
    id: 'dle-salaries',
    company: 'DLE',
    pack: 'salaried',
    label: 'DLE Salaries',
    shortLabel: 'DLE · Salaries',
    href: processHrefFor('dle-salaries'),
    processHref: processHrefFor('dle-salaries'),
    approvalHref: approvalHrefFor('dle-salaries'),
    bankLabel: 'DLE Salaries',
    kindLabel: 'Salaries',
  },
  {
    id: 'dlpc-salaries',
    company: 'DLPC',
    pack: 'salaried',
    label: 'DLPC Salaries',
    shortLabel: 'DLPC · Salaries',
    href: processHrefFor('dlpc-salaries'),
    processHref: processHrefFor('dlpc-salaries'),
    approvalHref: approvalHrefFor('dlpc-salaries'),
    bankLabel: 'DLPC Salaries',
    kindLabel: 'Salaries',
  },
  {
    id: 'dle-dayrate',
    company: 'DLE',
    pack: 'daily-rate',
    label: 'DLE Day-rate',
    shortLabel: 'DLE · Day-rate',
    href: processHrefFor('dle-dayrate'),
    processHref: processHrefFor('dle-dayrate'),
    approvalHref: approvalHrefFor('dle-dayrate'),
    bankLabel: 'DLE Day-rate',
    kindLabel: 'Day-rate contractors',
  },
  {
    id: 'dlpc-dayrate',
    company: 'DLPC',
    pack: 'daily-rate',
    label: 'DLPC Day-rate',
    shortLabel: 'DLPC · Day-rate',
    href: processHrefFor('dlpc-dayrate'),
    processHref: processHrefFor('dlpc-dayrate'),
    approvalHref: approvalHrefFor('dlpc-dayrate'),
    bankLabel: 'DLPC Day-rate',
    kindLabel: 'Day-rate contractors',
  },
];

const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();

/** Same site codes as finance payment management. */
export const normalizePayrollCompany = (value?: string | null): PayrollCompany | null => {
  const code = upper(value).replace(/[^A-Z0-9]/g, '');
  if (code === 'DLENG' || code === 'DLE' || code === 'DLENG LTD') return 'DLE';
  if (code === 'DLPCG' || code === 'DLPC') return 'DLPC';
  return null;
};

export const resolvePayrollCompany = (record: {
  payrollGroup?: string | null;
  businessUnit?: string | null;
  location?: string | null;
  companyCode?: string | null;
  companyName?: string | null;
  department?: string | null;
}): PayrollCompany => {
  const fromCode = normalizePayrollCompany(record.companyCode)
    || normalizePayrollCompany(record.companyName)
    || normalizePayrollCompany(record.payrollGroup)
    || normalizePayrollCompany(record.businessUnit);
  if (fromCode) return fromCode;
  const blob = [
    record.companyCode || '',
    record.companyName || '',
    record.payrollGroup || '',
    record.businessUnit || '',
    record.department || '',
    record.location || '',
  ].join(' ').toUpperCase();
  if (/\bDLPCG\b|\bDLPC\b|DORMAN\s*LONG\s*PRODUCTS|PRODUCTS\s*CO|LIMITED\s*PRODUCTS|DLPC\s*LTD|DLPC\s*AGEGE/.test(blob)) {
    return 'DLPC';
  }
  return 'DLE';
};

export const payrollScheduleScopeById = (id?: string | null) =>
  PAYROLL_SCHEDULE_SCOPES.find((scope) => scope.id === compact(id).toLowerCase()) || null;

export const payrollScheduleScopeFromSection = (section?: string | null) =>
  payrollScheduleScopeById(section);

export const findPayrollScheduleScope = (pack?: string | null, company?: string | null) => {
  const normalizedPack = compact(pack).toLowerCase() === 'daily-rate' ? 'daily-rate' : 'salaried';
  const normalizedCompany = normalizePayrollCompany(company) || 'DLE';
  return PAYROLL_SCHEDULE_SCOPES.find((scope) => scope.pack === normalizedPack && scope.company === normalizedCompany)
    || PAYROLL_SCHEDULE_SCOPES[0];
};

export const payrollScheduleScopeLabel = (pack?: string | null, company?: string | null) =>
  findPayrollScheduleScope(pack, company).label;

export const isPayrollScheduleSection = (section?: string | null) => Boolean(payrollScheduleScopeFromSection(section));

const hrisPath = (href: string) => href.replace(/^\/hris/, '') || '/';

export const payrollScheduleProcessNavItems = () =>
  PAYROLL_SCHEDULE_SCOPES.map((scope) => ({
    title: scope.label,
    slug: scope.id,
    route: hrisPath(scope.processHref),
    permissionKey: 'page.payroll.management.view',
  }));

export const payrollScheduleApprovalNavItems = () =>
  PAYROLL_SCHEDULE_SCOPES.map((scope) => ({
    title: scope.label,
    slug: scope.id,
    route: hrisPath(scope.approvalHref),
    permissionKey: 'page.hris.payroll.approval.view',
  }));
