import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureFinanceSchemaSql } from '@/lib/finance-sql-schema';

let schemaReady = false;

export type FinanceBadgeSnapshot = {
  paymentApprovals: number;
  approvalInbox: number;
  approvalMonitoring: number;
  overdueApprovals: number;
  scheduledReports: number;
  failedDeliveries: number;
  dataIntegration: number;
  exceptions: number;
};

export type FinanceApprovalKpiCard = {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  tone: 'blue' | 'teal' | 'orange' | 'purple' | 'red' | 'green' | 'rose';
};

export type FinanceApprovalCentreSnapshot = {
  generatedAt: string;
  isPreview: boolean;
  integrationStatus: string;
  lastRefreshAt: string | null;
  kpis: FinanceApprovalKpiCard[];
  badges: FinanceBadgeSnapshot;
  queueColumns: string[];
  queueRows: Array<Record<string, string>>;
};

export type FinanceCommandCentreSnapshot = {
  generatedAt: string;
  source: string;
  lastRefreshAt: string | null;
  integrationStatus: string;
  filters: {
    company: string;
    businessUnit: string;
    period: string;
    currency: string;
    basis: 'Actual' | 'Budget' | 'Forecast';
  };
  kpis: Array<{ id: string; label: string; value: number; unit: 'currency' | 'count'; deltaPct?: number }>;
  pendingApprovals: number;
  overdueApprovals: number;
  exceptions: number;
  badges: FinanceBadgeSnapshot;
};

const nowIso = () => new Date().toISOString();

export const ensureFinanceDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  if (!schemaReady) {
    try {
      await pool.request().query(ensureFinanceSchemaSql);
      schemaReady = true;
    } catch (error) {
      // Do not cache failure — next call retries after deploy/schema fixes.
      console.error('[finance] schema ensure failed', error);
      throw error;
    }
  }
  return pool;
};

const emptyBadges = (): FinanceBadgeSnapshot => ({
  paymentApprovals: 0,
  approvalInbox: 0,
  approvalMonitoring: 0,
  overdueApprovals: 0,
  scheduledReports: 0,
  failedDeliveries: 0,
  dataIntegration: 0,
  exceptions: 0,
});

const countQuery = async (pool: sql.ConnectionPool, query: string) => {
  try {
    const result = await pool.request().query(query);
    return Number(result.recordset?.[0]?.count || 0);
  } catch {
    return 0;
  }
};

