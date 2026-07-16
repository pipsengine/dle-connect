import {
  buildPayrollCalculationFromSnapshot,
  calculatePayrollForPeriod,
  maskPayrollCalculationRecords,
  type PayrollCalculationRecord,
} from '@/lib/payroll-calculation-service';
import { getActivePayrollPeriod, listPayrollPeriods, payrollPeriodLabel } from '@/lib/payroll-period-store';
import {
  getPayrollRunForPeriod,
  listPayrollAudit,
  listPayrollRuns,
  readPayrollSnapshot,
  type PayrollRunSnapshot,
  type UnifiedPayrollRun,
} from '@/lib/payroll-run-store';
import {
  summarizePayrollReadiness,
} from '@/lib/payroll-readiness';
import { reapplyPayrollValidationPolicy } from '@/lib/payroll-tolerance';
import { managementPermissions, payrollSessionContext, processingPermissions } from '@/lib/payroll-session';
import { hasFullPayrollManagementAccess, hasPayrollSalaryReviewAccess, isFinancePayrollOnlyUser } from '@/lib/access/payroll-access';
import {
  getPayrollApprovalStageState,
  resolvePayrollApprovalNextOwner,
  resolvePayrollApprovalStageLabel,
} from '@/lib/payroll-approval-workflow';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const FINALIZED_RUN_STATUSES = new Set([
  'Computed',
  'Calculated',
  'Ready for Approval',
  'Submitted',
  'Under Review',
  'Finance Approved',
  'HR Approved',
  'Approved',
  'Released',
  'Locked',
  'Posted',
  'Published',
  'Closed',
]);

const isPayrollComputed = (run: UnifiedPayrollRun | null, periodRecord: { status: string } | null) => {
  if (periodRecord?.status === 'Closed') return true;
  if (!run) return false;
  if (run.status === 'Closed') return true;
  return FINALIZED_RUN_STATUSES.has(run.status);
};

const stripPendingPayrollAmounts = (calculation: Awaited<ReturnType<typeof calculatePayrollForPeriod>>) => ({
  ...calculation,
  summary: {
    ...calculation.summary,
    basePay: 0,
    allowances: 0,
    grossPay: 0,
    totalDeductions: 0,
    deductions: 0,
    netPay: 0,
    employerCost: 0,
    sageGrossPay: 0,
    sageNetPay: 0,
    grossVariance: 0,
    netVariance: 0,
  },
  breakdowns: {
    ...calculation.breakdowns,
    byPayrollGroup: calculation.breakdowns.byPayrollGroup.map((item) => ({ ...item, grossPay: 0, netPay: 0 })),
    byDepartment: calculation.breakdowns.byDepartment.map((item) => ({ ...item, grossPay: 0, netPay: 0 })),
    byEmploymentType: calculation.breakdowns.byEmploymentType.map((item) => ({ ...item, grossPay: 0, netPay: 0 })),
    byComponent: calculation.breakdowns.byComponent.map((item) => ({ ...item, amount: 0 })),
  },
});

const shouldUseSnapshot = (
  run: UnifiedPayrollRun | null,
  periodRecord: { status: string } | null,
  snapshot: PayrollRunSnapshot | null,
) => {
  if (!run || !snapshot?.records?.length) return false;
  if (periodRecord?.status === 'Closed' || run.status === 'Closed') return true;
  return FINALIZED_RUN_STATUSES.has(run.status);
};

const refreshCalculationFromRecords = (
  calculation: Awaited<ReturnType<typeof calculatePayrollForPeriod>>,
  records: PayrollCalculationRecord[],
) => {
  const ready = records.filter((record) => record.status === 'Ready');
  const review = records.filter((record) => record.status === 'Review');
  const blocked = records.filter((record) => record.status === 'Blocked');
  const readiness = summarizePayrollReadiness(records);
  return {
    ...calculation,
    records,
    summary: {
      ...calculation.summary,
      ready: ready.length,
      review: review.length,
      blocked: blocked.length,
      blockedEmployees: blocked.length,
      readyEmployees: ready.length,
      reviewEmployees: review.length,
      readinessReadyEmployees: readiness.readinessReadyEmployees,
      readinessAwaitingTimesheetEmployees: readiness.readinessAwaitingTimesheetEmployees,
      readinessReviewEmployees: readiness.readinessReviewEmployees,
      readinessBlockedEmployees: readiness.readinessBlockedEmployees,
      exceptionCount: records.reduce((sum, record) => sum + Number(record.exceptionCount || 0), 0),
      deferredExceptionCount: records.reduce((sum, record) => sum + Number(record.deferredWarnings?.length || 0), 0),
    },
  };
};

