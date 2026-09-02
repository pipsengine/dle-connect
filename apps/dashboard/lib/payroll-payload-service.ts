import {
  buildPayrollCalculationFromSnapshot,
  calculatePayrollForPeriod,
  filterPayrollCalculationByPack,
  maskPayrollCalculationRecords,
  summaryPayrollRecords,
  type PayrollCalculationRecord,
} from '@/lib/payroll-calculation-service';
import { buildPayrollJournalWorkspace } from '@/lib/payroll-journal-service';
import { getActivePayrollPeriod, listPayrollPeriods, payrollPeriodLabel } from '@/lib/payroll-period-store';
import {
  ensurePayrollRunsForPeriod,
  getPayrollRunForPeriod,
  listPayrollAudit,
  listPayrollRuns,
  listPayrollRunsForPeriod,
  readPayrollSnapshot,
  payrollRunPeriodLabelForPack,
  resolvePayrollRunCompany,
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
  PAYROLL_SCHEDULE_SCOPES,
  findPayrollScheduleScope,
  normalizePayrollCompany,
  type PayrollCompany,
} from '@/lib/payroll-schedule-scope';
import {
  summarizePayrollReadiness,
} from '@/lib/payroll-readiness';
import { reapplyPayrollValidationPolicy } from '@/lib/payroll-tolerance';
import { managementPermissions, payrollSessionContext, processingPermissions } from '@/lib/payroll-session';
import { hasBankFinanceAccess, hasFullPayrollManagementAccess, hasPayrollSalaryReviewAccess, isFinancePayrollOnlyUser, isRestrictedPayrollStageApprover } from '@/lib/access/payroll-access';
import {
  getPayrollApprovalStageState,
  resolvePayrollApprovalNextOwner,
  resolvePayrollApprovalStageLabel,
} from '@/lib/payroll-approval-workflow';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const FINALIZED_RUN_STATUSES = new Set([
  'Posted',
  'Published',
  'Closed',
]);

const COMPUTED_RUN_STATUSES = new Set([
  'Calculated',
  'Computed',
  'Validated',
  'Ready for Approval',
  'Submitted',
  'Under Review',
  'Finance Approved',
  'CFO Approved',
  'HR Approved',
  'Approved',
  'Released',
  'Locked',
  'Posted',
  'Published',
  'Closed',
]);

const isPayrollComputed = (run: UnifiedPayrollRun | null, periodRecord: { status: string } | null) => {
  if (periodRecord?.status === 'Closed' || periodRecord?.status === 'Posted' || periodRecord?.status === 'Locked') return true;
  if (!run) return false;
  if (run.status === 'Closed' || run.status === 'Posted' || run.status === 'Published' || run.status === 'Locked') return true;
  return COMPUTED_RUN_STATUSES.has(run.status);
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
    scheduleNetPay: Number(calculation.summary.scheduleNetPay || 0),
    scheduleGrossPay: Number(calculation.summary.scheduleGrossPay || 0),
    scheduleEmployees: Number(calculation.summary.scheduleEmployees || 0),
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
  if (periodRecord?.status === 'Closed' || periodRecord?.status === 'Posted' || periodRecord?.status === 'Locked') return true;
  if (run.status === 'Closed' || run.status === 'Posted' || run.status === 'Published') return true;
  return FINALIZED_RUN_STATUSES.has(run.status);
};

