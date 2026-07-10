import sql from 'mssql';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readEmployeeAttendanceMonthSummary } from '@/lib/biometric-live-attendance-store';
import { listEnterpriseNotifications } from '@/lib/enterprise-notifications-store';
import { normalizeEssNotificationHref } from '@/lib/ess-notification-routing';
import type { LeaveApplicationRecord, LeaveBalanceRecord, LeaveStatus, WorkflowStage } from '@/lib/leave-management-store';
import type { SessionPayload } from '@/lib/auth/session';
import { resolveActivePayrollPeriod } from '@/lib/payroll-periods';
import type { EmployeeLeaveSummary } from '@/lib/hris-leave-read';
import { ensureEmployeeLeaveFromHris } from '@/lib/hris-leave-read';
import type { PayslipEmployeeIdentity } from '@/lib/payroll-payslip-identity-store';
import { explicitDepartmentSupervisorCode } from '@/lib/department-reporting-manager-sync';
import { resolveReportingManagerDisplay } from '@/lib/reporting-manager-match';

const compact = (value: unknown) => String(value || '').trim();
const round = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
const isoDate = (value?: string | Date | null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return compact(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const legacyCodeFromJobTitle = (jobTitle: string) => {
  const match = compact(jobTitle).match(/^([A-Z]{2,5}\d{2,5})\s*-/i);
  return match?.[1]?.toUpperCase() || '';
};

export const buildEssEmployeeLookupKeys = (employee: DleEmployeeDirectoryRow, payslipIdentity?: Pick<PayslipEmployeeIdentity, 'employeeCode' | 'sourceEmployeeCode'> | null) => {
  const keys = new Set<string>();
  for (const value of [
    employee.employeeId,
    employee.employeeCode,
    employee.sourceEmployeeId,
    payslipIdentity?.employeeCode,
    payslipIdentity?.sourceEmployeeCode,
    legacyCodeFromJobTitle(employee.jobTitle || ''),
    String(employee.employeeDbId || ''),
  ]) {
    const normalized = compact(value).toUpperCase();
    if (normalized) keys.add(normalized);
  }
  return [...keys];
};

const parseJsonArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const readLeaveApplicationsForKeys = async (lookupKeys: string[]): Promise<LeaveApplicationRecord[]> => {
  const keys = [...new Set(lookupKeys.map((value) => compact(value)).filter(Boolean))];
  if (!keys.length) return [];
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return [];
  try {
    const request = pool.request();
    keys.forEach((key, index) => request.input(`employeeKey${index}`, sql.NVarChar(80), key));
    const keySql = keys.map((_, index) => `@employeeKey${index}`).join(', ');
    const result = await request.query(`
SELECT a.[Id],a.[EmployeeId],a.[FullName],a.[Department],a.[ManagerName],a.[Location],a.[EmployeeCategory],a.[LeaveType],
  a.[StartDate],a.[EndDate],a.[Days],a.[StatusName],a.[WorkflowStage],a.[ApprovalStatus],a.[PolicyComplianceStatus],
  a.[BalanceImpact],a.[AvailableBalance],a.[ActingOfficer],a.[SupportingDocuments],a.[ExceptionsJson],
  a.[SourceSystem],a.[CreatedAt],a.[UpdatedAt],
  (SELECT COUNT(1) FROM [hris].[LeaveAuditTrail] aud WHERE aud.[RecordId]=a.[Id]) AS [AuditCount]
FROM [hris].[LeaveApplications] a
WHERE a.[EmployeeId] IN (${keySql})
ORDER BY a.[StartDate] DESC, a.[UpdatedAt] DESC;`);
    return (result.recordset || []).map((row: any) => ({
      id: row.Id,
      sourceSystem: row.SourceSystem,
      employeeId: row.EmployeeId,
      fullName: row.FullName,
      department: row.Department,
      managerName: row.ManagerName,
      location: row.Location,
      employeeCategory: row.EmployeeCategory,
      leaveType: row.LeaveType,
      startDate: isoDate(row.StartDate),
      endDate: isoDate(row.EndDate),
      days: Number(row.Days || 0),
      status: row.StatusName as LeaveStatus,
      stage: row.WorkflowStage as WorkflowStage,
      approvalStatus: row.ApprovalStatus,
      policyComplianceStatus: row.PolicyComplianceStatus,
      balanceImpact: Number(row.BalanceImpact || 0),
      availableBalance: Number(row.AvailableBalance || 0),
      actingOfficer: row.ActingOfficer,
      supportingDocuments: Number(row.SupportingDocuments || 0),
      exceptions: parseJsonArray(row.ExceptionsJson),
      auditCount: Number(row.AuditCount || 0),
      createdAt: new Date(row.CreatedAt).toISOString(),
      updatedAt: new Date(row.UpdatedAt).toISOString(),
    }));
  } catch {
    return [];
  }
};

const balanceDetailsToRecords = (employee: DleEmployeeDirectoryRow, details: EmployeeLeaveSummary['balanceDetails']): LeaveBalanceRecord[] =>
  details.map((detail) => ({
    employeeId: employee.employeeId,
    fullName: employee.fullName,
    department: employee.department || 'Unassigned',
    leaveType: detail.leaveType,
    currentBalance: detail.available,
    accruedBalance: detail.entitlement,
    usedBalance: detail.used,
    pendingBalance: detail.pending,
    forfeitedBalance: 0,
    carryForwardBalance: detail.carryForward,
    liabilityValue: 0,
    status: 'Healthy',
    exceptions: [],
  }));

const yearsOfService = (employee: DleEmployeeDirectoryRow) => {
  const joined = isoDate(employee.dateJoined || employee.contractStartDate);
  if (!joined) return round(Number(employee.yearsOfService || 0));
  const start = new Date(`${joined}T00:00:00.000Z`);
  const now = new Date();
  const years = (now.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000);
  return Math.max(0, round(years));
};

const workingDaysInMonthBefore = (day: number) => {
  const now = new Date();
  let count = 0;
  for (let index = 1; index <= day; index += 1) {
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), index));
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
};