const resolvePeriodCalculation = async (period: string, run: UnifiedPayrollRun | null, periodRecord: { status: string } | null) => {
  const payrollComputed = isPayrollComputed(run, periodRecord);

  if (payrollComputed && run) {
    const snapshot = await readPayrollSnapshot(run.id);
    if (shouldUseSnapshot(run, periodRecord, snapshot) && snapshot) {
      const calculation = await buildPayrollCalculationFromSnapshot(period, snapshot);
      return { calculation, dataMode: 'snapshot' as const, payrollComputed: true };
    }
  }

  const live = await calculatePayrollForPeriod(period);
  const normalizedLive = refreshCalculationFromRecords(live, reapplyPayrollValidationPolicy(live.records, live.toleranceMode));

  if (!payrollComputed) {
    return { calculation: stripPendingPayrollAmounts(normalizedLive), dataMode: 'pending' as const, payrollComputed: false };
  }

  if (!run) return { calculation: normalizedLive, dataMode: 'live' as const, payrollComputed: true };

  if (run.grossPay > 0) {
    return {
      calculation: {
        ...normalizedLive,
        summary: {
          ...normalizedLive.summary,
          grossPay: roundMoney(run.grossPay),
          deductions: roundMoney(run.deductions),
          totalDeductions: roundMoney(run.deductions),
          netPay: roundMoney(run.netPay),
          payrollEligible: run.employeeCount || live.summary.payrollEligible,
        },
      },
      dataMode: 'run-header' as const,
      payrollComputed: true,
    };
  }

  return { calculation: normalizedLive, dataMode: 'live' as const, payrollComputed: true };
};

const mapRunForProcessing = (run: Awaited<ReturnType<typeof getPayrollRunForPeriod>>) =>
  run
    ? {
        id: run.id,
        period: run.period,
        periodLabel: run.periodLabel,
        status: run.status,
        employeeCount: run.employeeCount,
        grossPay: run.grossPay,
        netPay: run.netPay,
        totalDeductions: run.deductions,
        employerCost: run.employerCost,
        exceptionCount: run.exceptionCount,
        createdAt: run.createdAt,
        createdBy: run.createdBy,
        updatedAt: run.updatedAt,
        updatedBy: run.updatedBy,
        submittedAt: run.submittedAt || null,
        submittedBy: run.submittedBy || null,
        hrReviewedAt: run.hrReviewedAt || null,
        hrReviewedBy: run.hrReviewedBy || null,
        financeReviewedAt: run.financeReviewedAt || null,
        financeReviewedBy: run.financeReviewedBy || null,
        cfoReviewedAt: run.cfoReviewedAt || null,
        cfoReviewedBy: run.cfoReviewedBy || null,
        approvedAt: run.approvedAt || null,
        approvedBy: run.approvedBy || null,
        audit: (run.audit || []).map((entry) => ({
          at: entry.at,
          actor: entry.user,
          action: entry.action,
          from: entry.oldValue || undefined,
          to: entry.newValue || undefined,
          note: entry.comment || entry.reason || undefined,
        })),
      }
    : null;

const knownPayrollPeriods = async (runs: Awaited<ReturnType<typeof listPayrollRuns>>, currentPeriod: string) => {
  const periodState = await listPayrollPeriods();
  const seeded = [periodState.activePeriod, ...periodState.periods.map((item) => item.period), currentPeriod];
  return Array.from(new Set([...seeded, ...runs.map((run) => run.period)]))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .map((period) => {
      const run = runs.find((item) => item.period === period);
      const periodRecord = periodState.periods.find((item) => item.period === period);
      return {
        period,
        periodLabel: payrollPeriodLabel(period),
        status: run?.status || periodRecord?.status || 'Draft',
        employeeCount: run?.employeeCount || 0,
        netPay: run?.netPay || 0,
      };
    });
};

