/**
 * Consolidated Salaries Summary for Payroll Approval.
 * All money is NGN; DLE USD is converted with a locked USD→NGN FX rate.
 */
import {
  isDleUsdExpatriateEmployee,
  isDleUsdMdEmployee,
  resolvePayrollRegisterSection,
} from '@/lib/payroll-bank-schedule-packs';
import { PAYROLL_SCHEDULE_SCOPES } from '@/lib/payroll-schedule-scope';
import {
  buildPayrollMonthOverMonth,
  shortPayrollPeriodLabel,
  type PayrollMomTotals,
  type PayrollMonthOverMonth,
} from '@/lib/payroll-month-over-month';
import { payrollPeriodLabel } from '@/lib/payroll-period-store';

const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export type PayrollSalariesSummaryScheduleRow = {
  id: string;
  label: string;
  headcount: number;
  grossPayNgn: number;
  deductionsNgn: number;
  netPayNgn: number;
  employerCostNgn: number;
  pctOfTotal: number;
  status: string;
  nativeCurrency: 'NGN' | 'USD';
  nativeGrossPay: number;
};

export type PayrollSalariesSummaryCategoryRow = {
  id: 'permanent' | 'contract' | 'expatriate';
  label: string;
  headcount: number;
  grossPayNgn: number;
  pctOfTotal: number;
};

export type PayrollSalariesSummaryDriver = {
  id: string;
  label: string;
  varianceNgn: number;
};

export type PayrollSalariesSummary = {
  period: string;
  periodLabel: string;
  periodStatus: string;
  validated: boolean;
  lockedFx: {
    rate: number;
    rateDate: string;
    source: string;
    display: string;
  };
  headcount: {
    total: number;
    ngn: number;
    usd: number;
  };
  totalsNgn: {
    grossPay: number;
    totalEarnings: number;
    deductions: number;
    netPay: number;
    employerCost: number;
  };
  priorTotalsNgn: (PayrollMomTotals & { totalEarnings: number }) | null;
  usdNative: {
    grossPay: number;
    deductions: number;
    netPay: number;
    employerCost: number;
    headcount: number;
  };
  schedules: PayrollSalariesSummaryScheduleRow[];
  categories: PayrollSalariesSummaryCategoryRow[];
  currencyMix: {
    ngnGrossNgn: number;
    usdGrossNgn: number;
    ngnPct: number;
    usdPct: number;
  };
  varianceDrivers: PayrollSalariesSummaryDriver[];
  monthOverMonth: PayrollMonthOverMonth | null;
};

export { SALARIES_SUMMARY_VIEW_ID } from '@/lib/payroll-schedule-scope';

type SummaryPackLike = {
  scheduleId?: string | null;
  packLabel?: string | null;
  pack?: string | null;
  company?: string | null;
  payrollComputed?: boolean;
  run?: { status?: string | null; employeeCount?: number | null } | null;
  summary?: {
    employees?: number | null;
    payrollEligible?: number | null;
    basePay?: number | null;
    allowances?: number | null;
    grossPay?: number | null;
    totalDeductions?: number | null;
    deductions?: number | null;
    netPay?: number | null;
    employerCost?: number | null;
  } | null;
  records?: Array<{
    employeeId?: string | null;
    employeeCode?: string | null;
    fullName?: string | null;
    payCurrency?: string | null;
    payrollGroup?: string | null;
    employmentType?: string | null;
    jobTitle?: string | null;
    isDailyRate?: boolean | null;
    expatriate?: boolean | null;
    basePay?: number | null;
    allowances?: number | null;
    grossPay?: number | null;
    totalDeductions?: number | null;
    deductions?: number | null;
    netPay?: number | null;
    employerCost?: number | null;
  }> | null;
};

const periodEndDate = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) return new Date();
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(Date.UTC(year, month, 0));
};

const moneyOf = (value: number | null | undefined) => roundMoney(Number(value || 0));

const headcountOf = (pack: SummaryPackLike) =>
  Number(pack.summary?.employees || pack.summary?.payrollEligible || pack.run?.employeeCount || pack.records?.length || 0);

const classifyCategory = (record: NonNullable<SummaryPackLike['records']>[number]): PayrollSalariesSummaryCategoryRow['id'] => {
  if (isDleUsdExpatriateEmployee(record) || Boolean(record.expatriate) || /expat/i.test(String(record.employmentType || ''))) {
    return 'expatriate';
  }
  if (record.isDailyRate || isDleUsdMdEmployee(record)) return 'contract';
  const section = resolvePayrollRegisterSection(record);
  if (section === 'dle-usd-expatriate') return 'expatriate';
  if (section === 'ngn-contract-lumpsum' || section === 'ngn-it-nysc' || section === 'dle-usd-contract-md') return 'contract';
  return 'permanent';
};