const upcomingOccurrences = (
  employees: DleEmployeeDirectoryRow[],
  field: 'dateOfBirth' | 'dateJoined',
  daysAhead = 45,
) => {
  const now = new Date();
  const results: Array<{ id: string; fullName: string; department: string; date: string; years?: number }> = [];
  for (const person of employees) {
    const raw = field === 'dateOfBirth' ? person.dateOfBirth : person.dateJoined || person.contractStartDate;
    const base = isoDate(raw);
    if (!base) continue;
    const [, month, day] = base.split('-');
    const candidate = new Date(Date.UTC(now.getFullYear(), Number(month) - 1, Number(day)));
    if (candidate.getTime() < now.getTime()) candidate.setUTCFullYear(now.getFullYear() + 1);
    const diffDays = Math.ceil((candidate.getTime() - now.getTime()) / (24 * 3600 * 1000));
    if (diffDays < 0 || diffDays > daysAhead) continue;
    results.push({
      id: `${field}-${person.employeeId}-${candidate.getUTCFullYear()}`,
      fullName: person.fullName,
      department: person.department || 'Unassigned',
      date: candidate.toISOString().slice(0, 10),
      years: field === 'dateJoined' ? yearsOfService(person) : undefined,
    });
  }
  return results.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
};

const readEmployeeDocuments = async (employeeDbId: number) => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool || !employeeDbId) return [];
  try {
    const result = await pool.request().input('employeeId', sql.BigInt, employeeDbId).query(`
      SELECT TOP (48)
        document_id,
        document_category,
        file_name,
        document_status,
        mime_type,
        size_bytes,
        expires_at,
        verified_at,
        created_at
      FROM [hris].[EmployeeDocuments]
      WHERE employee_id = @employeeId
      ORDER BY created_at DESC, document_id DESC;
    `);
    return (result.recordset || []).map((row: any) => {
      const statusRaw = compact(row.document_status) || 'Uploaded';
      const verified = /verified/i.test(statusRaw);
      const expired = /expired/i.test(statusRaw);
      const rejected = /rejected/i.test(statusRaw);
      const status = verified ? 'Current' : expired ? 'Expired' : rejected ? 'Rejected' : /pending/i.test(statusRaw) ? 'Pending' : 'Uploaded';
      const verifiedAt = row.verified_at ? new Date(row.verified_at).toISOString() : null;
      const uploadedAt = row.created_at ? new Date(row.created_at).toISOString() : null;
      return {
        id: `doc-${row.document_id}`,
        title: compact(row.file_name) || compact(row.document_category) || 'Employee Document',
        category: compact(row.document_category) || 'Documents',
        version: verifiedAt ? `Verified ${verifiedAt.slice(0, 10)}` : 'v1.0',
        status,
        uploadedAt,
        expiresAt: row.expires_at ? String(row.expires_at).slice(0, 10) : null,
        mimeType: compact(row.mime_type) || 'application/octet-stream',
        sizeBytes: Number(row.size_bytes || 0),
        verifiedAt,
        acknowledgement: verified ? 'Acknowledged' : rejected ? 'Rejected' : expired ? 'Expired' : 'Pending',
        accessScope: 'Employee (self-service)',
      };
    });
  } catch {
    return [];
  }
};