export const buildProcessingPayload = async (request: Request, requestedPeriod?: string) => {
  const { role, processingPerms } = await payrollSessionContext(request);
  const perms = processingPerms;
  const period = requestedPeriod || (await getActivePayrollPeriod());
  const [calculation, runs, run] = await Promise.all([
    calculatePayrollForPeriod(period),
    listPayrollRuns(),
    getPayrollRunForPeriod(period),
  ]);

  const summary = perms.canViewMoney
    ? calculation.summary
    : {
        ...calculation.summary,
        basePay: null,
        allowances: null,
        grossPay: null,
        totalDeductions: null,
        deductions: null,
        netPay: null,
        employerCost: null,
        sageGrossPay: null,
        sageNetPay: null,
        grossVariance: null,
        netVariance: null,
        averageDeductionRatio: null,
      };

  const records = perms.canViewMoney ? calculation.records : maskPayrollCalculationRecords(calculation.records);
  const byGroup = calculation.breakdowns.byPayrollGroup.map((item) =>
    perms.canViewMoney ? item : { ...item, grossPay: null, netPay: null },
  );

  return {
    generatedAt: calculation.generatedAt,
    source: calculation.source,
    dataSource: calculation.dataSource,
    enterpriseSourceActive: calculation.enterpriseSourceActive,
    period,
    periodLabel: calculation.periodLabel,
    role,
    permissions: perms,
    run: mapRunForProcessing(run),
    runs: runs.slice(0, 12).map((item) => mapRunForProcessing(item)).filter(Boolean),
    availablePeriods: await knownPayrollPeriods(runs, period),
    configurations: calculation.configurations,
    summary,
    records,
    breakdowns: {
      byPayrollGroup: byGroup,
      byComponent: perms.canViewMoney ? calculation.breakdowns.byComponent : [],
    },
    controls: [
      ...calculation.controls,
      {
        id: 'approval',
        label: 'Segregated Approval',
        status: run?.status || 'Draft',
        detail: 'HR Manager → Finance Manager → CFO → MD/CEO sequential sign-off with authenticated email notifications.',
        tone: run?.status === 'Posted' || run?.status === 'Locked' || run?.status === 'Approved' ? 'green' : 'violet',
      },
    ],
    approvalWorkflow: {
      stageLabel: resolvePayrollApprovalStageLabel(run),
      nextOwner: resolvePayrollApprovalNextOwner(run),
      stages: getPayrollApprovalStageState(run),
    },
  };
};

const mapManagementRun = (item: Awaited<ReturnType<typeof listPayrollRuns>>[number]) => ({
  id: item.id,
  period: item.period,
  status: item.status,
  employeeCount: item.employeeCount,
  grossPay: item.grossPay,
  deductions: item.deductions,
  netPay: item.netPay,
  createdAt: item.createdAt,
  createdBy: item.createdBy,
  validatedAt: item.validatedAt || null,
  validatedBy: item.validatedBy || null,
  submittedAt: item.submittedAt || null,
  submittedBy: item.submittedBy || null,
  hrReviewedAt: item.hrReviewedAt || null,
  hrReviewedBy: item.hrReviewedBy || null,
  financeReviewedAt: item.financeReviewedAt || null,
  financeReviewedBy: item.financeReviewedBy || null,
  cfoReviewedAt: item.cfoReviewedAt || null,
  cfoReviewedBy: item.cfoReviewedBy || null,
  approvedAt: item.approvedAt || null,
  approvedBy: item.approvedBy || null,
  releasedAt: item.releasedAt || null,
  releasedBy: item.releasedBy || null,
  lockedAt: item.lockedAt || null,
  payslipsGeneratedAt: item.payslipsGeneratedAt || null,
  payslipsGeneratedBy: item.payslipsGeneratedBy || null,
  bankScheduleGeneratedAt: item.bankScheduleGeneratedAt || null,
  bankScheduleGeneratedBy: item.bankScheduleGeneratedBy || null,
  statutorySchedulesGeneratedAt: item.statutorySchedulesGeneratedAt || null,
  statutorySchedulesGeneratedBy: item.statutorySchedulesGeneratedBy || null,
  postedAt: item.postedAt || null,
  postedBy: item.postedBy || null,
  closedAt: item.closedAt || null,
  reopenedAt: item.reopenedAt || null,
  reopenedBy: item.reopenedBy || null,
  reopenReason: item.reopenReason || null,
  artifacts: item.artifacts || [],
});

