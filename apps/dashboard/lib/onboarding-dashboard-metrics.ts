import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';

export type OnboardingPeriod = 'MTD' | 'QTD' | 'YTD';

export type OnboardingFunnelStage = {
  id: string;
  label: string;
  count: number;
  color: string;
};

export type OnboardingStatusSlice = {
  id: string;
  label: string;
  count: number;
  color: string;
};

export type OnboardingActivityItem = {
  id: string;
  at: string;
  title: string;
  detail: string;
  employeeCode: string;
  employeeName: string;
};

export type OnboardingInductionItem = {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  scheduledFor: string;
  kind: string;
};

export type OnboardingDashboardMetrics = {
  period: OnboardingPeriod;
  generatedAt: string;
  cohortSize: number;
  kpis: {
    active: number;
    completed: number;
    pendingTasks: number;
    overdue: number;
    avgOnboardingDays: number;
    activeDeltaPct: number;
    completedDeltaPct: number;
    pendingDeltaPct: number;
    overdueDeltaPct: number;
    avgDaysDeltaPct: number;
  };
  funnel: OnboardingFunnelStage[];
  status: OnboardingStatusSlice[];
  activities: OnboardingActivityItem[];
  inductions: OnboardingInductionItem[];
};

const compact = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfQuarter = (date: Date) => new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
const startOfYear = (date: Date) => new Date(date.getFullYear(), 0, 1);
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

const periodStart = (period: OnboardingPeriod, now: Date) => {
  if (period === 'QTD') return startOfQuarter(now);
  if (period === 'YTD') return startOfYear(now);
  return startOfMonth(now);
};

const previousWindow = (period: OnboardingPeriod, now: Date) => {
  if (period === 'QTD') {
    const cur = startOfQuarter(now);
    return { from: addMonths(cur, -3), to: new Date(cur.getTime() - 1) };
  }
  if (period === 'YTD') {
    const cur = startOfYear(now);
    return { from: new Date(cur.getFullYear() - 1, 0, 1), to: new Date(cur.getTime() - 1) };
  }
  const cur = startOfMonth(now);
  return { from: addMonths(cur, -1), to: new Date(cur.getTime() - 1) };
};

const daysBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000));

