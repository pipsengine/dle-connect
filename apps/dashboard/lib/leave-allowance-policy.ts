import { normalizePayrollMatchKey } from '@/lib/sage-people-payroll-store';
import type { PayrollLeaveAllowanceEvent } from '@/lib/payroll-leave-allowance-store';

export const LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS = 10;

export type LeaveApplicationLike = {
  id: string;
  employeeId: string;
  fullName?: string;
  department?: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
};

export type LeaveAllowanceExceptionRow = {
  id: string;
  severity: 'Critical' | 'Review' | 'Pending';
  employeeId: string;
  fullName: string;
  department: string;
  leaveYear: number;
  payrollPeriod: string;
  approvedAnnualLeaveDays: number;
  requestDays: number;
  allowanceAmount: number;
  allowanceStatus: string;
  eventStatus: string;
  linkedRequestId?: string;
  recommendation: string;
};

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

const approvedStatuses = new Set(['Approved', 'Completed']);

export const employeeMatchKeys = (employeeId: string, employeeCode?: string | null) =>
  [employeeId, employeeCode]
    .flatMap((value) => {
      const text = String(value || '').trim().toUpperCase();
      if (!text) return [];
      const keys = [normalizePayrollMatchKey(text)];
      const staff = text.match(/\b([PLC])0*(\d{3,5})\b/);
      if (staff) keys.push(normalizePayrollMatchKey(`${staff[1]}${staff[2]}`));
      return keys;
    })
    .filter(Boolean);

export const matchesEmployeeKeys = (employeeId: string, keys: string[]) =>
  employeeMatchKeys(employeeId).some((key) => keys.includes(key));

export const approvedAnnualLeaveDaysForYear = (
  applications: LeaveApplicationLike[],
  employeeKeys: string[],
  leaveYear: number,
) =>
  applications
    .filter((application) => {
      if (!matchesEmployeeKeys(application.employeeId, employeeKeys)) return false;
      if (application.leaveType !== 'Annual Leave') return false;
      if (!approvedStatuses.has(application.status)) return false;
      return Number(String(application.startDate).slice(0, 4)) === leaveYear;
    })
    .reduce((sum, application) => sum + Number(application.days || 0), 0);

export const isLeaveAllowancePaymentCode = (code?: string | null) =>
  /^LEAVEALLOW$/i.test(String(code || '').trim());

export const isCountableLeaveAllowanceEvent = (event: Pick<PayrollLeaveAllowanceEvent, 'code' | 'amount' | 'status'> & { audit?: Array<{ action?: string; note?: string }> }) =>
  isLeaveAllowancePaymentCode(event.code)
  && Number(event.amount || 0) > 0
  && ['Approved', 'Posted', 'Paid'].includes(event.status)
  && !(event.audit || []).some((entry) => /reversed ineligible/i.test(`${entry.action || ''} ${entry.note || ''}`));

export const isLeaveAllowanceEligibleForYear = (
  applications: LeaveApplicationLike[],
  employeeKeys: string[],
  leaveYear: number,
) => approvedAnnualLeaveDaysForYear(applications, employeeKeys, leaveYear) >= LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS;

export const primaryAnnualLeaveApplicationForAllowance = (
  applications: LeaveApplicationLike[],
  employeeKeys: string[],
  leaveYear: number,
) =>
  applications
    .filter((application) => {
      if (!matchesEmployeeKeys(application.employeeId, employeeKeys)) return false;
      if (application.leaveType !== 'Annual Leave') return false;
      if (!approvedStatuses.has(application.status)) return false;
      return Number(String(application.startDate).slice(0, 4)) === leaveYear;
    })
    .sort((left, right) => Number(right.days || 0) - Number(left.days || 0))[0] || null;