const refreshCalculationFromRecords = (
  calculation: Awaited<ReturnType<typeof calculatePayrollForPeriod>>,
  records: PayrollCalculationRecord[],
) => {
  const counted = summaryPayrollRecords(records);
  const ready = counted.filter((record) => record.status === 'Ready');
  const review = counted.filter((record) => record.status === 'Review');
  const blocked = counted.filter((record) => record.status === 'Blocked');
  const readiness = summarizePayrollReadiness(counted);
  const scheduleHeadcount = Number(calculation.summary.scheduleEmployees || 0);
  return {
    ...calculation,
    records,
    summary: {
      ...calculation.summary,
      employees: scheduleHeadcount || calculation.summary.employees,
      payrollEligible: scheduleHeadcount || calculation.summary.payrollEligible,
      ready: scheduleHeadcount || ready.length,
      review: review.length,
      blocked: blocked.length,
      blockedEmployees: blocked.length,
      readyEmployees: scheduleHeadcount || ready.length,
      reviewEmployees: review.length,
      readinessReadyEmployees: scheduleHeadcount || readiness.readinessReadyEmployees,
      readinessAwaitingTimesheetEmployees: readiness.readinessAwaitingTimesheetEmployees,
      readinessReviewEmployees: readiness.readinessReviewEmployees,
      readinessBlockedEmployees: readiness.readinessBlockedEmployees,
      exceptionCount: counted.reduce((sum, record) => sum + Number(record.exceptionCount || 0), 0),
      deferredExceptionCount: counted.reduce((sum, record) => sum + Number(record.deferredWarnings?.length || 0), 0),
    },
  };
};

const resolvePeriodCalculation = async (
  period: string,
  run: UnifiedPayrollRun | null,
  periodRecord: { status: string } | null,
  packOverride?: PayrollRunPack | null,
  companyOverride?: PayrollCompany | null,
) => {
  const payrollComputed = isPayrollComputed(run, periodRecord);
  const pack = packOverride || (run ? resolvePayrollRunPack(run) : undefined);
  const company = companyOverride || (run ? resolvePayrollRunCompany(run) : null);

  if (payrollComputed && run) {
    const snapshot = await readPayrollSnapshot(run.id);
    if (shouldUseSnapshot(run, periodRecord, snapshot) && snapshot) {
      let calculation = await buildPayrollCalculationFromSnapshot(period, snapshot);
      if (pack) calculation = filterPayrollCalculationByPack(calculation, pack, company);
      return { calculation, dataMode: 'snapshot' as const, payrollComputed: true };
    }
  }

  const live = await calculatePayrollForPeriod(period, pack ? { pack, company } : undefined);
  const normalizedLive = refreshCalculationFromRecords(live, reapplyPayrollValidationPolicy(live.records, live.toleranceMode));

  if (!payrollComputed) {
    return { calculation: stripPendingPayrollAmounts(normalizedLive), dataMode: 'pending' as const, payrollComputed: false };
  }

  // Always return LIVE records for any Open / mutable period status. Only snapshot for Closed/Posted/Locked/Published.
  return { calculation: normalizedLive, dataMode: 'live' as const, payrollComputed: true };
};

/**
 * Live totals for every pack in the period, not the amounts persisted on the run header.
 * Run headers are only rewritten by calculate/create-run/validate/submit, so reading them
 * makes the unselected pack show whatever the last compute happened to write, while the
 * selected pack shows today's figures. The period total is what the NGN Excel export
 * covers, so the cards can be reconciled against the workbook.
 */
const runMatchesScope = (run: UnifiedPayrollRun, pack: PayrollRunPack, company: PayrollCompany) =>
  resolvePayrollRunPack(run) === pack && resolvePayrollRunCompany(run) === company;

