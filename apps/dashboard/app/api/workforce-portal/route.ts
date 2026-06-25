import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import { calculatePayrollEarnings, calculatePermanentUnionDues } from '@/lib/payroll-earnings-engine';
import { isNonPermanentPayrollEmployee } from '@/lib/payroll-employee-classification';
import { activeLoansVersion, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { hasLeaveAllowanceInYear } from '@/lib/payroll-leave-allowance-store';
import { annualLeaveEntitlementForEmployee, dormantLongPolicy, isFourteenDayPaidLeaveEmployee } from '@/lib/leave-management-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';
import { listEmployeeAccessiblePayrollPeriods } from '@/lib/payroll-run-store';
import { computeEnterpriseYtdTotals, readAuthoritativeSagePayslipSnapshotsByPeriod, readEnterpriseEmployeePayslipRecordsByPeriod } from '@/lib/payroll-ess-payslip-store';
import type { SageEmployeePayslipSnapshot } from '@/lib/sage-people-payroll-store';
import type { PayrollCalculationRecord } from '@/lib/payroll-calculation-service';
import { payslipIdentityMap, syncPayslipIdentitiesFromSage } from '@/lib/payroll-payslip-identity-store';
import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';

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

const ESS_CURRENT_PAYROLL_PERIOD = activePayrollPeriod();
const ESS_RESPONSE_CACHE_MS = Number(process.env.ESS_PORTAL_RESPONSE_CACHE_MS || 30000);
const essResponseCache = new Map<string, { expiresAt: number; payload: unknown }>();
const normalize = (value: unknown) => compact(value).toLowerCase();
const tokenFrom = (request: Request) => request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`))?.split('=').slice(1).join('=');
const getSession = (request: Request) => verifySessionToken(tokenFrom(request) ? decodeURIComponent(tokenFrom(request) || '') : '');
const employeeKeys = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) => [
  employee.employeeId,
  employee.employeeCode,
  employee.sourceEmployeeId,
  String(employee.employeeDbId || ''),
  employee.officialEmail,
  employee.email,
  employee.personalEmail,
].map(normalize).filter(Boolean);
const resolveEssEmployee = (employees: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'], session: SessionPayload) => {
  const identities = [session.employeeCode, session.employeeId, session.username].map(normalize).filter(Boolean);
  if (!identities.length) return null;
  return employees.find((employee) => identities.some((identity) => employeeKeys(employee).includes(identity))) || null;
};

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
    const cached = essResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return ok(cached.payload);
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

    const employeeRequests = allRequests.filter((item) => item.employeeId === employee.employeeId);
    const employeeLoans = loanApplications.filter((item) => item.employeeId === employee.employeeId);
    const loansVersion = activeLoansVersion(loansConfig);
    const taxVersion = activeTaxVersion(taxConfig);
    const pensionVersion = activePensionVersion(pensionConfig);
    const employeeAny = employee as any;
    let leaveContext = { annualEntitlement: 0, leaveUsed: 0, leaveBalance: 0, carryForward: 0 };
    let enterpriseRecordsByPeriod = new Map<string, PayrollCalculationRecord>();
    let sagePayslipsByPeriod = new Map<string, SageEmployeePayslipSnapshot>();
    let releasedPayrollPeriods: string[] = [];
    const payrollForPeriod = (period: string, includeAdjustments = false, enterpriseRecord?: PayrollCalculationRecord | null, sageSnapshot?: SageEmployeePayslipSnapshot | null) => {
      const nonPermanentPayroll = essNonPermanentPayrollEmployee(employee);
      const payslipType = nonPermanentPayroll ? 'non-permanent' : 'permanent';
      const sharedEmployeeInfo = {
        employeeCode: employee.employeeCode || employee.employeeId,
        employeeName: employee.fullName,
        employeeCategory: essEmployeeCategory(employee),
        department: employee.department || 'Unassigned',
        unit: employee.businessUnit || employee.division || 'DLE',
        designation: employee.jobTitle || employee.designation || 'Employee',
        gradeLevel: employee.salaryGrade || employee.jobGrade || 'Unassigned',
        employmentType: employee.employmentType || 'Permanent',
        dateOfEmployment: employee.dateJoined || employee.contractStartDate || '',
        employeeStatus: employee.status || 'Active',
        address: employeeAddress(employee),
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

      if (sageSnapshot && sageSnapshot.grossPay > 0) {
        const earningsLines = mapSageEarningLines(sageSnapshot);
        const deductionLines = mapSageDeductionLines(sageSnapshot);
        const employerContributionLines = mapSageEmployerContributionLines(sageSnapshot);
        const totalEmployerContributions = roundMoney(sageSnapshot.employerContributions);
        return {
          period,
          periodLabel: periodTitle(period),
          payPeriodStart: periodStartDate(period),
          payPeriodEnd: monthEndDate(period),
          payDate: monthEndDate(period),
          payrollNumber: `DLE-${period.replace('-', '')}-${employee.employeeId}`,
          payeReference: payslipIdentity?.taxIdentificationNumber || employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
          grossPay: roundMoney(sageSnapshot.grossPay),
          allowances: roundMoney(Math.max(0, sageSnapshot.grossPay - sageSnapshot.taxablePay)),
          pensionEmployee: roundMoney(sageSnapshot.pensionEmployee),
          deductions: roundMoney(sageSnapshot.totalDeductions),
          netPay: roundMoney(sageSnapshot.netPay),
          status: 'Released',
          dataSource: 'sage',
          payslipType,
          earnings: earningsLines,
          deductionLines,
          employerContributionLines,
          totalEmployerContributions,
          employeeInfo: sharedEmployeeInfo,
          statutoryInfo: sharedStatutoryInfo,
          leaveInfo: sharedLeaveInfo,
          ytd: {
            grossEarnings: roundMoney(sageSnapshot.ytdGrossEarnings),
            taxPaid: roundMoney(sageSnapshot.ytdTaxPaid),
            pensionContribution: roundMoney(sageSnapshot.ytdPensionContribution),
            deductions: roundMoney(sageSnapshot.ytdDeductions),
            netEarnings: roundMoney(sageSnapshot.ytdNetEarnings),
          },
          verification: {
            qrCode: `DLE|${employee.employeeId}|${period}|${roundMoney(sageSnapshot.netPay)}`,
            generatedAt: new Date().toISOString(),
            approvalStatus: 'Payroll Released',
          },
        };
      }

      if (enterpriseRecord && enterpriseRecord.grossPay > 0) {
        const earningsLines = mapEnterpriseEarningLines(enterpriseRecord);
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

      const earnings = calculatePayrollEarnings(employee, { period, includePeriodAdjustments: includeAdjustments });
      const taxInput = {
        ...payrollInputFromEmployee(employee, { period, includePeriodAdjustments: includeAdjustments }),
        monthlyGrossPay: earnings.grossPay,
        monthlyTaxablePay: earnings.taxablePay,
      };
      const tax = taxVersion ? calculatePayrollTax(taxInput, taxVersion) : null;
      const pension = !nonPermanentPayroll && pensionVersion ? calculatePension(pensionInputFromEmployee(employee, { period, includePeriodAdjustments: includeAdjustments }), pensionVersion) : null;
      const paye = roundMoney(tax?.monthlyPaye ?? 0);
      const pensionEmployee = roundMoney(pension?.employeeContribution ?? 0);
      const nhf = roundMoney((tax?.statutoryItems.find((item) => item.id === 'nhf')?.amount || 0) / 12);
      const unionDues = roundMoney((tax?.statutoryItems.find((item) => item.id === 'union-dues')?.amount || 0) / 12);
      const unionRule = calculatePermanentUnionDues(employee);
      const otherStatutory = roundMoney((tax?.statutoryItems.find((item) => item.id === 'other-statutory')?.amount || 0) / 12);
      const deductions = roundMoney(paye + pensionEmployee + nhf + unionDues + otherStatutory);
      const employerPension = roundMoney(pension?.employerContribution || 0);
      const nsitf = roundMoney(earnings.grossPay * 0.01);
      const itf = roundMoney(earnings.grossPay * 0.01);
      const totalEmployerContributions = roundMoney(employerPension + nsitf + itf);
      const monthNumber = Number(period.slice(5, 7)) || 1;
      return {
        period,
        periodLabel: periodTitle(period),
        payPeriodStart: periodStartDate(period),
        payPeriodEnd: monthEndDate(period),
        payDate: monthEndDate(period),
        payrollNumber: `DLE-${period.replace('-', '')}-${employee.employeeId}`,
        payeReference: payslipIdentity?.taxIdentificationNumber || employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
        grossPay: earnings.grossPay,
        allowances: earnings.allowances,
        pensionEmployee,
        deductions,
        netPay: roundMoney(Math.max(0, earnings.grossPay - deductions)),
        status: 'Released',
        dataSource: 'calculated',
        payslipType,
        earnings: earnings.paidEarningLines.map((line) => ({ code: line.code, label: line.name, units: line.amount > 0 ? 1 : 0, amount: line.amount, taxable: line.taxable })),
        deductionLines: [
          { code: 'PAYE', label: 'PAYE Tax', units: paye > 0 ? 1 : 0, amount: paye },
          { code: 'PENSION_EMPLOYEE', label: 'Pension Employee Contribution', units: pensionEmployee > 0 ? 1 : 0, amount: pensionEmployee },
          { code: 'NHF', label: 'NHF', units: nhf > 0 ? 1 : 0, amount: nhf },
          { code: unionRule.code, label: unionRule.name, units: unionDues > 0 ? 1 : 0, amount: unionDues },
          { code: 'OTHER_DEDUCTIONS', label: 'Other Deductions', units: otherStatutory > 0 ? 1 : 0, amount: otherStatutory },
        ].filter((line) => line.amount > 0),
        employerContributionLines: [
          { code: 'PENSION_EMPLOYER', label: 'Pension Employer Contribution', units: employerPension > 0 ? 1 : 0, amount: employerPension },
          { code: 'NSITF', label: 'NSITF - Nigeria Social Insurance Trust Fund', units: nsitf > 0 ? 1 : 0, amount: nsitf },
          { code: 'ITF', label: 'ITF Levy', units: itf > 0 ? 1 : 0, amount: itf },
          { code: 'GROUP_LIFE', label: 'Group Life Insurance', units: 0, amount: 0 },
          { code: 'OTHER_EMPLOYER', label: 'Other Employer Contributions', units: 0, amount: 0 },
        ].filter((line) => Math.abs(Number(line.amount || 0)) > 0.004),
        totalEmployerContributions,
        employeeInfo: sharedEmployeeInfo,
        statutoryInfo: sharedStatutoryInfo,
        leaveInfo: sharedLeaveInfo,
        ytd: {
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
    const attendanceRate = round(92 + (employee.employeeDbId % 70) / 10);
    const requests = employeeRequests;

    const fourteenDayPaidLeaveEmployee = isFourteenDayPaidLeaveEmployee(employee);
    const confirmedPermanent = String(employee.status || '').toLowerCase().includes('confirmed') || (employee.confirmationDueDate ? new Date(`${employee.confirmationDueDate}T00:00:00.000Z`).getTime() <= Date.now() : false);
    const leaveYear = new Date().getFullYear();
    const annualEntitlement = annualLeaveEntitlementForEmployee(employee);
    const employeeLeaveApplications = employeeRequests
      .filter((item) => item.category === 'Leave' && item.startDate && item.endDate)
      .map((item) => {
        const status = item.status === 'Line Manager Review' || item.status === 'HR Review' || item.status === 'Submitted' ? 'Under Review' : item.status;
        const stage = item.status === 'HR Review' ? 'HR' : item.status === 'Line Manager Review' ? 'Supervisor' : item.status === 'Approved' ? 'Closed' : 'Employee';
        return {
          id: item.id,
          employeeId: item.employeeId,
          fullName: employee.fullName,
          department: employee.department,
          managerName: managerOwnerFor(employee),
          leaveType: item.leaveType || 'Annual Leave',
          startDate: item.startDate || '',
          endDate: item.endDate || '',
          days: Number(item.days || 0),
          status,
          stage,
          actingOfficer: item.relieverName || 'Not configured',
          supportingDocuments: 0,
          exceptions: item.status === 'Terminated' ? ['Approval validity expired after 5 working days'] : [],
          approvalStatus: item.status === 'Approved' ? 'Approved' : item.status === 'Rejected' ? 'Rejected' : item.status === 'Terminated' ? 'Terminated' : 'Pending',
        };
      });
    const annualLeaveApplications = employeeLeaveApplications.filter((item) => item.leaveType === 'Annual Leave');
    const leaveUsed = annualLeaveApplications.filter((item) => ['Approved', 'Completed'].includes(item.status)).reduce((sum, item) => sum + Number(item.days || 0), 0);
    const pendingAnnualLeave = annualLeaveApplications.filter((item) => ['Submitted', 'Under Review'].includes(item.status)).reduce((sum, item) => sum + Number(item.days || 0), 0);
    const carryForward = 0;
    const annualBalance = Math.max(0, annualEntitlement - leaveUsed - pendingAnnualLeave);
    leaveContext = { annualEntitlement, leaveUsed, leaveBalance: annualBalance, carryForward };
    releasedPayrollPeriods = await listEmployeeAccessiblePayrollPeriods();
    const employeeMatchKeys = [employee.employeeId, employee.employeeCode, employee.sourceEmployeeId];
    [enterpriseRecordsByPeriod, sagePayslipsByPeriod] = await Promise.all([
      readEnterpriseEmployeePayslipRecordsByPeriod(employeeMatchKeys, releasedPayrollPeriods).catch(() => new Map()),
      readAuthoritativeSagePayslipSnapshotsByPeriod(employeeMatchKeys, releasedPayrollPeriods).catch(() => new Map()),
    ]);
    const payrollHistory = releasedPayrollPeriods.map((period) => payrollForPeriod(
      period,
      true,
      enterpriseRecordsByPeriod.get(period),
      sagePayslipsByPeriod.get(period),
    ));
    const latestReleasedPayroll = payrollHistory[0] || null;
    const currentPeriodReleased = releasedPayrollPeriods.includes(ESS_CURRENT_PAYROLL_PERIOD);
    const sickUsed = employee.employeeDbId % 3;
    const casualUsed = employee.employeeDbId % 2;
    const compassionateUsed = employee.employeeDbId % 2;
    const examUsed = employee.employeeDbId % 2;
    const maternityEligible = !fourteenDayPaidLeaveEmployee && /female/i.test(String((employee as any).gender || (employee as any).title || ''));
    const leavePolicyCards = [
      { id: 'annual-leave', type: 'Annual Leave', entitlement: annualEntitlement, basis: 'Working days', used: leaveUsed, pending: pendingAnnualLeave, balance: annualBalance, expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Eligible - 14 paid working days annual entitlement' : annualEntitlement === dormantLongPolicy.annualJuniorPermanentDays ? 'Eligible - junior permanent employee' : confirmedPermanent ? 'Eligible - confirmed permanent employee' : 'Locked pending confirmation', allowanceStatus: `Eligible only from ${dormantLongPolicy.allowanceMinimumAnnualDays} current-year Annual Leave working days`, policyNote: fourteenDayPaidLeaveEmployee ? 'Contract, lumpsum, NYSC, IT, and daily-rate employees receive 14 paid working days annually.' : annualEntitlement === dormantLongPolicy.annualJuniorPermanentDays ? 'Junior permanent employees receive 25 working days annually.' : 'Confirmed permanent employees receive 30 working days annually.' },
      { id: 'sick-leave', type: 'Sick Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 10, basis: 'Working days', used: sickUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 10) - sickUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Medical certificate may be required.' },
      { id: 'casual-leave', type: 'Casual Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 5, basis: 'Working days', used: casualUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 5) - casualUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Short-duration absence subject to manager approval.' },
      { id: 'compassionate-leave', type: 'Compassionate Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 5, basis: 'Working days', used: compassionateUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 5) - compassionateUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Supporting document required where applicable.' },
      { id: 'exam-leave', type: 'Exam Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 5, basis: 'Working days', used: examUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 5) - examUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Exam timetable or institution evidence required.' },
      { id: 'maternity-leave', type: 'Maternity Leave', entitlement: maternityEligible ? 90 : 0, basis: 'Calendar days', used: 0, pending: 0, balance: maternityEligible ? 90 : 0, expiryDate: '', eligibilityStatus: maternityEligible ? 'Eligible' : 'Gender/category eligibility not met', allowanceStatus: 'No leave allowance', policyNote: '90 calendar days for eligible female employees.' },
      { id: 'carry-forward-leave', type: 'Carry Forward Leave', entitlement: carryForward, basis: 'Working days', used: Math.min(carryForward, employee.employeeDbId % 3), pending: 0, balance: Math.max(0, carryForward - Math.min(carryForward, employee.employeeDbId % 3)), expiryDate: `${leaveYear}-03-31`, eligibilityStatus: carryForward ? 'Available until 31 March' : 'No carry-forward balance', allowanceStatus: 'Does not trigger leave allowance', policyNote: 'Unused Annual Leave rolls over on 1 January up to 7 working days.' },
    ];
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
        location: employee.location || employee.workLocation,
        manager: employee.hasManagerAssigned ? 'Assigned manager' : 'Manager assignment pending',
        email: employee.officialEmail || employee.email || employee.personalEmail || `${employee.employeeId.toLowerCase()}@dormanlongeng.com`,
        phone: employee.primaryPhone || employee.phone,
        photoUrl: linkedEmployeePhotoUrl(employee) || '',
        hasPhoto: employee?.hasPhoto === true,
        status: currentLeaveNow ? 'On Leave' : employee.status || 'Active',
        yearsOfService: round(Number(employee.yearsOfService || 0)),
        payrollGroup: employee.payrollGroup || 'Monthly Payroll',
        salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
      },
      widgets: {
        leave: { entitlement: annualEntitlement, used: leaveUsed, balance: annualBalance, pending: requests.filter((item) => item.category === 'Leave' && !['Approved', 'Rejected', 'Terminated', 'Closed'].includes(item.status)).length },
        attendance: { monthRate: attendanceRate, lateArrivals: employee.employeeDbId % 3, overtimeHours: (employee.employeeDbId % 6) * 2, remoteDays: employee.remoteWorker ? 4 : 0 },
        payroll: {
          monthlyPay: latestReleasedPayroll?.grossPay || 0,
          currency: employee.payCurrency || 'NGN',
          payslips: payrollHistory.length,
          deductions: latestReleasedPayroll?.deductions || 0,
          pension: latestReleasedPayroll?.pensionEmployee || latestReleasedPayroll?.deductionLines?.find((line) => line.code === 'PENSION_EMPLOYEE')?.amount || 0,
          allowances: latestReleasedPayroll?.allowances || 0,
        },
        requests: { pending: requests.filter((item) => !['Approved', 'Rejected', 'Closed'].includes(item.status)).length, approved: requests.filter((item) => item.status === 'Approved').length, total: requests.length },
        loans: { applications: employeeLoans.length, outstanding: employeeLoans.reduce((sum, item) => sum + Number(item.outstandingBalance || 0), 0) },
      },
      announcements: [
        ...(currentPeriodReleased ? [{ id: 'ann-001', title: `${periodTitle(ESS_CURRENT_PAYROLL_PERIOD)} payslip is now available`, channel: 'Payroll', publishedAt: dateAdd(-1), priority: 'High' }] : []),
        { id: 'ann-002', title: 'Updated HSE handbook published', channel: 'Policy', publishedAt: dateAdd(-5), priority: 'Normal' },
        { id: 'ann-003', title: 'Q3 learning calendar available', channel: 'Learning', publishedAt: dateAdd(-8), priority: 'Normal' },
      ],
      notifications: [
        { id: 'ntf-001', title: 'Leave request awaiting line manager review', type: 'Workflow', status: 'Unread', createdAt: dateAdd(-1) },
        { id: 'ntf-002', title: 'Employee handbook acknowledgement due', type: 'Document', status: 'Unread', createdAt: dateAdd(-2) },
        ...(latestReleasedPayroll ? [{ id: 'ntf-003', title: `${latestReleasedPayroll.periodLabel || periodTitle(latestReleasedPayroll.period)} payslip is ready for download`, type: 'Payroll', status: 'Read', createdAt: dateAdd(-4) }] : []),
      ],
      birthdays: [
        { id: 'bd-001', fullName: 'Olamide Badetan', department: 'Human Resources', date: sampleDate(3) },
        { id: 'bd-002', fullName: 'Adebayo Aina', department: 'Engineering', date: sampleDate(8) },
      ],
      anniversaries: [
        { id: 'wa-001', fullName: employee.fullName, years: Math.max(1, Math.round(Number(employee.yearsOfService || 1))), date: sampleDate(7) },
        { id: 'wa-002', fullName: 'Chris Ijeli', years: 12, date: sampleDate(15) },
      ],
      events: [
        { id: 'evt-001', label: 'Timesheet cut-off', date: dateAdd(2), type: 'Payroll' },
        { id: 'evt-002', label: 'Team safety briefing', date: dateAdd(4), type: 'HSE' },
        { id: 'evt-003', label: 'Work anniversary', date: dateAdd(7), type: 'Anniversary' },
      ],
      documents: [
        { id: 'doc-001', title: 'Employment Letter', category: 'Letters', version: 'v2.0', status: 'Current' },
        { id: 'doc-004', title: 'Confirmation Letter', category: 'Letters', version: 'v1.0', status: 'Current' },
        { id: 'doc-005', title: 'Promotion Letter', category: 'Letters', version: 'v1.2', status: 'Current' },
        { id: 'doc-006', title: 'Transfer Letter', category: 'Letters', version: 'v1.1', status: 'Archived' },
        { id: 'doc-007', title: 'Disciplinary Notice', category: 'Notices', version: 'v1.0', status: 'Restricted' },
        { id: 'doc-002', title: 'Employee Handbook', category: 'Policies', version: 'v6.1', status: 'Acknowledgement Due' },
        { id: 'doc-003', title: 'HSE Training Certificate', category: 'Certificates', version: 'v1.0', status: 'Current' },
      ],
      profileSections: [
        { id: 'personal', label: 'Personal Information', status: 'View / update', approvalRequired: true, fields: ['Title', 'Names', 'Date of birth', 'Marital status', 'Nationality'] },
        { id: 'contact', label: 'Contact Details', status: 'View / update', approvalRequired: true, fields: ['Email', 'Phone', 'Office extension'] },
        { id: 'address', label: 'Addresses', status: 'View / update', approvalRequired: true, fields: ['Residential address', 'Permanent address', 'City', 'State', 'Country'] },
        { id: 'emergency', label: 'Emergency Contacts', status: 'View / update', approvalRequired: true, fields: ['Primary contact', 'Relationship', 'Phone', 'Address'] },
        { id: 'next-of-kin', label: 'Next of Kin', status: 'View / update', approvalRequired: true, fields: ['Name', 'Relationship', 'Phone', 'Address'] },
        { id: 'bank', label: 'Bank Details', status: 'Masked / encrypted', approvalRequired: true, fields: ['Bank', 'Account number', 'Account name', 'BVN token'] },
        { id: 'photo', label: 'Profile Photo', status: 'Upload / replace', approvalRequired: true, fields: ['Image file', 'Capture date'] },
        { id: 'qualifications', label: 'Qualifications', status: 'Document-backed', approvalRequired: true, fields: ['Institution', 'Qualification', 'Year', 'Attachment'] },
        { id: 'certifications', label: 'Certifications', status: 'Document-backed', approvalRequired: true, fields: ['Certificate', 'Issuer', 'Expiry', 'Attachment'] },
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
        records: [
          { date: sampleDate(0), clockIn: '08:04', clockOut: '17:22', status: 'Present', source: 'Biometric' },
          { date: sampleDate(-1), clockIn: '08:18', clockOut: '17:10', status: 'Late', source: 'Mobile' },
          { date: sampleDate(-2), clockIn: 'Remote', clockOut: 'Remote', status: 'Remote Work', source: 'ESS' },
        ],
        shifts: [
          { id: 'shift-001', name: 'Day Shift', start: '08:00', end: '17:00', location: employee.location || 'Lagos HQ' },
          { id: 'shift-002', name: 'Weekend Standby', start: '09:00', end: '13:00', location: 'Remote' },
        ],
        timesheets: [
          { id: 'ts-001', week: 'Current Week', hours: 40, overtime: 4, status: 'Submitted' },
          { id: 'ts-002', week: 'Previous Week', hours: 42, overtime: 2, status: 'Approved' },
        ],
      },
      payrollHistory,
      payrollAccess: {
        currentPeriod: ESS_CURRENT_PAYROLL_PERIOD,
        currentPeriodReleased,
        releasedPeriodCount: payrollHistory.length,
        message: currentPeriodReleased
          ? ''
          : `Your ${periodTitle(ESS_CURRENT_PAYROLL_PERIOD)} payslip will appear here after payroll is approved and released by HR/Payroll.`,
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
    essResponseCache.set(cacheKey, { expiresAt: Date.now() + ESS_RESPONSE_CACHE_MS, payload });
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
      essResponseCache.clear();
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
            body: `You have been assigned as reliever for ${employee.fullName}: ${found.title}.`,
            severity: 'info',
          });
        }
      }
      return ok({ request: nextRequests.find((item) => item.id === requestId) });
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
    essResponseCache.clear();
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
