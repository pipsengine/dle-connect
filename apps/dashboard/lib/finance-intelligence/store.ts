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
    await pool.request().query(ensureFinanceSchemaSql);
    schemaReady = true;
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

  const [
    paymentApprovals,
    overdueApprovals,
    scheduledReports,
    failedDeliveries,
    dataIntegration,
    exceptions,
  ] = await Promise.all([
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[ApprovalRequests] WHERE [Status] IN (N'Pending', N'Returned')`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[ApprovalRequests] WHERE [Status] = N'Pending' AND [DueDate] IS NOT NULL AND [DueDate] < CAST(SYSUTCDATETIME() AS DATE)`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[ReportDistributions] WHERE [Status] = N'Scheduled'`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[ReportDistributions] WHERE [Status] = N'Failed'`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[IntegrationStatus] WHERE [Status] NOT IN (N'Healthy', N'Optimal', N'Connected')`),
    countQuery(pool, `SELECT COUNT(1) AS count FROM [finance].[Exceptions] WHERE [Status] = N'Open'`),
  ]);

  return {
    paymentApprovals,
    approvalInbox: paymentApprovals,
    approvalMonitoring: overdueApprovals + paymentApprovals > 0 ? Math.min(paymentApprovals, 99) : 0,
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

export const listFinanceApprovalRequests = async (input?: { status?: string; mineFor?: string }) => {
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
    const result = await request.query(`
SELECT TOP 200 *
FROM [finance].[ApprovalRequests]
WHERE ${where}
ORDER BY [SubmittedAt] DESC
`);
    return result.recordset || [];
  } catch {
    return [];
  }
};