const buildPackTotals = async (
  period: string,
  packRunsSource: UnifiedPayrollRun[],
  periodRecord: { status: string } | null,
  selected: { pack: PayrollRunPack; company: PayrollCompany; calculation: Awaited<ReturnType<typeof calculatePayrollForPeriod>>; payrollComputed: boolean },
) => {
  const scheduleTotals = await Promise.all(PAYROLL_SCHEDULE_SCOPES.map(async (scope) => {
    const run = packRunsSource.find((item) => runMatchesScope(item, scope.pack, scope.company)) || null;
    const resolved = scope.pack === selected.pack && scope.company === selected.company
      ? { calculation: selected.calculation, payrollComputed: selected.payrollComputed }
      : await resolvePeriodCalculation(period, run, periodRecord, scope.pack, scope.company).catch(() => null);
    const summary = resolved?.calculation.summary;
    return {
      id: scope.id,
      pack: scope.pack,
      company: scope.company,
      packLabel: scope.label,
      href: scope.href,
      runId: run?.id || null,
      status: run?.status || 'Draft',
      computed: Boolean(resolved?.payrollComputed),
      employeeCount: Number(summary?.payrollEligible || 0),
      readyEmployees: Number(summary?.readyEmployees || 0),
      grossPay: roundMoney(Number(summary?.grossPay || 0)),
      deductions: roundMoney(Number(summary?.deductions || 0)),
      netPay: roundMoney(Number(summary?.netPay || 0)),
    };
  }));
  const totals = PAYROLL_RUN_PACKS.map((pack) => {
    const items = scheduleTotals.filter((item) => item.pack === pack);
    return {
      pack,
      packLabel: payrollRunPackShortLabel(pack),
      runId: items.find((item) => item.company === selected.company)?.runId || items[0]?.runId || null,
      status: items.find((item) => item.company === selected.company)?.status || items[0]?.status || 'Draft',
      computed: items.some((item) => item.computed),
      employeeCount: items.reduce((sum, item) => sum + item.employeeCount, 0),
      readyEmployees: items.reduce((sum, item) => sum + item.readyEmployees, 0),
      grossPay: roundMoney(items.reduce((sum, item) => sum + item.grossPay, 0)),
      deductions: roundMoney(items.reduce((sum, item) => sum + item.deductions, 0)),
      netPay: roundMoney(items.reduce((sum, item) => sum + item.netPay, 0)),
    };
  });

  const periodTotals = scheduleTotals.reduce(
    (acc, item) => ({
      employeeCount: acc.employeeCount + item.employeeCount,
      readyEmployees: acc.readyEmployees + item.readyEmployees,
      grossPay: roundMoney(acc.grossPay + item.grossPay),
      deductions: roundMoney(acc.deductions + item.deductions),
      netPay: roundMoney(acc.netPay + item.netPay),
      computedPacks: acc.computedPacks + (item.computed ? 1 : 0),
    }),
    { employeeCount: 0, readyEmployees: 0, grossPay: 0, deductions: 0, netPay: 0, computedPacks: 0 },
  );

  return {
    packTotals: totals,
    scheduleTotals,
    periodTotals: { ...periodTotals, allPacksComputed: periodTotals.computedPacks === PAYROLL_SCHEDULE_SCOPES.length },
  };
};

