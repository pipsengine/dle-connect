import {
  buildPayrollCalculationFromSnapshot,
  calculatePayrollForPeriod,
  maskPayrollCalculationRecords,
  type PayrollCalculationRecord,
} from '@/lib/payroll-calculation-service';
import { getActivePayrollPeriod, listPayrollPeriods, payrollPeriodLabel } from '@/lib/payroll-period-store';
import {
  ensurePayrollRunsForPeriod,
  getPayrollRunForPeriod,
  listPayrollAudit,
  listPayrollRuns,
  listPayrollRunsForPeriod,
  readPayrollSnapshot,
  resolvePayrollRunPack,
  type PayrollRunPack,
  type PayrollRunSnapshot,
  type UnifiedPayrollRun,
} from '@/lib/payroll-run-store';
import {
  PAYROLL_RUN_PACKS,
  normalizePayrollRunPack,
  payrollRunPackShortLabel,
} from '@/lib/payroll-employee-classification';
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

const resolvePeriodCalculation = async (
  period: string,
  run: UnifiedPayrollRun | null,
  periodRecord: { status: string } | null,
  packOverride?: PayrollRunPack | null,
) => {
  const payrollComputed = isPayrollComputed(run, periodRecord);
  const pack = packOverride || (run ? resolvePayrollRunPack(run) : undefined);

  if (payrollComputed && run) {
    const snapshot = await readPayrollSnapshot(run.id);
    if (shouldUseSnapshot(run, periodRecord, snapshot) && snapshot) {
      const calculation = await buildPayrollCalculationFromSnapshot(period, snapshot);
      return { calculation, dataMode: 'snapshot' as const, payrollComputed: true };
    }
  }

  const live = await calculatePayrollForPeriod(period, pack ? { pack } : undefined);
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
          employerCost: roundMoney(run.employerCost),
          payrollEligible: run.employeeCount || live.summary.payrollEligible,
          employees: run.employeeCount || live.summary.employees,
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
        pack: resolvePayrollRunPack(run),
        packLabel: payrollRunPackShortLabel(resolvePayrollRunPack(run)),
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
      const periodRuns = runs.filter((item) => item.period === period);
      const run = periodRuns.find((item) => resolvePayrollRunPack(item) === 'salaried') || periodRuns[0];
      const periodRecord = periodState.periods.find((item) => item.period === period);
      return {
        period,
        periodLabel: payrollPeriodLabel(period),
        status: run?.status || periodRecord?.status || 'Draft',
        employeeCount: periodRuns.reduce((sum, item) => sum + Number(item.employeeCount || 0), 0),
        netPay: periodRuns.reduce((sum, item) => sum + Number(item.netPay || 0), 0),
        packs: periodRuns.map((item) => ({
          pack: resolvePayrollRunPack(item),
          status: item.status,
          netPay: item.netPay,
          employeeCount: item.employeeCount,
        })),
      };
    });
};

const buildPackPayload = async (
  period: string,
  pack: PayrollRunPack,
  run: UnifiedPayrollRun | null,
  periodRecord: { status: string } | null,
  canViewMoney: boolean,
) => {
  const scopedRun = run ? { ...run, pack: resolvePayrollRunPack(run) || pack } : null;
  const { calculation, dataMode, payrollComputed } = await resolvePeriodCalculation(period, scopedRun, periodRecord, pack);

  const summary = canViewMoney
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

  return {
    pack,
    packLabel: payrollRunPackShortLabel(pack),
    run: mapRunForProcessing(scopedRun),
    dataMode,
    payrollComputed,
    summary,
    records: canViewMoney ? calculation.records : maskPayrollCalculationRecords(calculation.records),
    breakdowns: {
      byPayrollGroup: calculation.breakdowns.byPayrollGroup.map((item) =>
        canViewMoney ? item : { ...item, grossPay: null, netPay: null },
      ),
      byComponent: canViewMoney ? calculation.breakdowns.byComponent : [],
    },
    controls: calculation.controls,
    approvalWorkflow: {
      stageLabel: resolvePayrollApprovalStageLabel(scopedRun),
      nextOwner: resolvePayrollApprovalNextOwner(scopedRun),
      stages: getPayrollApprovalStageState(scopedRun),
      currentOwnerHint: resolvePayrollApprovalNextOwner(scopedRun),
    },
  };
};