const packEarningsNative = (pack: SummaryPackLike | undefined) => {
  const base = moneyOf(pack?.summary?.basePay);
  const allowances = moneyOf(pack?.summary?.allowances);
  const fromParts = roundMoney(base + allowances);
  if (fromParts > 0.005) return fromParts;
  return moneyOf(pack?.summary?.grossPay);
};

export const buildPayrollSalariesSummary = (input: {
  period: string;
  packs: SummaryPackLike[];
  lockedFx: { rate: number; rateDate: string; source: string };
  priorTotalsNgn?: PayrollMomTotals | null;
  priorTotalEarningsNgn?: number | null;
  priorSchedules?: PayrollSalariesSummaryScheduleRow[] | null;
}): PayrollSalariesSummary => {
  const periodLabel = payrollPeriodLabel(input.period);
  const fx = Math.max(0, Number(input.lockedFx.rate || 0)) || 1;
  const toNgn = (amount: number, currency: 'NGN' | 'USD') =>
    currency === 'USD' ? roundMoney(amount * fx) : roundMoney(amount);

  const byId = new Map(input.packs.map((pack) => [String(pack.scheduleId || ''), pack]));
  const schedules: PayrollSalariesSummaryScheduleRow[] = PAYROLL_SCHEDULE_SCOPES.map((scope) => {
    const pack = byId.get(scope.id);
    const nativeCurrency: 'NGN' | 'USD' = scope.currencySlice === 'usd' ? 'USD' : 'NGN';
    const gross = moneyOf(pack?.summary?.grossPay);
    const deductions = moneyOf(pack?.summary?.totalDeductions ?? pack?.summary?.deductions);
    const net = moneyOf(pack?.summary?.netPay);
    const employer = moneyOf(pack?.summary?.employerCost);
    return {
      id: scope.id,
      label: scope.label,
      headcount: pack ? headcountOf(pack) : 0,
      grossPayNgn: toNgn(gross, nativeCurrency),
      deductionsNgn: toNgn(deductions, nativeCurrency),
      netPayNgn: toNgn(net, nativeCurrency),
      employerCostNgn: toNgn(employer, nativeCurrency),
      pctOfTotal: 0,
      status: pack?.run?.status || (pack?.payrollComputed ? 'Computed' : 'Draft'),
      nativeCurrency,
      nativeGrossPay: gross,
    };
  });

  let totalEarningsNgn = 0;
  for (const scope of PAYROLL_SCHEDULE_SCOPES) {
    const pack = byId.get(scope.id);
    const nativeCurrency: 'NGN' | 'USD' = scope.currencySlice === 'usd' ? 'USD' : 'NGN';
    totalEarningsNgn = roundMoney(totalEarningsNgn + toNgn(packEarningsNative(pack), nativeCurrency));
  }

  const totalsNgn = schedules.reduce(
    (acc, row) => ({
      grossPay: roundMoney(acc.grossPay + row.grossPayNgn),
      deductions: roundMoney(acc.deductions + row.deductionsNgn),
      netPay: roundMoney(acc.netPay + row.netPayNgn),
      employerCost: roundMoney(acc.employerCost + row.employerCostNgn),
    }),
    { grossPay: 0, deductions: 0, netPay: 0, employerCost: 0 },
  );
  if (totalEarningsNgn < 0.005) totalEarningsNgn = totalsNgn.grossPay;

  const withPct = schedules.map((row) => ({
    ...row,
    pctOfTotal: totalsNgn.grossPay > 0 ? roundMoney((row.grossPayNgn / totalsNgn.grossPay) * 1000) / 10 : 0,
  }));

  const categoryBuckets: Record<PayrollSalariesSummaryCategoryRow['id'], { headcount: number; grossPayNgn: number }> = {
    permanent: { headcount: 0, grossPayNgn: 0 },
    contract: { headcount: 0, grossPayNgn: 0 },
    expatriate: { headcount: 0, grossPayNgn: 0 },
  };

  for (const scope of PAYROLL_SCHEDULE_SCOPES) {
    const pack = byId.get(scope.id);
    const nativeCurrency: 'NGN' | 'USD' = scope.currencySlice === 'usd' ? 'USD' : 'NGN';
    for (const record of pack?.records || []) {
      const category = classifyCategory(record);
      categoryBuckets[category].headcount += 1;
      categoryBuckets[category].grossPayNgn = roundMoney(
        categoryBuckets[category].grossPayNgn + toNgn(moneyOf(record.grossPay), nativeCurrency),
      );
    }
  }

  const categoryTotalGross = Object.values(categoryBuckets).reduce((sum, item) => sum + item.grossPayNgn, 0);
  const categories: PayrollSalariesSummaryCategoryRow[] = (
    [
      ['permanent', 'Permanent'],
      ['contract', 'Contract'],
      ['expatriate', 'Expatriate'],
    ] as const
  ).map(([id, label]) => ({
    id,
    label,
    headcount: categoryBuckets[id].headcount,
    grossPayNgn: categoryBuckets[id].grossPayNgn,
    pctOfTotal: categoryTotalGross > 0
      ? roundMoney((categoryBuckets[id].grossPayNgn / categoryTotalGross) * 1000) / 10
      : 0,
  }));

  const usdRow = withPct.find((row) => row.id === 'dle-usd');
  const ngnGross = roundMoney(totalsNgn.grossPay - (usdRow?.grossPayNgn || 0));
  const usdGrossNgn = usdRow?.grossPayNgn || 0;
  const ngnHeadcount = withPct.filter((row) => row.id !== 'dle-usd').reduce((sum, row) => sum + row.headcount, 0);
  const usdHeadcount = usdRow?.headcount || 0;
  const totalHeadcount = ngnHeadcount + usdHeadcount;

  const currentMom: PayrollMomTotals = {
    period: input.period,
    periodLabel,
    employees: totalHeadcount,
    grossPay: totalsNgn.grossPay,
    deductions: totalsNgn.deductions,
    netPay: totalsNgn.netPay,
    employerCost: totalsNgn.employerCost,
  };
  const monthOverMonth = buildPayrollMonthOverMonth({
    currentPeriod: input.period,
    currentPeriodLabel: periodLabel,
    current: currentMom,
    previous: input.priorTotalsNgn
      ? {
          ...input.priorTotalsNgn,
          // Keep MoM metrics on gross-family totals; earnings compared separately in UI.
        }
      : null,
    includeMoneyDetails: false,
  });

  const priorById = new Map((input.priorSchedules || []).map((row) => [row.id, row]));
  const varianceDrivers: PayrollSalariesSummaryDriver[] = withPct
    .map((row) => {
      const prior = priorById.get(row.id);
      return {
        id: row.id,
        label: row.label.replace(/\s+Salaries$/i, '').replace(/\s+Day-rate$/i, ' Day-rate'),
        varianceNgn: roundMoney(row.grossPayNgn - (prior?.grossPayNgn || 0)),
      };
    })
    .filter((row) => Math.abs(row.varianceNgn) >= 0.5)
    .sort((a, b) => Math.abs(b.varianceNgn) - Math.abs(a.varianceNgn));

  const statuses = withPct.map((row) => row.status).filter(Boolean);
  const periodStatus = statuses.includes('CFO Approved')
    ? 'CFO Approved'
    : statuses.find((status) => /approved/i.test(status))
      || statuses[0]
      || 'Draft';

  return {
    period: input.period,
    periodLabel,
    periodStatus,
    validated: statuses.some((status) => /approved|validated|posted|locked|released/i.test(status)),
    lockedFx: {
      rate: fx,
      rateDate: input.lockedFx.rateDate,
      source: input.lockedFx.source,
      display: `$1 = ₦${fx.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    headcount: {
      total: totalHeadcount,
      ngn: ngnHeadcount,
      usd: usdHeadcount,
    },
    totalsNgn: {
      grossPay: totalsNgn.grossPay,
      totalEarnings: totalEarningsNgn,
      deductions: totalsNgn.deductions,
      netPay: totalsNgn.netPay,
      employerCost: totalsNgn.employerCost,
    },
    priorTotalsNgn: input.priorTotalsNgn
      ? {
          ...input.priorTotalsNgn,
          totalEarnings: Number(input.priorTotalEarningsNgn || input.priorTotalsNgn.grossPay || 0),
        }
      : null,
    usdNative: {
      grossPay: usdRow?.nativeGrossPay || 0,
      deductions: moneyOf(byId.get('dle-usd')?.summary?.totalDeductions ?? byId.get('dle-usd')?.summary?.deductions),
      netPay: moneyOf(byId.get('dle-usd')?.summary?.netPay),
      employerCost: moneyOf(byId.get('dle-usd')?.summary?.employerCost),
      headcount: usdHeadcount,
    },
    schedules: withPct,
    categories,
    currencyMix: {
      ngnGrossNgn: ngnGross,
      usdGrossNgn,
      ngnPct: totalsNgn.grossPay > 0 ? roundMoney((ngnGross / totalsNgn.grossPay) * 1000) / 10 : 0,
      usdPct: totalsNgn.grossPay > 0 ? roundMoney((usdGrossNgn / totalsNgn.grossPay) * 1000) / 10 : 0,
    },
    varianceDrivers,
    monthOverMonth,
  };
};

export const payrollSalariesSummaryLockDate = (period: string) => periodEndDate(period);

export const shortSalariesSummaryPeriodLabel = shortPayrollPeriodLabel;