const pctDelta = (current: number, previous: number) => {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const isActiveEmployment = (employee: DleEmployeeDirectoryRow) => {
  const status = lower(employee.status);
  if (!status) return true;
  return !/(terminat|resign|exit|inactive|dismiss|deceased|left)/.test(status);
};

const isProbationLike = (employee: DleEmployeeDirectoryRow) => {
  const status = lower(employee.status);
  if (status.includes('probation')) return true;
  const probationEnd = parseDate(employee.probationEndDate);
  const confirmationDue = parseDate(employee.confirmationDueDate);
  const now = startOfDay(new Date());
  if (probationEnd && probationEnd >= now) return true;
  if (confirmationDue && confirmationDue >= now) return true;
  const joined = parseDate(employee.dateJoined);
  if (joined && daysBetween(joined, now) <= 90 && !status.includes('confirm')) return true;
  return false;
};

const isOnboardingComplete = (employee: DleEmployeeDirectoryRow) => {
  const status = lower(employee.status);
  if (status.includes('confirm')) return true;
  if (status.includes('probation')) return false;
  const joined = parseDate(employee.dateJoined);
  if (!joined) return false;
  if (daysBetween(joined, new Date()) > 90 && isActiveEmployment(employee)) return true;
  const probationEnd = parseDate(employee.probationEndDate);
  if (probationEnd && probationEnd < startOfDay(new Date()) && !status.includes('probation')) return true;
  return false;
};

const pendingTaskCount = (employee: DleEmployeeDirectoryRow) => {
  let count = 0;
  if (!employee.emergencyContactsComplete) count += 1;
  if ((employee.documentCount || 0) <= 0) count += 1;
  if (!employee.hasManagerAssigned) count += 1;
  if (!compact(employee.bankName) || !compact(employee.accountNo)) count += 1;
  if (!employee.hasPhoto) count += 1;
  return count;
};

const isOverdueOnboarding = (employee: DleEmployeeDirectoryRow, now: Date) => {
  const confirmationDue = parseDate(employee.confirmationDueDate);
  const probationEnd = parseDate(employee.probationEndDate);
  if (confirmationDue && confirmationDue < startOfDay(now) && isProbationLike(employee)) return true;
  if (probationEnd && probationEnd < startOfDay(now) && isProbationLike(employee)) return true;
  const joined = parseDate(employee.dateJoined);
  if (joined && daysBetween(joined, now) > 60 && isProbationLike(employee) && pendingTaskCount(employee) > 0) return true;
  return false;
};

const inWindow = (value: string | undefined, from: Date | null, to: Date) => {
  const date = parseDate(value);
  if (!date) return false;
  if (from && date < from) return false;
  return date <= to;
};

const funnelReached = (employee: DleEmployeeDirectoryRow) => {
  const offerAccepted = Boolean(parseDate(employee.dateJoined));
  const documentsSubmitted = (employee.documentCount || 0) > 0 || employee.emergencyContactsComplete;
  const preBoarding = Boolean(compact(employee.bankName) && compact(employee.accountNo)) || Number(employee.basicSalary || employee.periodSalary || 0) > 0;
  const itAccess = employee.hasPhoto || employee.hasManagerAssigned;
  const induction = employee.hasManagerAssigned && documentsSubmitted;
  const completed = isOnboardingComplete(employee);
  return {
    offerAccepted,
    documentsSubmitted: offerAccepted && documentsSubmitted,
    preBoarding: offerAccepted && documentsSubmitted && preBoarding,
    itAccess: offerAccepted && documentsSubmitted && preBoarding && itAccess,
    induction: offerAccepted && documentsSubmitted && preBoarding && itAccess && induction,
    completed: offerAccepted && completed,
  };
};

const classifyStatus = (employee: DleEmployeeDirectoryRow, now: Date): OnboardingStatusSlice['id'] => {
  if (isOverdueOnboarding(employee, now)) return 'overdue';
  if (isOnboardingComplete(employee)) return 'completed';
  if (isProbationLike(employee) || pendingTaskCount(employee) > 0) return 'in-progress';
  if (parseDate(employee.dateJoined)) return 'pending';
  return 'not-started';
};

const cohortForWindow = (employees: DleEmployeeDirectoryRow[], from: Date | null, to: Date) =>
  employees.filter((employee) => {
    if (!isActiveEmployment(employee) && !isOnboardingComplete(employee)) return false;
    const joined = parseDate(employee.dateJoined);
    if (!joined) return isProbationLike(employee);
    // Include recent joiners in window, or anyone still in active onboarding regardless of join month.
    if (inWindow(employee.dateJoined, from, to)) return true;
    return isProbationLike(employee) || isOverdueOnboarding(employee, to);
  });

const avgDays = (rows: DleEmployeeDirectoryRow[], now: Date) => {
  const values = rows
    .map((employee) => {
      const joined = parseDate(employee.dateJoined);
      if (!joined) return null;
      return daysBetween(joined, now);
    })
    .filter((value): value is number => value != null);
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
};

export const buildOnboardingDashboardMetrics = (
  employees: DleEmployeeDirectoryRow[],
  period: OnboardingPeriod = 'MTD',
  generatedAt = new Date().toISOString(),
): OnboardingDashboardMetrics => {
  const now = new Date();
  const from = periodStart(period, now);
  const previous = previousWindow(period, now);
  const cohort = cohortForWindow(employees, from, now);
  const previousCohort = cohortForWindow(employees, previous.from, previous.to);

  const active = cohort.filter((employee) => isProbationLike(employee) && !isOnboardingComplete(employee));
  const completed = cohort.filter((employee) => isOnboardingComplete(employee));
  const pendingTasks = cohort.reduce((sum, employee) => sum + pendingTaskCount(employee), 0);
  const overdue = cohort.filter((employee) => isOverdueOnboarding(employee, now));

  const prevActive = previousCohort.filter((employee) => isProbationLike(employee) && !isOnboardingComplete(employee)).length;
  const prevCompleted = previousCohort.filter((employee) => isOnboardingComplete(employee)).length;
  const prevPending = previousCohort.reduce((sum, employee) => sum + pendingTaskCount(employee), 0);
  const prevOverdue = previousCohort.filter((employee) => isOverdueOnboarding(employee, previous.to)).length;
  const currentAvg = avgDays(active.length ? active : cohort, now);
  const previousAvg = avgDays(
    previousCohort.filter((employee) => isProbationLike(employee) && !isOnboardingComplete(employee)),
    previous.to,
  );

  const funnelDefs: Array<{ id: keyof ReturnType<typeof funnelReached>; label: string; color: string }> = [
    { id: 'offerAccepted', label: 'Offer Accepted', color: '#8B5CF6' },
    { id: 'documentsSubmitted', label: 'Documents Submitted', color: '#2563EB' },
    { id: 'preBoarding', label: 'Pre-Boarding Complete', color: '#14B8A6' },
    { id: 'itAccess', label: 'IT & Access Provisioned', color: '#10B981' },
    { id: 'induction', label: 'Induction Completed', color: '#F59E0B' },
    { id: 'completed', label: 'Onboarding Completed', color: '#6366F1' },
  ];

  const funnel = funnelDefs.map((stage) => ({
    id: stage.id,
    label: stage.label,
    color: stage.color,
    count: cohort.filter((employee) => funnelReached(employee)[stage.id]).length,
  }));

  const statusDefs: Array<{ id: OnboardingStatusSlice['id']; label: string; color: string }> = [
    { id: 'completed', label: 'Completed', color: '#10B981' },
    { id: 'in-progress', label: 'In Progress', color: '#2563EB' },
    { id: 'pending', label: 'Pending', color: '#F59E0B' },
    { id: 'overdue', label: 'Overdue', color: '#EF4444' },
    { id: 'not-started', label: 'Not Started', color: '#1E3A8A' },
  ];

  const status = statusDefs.map((slice) => ({
    ...slice,
    count: cohort.filter((employee) => classifyStatus(employee, now) === slice.id).length,
  }));

  const activities: OnboardingActivityItem[] = cohort
    .slice()
    .sort((a, b) => compact(b.modifiedAt || b.dateJoined).localeCompare(compact(a.modifiedAt || a.dateJoined)))
    .slice(0, 8)
    .map((employee) => {
      const statusId = classifyStatus(employee, now);
      const title =
        statusId === 'completed'
          ? 'Onboarding completed'
          : statusId === 'overdue'
            ? 'Onboarding overdue'
            : statusId === 'in-progress'
              ? 'Onboarding in progress'
              : 'Onboarding started';
      return {
        id: `${employee.employeeId}-activity`,
        at: employee.modifiedAt || employee.dateJoined || generatedAt,
        title,
        detail: `${employee.department || 'Unassigned'} · ${pendingTaskCount(employee)} open task${pendingTaskCount(employee) === 1 ? '' : 's'}`,
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
      };
    });

  const inductions: OnboardingInductionItem[] = cohort
    .filter((employee) => isProbationLike(employee) && !isOnboardingComplete(employee) && employee.hasManagerAssigned)
    .slice(0, 6)
    .map((employee) => {
      const joined = parseDate(employee.dateJoined) || now;
      const scheduled = new Date(joined.getTime() + 7 * 86400000);
      return {
        id: `${employee.employeeId}-induction`,
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
        department: employee.department || 'Unassigned',
        scheduledFor: scheduled.toISOString(),
        kind: 'Department induction',
      };
    });

  return {
    period,
    generatedAt,
    cohortSize: cohort.length,
    kpis: {
      active: active.length,
      completed: completed.length,
      pendingTasks,
      overdue: overdue.length,
      avgOnboardingDays: currentAvg,
      activeDeltaPct: pctDelta(active.length, prevActive),
      completedDeltaPct: pctDelta(completed.length, prevCompleted),
      pendingDeltaPct: pctDelta(pendingTasks, prevPending),
      overdueDeltaPct: pctDelta(overdue.length, prevOverdue),
      avgDaysDeltaPct: pctDelta(currentAvg, previousAvg),
    },
    funnel,
    status,
    activities,
    inductions,
  };
};