/** First approved Annual Leave of the year that itself meets the 10-day allowance threshold. */
export const earliestQualifyingAnnualLeaveForAllowance = (
  applications: LeaveApplicationLike[],
  employeeKeys: string[],
  leaveYear: number,
) =>
  applications
    .filter((application) => {
      if (!matchesEmployeeKeys(application.employeeId, employeeKeys)) return false;
      if (application.leaveType !== 'Annual Leave') return false;
      if (!approvedStatuses.has(application.status)) return false;
      if (Number(application.days || 0) < LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS) return false;
      return Number(String(application.startDate).slice(0, 4)) === leaveYear;
    })
    .sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)))[0] || null;

/** Payroll month that should carry the year's leave allowance, or null if not yet entitled. */
export const leaveAllowancePaymentPeriodForYear = (
  applications: LeaveApplicationLike[],
  employeeKeys: string[],
  leaveYear: number,
) => {
  const qualifying = earliestQualifyingAnnualLeaveForAllowance(applications, employeeKeys, leaveYear);
  return qualifying ? String(qualifying.startDate).slice(0, 7) : null;
};

export const buildLeaveAllowanceApplicationStatus = (
  application: LeaveApplicationLike,
  applications: LeaveApplicationLike[],
  events: PayrollLeaveAllowanceEvent[],
) => {
  const keys = employeeMatchKeys(application.employeeId);
  const leaveYear = Number(String(application.startDate).slice(0, 4));
  const approvedDays = approvedAnnualLeaveDaysForYear(applications, keys, leaveYear);
  const requestEligible = application.leaveType === 'Annual Leave'
    && Number(application.days || 0) >= LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS;
  const yearEligible = approvedDays >= LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS;
  const paidEvent = events.find((event) =>
    event.leaveYear === leaveYear
    && keys.some((key) => [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).includes(key))
    && isCountableLeaveAllowanceEvent(event));
  const reversedEvent = events.find((event) =>
    event.leaveYear === leaveYear
    && keys.some((key) => [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).includes(key))
    && isLeaveAllowancePaymentCode(event.code)
    && event.status === 'Reversed');

  if (application.leaveType !== 'Annual Leave' || !requestEligible) {
    return {
      allowanceStatus: 'Not eligible',
      allowanceEligible: false,
      allowancePaid: false,
      approvedAnnualLeaveDays: approvedDays,
    };
  }

  if (reversedEvent) {
    return {
      allowanceStatus: `Policy exception – only ${approvedDays} approved day(s) in ${leaveYear}`,
      allowanceEligible: false,
      allowancePaid: false,
      approvedAnnualLeaveDays: approvedDays,
    };
  }

  if (paidEvent) {
    return {
      allowanceStatus: `Paid in ${paidEvent.period} payroll`,
      allowanceEligible: true,
      allowancePaid: true,
      approvedAnnualLeaveDays: approvedDays,
    };
  }

  if (yearEligible && approvedStatuses.has(application.status)) {
    return {
      allowanceStatus: 'Eligible – pending payroll posting',
      allowanceEligible: true,
      allowancePaid: false,
      approvedAnnualLeaveDays: approvedDays,
    };
  }

  if (yearEligible) {
    return {
      allowanceStatus: 'Eligible after final approval',
      allowanceEligible: true,
      allowancePaid: false,
      approvedAnnualLeaveDays: approvedDays,
    };
  }

  return {
    allowanceStatus: `Requires ${LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS}+ approved annual leave days in ${leaveYear}`,
    allowanceEligible: false,
    allowancePaid: false,
    approvedAnnualLeaveDays: approvedDays,
  };
};