export const buildProcessingPayload = async (
  request: Request,
  requestedPeriod?: string,
  requestedPack?: string | null,
) => {
  const { role, processingPerms } = await payrollSessionContext(request);
  const perms = processingPerms;
  const period = requestedPeriod || (await getActivePayrollPeriod());
  const pack = normalizePayrollRunPack(requestedPack) || 'salaried';
  const periodState = await listPayrollPeriods();
  const periodRecord = periodState.periods.find((item) => item.period === period) || null;

  const [fullCalculation, runs, periodPackRuns] = await Promise.all([
    calculatePayrollForPeriod(period),
    listPayrollRuns(),
    listPayrollRunsForPeriod(period),
  ]);

  let packRuns = periodPackRuns;
  // Always ensure both salaried + daily-rate runs exist (legacy periods often only have one).
  const missingPack = PAYROLL_RUN_PACKS.some(
    (itemPack) => !packRuns.some((item) => resolvePayrollRunPack(item) === itemPack),
  );
  if (!packRuns.length || missingPack) {
    packRuns = await ensurePayrollRunsForPeriod(period, payrollPeriodLabel(period), 'System');
  }

  const packPayloads = await Promise.all(
    PAYROLL_RUN_PACKS.map(async (itemPack) => {
      const packRun = packRuns.find((item) => resolvePayrollRunPack(item) === itemPack) || null;
      return buildPackPayload(period, itemPack, packRun, periodRecord, perms.canViewMoney);
    }),
  );
  const activePack = packPayloads.find((item) => item.pack === pack) || packPayloads[0];

  return {
    generatedAt: fullCalculation.generatedAt,
    source: fullCalculation.source,
    dataSource: fullCalculation.dataSource,
    enterpriseSourceActive: fullCalculation.enterpriseSourceActive,
    period,
    periodLabel: payrollPeriodLabel(period),
    pack: activePack.pack,
    packLabel: activePack.packLabel,
    role,
    permissions: perms,
    run: activePack.run,
    runs: runs.slice(0, 24).map((item) => mapRunForProcessing(item)).filter(Boolean),
    packRuns: packPayloads.map((item) => item.run).filter(Boolean),
    packs: packPayloads,
    availablePeriods: await knownPayrollPeriods(runs, period),
    configurations: fullCalculation.configurations,
    summary: activePack.summary,
    records: activePack.records,
    breakdowns: activePack.breakdowns,
    controls: [
      ...activePack.controls,
      {
        id: 'approval',
        label: 'Segregated Approval',
        status: activePack.run?.status || 'Draft',
        detail: `HR Manager → Finance Manager → CFO → MD/CEO for ${activePack.packLabel}. Timesheet HR ack feeds OT/daily-rate; this run approval is the executive pack sign-off.`,
        tone: activePack.run?.status === 'Posted' || activePack.run?.status === 'Locked' || activePack.run?.status === 'Approved' ? 'green' : 'violet',
      },
      {
        id: 'dual-pack',
        label: 'Dual payroll packs',
        status: 'Split cost',
        detail: 'Salaried/Stipend and Contract Daily Rate are separate runs with the same approval chain and independent cost totals.',
        tone: 'cyan',
      },
    ],
    approvalWorkflow: activePack.approvalWorkflow,
  };
};

const mapManagementRun = (item: Awaited<ReturnType<typeof listPayrollRuns>>[number]) => ({
  id: item.id,
  period: item.period,
  pack: resolvePayrollRunPack(item),
  packLabel: payrollRunPackShortLabel(resolvePayrollRunPack(item)),
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
  const [runs, periodPackRuns, auditTrail] = await Promise.all([
    listPayrollRuns(),
    listPayrollRunsForPeriod(period),
    listPayrollAudit(50),
  ]);
  const periodRecord = periodState.periods.find((item) => item.period === period) || null;
  const salariedRun = periodPackRuns.find((item) => resolvePayrollRunPack(item) === 'salaried') || (await getPayrollRunForPeriod(period, 'salaried'));
  const { calculation, dataMode, payrollComputed } = await resolvePeriodCalculation(period, salariedRun, periodRecord);
  const currentRun = salariedRun && salariedRun.period === period ? mapManagementRun(salariedRun) : null;
  const mappedRuns = runs.map(mapManagementRun);
  const packRuns = periodPackRuns.map(mapManagementRun);
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
      const itemPackRuns = runs.filter((row) => row.period === item.period);
      const periodRun = itemPackRuns.find((row) => resolvePayrollRunPack(row) === 'salaried') || itemPackRuns[0];
      return {
        period: item.period,
        periodLabel: item.periodLabel,
        status: item.status,
        runStatus: periodRun?.status || null,
        runId: periodRun?.id || null,
        packs: itemPackRuns.map((row) => ({
          pack: resolvePayrollRunPack(row),
          status: row.status,
          netPay: row.netPay,
          employeeCount: row.employeeCount,
          runId: row.id,
        })),
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
    packRuns,
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
