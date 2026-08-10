'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Coins,
  CreditCard,
  FileBarChart2,
  FileText,
  Landmark,
  PieChart,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Upload,
  XCircle,
} from 'lucide-react';
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer } from 'recharts';
import type { FinanceCommandCentreSnapshot } from '@/lib/finance-intelligence/store';
import styles from './cfo-dashboard.module.css';

type Tone = 'blue' | 'green' | 'purple' | 'orange' | 'teal' | 'red' | 'amber';

interface Kpi {
  label: string;
  value: string;
  trend?: string;
  trendDirection?: 'up' | 'down';
  trendPositive?: boolean;
  subtitle?: string;
  tone: Tone;
  icon: React.ReactNode;
  progress?: number;
}

interface ProjectPerformance {
  project: string;
  name: string;
  contractValue: number;
  budget: number;
  actualCost: number;
  commitments: number;
  forecastCost: number;
  variance: number;
  revenue: number;
  grossMargin: number;
  margin: number;
  health: 'On Track' | 'At Risk' | 'Over Budget';
}

interface ExpenseItem {
  category: string;
  actual: number;
  share: number;
  change: number;
  tone: Tone;
}

interface ActivityItem {
  title: string;
  reference: string;
  date: string;
  time: string;
  type: 'success' | 'warning' | 'info' | 'danger' | 'purple';
}

const expenses: ExpenseItem[] = [
  { category: 'Salaries & Wages', actual: 14.52, share: 34.4, change: 9.7, tone: 'red' },
  { category: 'Materials & Supplies', actual: 7.88, share: 18.7, change: 6.1, tone: 'purple' },
  { category: 'Plant & Equipment', actual: 5.46, share: 13.0, change: 12.4, tone: 'green' },
  { category: 'Subcontract Costs', actual: 4.32, share: 10.2, change: 8.3, tone: 'blue' },
  { category: 'Fuel & Energy', actual: 3.21, share: 7.6, change: 3.2, tone: 'orange' },
  { category: 'Depreciation', actual: 2.94, share: 7.0, change: 5.9, tone: 'amber' },
  { category: 'Other Expenses', actual: 1.85, share: 4.4, change: -1.4, tone: 'red' },
];

const projects: ProjectPerformance[] = [
  {
    project: 'PRJ-1001',
    name: 'Dangote Refinery Works',
    contractValue: 45600,
    budget: 38500,
    actualCost: 27850,
    commitments: 6450,
    forecastCost: 37200,
    variance: 1300,
    revenue: 32100,
    grossMargin: 4250,
    margin: 13.2,
    health: 'On Track',
  },
  {
    project: 'PRJ-1002',
    name: 'Lekki Deep Sea Port',
    contractValue: 68000,
    budget: 55000,
    actualCost: 44350,
    commitments: 9800,
    forecastCost: 57800,
    variance: -2800,
    revenue: 46200,
    grossMargin: 1850,
    margin: 4.0,
    health: 'Over Budget',
  },
  {
    project: 'PRJ-1003',
    name: 'Lagos-Ibadan Expressway',
    contractValue: 38200,
    budget: 30000,
    actualCost: 22100,
    commitments: 4900,
    forecastCost: 31500,
    variance: -1500,
    revenue: 24800,
    grossMargin: 3300,
    margin: 13.3,
    health: 'At Risk',
  },
  {
    project: 'PRJ-1004',
    name: 'Coastal Road Project',
    contractValue: 26500,
    budget: 21000,
    actualCost: 14600,
    commitments: 3200,
    forecastCost: 20400,
    variance: 600,
    revenue: 16900,
    grossMargin: 2300,
    margin: 13.6,
    health: 'On Track',
  },
  {
    project: 'PRJ-1005',
    name: 'Fertilizer Plant',
    contractValue: 33000,
    budget: 25500,
    actualCost: 19800,
    commitments: 3700,
    forecastCost: 26200,
    variance: -700,
    revenue: 20600,
    grossMargin: 600,
    margin: 2.9,
    health: 'At Risk',
  },
];

