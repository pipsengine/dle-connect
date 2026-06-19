import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { AUTH_COOKIE, verifySessionToken, type SessionPayload } from '@/lib/auth/session';
import { calculatePayrollEarnings, calculatePermanentUnionDues } from '@/lib/payroll-earnings-engine';
import { activeLoansVersion, readPayrollLoanApplications, readPayrollLoansConfig } from '@/lib/payroll-loans-engine';
import { activeTaxVersion, calculatePayrollTax, payrollInputFromEmployee, readPayrollTaxConfig } from '@/lib/payroll-tax-engine';
import { activePensionVersion, calculatePension, pensionInputFromEmployee, readPayrollPensionConfig } from '@/lib/payroll-pension-engine';
import { hasLeaveAllowanceInYear, syncSageLeaveAllowanceEvents } from '@/lib/payroll-leave-allowance-store';
import { annualLeaveEntitlementForEmployee, dormantLongPolicy, isFourteenDayPaidLeaveEmployee } from '@/lib/leave-management-store';
import { activePayrollPeriod } from '@/lib/payroll-periods';

type EssRequest = {
  id: string;
  employeeId: string;
  category: string;
  title: string;
  status: 'Draft' | 'Submitted' | 'Line Manager Review' | 'HR Review' | 'Finance Review' | 'Approved' | 'Rejected' | 'Closed';
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
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const compact = (value: unknown) => String(value || '').trim();
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
const employeeAddress = (employee: Awaited<ReturnType<typeof readPayrollEmployees>>['employees'][number]) => {
  const street = compact(employee.residentialAddress) || compact(employee.permanentAddress);
  const parts = [street, employee.city, employee.state, employee.country].map(compact).filter(Boolean);
  return parts.join(', ') || 'Not configured';
};

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
    const [employeeSource, allRequests, loanApplications, loansConfig, taxConfig, pensionConfig] = await Promise.all([readPayrollEmployees(), readRequests(), readPayrollLoanApplications(), readPayrollLoansConfig(), readPayrollTaxConfig(), readPayrollPensionConfig()]);
    const employee = resolveEssEmployee(employeeSource.employees, session);
    if (!employee) return err(403, 'Employee identity is not linked to the logged-in account.');
    await syncSageLeaveAllowanceEvents();

    const employeeRequests = allRequests.filter((item) => item.employeeId === employee.employeeId);
    const employeeLoans = loanApplications.filter((item) => item.employeeId === employee.employeeId);
    const loansVersion = activeLoansVersion(loansConfig);
    const taxVersion = activeTaxVersion(taxConfig);
    const pensionVersion = activePensionVersion(pensionConfig);
    const employeeAny = employee as any;
    let leaveContext = { annualEntitlement: 0, leaveUsed: 0, leaveBalance: 0, carryForward: 0 };
    const payrollForPeriod = (period: string, includeAdjustments = false) => {
      const earnings = calculatePayrollEarnings(employee, { period, includePeriodAdjustments: includeAdjustments });
      const taxInput = {
        ...payrollInputFromEmployee(employee, { period, includePeriodAdjustments: includeAdjustments }),
        monthlyGrossPay: earnings.grossPay,
        monthlyTaxablePay: earnings.taxablePay,
      };
      const tax = taxVersion ? calculatePayrollTax(taxInput, taxVersion) : null;
      const pension = pensionVersion ? calculatePension(pensionInputFromEmployee(employee, { period, includePeriodAdjustments: includeAdjustments }), pensionVersion) : null;
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
        payeReference: employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
        grossPay: earnings.grossPay,
        deductions,
        netPay: roundMoney(Math.max(0, earnings.grossPay - deductions)),
        status: period === '2026-05' ? 'Downloaded' : 'Available',
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
        ],
        totalEmployerContributions,
        employeeInfo: {
          employeeCode: employee.employeeCode || employee.employeeId,
          employeeName: employee.fullName,
          employeeCategory: employee.employeeCategory || employee.staffCategory || employee.employmentType || 'Permanent',
          department: employee.department || 'Unassigned',
          unit: employee.businessUnit || employee.division || 'DLE',
          designation: employee.jobTitle || employee.designation || 'Employee',
          gradeLevel: employee.salaryGrade || employee.jobGrade || 'Unassigned',
          employmentType: employee.employmentType || 'Permanent',
          dateOfEmployment: employee.dateJoined || employee.contractStartDate || '',
          employeeStatus: employee.status || 'Active',
          address: employeeAddress(employee),
        },
        statutoryInfo: {
          bankName: employeeAny.bankName || 'Stanbic IBTC',
          accountNumber: maskAccount(employeeAny.accountNo || employeeAny.accountNumber),
          pensionFundAdministrator: configured(employeeAny.pensionProvider),
          pensionNumber: configured(employeeAny.pensionPin),
          nhfNumber: employeeAny.nhfNumber || 'Not applicable',
          taxNumber: employeeAny.taxIdentificationNumber || employeeAny.taxNo || 'Not configured',
          nhiaNumber: employeeAny.nhiaNumber || 'Not applicable',
        },
        leaveInfo: {
          annualLeaveEntitlement: leaveContext.annualEntitlement,
          leaveTaken: leaveContext.leaveUsed,
          leaveBalance: leaveContext.leaveBalance,
          carryForwardLeave: leaveContext.carryForward,
        },
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
          approvalStatus: 'Payroll Approved',
        },
      };
    };
    const leaveUsed = employee.employeeId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 9;
    const attendanceRate = round(92 + (employee.employeeDbId % 70) / 10);

    const seededRequests: EssRequest[] = [
      {
        id: 'seed-leave-001',
        employeeId: employee.employeeId,
        category: 'Leave',
        title: 'Annual leave request',
        status: 'Line Manager Review',
        priority: 'Normal',
        submittedAt: dateAdd(-3),
        updatedAt: dateAdd(-1),
        approvers: ['Line Manager', 'HR Operations'],
        comments: [{ at: dateAdd(-2), actor: 'System', comment: 'Request routed to line manager.' }],
      },
      {
        id: 'seed-document-001',
        employeeId: employee.employeeId,
        category: 'Documents',
        title: 'Employment confirmation letter',
        status: 'Approved',
        priority: 'Low',
        submittedAt: dateAdd(-12),
        updatedAt: dateAdd(-9),
        approvers: ['HR Operations'],
        comments: [{ at: dateAdd(-9), actor: 'HR Operations', comment: 'Document is available in employee documents.' }],
      },
    ];

    const requests = employeeRequests.length ? employeeRequests : seededRequests;

    const fourteenDayPaidLeaveEmployee = isFourteenDayPaidLeaveEmployee(employee);
    const confirmedPermanent = String(employee.status || '').toLowerCase().includes('confirmed') || (employee.confirmationDueDate ? new Date(`${employee.confirmationDueDate}T00:00:00.000Z`).getTime() <= Date.now() : false);
    const leaveYear = new Date().getFullYear();
    const annualEntitlement = annualLeaveEntitlementForEmployee(employee);
    const carryForward = Math.min(7, employee.employeeDbId % 8);
    leaveContext = { annualEntitlement, leaveUsed, leaveBalance: Math.max(0, annualEntitlement - leaveUsed), carryForward };
    const currentPayroll = payrollForPeriod(ESS_CURRENT_PAYROLL_PERIOD);
    const aprilPayroll = payrollForPeriod('2026-04');
    const mayPayroll = payrollForPeriod('2026-05', true);
    const monthlyPay = currentPayroll.grossPay;
    const sickUsed = employee.employeeDbId % 3;
    const casualUsed = employee.employeeDbId % 2;
    const compassionateUsed = employee.employeeDbId % 2;
    const examUsed = employee.employeeDbId % 2;
    const maternityEligible = !fourteenDayPaidLeaveEmployee && /female/i.test(String((employee as any).gender || (employee as any).title || ''));
    const leavePolicyCards = [
      { id: 'annual-leave', type: 'Annual Leave', entitlement: annualEntitlement, basis: 'Working days', used: leaveUsed, pending: 0, balance: Math.max(0, annualEntitlement - leaveUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Eligible - 14 paid working days annual entitlement' : confirmedPermanent ? 'Eligible - confirmed permanent employee' : 'Locked pending confirmation', allowanceStatus: `Eligible only from ${dormantLongPolicy.allowanceMinimumAnnualDays} current-year Annual Leave working days`, policyNote: fourteenDayPaidLeaveEmployee ? 'Contract, lumpsum, NYSC, and IT employees receive 14 paid working days annually.' : 'Permanent employees receive 30 working days after confirmation.' },
      { id: 'sick-leave', type: 'Sick Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 10, basis: 'Working days', used: sickUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 10) - sickUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Medical certificate may be required.' },
      { id: 'casual-leave', type: 'Casual Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 5, basis: 'Working days', used: casualUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 5) - casualUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Short-duration absence subject to manager approval.' },
      { id: 'compassionate-leave', type: 'Compassionate Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 5, basis: 'Working days', used: compassionateUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 5) - compassionateUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Supporting document required where applicable.' },
      { id: 'exam-leave', type: 'Exam Leave', entitlement: fourteenDayPaidLeaveEmployee ? 0 : 5, basis: 'Working days', used: examUsed, pending: 0, balance: Math.max(0, (fourteenDayPaidLeaveEmployee ? 0 : 5) - examUsed), expiryDate: '', eligibilityStatus: fourteenDayPaidLeaveEmployee ? 'Not configured for this employee category' : 'Eligible', allowanceStatus: 'No leave allowance', policyNote: 'Exam timetable or institution evidence required.' },
      { id: 'maternity-leave', type: 'Maternity Leave', entitlement: maternityEligible ? 90 : 0, basis: 'Calendar days', used: 0, pending: 0, balance: maternityEligible ? 90 : 0, expiryDate: '', eligibilityStatus: maternityEligible ? 'Eligible' : 'Gender/category eligibility not met', allowanceStatus: 'No leave allowance', policyNote: '90 calendar days for eligible female employees.' },
      { id: 'carry-forward-leave', type: 'Carry Forward Leave', entitlement: carryForward, basis: 'Working days', used: Math.min(carryForward, employee.employeeDbId % 3), pending: 0, balance: Math.max(0, carryForward - Math.min(carryForward, employee.employeeDbId % 3)), expiryDate: `${leaveYear}-03-31`, eligibilityStatus: carryForward ? 'Available until 31 March' : 'No carry-forward balance', allowanceStatus: 'Does not trigger leave allowance', policyNote: 'Unused Annual Leave rolls over on 1 January up to 7 working days.' },
    ];
    const currentYearAllowanceAlreadyPaid = await hasLeaveAllowanceInYear(employee, leaveYear);
    const allowanceEligible = annualEntitlement - leaveUsed >= 10 && !currentYearAllowanceAlreadyPaid;
    const leaveWorkflow = [
      { stage: 'Employee', owner: employee.fullName, status: 'Submitted', sla: 'Immediate' },
      { stage: 'Supervisor/Line Manager', owner: employee.managerName || 'Line Manager', status: 'Pending', sla: '2 business days' },
      { stage: 'Department Manager / GM', owner: 'Department approver', status: 'Not started', sla: '2 business days' },
      { stage: 'HR', owner: 'HR Officer', status: 'Not started', sla: '1 business day' },
      { stage: 'Payroll', owner: 'Payroll Officer', status: allowanceEligible ? 'Conditional' : 'Skipped unless allowance/unpaid leave applies', sla: '1 payroll cycle' },
      { stage: 'Completed', owner: 'System', status: 'Not started', sla: 'After all approvals' },
    ];

    return ok({
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
        photoUrl: '/brand/dorman-long-logo.jpg',
        yearsOfService: round(Number(employee.yearsOfService || 0)),
        payrollGroup: employee.payrollGroup || 'Monthly Payroll',
        salaryGrade: employee.salaryGrade || employee.jobGrade || 'Unassigned',
      },
      widgets: {
        leave: { entitlement: annualEntitlement, used: leaveUsed, balance: Math.max(0, annualEntitlement - leaveUsed), pending: requests.filter((item) => item.category === 'Leave' && !['Approved', 'Rejected', 'Closed'].includes(item.status)).length },
        attendance: { monthRate: attendanceRate, lateArrivals: employee.employeeDbId % 3, overtimeHours: (employee.employeeDbId % 6) * 2, remoteDays: employee.remoteWorker ? 4 : 0 },
        payroll: { monthlyPay, currency: employee.payCurrency || 'NGN', payslips: 12, deductions: currentPayroll.deductions, pension: currentPayroll.deductionLines.find((line) => line.code === 'PENSION_EMPLOYEE')?.amount || 0, allowances: calculatePayrollEarnings(employee).allowances },
        requests: { pending: requests.filter((item) => !['Approved', 'Rejected', 'Closed'].includes(item.status)).length, approved: requests.filter((item) => item.status === 'Approved').length, total: requests.length },
        loans: { applications: employeeLoans.length, outstanding: employeeLoans.reduce((sum, item) => sum + Number(item.outstandingBalance || 0), 0) },
      },
      announcements: [
        { id: 'ann-001', title: 'May payroll window is open', channel: 'Payroll', publishedAt: dateAdd(-1), priority: 'High' },
        { id: 'ann-002', title: 'Updated HSE handbook published', channel: 'Policy', publishedAt: dateAdd(-5), priority: 'Normal' },
        { id: 'ann-003', title: 'Q3 learning calendar available', channel: 'Learning', publishedAt: dateAdd(-8), priority: 'Normal' },
      ],
      notifications: [
        { id: 'ntf-001', title: 'Leave request awaiting line manager review', type: 'Workflow', status: 'Unread', createdAt: dateAdd(-1) },
        { id: 'ntf-002', title: 'Employee handbook acknowledgement due', type: 'Document', status: 'Unread', createdAt: dateAdd(-2) },
        { id: 'ntf-003', title: 'May payslip is ready for download', type: 'Payroll', status: 'Read', createdAt: dateAdd(-4) },
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
        calendar: [
          { id: 'lv-cal-001', label: 'My approved annual leave', from: sampleDate(10), to: sampleDate(14), status: 'Approved', type: 'Annual Leave', scope: 'My leave schedule' },
          { id: 'lv-cal-002', label: 'Team leave blackout', from: sampleDate(20), to: sampleDate(24), status: 'Blackout', type: 'Policy', scope: employee.department || 'Department' },
          { id: 'lv-cal-003', label: 'Carry forward expiry', from: `${leaveYear}-03-31`, to: `${leaveYear}-03-31`, status: 'Reminder', type: 'Carry Forward Leave', scope: 'ESS notification' },
          { id: 'lv-cal-004', label: 'Public holiday', from: `${leaveYear}-10-01`, to: `${leaveYear}-10-01`, status: 'Holiday', type: 'Public Holiday', scope: 'Nigeria' },
        ],
        history: [
          { id: 'lv-his-001', type: 'Annual Leave', from: sampleDate(-40), to: sampleDate(-35), days: 5, year: leaveYear, status: 'Completed', approvalStage: 'Completed', approvers: 'Supervisor, HR', reliever: 'Assigned colleague', payrollImpact: 'None', allowanceStatus: 'Not eligible below 10 days', attachments: 'None', comments: 'Completed', auditTrail: 'Submitted -> Approved -> Completed' },
          { id: 'lv-his-002', type: 'Sick Leave', from: sampleDate(-12), to: sampleDate(-12), days: 1, year: leaveYear, status: 'Completed', approvalStage: 'Completed', approvers: 'Supervisor, HR', reliever: 'Not required', payrollImpact: 'None', allowanceStatus: 'Not applicable', attachments: 'Medical certificate', comments: 'Approved', auditTrail: 'Submitted -> HR approved' },
        ],
        workflows: leaveWorkflow,
        allowance: [
          { label: 'Leave Allowance Status', value: currentYearAllowanceAlreadyPaid ? `Already paid/approved for ${leaveYear}` : allowanceEligible ? `Eligible when applying for ${dormantLongPolicy.allowanceMinimumAnnualDays}+ current-year Annual Leave working days` : 'Not currently eligible', status: allowanceEligible ? 'Ready' : 'Review' },
          { label: 'Payroll Integration', value: 'Payroll is notified after eligible Annual Leave approval', status: 'Enabled' },
          { label: 'Carry Forward Rule', value: 'Carry Forward Leave does not trigger allowance', status: 'Enforced' },
        ],
        approvals: [
          { id: 'app-001', employee: 'Team member', type: 'Annual Leave', days: 10, stage: 'Supervisor/Line Manager', status: 'Pending', reliever: employee.fullName, handover: 'Project notes attached', conflict: 'No conflict' },
          { id: 'app-002', employee: 'Team member', type: 'Sick Leave', days: 2, stage: 'HR', status: 'Under Review', reliever: 'Not required', handover: 'Medical attachment pending', conflict: 'Attachment required' },
        ],
        reports: ['Employee leave balance', 'Department leave utilization', 'Leave liability', 'Carry forward leave', 'Expired/forfeited leave', 'Leave allowance eligibility', 'Payroll-impact leave', 'Sick leave trend', 'Absenteeism', 'Employees currently on leave', 'Upcoming leave', 'Approval SLA report', 'Leave audit trail'].map((title, index) => ({ id: `ess-rpt-${index + 1}`, title, format: 'Excel / PDF / CSV', status: 'Available' })),
        notifications: ['Leave submitted', 'Approval pending', 'Leave approved', 'Leave rejected', 'Leave cancelled', 'Leave recalled', 'Carry forward balance created', 'Carry forward expiry reminder', 'Return-to-work reminder', 'Payroll leave allowance processing', 'Blackout conflict warning', 'Reliever assignment'].map((title, index) => ({ id: `leave-ntf-${index + 1}`, title, channel: 'Email, In-app, ESS', status: 'Enabled' })),
        security: [
          { role: 'Employee', access: 'Apply and view own leave only' },
          { role: 'Supervisor/Manager', access: 'Approve team leave and view team calendar' },
          { role: 'HR Officer', access: 'Final approval and leave record management' },
          { role: 'Payroll Officer', access: 'Payroll-impact leave only' },
        ],
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
      payrollHistory: [
        currentPayroll,
        mayPayroll,
        aprilPayroll,
      ],
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
    });
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
    const category = compact(body.category);
    const title = compact(body.title);
    const priority = compact(body.priority) as EssRequest['priority'];
    if (!category) return err(400, 'category is required');
    if (!title) return err(400, 'title is required');

    const employeeSource = await readPayrollEmployees();
    const employee = resolveEssEmployee(employeeSource.employees, session);
    if (!employee) return err(403, 'Employee identity is not linked to the logged-in account.');

    const catalogItem = serviceCatalog.find((item) => item.label === category || item.id === category);
    const now = new Date().toISOString();
    const leaveType = compact(body.leaveType || body.type);
    const leaveDays = Number(body.days || 0);
    const startDate = compact(body.startDate);
    const endDate = compact(body.endDate);
    const leaveYear = Number(body.leaveYear || new Date().getFullYear());
    const allowanceAlreadyPaid = catalogItem?.id === 'leave' || /leave/i.test(category)
      ? await hasLeaveAllowanceInYear(employee, leaveYear)
      : false;
    const requestItem: EssRequest = {
      id: `ess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      employeeId: employee.employeeId,
      category: catalogItem?.area || category,
      title,
      status: catalogItem?.workflow.includes('Line Manager') ? 'Line Manager Review' : 'Submitted',
      priority: ['Low', 'Normal', 'High'].includes(priority) ? priority : 'Normal',
      submittedAt: now,
      updatedAt: now,
      approvers: catalogItem?.workflow.slice(1) || ['HR Operations'],
      leaveType: leaveType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      days: leaveDays || undefined,
      payrollPeriod: startDate ? startDate.slice(0, 7) : undefined,
      paidLeave: /leave/i.test(category) && leaveType === 'Annual Leave',
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
    return ok({ request: requestItem });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to submit ESS request.');
  }
}