const mapRunForProcessing = (run: Awaited<ReturnType<typeof getPayrollRunForPeriod>>) => {
  if (!run) return null;
  const pack = resolvePayrollRunPack(run);
  const company = resolvePayrollRunCompany(run);
  const scope = company ? findPayrollScheduleScope(pack, company) : null;
  return {
        id: run.id,
        period: run.period,
        periodLabel: payrollRunPeriodLabelForPack(payrollPeriodLabel(run.period), pack, company),
        pack,
        company,
        packLabel: scope?.label || payrollRunPackShortLabel(pack),
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
        lastReminderAt: run.lastReminderAt || null,
        lastReminderStageId: run.lastReminderStageId || null,
        audit: (run.audit || []).map((entry) => ({
          at: entry.at,
          actor: entry.user,
          action: entry.action,
          from: entry.oldValue || undefined,
          to: entry.newValue || undefined,
          note: entry.comment || entry.reason || undefined,
        })),
  };
};

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
          company: resolvePayrollRunCompany(item),
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
  company: PayrollCompany = 'DLE',
) => {
  const scopedRun = run ? { ...run, pack: resolvePayrollRunPack(run) || pack, company: resolvePayrollRunCompany(run) || company } : null;
  const { calculation, dataMode, payrollComputed } = await resolvePeriodCalculation(period, scopedRun, periodRecord, pack, company);
  const scope = findPayrollScheduleScope(pack, company);

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
    company,
    packLabel: scope.label,
    scheduleId: scope.id,
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
  requestedCompany?: string | null,
) => {
  const { role, processingPerms } = await payrollSessionContext(request);
  const perms = processingPerms;
  const period = requestedPeriod || (await getActivePayrollPeriod());
  const pack = normalizePayrollRunPack(requestedPack) || 'salaried';
  const company = normalizePayrollCompany(requestedCompany) || 'DLE';
  const scope = findPayrollScheduleScope(pack, company);
  const periodState = await listPayrollPeriods();
  const periodRecord = periodState.periods.find((item) => item.period === period) || null;

  const [fullCalculation, runs, periodPackRuns] = await Promise.all([
    calculatePayrollForPeriod(period),
    listPayrollRuns(),
    listPayrollRunsForPeriod(period),
  ]);

  let packRuns = periodPackRuns;
  const missingScope = PAYROLL_SCHEDULE_SCOPES.some(
    (item) => !packRuns.some((run) => runMatchesScope(run, item.pack, item.company)),
  );
  if (!packRuns.length || missingScope) {
    packRuns = await ensurePayrollRunsForPeriod(period, payrollPeriodLabel(period), 'System');
  }

  const packPayloads = await Promise.all(
    PAYROLL_SCHEDULE_SCOPES.map(async (item) => {
      const packRun = packRuns.find((run) => runMatchesScope(run, item.pack, item.company)) || null;
      return buildPackPayload(period, item.pack, packRun, periodRecord, perms.canViewMoney, item.company);
    }),
  );
  const activePack = packPayloads.find((item) => item.pack === pack && item.company === company) || packPayloads[0];

  return {
    generatedAt: fullCalculation.generatedAt,
    source: fullCalculation.source,
    dataSource: fullCalculation.dataSource,
    enterpriseSourceActive: fullCalculation.enterpriseSourceActive,
    period,
    periodLabel: payrollRunPeriodLabelForPack(payrollPeriodLabel(period), pack, company),
    pack: activePack.pack,
    company,
    packLabel: activePack.packLabel,
    scheduleId: scope.id,
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
        detail: `HR Manager → Finance Manager → CFO → MD/CEO for ${activePack.packLabel}. Timesheet HR ack feeds OT/daily-rate; this run approval is the executive schedule sign-off.`,
        tone: activePack.run?.status === 'Posted' || activePack.run?.status === 'Locked' || activePack.run?.status === 'Approved' ? 'green' : 'violet',
      },
      {
        id: 'schedule-split',
        label: 'Four payroll schedules',
        status: 'Split cost',
        detail: 'DLE Salaries, DLPC Salaries, DLE Day-rate, and DLPC Day-rate are independent runs with the same approval chain.',
        tone: 'cyan',
      },
    ],
    approvalWorkflow: activePack.approvalWorkflow,
  };
};

const mapManagementRun = (item: Awaited<ReturnType<typeof listPayrollRuns>>[number]) => {
  const pack = resolvePayrollRunPack(item);
  const company = resolvePayrollRunCompany(item);
  const scope = company ? findPayrollScheduleScope(pack, company) : null;
  return {
  id: item.id,
  period: item.period,
  pack,
  company,
  packLabel: scope?.label || payrollRunPackShortLabel(pack),
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
  };
};