export type EssDashboardContext = {
  leave: {
    entitlement: number;
    used: number;
    balance: number;
    pending: number;
    carryForward: number;
    applications: LeaveApplicationRecord[];
    balances: LeaveBalanceRecord[];
    policyCards: Array<Record<string, string | number>>;
  };
  attendance: Awaited<ReturnType<typeof readEmployeeAttendanceMonthSummary>>;
  documents: Array<{
    id: string;
    title: string;
    category: string;
    version: string;
    status: string;
    uploadedAt?: string | null;
    expiresAt?: string | null;
    mimeType?: string;
    sizeBytes?: number;
    verifiedAt?: string | null;
    acknowledgement?: string;
    accessScope?: string;
  }>;
  notifications: Array<{ id: string; title: string; type: string; status: string; createdAt: string; href?: string }>;
  birthdays: Array<{ id: string; fullName: string; department: string; date: string }>;
  anniversaries: Array<{ id: string; fullName: string; years: number; date: string }>;
  events: Array<{ id: string; label: string; date: string; type: string }>;
  dashboardAnalytics: {
    activityByCategory: Array<{ label: string; value: number; color: string }>;
    totalActivities: number;
    hrInsights: {
      attendanceTrend: { trend: number; series: number[] };
      leaveUtilization: { trend: number; series: number[] };
      payrollSummary: { netPay: number; label: string };
      requestsCompleted: { count: number; trend: number };
      trainingProgress: { percent: number };
    };
  };
  employeeSummary: {
    yearsOfService: number;
    manager: string;
    location: string;
    salaryGrade: string;
    payrollGroup: string;
  };
};

