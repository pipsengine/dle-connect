import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import { calculatePayrollEarnings, calculatePermanentUnionDues, isGenericPayrollGrade } from '@/lib/payroll-earnings-engine';
import { isNonPermanentPayrollEmployee, permanentStyleSageEarnings, sagePayslipAcceptableForEmployee, sanitizePermanentPayslipEarnings } from '@/lib/payroll-employee-classification';
import { activeLoansVersion, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { hasLeaveAllowanceInYear, postLeaveAllowanceOnAnnualLeaveApproval } from '@/lib/payroll-leave-allowance-store';
import { annualLeaveEntitlementForEmployee, dormantLongPolicy, isFourteenDayPaidLeaveEmployee, readLeaveApplicationsForReconciliation } from '@/lib/leave-management-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { listEssReleasedPayrollPeriods, latestEssReleasedPayrollPeriod } from '@/lib/ess-payroll-periods';
import { isEnterprisePayrollPeriod } from '@/lib/payroll-enterprise-source';
import { ensureSagePeriodEarningAdjustments } from '@/lib/payroll-period-earning-adjustments-store';
import { buildStoredEnterprisePayslipSnapshot, computeEnterpriseYtdTotals, readAuthoritativeSagePayslipSnapshotsByPeriod, readEnterpriseEmployeePayslipRecordsByPeriod } from '@/lib/payroll-ess-payslip-store';
import type { SageEmployeePayslipSnapshot } from '@/lib/sage-people-payroll-store';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { payslipIdentityMap, syncPayslipIdentitiesFromSage, type PayslipEmployeeIdentity } from '@/lib/payroll-payslip-identity-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import { buildEssDashboardContext, buildEssEmployeeLookupKeys } from '@/lib/ess-dashboard-store';
import { invalidateEssPortalCache, readEssPortalResponseCache, writeEssPortalResponseCache } from '@/lib/ess-portal-cache';

type EssRequest = {
  id: string;
  employeeId: string;
  category: string;
  title: string;
  status: 'Draft' | 'Submitted' | 'Line Manager Review' | 'HR Review' | 'Finance Review' | 'Approved' | 'Rejected' | 'Terminated' | 'Closed';
  priority: 'Low' | 'Normal' | 'High';
  submittedAt: string;
  updatedAt: string;
  approvers: string[];
  comments: Array<{ at: string; actor: string; comment: string }>;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  payrollPeriod?: string;
  paidLeave?: boolean;
  reason?: string;
  relieverEmployeeId?: string;
  relieverName?: string;
  handover?: string;
  workflow?: Array<{ stage: string; owner: string; status: string; actedAt?: string | null; comment?: string | null }>;
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();
const linkedEmployeePhotoUrl = (employee: DleEmployeeDirectoryRow) => {
  const code = compact(employee.employeeCode || employee.employeeId);
  if (!code) return '';
  return `/api/hris/employees/${encodeURIComponent(code)}/photo`;
};
const round = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const monthEndDate = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || 2026, month || 1, 0)).toISOString().slice(0, 10);
};
const periodStartDate = (period: string) => `${period}-01`;
const periodTitle = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year || 2026, (month || 1) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const maskAccount = (value: string) => {
  const text = compact(value);
  if (!text) return 'Not configured';
  if (text.length <= 4) return text;
  return `${'*'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
};
const configured = (value: unknown) => compact(value) || 'Not configured';
const dateOnly = (value: unknown) => {
  const text = compact(value);
  if (!text) return 'Not configured';
  const date = new Date(text.includes('T') ? text : `${text.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

type EssProfileField = { label: string; value: string };
type EssProfileSection = {
  id: string;
  label: string;
  status: string;
  approvalRequired: boolean;
  fields: EssProfileField[];
};

const buildEssProfileSections = (
  employee: DleEmployeeDirectoryRow,
  documents: Array<{ title: string; category: string; version: string; status: string }>,
): EssProfileSection[] => {
  const emergencyStatus = employee.emergencyContactsComplete
    ? `${employee.emergencyContactCount} contact(s) on file`
    : 'Not configured';

  const qualDocs = documents.filter((doc) =>
    /qualification|degree|education|diploma|bsc|msc|hnd|ond|university|polytechnic|nysc/i.test(`${doc.title} ${doc.category}`.toLowerCase()),
  );
  const qualificationFields: EssProfileField[] = qualDocs.length
    ? qualDocs.flatMap((doc, index) => {
        const suffix = qualDocs.length > 1 ? ` ${index + 1}` : '';
        return [
          { label: `Institution${suffix}`, value: configured(doc.category) },
          { label: `Qualification${suffix}`, value: configured(doc.title) },
          { label: `Year / Version${suffix}`, value: configured(doc.version) },
          { label: `Attachment status${suffix}`, value: configured(doc.status) },
        ];
      })
    : [
        { label: 'Institution', value: 'Not on file' },
        { label: 'Qualification', value: 'Not on file' },
        { label: 'Year', value: 'Not on file' },
        { label: 'Attachment', value: 'Not uploaded' },
      ];

  const certDocs = documents.filter((doc) =>
    /certification|certificate|hse|first aid|safety/i.test(`${doc.title} ${doc.category}`.toLowerCase()),
  );
  const certificationFields: EssProfileField[] = certDocs.length
    ? certDocs.flatMap((doc, index) => {
        const suffix = certDocs.length > 1 ? ` ${index + 1}` : '';
        return [
          { label: `Certificate${suffix}`, value: configured(doc.title) },
          { label: `Issuer / Category${suffix}`, value: configured(doc.category) },
          { label: `Expiry / Version${suffix}`, value: configured(doc.version) },
          { label: `Status${suffix}`, value: configured(doc.status) },
        ];
      })
    : [
        { label: 'Certificate', value: 'Not on file' },
        { label: 'Issuer', value: 'Not on file' },
        { label: 'Expiry', value: 'Not on file' },
        { label: 'Attachment', value: 'Not uploaded' },
      ];

  return [
    {
      id: 'personal',
      label: 'Personal Information',
      status: 'View / update',
      approvalRequired: true,
      fields: [
        { label: 'Title', value: configured(employee.title) },
        { label: 'First name', value: configured(employee.firstName) },
        { label: 'Middle name', value: configured(employee.middleName) },
        { label: 'Last name', value: configured(employee.lastName) },
        { label: 'Preferred name', value: configured(employee.preferredName) },
        { label: 'Date of birth', value: dateOnly(employee.dateOfBirth) },
        { label: 'Gender', value: configured(employee.gender) },
        { label: 'Marital status', value: configured(employee.maritalStatus) },
        { label: 'Nationality', value: configured(employee.nationality) },
        { label: 'State of origin', value: configured(employee.stateOfOrigin) },
        { label: 'LGA', value: configured(employee.localGovernmentArea) },
        { label: 'Religion', value: configured(employee.religion) },
        { label: 'Languages spoken', value: configured(employee.languagesSpoken) },
      ],
    },
    {
      id: 'employment',
      label: 'Employment Details',
      status: 'HR verified',
      approvalRequired: false,
      fields: [
        { label: 'Employee ID', value: configured(employee.employeeCode || employee.employeeId) },
        { label: 'Job title', value: configured(employee.jobTitle || employee.designation) },
        { label: 'Department', value: configured(employee.department) },
        { label: 'Business unit', value: configured(employee.businessUnit) },
        { label: 'Salary grade', value: configured(employee.salaryGrade || employee.jobGrade) },
        { label: 'Employment type', value: configured(employee.employmentType) },
        { label: 'Staff category', value: configured(employee.staffCategory) },
        { label: 'Work location', value: configured(employee.workLocation || employee.location) },
        { label: 'Cost centre', value: configured(employee.costCenter) },
        { label: 'Reporting manager', value: configured(employee.managerName) },
        { label: 'Date joined', value: dateOnly(employee.dateJoined || employee.contractStartDate) },
        { label: 'Confirmation date', value: dateOnly(employee.confirmationDueDate) },
        { label: 'Shift pattern', value: configured(employee.shift) },
      ],
    },
    {
      id: 'contact',
      label: 'Contact Details',
      status: 'View / update',
      approvalRequired: true,
      fields: [
        { label: 'Official email', value: configured(employee.officialEmail || employee.email) },
        { label: 'Personal email', value: configured(employee.personalEmail) },
        { label: 'Primary phone', value: configured(employee.primaryPhone || employee.phone) },
        { label: 'Alternate phone', value: configured(employee.alternatePhone) },
        { label: 'Office extension', value: configured(employee.officeExtension) },
      ],
    },
    {
      id: 'address',
      label: 'Addresses',
      status: 'View / update',
      approvalRequired: true,
      fields: [
        { label: 'Residential address', value: configured(employee.residentialAddress) },
        { label: 'Permanent address', value: configured(employee.permanentAddress) },
        { label: 'Nearest bus stop', value: configured(employee.nearestBusStop) },
        { label: 'City', value: configured(employee.city) },
        { label: 'State', value: configured(employee.state) },
        { label: 'Country', value: configured(employee.country) },
        { label: 'Postal code', value: configured(employee.postalCode) },
      ],
    },
    {
      id: 'emergency',
      label: 'Emergency Contacts',
      status: emergencyStatus,
      approvalRequired: true,
      fields: [
        { label: 'Contacts on file', value: emergencyStatus },
        { label: 'Primary contact', value: employee.emergencyContactsComplete ? 'Recorded in HRIS' : 'Not configured' },
        { label: 'Relationship', value: employee.emergencyContactsComplete ? 'See HR record' : 'Not configured' },
        { label: 'Phone', value: employee.emergencyContactsComplete ? 'See HR record' : 'Not configured' },
      ],
    },
    {
      id: 'next-of-kin',
      label: 'Next of Kin',
      status: employee.emergencyContactsComplete ? 'On file' : 'Not configured',
      approvalRequired: true,
      fields: [
        { label: 'Name', value: employee.emergencyContactsComplete ? 'Recorded in HRIS' : 'Not configured' },
        { label: 'Relationship', value: employee.emergencyContactsComplete ? 'See HR record' : 'Not configured' },
        { label: 'Phone', value: employee.emergencyContactsComplete ? 'See HR record' : 'Not configured' },
        { label: 'Address', value: employee.emergencyContactsComplete ? 'See HR record' : 'Not configured' },
      ],
    },
    {
      id: 'bank',
      label: 'Bank Details',
      status: employee.bankName && employee.accountNo ? 'Masked / encrypted' : 'Not configured',
      approvalRequired: true,
      fields: [
        { label: 'Bank', value: configured(employee.bankName) },
        { label: 'Branch', value: configured(employee.branchName) },
        { label: 'Account number', value: maskAccount(employee.accountNo || '') },
        { label: 'Account name', value: configured(employee.accountName) },
        { label: 'Pension provider', value: configured(employee.pensionProvider) },
        { label: 'Tax ID', value: configured(employee.taxIdentificationNumber) },
      ],
    },
    {
      id: 'photo',
      label: 'Profile Photo',
      status: employee.hasPhoto ? 'Current photo on file' : 'Upload / replace',
      approvalRequired: true,
      fields: [
        { label: 'Photo status', value: employee.hasPhoto ? 'Uploaded' : 'Not uploaded' },
        { label: 'Employee code', value: configured(employee.employeeCode || employee.employeeId) },
        { label: 'Last profile sync', value: dateOnly(employee.modifiedAt || employee.createdAt) },
      ],
    },
    {
      id: 'qualifications',
      label: 'Qualifications',
      status: qualDocs.length ? 'Document-backed' : 'Incomplete',
      approvalRequired: true,
      fields: qualificationFields,
    },
    {
      id: 'certifications',
      label: 'Certifications',
      status: certDocs.length ? 'Document-backed' : 'Incomplete',
      approvalRequired: true,
      fields: certificationFields,
    },
  ];
};
const employeeCodeText = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) =>
  compact(employee.employeeCode || employee.employeeId || employee.sourceEmployeeId).toUpperCase().replace(/[^A-Z0-9]/g, '');
const employeeGroupText = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) =>
  [employee.payrollGroup, employee.staffCategory, employee.employeeCategory, employee.employmentType, employee.jobTitle, employee.designation]
    .map(compact)
    .join(' ')
    .toUpperCase();