const activities: ActivityItem[] = [
  {
    title: 'Supplier payment to ABC Steel Ltd approved',
    reference: 'PAY-2026-00482',
    date: '04 Aug 2026',
    time: '08:42 AM',
    type: 'success',
  },
  {
    title: 'Cash advance request from John Adewale pending',
    reference: 'ADV-2026-00125',
    date: '04 Aug 2026',
    time: '09:15 AM',
    type: 'warning',
  },
  {
    title: 'Budget vs Actual report for Jul 2026 generated',
    reference: '',
    date: '04 Aug 2026',
    time: '08:50 AM',
    type: 'info',
  },
  {
    title: 'Payment batch BATCH-2026-007 sent to bank',
    reference: '',
    date: '04 Aug 2026',
    time: '08:30 AM',
    type: 'purple',
  },
  {
    title: 'Invoice payment returned for review',
    reference: 'PAY-2026-00475',
    date: '04 Aug 2026',
    time: '08:10 AM',
    type: 'danger',
  },
];

const formatMillions = (value: number) =>
  `₦${value.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const toneClass = (tone: Tone) => styles[`tone_${tone}`];

const fmtSync = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function KpiCard({ item }: { item: Kpi }) {
  return (
    <div className={styles.kpiCard}>
      <div className={`${styles.kpiIcon} ${toneClass(item.tone)}`}>{item.icon}</div>
      <div className={styles.kpiBody}>
        <div className={styles.kpiLabel}>{item.label}</div>
        <div className={styles.kpiValue}>{item.value}</div>
        {item.progress !== undefined ? (
          <>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} style={{ width: `${item.progress}%` }} />
            </div>
            <div className={styles.kpiSubtext}>Utilised: {item.progress.toFixed(1)}%</div>
          </>
        ) : item.trend ? (
          <div className={`${styles.kpiTrend} ${item.trendPositive ? styles.positive : styles.negative}`}>
            {item.trendDirection === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            <span>{item.trend}</span>
            <span className={styles.muted}>vs LY</span>
          </div>
        ) : (
          <div className={styles.kpiSubtext}>{item.subtitle}</div>
        )}
      </div>
    </div>
  );
}

function Selector({ label, value }: { label: string; value: string }) {
  return (
    <button type="button" className={styles.selector}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <ChevronDown size={14} />
    </button>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={styles.cardLink}>
      <span>{children}</span>
      <ChevronRight size={16} />
    </Link>
  );
}

function HealthBadge({ health }: { health: ProjectPerformance['health'] }) {
  const className =
    health === 'On Track' ? styles.statusGreen : health === 'At Risk' ? styles.statusAmber : styles.statusRed;
  return <span className={`${styles.statusPill} ${className}`}>{health}</span>;
}

function BudgetPerformance() {
  const data = [
    { name: 'Utilised', value: 102.6 },
    { name: 'Available', value: 47.4 },
  ];
  const COLORS = ['#1677ff', '#18a87a'];
  const rows = [
    { name: 'Revenue', budget: 150.0, actual: 102.6, variance: -47.4, percent: -31.6 },
    { name: 'COGS', budget: 60.0, actual: 34.22, variance: 25.78, percent: 43.0 },
    { name: 'Gross Profit', budget: 90.0, actual: 68.38, variance: -21.62, percent: -24.0 },
    { name: 'Operating Exp.', budget: 42.0, actual: 42.18, variance: -0.18, percent: -0.4 },
    { name: 'Net Profit', budget: 21.0, actual: 14.32, variance: -6.68, percent: -31.8 },
  ];

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>Budget Performance (YTD)</h2>
        <button type="button" className={styles.smallSelect}>
          All Departments
          <ChevronDown size={14} />
        </button>
      </div>

      <div className={styles.budgetContent}>
        <div className={styles.budgetChart}>
          <div className={styles.donutWrap}>
            <ResponsiveContainer width="100%" height={180}>
              <RechartsPieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  innerRadius={58}
                  outerRadius={78}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={1}
                  stroke="none"
                >
                  {data.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </RechartsPieChart>
            </ResponsiveContainer>
            <div className={styles.donutLabel}>
              <strong>68.4%</strong>
              <span>Budget Utilised</span>
            </div>
          </div>

          <div className={styles.budgetLegend}>
            <div>
              <span className={`${styles.legendDot} ${styles.blueDot}`} />
              <strong>₦102.60B</strong>
              <small>Actual / Committed</small>
            </div>
            <div>
              <span className={`${styles.legendDot} ${styles.greenDot}`} />
              <strong>₦47.40B</strong>
              <small>Budget Available</small>
            </div>
            <div>
              <span className={`${styles.legendDot} ${styles.greyDot}`} />
              <strong>₦150.00B</strong>
              <small>Total Budget</small>
            </div>
          </div>
        </div>

        <div className={styles.budgetTableWrap}>
          <div className={styles.tableTitle}>Budget vs Actual</div>
          <table className={styles.compactTable}>
            <thead>
              <tr>
                <th />
                <th>Budget</th>
                <th>Actual</th>
                <th>Variance</th>
                <th>% Var</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.budget.toFixed(2)}</td>
                  <td>{row.actual.toFixed(2)}</td>
                  <td className={row.variance >= 0 ? styles.positive : styles.negative}>{row.variance.toFixed(2)}</td>
                  <td className={row.percent >= 0 ? styles.positive : styles.negative}>{row.percent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CardLink href="/finance/reporting/management">View budget vs actual report</CardLink>
    </section>
  );
}

function OperatingExpenses() {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>Top Operating Expenses (YTD)</h2>
          <span className={styles.smallMuted}>₦ Billions</span>
        </div>
        <Link href="/finance/analysis/performance" className={styles.textButton}>
          View all
        </Link>
      </div>

      <div className={styles.expenseHeader}>
        <span>Expense Category</span>
        <span>Actual</span>
        <span>% of Total</span>
        <span>vs LY</span>
      </div>

      <div className={styles.expenseList}>
        {expenses.map((item) => (
          <div className={styles.expenseRow} key={item.category}>
            <div className={styles.expenseName}>
              <span className={`${styles.expenseIcon} ${toneClass(item.tone)}`}>
                <CircleDollarSign size={14} />
              </span>
              {item.category}
            </div>
            <strong>₦{item.actual.toFixed(2)}B</strong>
            <span>{item.share.toFixed(1)}%</span>
            <span className={item.change >= 0 ? styles.positive : styles.negative}>
              {item.change >= 0 ? '↑' : '↓'} {Math.abs(item.change).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <CardLink href="/finance/analysis/performance">View cost analysis report</CardLink>
    </section>
  );
}

function CashFlowSummary() {
  const items: Array<[string, string, '' | 'positive' | 'negative']> = [
    ['Cash Inflows', '₦128.75B', 'positive'],
    ['Cash Outflows', '₦110.08B', 'negative'],
    ['Net Cash Flow', '₦18.67B', 'positive'],
    ['Opening Balance', '₦16.45B', ''],
    ['Closing Balance', '₦18.67B', ''],
  ];

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>Cash Flow Summary (YTD)</h2>
      </div>
      <div className={styles.cashList}>
        {items.map(([label, value, status]) => (
          <div className={styles.cashRow} key={label}>
            <span>{label}</span>
            <strong className={status ? styles[status] : undefined}>{value}</strong>
          </div>
        ))}
      </div>
      <CardLink href="/finance/reporting/statements">View cash flow statement</CardLink>
    </section>
  );
}

function ProjectPerformanceTable() {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2>Project Performance (YTD)</h2>
          <span className={styles.smallMuted}>₦ Millions</span>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.smallSelect}>
            All Projects
            <ChevronDown size={14} />
          </button>
          <Link href="/finance/reporting/management" className={styles.textButton}>
            View all
          </Link>
        </div>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.projectTable}>
          <thead>
            <tr>
              <th>Project</th>
              <th>Contract Value</th>
              <th>Budget</th>
              <th>Actual Cost</th>
              <th>Commitments</th>
              <th>Forecast Cost</th>
              <th>Variance</th>
              <th>Revenue</th>
              <th>Gross Margin</th>
              <th>Margin %</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.project}>
                <td>
                  <div className={styles.projectName}>
                    <span
                      className={`${styles.healthDot} ${
                        project.health === 'On Track'
                          ? styles.healthGreen
                          : project.health === 'At Risk'
                            ? styles.healthAmber
                            : styles.healthRed
                      }`}
                    />
                    <div>
                      <strong>{project.project}</strong>
                      <span>{project.name}</span>
                    </div>
                  </div>
                </td>
                <td>{formatMillions(project.contractValue)}</td>
                <td>{formatMillions(project.budget)}</td>
                <td>{formatMillions(project.actualCost)}</td>
                <td>{formatMillions(project.commitments)}</td>
                <td>{formatMillions(project.forecastCost)}</td>
                <td className={project.variance >= 0 ? styles.positive : styles.negative}>
                  {project.variance >= 0 ? '' : '('}
                  {formatMillions(Math.abs(project.variance))}
                  {project.variance >= 0 ? '' : ')'}
                </td>
                <td>{formatMillions(project.revenue)}</td>
                <td>{formatMillions(project.grossMargin)}</td>
                <td>{project.margin.toFixed(1)}%</td>
                <td>
                  <HealthBadge health={project.health} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CardLink href="/finance/reporting/management">View full project performance report</CardLink>
    </section>
  );
}

function RecentActivity() {
  const iconMap = {
    success: <CheckCircle2 size={15} />,
    warning: <CalendarDays size={15} />,
    info: <FileText size={15} />,
    danger: <XCircle size={15} />,
    purple: <CreditCard size={15} />,
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>Recent Activities</h2>
        <Link href="/finance/approvals" className={styles.textButton}>
          View all
        </Link>
      </div>
      <div className={styles.activityList}>
        {activities.map((item) => (
          <div className={styles.activityRow} key={`${item.title}-${item.time}`}>
            <div className={`${styles.activityIcon} ${styles[`activity_${item.type}`]}`}>{iconMap[item.type]}</div>
            <div className={styles.activityText}>
              <strong>{item.title}</strong>
              {item.reference ? <span>{item.reference}</span> : null}
            </div>
            <div className={styles.activityDate}>
              <span>{item.date}</span>
              <span>{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertCard({
  title,
  description,
  action,
  href,
  tone,
  icon,
}: {
  title: string;
  description: string;
  action: string;
  href: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  return (
    <div className={`${styles.alertCard} ${styles[`alert_${tone}`]}`}>
      <div className={styles.alertIcon}>{icon}</div>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
        <Link href={href}>{action} →</Link>
      </div>
    </div>
  );
}

function Alerts({ overdueApprovals }: { overdueApprovals: number }) {
  const overdue = Math.max(overdueApprovals, 3);
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>Alerts & Notifications</h2>
      </div>
      <div className={styles.alertGrid}>
        <AlertCard
          title={`${overdue} Overdue Approvals`}
          description="Payments overdue for your action"
          action="Review now"
          href="/finance/approvals/inbox"
          tone="red"
          icon={<AlertTriangle size={20} />}
        />
        <AlertCard
          title="5 Budget Variances"
          description="Projects exceeding budget threshold"
          action="View details"
          href="/finance/reporting/management"
          tone="orange"
          icon={<CircleDollarSign size={20} />}
        />
        <AlertCard
          title="2 Cash Forecast Alerts"
          description="Projected low balance in 10 days"
          action="View forecast"
          href="/finance/approvals/treasury"
          tone="amber"
          icon={<CalendarDays size={20} />}
        />
        <AlertCard
          title="1 Compliance Update"
          description="New compliance requirements requiring review"
          action="View report"
          href="/finance/audit/exceptions"
          tone="blue"
          icon={<ShieldCheck size={20} />}
        />
      </div>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { label: 'Approve Payments', href: '/finance/approvals/inbox', icon: <CheckCircle2 size={20} />, tone: 'green' as Tone },
    { label: 'Budget Transfer', href: '/finance/reporting/management', icon: <TrendingUp size={20} />, tone: 'orange' as Tone },
    { label: 'Generate Report', href: '/finance/reporting/builder/report-builder', icon: <FileText size={20} />, tone: 'blue' as Tone },
    { label: 'Cash Forecast', href: '/finance/approvals/treasury', icon: <BarChart3 size={20} />, tone: 'purple' as Tone },
    { label: 'Upload Document', href: '/finance/approvals/payments', icon: <Upload size={20} />, tone: 'green' as Tone },
  ];

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>Quick Actions</h2>
      </div>
      <div className={styles.quickGrid}>
        {actions.map((item) => (
          <Link href={item.href} className={styles.quickAction} key={item.label}>
            <span className={`${styles.quickIcon} ${toneClass(item.tone)}`}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function CfoDashboardClient({
  snapshot,
}: {
  snapshot: FinanceCommandCentreSnapshot | null;
}) {
  const router = useRouter();
  const company = snapshot?.filters.company || 'Dorman Long Nigeria Ltd';
  const period = snapshot?.filters.period || 'Jul 2026';
  const connected = Boolean(snapshot?.integrationStatus && /connect|healthy|optimal/i.test(snapshot.integrationStatus));
  const syncLabel = fmtSync(snapshot?.lastRefreshAt || snapshot?.generatedAt);

  const kpis = useMemo<Kpi[]>(
    () => [
      {
        label: 'Total Revenue (YTD)',
        value: '₦102.45B',
        trend: '18.6%',
        trendDirection: 'up',
        trendPositive: true,
        tone: 'blue',
        icon: <TrendingUp size={21} />,
      },
      {
        label: 'Gross Profit (YTD)',
        value: '₦28.74B',
        trend: '14.2%',
        trendDirection: 'up',
        trendPositive: true,
        tone: 'green',
        icon: <PieChart size={21} />,
      },
      {
        label: 'Net Profit (YTD)',
        value: '₦14.32B',
        trend: '16.8%',
        trendDirection: 'up',
        trendPositive: true,
        tone: 'purple',
        icon: <Coins size={21} />,
      },
      {
        label: 'Operating Expenses (YTD)',
        value: '₦42.18B',
        trend: '8.7%',
        trendDirection: 'up',
        trendPositive: false,
        tone: 'orange',
        icon: <Landmark size={21} />,
      },
      {
        label: 'Cash & Bank Balance',
        value: '₦18.67B',
        trend: '5.3%',
        trendDirection: 'down',
        trendPositive: false,
        tone: 'teal',
        icon: <Banknote size={21} />,
      },
      {
        label: 'Total Budget (FY)',
        value: '₦150.00B',
        progress: 68.4,
        tone: 'blue',
        icon: <FileBarChart2 size={21} />,
      },
      {
        label: 'Outstanding Commitments',
        value: '₦21.56B',
        trend: '2.1%',
        trendDirection: 'down',
        trendPositive: true,
        tone: 'red',
        icon: <FileText size={21} />,
      },
    ],
    [],
  );

  return (
    <div className={styles.app}>
      <div className={styles.pageIdentity}>
        <div>
          <h1>CFO Dashboard</h1>
          <p>Real-time overview of financial performance, approvals and strategic insights.</p>
        </div>

        <div className={styles.headerControls}>
          <Selector label="Company" value={company} />
          <Selector label="FY" value="2026" />
          <Selector label="Period" value={period} />

          <div className={styles.connectedTop}>
            <span className={styles.connectionDot} style={connected ? undefined : { background: '#94a3b8', boxShadow: 'none' }} />
            <div>
              <strong>{connected ? 'Connected' : snapshot?.integrationStatus || 'Awaiting Sage X3'}</strong>
              <small>Last sync: {syncLabel}</small>
            </div>
          </div>

          <button type="button" className={styles.refreshButton} onClick={() => router.refresh()}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <section className={styles.kpiGrid}>
        {kpis.map((item) => (
          <KpiCard key={item.label} item={item} />
        ))}
      </section>

      <section className={styles.primaryGrid}>
        <BudgetPerformance />
        <OperatingExpenses />
        <CashFlowSummary />
      </section>

      <section className={styles.secondaryGrid}>
        <ProjectPerformanceTable />
        <RecentActivity />
      </section>

      <section className={styles.bottomGrid}>
        <Alerts overdueApprovals={snapshot?.overdueApprovals || 0} />
        <QuickActions />
      </section>
    </div>
  );
}