export const buildLeaveAllowanceExceptions = (
  applications: LeaveApplicationLike[],
  events: PayrollLeaveAllowanceEvent[],
): LeaveAllowanceExceptionRow[] => {
  const rows = new Map<string, LeaveAllowanceExceptionRow>();
  const applicationById = new Map(applications.map((application) => [application.id, application]));

  for (const event of events) {
    if (!isLeaveAllowancePaymentCode(event.code) || Number(event.amount || 0) <= 0) continue;
    const keys = [event.employeeId, event.employeeCode].map(normalizePayrollMatchKey).filter(Boolean);
    const approvedDays = approvedAnnualLeaveDaysForYear(applications, keys, event.leaveYear);
    const linkedApplication = event.requestId
      ? applicationById.get(event.requestId)
      : primaryAnnualLeaveApplicationForAllowance(applications, keys, event.leaveYear);
    const fullName = linkedApplication?.fullName || event.fullName || event.employeeCode || event.employeeId;
    const department = linkedApplication?.department || 'Unassigned';

    if (event.status === 'Reversed') {
      rows.set(event.id, {
        id: event.id,
        severity: 'Critical',
        employeeId: event.employeeCode || event.employeeId,
        fullName,
        department,
        leaveYear: event.leaveYear,
        payrollPeriod: event.period,
        approvedAnnualLeaveDays: approvedDays,
        requestDays: Number(linkedApplication?.days || 0),
        allowanceAmount: Number(event.amount || 0),
        allowanceStatus: 'Policy exception',
        eventStatus: event.status,
        linkedRequestId: linkedApplication?.id || event.requestId,
        recommendation: approvedDays < LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS
          ? `Payroll leave allowance must be reversed or withheld. Only ${approvedDays} approved annual leave day(s) recorded for ${event.leaveYear}; minimum ${LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS} required.`
          : 'Review payroll posting against the approved leave record.',
      });
    }
  }

  for (const application of applications) {
    const allowance = buildLeaveAllowanceApplicationStatus(application, applications, events);
    if (!allowance.allowanceStatus.startsWith('Policy exception')) continue;
    const rowId = `app-${application.id}`;
    if (rows.has(rowId)) continue;
    rows.set(rowId, {
      id: rowId,
      severity: 'Critical',
      employeeId: application.employeeId,
      fullName: application.fullName || application.employeeId,
      department: application.department || 'Unassigned',
      leaveYear: Number(String(application.startDate).slice(0, 4)),
      payrollPeriod: String(application.startDate).slice(0, 7),
      approvedAnnualLeaveDays: Number(allowance.approvedAnnualLeaveDays || 0),
      requestDays: Number(application.days || 0),
      allowanceAmount: 0,
      allowanceStatus: allowance.allowanceStatus,
      eventStatus: 'Review',
      linkedRequestId: application.id,
      recommendation: `Annual leave of ${application.days} day(s) does not meet the ${LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS}-day leave allowance threshold.`,
    });
  }

  for (const application of applications) {
    if (application.leaveType !== 'Annual Leave') continue;
    if (!approvedStatuses.has(application.status)) continue;
    if (Number(application.days || 0) < LEAVE_ALLOWANCE_MINIMUM_ANNUAL_DAYS) continue;
    const allowance = buildLeaveAllowanceApplicationStatus(application, applications, events);
    if (!allowance.allowanceEligible || allowance.allowancePaid) continue;
    const rowId = `pending-${application.id}`;
    rows.set(rowId, {
      id: rowId,
      severity: 'Pending',
      employeeId: application.employeeId,
      fullName: application.fullName || application.employeeId,
      department: application.department || 'Unassigned',
      leaveYear: Number(String(application.startDate).slice(0, 4)),
      payrollPeriod: String(application.startDate).slice(0, 7),
      approvedAnnualLeaveDays: Number(allowance.approvedAnnualLeaveDays || 0),
      requestDays: Number(application.days || 0),
      allowanceAmount: 0,
      allowanceStatus: allowance.allowanceStatus,
      eventStatus: 'Pending Payroll',
      linkedRequestId: application.id,
      recommendation: `Post leave allowance to ${String(application.startDate).slice(0, 7)} payroll after final approval checks.`,
    });
  }

  return [...rows.values()].sort((left, right) => {
    const severityRank = { Critical: 0, Review: 1, Pending: 2 };
    const leftRank = severityRank[left.severity] ?? 9;
    const rightRank = severityRank[right.severity] ?? 9;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return `${right.payrollPeriod}-${right.fullName}`.localeCompare(`${left.payrollPeriod}-${left.fullName}`);
  });
};

export const formatLeaveAllowanceAmount = (amount: number) => (amount > 0 ? moneyFmt.format(amount) : '—');