export async function buildEssDashboardContext(input: {
  employee: DleEmployeeDirectoryRow;
  employees: DleEmployeeDirectoryRow[];
  session: SessionPayload;
  requests: Array<{ category: string; status: string }>;
  netPay: number;
  documentCountFallback?: number;
  payslipIdentity?: Pick<PayslipEmployeeIdentity, 'employeeCode' | 'sourceEmployeeCode' | 'salaryGrade' | 'location' | 'payrollGroup'> | null;
}): Promise<EssDashboardContext> {
  const { employee, employees, session, requests, netPay, payslipIdentity } = input;
  const lookupKeys = buildEssEmployeeLookupKeys(employee, payslipIdentity);
  const [leaveSummary, applications, attendance, documents, notificationFeed] = await Promise.all([
    ensureEmployeeLeaveFromHris(employee),
    readLeaveApplicationsForKeys(lookupKeys),
    readEmployeeAttendanceMonthSummary(lookupKeys),
    readEmployeeDocuments(Number(employee.employeeDbId || 0)),
    listEnterpriseNotifications(session, 'all').catch(() => ({ notifications: [] as Awaited<ReturnType<typeof listEnterpriseNotifications>>['notifications'] })),
  ]);

  const leaveBalances = balanceDetailsToRecords(employee, leaveSummary.balanceDetails);
  const annualDetail = leaveSummary.balanceDetails.find((item) => item.leaveType.toLowerCase().includes('annual'));
  const carryForwardDetail = leaveSummary.balanceDetails.find((item) => item.leaveType.toLowerCase().includes('carry'));
  const annualBalance = leaveBalances.find((item) => item.leaveType.toLowerCase().includes('annual'));
  const carryForwardBalance = leaveBalances.find((item) => item.leaveType.toLowerCase().includes('carry'));
  const sickBalance = leaveBalances.find((item) => item.leaveType.toLowerCase().includes('sick'));
  const casualBalance = leaveBalances.find((item) => item.leaveType.toLowerCase().includes('casual'));
  const compassionateBalance = leaveBalances.find((item) => item.leaveType.toLowerCase().includes('compassion'));
  const examBalance = leaveBalances.find((item) => item.leaveType.toLowerCase().includes('exam'));

  const entitlement = annualDetail?.entitlement ?? annualBalance?.accruedBalance ?? 0;
  const used = annualDetail?.used ?? annualBalance?.usedBalance ?? 0;
  const pending = annualDetail?.pending ?? annualBalance?.pendingBalance ?? 0;
  const balance = annualDetail?.available ?? annualBalance?.currentBalance ?? Math.max(0, entitlement - used - pending);
  const carryForward = carryForwardDetail?.available ?? carryForwardDetail?.carryForward ?? carryForwardBalance?.currentBalance ?? 0;
  const leaveSnapshot = { applications, balances: leaveBalances };

  const departmentPeers = employees.filter(
    (item) => compact(item.department).toLowerCase() === compact(employee.department).toLowerCase() && !/inactive|terminated|resigned|exit/i.test(compact(item.status)),
  );
  const birthdays = upcomingOccurrences(departmentPeers.length ? departmentPeers : employees, 'dateOfBirth').map((item) => ({
    id: item.id,
    fullName: item.fullName,
    department: item.department,
    date: item.date,
  }));
  const anniversaries = upcomingOccurrences(departmentPeers.length ? departmentPeers : employees, 'dateJoined')
    .filter((item) => (item.years || 0) >= 1)
    .map((item) => ({
      id: item.id,
      fullName: item.fullName,
      years: Math.max(1, Math.round(item.years || 1)),
      date: item.date,
    }));

  const ownAnniversary = isoDate(employee.dateJoined || employee.contractStartDate);
  const events: EssDashboardContext['events'] = [];
  if (ownAnniversary) {
    const nextAnniversary = upcomingOccurrences([employee], 'dateJoined')[0];
    if (nextAnniversary) events.push({ id: 'evt-ann-self', label: 'Work anniversary', date: nextAnniversary.date, type: 'Anniversary' });
  }
  const payrollPeriod = await resolveActivePayrollPeriod().catch(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [year, month] = payrollPeriod.split('-').map(Number);
  const periodEnd = new Date(Date.UTC(year || new Date().getFullYear(), month || 1, 0));
  events.push({ id: 'evt-timesheet-cutoff', label: 'Timesheet cut-off', date: periodEnd.toISOString().slice(0, 10), type: 'Payroll' });
  for (const application of leaveSnapshot.applications.filter((item) => ['Submitted', 'Under Review', 'Approved'].includes(item.status)).slice(0, 3)) {
    events.push({
      id: `evt-leave-${application.id}`,
      label: `${application.leaveType} (${application.startDate})`,
      date: application.startDate,
      type: 'Leave',
    });
  }

  const leaveCount = leaveSnapshot.applications.length;
  const requestCount = requests.filter((item) => !/leave/i.test(item.category)).length;
  const documentCount = documents.length || input.documentCountFallback || 0;
  const claimsCount = requests.filter((item) => /claim|reimbursement|travel|advance/i.test(item.category)).length;
  const othersCount = Math.max(0, notificationFeed.notifications.length);
  const activityByCategory = [
    { label: 'Leave', value: leaveCount, color: '#10B981' },
    { label: 'Claims', value: claimsCount, color: '#2563EB' },
    { label: 'Requests', value: requestCount, color: '#7C3AED' },
    { label: 'Documents', value: documentCount, color: '#F59E0B' },
    { label: 'Others', value: othersCount, color: '#94A3B8' },
  ];
  const totalActivities = activityByCategory.reduce((sum, item) => sum + item.value, 0);
  const leaveUtilPct = entitlement > 0 ? round((used / entitlement) * 100) : 0;
  const approvedRequests = requests.filter((item) => item.status === 'Approved').length;

  const notificationsFromDb = notificationFeed.notifications.slice(0, 6).map((item) => ({
    id: item.id,
    title: item.title,
    type: item.module || item.kind,
    status: item.status,
    createdAt: item.createdAt,
    href: normalizeEssNotificationHref(item.href),
  }));
  const pendingLeave = leaveSnapshot.applications.find((item) => ['Submitted', 'Under Review'].includes(item.status));
  const derivedNotifications = [
    ...(pendingLeave
      ? [{
          id: `leave-pending-${pendingLeave.id}`,
          title: `${pendingLeave.leaveType} awaiting ${pendingLeave.stage} review`,
          type: 'Workflow',
          status: 'Unread',
          createdAt: pendingLeave.updatedAt,
          href: '/workforce-portal?tab=leave&leaveSection=applications',
        }]
      : []),
    ...notificationsFromDb,
  ];

  const policyCards = leaveSummary.balanceDetails.length
    ? leaveSummary.balanceDetails.map((detail) => ({
        id: detail.leaveType.toLowerCase().replace(/\s+/g, '-'),
        type: detail.leaveType,
        entitlement: detail.entitlement,
        basis: 'Working days',
        used: detail.used,
        pending: detail.pending,
        balance: detail.available,
        expiryDate: detail.leaveType.toLowerCase().includes('carry') ? `${new Date().getFullYear()}-03-31` : '',
        eligibilityStatus: 'From HRIS',
        allowanceStatus: detail.leaveType.toLowerCase().includes('annual') ? 'From leave policy' : 'No leave allowance',
        policyNote: 'From DLE_Enterprise HRIS leave records.',
      }))
    : [
        { id: 'annual-leave', type: 'Annual Leave', entitlement, basis: 'Working days', used, pending, balance, expiryDate: '', eligibilityStatus: annualBalance?.status || 'From HRIS', allowanceStatus: 'From leave policy', policyNote: 'From DLE_Enterprise HRIS leave records.' },
        { id: 'sick-leave', type: 'Sick Leave', entitlement: sickBalance?.accruedBalance ?? 0, basis: 'Working days', used: sickBalance?.usedBalance ?? 0, pending: sickBalance?.pendingBalance ?? 0, balance: sickBalance?.currentBalance ?? 0, expiryDate: '', eligibilityStatus: sickBalance?.status || 'From HRIS', allowanceStatus: 'No leave allowance', policyNote: 'Medical certificate may be required.' },
        { id: 'compassionate-leave', type: 'Compassionate Leave', entitlement: compassionateBalance?.accruedBalance ?? 0, basis: 'Working days', used: compassionateBalance?.usedBalance ?? 0, pending: compassionateBalance?.pendingBalance ?? 0, balance: compassionateBalance?.currentBalance ?? 0, expiryDate: '', eligibilityStatus: compassionateBalance?.status || 'From HRIS', allowanceStatus: 'No leave allowance', policyNote: 'Supporting document required where applicable.' },
        { id: 'exam-leave', type: 'Exam Leave', entitlement: examBalance?.accruedBalance ?? 0, basis: 'Working days', used: examBalance?.usedBalance ?? 0, pending: examBalance?.pendingBalance ?? 0, balance: examBalance?.currentBalance ?? 0, expiryDate: '', eligibilityStatus: examBalance?.status || 'From HRIS', allowanceStatus: 'No leave allowance', policyNote: 'Exam timetable or institution evidence required.' },
        { id: 'carry-forward-leave', type: 'Carry Forward Leave', entitlement: carryForward, basis: 'Working days', used: carryForwardBalance?.usedBalance ?? 0, pending: carryForwardBalance?.pendingBalance ?? 0, balance: carryForward, expiryDate: `${new Date().getFullYear()}-03-31`, eligibilityStatus: carryForward ? 'Available until 31 March' : 'No carry-forward balance', allowanceStatus: 'Does not trigger leave allowance', policyNote: 'From DLE_Enterprise HRIS leave records.' },
      ];

  const monthDays = workingDaysInMonthBefore(new Date().getDate());
  const attendanceSeries = monthDays
    ? Array.from({ length: 6 }, (_, index) => round(Math.max(0, attendance.monthRate - (5 - index) * 1.5)))
    : [0, 0, 0, 0, 0, attendance.monthRate];
  attendanceSeries[5] = attendance.monthRate;

  return {
    leave: {
      entitlement,
      used,
      balance,
      pending,
      carryForward,
      applications: leaveSnapshot.applications,
      balances: leaveSnapshot.balances,
      policyCards,
    },
    attendance,
    documents,
    notifications: derivedNotifications.slice(0, 6),
    birthdays,
    anniversaries,
    events: events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    dashboardAnalytics: {
      activityByCategory,
      totalActivities,
      hrInsights: {
        attendanceTrend: { trend: round(attendance.monthRate - (attendanceSeries[4] || attendance.monthRate)), series: attendanceSeries },
        leaveUtilization: { trend: leaveUtilPct > 0 ? round(leaveUtilPct * 0.4) : 0, series: [0, round(leaveUtilPct * 0.2), round(leaveUtilPct * 0.4), round(leaveUtilPct * 0.6), round(leaveUtilPct * 0.8), used] },
        payrollSummary: { netPay, label: 'Net Pay' },
        requestsCompleted: { count: approvedRequests, trend: approvedRequests > 0 ? round((approvedRequests / Math.max(requests.length, 1)) * 100) : 0 },
        trainingProgress: {
          percent: Math.min(100, Math.round((documents.filter((doc) => /certificate|training|hse/i.test(`${doc.title} ${doc.category}`)).length / Math.max(documents.length, 1)) * 100)),
        },
      },
    },
    employeeSummary: {
      yearsOfService: yearsOfService(employee),
      manager: resolveReportingManagerDisplay(
        employee,
        employees,
        explicitDepartmentSupervisorCode(employee.department || ''),
      ),
      location: compact(employee.workLocation) || compact(employee.location) || compact(employee.officeLocation) || compact(employee.projectSite) || compact(payslipIdentity?.location) || '—',
      salaryGrade: compact(employee.salaryGrade) || compact(employee.jobGrade) || compact(payslipIdentity?.salaryGrade) || '—',
      payrollGroup: compact(employee.payrollGroup) || compact(payslipIdentity?.payrollGroup) || '—',
    },
  };
}