export const buildManagementPayload = async (request: Request, requestedPeriod?: string) => {
  const { role, permissions, isGlobalAdmin } = await payrollSessionContext(request);
  const perms = managementPermissions(role);
  const financeOnlyAccess = isFinancePayrollOnlyUser(permissions || [], { isGlobalAdmin });
  const fullPayrollAccess = hasFullPayrollManagementAccess(permissions || []) || Boolean(isGlobalAdmin);
  const salaryReviewAccess = !fullPayrollAccess && hasPayrollSalaryReviewAccess(permissions || []);
  const periodState = await listPayrollPeriods();
  const period = requestedPeriod || periodState.activePeriod || (await getActivePayrollPeriod());
  const [runs, run, auditTrail] = await Promise.all([listPayrollRuns(), getPayrollRunForPeriod(period), listPayrollAudit(50)]);
  const periodRecord = periodState.periods.find((item) => item.period === period) || null;
  const { calculation, dataMode, payrollComputed } = await resolvePeriodCalculation(period, run, periodRecord);
  const currentRun = run && run.period === period ? mapManagementRun(run) : null;
  const mappedRuns = runs.map(mapManagementRun);
  const records = perms.canViewMoney ? calculation.records : maskPayrollCalculationRecords(calculation.records);
  const exceptions = calculation.records
    .filter((record) => record.exceptionCount > 0)
    .flatMap((record) =>
      record.exceptions.map((issue, index) => ({
        id: `${record.employeeId}-${index}`,
        employeeId: record.employeeId,
        employeeName: record.fullName,
        issue,
        severity: record.riskSeverity,
        owner: issue.includes('Pay amount') || issue.includes('Payroll group') ? 'Payroll Officer' : issue.includes('status') ? 'HR Manager' : 'HR Officer',
      })),
    );

  const blocked = calculation.summary.blockedEmployees;
  const workflowStatus = currentRun?.status || (periodRecord?.status === 'Closed' ? 'Closed' : periodRecord?.status === 'Open' ? 'Draft' : periodRecord?.status || 'Draft');

  return {
    generatedAt: calculation.generatedAt,
    source: `${calculation.dataSource.source} and unified payroll engine`,
    dataSource: calculation.dataSource,
    role,
    permissions: perms,
    access: { financeOnlyAccess, salaryReviewAccess },
    period,
    periodLabel: calculation.periodLabel,
    dataMode,
    payrollComputed,
    isViewingActivePeriod: period === periodState.activePeriod,
    activePeriod: periodState.activePeriod,
    activePeriodLabel: payrollPeriodLabel(periodState.activePeriod),
    periodRecord: periodRecord
      ? {
          period: periodRecord.period,
          periodLabel: periodRecord.periodLabel,
          status: periodRecord.status,
          paymentDate: periodRecord.paymentDate,
          openedAt: periodRecord.openedAt,
          openedBy: periodRecord.openedBy,
          closedAt: periodRecord.closedAt,
          closedBy: periodRecord.closedBy,
        }
      : null,
    periods: periodState.periods.map((item) => {
      const periodRun = runs.find((row) => row.period === item.period);
      return {
        period: item.period,
        periodLabel: item.periodLabel,
        status: item.status,
        runStatus: periodRun?.status || null,
        runId: periodRun?.id || null,
        isActive: item.period === periodState.activePeriod,
        paymentDate: item.paymentDate,
        openedAt: item.openedAt,
        closedAt: item.closedAt,
      };
    }),
    summary: {
      totalEmployees: calculation.summary.employees,
      payrollEligible: calculation.summary.payrollEligible,
      readyEmployees: calculation.summary.readyEmployees,
      reviewEmployees: calculation.summary.reviewEmployees,
      readinessReadyEmployees: calculation.summary.readinessReadyEmployees,
      readinessAwaitingTimesheetEmployees: calculation.summary.readinessAwaitingTimesheetEmployees,
      readinessReviewEmployees: calculation.summary.readinessReviewEmployees,
      readinessBlockedEmployees: calculation.summary.readinessBlockedEmployees,
      blockedEmployees: calculation.summary.blockedEmployees,
      payrollCoveragePct: calculation.summary.employees
        ? Math.round((calculation.records.filter((record) => record.setupAssignedToPayroll).length / calculation.summary.employees) * 1000) / 10
        : 0,
      grossPay: payrollComputed ? roundMoney(calculation.summary.grossPay) : null,
      deductions: payrollComputed ? roundMoney(calculation.summary.deductions) : null,
      netPay: payrollComputed ? roundMoney(calculation.summary.netPay) : null,
      basePay: payrollComputed ? roundMoney(calculation.summary.basePay) : null,
      allowances: payrollComputed ? roundMoney(calculation.summary.allowances) : null,
      exceptionCount: calculation.summary.exceptionCount,
      deferredExceptionCount: calculation.summary.deferredExceptionCount,
    },
    toleranceMode: calculation.toleranceMode,
    enterpriseSourceActive: calculation.enterpriseSourceActive,
    currentRun,
    runs: mappedRuns.sort((a, b) => {
      if (a.period === period) return -1;
      if (b.period === period) return 1;
      return b.period.localeCompare(a.period);
    }),
    records,
    exceptions,
    breakdowns: {
      byPayrollGroup: calculation.breakdowns.byPayrollGroup,
      byDepartment: calculation.breakdowns.byDepartment.slice(0, 12),
      byEmploymentType: calculation.breakdowns.byEmploymentType,
    },
    controls: [
      { id: 'master-data', label: 'Master Data Validation', status: blocked ? 'Attention Required' : 'Passed', tone: blocked ? 'red' : 'green' },
      { id: 'statutory', label: 'PAYE, Pension, Statutory Funds', status: 'Calculated', tone: 'blue' },
      { id: 'approval', label: 'Segregated Approval', status: workflowStatus, tone: 'violet' },
      { id: 'audit', label: 'Payroll Audit Trail', status: 'Enabled', tone: 'cyan' },
    ],
    workflow: {
      currentStatus: workflowStatus,
      nextOwner: blocked
        ? 'Payroll Officer'
        : !currentRun?.validatedAt
          ? 'Payroll Supervisor'
          : !currentRun?.submittedAt
            ? 'Payroll Officer'
            : !currentRun?.hrReviewedAt
              ? 'HR Manager'
              : !currentRun?.financeReviewedAt
                ? 'Finance Manager'
            : !currentRun?.cfoReviewedAt
              ? 'CFO'
              : !currentRun?.approvedAt
                ? 'MD / CEO'
                : !currentRun?.releasedAt
                    ? 'Payroll Supervisor'
                    : !currentRun?.postedAt
                      ? 'Finance Manager'
                      : 'Payroll Officer',
      blockedActions: [
        ...(blocked ? ['Approval is blocked until validation exceptions are resolved.'] : []),
        ...(!currentRun?.approvedAt ? ['Payslip publishing, bank schedule generation, and journal posting require CFO approval.'] : []),
        ...(currentRun?.approvedAt && !currentRun.bankScheduleGeneratedAt ? ['Bank schedule must be generated before posting and closing.'] : []),
        ...(currentRun?.approvedAt && !currentRun.statutorySchedulesGeneratedAt ? ['Statutory schedules must be generated before posting and closing.'] : []),
        ...(currentRun?.postedAt && !currentRun.payslipsGeneratedAt ? ['Payslips must be published before period close.'] : []),
      ],
      approvalStage: blocked ? 'Validation' : resolvePayrollApprovalStageLabel(currentRun as UnifiedPayrollRun | null),
      stages: getPayrollApprovalStageState(currentRun as UnifiedPayrollRun | null),
    },
    auditTrail,
    artifacts: currentRun?.artifacts || [],
    deferredExceptionCount: calculation.summary.deferredExceptionCount,
  };
};