const essNonPermanentPayrollEmployee = isNonPermanentPayrollEmployee;
const essEmployeeCategory = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) => {
  const code = employeeCodeText(employee);
  const text = employeeGroupText(employee);
  if (/^C\d+/.test(code) || /\b(DAILY RATE|DAY RATE)\b/.test(text)) return 'Contract - Daily Rate';
  if (/^L\d+/.test(code) || /\b(LUMPSUM|LUMP SUM)\b/.test(text)) return 'Contract - Lump Sum';
  if (/^NYSC\d+/.test(code) || /\b(NYSC|NATIONAL YOUTH SERVICE)\b/.test(text)) return 'NYSC';
  if (/^IT\d+/.test(code) || /\b(INDUSTRIAL TRAINING|INDUSTRIAL TRAINEE|INTERN)\b/.test(text)) return 'Industrial Training';
  return compact(employee.employeeCategory || employee.staffCategory || employee.employmentType || employee.payrollGroup) || 'Permanent';
};
const employeeAddress = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) => {
  const street = compact(employee.residentialAddress) || compact(employee.permanentAddress);
  const parts = [street, employee.city, employee.state, employee.country].map(compact).filter(Boolean);
  return parts.join(', ') || 'Not configured';
};
const mapSageEarningLines = (snapshot: SageEmployeePayslipSnapshot) =>
  snapshot.earningLines.map((line) => ({
    code: compact(line.code),
    label: compact(line.name || line.code),
    units: Number(line.amount || 0) > 0 ? 1 : 0,
    amount: roundMoney(Number(line.amount || 0)),
    taxable: line.taxableAmount === null || line.taxableAmount === undefined ? Number(line.amount || 0) > 0 : Number(line.taxableAmount || 0) > 0,
  })).filter((line) => line.code && Math.abs(line.amount) > 0.004);

const mapSageDeductionLines = (snapshot: SageEmployeePayslipSnapshot) =>
  snapshot.deductionLines.map((line) => ({
    code: compact(line.code),
    label: compact(line.name || line.code),
    units: Number(line.amount || 0) > 0 ? 1 : 0,
    amount: roundMoney(Number(line.amount || 0)),
  })).filter((line) => Math.abs(line.amount) > 0.004);

const mapSageEmployerContributionLines = (snapshot: SageEmployeePayslipSnapshot) =>
  snapshot.contributionLines.map((line) => ({
    code: compact(line.code),
    label: compact(line.name || line.code),
    units: Number(line.amount || 0) > 0 ? 1 : 0,
    amount: roundMoney(Number(line.amount || 0)),
  })).filter((line) => Math.abs(line.amount) > 0.004);
const mapEnterpriseEarningLines = (record: PayrollCalculationRecord) =>
  (record.earningLines || [])
    .map((line) => ({
      code: compact(line.code),
      label: compact(line.name || line.label || line.code),
      units: Number(line.amount || 0) > 0 ? 1 : 0,
      amount: roundMoney(Number(line.amount || 0)),
      taxable: Boolean(line.taxable),
    }))
    .filter((line) => line.code && Math.abs(line.amount) > 0.004);
const mapEnterpriseDeductionLines = (record: PayrollCalculationRecord) =>
  (record.deductionLines || [])
    .map((line) => ({
      code: compact(line.code),
      label: compact(line.label || line.code),
      units: Number(line.amount || 0) > 0 ? 1 : 0,
      amount: roundMoney(Number(line.amount || 0)),
    }))
    .filter((line) => Math.abs(line.amount) > 0.004);
const mapEnterpriseEmployerContributionLines = (record: PayrollCalculationRecord) => [
  { code: 'PENSION_ER', label: 'Pension Employer Contribution', units: record.pensionEmployer > 0 ? 1 : 0, amount: roundMoney(record.pensionEmployer) },
  { code: 'NSITF', label: 'NSITF', units: record.grossPay > 0 ? 1 : 0, amount: roundMoney(record.grossPay * 0.01) },
  { code: 'ITF', label: 'ITF', units: record.grossPay > 0 ? 1 : 0, amount: roundMoney(record.grossPay * 0.01) },
].filter((line) => Math.abs(line.amount) > 0.004);

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const REQUESTS_PATH = path.join(resolveDashboardRoot(), 'data', 'hris', 'ess-requests.json');

const readRequests = async (): Promise<EssRequest[]> => {
  try {
    const parsed = JSON.parse(await readFile(REQUESTS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeRequests = async (requests: EssRequest[]) => {
  await mkdir(path.dirname(REQUESTS_PATH), { recursive: true });
  await writeFile(REQUESTS_PATH, JSON.stringify(requests, null, 2), 'utf8');
};

const workflowDeadlineDays = 5;
const workingDaysSince = (iso: string) => {
  const from = new Date(iso);
  const to = new Date();
  if (Number.isNaN(from.getTime()) || to <= from) return 0;
  let days = 0;
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1)); d <= to; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
};

const expireStaleLeaveRequests = async (requests: EssRequest[]) => {
  let changed = false;
  const now = new Date().toISOString();
  const next = requests.map((item) => {
    if (item.category !== 'Leave' || !['Line Manager Review', 'HR Review', 'Submitted'].includes(item.status)) return item;
    if (workingDaysSince(item.updatedAt || item.submittedAt) <= workflowDeadlineDays) return item;
    changed = true;
    return {
      ...item,
      status: 'Terminated' as EssRequest['status'],
      updatedAt: now,
      comments: [
        ...(item.comments || []),
        {
          at: now,
          actor: 'Leave Workflow Engine',
          comment: `Leave request automatically terminated because it was not approved within ${workflowDeadlineDays} working days. Pending leave balance has been released.`,
        },
      ],
      workflow: (item.workflow || []).map((step) =>
        ['Pending', 'Current'].includes(step.status) ? { ...step, status: 'Terminated', actedAt: now, comment: `Auto-terminated after ${workflowDeadlineDays} working days.` } : step
      ),
    };
  });
  if (changed) await writeRequests(next);
  return next;
};

const managerOwnerFor = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) =>
  compact(employee.managerName) || compact((employee as Record<string, unknown>).supervisor) || 'Line Manager / Lead / Supervisor';

const leaveWorkflowFor = (
  employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number],
  relieverName: string,
  status: EssRequest['status'],
  now: string
) => [
  { stage: 'Employee Request', owner: employee.fullName, status: 'Completed', actedAt: now, comment: 'Submitted from Employee Self-Service.' },
  { stage: 'Line Manager / Lead / Supervisor', owner: managerOwnerFor(employee), status: status === 'Line Manager Review' ? 'Current' : status === 'HR Review' || status === 'Approved' ? 'Completed' : 'Pending', actedAt: status === 'Line Manager Review' ? null : now, comment: 'Approval validity: 5 working days.' },
  { stage: 'HR Manager / Head', owner: 'HR Manager / Head', status: status === 'HR Review' ? 'Current' : status === 'Approved' ? 'Completed' : 'Pending', actedAt: status === 'Approved' ? now : null, comment: 'Final HR approval and leave balance confirmation.' },
  { stage: 'Requester Notification', owner: employee.fullName, status: status === 'Approved' ? 'Delivered' : 'Pending', actedAt: status === 'Approved' ? now : null, comment: 'Requester notified after final approval.' },
  { stage: 'Reliever Notification', owner: relieverName || 'Selected reliever', status: status === 'Approved' ? 'Delivered' : 'Pending', actedAt: status === 'Approved' ? now : null, comment: 'Reliever notified after final approval.' },
];