export const buildFinanceBadges = async (): Promise<FinanceBadgeSnapshot> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return emptyBadges();

  const pendingStatuses = `N'Pending Approval', N'Submitted', N'Finance Review'`;
  const [
    paymentApprovals,
    overdueApprovals,
    scheduledReports,
    failedDeliveries,
    dataIntegration,
    exceptions,
  ] = await Promise.all([
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[PaymentRequests] WHERE [Status] IN (${pendingStatuses})`),
    countQuery(
      pool,
      `SELECT COUNT(1) AS count FROM [finance].[PaymentRequests]
       WHERE [Status] IN (${pendingStatuses})
         AND [DueDate] IS NOT NULL
         AND [DueDate] < CAST(SYSUTCDATETIME() AS DATE)`,
    ),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[ReportDistributions] WHERE [Status] = N'Scheduled'`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[ReportDistributions] WHERE [Status] = N'Failed'`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[IntegrationStatus] WHERE [Status] NOT IN (N'Healthy', N'Optimal', N'Connected')`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[Exceptions] WHERE [Status] = N'Open'`),
  ]);

  return {
    paymentApprovals,
    approvalInbox: paymentApprovals,
    approvalMonitoring: overdueApprovals,
    overdueApprovals,
    scheduledReports,
    failedDeliveries,
    dataIntegration,
    exceptions,
  };
};

export const buildFinanceCommandCentre = async (): Promise<FinanceCommandCentreSnapshot> => {
  const pool = await ensureFinanceDb().catch(() => null);
  const badges = await buildFinanceBadges();
  let lastRefreshAt: string | null = null;
  let integrationStatus = 'Awaiting Sage X3 connection';

  if (pool) {
    try {
      const result = await pool.request().query(`
SELECT TOP 1 [Status], [LastRefreshAt]
FROM [finance].[IntegrationStatus]
ORDER BY [UpdatedAt] DESC
`);
      const row = result.recordset?.[0];
      if (row) {
        integrationStatus = String(row.Status || integrationStatus);
        lastRefreshAt = row.LastRefreshAt ? new Date(row.LastRefreshAt).toISOString() : null;
      }
    } catch {
      // schema may be empty on first boot
    }
  }

  return {
    generatedAt: nowIso(),
    source: pool ? 'DLE Enterprise · finance schema' : 'Local finance workspace (DB offline)',
    lastRefreshAt,
    integrationStatus,
    filters: {
      company: 'Dorman Long Engineering',
      businessUnit: 'All',
      period: new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
      currency: 'NGN',
      basis: 'Actual',
    },
    kpis: [
      { id: 'revenue', label: 'Revenue', value: 0, unit: 'currency' },
      { id: 'opex', label: 'Operating Expenses', value: 0, unit: 'currency' },
      { id: 'ebitda', label: 'EBITDA', value: 0, unit: 'currency' },
      { id: 'net-profit', label: 'Net Profit', value: 0, unit: 'currency' },
      { id: 'cash', label: 'Cash and Bank Balance', value: 0, unit: 'currency' },
      { id: 'ar', label: 'Accounts Receivable', value: 0, unit: 'currency' },
      { id: 'ap', label: 'Accounts Payable', value: 0, unit: 'currency' },
      { id: 'pending-payments', label: 'Pending Payments', value: badges.paymentApprovals, unit: 'count' },
    ],
    pendingApprovals: badges.paymentApprovals,
    overdueApprovals: badges.overdueApprovals,
    exceptions: badges.exceptions,
    badges,
  };
};

export type FinanceApprovalRequestRow = {
  RequestId?: string;
  RequestNumber?: string;
  PaymentType?: string;
  Title?: string;
  Beneficiary?: string;
  Description?: string;
  Amount?: number;
  CurrencyCode?: string;
  Department?: string;
  ProjectCode?: string;
  CostCentre?: string;
  RequesterCode?: string;
  RequesterName?: string;
  SubmittedAt?: string | Date;
  UpdatedAt?: string | Date;
  DueDate?: string | Date;
  CurrentStage?: string;
  CurrentApproverCode?: string;
  CurrentApproverName?: string;
  Status?: string;
  RiskFlags?: string;
  [key: string]: unknown;
};

export const listFinanceApprovalRequests = async (input?: { status?: string; mineFor?: string }): Promise<FinanceApprovalRequestRow[]> => {
  const pool = await ensureFinanceDb().catch(() => null);
  if (!pool) return [];
  try {
    const request = pool.request();
    let where = '1=1';
    if (input?.status) {
      request.input('status', sql.NVarChar(40), input.status);
      where += ' AND [Status] = @status';
    }
    if (input?.mineFor) {
      request.input('approver', sql.NVarChar(60), input.mineFor);
      where += ' AND [CurrentApproverCode] = @approver';
    }
    // Live payment workflow table (legacy finance.ApprovalRequests is unused).
    const result = await request.query(`
SELECT TOP 500
  [RequestId],
  [RequestNumber],
  [PaymentType],
  [Title],
  [BeneficiaryName] AS [Beneficiary],
  COALESCE([Purpose], [Description], [Title]) AS [Description],
  COALESCE([NetAmount], [GrossAmount], 0) AS [Amount],
  [CurrencyCode],
  [Department],
  [ProjectCode],
  [CostCentre],
  [RequesterCode],
  [RequesterName],
  [SubmittedAt],
  [UpdatedAt],
  [DueDate],
  [CurrentStage],
  [CurrentApproverCode],
  [CurrentApproverName],
  [Status],
  [RiskFlags]
FROM [finance].[PaymentRequests]
WHERE ${where}
ORDER BY COALESCE([SubmittedAt], [CreatedAt]) DESC
`);
    return (result.recordset || []) as FinanceApprovalRequestRow[];
  } catch {
    return [];
  }
};

export const buildFinanceApprovalCentre = async (): Promise<FinanceApprovalCentreSnapshot> => {
  const pool = await ensureFinanceDb().catch(() => null);
  const rows = await listFinanceApprovalRequests();
  let lastRefreshAt: string | null = null;
  let integrationStatus = 'Not connected';

  if (pool) {
    try {
      const result = await pool.request().query(`
SELECT TOP 1 [Status], [LastRefreshAt]
FROM [finance].[IntegrationStatus]
ORDER BY [UpdatedAt] DESC
`);
      const row = result.recordset?.[0];
      if (row) {
        integrationStatus = String(row.Status || 'Not connected');
        lastRefreshAt = row.LastRefreshAt ? new Date(row.LastRefreshAt).toISOString() : null;
      }
    } catch {
      lastRefreshAt = null;
    }
  }

  const money = (value: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  const queueColumns = [
    'Request No.',
    'Payment Type',
    'Beneficiary',
    'Description',
    'Amount',
    'Currency',
    'Department',
    'Project',
    'Submitted',
    'Current Stage',
    'Approver',
    'Age',
    'Risk',
    'Status',
  ];

  const statusOf = (row: FinanceApprovalRequestRow) => String(row.Status || '');
  const pending = rows.filter((row) => /pending|submitted|finance review/i.test(statusOf(row)));
  const overdue = pending.filter((row) => row.DueDate && new Date(row.DueDate) < new Date());
  const returned = rows.filter((row) => /returned/i.test(statusOf(row)));
  const approvedToday = rows.filter((row) => {
    if (!/^(approved|ready for treasury)$/i.test(statusOf(row).trim())) return false;
    const updated = row.UpdatedAt ? new Date(row.UpdatedAt) : null;
    if (!updated) return false;
    const now = new Date();
    return updated.toDateString() === now.toDateString();
  });
  const rejectedMonth = rows.filter((row) => {
    if (!/rejected|cancelled/i.test(statusOf(row))) return false;
    const updated = row.UpdatedAt ? new Date(row.UpdatedAt) : null;
    if (!updated) return false;
    const now = new Date();
    return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear();
  });
  const highValue = pending.filter((row) => Number(row.Amount || 0) >= 10_000_000);
  const awaitingRelease = rows.filter((row) =>
    /ready for treasury|awaiting release|final release/i.test(`${statusOf(row)} ${String(row.CurrentStage || '')}`));
  const sum = (list: typeof rows) => list.reduce((total, row) => total + Number(row.Amount || 0), 0);

  const badges: FinanceBadgeSnapshot = {
    paymentApprovals: pending.length,
    approvalInbox: pending.length,
    approvalMonitoring: overdue.length || pending.length,
    overdueApprovals: overdue.length,
    scheduledReports: 0,
    failedDeliveries: 0,
    dataIntegration: /connected|healthy|optimal/i.test(integrationStatus) ? 0 : 1,
    exceptions: 0,
  };

  return {
    generatedAt: nowIso(),
    isPreview: false,
    integrationStatus,
    lastRefreshAt,
    badges,
    queueColumns,
    queueRows: rows.slice(0, 25).map((row) => ({
      'Request No.': String(row.RequestNumber || row.RequestId || '—'),
      'Payment Type': String(row.PaymentType || '—'),
      Beneficiary: String(row.Beneficiary || '—'),
      Description: String(row.Description || row.Title || '—'),
      Amount: money(Number(row.Amount || 0)),
      Currency: String(row.CurrencyCode || 'NGN'),
      Department: String(row.Department || '—'),
      Project: String(row.ProjectCode || '—'),
      Submitted: row.SubmittedAt ? new Date(row.SubmittedAt).toLocaleDateString('en-GB') : '—',
      'Current Stage': String(row.CurrentStage || '—'),
      Approver: String(row.CurrentApproverName || '—'),
      Age: row.SubmittedAt
        ? `${Math.max(0, Math.floor((Date.now() - new Date(row.SubmittedAt).getTime()) / 86400000))}d`
        : '—',
      Risk: String(row.RiskFlags || '—'),
      Status: String(row.Status || '—'),
    })),
    kpis: [
      { id: 'pending-mine', label: 'Pending My Approval', primary: String(pending.length), secondary: money(sum(pending)), tone: 'blue' },
      { id: 'pending-value', label: 'Total Pending Value', primary: money(sum(pending)), secondary: 'Across all stages', tone: 'teal' },
      { id: 'overdue', label: 'Overdue Approvals', primary: String(overdue.length), secondary: money(sum(overdue)), tone: 'orange' },
      { id: 'returned', label: 'Returned Requests', primary: String(returned.length), secondary: money(sum(returned)), tone: 'purple' },
      { id: 'high-value', label: 'High-Value Requests', primary: String(highValue.length), secondary: 'Above approval limit', tone: 'red' },
      { id: 'awaiting-release', label: 'Payments Awaiting Final Release', primary: String(awaitingRelease.length), secondary: money(sum(awaitingRelease)), tone: 'blue' },
      { id: 'approved-today', label: 'Payments Approved Today', primary: String(approvedToday.length), secondary: money(sum(approvedToday)), tone: 'green' },
      { id: 'rejected-month', label: 'Rejected This Month', primary: String(rejectedMonth.length), secondary: money(sum(rejectedMonth)), tone: 'rose' },
    ],
  };
};