export const buildManagementPayload = async (
  request: Request,
  requestedPeriod?: string,
  requestedPack?: string | null,
  requestedCompany?: string | null,
) => {
  const { role, permissions, isGlobalAdmin, session } = await payrollSessionContext(request);
  const perms = managementPermissions(role, { isGlobalAdmin });
  const identity = {
    isGlobalAdmin,
    roles: session?.roles || [],
    employeeCode: session?.employeeCode,
    username: session?.username,
  };
  const restrictedApprover = isRestrictedPayrollStageApprover(identity);
  const financeOnlyAccess = restrictedApprover
    ? hasBankFinanceAccess(permissions || [])
    : isFinancePayrollOnlyUser(permissions || [], identity);
  const fullPayrollAccess = !restrictedApprover && (hasFullPayrollManagementAccess(permissions || []) || Boolean(isGlobalAdmin));
  const salaryReviewAccess = restrictedApprover || (!fullPayrollAccess && hasPayrollSalaryReviewAccess(permissions || []));
  const periodState = await listPayrollPeriods();
  const period = requestedPeriod || periodState.activePeriod || (await getActivePayrollPeriod());
  const pack = normalizePayrollRunPack(requestedPack) || 'salaried';
  const company = normalizePayrollCompany(requestedCompany) || 'DLE';
  const scope = findPayrollScheduleScope(pack, company);
  const [runs, periodPackRuns, auditTrail] = await Promise.all([
    listPayrollRuns(),
    listPayrollRunsForPeriod(period),
    listPayrollAudit(50),
  ]);
  const periodRecord = periodState.periods.find((item) => item.period === period) || null;
  let packRunsSource = periodPackRuns;
  const missingScope = PAYROLL_SCHEDULE_SCOPES.some(
    (item) => !packRunsSource.some((run) => runMatchesScope(run, item.pack, item.company)),
  );
  if (!packRunsSource.length || missingScope) {
    packRunsSource = await ensurePayrollRunsForPeriod(period, payrollPeriodLabel(period), 'System');
  }
  const selectedRun = packRunsSource.find((item) => runMatchesScope(item, pack, company))
    || (await getPayrollRunForPeriod(period, pack, company))
    || null;
  const { calculation, dataMode, payrollComputed } = await resolvePeriodCalculation(period, selectedRun, periodRecord, pack, company);
  const { packTotals, scheduleTotals, periodTotals } = await buildPackTotals(period, packRunsSource, periodRecord, {
    pack,
    company,
    calculation,
    payrollComputed,
  });
  const currentRun = selectedRun && selectedRun.period === period ? mapManagementRun(selectedRun) : null;
  const mappedRuns = runs.map(mapManagementRun);
  const packRuns = packRunsSource.map(mapManagementRun);
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
  const journal = await buildPayrollJournalWorkspace({
    calculation,
    run: selectedRun,
    pack,
  }).catch(() => null);

  return {
    generatedAt: calculation.generatedAt,
    source: `${calculation.dataSource.source} and unified payroll engine`,
    dataSource: calculation.dataSource,
    role,
    permissions: perms,
    access: { financeOnlyAccess, salaryReviewAccess },
    period,
    periodLabel: payrollRunPeriodLabelForPack(payrollPeriodLabel(period), pack, company),
    pack,
    company,
    packLabel: scope.label,
    scheduleId: scope.id,
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
      const periodRun = itemPackRuns.find((row) => runMatchesScope(row, pack, company))
        || itemPackRuns.find((row) => resolvePayrollRunPack(row) === pack)
        || itemPackRuns[0];
      return {
        period: item.period,
        periodLabel: item.periodLabel,
        status: item.status,
        runStatus: periodRun?.status || null,
        runId: periodRun?.id || null,
        packs: itemPackRuns.map((row) => ({
          pack: resolvePayrollRunPack(row),
          company: resolvePayrollRunCompany(row),
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
      scheduleNetPay: Number(calculation.summary.scheduleNetPay || 0) || null,
      scheduleGrossPay: Number(calculation.summary.scheduleGrossPay || 0) || null,
      basePay: payrollComputed ? roundMoney(calculation.summary.basePay) : null,
      allowances: payrollComputed ? roundMoney(calculation.summary.allowances) : null,
      exceptionCount: calculation.summary.exceptionCount,
      deferredExceptionCount: calculation.summary.deferredExceptionCount,
    },
    packTotals,
    scheduleTotals,
    periodTotals,
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
                    : !currentRun?.payslipsGeneratedAt || !currentRun?.bankScheduleGeneratedAt || !currentRun?.statutorySchedulesGeneratedAt
                      ? 'Payroll Officer'
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
    journal,
    deferredExceptionCount: calculation.summary.deferredExceptionCount,
  };
};
