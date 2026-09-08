'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BadgeDollarSign,
  CalendarDays,
  PieChart as PieIcon,
  Users,
  WalletCards,
  Workflow,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PayrollSalariesSummary } from '@/lib/payroll-salaries-summary';
import { payrollMomMetric } from '@/lib/payroll-month-over-month';
import styles from '@/styles/payroll-salaries-summary.module.css';

type DetailTab =
  | 'overview'
  | 'schedules'
  | 'categories'
  | 'currency'
  | 'variance'
  | 'exceptions'
  | 'audit'
  | 'documents';

const moneyFmt = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});
const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const numberFmt = new Intl.NumberFormat('en-GB');

const money = (value: number, canViewMoney: boolean) =>
  canViewMoney ? moneyFmt.format(Math.round(value || 0)) : '••••••';
const moneyCompact = (value: number, canViewMoney: boolean) => {
  if (!canViewMoney) return '••••';
  const abs = Math.abs(value || 0);
  if (abs >= 1_000_000) return `₦${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `₦${(value / 1_000).toFixed(1)}K`;
  return moneyFmt.format(Math.round(value || 0));
};
const count = (value: number) => numberFmt.format(Math.round(value || 0));

const formatFxDate = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!match) return iso || '—';
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const periodRangeLabel = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) return period || '—';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const fmt = (date: Date) =>
    date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
};

const momDeltaClass = (direction: 'up' | 'down' | 'flat') => {
  if (direction === 'up') return styles.deltaUp;
  if (direction === 'down') return styles.deltaDown;
  return styles.deltaFlat;
};

const varianceStatus = (pctChange: number, kind: 'money' | 'count') => {
  const abs = Math.abs(pctChange);
  if (kind === 'count') {
    if (abs <= 5) return { label: 'Normal', className: styles.statusGreen };
    if (abs <= 12) return { label: 'Review', className: styles.statusAmber };
    return { label: 'Significant', className: styles.statusRed };
  }
  if (abs <= 5) return { label: 'Normal', className: styles.statusGreen };
  if (abs <= 12) return { label: 'Review', className: styles.statusAmber };
  return { label: 'Significant', className: styles.statusRed };
};

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'categories', label: 'Categories' },
  { id: 'currency', label: 'Currency & FX' },
  { id: 'variance', label: 'Variance' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'audit', label: 'Audit Trail' },
  { id: 'documents', label: 'Documents' },
];

export default function PayrollSalariesSummaryPanel({
  summary,
  canViewMoney,
}: {
  summary: PayrollSalariesSummary;
  canViewMoney: boolean;
}) {
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const mom = summary.monthOverMonth;
  const priorLabel = mom?.previousPeriodLabel || 'prior month';

  const kpiCards = useMemo(() => {
    const metric = (key: 'employees' | 'grossPay' | 'deductions' | 'netPay' | 'employerCost') =>
      payrollMomMetric(mom, key);
    const earningsMom = (() => {
      const prior = summary.priorTotalsNgn;
      if (!prior) return null;
      const current = summary.totalsNgn.totalEarnings;
      const previous = prior.totalEarnings;
      const variance = current - previous;
      const pctChange = previous !== 0 ? (variance / Math.abs(previous)) * 100 : 0;
      const direction = Math.abs(variance) < 0.5 ? 'flat' as const : variance > 0 ? 'up' as const : 'down' as const;
      return { current, previous, variance, pctChange, direction };
    })();

    return [
      {
        title: 'Total Headcount',
        value: count(summary.headcount.total),
        theme: 'blue' as const,
        icon: Users,
        metric: metric('employees'),
        compare: mom?.available ? `vs ${priorLabel}: ${count(metric('employees')?.previous || 0)}` : 'Prior period unavailable',
      },
      {
        title: 'Gross Pay',
        value: money(summary.totalsNgn.grossPay, canViewMoney),
        theme: 'blue' as const,
        icon: BadgeDollarSign,
        metric: metric('grossPay'),
        compare: mom?.available
          ? `vs ${priorLabel}: ${money(metric('grossPay')?.previous || 0, canViewMoney)}`
          : 'Prior period unavailable',
      },
      {
        title: 'Total Earnings',
        value: money(summary.totalsNgn.totalEarnings, canViewMoney),
        theme: 'amber' as const,
        icon: BadgeDollarSign,
        metric: earningsMom
          ? {
              variance: earningsMom.variance,
              pctChange: earningsMom.pctChange,
              direction: earningsMom.direction,
              kind: 'money' as const,
            }
          : null,
        compare: earningsMom
          ? `vs ${summary.priorTotalsNgn?.periodLabel || priorLabel}: ${money(earningsMom.previous, canViewMoney)}`
          : 'Prior period unavailable',
      },
      {
        title: 'Total Deductions',
        value: money(summary.totalsNgn.deductions, canViewMoney),
        theme: 'red' as const,
        icon: PieIcon,
        metric: metric('deductions'),
        compare: mom?.available
          ? `vs ${priorLabel}: ${money(metric('deductions')?.previous || 0, canViewMoney)}`
          : 'Prior period unavailable',
      },
      {
        title: 'Net Pay',
        value: money(summary.totalsNgn.netPay, canViewMoney),
        theme: 'green' as const,
        icon: WalletCards,
        metric: metric('netPay'),
        compare: mom?.available
          ? `vs ${priorLabel}: ${money(metric('netPay')?.previous || 0, canViewMoney)}`
          : 'Prior period unavailable',
      },
      {
        title: 'Employer Cost',
        value: money(summary.totalsNgn.employerCost, canViewMoney),
        theme: 'purple' as const,
        icon: Users,
        metric: metric('employerCost'),
        compare: mom?.available
          ? `vs ${priorLabel}: ${money(metric('employerCost')?.previous || 0, canViewMoney)}`
          : 'Prior period unavailable',
      },
    ];
  }, [summary, canViewMoney, mom, priorLabel]);

  const currencyChart = [
    { name: 'NGN Payroll', value: Math.max(0, summary.currencyMix.ngnGrossNgn), fill: '#1769ff' },
    { name: 'USD Payroll (Converted)', value: Math.max(0, summary.currencyMix.usdGrossNgn), fill: '#0cab7f' },
  ].filter((row) => row.value > 0.005);

  const driverChart = summary.varianceDrivers.map((row) => ({
    name: row.label.replace(/\s+/g, '\n'),
    value: Math.round((row.varianceNgn / 1_000_000) * 10) / 10,
    raw: row.varianceNgn,
  }));

  const momMetrics = (mom?.metrics || []).filter((item) =>
    ['employees', 'grossPay', 'deductions', 'netPay', 'employerCost'].includes(item.key),
  );

  const showSchedules = detailTab === 'overview' || detailTab === 'schedules';
  const showCategories = detailTab === 'overview' || detailTab === 'categories';
  const showCurrency = detailTab === 'overview' || detailTab === 'currency';
  const showVariance = detailTab === 'overview' || detailTab === 'variance';

  return (
    <div className={styles.panelRoot}>
      <div className={styles.summaryHeader}>
        <div className={styles.summaryTitle}>
          <h2>
            Salaries Summary – {summary.periodLabel} (Consolidated)
            {summary.validated ? (
              <span className={styles.validated}>
                <BadgeCheck size={12} />
                Validated
              </span>
            ) : null}
          </h2>
          <p>
            Consolidated summary of all payroll schedules (DLE + DLE USD + DLPC, Salaries + Day-rate).
            Figures are in NGN. USD salaries are converted using the locked exchange rate for the period.
          </p>
        </div>
        <div className={styles.infoCards}>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}><Workflow size={18} /></div>
            <div>
              <span>Exchange Rate (Locked)</span>
              <b>{summary.lockedFx.display}</b>
              <small>Rate Date: {formatFxDate(summary.lockedFx.rateDate)}</small>
            </div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}><Users size={18} /></div>
            <div>
              <span>Total Employees</span>
              <b>{count(summary.headcount.total)}</b>
              <small>{count(summary.headcount.ngn)} NGN &nbsp;|&nbsp; {count(summary.headcount.usd)} USD</small>
            </div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoIcon}><CalendarDays size={18} /></div>
            <div>
              <span>Payroll Period</span>
              <b>{periodRangeLabel(summary.period)}</b>
              <small>Status: <em>{summary.periodStatus}</em></small>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        {kpiCards.map((card) => {
          const Icon = card.icon;
          const delta = card.metric;
          return (
            <div key={card.title} className={`${styles.kpi} ${styles[`kpi_${card.theme}`]}`}>
              <div className={`${styles.kpiIcon} ${styles[`icon_${card.theme}`]}`}>
                <Icon size={22} />
              </div>
              <div>
                <span>{card.title}</span>
                <strong title={card.value}>{card.value}</strong>
                {delta ? (
                  <b className={momDeltaClass(delta.direction)}>
                    {delta.direction === 'up' ? '↗' : delta.direction === 'down' ? '↘' : '→'}{' '}
                    {delta.kind === 'money'
                      ? money(delta.variance, canViewMoney)
                      : count(delta.variance)}{' '}
                    ({delta.pctChange > 0 ? '+' : ''}{delta.pctChange.toFixed(1)}%)
                  </b>
                ) : (
                  <b className={styles.deltaFlat}>—</b>
                )}
                <small>{card.compare}</small>
              </div>
            </div>
          );
        })}
      </div>

      {(showSchedules || showCategories || showCurrency) ? (
        <div className={styles.midGrid}>
          {showSchedules ? (
            <section className={`${styles.panel} ${styles.schedulePanel}`}>
              <div className={styles.panelHead}>
                <h3>Payroll Schedule Breakdown ({summary.periodLabel})</h3>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Schedule</th>
                      <th>Headcount</th>
                      <th>Gross Pay (₦)</th>
                      <th>Deductions (₦)</th>
                      <th>Net Pay (₦)</th>
                      <th>Employer Cost (₦)</th>
                      <th>% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.schedules.map((row) => (
                      <tr key={row.id}>
                        <td className={styles.rowLabel}>
                          {row.label}
                          {row.nativeCurrency === 'USD' && canViewMoney
                            ? ` (${usdFmt.format(row.nativeGrossPay)})`
                            : ''}
                        </td>
                        <td>{count(row.headcount)}</td>
                        <td>{money(row.grossPayNgn, canViewMoney)}</td>
                        <td>{money(row.deductionsNgn, canViewMoney)}</td>
                        <td>{money(row.netPayNgn, canViewMoney)}</td>
                        <td>{money(row.employerCostNgn, canViewMoney)}</td>
                        <td>{row.pctOfTotal.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td>Total</td>
                      <td>{count(summary.headcount.total)}</td>
                      <td>{money(summary.totalsNgn.grossPay, canViewMoney)}</td>
                      <td>{money(summary.totalsNgn.deductions, canViewMoney)}</td>
                      <td>{money(summary.totalsNgn.netPay, canViewMoney)}</td>
                      <td>{money(summary.totalsNgn.employerCost, canViewMoney)}</td>
                      <td>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {showCategories ? (
            <section className={styles.panel}>
              <div className={styles.panelHead}><h3>Employee Category Summary</h3></div>
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Headcount</th>
                    <th>Gross Pay</th>
                    <th>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.categories.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td>{count(row.headcount)}</td>
                      <td>{money(row.grossPayNgn, canViewMoney)}</td>
                      <td>{row.pctOfTotal.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className={styles.totalRow}>
                    <td>Total</td>
                    <td>{count(summary.categories.reduce((sum, row) => sum + row.headcount, 0))}</td>
                    <td>{money(summary.categories.reduce((sum, row) => sum + row.grossPayNgn, 0), canViewMoney)}</td>
                    <td>100%</td>
                  </tr>
                </tbody>
              </table>
              <div className={styles.stackBar}>
                {summary.categories.map((row) => (
                  <span
                    key={row.id}
                    className={`${styles.stackSeg} ${
                      row.id === 'permanent'
                        ? styles.segBlue
                        : row.id === 'contract'
                          ? styles.segGreen
                          : styles.segPurple
                    }`}
                    style={{ width: `${Math.max(0, row.pctOfTotal)}%` }}
                  />
                ))}
              </div>
              <div className={styles.legendRow}>
                {summary.categories.map((row) => (
                  <span key={row.id}>
                    <i
                      className={`${styles.legendDot} ${
                        row.id === 'permanent'
                          ? styles.segBlue
                          : row.id === 'contract'
                            ? styles.segGreen
                            : styles.segPurple
                      }`}
                    />
                    {row.label}
                    <br />
                    <small>{row.pctOfTotal.toFixed(1)}%</small>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {showCurrency ? (
            <section className={styles.panel}>
              <div className={styles.panelHead}><h3>Currency Analysis</h3></div>
              <div className={styles.currencyBody}>
                <div className={styles.donutWrap}>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={currencyChart}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={70}
                        paddingAngle={0}
                      >
                        {currencyChart.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => money(Number(value || 0), canViewMoney)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className={styles.donutCenter}>
                    <b>{moneyCompact(summary.totalsNgn.grossPay, canViewMoney)}</b>
                    <span>Total Gross</span>
                  </div>
                </div>
                <div className={styles.currencyLegend}>
                  <p>
                    NGN Payroll<br />
                    <b>{money(summary.currencyMix.ngnGrossNgn, canViewMoney)} ({summary.currencyMix.ngnPct.toFixed(1)}%)</b>
                  </p>
                  <p>
                    USD Payroll (Converted)<br />
                    <b>{money(summary.currencyMix.usdGrossNgn, canViewMoney)} ({summary.currencyMix.usdPct.toFixed(1)}%)</b>
                  </p>
                </div>
              </div>
              <div className={styles.fxBox}>
                <b>USD Payroll Conversion</b>
                <div>
                  <span>Total USD Payroll</span>
                  <strong>{canViewMoney ? usdFmt.format(summary.usdNative.grossPay) : '••••'}</strong>
                </div>
                <div>
                  <span>Exchange Rate (₦)</span>
                  <strong>{summary.lockedFx.rate.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                <div>
                  <span>NGN Equivalent</span>
                  <strong>{money(summary.currencyMix.usdGrossNgn, canViewMoney)}</strong>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {showVariance ? (
        <div className={styles.bottomGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3>Month-on-Month Variance (Consolidated)</h3>
            </div>
            {mom?.available && momMetrics.length ? (
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>{mom.previousPeriodLabel}</th>
                    <th>{mom.currentPeriodLabel}</th>
                    <th>Variance</th>
                    <th>% Change</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {momMetrics.map((row) => {
                    const status = varianceStatus(row.pctChange, row.kind);
                    const formatValue = (value: number) =>
                      row.kind === 'money' ? money(value, canViewMoney) : count(value);
                    const varianceClass = row.direction === 'down'
                      ? styles.redText
                      : row.direction === 'up'
                        ? styles.greenText
                        : undefined;
                    return (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>{formatValue(row.previous)}</td>
                        <td>{formatValue(row.current)}</td>
                        <td className={varianceClass}>{formatValue(row.variance)}</td>
                        <td className={varianceClass}>
                          {row.pctChange > 0 ? '+' : ''}{row.pctChange.toFixed(1)}%
                        </td>
                        <td>
                          <span className={`${styles.status} ${status.className}`}>{status.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className={styles.muted}>Prior-period consolidated totals are not available for variance yet.</p>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3>
                Payroll Variance Drivers
                {mom?.available ? ` (${summary.periodLabel} vs ${priorLabel})` : ''}
              </h3>
            </div>
            {driverChart.length ? (
              <div style={{ height: 220, padding: '8px 8px 4px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={driverChart} margin={{ top: 10, right: 8, left: -12, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7edf5" />
                    <XAxis dataKey="name" interval={0} tick={{ fontSize: 10, fill: '#3d5476' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#60718a' }}
                      tickFormatter={(value) => `${value}M`}
                    />
                    <ReferenceLine y={0} stroke="#8aa1bd" />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {driverChart.map((entry) => (
                        <Cell key={entry.name} fill={entry.value >= 0 ? '#14a578' : '#ff5058'} />
                      ))}
                    </Bar>
                    <Tooltip
                      formatter={(value, _name, item) =>
                        money(Number((item?.payload as { raw?: number } | undefined)?.raw ?? Number(value) * 1_000_000), canViewMoney)
                      }
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className={styles.muted}>
                {mom?.available
                  ? 'No material schedule-level gross variance for this period.'
                  : 'Drivers appear once a prior period can be compared.'}
              </p>
            )}
          </section>
        </div>
      ) : null}

      {(detailTab === 'exceptions' || detailTab === 'audit' || detailTab === 'documents') ? (
        <div className={styles.panel}>
          <p className={styles.muted}>
            Open a schedule card for employee exceptions, approval audit, and documents. This view stays consolidated.
          </p>
        </div>
      ) : null}

      <div className={styles.detailTabs}>
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={detailTab === tab.id ? styles.detailActive : undefined}
            onClick={() => setDetailTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
