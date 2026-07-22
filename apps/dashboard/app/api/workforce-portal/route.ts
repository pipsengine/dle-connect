import { NextResponse } from 'next/server';
import { countDirectReportsFromEmployees, readPayrollEmployees } from '@/lib/payroll-employee-source';
import { employeeReportsToManager, resolveReportingManagerDisplay } from '@/lib/reporting-manager-match';
import { explicitDepartmentSupervisorCode } from '@/lib/department-reporting-manager-sync';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import { calculatePayrollEarnings, calculatePermanentUnionDues, isGenericPayrollGrade } from '@/lib/payroll-earnings-engine';
import { isNonPermanentPayrollEmployee, permanentStyleSageEarnings, sagePayslipAcceptableForEmployee, sanitizePermanentPayslipEarnings } from '@/lib/payroll-employee-classification';
import { activeLoansVersion, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { hasLeaveAllowanceInYear } from '@/lib/payroll-leave-allowance-store';
import { annualLeaveEntitlementForEmployee, dormantLongPolicy, isFourteenDayPaidLeaveEmployee } from '@/lib/leave-management-store';
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
import {
  getEssMobileTodaySession,
  listEssMobileAttendanceRecords,
  mergeEssAttendanceRecords,
  recordEssMobileClockIn,
  recordEssMobileClockOut,
} from '@/lib/ess-mobile-clock-store';
import { buildEssWorkflowIntelligence, serviceWorkflowFor } from '@/lib/ess-workflow-intelligence';
import {
  deriveEssAssets,
  deriveEssAuditTrail,
  deriveEssClaims,
  deriveEssCommunications,
  deriveEssDocumentGovernance,
  deriveEssEmployeeReports,
  deriveEssLearning,
  deriveEssPerformance,
  deriveEssTravel,
  deriveLoanHistory,
  deriveLoanRepaymentSchedules,
  derivePortalAnalytics,
} from '@/lib/ess-portal-derived-data';
import { getEssPerformanceBundle, applyPerformanceAction, buildPerformanceActorContext } from '@/lib/performance-domain-store';
import { assertEssPerformanceAction, buildEssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { invalidateEssPortalCache, readEssPortalResponseCache, writeEssPortalResponseCache } from '@/lib/ess-portal-cache';
import { buildEssReportExport } from '@/lib/ess-reports-export';
import { isNigeriaCountry, resolveNigeriaPersonalLocation } from '@/lib/nigeria-locations';
import {
  canApproveEssProfileUpdate,
  enrichEssProfileSections,
  isProfileUpdateRequest,
  pendingProfileUpdatesForEmployee,
  submitEssProfileUpdate,
  transitionEssProfileUpdate,
} from '@/lib/ess-profile-update-service';
import {
  expireStaleLeaveRequests,
  leaveWorkflowFor,
  loadWorkflowLeaveRequests,
  managerOwnerFor,
  normalizeLeaveDate,
  notifyLeaveWorkflow as notifyLeaveWorkflowCore,
  runLeaveSubmitFollowUp,
  repairPendingLeaveManagerNotifications,
  pendingLeaveApprovalsForActor,
  readAllEssRequests,
  resolveLineManagerForEmployee,
  transitionEssLeaveRequest,
  validateEssLeaveApplication,
  adjustLeavePolicyCardsForEssPending,
  cancelEssLeaveRequest,
  workflowDeadlineDays,
  workingDaysSince,
  writeAllEssRequests,
  getLeaveRequestDeliveryTrace,
  listLeaveWorkflowDeliveryLog,
  retryLeaveManagerNotification,
  readLeaveCalendarConfig,
} from '@/lib/leave-workflow-service';
import { isLeaveEssRequest, isPendingLeaveStatus } from '@/lib/leave-request-shared';
import { resolveMailProvider, verifyMailConnection, resolveEmployeeMailbox } from '@/lib/mail-service';
import { resolveWorkflowLinkOriginFromRequest } from '@/lib/public-app-url';

type EssRequest = {
  id: string;
  employeeId: string;
  serviceId?: string;
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
  selectedDates?: string[];
  excludedHolidays?: Array<{ date: string; label: string }>;
  days?: number;
  payrollPeriod?: string;
  paidLeave?: boolean;
  reason?: string;
  relieverEmployeeId?: string;
  relieverName?: string;
  lineManagerEmployeeId?: string;
  lineManagerName?: string;
  handover?: string;
  attachmentNames?: string[];
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

type EssProfileField = {
  label: string;
  value: string;
  key?: string;
  editable?: boolean;
  inputType?: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  options?: string[];
};
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
  employees: DleEmployeeDirectoryRow[] = [],
): EssProfileSection[] => {
  const emergencyStatus = employee.emergencyContactsComplete
    ? `${employee.emergencyContactCount} contact(s) on file`
    : 'Not configured';
  const nigerianProfile = isNigeriaCountry(employee.nationality) || isNigeriaCountry(employee.country);
  const resolvedLocation = resolveNigeriaPersonalLocation({
    nationality: employee.nationality,
    country: employee.country,
    stateOfOrigin: employee.stateOfOrigin,
    localGovernmentArea: employee.localGovernmentArea,
    contactState: employee.state,
    city: employee.city,
  });
  const personalFields: EssProfileField[] = [
    { label: 'Title', value: configured(employee.title) },
    { label: 'First name', value: configured(employee.firstName) },
    { label: 'Middle name', value: configured(employee.middleName) },
    { label: 'Last name', value: configured(employee.lastName) },
    { label: 'Preferred name', value: configured(employee.preferredName) },
    { label: 'Date of birth', value: dateOnly(employee.dateOfBirth) },
    { label: 'Gender', value: configured(employee.gender) },
    { label: 'Marital status', value: configured(employee.maritalStatus) },
    { label: 'Nationality', value: configured(employee.nationality) },
  ];
  if (nigerianProfile) {
    personalFields.push(
      { label: 'Region', value: configured(resolvedLocation.region) },
      { label: 'State of origin', value: configured(resolvedLocation.stateOfOrigin) },
      { label: 'LGA', value: configured(resolvedLocation.localGovernmentArea) },
    );
  } else {
    personalFields.push(
      { label: 'State of origin', value: configured(resolvedLocation.stateOfOrigin) },
      { label: 'LGA', value: configured(resolvedLocation.localGovernmentArea) },
    );
  }
  personalFields.push(
    { label: 'Religion', value: configured(employee.religion) },
    { label: 'Languages spoken', value: configured(employee.languagesSpoken) },
  );

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

  return enrichEssProfileSections([
    {
      id: 'personal',
      label: 'Personal Information',
      status: 'View / update',
      approvalRequired: true,
      fields: personalFields,
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
        { label: 'Reporting manager', value: configured(resolveReportingManagerDisplay(employee, employees, explicitDepartmentSupervisorCode(employee.department || ''))) },
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
        ...(nigerianProfile ? [{ label: 'Region', value: configured(resolvedLocation.region) }] : []),
        { label: 'State', value: configured(resolvedLocation.contactState || employee.state) },
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
        { label: 'Emergency contact name', value: employee.emergencyContactsComplete ? '' : 'Not configured' },
        { label: 'Emergency relationship', value: employee.emergencyContactsComplete ? '' : 'Not configured' },
        { label: 'Emergency phone', value: employee.emergencyContactsComplete ? '' : 'Not configured' },
      ],
    },
    {
      id: 'next-of-kin',
      label: 'Next of Kin',
      status: employee.emergencyContactsComplete ? 'On file' : 'Not configured',
      approvalRequired: true,
      fields: [
        { label: 'Next of kin name', value: employee.emergencyContactsComplete ? '' : 'Not configured' },
        { label: 'Next of kin relationship', value: employee.emergencyContactsComplete ? '' : 'Not configured' },
        { label: 'Next of kin phone', value: employee.emergencyContactsComplete ? '' : 'Not configured' },
        { label: 'Next of kin address', value: employee.emergencyContactsComplete ? '' : 'Not configured' },
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
        { label: 'Account number', value: configured(employee.accountNo) },
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
  ]);
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

const dedupePayrollLinesByCode = <T extends { code: string; label: string; units: number; amount: number }>(lines: T[]) => {
  const merged = new Map<string, T>();
  for (const line of lines) {
    const key = compact(line.code).toUpperCase() || compact(line.label).toUpperCase();
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing || Math.abs(line.amount) > Math.abs(existing.amount)) merged.set(key, line);
  }
  return [...merged.values()];
};

const readRequests = readAllEssRequests;
const writeRequests = writeAllEssRequests;

const notifyLeaveWorkflow = async (
  session: SessionPayload,
  input: Parameters<typeof notifyLeaveWorkflowCore>[1],
) =>
  notifyLeaveWorkflowCore(session, input, createEnterpriseNotification);

const serviceCatalog = [
  { id: 'profile-update', label: 'Profile Update', area: 'Profile', workflow: ['Employee', 'HR Operations', 'HR Manager'], slaHours: 24 },
  { id: 'leave', label: 'Leave Application', area: 'Leave', workflow: ['Employee', 'Line Manager', 'HR'], slaHours: 16 },
  { id: 'attendance-regularization', label: 'Attendance Regularization', area: 'Time', workflow: ['Employee', 'Supervisor', 'Time Office'], slaHours: 12 },
  { id: 'payslip', label: 'Payslip / Payroll Query', area: 'Payroll', workflow: ['Employee', 'Payroll Officer'], slaHours: 24 },
  { id: 'claim', label: 'Claim & Reimbursement', area: 'Claims', workflow: ['Employee', 'Line Manager', 'Finance'], slaHours: 48 },
  { id: 'loan', label: 'Loan / Salary Advance', area: 'Loan', workflow: ['Employee', 'Line Manager', 'HR', 'Finance'], slaHours: 72 },
  { id: 'travel', label: 'Travel Request', area: 'Travel', workflow: ['Employee', 'Line Manager', 'Admin', 'Finance'], slaHours: 48 },
  { id: 'travel-advance', label: 'Travel Advance', area: 'Travel', workflow: ['Employee', 'Line Manager', 'Finance'], slaHours: 48 },
  { id: 'trip-report', label: 'Trip Report', area: 'Travel', workflow: ['Employee', 'Line Manager'], slaHours: 24 },
  { id: 'travel-settlement', label: 'Travel Settlement', area: 'Travel', workflow: ['Employee', 'Finance'], slaHours: 48 },
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
    const url = new URL(request.url);
    const reportId = compact(url.searchParams.get('report'));
    const reportFormat = compact(url.searchParams.get('format')) || 'excel';

    if (reportId) {
      const cached = readEssPortalResponseCache<{
        employee?: { fullName?: string; employeeCode?: string; employeeId?: string; department?: string };
        leave?: { balances?: unknown[]; history?: unknown[] };
        payrollHistory?: unknown[];
        learning?: { courses?: unknown[]; materials?: unknown[]; certifications?: unknown[] };
        claims?: unknown[];
      }>(cacheKey);
      if (!cached) return err(400, 'Report data is not ready. Refresh the portal and try again.');
      try {
        const exported = buildEssReportExport(reportId, /pdf/i.test(reportFormat) ? 'pdf' : 'csv', {
          employeeName: String(cached.employee?.fullName || session.fullName || 'Employee'),
          employeeCode: String(cached.employee?.employeeCode || cached.employee?.employeeId || session.employeeCode || ''),
          department: String(cached.employee?.department || 'Unassigned'),
          leaveBalances: (cached.leave?.balances || []) as never,
          leaveHistory: (cached.leave?.history || []) as never,
          payrollHistory: (cached.payrollHistory || []) as never,
          learning: (cached.learning || { courses: [], materials: [], certifications: [] }) as never,
          claims: (cached.claims || []) as never,
        });
        return new Response(exported.body, {
          headers: {
            'Content-Type': exported.contentType,
            'Content-Disposition': `attachment; filename="${exported.fileName}"`,
          },
        });
      } catch (error) {
        return err(400, error instanceof Error ? error.message : 'Unable to export report.');
      }
    }

    const cached = request.headers.get('x-ess-refresh') === '1'
      ? null
      : readEssPortalResponseCache(cacheKey);
    if (cached) return ok(cached);
    const [employeeSource, rawRequests, loanApplications, loansConfig, taxConfig, pensionConfig, identityByKey] = await Promise.all([
      readPayrollEmployees(),
      loadWorkflowLeaveRequests({ repair: false }),
      readPayrollLoanApplications(),
      readPayrollLoansConfig(),
      readPayrollTaxConfig(),
      readPayrollPensionConfig(),
      payslipIdentityMap(),
    ]);
    if (identityByKey.size === 0) {
      void syncPayslipIdentitiesFromSage({ migratedBy: 'Employee Self-Service background identity sync' }).catch(() => undefined);
    }
    const allRequests = await expireStaleLeaveRequests(rawRequests);
    const employee = resolveEssEmployee(employeeSource.employees, session);
    if (!employee) return err(403, 'Employee identity is not linked to the logged-in account.');
    void repairPendingLeaveManagerNotifications({
      baseUrl: resolveWorkflowLinkOriginFromRequest(request),
      actorName: session.fullName || session.username,
    }).catch((error) => {
      console.error('[workforce-portal] pending leave manager notification repair failed', error);
    });
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
      const employerContributionLines = dedupePayrollLinesByCode(
        storedContributionLines.length
          ? storedContributionLines
          : [
            { code: 'PENSION_EMPLOYER', label: 'Pension Employer Contribution', units: employerPension > 0 ? 1 : 0, amount: employerPension },
            { code: 'NSITF', label: 'NSITF - Nigeria Social Insurance Trust Fund', units: nsitf > 0 ? 1 : 0, amount: nsitf },
            { code: 'ITF', label: 'ITF Levy', units: itf > 0 ? 1 : 0, amount: itf },
          ].filter((line) => Math.abs(Number(line.amount || 0)) > 0.004),
      );
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
    ].filter((value): value is string => Boolean(value));
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
    const loanProductLabels = new Map((loansVersion?.products || []).map((product) => [product.id, product.label]));
    const derivedClaims = deriveEssClaims(employeeRequests);
    const derivedTravel = deriveEssTravel(employeeRequests);
    const derivedAssets = deriveEssAssets(employeeRequests, essContext.documents);
    const derivedPerformanceHeuristic = deriveEssPerformance({
      attendanceRate,
      requests: employeeRequests,
      documents: essContext.documents,
    });
    const domainPerformance = await getEssPerformanceBundle(
      String(employee.employeeId || ''),
      String(employee.employeeCode || ''),
    ).catch(() => null);
    const performanceWorkspace = session ? await buildEssPerformanceWorkspace(session).catch(() => null) : null;
    const derivedPerformance = performanceWorkspace
      ? {
          goals: performanceWorkspace.self.goals,
          kpis: performanceWorkspace.self.kpis,
          reviews: performanceWorkspace.self.reviews,
          developmentPlans: performanceWorkspace.self.developmentPlans,
        }
      : domainPerformance && (domainPerformance.goals.length || domainPerformance.reviews.length)
      ? {
          goals: domainPerformance.goals,
          kpis: domainPerformance.kpis.length ? domainPerformance.kpis : derivedPerformanceHeuristic.kpis,
          reviews: domainPerformance.reviews,
          developmentPlans: domainPerformance.developmentPlans,
        }
      : derivedPerformanceHeuristic;
    const derivedLearning = deriveEssLearning(essContext.documents);
    const employeeDocuments = essContext.documents.length
      ? essContext.documents
      : Number(employee.documentCount || 0) > 0
        ? [{
            id: 'doc-summary',
            title: `${employee.documentCount} employee document(s) on file`,
            category: 'HRIS Documents',
            version: '—',
            status: 'Current',
            acknowledgement: 'On record',
            accessScope: 'Employee (self-service)',
          }]
        : [];
    const documentGovernance = deriveEssDocumentGovernance(employeeDocuments);
    const mobileAttendanceRecords = await listEssMobileAttendanceRecords(employeeMatchKeys).catch(() => []);
    const mergedAttendanceRecords = mergeEssAttendanceRecords(essContext.attendance.records, mobileAttendanceRecords);
    const todayMobileSession = await getEssMobileTodaySession(compact(employee.employeeCode || employee.employeeId)).catch(() => null);
    const remoteDays = mobileAttendanceRecords.filter((item) => item.source === 'ESS Mobile').length;
    const timeRequests = employeeRequests
      .filter((item) => /attendance|overtime|time|shift|remote|regular/i.test(`${item.category} ${item.title}`))
      .map((item) => ({
        id: item.id,
        title: item.title || item.category,
        category: item.category,
        status: item.status,
        submittedAt: item.submittedAt,
        updatedAt: item.updatedAt,
      }));
    const derivedAuditTrail = deriveEssAuditTrail({
      employeeName: employee.fullName,
      employeeId: employee.employeeId,
      requests: employeeRequests,
    });
    const leaveUtilizationPct = annualEntitlement > 0 ? Math.round((leaveUsed / annualEntitlement) * 100) : 0;
    const employeeLeaveApplications = [
      ...employeeRequests
        .filter((item) => /leave/i.test(item.category) && item.startDate && item.endDate)
        .filter((item) => ['Submitted', 'Line Manager Review', 'HR Review', 'Under Review'].includes(item.status))
        .filter((item) => !essContext.leave.applications.some((application) => application.id === item.id))
        .map((item) => ({
          id: item.id,
          employeeId: employee.employeeId,
          fullName: employee.fullName,
          department: employee.department || 'Unassigned',
          managerName: item.lineManagerName || employee.managerName || 'Line Manager',
          leaveType: item.leaveType || 'Leave',
          startDate: item.startDate || '',
          endDate: item.endDate || '',
          days: Number(item.days || 0),
          status: item.status === 'Line Manager Review' || item.status === 'HR Review' ? 'Under Review' : item.status,
          stage: item.status === 'HR Review' ? 'HR' as const : 'Supervisor' as const,
          actingOfficer: item.relieverName || 'Not configured',
          supportingDocuments: item.attachmentNames?.length || 0,
          exceptions: [] as string[],
          approvalStatus: item.status === 'Line Manager Review' ? 'Awaiting Line Manager' : item.status === 'HR Review' ? 'Awaiting HR' : 'Pending',
        })),
      ...essContext.leave.applications.map((item) => ({
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
    })),
    ];
    const leavePolicyCards = adjustLeavePolicyCardsForEssPending(essContext.leave.policyCards, employeeRequests);
    const confirmedPermanent = String(employee.status || '').toLowerCase().includes('confirmed');
    const fourteenDayPaidLeaveEmployee = isFourteenDayPaidLeaveEmployee(employee);
    const currentYearAllowanceAlreadyPaid = await hasLeaveAllowanceInYear(employee, leaveYear);
    const allowanceEligible = annualBalance >= 10 && !currentYearAllowanceAlreadyPaid;
    const essActiveLeaveRequest = employeeRequests.find((item) =>
      /leave/i.test(item.category)
      && ['Submitted', 'Line Manager Review', 'HR Review'].includes(item.status),
    );
    const activeLeaveApplication = employeeLeaveApplications.find((item) =>
      ['Submitted', 'Under Review', 'Approved', 'Line Manager Review', 'HR Review'].includes(item.status),
    ) || (essActiveLeaveRequest
      ? {
          id: essActiveLeaveRequest.id,
          managerName: essActiveLeaveRequest.lineManagerName || employee.managerName || 'Line Manager',
          stage: essActiveLeaveRequest.status === 'HR Review' ? 'HR' : 'Supervisor',
          status: essActiveLeaveRequest.status,
          actingOfficer: essActiveLeaveRequest.relieverName || 'Not configured',
        }
      : undefined);
    const activeLeaveManagerName = activeLeaveApplication && 'managerName' in activeLeaveApplication
      ? String(activeLeaveApplication.managerName || employee.managerName || 'Line Manager')
      : employee.managerName || 'Line Manager';
    const activeLeaveStage = activeLeaveApplication && 'stage' in activeLeaveApplication
      ? String(activeLeaveApplication.stage || '')
      : essActiveLeaveRequest?.status === 'HR Review'
        ? 'HR'
        : essActiveLeaveRequest?.status === 'Line Manager Review'
          ? 'Supervisor'
          : '';
    const activeLeaveStatus = activeLeaveApplication && 'status' in activeLeaveApplication
      ? String(activeLeaveApplication.status || '')
      : '';
    const activeLeaveReliever = activeLeaveApplication && 'actingOfficer' in activeLeaveApplication
      ? String(activeLeaveApplication.actingOfficer || 'Reliever')
      : 'Reliever';
    const currentLeaveNow = employeeLeaveApplications.find((item) => ['Approved', 'Completed'].includes(item.status) && item.startDate <= new Date().toISOString().slice(0, 10) && item.endDate >= new Date().toISOString().slice(0, 10));
    const leaveWorkflow = activeLeaveApplication
      ? [
          { stage: 'Employee Request', owner: employee.fullName, status: 'Completed', sla: 'Immediate' },
          { stage: 'Line Manager / Lead / Supervisor', owner: activeLeaveManagerName, status: activeLeaveStage === 'Supervisor' || activeLeaveStatus === 'Line Manager Review' ? 'Current' : ['HR', 'Final Approval', 'Closed'].includes(activeLeaveStage) ? 'Completed' : 'Pending', sla: '5 working days' },
          { stage: 'HR Manager / Head', owner: 'HR Manager / Head', status: ['HR', 'Final Approval'].includes(activeLeaveStage) || activeLeaveStatus === 'HR Review' ? 'Current' : activeLeaveStatus === 'Approved' ? 'Completed' : 'Pending', sla: '5 working days' },
          { stage: 'Requester Notification', owner: employee.fullName, status: activeLeaveStatus === 'Approved' ? 'Delivered' : 'Pending', sla: 'After final approval' },
          { stage: 'Reliever Notification', owner: activeLeaveReliever, status: activeLeaveStatus === 'Approved' ? 'Delivered' : 'Pending', sla: 'After final approval' },
        ]
      : [
          { stage: 'Employee Request', owner: employee.fullName, status: 'Not started', sla: 'Immediate' },
          { stage: 'Line Manager / Lead / Supervisor', owner: employee.managerName || 'Line Manager', status: 'Not started', sla: '5 working days' },
          { stage: 'HR Manager / Head', owner: 'HR Manager / Head', status: 'Not started', sla: '5 working days' },
          { stage: 'Requester Notification', owner: employee.fullName, status: 'Not started', sla: 'After final approval' },
          { stage: 'Reliever Notification', owner: 'Selected reliever', status: 'Not started', sla: 'After final approval' },
        ];
    const leaveCalendarConfig = await readLeaveCalendarConfig();
    const leaveCalendar = [
      ...leaveCalendarConfig.holidays.map((item) => ({
        id: item.id,
        label: item.label,
        from: item.date,
        to: item.date,
        status: 'Public Holiday',
        type: 'Public Holiday',
        scope: 'Nigeria',
      })),
      ...employeeLeaveApplications
        .filter((item) => ['Submitted', 'Under Review', 'Approved', 'Completed', 'Line Manager Review', 'HR Review'].includes(item.status))
        .map((item) => ({ id: item.id, label: `${item.leaveType} - ${item.fullName}`, from: item.startDate, to: item.endDate, status: item.status, type: item.leaveType, scope: item.department })),
      ...employeeRequests
        .filter((item) => /leave/i.test(item.category) && item.startDate && item.endDate && !employeeLeaveApplications.some((application) => application.id === item.id))
        .filter((item) => ['Submitted', 'Line Manager Review', 'HR Review', 'Approved'].includes(item.status))
        .map((item) => ({
          id: item.id,
          label: `${item.leaveType || 'Leave'} - ${employee.fullName}`,
          from: item.startDate || '',
          to: item.endDate || '',
          status: item.status,
          type: item.leaveType || 'Leave',
          scope: employee.department || 'Unassigned',
        })),
    ];
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
    const leaveApprovals = pendingLeaveApprovalsForActor(
      employee,
      allRequests.filter((item) => /leave/i.test(item.category) && item.startDate && item.endDate),
      employeeSource.employees,
      session.roles || [],
      session.isGlobalAdmin,
    ).map((item) => {
      const requester = employeeSource.employees.find((emp) => employeeRequestMatches(emp, item.employeeId)) || null;
      const requesterBalance = requester ? Math.max(0, annualLeaveEntitlementForEmployee(requester)) : 0;
      return {
        id: item.id,
        requestId: item.requestId,
        title: item.title,
        employee: item.employee,
        employeeId: item.employeeId,
        employeeCode: item.employeeCode,
        type: item.type,
        days: item.days,
        stage: item.stage,
        status: item.status,
        reliever: item.reliever,
        handover: item.handover,
        conflict: item.conflict,
        startDate: item.startDate,
        endDate: item.endDate,
        approverKind: item.approverKind,
        department: item.department,
        designation: item.designation,
        costCentre: item.costCentre,
        appliedOn: item.appliedOn,
        priority: item.priority,
        reason: item.reason,
        slaStatus: item.slaStatus,
        elapsedWorkingDays: item.elapsedWorkingDays,
        slaWorkingDays: item.slaWorkingDays,
        leaveBalance: requesterBalance,
        attachmentNames: item.attachmentNames,
        comments: item.comments,
      };
    });
    const employeeDepartment = compact(employee.department).toLowerCase();
    const approvalMetrics = (() => {
      const todayIso = new Date().toISOString().slice(0, 10);
      const deptEmployeeIds = new Set(
        employeeSource.employees
          .filter((item) => compact(item.department).toLowerCase() === employeeDepartment)
          .flatMap((item) => [item.employeeId, item.employeeCode].filter(Boolean).map((key) => normalizePayrollMatchKey(String(key)))),
      );
      const inActorScope = (request: EssRequest) => {
        const key = normalizePayrollMatchKey(request.employeeId);
        return deptEmployeeIds.has(key) || employeeRequestMatches(employee, request.employeeId);
      };
      const scopedLeave = allRequests.filter((item) => /leave/i.test(item.category) && item.startDate && item.endDate && inActorScope(item));
      const decidedToday = scopedLeave.filter((item) => compact(item.updatedAt).slice(0, 10) === todayIso);
      const approvedToday = decidedToday.filter((item) => item.status === 'Approved').length;
      const rejectedToday = decidedToday.filter((item) => item.status === 'Rejected').length;
      const escalated = leaveApprovals.filter((item) => item.slaStatus === 'Overdue').length;
      const activeScoped = scopedLeave.filter((item) => ['Line Manager Review', 'HR Review', 'Submitted'].includes(item.status));
      const overdueActive = activeScoped.filter((item) => item.submittedAt && workingDaysSince(item.submittedAt) > workflowDeadlineDays).length;
      const slaCompliance = activeScoped.length ? Math.round((1 - overdueActive / activeScoped.length) * 100) : 100;
      const approvedForAvg = scopedLeave.filter((item) => item.status === 'Approved' && item.submittedAt && item.updatedAt);
      const avgDays = approvedForAvg.length
        ? approvedForAvg.reduce((sum, item) => sum + workingDaysSince(item.submittedAt, item.updatedAt), 0) / approvedForAvg.length
        : 0;
      const avgWholeDays = Math.floor(avgDays);
      const avgHours = Math.round((avgDays - avgWholeDays) * 24);
      return {
        pendingApprovals: leaveApprovals.length,
        approvedToday,
        rejectedToday,
        escalated,
        slaCompliance,
        avgApprovalLabel: approvedForAvg.length ? `${avgWholeDays}d ${avgHours}h` : '—',
      };
    })();
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

    const workflowIntelligence = buildEssWorkflowIntelligence({
      employee: {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        department: employee.department || 'Unassigned',
        manager: employee.managerName || 'Line Manager',
        jobTitle: employee.jobTitle || employee.designation,
      },
      requests: employeeRequests,
      approvalQueue: leaveApprovals.map((item) => ({
        id: item.id,
        employee: item.employee,
        type: item.type,
        days: item.days,
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        stage: item.stage,
      })),
      leaveApprovals,
      notifications: essContext.notifications,
      serviceCatalog,
      auditTrail: derivedAuditTrail,
    });

    const profilePendingUpdates = await pendingProfileUpdatesForEmployee(employee.employeeId);
    const canApproveProfileUpdates = canApproveEssProfileUpdate(session.roles || []);
    const actorProfileCode = compact(session.employeeCode || session.username || employee.employeeCode || employee.employeeId).toUpperCase();
    const profileApprovalQueue = canApproveProfileUpdates
      ? allRequests
          .filter((item) =>
            isProfileUpdateRequest(item)
            && !/approved|rejected|closed|terminated/i.test(item.status)
            && compact(item.employeeId).toUpperCase() !== actorProfileCode,
          )
          .map((item) => ({
            id: item.id,
            employeeId: item.employeeId,
            employeeName: employeeSource.employees.find(
              (row) =>
                compact(row.employeeId).toUpperCase() === compact(item.employeeId).toUpperCase()
                || compact(row.employeeCode).toUpperCase() === compact(item.employeeId).toUpperCase(),
            )?.fullName || item.employeeId,
            sectionId: String((item as { profileSectionId?: string }).profileSectionId || ''),
            title: item.title,
            status: item.status,
            submittedAt: item.submittedAt,
            changes: (item as { profileChanges?: Record<string, string> }).profileChanges || {},
            previousValues: (item as { profilePreviousValues?: Record<string, string> }).profilePreviousValues || {},
          }))
      : [];

    const portalAnnouncements = [
      ...(currentPeriodReleased && essDisplayPeriod
        ? [{ id: 'ann-001', title: `${periodTitle(essDisplayPeriod)} payslip is now available`, channel: 'Payroll', publishedAt: dateAdd(-1), priority: 'High' as const }]
        : []),
    ];
    const portalNotifications = [
      ...leaveApprovals.map((item) => ({
        id: `live-leave-${item.id}`,
        title: `Leave approval required: ${item.employee}`,
        type: 'Workflow',
        status: 'Unread',
        createdAt: new Date().toISOString(),
        href: '/workforce-portal?tab=leave&leaveSection=Approvals',
      })),
      ...profileApprovalQueue.map((item) => ({
        id: `live-profile-${item.id}`,
        title: `Profile update approval required: ${item.employeeName}`,
        type: 'Workflow',
        status: 'Unread',
        createdAt: item.submittedAt || new Date().toISOString(),
        href: `/workforce-portal?tab=profile&profileApprovalId=${encodeURIComponent(item.id)}`,
      })),
      ...essContext.notifications.filter((item) =>
        !String(item.id).startsWith('live-leave-')
        && !String(item.id).startsWith('live-profile-'),
      ),
      ...(latestReleasedPayroll && !essContext.notifications.some((item) => /payslip/i.test(item.title))
        ? [{ id: 'ntf-payslip', title: `${latestReleasedPayroll.periodLabel || periodTitle(latestReleasedPayroll.period)} payslip is ready for download`, type: 'Payroll', status: 'Read', createdAt: dateAdd(-1), href: '/workforce-portal?tab=payroll' }]
        : []),
    ];
    const communications = deriveEssCommunications({
      announcements: portalAnnouncements,
      notifications: portalNotifications,
      documents: employeeDocuments,
      documentGovernance,
      events: essContext.events,
      requests: employeeRequests,
      generatedAt: new Date().toISOString(),
    });

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
        leave: { entitlement: annualEntitlement, used: leaveUsed, balance: annualBalance, carryForward: leaveContext.carryForward || 0, pending: requests.filter((item) => isLeaveEssRequest(item) && isPendingLeaveStatus(item.status)).length },
        attendance: { monthRate: attendanceRate, lateArrivals: essContext.attendance.lateArrivals, overtimeHours: essContext.attendance.overtimeHours, remoteDays: remoteDays || essContext.attendance.remoteDays },
        payroll: {
          monthlyPay: latestReleasedPayroll?.netPay || latestReleasedPayroll?.grossPay || 0,
          currency: employee.payCurrency || 'NGN',
          payslips: payrollHistory.length,
          periodLabel: latestReleasedPayroll ? (latestReleasedPayroll.periodLabel || periodTitle(latestReleasedPayroll.period)) : '',
          released: currentPeriodReleased,
          deductions: latestReleasedPayroll?.deductions || 0,
          pension: latestReleasedPayroll?.pensionEmployee || latestReleasedPayroll?.deductionLines?.find((line) => line.code === 'PENSION_EMPLOYEE')?.amount || 0,
          allowances: latestReleasedPayroll?.allowances || 0,
        },
        requests: { pending: requests.filter((item) => !['Approved', 'Rejected', 'Closed'].includes(item.status)).length, approved: requests.filter((item) => item.status === 'Approved').length, total: requests.length },
        loans: { applications: employeeLoans.length, outstanding: employeeLoans.reduce((sum, item) => sum + Number(item.outstandingBalance || 0), 0) },
      },
      dashboardAnalytics: essContext.dashboardAnalytics,
      announcements: communications.announcements,
      notifications: communications.notifications,
      communications: {
        summary: communications.summary,
        engagements: communications.engagements,
      },
      approvalQueue: leaveApprovals.map((item) => ({
        id: String(item.id),
        employee: String(item.employee),
        type: String(item.type),
        days: Number(item.days || 0),
        startDate: String(item.startDate || ''),
        endDate: String(item.endDate || ''),
        stage: String(item.stage || 'Approval'),
      })),
      birthdays: essContext.birthdays,
      anniversaries: essContext.anniversaries,
      todaysBirthdays: essContext.todaysBirthdays,
      todaysAnniversaries: essContext.todaysAnniversaries,
      events: essContext.events,
      documents: employeeDocuments,
      documentGovernance,
      profileSections: buildEssProfileSections(
        employee,
        employeeDocuments,
        employeeSource.employees,
      ),
      profilePendingUpdates: profilePendingUpdates.map((item) => ({
        id: item.id,
        sectionId: item.profileSectionId,
        title: item.title,
        status: item.status,
        submittedAt: item.submittedAt,
        changes: item.profileChanges,
      })),
      canApproveProfileUpdates,
      profileApprovalQueue,
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
        pendingApprovalCount: leaveApprovals.length,
        approvalMetrics,
        reports: ['Employee leave balance', 'Department leave utilization', 'Leave liability', 'Carry forward leave', 'Expired/forfeited leave', 'Leave allowance eligibility', 'Payroll-impact leave', 'Sick leave trend', 'Absenteeism', 'Employees currently on leave', 'Upcoming leave', 'Approval SLA report', 'Leave audit trail'].map((title, index) => ({ id: `ess-rpt-${index + 1}`, title, format: 'Excel / PDF / CSV', status: 'Available' })),
        notifications: ['Leave submitted', 'Approval pending', 'Leave approved', 'Leave rejected', 'Leave cancelled', 'Leave recalled', 'Carry forward balance created', 'Carry forward expiry reminder', 'Return-to-work reminder', 'Payroll leave allowance processing', 'Blackout conflict warning', 'Reliever assignment'].map((title, index) => ({ id: `leave-ntf-${index + 1}`, title, channel: 'Email, In-app, ESS', status: 'Enabled' })),
        security: [
          { role: 'Employee', access: 'Apply and view own leave only' },
          { role: 'Supervisor/Manager', access: 'Approve team leave and view team calendar' },
          { role: 'HR Officer', access: 'Final approval and leave record management' },
          { role: 'Payroll Officer', access: 'Payroll-impact leave only' },
        ],
        relieverOptions,
        holidays: leaveCalendarConfig.holidays,
        holidayFeed: leaveCalendarConfig.holidayFeed || null,
      },
      attendance: {
        records: mergedAttendanceRecords,
        shifts: employee.shift ? [{ id: 'shift-current', name: `${employee.shift} Shift`, start: '08:00', end: '17:00', location: essContext.employeeSummary.location }] : [],
        timesheets: [],
        todaySession: todayMobileSession,
        clockingState: todayMobileSession
          ? todayMobileSession.clockOutAt
            ? 'clocked-out'
            : 'clocked-in'
          : mergedAttendanceRecords.some((item) => item.date === new Date().toISOString().slice(0, 10) && item.clockIn && item.clockIn !== '—' && item.clockOut === '—')
            ? 'clocked-in'
            : mergedAttendanceRecords.some((item) => item.date === new Date().toISOString().slice(0, 10) && item.clockOut && item.clockOut !== '—')
              ? 'clocked-out'
              : 'ready',
        mobileClockEnabled: true,
        timeRequests,
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
      performance: derivedPerformance,
      performanceWorkspace,
      learning: derivedLearning,
      claims: derivedClaims,
      loanManagement: {
        products: loansVersion?.products.filter((product) => product.enabled) || [],
        applications: employeeLoans,
        repaymentSchedules: deriveLoanRepaymentSchedules(employeeLoans),
        history: deriveLoanHistory(employeeLoans, loanProductLabels),
      },
      travel: derivedTravel,
      assets: derivedAssets,
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
      auditTrail: derivedAuditTrail,
      ...(() => {
        const generatedAt = new Date().toISOString();
        const employeeReports = deriveEssEmployeeReports({
          leaveBalances: leavePolicyCards,
          leaveHistory,
          payrollHistory,
          learning: derivedLearning,
          claims: derivedClaims,
          generatedAt,
        });
        return { reports: employeeReports.reports, reportDownloads: employeeReports.downloads };
      })(),
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
      analytics: derivePortalAnalytics({
        requests: employeeRequests,
        attendanceRate,
        leaveUtilizationPct,
        slaCompliancePct: workflowIntelligence.kpis.slaCompliancePct,
      }),
      managerMetrics: (() => {
        const teamSize = countDirectReportsFromEmployees(employeeSource.employees, employee);
        const directReports = employeeSource.employees.filter((item) => employeeReportsToManager(item, employee));
        const onLeave = directReports.filter((item) => /leave/i.test(compact(item.status))).length;
        return {
          teamSize,
          pendingApprovals: leaveApprovals.length + (performanceWorkspace?.metrics.pendingManagerReviews || 0),
          onLeave,
          missingTimesheets: Math.max(0, directReports.length - Math.min(directReports.length, essContext.attendance.records.length)),
          teamAttendancePct: essContext.attendance.monthRate || 0,
          trainingToday: 0,
          pendingPerformanceReviews: performanceWorkspace?.metrics.pendingManagerReviews || 0,
        };
      })(),
      workflowIntelligence,
      workflowDiagnostics: await (async () => {
        const leaveTraceRequestIds = [...new Set([
          ...employeeRequests.filter((item) => /leave/i.test(item.category)).map((item) => item.id),
          ...leaveApprovals.map((item) => item.id),
        ])];
        const [recentDeliveryFailures, ...traceEntries] = await Promise.all([
          listLeaveWorkflowDeliveryLog({ failedOnly: true, limit: 20 }),
          ...leaveTraceRequestIds.map(async (requestId) => [requestId, await getLeaveRequestDeliveryTrace(requestId)] as const),
        ]);
        return {
          mailProvider: resolveMailProvider(),
          mailConfigured: Boolean(resolveMailProvider()),
          recentFailures: recentDeliveryFailures.map((item) => ({
            step: item.step,
            channel: item.channel,
            status: item.status,
            createdAt: item.createdAt,
            error: item.error,
            recipientEmail: item.recipientEmail,
            provider: item.provider,
            message: item.message,
            requestId: item.requestId,
          })),
          requestTraces: Object.fromEntries(traceEntries),
        };
      })(),
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

    if (action === 'retry-leave-notification') {
      const requestId = compact(body.requestId || body.id);
      if (!requestId) return err(400, 'requestId is required');
      const allRequests = await loadWorkflowLeaveRequests();
      const target = allRequests.find((item) => item.id === requestId);
      if (!target) return err(404, 'Leave request not found.');
      const isRequester = employeeRequestMatches(employee, target.employeeId);
      const isAssignedManager = target.lineManagerEmployeeId
        ? employeeRequestMatches(employee, target.lineManagerEmployeeId)
        : false;
      const canApprove = pendingLeaveApprovalsForActor(
        employee,
        allRequests.filter((item) => /leave/i.test(item.category) && item.startDate && item.endDate),
        employeeSource.employees,
        session.roles || [],
        session.isGlobalAdmin,
      ).some((item) => item.id === requestId);
      if (!isRequester && !isAssignedManager && !canApprove) {
        return err(403, 'You are not authorized to retry notifications for this leave request.');
      }
      try {
        const delivery = await retryLeaveManagerNotification({
          requestId,
          actorName: session.fullName || session.username,
          baseUrl: resolveWorkflowLinkOriginFromRequest(request),
        });
        invalidateEssPortalCache();
        return ok({
          message: 'Approval email resent to the line manager.',
          delivery,
        });
      } catch (error) {
        return err(502, error instanceof Error ? error.message : 'Unable to resend approval email.');
      }
    }

    if (action === 'verify-mail-config') {
      const provider = resolveMailProvider();
      const verification = await verifyMailConnection();
      const mailbox = await resolveEmployeeMailbox(employee);
      return ok({
        provider,
        verification,
        employeeMailbox: mailbox,
      });
    }

    if (action === 'withdraw-leave' || action === 'cancel-leave') {
      const requestId = compact(body.requestId || body.id);
      if (!requestId) return err(400, 'requestId is required');
      try {
        await cancelEssLeaveRequest({
          requestId,
          actorName: session.fullName || session.username,
          reason: compact(body.comment) || 'Withdrawn from Employee Self-Service.',
          employee,
          baseUrl: resolveWorkflowLinkOriginFromRequest(request),
        });
        return ok({ requestId, status: 'Cancelled', message: 'Leave request withdrawn. You can submit a new application.' });
      } catch (error) {
        return err(409, error instanceof Error ? error.message : 'Unable to withdraw leave request.');
      }
    }

    if (action === 'approve-leave' || action === 'reject-leave') {
      const requestId = compact(body.requestId || body.id);
      if (!requestId) return err(400, 'requestId is required');
      try {
        const result = await transitionEssLeaveRequest({
          requestId,
          action: action === 'approve-leave' ? 'approve' : 'reject',
          actorName: session.fullName || session.username,
          actor: employee,
          roles: session.roles || [],
          isGlobalAdmin: session.isGlobalAdmin,
          comment: compact(body.comment) || undefined,
          baseUrl: resolveWorkflowLinkOriginFromRequest(request),
        });
        return ok({ request: result.request, leaveAllowance: result.allowanceMessage });
      } catch (error) {
        return err(error instanceof Error && error.message.includes('not authorized') ? 403 : 409, error instanceof Error ? error.message : 'Unable to process leave approval.');
      }
    }

    if (action === 'clock-in' || action === 'clock-out') {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const accuracyMeters = body.accuracyMeters === undefined || body.accuracyMeters === null ? null : Number(body.accuracyMeters);
      const addressLabel = compact(body.addressLabel) || null;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return err(400, 'Location permission is required. Allow GPS access so the system can verify your remote site.');
      }
      try {
        const result = action === 'clock-in'
          ? await recordEssMobileClockIn(employee, { latitude, longitude, accuracyMeters, addressLabel })
          : await recordEssMobileClockOut(employee, { latitude, longitude, accuracyMeters, addressLabel });
        invalidateEssPortalCache();
        return ok(result);
      } catch (error) {
        return err(409, error instanceof Error ? error.message : `Unable to ${action.replace('-', ' ')}.`);
      }
    }

    if (action === 'acknowledge-performance-goal' || action === 'acknowledge-performance-result') {
      const perfAction = action === 'acknowledge-performance-goal' ? 'goal.acknowledge' : 'result.acknowledge';
      const denied = assertEssPerformanceAction(perfAction);
      if (denied) return err(403, denied);
      const actorContext = buildPerformanceActorContext(session);
      const result = await applyPerformanceAction({
        action: perfAction,
        actor: session.fullName || session.username,
        actorRole: actorContext.performanceRole,
        payload: { id: compact(body.id || body.goalId || body.resultId) },
      }, actorContext);
      if (!result.ok) return err(400, result.error || 'Unable to acknowledge performance item.');
      invalidateEssPortalCache();
      return ok({ message: result.message || 'Acknowledged.' });
    }

    if (action === 'performance-action') {
      const perfAction = compact(body.performanceAction);
      const denied = assertEssPerformanceAction(perfAction);
      if (denied) return err(403, denied);
      const actorContext = buildPerformanceActorContext(session);
      const rawPayload = (body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload))
        ? (body.payload as Record<string, unknown>)
        : body;
      const payload: Record<string, unknown> = { ...rawPayload };
      if (!compact(payload.employeeId) && (perfAction === 'checkin.create' || (perfAction === 'assessment.save' && ['Self', 'Mid-Year'].includes(compact(payload.type))))) {
        payload.employeeId = employee.employeeId || actorContext.employeeId;
        payload.employeeName = employee.fullName || actorContext.fullName;
        if (!compact(payload.employeeCode)) payload.employeeCode = employee.employeeCode || actorContext.employeeCode;
      }
      const result = await applyPerformanceAction({
        action: perfAction,
        actor: session.fullName || session.username,
        actorRole: actorContext.performanceRole,
        payload,
      }, actorContext);
      if (!result.ok) return err(400, result.error || 'Performance action failed.');
      invalidateEssPortalCache();
      return ok({ message: result.message || 'Saved.', workspace: await buildEssPerformanceWorkspace(session).catch(() => null) });
    }

    if (action === 'submit-profile-update') {
      const sectionId = compact(body.sectionId);
      const sectionLabel = compact(body.sectionLabel) || sectionId;
      const changes = body.changes && typeof body.changes === 'object' && !Array.isArray(body.changes)
        ? (body.changes as Record<string, string>)
        : {};
      const previousValues = body.previousValues && typeof body.previousValues === 'object' && !Array.isArray(body.previousValues)
        ? (body.previousValues as Record<string, string>)
        : {};
      try {
        const requestItem = await submitEssProfileUpdate({
          employee,
          actorName: session.fullName || session.username,
          sectionId,
          sectionLabel,
          changes,
          previousValues,
          comment: compact(body.comment) || undefined,
          baseUrl: resolveWorkflowLinkOriginFromRequest(request),
        });
        return ok({ request: requestItem, message: 'Profile update submitted for HR Manager approval. HR has been notified by portal and email.' });
      } catch (error) {
        return err(409, error instanceof Error ? error.message : 'Unable to submit profile update.');
      }
    }

    if (action === 'approve-profile-update' || action === 'reject-profile-update') {
      const requestId = compact(body.requestId || body.id);
      if (!requestId) return err(400, 'requestId is required');
      try {
        const requestItem = await transitionEssProfileUpdate({
          requestId,
          action: action === 'approve-profile-update' ? 'approve' : 'reject',
          actor: session,
          employeeDirectory: employeeSource.employees,
          comment: compact(body.comment) || undefined,
          baseUrl: resolveWorkflowLinkOriginFromRequest(request),
        });
        return ok({
          request: requestItem,
          message: action === 'approve-profile-update'
            ? 'Profile update approved and applied to HRIS. The employee has been notified.'
            : 'Profile update rejected. The employee has been notified.',
        });
      } catch (error) {
        return err(
          error instanceof Error && error.message.includes('not authorized') ? 403 : 409,
          error instanceof Error ? error.message : 'Unable to process profile update.',
        );
      }
    }

    const category = compact(body.category);
    const title = compact(body.title);
    const priority = compact(body.priority) as EssRequest['priority'];
    const serviceId = compact(body.serviceId);
    if (!category && !serviceId) return err(400, 'serviceId or category is required');
    if (!title) return err(400, 'title is required');

    const catalogItem = serviceCatalog.find((item) => item.id === serviceId)
      || serviceCatalog.find((item) => item.label === category || item.id === category);
    if (!catalogItem) return err(400, 'Unknown service type. Please select a valid service from the catalog.');
    const now = new Date().toISOString();
    const leaveType = compact(body.leaveType || body.type);
    let leaveDays = Number(body.days || 0);
    let resolvedSelectedDates: string[] = Array.isArray(body.selectedDates)
      ? body.selectedDates.map((item: unknown) => compact(item)).filter(Boolean)
      : [];
    let excludedHolidays: Array<{ date: string; label: string }> = [];
    const startDate = normalizeLeaveDate(body.startDate);
    const endDate = normalizeLeaveDate(body.endDate);
    const reason = compact(body.reason);
    const handover = compact(body.handover);
    const relieverEmployeeId = compact(body.relieverEmployeeId);
    const relieverNameInput = compact(body.relieverName);
    const isLeaveRequest = catalogItem.id === 'leave' || /leave application/i.test(catalogItem.label);
    if (isLeaveRequest && !compact(body.leaveType)) {
      return err(400, 'Leave applications must be submitted from the Leave workspace with dates and a department reliever.');
    }
    const reliever = relieverEmployeeId
      ? employeeSource.employees.find((item) => item.employeeId === relieverEmployeeId || item.employeeCode === relieverEmployeeId)
      : null;
    const attachmentNames = Array.isArray(body.attachmentNames)
      ? body.attachmentNames.map((item) => compact(item)).filter(Boolean)
      : compact(body.attachmentNames).split(',').map((item) => item.trim()).filter(Boolean);
    if (isLeaveRequest) {
      if (!leaveType) return err(400, 'leaveType is required');
      if (!startDate || !endDate) return err(400, 'startDate and endDate are required');
      if (!reliever) return err(400, 'A department reliever must be selected.');
      const selectedDates = resolvedSelectedDates;
      const acknowledgeHolidays = Boolean(body.acknowledgeHolidays);
      const policyCheck = await validateEssLeaveApplication({
        employee,
        leaveType,
        startDate,
        endDate,
        days: leaveDays || selectedDates.length || 1,
        selectedDates,
        acknowledgeHolidays,
        relieverEmployeeId: reliever.employeeId,
      });
      if (!policyCheck.ok) {
        return NextResponse.json({
          status: 'error',
          error: policyCheck.message,
          code: 'code' in policyCheck ? policyCheck.code : undefined,
          holidays: 'holidays' in policyCheck ? policyCheck.holidays : undefined,
          calculatedDays: 'calculatedDays' in policyCheck ? policyCheck.calculatedDays : undefined,
          selectedDates: 'selectedDates' in policyCheck ? policyCheck.selectedDates : undefined,
        }, { status: policyCheck.status });
      }
      leaveDays = policyCheck.days;
      resolvedSelectedDates = policyCheck.selectedDates;
      excludedHolidays = policyCheck.excludedHolidays;
    }
    const leaveYear = Number(body.leaveYear || new Date().getFullYear());
    const allowanceAlreadyPaid = isLeaveRequest
      ? await hasLeaveAllowanceInYear(employee, leaveYear)
      : false;
    const initialStatus: EssRequest['status'] = isLeaveRequest
      ? 'Line Manager Review'
      : catalogItem.workflow.some((stage) => /line manager|supervisor/i.test(stage))
        ? 'Line Manager Review'
        : 'Submitted';
    const relieverName = reliever ? reliever.fullName : relieverNameInput;
    const lineManager = isLeaveRequest ? resolveLineManagerForEmployee(employee, employeeSource.employees) : null;
    const fallbackSupervisorCode = isLeaveRequest && !lineManager ? explicitDepartmentSupervisorCode(employee.department || '') : null;
    const fallbackSupervisor = fallbackSupervisorCode
      ? employeeSource.employees.find((item) => employeeRequestMatches(item, fallbackSupervisorCode))
      : null;
    const resolvedManager = lineManager || (fallbackSupervisor
      ? { employee: fallbackSupervisor, label: fallbackSupervisor.fullName, source: 'reporting-manager' as const }
      : null);
    const lineManagerLabel = resolvedManager?.label || managerOwnerFor(employee);
    const requestId = compact(body.requestId) || `ess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const serviceWorkflow = isLeaveRequest
      ? leaveWorkflowFor(employee, relieverName, initialStatus, now, lineManagerLabel)
      : serviceWorkflowFor(catalogItem.workflow, employee.fullName, lineManagerLabel, initialStatus, now);
    const requestItem: EssRequest = {
      id: requestId,
      employeeId: employee.employeeId,
      serviceId: catalogItem.id,
      category: catalogItem.label,
      title,
      status: initialStatus,
      priority: ['Low', 'Normal', 'High'].includes(priority) ? priority : 'Normal',
      submittedAt: now,
      updatedAt: now,
      approvers: isLeaveRequest ? [lineManagerLabel, 'HR Manager / Head'] : catalogItem.workflow.slice(1),
      leaveType: leaveType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      selectedDates: isLeaveRequest && resolvedSelectedDates.length ? resolvedSelectedDates : undefined,
      excludedHolidays: isLeaveRequest && excludedHolidays.length ? excludedHolidays : undefined,
      days: leaveDays || undefined,
      payrollPeriod: startDate ? startDate.slice(0, 7) : undefined,
      paidLeave: isLeaveRequest && leaveType === 'Annual Leave',
      reason: reason || undefined,
      relieverEmployeeId: reliever ? reliever.employeeId : relieverEmployeeId || undefined,
      relieverName: relieverName || undefined,
      lineManagerEmployeeId: resolvedManager ? (resolvedManager.employee.employeeCode || resolvedManager.employee.employeeId) : undefined,
      lineManagerName: lineManagerLabel,
      handover: handover || undefined,
      attachmentNames: attachmentNames.length ? attachmentNames : undefined,
      workflow: serviceWorkflow,
      comments: [{
        at: now,
        actor: employee.fullName || 'Employee Self-Service',
        comment: allowanceAlreadyPaid
          ? `Request submitted from workforce portal. Leave allowance has already been paid/approved for ${leaveYear}.`
          : isLeaveRequest && leaveType === 'Annual Leave' && leaveDays >= dormantLongPolicy.allowanceMinimumAnnualDays
            ? 'Request submitted from workforce portal. Leave allowance will post to payroll after approval.'
            : `${catalogItem.label} submitted from workforce portal.`,
      }],
    };

    const requests = await readRequests();
    await writeRequests([requestItem, ...requests]);
    invalidateEssPortalCache();
    if (isLeaveRequest) {
      const baseUrl = resolveWorkflowLinkOriginFromRequest(request);
      try {
        const followUp = await runLeaveSubmitFollowUp({
          request: requestItem,
          requester: employee,
          actorName: session.fullName || session.username,
          baseUrl,
          leaveType,
          leaveDays,
          title,
          lineManagerLabel,
          resolvedManager: resolvedManager?.employee || null,
          session,
        });
        const warningText = followUp.deliveryWarnings.length
          ? ` Notification issues: ${followUp.deliveryWarnings.join(' ')}`
          : '';
        return ok({
          request: requestItem,
          message: `Leave application submitted successfully. Reference ${requestItem.id}. Status: ${requestItem.status}.${followUp.deliveryWarnings.length ? '' : ' Your line manager has been notified to review the request.'}${warningText}`,
          deliveryWarnings: followUp.deliveryWarnings,
          deliveryTrace: followUp.deliveryTrace,
        });
      } catch (error) {
        console.error('[workforce-portal] leave submit follow-up failed', error);
        return err(500, error instanceof Error ? error.message : 'Leave was saved but workflow sync failed. Contact HR or retry.');
      }
    }
    return ok({ request: requestItem });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to submit ESS request.');
  }
}