const notifyLeaveWorkflow = async (
  session: SessionPayload,
  input: { title: string; body: string; severity?: 'info' | 'success' | 'warning' | 'critical'; recipientEmployeeCode?: string; recipientRoles?: string[]; requestId: string }
) =>
  createEnterpriseNotification(session, {
    kind: 'Approval',
    module: 'Leave Management',
    title: input.title,
    body: input.body,
    severity: input.severity || 'info',
    recipientEmployeeCode: input.recipientEmployeeCode,
    recipientRoles: input.recipientRoles || [],
    href: `/workforce-portal?tab=workflow&request=${input.requestId}`,
    channels: ['In-App', 'Email'],
    metadata: { requestId: input.requestId },
  });

const serviceCatalog = [
  { id: 'profile-update', label: 'Profile Update', area: 'Profile', workflow: ['Employee', 'HR Operations', 'HR Manager'], slaHours: 24 },
  { id: 'leave', label: 'Leave Application', area: 'Leave', workflow: ['Employee', 'Line Manager', 'HR'], slaHours: 16 },
  { id: 'attendance-regularization', label: 'Attendance Regularization', area: 'Time', workflow: ['Employee', 'Supervisor', 'Time Office'], slaHours: 12 },
  { id: 'payslip', label: 'Payslip / Payroll Query', area: 'Payroll', workflow: ['Employee', 'Payroll Officer'], slaHours: 24 },
  { id: 'claim', label: 'Claim & Reimbursement', area: 'Claims', workflow: ['Employee', 'Line Manager', 'Finance'], slaHours: 48 },
  { id: 'loan', label: 'Loan / Salary Advance', area: 'Loan', workflow: ['Employee', 'Line Manager', 'HR', 'Finance'], slaHours: 72 },
  { id: 'travel', label: 'Travel Request', area: 'Travel', workflow: ['Employee', 'Line Manager', 'Admin', 'Finance'], slaHours: 48 },
  { id: 'asset', label: 'Asset / PPE Request', area: 'Assets', workflow: ['Employee', 'Line Manager', 'Stores / IT'], slaHours: 36 },
  { id: 'letter', label: 'Employment Letter', area: 'Documents', workflow: ['Employee', 'HR Operations'], slaHours: 24 },
  { id: 'exit', label: 'Exit & Separation', area: 'Exit', workflow: ['Employee', 'Line Manager', 'HR', 'Finance', 'IT'], slaHours: 120 },
];

const normalize = (value: unknown) => compact(value).toLowerCase();
const tokenFrom = (request: Request) => request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
const getSession = (request: Request) => verifySessionToken(tokenFrom(request) ? decodeURIComponent(tokenFrom(request) || '') : '');
const employeeKeys = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) =>
  buildEssEmployeeLookupKeys(employee).map((key) => normalizePayrollMatchKey(key)).filter(Boolean);
const resolveEssEmployee = (employees: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'], session: SessionPayload) => {
  const identities = [session.employeeCode, session.employeeId, session.username].map((value) => normalizePayrollMatchKey(value)).filter(Boolean);
  if (!identities.length) return null;
  return employees.find((employee) => {
    const keys = employeeKeys(employee);
    return identities.some((identity) => keys.includes(identity));
  }) || null;
};
const employeeRequestMatches = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number], requestEmployeeId: string) => {
  const lookup = new Set(employeeKeys(employee));
  return lookup.has(normalizePayrollMatchKey(requestEmployeeId));
};

const mergePayrollIdentity = (
  employee: DleEmployeeDirectoryRow,
  identity?: PayslipEmployeeIdentity | null,
): DleEmployeeDirectoryRow => {
  if (!identity) return employee;
  const authoritativeGrade = identity.salaryGrade && isGenericPayrollGrade(employee.salaryGrade) ? identity.salaryGrade : employee.salaryGrade;
  return {
    ...employee,
    salaryGrade: authoritativeGrade || employee.salaryGrade,
    jobGrade: employee.jobGrade || authoritativeGrade || employee.jobGrade,
    payrollGroup: employee.payrollGroup || identity.payrollGroup || employee.payrollGroup,
    paymentRun: employee.paymentRun || identity.paymentRun || employee.paymentRun,
    paymentType: employee.paymentType || identity.paymentType || employee.paymentType,
    bankName: employee.bankName || identity.bankName || employee.bankName,
    accountNo: employee.accountNo || identity.accountNo || employee.accountNo,
    accountName: employee.accountName || identity.accountName || employee.accountName,
    pensionProvider: employee.pensionProvider || identity.pensionProvider || employee.pensionProvider,
    pensionPin: employee.pensionPin || identity.pensionPin || employee.pensionPin,
    taxIdentificationNumber: employee.taxIdentificationNumber || identity.taxIdentificationNumber || employee.taxIdentificationNumber,
  };
};

const sageMigrationPayslipAcceptable = (
  snapshot: SageEmployeePayslipSnapshot | null | undefined,
  nonPermanentPayroll: boolean,
) => Boolean(
  snapshot
  && snapshot.grossPay > 0
  && sagePayslipAcceptableForEmployee(snapshot.earningLines || [], nonPermanentPayroll),
);

const sagePayslipSnapshotUsable = sageMigrationPayslipAcceptable;

const moduleCatalog = [
  'Dashboard',
  'Profile Management',
  'Leave Management',
  'Attendance & Time',
  'Payroll Self-Service',
  'Document Management',
  'Performance',
  'Learning',
  'Claims',
  'Loan Management',
  'Requests & Services',
  'Travel',
  'Assets',
  'Directory',
  'Communication',
  'Workflow Tracking',
  'Exit Services',
];

const sampleDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const dateAdd = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) return err(401, 'Unauthenticated.');
    if (session.isGlobalAdmin) return err(403, 'Global administrator is not linked to an employee self-service profile.');
    const locale = compact(request.headers.get('x-ess-locale')) || 'en-NG';
    const cacheKey = `${session.sub}:${session.employeeCode || session.employeeId || session.username}:${locale}`;
    const cached = readEssPortalResponseCache(cacheKey);
    if (cached) return ok(cached);
    const [employeeSource, rawRequests, loanApplications, loansConfig, taxConfig, pensionConfig, identityByKey] = await Promise.all([readPayrollEmployees(), readRequests(), readPayrollLoanApplications(), readPayrollLoansConfig(), readPayrollTaxConfig(), readPayrollPensionConfig(), payslipIdentityMap()]);
    if (identityByKey.size === 0) {
      void syncPayslipIdentitiesFromSage({ migratedBy: 'Employee Self-Service background identity sync' }).catch(() => undefined);
    }
    const allRequests = await expireStaleLeaveRequests(rawRequests);
    const employee = resolveEssEmployee(employeeSource.employees, session);
    if (!employee) return err(403, 'Employee identity is not linked to the logged-in account.');
    const payslipIdentity = [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId]
      .map(normalizePayrollMatchKey)
      .map((key) => identityByKey.get(key))
      .find(Boolean);

    const employeeRequests = allRequests.filter((item) => employeeRequestMatches(employee, item.employeeId));
    const employeeLoans = loanApplications.filter((item) => employeeRequestMatches(employee, item.employeeId));
    const loansVersion = activeLoansVersion(loansConfig);
    const taxVersion = activeTaxVersion(taxConfig);
    const pensionVersion = activePensionVersion(pensionConfig);
    const employeeAny = employee as any;
    let leaveContext = { annualEntitlement: 0, leaveUsed: 0, leaveBalance: 0, carryForward: 0 };
    let enterpriseRecordsByPeriod = new Map<string, PayrollCalculationRecord>();
    let sagePayslipsByPeriod = new Map<string, SageEmployeePayslipSnapshot>();
    let releasedPayrollPeriods: string[] = [];
    const payrollForPeriod = (period: string, includeAdjustments = false, enterpriseRecord?: PayrollCalculationRecord | null, sageSnapshot?: SageEmployeePayslipSnapshot | null) => {
      const payrollEmployee = mergePayrollIdentity(employee, payslipIdentity);
      const nonPermanentPayroll = essNonPermanentPayrollEmployee(payrollEmployee);
      const payslipType = nonPermanentPayroll ? 'non-permanent' : 'permanent';
      const sharedEmployeeInfo = {
        employeeCode: payrollEmployee.employeeCode || payrollEmployee.employeeId,
        employeeName: payrollEmployee.fullName,
        employeeCategory: essEmployeeCategory(payrollEmployee),
        department: payrollEmployee.department || 'Unassigned',
        unit: payrollEmployee.businessUnit || payrollEmployee.division || 'DLE',
        designation: payrollEmployee.jobTitle || payrollEmployee.designation || 'Employee',
        gradeLevel: payrollEmployee.salaryGrade || payrollEmployee.jobGrade || payslipIdentity?.salaryGrade || 'Unassigned',
        employmentType: payrollEmployee.employmentType || 'Permanent',
        dateOfEmployment: payrollEmployee.dateJoined || payrollEmployee.contractStartDate || '',
        employeeStatus: payrollEmployee.status || 'Active',
        address: employeeAddress(payrollEmployee),
      };
      const sharedStatutoryInfo = {
        bankName: payslipIdentity?.bankName || employeeAny.bankName || 'Not configured',
        accountNumber: maskAccount(payslipIdentity?.accountNo || employeeAny.accountNo || employeeAny.accountNumber),
        pensionFundAdministrator: nonPermanentPayroll ? '' : configured(payslipIdentity?.pensionProvider || employeeAny.pensionProvider),
        pensionNumber: nonPermanentPayroll ? '' : configured(payslipIdentity?.pensionPin || employeeAny.pensionPin),
        nhfNumber: nonPermanentPayroll ? '' : employeeAny.nhfNumber || 'Not applicable',
        taxNumber: payslipIdentity?.taxIdentificationNumber || employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
        nhiaNumber: nonPermanentPayroll ? '' : employeeAny.nhiaNumber || 'Not applicable',
      };
      const sharedLeaveInfo = {
        annualLeaveEntitlement: leaveContext.annualEntitlement,
        leaveTaken: leaveContext.leaveUsed,
        leaveBalance: leaveContext.leaveBalance,
        carryForwardLeave: leaveContext.carryForward,
      };

      const buildFromSageSnapshot = (snapshot: SageEmployeePayslipSnapshot, dataSource: 'sage' | 'enterprise-db') => {
        const rawEarnings = mapSageEarningLines(snapshot);
        const earningsLines = nonPermanentPayroll ? rawEarnings : sanitizePermanentPayslipEarnings(rawEarnings);
        const linesGross = roundMoney(earningsLines.reduce((sum, line) => sum + line.amount, 0));
        const grossPay = roundMoney(nonPermanentPayroll ? snapshot.grossPay : (linesGross > 0 ? linesGross : snapshot.grossPay));
        const deductionLines = mapSageDeductionLines(snapshot);
        const employerContributionLines = mapSageEmployerContributionLines(snapshot);
        const totalEmployerContributions = roundMoney(snapshot.employerContributions);
        return {
          period,
          periodLabel: periodTitle(period),
          payPeriodStart: periodStartDate(period),
          payPeriodEnd: monthEndDate(period),
          payDate: monthEndDate(period),
          payrollNumber: `DLE-${period.replace('-', '')}-${employee.employeeId}`,
          payeReference: payslipIdentity?.taxIdentificationNumber || employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
          grossPay,
          allowances: roundMoney(Math.max(0, grossPay - snapshot.taxablePay)),
          pensionEmployee: roundMoney(snapshot.pensionEmployee),
          deductions: roundMoney(snapshot.totalDeductions),
          netPay: roundMoney(snapshot.netPay),
          status: 'Released',
          dataSource,
          payslipType,
          earnings: earningsLines,
          deductionLines,
          employerContributionLines,
          totalEmployerContributions,
          employeeInfo: sharedEmployeeInfo,
          statutoryInfo: sharedStatutoryInfo,
          leaveInfo: sharedLeaveInfo,
          ytd: {
            grossEarnings: roundMoney(snapshot.ytdGrossEarnings),
            taxPaid: roundMoney(snapshot.ytdTaxPaid),
            pensionContribution: roundMoney(snapshot.ytdPensionContribution),
            deductions: roundMoney(snapshot.ytdDeductions),
            netEarnings: roundMoney(snapshot.ytdNetEarnings),
          },
          verification: {
            qrCode: `DLE|${employee.employeeId}|${period}|${roundMoney(snapshot.netPay)}`,
            generatedAt: new Date().toISOString(),
            approvalStatus: 'Payroll Released',
          },
        };
      };

      const storedEnterpriseSnapshot = buildStoredEnterprisePayslipSnapshot(payrollEmployee, period, {
        permanentEmployee: !nonPermanentPayroll,
      });
      const migrationPeriod = !isEnterprisePayrollPeriod(period);

      if (migrationPeriod) {
        if (sagePayslipSnapshotUsable(sageSnapshot, nonPermanentPayroll)) {
          return buildFromSageSnapshot(sageSnapshot!, 'sage');
        }
        if (sagePayslipSnapshotUsable(storedEnterpriseSnapshot, nonPermanentPayroll)) {
          return buildFromSageSnapshot(storedEnterpriseSnapshot!, 'enterprise-db');
        }
      }

      if (!migrationPeriod && enterpriseRecord && enterpriseRecord.grossPay > 0) {
        const earningsLines = mapEnterpriseEarningLines(enterpriseRecord);
        const enterpriseEarningsOk = nonPermanentPayroll || permanentStyleSageEarnings(earningsLines);
        if (enterpriseEarningsOk) {
        const linesGross = roundMoney(earningsLines.reduce((sum, line) => sum + line.amount, 0));
        const grossPay = roundMoney(Math.max(enterpriseRecord.grossPay, linesGross));
        const deductionLines = mapEnterpriseDeductionLines(enterpriseRecord);
        const employerContributionLines = mapEnterpriseEmployerContributionLines(enterpriseRecord);
        const totalEmployerContributions = roundMoney(employerContributionLines.reduce((sum, line) => sum + line.amount, 0));
        const ytd = computeEnterpriseYtdTotals(period, releasedPayrollPeriods, enterpriseRecordsByPeriod);
        return {
          period,
          periodLabel: periodTitle(period),
          payPeriodStart: periodStartDate(period),
          payPeriodEnd: monthEndDate(period),
          payDate: monthEndDate(period),
          payrollNumber: `DLE-${period.replace('-', '')}-${employee.employeeId}`,
          payeReference: payslipIdentity?.taxIdentificationNumber || employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
          grossPay,
          allowances: roundMoney(Math.max(0, grossPay - (enterpriseRecord.basePay || enterpriseRecord.taxablePay || 0))),
          pensionEmployee: roundMoney(enterpriseRecord.pensionEmployee),
          deductions: roundMoney(enterpriseRecord.totalDeductions),
          netPay: roundMoney(enterpriseRecord.netPay),
          status: 'Released',
          dataSource: 'enterprise',
          payslipType,
          earnings: earningsLines,
          deductionLines,
          employerContributionLines,
          totalEmployerContributions,
          employeeInfo: sharedEmployeeInfo,
          statutoryInfo: sharedStatutoryInfo,
          leaveInfo: sharedLeaveInfo,
          ytd,
          verification: {
            qrCode: `DLE|${employee.employeeId}|${period}|${roundMoney(enterpriseRecord.netPay)}`,
            generatedAt: new Date().toISOString(),
            approvalStatus: 'Payroll Released',
          },
        };
        }
      }

      if (!migrationPeriod && sagePayslipSnapshotUsable(sageSnapshot, nonPermanentPayroll)) {
        return buildFromSageSnapshot(sageSnapshot!, 'sage');
      }
      if (!migrationPeriod && sagePayslipSnapshotUsable(storedEnterpriseSnapshot, nonPermanentPayroll)) {
        return buildFromSageSnapshot(storedEnterpriseSnapshot!, 'enterprise-db');
      }

      const storedPeriodMatches = payrollEmployee.sagePayslipPeriod === period;
      const sageEarnings = payrollEmployee.sagePayrollEarnings || [];
      const useSagePayslipLines = storedPeriodMatches && sageEarnings.length > 0
        && (nonPermanentPayroll || permanentStyleSageEarnings(sageEarnings));
      const earnings = calculatePayrollEarnings(payrollEmployee, {
        period,
        includePeriodAdjustments: includeAdjustments,
        useSagePayslipLines,
      });
      const tax = taxVersion
        ? calculatePayrollTax(payrollInputFromEmployee(payrollEmployee, { period, includePeriodAdjustments: includeAdjustments }, earnings), taxVersion)
        : null;
      const pension = !nonPermanentPayroll && pensionVersion ? calculatePension(pensionInputFromEmployee(payrollEmployee, { period, includePeriodAdjustments: includeAdjustments }), pensionVersion) : null;
      const unionRule = calculatePermanentUnionDues(payrollEmployee);
      const otherStatutory = roundMoney((tax?.statutoryItems.find((item) => item.id === 'other-statutory')?.amount || 0) / 12);
      const sageDeductionLines = storedPeriodMatches ? (payrollEmployee.sagePayrollDeductions?.lines || []) : [];
      const periodSageDeductionLines = sageSnapshot?.deductionLines || [];
      const periodSageContributionLines = sageSnapshot?.contributionLines || [];
      const sagePaye = roundMoney(Number(
        sageSnapshot?.paye
        || payrollEmployee.sagePayrollDeductions?.paye
        || 0,
      ));
      const sagePensionEmployee = roundMoney(Number(
        sageSnapshot?.pensionEmployee
        || payrollEmployee.sagePayrollDeductions?.pensionEmployee
        || 0,
      ));
      const sageNhf = roundMoney(Number(
        sageSnapshot?.nhf
        || payrollEmployee.sagePayrollDeductions?.nhf
        || 0,
      ));
      const sageOtherDeductions = roundMoney(Number(payrollEmployee.sagePayrollDeductions?.other || 0));
      const sageTotalDeductions = roundMoney(Number(
        sageSnapshot?.totalDeductions
        || payrollEmployee.sagePayrollDeductions?.totalDeductions
        || 0,
      ));
      const sagePeriodSnapshotOk = Boolean(sageSnapshot && sageMigrationPayslipAcceptable(sageSnapshot, nonPermanentPayroll));
      const usePeriodSageDeductions = migrationPeriod && sagePeriodSnapshotOk && periodSageDeductionLines.length > 0;
      const useStoredSageDeductions = !usePeriodSageDeductions
        && storedPeriodMatches
        && sageDeductionLines.length > 0
        && (nonPermanentPayroll || permanentStyleSageEarnings(sageEarnings));
      const paye = (usePeriodSageDeductions || useStoredSageDeductions) && sagePaye > 0
        ? sagePaye
        : roundMoney(tax?.monthlyPaye ?? 0);
      const pensionEmployee = (usePeriodSageDeductions || useStoredSageDeductions) && sagePensionEmployee > 0
        ? sagePensionEmployee
        : roundMoney(pension?.employeeContribution ?? 0);
      const nhf = (usePeriodSageDeductions || useStoredSageDeductions) && sageNhf > 0
        ? sageNhf
        : roundMoney((tax?.statutoryItems.find((item) => item.id === 'nhf')?.amount || 0) / 12);
      const unionDues = (usePeriodSageDeductions || useStoredSageDeductions) ? 0 : roundMoney((tax?.statutoryItems.find((item) => item.id === 'union-dues')?.amount || 0) / 12);
      const otherStatutoryDeduction = useStoredSageDeductions ? sageOtherDeductions : otherStatutory;
      const deductions = (usePeriodSageDeductions || useStoredSageDeductions) && sageTotalDeductions > 0
        ? sageTotalDeductions
        : roundMoney(paye + pensionEmployee + nhf + unionDues + otherStatutoryDeduction);
      const employerPension = roundMoney(
        periodSageContributionLines.find((line) => /PENSION/i.test(String(line.code || '')))?.amount
        || sageSnapshot?.pensionEmployer
        || pension?.employerContribution
        || 0,
      );
      const nsitf = roundMoney(
        periodSageContributionLines.find((line) => /NSITF/i.test(String(line.code || '')))?.amount
        || earnings.grossPay * 0.01,
      );
      const itf = roundMoney(
        periodSageContributionLines.find((line) => /ITF/i.test(String(line.code || '')))?.amount
        || earnings.grossPay * 0.01,
      );
      const storedContributionLines = (usePeriodSageDeductions ? periodSageContributionLines : (payrollEmployee.sagePayrollContributions?.lines || []))
        .map((line) => ({
          code: compact(line.code),
          label: compact(line.name || line.code),
          units: Number(line.amount || 0) > 0 ? 1 : 0,
          amount: roundMoney(Number(line.amount || 0)),
        }))
        .filter((line) => Math.abs(line.amount) > 0.004);
      const employerContributionLines = storedContributionLines.length
        ? storedContributionLines
        : [
          { code: 'PENSION_EMPLOYER', label: 'Pension Employer Contribution', units: employerPension > 0 ? 1 : 0, amount: employerPension },
          { code: 'NSITF', label: 'NSITF - Nigeria Social Insurance Trust Fund', units: nsitf > 0 ? 1 : 0, amount: nsitf },
          { code: 'ITF', label: 'ITF Levy', units: itf > 0 ? 1 : 0, amount: itf },
        ].filter((line) => Math.abs(Number(line.amount || 0)) > 0.004);
      const totalEmployerContributions = roundMoney(employerContributionLines.reduce((sum, line) => sum + line.amount, 0));
      const monthNumber = Number(period.slice(5, 7)) || 1;
      return {
        period,
        periodLabel: periodTitle(period),
        payPeriodStart: periodStartDate(period),
        payPeriodEnd: monthEndDate(period),
        payDate: monthEndDate(period),
        payrollNumber: `DLE-${period.replace('-', '')}-${employee.employeeId}`,
        payeReference: payslipIdentity?.taxIdentificationNumber || employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
        grossPay: nonPermanentPayroll
          ? earnings.grossPay
          : roundMoney((sanitizePermanentPayslipEarnings(earnings.paidEarningLines)).reduce((sum, line) => sum + line.amount, 0) || earnings.grossPay),
        allowances: earnings.allowances,
        pensionEmployee,
        deductions,
        netPay: roundMoney(
          usePeriodSageDeductions && Number(sageSnapshot?.netPay || 0) > 0
            ? Number(sageSnapshot?.netPay || 0)
            : useStoredSageDeductions && sageTotalDeductions > 0 && Number(payrollEmployee.sagePayrollDeductions?.netPay || 0) > 0
              ? Number(payrollEmployee.sagePayrollDeductions?.netPay || 0)
              : Math.max(0, earnings.grossPay - deductions),
        ),
        status: 'Released',
        dataSource: usePeriodSageDeductions ? 'sage' : 'calculated',
        payslipType,
        earnings: (nonPermanentPayroll
          ? earnings.paidEarningLines
          : sanitizePermanentPayslipEarnings(earnings.paidEarningLines)
        ).map((line) => ({ code: line.code, label: line.name, units: line.amount > 0 ? 1 : 0, amount: line.amount, taxable: line.taxable })),
        deductionLines: usePeriodSageDeductions && sageSnapshot
          ? mapSageDeductionLines(sageSnapshot)
          : useStoredSageDeductions
          ? sageDeductionLines.map((line) => ({
              code: compact(line.code),
              label: compact(line.name || line.code),
              units: Number(line.amount || 0) > 0 ? 1 : 0,
              amount: roundMoney(Number(line.amount || 0)),
            })).filter((line) => Math.abs(line.amount) > 0.004)
          : [
          { code: 'PAYE', label: 'PAYE Tax', units: paye > 0 ? 1 : 0, amount: paye },
          { code: 'PENSION_EMPLOYEE', label: 'Pension Employee Contribution', units: pensionEmployee > 0 ? 1 : 0, amount: pensionEmployee },
          { code: 'NHF', label: 'NHF', units: nhf > 0 ? 1 : 0, amount: nhf },
          { code: unionRule.code, label: unionRule.name, units: unionDues > 0 ? 1 : 0, amount: unionDues },
          { code: 'OTHER_DEDUCTIONS', label: 'Other Deductions', units: otherStatutoryDeduction > 0 ? 1 : 0, amount: otherStatutoryDeduction },
        ].filter((line) => line.amount > 0),
        employerContributionLines,
        totalEmployerContributions,
        employeeInfo: sharedEmployeeInfo,
        statutoryInfo: sharedStatutoryInfo,
        leaveInfo: sharedLeaveInfo,
        ytd: usePeriodSageDeductions && sageSnapshot
          ? {
            grossEarnings: roundMoney(sageSnapshot.ytdGrossEarnings),
            taxPaid: roundMoney(sageSnapshot.ytdTaxPaid),
            pensionContribution: roundMoney(sageSnapshot.ytdPensionContribution),
            deductions: roundMoney(sageSnapshot.ytdDeductions),
            netEarnings: roundMoney(sageSnapshot.ytdNetEarnings),
          }
          : {
          grossEarnings: roundMoney(earnings.grossPay * monthNumber),
          taxPaid: roundMoney(paye * monthNumber),
          pensionContribution: roundMoney(pensionEmployee * monthNumber),
          deductions: roundMoney(deductions * monthNumber),
          netEarnings: roundMoney(Math.max(0, earnings.grossPay - deductions) * monthNumber),
        },
        verification: {
          qrCode: `DLE|${employee.employeeId}|${period}|${roundMoney(Math.max(0, earnings.grossPay - deductions))}`,
          generatedAt: new Date().toISOString(),
          approvalStatus: 'Payroll Released',
        },
      };
    };
    const requests = employeeRequests;
    const leaveYear = new Date().getFullYear();
    const annualEntitlementEstimate = annualLeaveEntitlementForEmployee(employee);
    leaveContext = { annualEntitlement: annualEntitlementEstimate, leaveUsed: 0, leaveBalance: annualEntitlementEstimate, carryForward: 0 };
    releasedPayrollPeriods = await listEssReleasedPayrollPeriods();
    await Promise.all(
      releasedPayrollPeriods
        .filter((period) => !isEnterprisePayrollPeriod(period))
        .map((period) => ensureSagePeriodEarningAdjustments(period).catch(() => undefined)),
    );
    const essDisplayPeriod = latestEssReleasedPayrollPeriod(releasedPayrollPeriods);
    const payrollEmployeeForLookup = mergePayrollIdentity(employee, payslipIdentity);
    const employeeMatchKeys = [
      ...buildEssEmployeeLookupKeys(employee, payslipIdentity),
      employee.sourceEmployeeId,
      payslipIdentity?.employeeCode,
      payslipIdentity?.sourceEmployeeCode,
    ].filter(Boolean);
    [enterpriseRecordsByPeriod, sagePayslipsByPeriod] = await Promise.all([
      readEnterpriseEmployeePayslipRecordsByPeriod(employeeMatchKeys, releasedPayrollPeriods).catch(() => new Map()),
      readAuthoritativeSagePayslipSnapshotsByPeriod(employeeMatchKeys, releasedPayrollPeriods, {
        nonPermanentPayroll: isNonPermanentPayrollEmployee(payrollEmployeeForLookup),
      }).catch(() => new Map()),
    ]);
    const payrollHistory = releasedPayrollPeriods.map((period) => payrollForPeriod(
      period,
      true,
      enterpriseRecordsByPeriod.get(period),
      sagePayslipsByPeriod.get(period),
    ));
    const latestReleasedPayroll = payrollHistory[0] || null;
    const currentPeriodReleased = Boolean(essDisplayPeriod);
    const essContext = await buildEssDashboardContext({
      employee,
      employees: employeeSource.employees,
      session,
      requests: employeeRequests,
      netPay: latestReleasedPayroll?.netPay || 0,
      documentCountFallback: Number(employee.documentCount || 0),
      payslipIdentity: payslipIdentity || undefined,
    });
    const attendanceRate = essContext.attendance.monthRate;
    const annualEntitlement = essContext.leave.entitlement;
    const leaveUsed = essContext.leave.used;
    const pendingAnnualLeave = essContext.leave.pending;
    const annualBalance = essContext.leave.balance;
    const carryForward = essContext.leave.carryForward;
    leaveContext = { annualEntitlement, leaveUsed, leaveBalance: annualBalance, carryForward };
    const employeeLeaveApplications = essContext.leave.applications.map((item) => ({
      id: item.id,
      employeeId: item.employeeId,
      fullName: item.fullName,
      department: item.department,
      managerName: item.managerName,
      leaveType: item.leaveType,
      startDate: item.startDate,
      endDate: item.endDate,
      days: item.days,
      status: item.status,
      stage: item.stage,
      actingOfficer: item.actingOfficer,
      supportingDocuments: item.supportingDocuments,
      exceptions: item.exceptions,
      approvalStatus: item.approvalStatus,
    }));
    const leavePolicyCards = essContext.leave.policyCards;
    const confirmedPermanent = String(employee.status || '').toLowerCase().includes('confirmed') || (employee.confirmationDueDate ? new Date(`${employee.confirmationDueDate}T00:00:00.000Z`).getTime() <= Date.now() : false);
    const fourteenDayPaidLeaveEmployee = isFourteenDayPaidLeaveEmployee(employee);
    const currentYearAllowanceAlreadyPaid = await hasLeaveAllowanceInYear(employee, leaveYear);
    const allowanceEligible = annualBalance >= 10 && !currentYearAllowanceAlreadyPaid;
    const activeLeaveApplication = employeeLeaveApplications.find((item) => ['Submitted', 'Under Review', 'Approved'].includes(item.status));
    const currentLeaveNow = employeeLeaveApplications.find((item) => ['Approved', 'Completed'].includes(item.status) && item.startDate <= new Date().toISOString().slice(0, 10) && item.endDate >= new Date().toISOString().slice(0, 10));
    const leaveWorkflow = activeLeaveApplication
      ? [
          { stage: 'Employee Request', owner: employee.fullName, status: 'Completed', sla: 'Immediate' },
          { stage: 'Line Manager / Lead / Supervisor', owner: activeLeaveApplication.managerName || employee.managerName || 'Line Manager', status: activeLeaveApplication.stage === 'Supervisor' ? 'Current' : ['HR', 'Final Approval', 'Closed'].includes(activeLeaveApplication.stage) ? 'Completed' : 'Pending', sla: '5 working days' },
          { stage: 'HR Manager / Head', owner: 'HR Manager / Head', status: ['HR', 'Final Approval'].includes(activeLeaveApplication.stage) ? 'Current' : activeLeaveApplication.status === 'Approved' ? 'Completed' : 'Pending', sla: '5 working days' },
          { stage: 'Requester Notification', owner: employee.fullName, status: activeLeaveApplication.status === 'Approved' ? 'Delivered' : 'Pending', sla: 'After final approval' },
          { stage: 'Reliever Notification', owner: activeLeaveApplication.actingOfficer || 'Reliever', status: activeLeaveApplication.status === 'Approved' ? 'Delivered' : 'Pending', sla: 'After final approval' },
        ]
      : [
          { stage: 'Employee Request', owner: employee.fullName, status: 'Not started', sla: 'Immediate' },
          { stage: 'Line Manager / Lead / Supervisor', owner: employee.managerName || 'Line Manager', status: 'Not started', sla: '5 working days' },
          { stage: 'HR Manager / Head', owner: 'HR Manager / Head', status: 'Not started', sla: '5 working days' },
          { stage: 'Requester Notification', owner: employee.fullName, status: 'Not started', sla: 'After final approval' },
          { stage: 'Reliever Notification', owner: 'Selected reliever', status: 'Not started', sla: 'After final approval' },
        ];
    const leaveCalendar = employeeLeaveApplications
      .filter((item) => ['Submitted', 'Under Review', 'Approved', 'Completed'].includes(item.status))
      .map((item) => ({ id: item.id, label: `${item.leaveType} - ${item.fullName}`, from: item.startDate, to: item.endDate, status: item.status, type: item.leaveType, scope: item.department }));
    const leaveHistory = employeeLeaveApplications.map((item) => ({
      id: item.id,
      type: item.leaveType,
      from: item.startDate,
      to: item.endDate,
      days: item.days,
      year: Number(item.startDate.slice(0, 4)),
      status: item.status,
      approvalStage: item.stage,
      approvers: item.managerName ? `${item.managerName}, HR Manager / Head` : 'Line Manager / Supervisor, HR Manager / Head',
      reliever: item.actingOfficer || 'Not configured',
      payrollImpact: item.leaveType === 'Unpaid Leave' ? 'Payroll deduction review' : 'None',
      allowanceStatus: item.leaveType === 'Annual Leave' && item.days >= dormantLongPolicy.allowanceMinimumAnnualDays ? 'Eligible after final approval' : 'Not eligible',
      attachments: item.supportingDocuments ? `${item.supportingDocuments} document(s)` : 'None',
      comments: item.exceptions.length ? item.exceptions.join('; ') : 'No exceptions',
      auditTrail: item.approvalStatus,
    }));
    const leaveApprovals = employeeLeaveApplications
      .filter((item) => !['Approved', 'Completed', 'Rejected', 'Cancelled', 'Terminated'].includes(item.status))
      .map((item) => ({ id: item.id, employee: item.fullName, type: item.leaveType, days: item.days, stage: item.stage, status: item.status, reliever: item.actingOfficer, handover: 'Required before commencement', conflict: item.exceptions.join('; ') || 'No conflict' }));
    const employeeDepartment = compact(employee.department).toLowerCase();
    const relieverOptions = employeeSource.employees
      .filter((item) => (item.employeeId !== employee.employeeId && (item.employeeCode || item.employeeId) !== (employee.employeeCode || employee.employeeId)))
      .filter((item) => compact(item.department).toLowerCase() === employeeDepartment)
      .filter((item) => !/inactive|terminated|resigned/i.test(compact(item.status)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, 250)
      .map((item) => ({
        employeeId: item.employeeId,
        employeeCode: item.employeeCode || item.employeeId,
        fullName: item.fullName,
        jobTitle: item.jobTitle || item.designation || 'Employee',
        department: item.department || 'Unassigned',
      }));

    const payload = {
      generatedAt: new Date().toISOString(),
      locale,
      security: {
        rbacRole: 'Employee',
        mfa: 'Enabled',
        sso: 'Microsoft Entra ID',
        session: 'Active',
        encryption: 'TLS 1.3 / AES-256 at rest',
        activityLogging: 'Enabled',
      },
      employee: {
        employeeId: employee.employeeId,
        employeeCode: employee.employeeCode || employee.employeeId,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle || employee.designation || 'Employee',
        department: employee.department,
        businessUnit: employee.businessUnit,
        location: essContext.employeeSummary.location,
        manager: essContext.employeeSummary.manager,
        email: employee.officialEmail || employee.email || employee.personalEmail || `${employee.employeeId.toLowerCase()}@dormanlongeng.com`,
        phone: employee.primaryPhone || employee.phone,
        photoUrl: linkedEmployeePhotoUrl(employee) || '',
        hasPhoto: employee?.hasPhoto === true,
        status: currentLeaveNow ? 'On Leave' : employee.status || 'Active',
        yearsOfService: essContext.employeeSummary.yearsOfService,
        payrollGroup: essContext.employeeSummary.payrollGroup,
        salaryGrade: essContext.employeeSummary.salaryGrade,
        dateJoined: employee.dateJoined || employee.contractStartDate || '',
        confirmationDate: employee.confirmationDueDate || '',
        emergencyContactsComplete: employee.emergencyContactsComplete === true,
        documentCount: Number(employee.documentCount || 0),
      },
      widgets: {
        leave: { entitlement: annualEntitlement, used: leaveUsed, balance: annualBalance, pending: requests.filter((item) => item.category === 'Leave' && !['Approved', 'Rejected', 'Terminated', 'Closed'].includes(item.status)).length },
        attendance: { monthRate: attendanceRate, lateArrivals: essContext.attendance.lateArrivals, overtimeHours: essContext.attendance.overtimeHours, remoteDays: essContext.attendance.remoteDays },
        payroll: {
          monthlyPay: latestReleasedPayroll?.netPay || latestReleasedPayroll?.grossPay || 0,
          currency: employee.payCurrency || 'NGN',
          payslips: payrollHistory.length,
          deductions: latestReleasedPayroll?.deductions || 0,
          pension: latestReleasedPayroll?.pensionEmployee || latestReleasedPayroll?.deductionLines?.find((line) => line.code === 'PENSION_EMPLOYEE')?.amount || 0,
          allowances: latestReleasedPayroll?.allowances || 0,
        },
        requests: { pending: requests.filter((item) => !['Approved', 'Rejected', 'Closed'].includes(item.status)).length, approved: requests.filter((item) => item.status === 'Approved').length, total: requests.length },
        loans: { applications: employeeLoans.length, outstanding: employeeLoans.reduce((sum, item) => sum + Number(item.outstandingBalance || 0), 0) },
      },
      dashboardAnalytics: essContext.dashboardAnalytics,
      announcements: [
        ...(currentPeriodReleased && essDisplayPeriod ? [{ id: 'ann-001', title: `${periodTitle(essDisplayPeriod)} payslip is now available`, channel: 'Payroll', publishedAt: dateAdd(-1), priority: 'High' }] : []),
      ],
      notifications: [
        ...essContext.notifications,
        ...(latestReleasedPayroll && !essContext.notifications.some((item) => /payslip/i.test(item.title))
          ? [{ id: 'ntf-payslip', title: `${latestReleasedPayroll.periodLabel || periodTitle(latestReleasedPayroll.period)} payslip is ready for download`, type: 'Payroll', status: 'Read', createdAt: dateAdd(-1) }]
          : []),
      ],
      birthdays: essContext.birthdays,
      anniversaries: essContext.anniversaries,
      events: essContext.events,
      documents: essContext.documents.length
        ? essContext.documents
        : [
            ...(Number(employee.documentCount || 0) > 0
              ? [{ id: 'doc-summary', title: `${employee.documentCount} employee document(s) on file`, category: 'HRIS Documents', version: '—', status: 'Current' }]
              : []),
          ],
      profileSections: buildEssProfileSections(
        employee,
        essContext.documents.length
          ? essContext.documents
          : Number(employee.documentCount || 0) > 0
            ? [{ title: `${employee.documentCount} employee document(s) on file`, category: 'HRIS Documents', version: '—', status: 'Current' }]
            : [],
      ),
      profileAuditTrail: [
        {
          id: 'audit-sync',
          at: new Date().toISOString(),
          action: 'Profile synchronized',
          detail: 'Employee profile loaded from DLE Enterprise HRIS.',
          actor: 'System',
        },
        {
          id: 'audit-open',
          at: new Date().toISOString(),
          action: 'Profile viewed',
          detail: 'Employee opened ESS profile command center.',
          actor: employee.fullName,
        },
      ],
      profilePreferences: [
        { label: 'Portal language', value: locale === 'en-NG' ? 'English (Nigeria)' : locale },
        { label: 'Email notifications', value: 'Enabled' },
        { label: 'In-app notifications', value: 'Enabled' },
        { label: 'Profile update approvals', value: 'Required for sensitive changes' },
        { label: 'Document expiry alerts', value: 'Enabled' },
      ],
      leave: {
        balances: leavePolicyCards,
        calendar: leaveCalendar,
        history: leaveHistory,
        workflows: leaveWorkflow,
        allowance: [
          { label: 'Leave Allowance Status', value: currentYearAllowanceAlreadyPaid ? `Already paid/approved for ${leaveYear}` : allowanceEligible ? `Eligible when applying for ${dormantLongPolicy.allowanceMinimumAnnualDays}+ current-year Annual Leave working days` : 'Not currently eligible', status: allowanceEligible ? 'Ready' : 'Review' },
          { label: 'Payroll Integration', value: 'Payroll is notified after eligible Annual Leave approval', status: 'Enabled' },
          { label: 'Carry Forward Rule', value: 'Carry Forward Leave does not trigger allowance', status: 'Enforced' },
        ],
        approvals: leaveApprovals,
        reports: ['Employee leave balance', 'Department leave utilization', 'Leave liability', 'Carry forward leave', 'Expired/forfeited leave', 'Leave allowance eligibility', 'Payroll-impact leave', 'Sick leave trend', 'Absenteeism', 'Employees currently on leave', 'Upcoming leave', 'Approval SLA report', 'Leave audit trail'].map((title, index) => ({ id: `ess-rpt-${index + 1}`, title, format: 'Excel / PDF / CSV', status: 'Available' })),
        notifications: ['Leave submitted', 'Approval pending', 'Leave approved', 'Leave rejected', 'Leave cancelled', 'Leave recalled', 'Carry forward balance created', 'Carry forward expiry reminder', 'Return-to-work reminder', 'Payroll leave allowance processing', 'Blackout conflict warning', 'Reliever assignment'].map((title, index) => ({ id: `leave-ntf-${index + 1}`, title, channel: 'Email, In-app, ESS', status: 'Enabled' })),
        security: [
          { role: 'Employee', access: 'Apply and view own leave only' },
          { role: 'Supervisor/Manager', access: 'Approve team leave and view team calendar' },
          { role: 'HR Officer', access: 'Final approval and leave record management' },
          { role: 'Payroll Officer', access: 'Payroll-impact leave only' },
        ],
        relieverOptions,
      },
      attendance: {
        records: essContext.attendance.records,
        shifts: employee.shift ? [{ id: 'shift-current', name: `${employee.shift} Shift`, start: '08:00', end: '17:00', location: essContext.employeeSummary.location }] : [],
        timesheets: [],
      },
      payrollHistory,
      payrollAccess: {
        currentPeriod: essDisplayPeriod || '',
        currentPeriodReleased,
        releasedPeriodCount: payrollHistory.length,
        message: currentPeriodReleased && essDisplayPeriod
          ? `Your ${periodTitle(essDisplayPeriod)} payslip is available below.`
          : 'Your payslip will appear here after payroll is approved and released by HR/Payroll.',
      },
      performance: {
        goals: [
          { id: 'goal-001', title: 'Improve project delivery turnaround', progress: 72, dueDate: sampleDate(45), status: 'On Track' },
          { id: 'goal-002', title: 'Complete statutory compliance training', progress: 90, dueDate: sampleDate(20), status: 'On Track' },
        ],
        kpis: [
          { label: 'Quality score', value: 94, target: 90 },
          { label: 'Attendance reliability', value: attendanceRate, target: 95 },
          { label: 'Task completion', value: 88, target: 85 },
        ],
        reviews: [
          { id: 'rev-001', cycle: '2026 Mid-Year', form: 'Employee appraisal form', status: 'Self-assessment open', score: null },
          { id: 'rev-002', cycle: '2025 Year-End', form: 'Performance review', status: 'Closed', score: 4.2 },
        ],
        developmentPlans: [
          { id: 'dev-001', title: 'Supervisory readiness plan', owner: 'Line Manager', status: 'In Progress' },
        ],
      },
      learning: {
        courses: [
          { id: 'lrn-001', title: 'HSE Refresher', date: sampleDate(12), status: 'Enrolled', type: 'Mandatory' },
          { id: 'lrn-002', title: 'Project Controls Fundamentals', date: sampleDate(25), status: 'Open for registration', type: 'Course' },
        ],
        materials: [
          { id: 'mat-001', title: 'Employee Handbook Quiz', type: 'Assessment', status: 'Pending' },
          { id: 'mat-002', title: 'Welding Safety Guide', type: 'Learning Material', status: 'Available' },
        ],
        certifications: [
          { id: 'cert-001', title: 'HSE Level 1', expiresAt: sampleDate(180), status: 'Valid' },
          { id: 'cert-002', title: 'First Aid Awareness', expiresAt: sampleDate(60), status: 'Renewal Due' },
        ],
      },
      claims: [
        { id: 'clm-001', type: 'Travel Claim', amount: 185000, status: 'Finance Review', submittedAt: dateAdd(-5), attachmentStatus: 'Uploaded' },
        { id: 'clm-002', type: 'Medical Reimbursement', amount: 42000, status: 'Approved', submittedAt: dateAdd(-20), attachmentStatus: 'Uploaded' },
        { id: 'clm-003', type: 'Expense Advance', amount: 100000, status: 'Line Manager Review', submittedAt: dateAdd(-2), attachmentStatus: 'Required' },
      ],
      loanManagement: {
        products: loansVersion?.products.filter((product) => product.enabled) || [],
        applications: employeeLoans,
        repaymentSchedules: employeeLoans.map((loan, index) => ({
          id: `${loan.id}-schedule`,
          productId: loan.productId,
          installment: index + 1,
          dueDate: sampleDate(30 * (index + 1)),
          amount: Math.round(Number(loan.outstandingBalance || 0) / Math.max(1, Number(loan.tenorMonths || 1))),
          balance: Number(loan.outstandingBalance || 0),
          status: loan.approvalStatus,
        })),
        history: [
          { id: 'loan-his-001', product: 'Salary Advance', principal: 150000, status: 'Closed', closedAt: sampleDate(-90) },
        ],
      },
      travel: [
        { id: 'trv-001', destination: 'Port Harcourt', purpose: 'Project site visit', advance: 250000, status: 'Approved', tripReport: 'Pending' },
        { id: 'trv-002', destination: 'Abuja', purpose: 'Client meeting', advance: 180000, status: 'Submitted', tripReport: 'Not Due' },
      ],
      assets: [
        { id: 'ast-001', tag: 'DLE-LAP-0146', name: 'Laptop', status: 'Assigned', acknowledgement: 'Acknowledged', condition: 'Good' },
        { id: 'ast-002', tag: 'DLE-PPE-4421', name: 'PPE Kit', status: 'Assigned', acknowledgement: 'Pending', condition: 'Replacement Due' },
        { id: 'ast-003', tag: 'DLE-MOB-0190', name: 'Mobile Device', status: 'Assigned', acknowledgement: 'Acknowledged', condition: 'Good' },
      ],
      exitServices: {
        resignation: { status: 'Not submitted', noticePeriodDays: 30, eligibleFinalSettlement: true },
        clearance: [
          { unit: 'Line Manager', status: 'Not Started' },
          { unit: 'IT', status: 'Not Started' },
          { unit: 'Stores / Assets', status: 'Not Started' },
          { unit: 'Finance', status: 'Not Started' },
          { unit: 'HR', status: 'Not Started' },
        ],
        exitInterview: { status: 'Not scheduled', form: 'Exit interview questionnaire' },
        finalSettlement: { status: 'Not started', payrollPeriod: 'Pending resignation' },
      },
      businessRules: [
        { id: 'rule-001', name: 'Leave balance validation', status: 'Active', configurable: true },
        { id: 'rule-002', name: 'Multi-level approval by request type', status: 'Active', configurable: true },
        { id: 'rule-003', name: 'Document version acknowledgement', status: 'Active', configurable: true },
        { id: 'rule-004', name: 'Payroll data masking by RBAC', status: 'Active', configurable: true },
      ],
      auditTrail: [
        { at: dateAdd(-1), actor: employee.employeeId, action: 'Viewed payslip history', channel: 'ESS' },
        { at: dateAdd(-2), actor: employee.employeeId, action: 'Submitted leave application', channel: 'ESS' },
        { at: dateAdd(-5), actor: 'System', action: 'Sent handbook acknowledgement notification', channel: 'Email/In-App' },
      ],
      reports: [
        { id: 'rpt-001', title: 'My Leave Statement', format: 'PDF / Excel', status: 'Ready' },
        { id: 'rpt-002', title: 'Payroll History Report', format: 'PDF / Excel', status: 'Ready' },
        { id: 'rpt-003', title: 'Training Transcript', format: 'PDF', status: 'Ready' },
        { id: 'rpt-004', title: 'Claim Status Report', format: 'Excel', status: 'Ready' },
      ],
      directory: employeeSource.employees.slice(0, 24).map((item) => ({
        employeeId: item.employeeId,
        fullName: item.fullName,
        jobTitle: item.jobTitle || item.designation || 'Employee',
        department: item.department,
        location: item.location || item.workLocation,
      })),
      moduleCatalog,
      serviceCatalog,
      requests,
      integrations: ['Payroll', 'ERP', 'Active Directory', 'Biometric Attendance', 'Document Management', 'Email', 'In-App Notifications', 'Third-Party APIs'],
      analytics: [
        { label: 'ESS adoption', value: 87, unit: '%' },
        { label: 'HR tickets deflected', value: 64, unit: '%' },
        { label: 'Workflow SLA compliance', value: 91, unit: '%' },
        { label: 'Mobile access share', value: 43, unit: '%' },
      ],
    };
    writeEssPortalResponseCache(cacheKey, payload);
    return ok(payload);
  } catch (error) {
    console.error('Workforce portal API failed', error);
    return err(500, error instanceof Error ? error.message : 'Unable to load workforce portal.');
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) return err(401, 'Unauthenticated.');
    if (session.isGlobalAdmin) return err(403, 'Global administrator is not linked to an employee self-service profile.');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = compact(body.action);

    const employeeSource = await readPayrollEmployees();
    const employee = resolveEssEmployee(employeeSource.employees, session);
    if (!employee) return err(403, 'Employee identity is not linked to the logged-in account.');

    if (action === 'approve-leave' || action === 'reject-leave') {
      const requestId = compact(body.requestId || body.id);
      if (!requestId) return err(400, 'requestId is required');
      const requests = await expireStaleLeaveRequests(await readRequests());
      const found = requests.find((item) => item.id === requestId && item.category === 'Leave');
      if (!found) return err(404, 'Leave request not found.');
      if (['Approved', 'Rejected', 'Terminated', 'Closed'].includes(found.status)) return err(409, `Leave request is already ${found.status}.`);

      const now = new Date().toISOString();
      const approved = action === 'approve-leave';
      const nextStatus: EssRequest['status'] = !approved ? 'Rejected' : found.status === 'Line Manager Review' ? 'HR Review' : 'Approved';
      const nextWorkflow = leaveWorkflowFor(employee, found.relieverName || 'Selected reliever', nextStatus, now);
      const nextRequests = requests.map((item) =>
        item.id === requestId
          ? {
              ...item,
              status: nextStatus,
              updatedAt: now,
              workflow: nextWorkflow,
              comments: [
                ...(item.comments || []),
                {
                  at: now,
                  actor: session.fullName || session.username,
                  comment: !approved
                    ? compact(body.comment) || 'Leave request rejected.'
                    : nextStatus === 'HR Review'
                      ? 'Line manager / supervisor approval completed. Routed to HR Manager / Head.'
                      : 'HR Manager / Head final approval completed. Requester and reliever notifications issued.',
                },
              ],
            }
          : item
      );
      await writeRequests(nextRequests);
      invalidateEssPortalCache();
      let responseRequest = nextRequests.find((item) => item.id === requestId);
      let allowanceResult: Awaited<ReturnType<typeof postLeaveAllowanceOnAnnualLeaveApproval>> | undefined;
      if (!approved) {
        await notifyLeaveWorkflow(session, {
          requestId,
          recipientEmployeeCode: found.employeeId,
          title: 'Leave request rejected',
          body: `${found.title} was rejected by ${session.fullName || session.username}.`,
          severity: 'warning',
        });
      } else if (nextStatus === 'HR Review') {
        await notifyLeaveWorkflow(session, {
          requestId,
          recipientRoles: ['HR Manager', 'HR Head', 'HR Officer'],
          title: 'Leave request awaiting HR approval',
          body: `${found.title} has been approved by the line manager and is awaiting HR Manager / Head approval.`,
          severity: 'warning',
        });
      } else {
        const requester = employeeSource.employees.find((item) => item.employeeId === found.employeeId || item.employeeCode === found.employeeId);
        await notifyLeaveWorkflow(session, {
          requestId,
          recipientEmployeeCode: found.employeeId,
          title: 'Leave request approved',
          body: `${found.title} has received final HR approval.`,
          severity: 'success',
        });
        if (found.relieverEmployeeId) {
          await notifyLeaveWorkflow(session, {
            requestId,
            recipientEmployeeCode: found.relieverEmployeeId,
            title: 'Leave reliever assignment confirmed',
            body: `You have been assigned as reliever for ${requester?.fullName || found.employeeId}: ${found.title}.`,
            severity: 'info',
          });
        }
        if (
          requester
          && found.leaveType === 'Annual Leave'
          && Number(found.days || 0) >= dormantLongPolicy.allowanceMinimumAnnualDays
          && found.startDate
        ) {
          const applications = await readLeaveApplicationsForReconciliation({ syncEss: true });
          allowanceResult = await postLeaveAllowanceOnAnnualLeaveApproval({
            employee: requester,
            applications,
            leaveType: found.leaveType,
            days: Number(found.days || 0),
            startDate: found.startDate,
            period: found.payrollPeriod || activePayrollPeriod(),
            requestId: found.id,
            source: 'ESS Leave Approval',
            actor: session.fullName || session.username,
          });
          if (allowanceResult.posted) {
            responseRequest = {
              ...responseRequest!,
              comments: [
                ...(responseRequest?.comments || []),
                { at: now, actor: 'Leave Allowance Automation', comment: allowanceResult.message },
              ],
            };
            const allowanceUpdated = nextRequests.map((item) => (item.id === requestId ? responseRequest! : item));
            await writeRequests(allowanceUpdated);
            invalidateEssPortalCache();
          }
        }
      }
      return ok({ request: responseRequest, leaveAllowance: allowanceResult?.posted ? allowanceResult.message : undefined });
    }

    const category = compact(body.category);
    const title = compact(body.title);
    const priority = compact(body.priority) as EssRequest['priority'];
    if (!category) return err(400, 'category is required');
    if (!title) return err(400, 'title is required');

    const catalogItem = serviceCatalog.find((item) => item.label === category || item.id === category);
    const now = new Date().toISOString();
    const leaveType = compact(body.leaveType || body.type);
    const leaveDays = Number(body.days || 0);
    const startDate = compact(body.startDate);
    const endDate = compact(body.endDate);
    const reason = compact(body.reason);
    const handover = compact(body.handover);
    const relieverEmployeeId = compact(body.relieverEmployeeId);
    const relieverNameInput = compact(body.relieverName);
    const isLeaveRequest = catalogItem?.id === 'leave' || /leave/i.test(category);
    const reliever = relieverEmployeeId
      ? employeeSource.employees.find((item) => item.employeeId === relieverEmployeeId || item.employeeCode === relieverEmployeeId)
      : null;
    if (isLeaveRequest) {
      if (!leaveType) return err(400, 'leaveType is required');
      if (!startDate || !endDate || !leaveDays) return err(400, 'startDate, endDate, and days are required');
      if (!reason) return err(400, 'reason is required');
      if (!handover) return err(400, 'handover notes are required');
      if (!reliever) return err(400, 'A department reliever must be selected.');
      if (compact(reliever.department).toLowerCase() !== compact(employee.department).toLowerCase()) return err(400, 'Reliever must be selected from the same department.');
      if ((reliever.employeeCode || reliever.employeeId) === (employee.employeeCode || employee.employeeId)) return err(400, 'Employee cannot be selected as own reliever.');
    }
    const leaveYear = Number(body.leaveYear || new Date().getFullYear());
    const allowanceAlreadyPaid = isLeaveRequest
      ? await hasLeaveAllowanceInYear(employee, leaveYear)
      : false;
    const initialStatus: EssRequest['status'] = isLeaveRequest ? 'Line Manager Review' : catalogItem?.workflow.includes('Line Manager') ? 'Line Manager Review' : 'Submitted';
    const relieverName = reliever ? reliever.fullName : relieverNameInput;
    const requestItem: EssRequest = {
      id: `ess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      employeeId: employee.employeeId,
      category: catalogItem?.area || category,
      title,
      status: initialStatus,
      priority: ['Low', 'Normal', 'High'].includes(priority) ? priority : 'Normal',
      submittedAt: now,
      updatedAt: now,
      approvers: isLeaveRequest ? [managerOwnerFor(employee), 'HR Manager / Head'] : catalogItem?.workflow.slice(1) || ['HR Operations'],
      leaveType: leaveType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      days: leaveDays || undefined,
      payrollPeriod: startDate ? startDate.slice(0, 7) : undefined,
      paidLeave: isLeaveRequest && leaveType === 'Annual Leave',
      reason: reason || undefined,
      relieverEmployeeId: reliever ? reliever.employeeId : relieverEmployeeId || undefined,
      relieverName: relieverName || undefined,
      handover: handover || undefined,
      workflow: isLeaveRequest ? leaveWorkflowFor(employee, relieverName, initialStatus, now) : undefined,
      comments: [{
        at: now,
        actor: 'Employee Self-Service',
        comment: allowanceAlreadyPaid
          ? `Request submitted from workforce portal. Leave allowance has already been paid/approved for ${leaveYear}.`
          : leaveType === 'Annual Leave' && leaveDays >= dormantLongPolicy.allowanceMinimumAnnualDays
            ? 'Request submitted from workforce portal. Leave allowance will post to payroll after approval.'
            : 'Request submitted from workforce portal.',
      }],
    };

    const requests = await readRequests();
    await writeRequests([requestItem, ...requests]);
    invalidateEssPortalCache();
    if (isLeaveRequest) {
      await notifyLeaveWorkflow(session, {
        requestId: requestItem.id,
        recipientEmployeeCode: employee.employeeCode || employee.employeeId,
        title: 'Leave request submitted',
        body: `${title} has been submitted and routed to ${managerOwnerFor(employee)}. It must be approved within ${workflowDeadlineDays} working days.`,
        severity: 'success',
      });
      await notifyLeaveWorkflow(session, {
        requestId: requestItem.id,
        recipientRoles: ['Supervisor', 'Line Manager', 'Manager'],
        title: 'Leave request awaiting line manager approval',
        body: `${employee.fullName} submitted ${title}. Approve, return, or reject within ${workflowDeadlineDays} working days.`,
        severity: 'warning',
      });
    }
    return ok({ request: requestItem });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to submit ESS request.');
  }
}
