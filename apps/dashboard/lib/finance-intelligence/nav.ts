import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  ChartNoAxesCombined,
  Database,
  FileBarChart,
  LayoutDashboard,
  Presentation,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';

export type FinanceBadgeTone = 'blue' | 'amber' | 'red' | 'green' | 'grey';

export type FinanceNavLeaf = {
  id: string;
  label: string;
  href: string;
  /** Only set for actionable badge surfaces */
  badgeKey?: string;
};

export type FinanceNavSection = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: string;
  children: FinanceNavLeaf[];
};

export type FinancePageKind =
  | 'command-centre'
  | 'section-dashboard'
  | 'reporting-hub'
  | 'analysis-hub'
  | 'ai-copilot'
  | 'approvals-dashboard'
  | 'payment-requests'
  | 'cash-advance-controls'
  | 'treasury-ops'
  | 'finance-posting'
  | 'approval-queue'
  | 'approval-detail'
  | 'statement'
  | 'analysis-workspace'
  | 'explorer'
  | 'pack'
  | 'distribution'
  | 'audit'
  | 'configuration'
  | 'approval-matrix'
  | 'approval-limits'
  | 'delegation-rules'
  | 'workspace';

export type FinancePageMeta = {
  id: string;
  href: string;
  title: string;
  description: string;
  sectionId: string;
  kind: FinancePageKind;
  parentHref?: string;
  breadcrumbs: string[];
  features?: string[];
};

/** Condensed portal sidebar — L1 + L2 only (full hierarchy is in page registry). */
export const FINANCE_NAV_SECTIONS: FinanceNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/finance/overview',
    icon: LayoutDashboard,
    children: [
      { id: 'command-centre', label: 'Finance Command Centre', href: '/finance/overview/command-centre' },
      { id: 'my-workspace', label: 'My Finance Workspace', href: '/finance/overview/my-workspace' },
      { id: 'executive-overview', label: 'Executive Overview', href: '/finance/overview/executive' },
      { id: 'data-integration', label: 'Data Integration Status', href: '/finance/overview/data-integration', badgeKey: 'dataIntegration' },
    ],
  },
  {
    id: 'reporting',
    label: 'Financial Reporting',
    href: '/finance/reporting',
    icon: FileBarChart,
    children: [
      { id: 'reporting-dashboard', label: 'Reporting Dashboard', href: '/finance/reporting' },
      { id: 'statements', label: 'Financial Statements', href: '/finance/reporting/statements' },
      { id: 'management', label: 'Management Reports', href: '/finance/reporting/management' },
      { id: 'exposure', label: 'Exposure Reports', href: '/finance/reporting/exposure' },
      { id: 'packs', label: 'Reporting Packs', href: '/finance/reporting/packs' },
      { id: 'builder', label: 'Report Builder', href: '/finance/reporting/builder' },
    ],
  },
  {
    id: 'analysis',
    label: 'Financial Analysis',
    href: '/finance/analysis',
    icon: ChartNoAxesCombined,
    children: [
      { id: 'analysis-dashboard', label: 'Analysis Dashboard', href: '/finance/analysis' },
      { id: 'performance', label: 'Performance Analysis', href: '/finance/analysis/performance' },
      { id: 'profitability', label: 'Profitability Analysis', href: '/finance/analysis/profitability' },
      { id: 'working-capital', label: 'Working Capital', href: '/finance/analysis/working-capital' },
      { id: 'ratios', label: 'Financial Ratios', href: '/finance/analysis/ratios' },
      { id: 'modelling', label: 'Financial Modelling', href: '/finance/analysis/modelling' },
      { id: 'investment', label: 'Investment Analysis', href: '/finance/analysis/investment' },
    ],
  },
  {
    id: 'ai-copilot',
    label: 'AI Finance Copilot',
    href: '/finance/ai-copilot',
    icon: Sparkles,
    children: [
      { id: 'ask-finance', label: 'Ask Finance', href: '/finance/ai-copilot' },
      { id: 'performance-summary', label: 'Financial Performance Summary', href: '/finance/ai-copilot/performance-summary' },
      { id: 'revenue-expense', label: 'Revenue & Expense Insights', href: '/finance/ai-copilot/revenue-expense' },
      { id: 'cashflow-intel', label: 'Cash-Flow Intelligence', href: '/finance/ai-copilot/cash-flow' },
      { id: 'budget-variance', label: 'Budget Variance Intelligence', href: '/finance/ai-copilot/budget-variance' },
      { id: 'project-margin', label: 'Project Margin Intelligence', href: '/finance/ai-copilot/project-margin' },
      { id: 'anomalies', label: 'Transaction Anomalies', href: '/finance/ai-copilot/anomalies' },
      { id: 'duplicates', label: 'Duplicate Invoice Detection', href: '/finance/ai-copilot/duplicates' },
      { id: 'receivable-risk', label: 'Receivable Risk Insights', href: '/finance/ai-copilot/receivable-risk' },
      { id: 'cost-reduction', label: 'Cost Reduction Opportunities', href: '/finance/ai-copilot/cost-reduction' },
      { id: 'forecast-assistant', label: 'Forecast & Scenario Assistant', href: '/finance/ai-copilot/forecast' },
      { id: 'management-commentary', label: 'Management Commentary', href: '/finance/ai-copilot/management-commentary' },
      { id: 'board-narrative', label: 'Board Narrative Generator', href: '/finance/ai-copilot/board-narrative' },
      { id: 'presentation-summary', label: 'Presentation Summary Generator', href: '/finance/ai-copilot/presentation-summary' },
      { id: 'ai-history', label: 'AI Analysis History', href: '/finance/ai-copilot/history' },
    ],
  },
  {
    id: 'approvals',
    label: 'Payment Approvals',
    href: '/finance/approvals',
    icon: BadgeCheck,
    badgeKey: 'paymentApprovals',
    children: [
      { id: 'approval-dashboard', label: 'Approval Dashboard', href: '/finance/approvals' },
      { id: 'inbox', label: 'My Approval Inbox', href: '/finance/approvals/inbox', badgeKey: 'approvalInbox' },
      { id: 'payment-requests', label: 'Payment Requests', href: '/finance/approvals/payments' },
      { id: 'my-requests', label: 'My Requests', href: '/finance/approvals/my-requests' },
      { id: 'cash-advances', label: 'Cash Advances', href: '/finance/approvals/cash-advances' },
      { id: 'cash-advance-controls', label: 'Cash Advance Controls', href: '/finance/approvals/advance-retirement' },
      { id: 'treasury', label: 'Treasury Operations', href: '/finance/approvals/treasury' },
      { id: 'sage-posting', label: 'Finance Posting Desk', href: '/finance/approvals/sage-posting' },
      { id: 'supplier-payments', label: 'Supplier Payments', href: '/finance/approvals/supplier-payments' },
      { id: 'expense-payments', label: 'Expense Payments', href: '/finance/approvals/expense-payments' },
      { id: 'payment-batches', label: 'Payment Batches', href: '/finance/approvals/batches' },
      { id: 'other-requests', label: 'Other Finance Requests', href: '/finance/approvals/other' },
    ],
  },
  {
    id: 'monitoring',
    label: 'Approval Monitoring',
    href: '/finance/approvals/monitoring',
    icon: Workflow,
    badgeKey: 'approvalMonitoring',
    children: [
      { id: 'tracker', label: 'Approval Tracker', href: '/finance/approvals/monitoring' },
      { id: 'pending', label: 'Pending Approvals', href: '/finance/approvals/monitoring/pending' },
      { id: 'overdue', label: 'Overdue Approvals', href: '/finance/approvals/monitoring/overdue', badgeKey: 'overdueApprovals' },
      { id: 'returned', label: 'Returned Requests', href: '/finance/approvals/monitoring/returned' },
      { id: 'rejected', label: 'Rejected Requests', href: '/finance/approvals/monitoring/rejected' },
      { id: 'delegated', label: 'Delegated Approvals', href: '/finance/approvals/monitoring/delegated' },
      { id: 'escalated', label: 'Escalated Approvals', href: '/finance/approvals/monitoring/escalated' },
      { id: 'completed', label: 'Completed Approvals', href: '/finance/approvals/monitoring/completed' },
      { id: 'history', label: 'Approval History', href: '/finance/approvals/monitoring/history' },
      { id: 'audit-trail', label: 'Approval Audit Trail', href: '/finance/approvals/monitoring/audit-trail' },
    ],
  },
  {
    id: 'packs',
    label: 'Finance Packs',
    href: '/finance/packs',
    icon: Presentation,
    children: [
      { id: 'pack-dashboard', label: 'Pack Dashboard', href: '/finance/packs' },
      { id: 'monthly', label: 'Monthly Finance Pack', href: '/finance/packs/monthly' },
      { id: 'executive', label: 'Executive Pack', href: '/finance/packs/executive' },
      { id: 'board', label: 'Board Pack', href: '/finance/packs/board' },
      { id: 'project-review', label: 'Project Review Pack', href: '/finance/packs/project-review' },
      { id: 'investor', label: 'Investor Presentation', href: '/finance/packs/investor' },
      { id: 'saved', label: 'Saved Presentations', href: '/finance/packs/saved' },
      { id: 'templates', label: 'Presentation Templates', href: '/finance/packs/templates' },
    ],
  },
  {
    id: 'data-explorer',
    label: 'Data Explorer',
    href: '/finance/data-explorer',
    icon: Database,
    children: [
      { id: 'sage-explorer', label: 'Sage X3 Data Explorer', href: '/finance/data-explorer' },
      { id: 'account-balance', label: 'Account Balance Explorer', href: '/finance/data-explorer/account-balance' },
      { id: 'transactions', label: 'Transaction Explorer', href: '/finance/data-explorer/transactions' },
      { id: 'customers', label: 'Customer Explorer', href: '/finance/data-explorer/customers' },
      { id: 'suppliers', label: 'Supplier Explorer', href: '/finance/data-explorer/suppliers' },
      { id: 'project-cost', label: 'Project Cost Explorer', href: '/finance/data-explorer/project-cost' },
      { id: 'cost-centre', label: 'Cost Centre Explorer', href: '/finance/data-explorer/cost-centre' },
      { id: 'department', label: 'Department Explorer', href: '/finance/data-explorer/department' },
      { id: 'bank-cash', label: 'Bank & Cash Explorer', href: '/finance/data-explorer/bank-cash' },
      { id: 'source-docs', label: 'Source Document Viewer', href: '/finance/data-explorer/source-documents' },
    ],
  },
  {
    id: 'distribution',
    label: 'Report Distribution',
    href: '/finance/distribution',
    icon: Send,
    children: [
      { id: 'distribution-dashboard', label: 'Distribution Dashboard', href: '/finance/distribution' },
      { id: 'scheduled', label: 'Scheduled Reports', href: '/finance/distribution/scheduled', badgeKey: 'scheduledReports' },
      { id: 'email', label: 'Email Distribution', href: '/finance/distribution/email' },
      { id: 'lists', label: 'Distribution Lists', href: '/finance/distribution/lists' },
      { id: 'subscriptions', label: 'Report Subscriptions', href: '/finance/distribution/subscriptions' },
      { id: 'delivery-history', label: 'Delivery History', href: '/finance/distribution/history' },
      { id: 'failed', label: 'Failed Deliveries', href: '/finance/distribution/failed', badgeKey: 'failedDeliveries' },
    ],
  },
  {
    id: 'audit',
    label: 'Audit & Governance',
    href: '/finance/audit',
    icon: ShieldCheck,
    children: [
      { id: 'audit-dashboard', label: 'Finance Audit Dashboard', href: '/finance/audit' },
      { id: 'access-log', label: 'Report Access Log', href: '/finance/audit/access-log' },
      { id: 'export-log', label: 'Report Export Log', href: '/finance/audit/export-log' },
      { id: 'approval-audit', label: 'Approval Audit Log', href: '/finance/audit/approval-log' },
      { id: 'ai-query-audit', label: 'AI Query Audit', href: '/finance/audit/ai-query-log' },
      { id: 'drilldown-log', label: 'Data Drill-Down Log', href: '/finance/audit/drilldown-log' },
      { id: 'signoff-history', label: 'Sign-Off History', href: '/finance/audit/signoff-history' },
      { id: 'delegation-history', label: 'Delegation History', href: '/finance/audit/delegation-history' },
      { id: 'exception-register', label: 'Exception Register', href: '/finance/audit/exceptions', badgeKey: 'exceptions' },
    ],
  },
  {
    id: 'configuration',
    label: 'Finance Configuration',
    href: '/finance/configuration',
    icon: Settings,
    children: [
      { id: 'sage-x3', label: 'Sage X3 Integration', href: '/finance/configuration/sage-x3' },
      { id: 'data-mapping', label: 'Data Source Mapping', href: '/finance/configuration/data-mapping' },
      { id: 'statement-mapping', label: 'Financial Statement Mapping', href: '/finance/configuration/statement-mapping' },
      { id: 'report-definitions', label: 'Report Definitions', href: '/finance/configuration/report-definitions' },
      { id: 'periods', label: 'Reporting Periods', href: '/finance/configuration/periods' },
      { id: 'entities', label: 'Company & Entity Setup', href: '/finance/configuration/entities' },
      { id: 'currency', label: 'Currency Configuration', href: '/finance/configuration/currency' },
      { id: 'approval-matrix', label: 'Approval Matrix', href: '/finance/configuration/approval-matrix' },
      { id: 'approval-limits', label: 'Approval Limits', href: '/finance/configuration/approval-limits' },
      { id: 'delegation-rules', label: 'Delegation Rules', href: '/finance/configuration/delegation-rules' },
      { id: 'distribution-rules', label: 'Report Distribution Rules', href: '/finance/configuration/distribution-rules' },
      { id: 'ai-governance', label: 'AI Governance', href: '/finance/configuration/ai-governance' },
      { id: 'permissions', label: 'Finance Permissions', href: '/finance/configuration/permissions' },
    ],
  },
];

const page = (
  href: string,
  title: string,
  description: string,
  sectionId: string,
  kind: FinancePageKind,
  breadcrumbs: string[],
  features?: string[],
  parentHref?: string,
): FinancePageMeta => ({
  id: href.replace(/^\/finance\/?/, '').replace(/\//g, '-') || 'root',
  href,
  title,
  description,
  sectionId,
  kind,
  breadcrumbs,
  features,
  parentHref,
});

/** Full page registry — every leaf from the specification, no omissions. */
export const FINANCE_PAGES: FinancePageMeta[] = [
  // Overview
  page('/finance/overview', 'Overview', 'Finance Intelligence overview and command surfaces.', 'overview', 'section-dashboard', ['Overview'], ['Command Centre', 'Workspace', 'Executive', 'Integration']),
  page('/finance/overview/command-centre', 'Finance Command Centre', 'Financial reporting, analytics, AI-assisted insights and payment approvals integrated with Sage X3 Enterprise.', 'overview', 'command-centre', ['Overview', 'Finance Command Centre']),
  page('/finance/overview/my-workspace', 'My Finance Workspace', 'Personal finance tasks, drafts, approvals and saved analyses.', 'overview', 'workspace', ['Overview', 'My Finance Workspace'], ['Pending approvals', 'Draft reports', 'Saved analyses', 'Recent packs']),
  page('/finance/overview/executive', 'Executive Overview', 'Executive-level financial performance and risk snapshot.', 'overview', 'workspace', ['Overview', 'Executive Overview'], ['KPI strip', 'Trend', 'Exceptions', 'Ask Finance AI']),
  page('/finance/overview/data-integration', 'Data Integration Status', 'Sage X3 read-only integration health, refresh status and sync exceptions.', 'overview', 'configuration', ['Overview', 'Data Integration Status'], ['Connection status', 'Last refresh', 'Failed syncs', 'Source systems']),

  // Reporting hub + categories
  page('/finance/reporting', 'Reporting Dashboard', 'Category cards for statements, management reports, exposure and packs.', 'reporting', 'reporting-hub', ['Financial Reporting']),
  page('/finance/reporting/statements', 'Financial Statements', 'Primary financial statements sourced from Sage X3 balances and journals.', 'reporting', 'section-dashboard', ['Financial Reporting', 'Financial Statements'], [
    'Statement of Financial Position', 'Statement of Profit or Loss', 'Statement of Cash Flows', 'Statement of Changes in Equity', 'Trial Balance', 'General Ledger Enquiry', 'Cashbook', 'Notes & Supporting Schedules',
  ]),
  page('/finance/reporting/statements/financial-position', 'Statement of Financial Position', 'Assets, liabilities and equity position from Sage X3.', 'reporting', 'statement', ['Financial Reporting', 'Financial Statements', 'Statement of Financial Position'], undefined, '/finance/reporting/statements'),
  page('/finance/reporting/statements/profit-or-loss', 'Statement of Profit or Loss', 'Revenue, expense and profit performance for the selected period.', 'reporting', 'statement', ['Financial Reporting', 'Financial Statements', 'Statement of Profit or Loss'], undefined, '/finance/reporting/statements'),
  page('/finance/reporting/statements/cash-flows', 'Statement of Cash Flows', 'Operating, investing and financing cash flows.', 'reporting', 'statement', ['Financial Reporting', 'Financial Statements', 'Statement of Cash Flows'], undefined, '/finance/reporting/statements'),
  page('/finance/reporting/statements/changes-in-equity', 'Statement of Changes in Equity', 'Movements in equity accounts for the reporting period.', 'reporting', 'statement', ['Financial Reporting', 'Financial Statements', 'Statement of Changes in Equity'], undefined, '/finance/reporting/statements'),
  page('/finance/reporting/statements/trial-balance', 'Trial Balance', 'Debit and credit trial balance with drill-down to Sage X3.', 'reporting', 'statement', ['Financial Reporting', 'Financial Statements', 'Trial Balance'], undefined, '/finance/reporting/statements'),
  page('/finance/reporting/statements/general-ledger', 'General Ledger Enquiry', 'Controlled GL enquiry and transaction drill-down.', 'reporting', 'explorer', ['Financial Reporting', 'Financial Statements', 'General Ledger Enquiry'], undefined, '/finance/reporting/statements'),
  page('/finance/reporting/statements/cashbook', 'Cashbook', 'Bank and cashbook movements with source document links.', 'reporting', 'statement', ['Financial Reporting', 'Financial Statements', 'Cashbook'], undefined, '/finance/reporting/statements'),
  page('/finance/reporting/statements/notes', 'Notes & Supporting Schedules', 'Supporting schedules and disclosure notes for financial statements.', 'reporting', 'statement', ['Financial Reporting', 'Financial Statements', 'Notes & Supporting Schedules'], undefined, '/finance/reporting/statements'),

  page('/finance/reporting/management', 'Management Reports', 'Management reporting pack for operational and departmental performance.', 'reporting', 'section-dashboard', ['Financial Reporting', 'Management Reports'], [
    'Revenue Analysis', 'Expense Analysis', 'Gross Margin Analysis', 'EBITDA Analysis', 'Working Capital Analysis', 'Liquidity Analysis', 'Cost Centre Performance', 'Departmental Performance', 'Project Profitability', 'Budget vs Actual', 'Forecast vs Actual', 'Cash-Flow Projection',
  ]),
  page('/finance/reporting/management/revenue', 'Revenue Analysis', 'Revenue performance by entity, department, project and customer.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Revenue Analysis'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/expense', 'Expense Analysis', 'Operating and overhead expense analysis with variance drivers.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Expense Analysis'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/gross-margin', 'Gross Margin Analysis', 'Gross margin trends and contribution by segment.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Gross Margin Analysis'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/ebitda', 'EBITDA Analysis', 'EBITDA bridge, margins and period comparison.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'EBITDA Analysis'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/working-capital', 'Working Capital Analysis', 'Working capital composition and movement analysis.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Working Capital Analysis'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/liquidity', 'Liquidity Analysis', 'Liquidity position, runway and cash coverage.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Liquidity Analysis'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/cost-centre', 'Cost Centre Performance', 'Cost centre spend versus budget and prior periods.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Cost Centre Performance'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/departmental', 'Departmental Performance', 'Department P&L and cost contribution views.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Departmental Performance'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/project-profitability', 'Project Profitability', 'Project margin, cost recovery and profitability.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Project Profitability'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/budget-vs-actual', 'Budget vs Actual', 'Budget variance analysis with drill-down to Sage X3.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Budget vs Actual'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/forecast-vs-actual', 'Forecast vs Actual', 'Forecast tracking against actuals and remaining outlook.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Forecast vs Actual'], undefined, '/finance/reporting/management'),
  page('/finance/reporting/management/cash-flow-projection', 'Cash-Flow Projection', 'Forward cash-flow projection and liquidity outlook.', 'reporting', 'workspace', ['Financial Reporting', 'Management Reports', 'Cash-Flow Projection'], undefined, '/finance/reporting/management'),

  page('/finance/reporting/exposure', 'Exposure & Concentration', 'Credit, concentration, FX and tax exposure reporting.', 'reporting', 'section-dashboard', ['Financial Reporting', 'Exposure & Concentration'], [
    'Customer Concentration', 'Supplier Concentration', 'Receivable Ageing', 'Payable Ageing', 'Foreign Exchange Exposure', 'Tax Exposure', 'Capital Expenditure Analysis',
  ]),
  page('/finance/reporting/exposure/customer-concentration', 'Customer Concentration', 'Revenue and receivable concentration by customer.', 'reporting', 'workspace', ['Financial Reporting', 'Exposure & Concentration', 'Customer Concentration'], undefined, '/finance/reporting/exposure'),
  page('/finance/reporting/exposure/supplier-concentration', 'Supplier Concentration', 'Spend and payable concentration by supplier.', 'reporting', 'workspace', ['Financial Reporting', 'Exposure & Concentration', 'Supplier Concentration'], undefined, '/finance/reporting/exposure'),
  page('/finance/reporting/exposure/receivable-ageing', 'Receivable Ageing', 'AR ageing buckets with overdue and risk flags.', 'reporting', 'workspace', ['Financial Reporting', 'Exposure & Concentration', 'Receivable Ageing'], undefined, '/finance/reporting/exposure'),
  page('/finance/reporting/exposure/payable-ageing', 'Payable Ageing', 'AP ageing and payment urgency view.', 'reporting', 'workspace', ['Financial Reporting', 'Exposure & Concentration', 'Payable Ageing'], undefined, '/finance/reporting/exposure'),
  page('/finance/reporting/exposure/fx', 'Foreign Exchange Exposure', 'FX exposure by currency, entity and open position.', 'reporting', 'workspace', ['Financial Reporting', 'Exposure & Concentration', 'Foreign Exchange Exposure'], undefined, '/finance/reporting/exposure'),
  page('/finance/reporting/exposure/tax', 'Tax Exposure', 'Tax liabilities, filings and exposure monitoring.', 'reporting', 'workspace', ['Financial Reporting', 'Exposure & Concentration', 'Tax Exposure'], undefined, '/finance/reporting/exposure'),
  page('/finance/reporting/exposure/capex', 'Capital Expenditure Analysis', 'Capex commitments, spend and remaining budget.', 'reporting', 'workspace', ['Financial Reporting', 'Exposure & Concentration', 'Capital Expenditure Analysis'], undefined, '/finance/reporting/exposure'),

  page('/finance/reporting/packs', 'Reporting Packs', 'Assembled packs for management, executive, board and project review.', 'reporting', 'section-dashboard', ['Financial Reporting', 'Reporting Packs'], [
    'Monthly Management Accounts', 'Executive Financial Pack', 'Board Financial Pack', 'Project Financial Pack', 'Custom Financial Pack',
  ]),
  page('/finance/reporting/packs/monthly-management', 'Monthly Management Accounts', 'Monthly management accounts pack assembly and sign-off.', 'reporting', 'pack', ['Financial Reporting', 'Reporting Packs', 'Monthly Management Accounts'], undefined, '/finance/reporting/packs'),
  page('/finance/reporting/packs/executive', 'Executive Financial Pack', 'Executive pack for leadership review.', 'reporting', 'pack', ['Financial Reporting', 'Reporting Packs', 'Executive Financial Pack'], undefined, '/finance/reporting/packs'),
  page('/finance/reporting/packs/board', 'Board Financial Pack', 'Board financial pack with narrative and exhibits.', 'reporting', 'pack', ['Financial Reporting', 'Reporting Packs', 'Board Financial Pack'], undefined, '/finance/reporting/packs'),
  page('/finance/reporting/packs/project', 'Project Financial Pack', 'Project financial review pack.', 'reporting', 'pack', ['Financial Reporting', 'Reporting Packs', 'Project Financial Pack'], undefined, '/finance/reporting/packs'),
  page('/finance/reporting/packs/custom', 'Custom Financial Pack', 'Custom pack builder for ad-hoc distribution.', 'reporting', 'pack', ['Financial Reporting', 'Reporting Packs', 'Custom Financial Pack'], undefined, '/finance/reporting/packs'),

  page('/finance/reporting/builder', 'Reporting Workspace', 'Report preparation, versions, scheduling, distribution and sign-off.', 'reporting', 'section-dashboard', ['Financial Reporting', 'Reporting Workspace'], [
    'Report Builder', 'Saved Reports', 'Report Templates', 'Report Versions', 'Scheduled Reports', 'Report Distribution', 'Report Sign-Off',
  ]),
  page('/finance/reporting/builder/report-builder', 'Report Builder', 'Compose financial reports from Sage X3 datasets and saved definitions.', 'reporting', 'workspace', ['Financial Reporting', 'Reporting Workspace', 'Report Builder'], undefined, '/finance/reporting/builder'),
  page('/finance/reporting/builder/saved', 'Saved Reports', 'Saved report catalogue and favourites.', 'reporting', 'workspace', ['Financial Reporting', 'Reporting Workspace', 'Saved Reports'], undefined, '/finance/reporting/builder'),
  page('/finance/reporting/builder/templates', 'Report Templates', 'Reusable report templates and layouts.', 'reporting', 'workspace', ['Financial Reporting', 'Reporting Workspace', 'Report Templates'], undefined, '/finance/reporting/builder'),
  page('/finance/reporting/builder/versions', 'Report Versions', 'Version history and compare for prepared reports.', 'reporting', 'workspace', ['Financial Reporting', 'Reporting Workspace', 'Report Versions'], undefined, '/finance/reporting/builder'),
  page('/finance/reporting/builder/scheduled', 'Scheduled Reports', 'Schedule generation and delivery of reports.', 'reporting', 'workspace', ['Financial Reporting', 'Reporting Workspace', 'Scheduled Reports'], undefined, '/finance/reporting/builder'),
  page('/finance/reporting/builder/distribution', 'Report Distribution', 'Distribute prepared reports to authorized recipients.', 'reporting', 'distribution', ['Financial Reporting', 'Reporting Workspace', 'Report Distribution'], undefined, '/finance/reporting/builder'),
  page('/finance/reporting/builder/sign-off', 'Report Sign-Off', 'Review and sign-off workflow for financial reports.', 'reporting', 'workspace', ['Financial Reporting', 'Reporting Workspace', 'Report Sign-Off'], undefined, '/finance/reporting/builder'),

  // Analysis
  page('/finance/analysis', 'Analysis Dashboard', 'Six analytical workspaces for performance, profitability, modelling and ratios.', 'analysis', 'analysis-hub', ['Financial Analysis']),
  page('/finance/analysis/performance', 'Performance Analysis', 'Horizontal, vertical, trend, variance and ratio analysis workspace.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Performance Analysis'], [
    'Horizontal Analysis', 'Vertical Analysis', 'Trend Analysis', 'Variance Analysis', 'Ratio Analysis',
  ]),
  page('/finance/analysis/performance/horizontal', 'Horizontal Analysis', 'Period-over-period horizontal analysis.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Performance Analysis', 'Horizontal Analysis'], undefined, '/finance/analysis/performance'),
  page('/finance/analysis/performance/vertical', 'Vertical Analysis', 'Common-size vertical analysis.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Performance Analysis', 'Vertical Analysis'], undefined, '/finance/analysis/performance'),
  page('/finance/analysis/performance/trend', 'Trend Analysis', 'Multi-period trend analysis and charts.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Performance Analysis', 'Trend Analysis'], undefined, '/finance/analysis/performance'),
  page('/finance/analysis/performance/variance', 'Variance Analysis', 'Budget and prior-period variance analysis.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Performance Analysis', 'Variance Analysis'], undefined, '/finance/analysis/performance'),
  page('/finance/analysis/performance/ratio', 'Ratio Analysis', 'Performance ratio set with comparative periods.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Performance Analysis', 'Ratio Analysis'], undefined, '/finance/analysis/performance'),

  page('/finance/analysis/profitability', 'Profitability Analysis', 'Customer, supplier, project and contribution profitability.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Profitability Analysis'], [
    'Customer Profitability', 'Supplier Spend Analysis', 'Project Profitability', 'Department Cost Analysis', 'Contribution Margin', 'Cost-Volume-Profit Analysis',
  ]),
  page('/finance/analysis/profitability/customer', 'Customer Profitability', 'Customer-level profitability and margin contribution.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Profitability Analysis', 'Customer Profitability'], undefined, '/finance/analysis/profitability'),
  page('/finance/analysis/profitability/supplier-spend', 'Supplier Spend Analysis', 'Supplier spend patterns and concentration.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Profitability Analysis', 'Supplier Spend Analysis'], undefined, '/finance/analysis/profitability'),
  page('/finance/analysis/profitability/project', 'Project Profitability', 'Project margin and cost recovery analysis.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Profitability Analysis', 'Project Profitability'], undefined, '/finance/analysis/profitability'),
  page('/finance/analysis/profitability/department-cost', 'Department Cost Analysis', 'Department cost structure and trends.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Profitability Analysis', 'Department Cost Analysis'], undefined, '/finance/analysis/profitability'),
  page('/finance/analysis/profitability/contribution-margin', 'Contribution Margin', 'Contribution margin by product, project or segment.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Profitability Analysis', 'Contribution Margin'], undefined, '/finance/analysis/profitability'),
  page('/finance/analysis/profitability/cvp', 'Cost-Volume-Profit Analysis', 'CVP relationships and break-even support.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Profitability Analysis', 'Cost-Volume-Profit Analysis'], undefined, '/finance/analysis/profitability'),

  page('/finance/analysis/modelling', 'Financial Modelling', 'Sensitivity, scenario, break-even and what-if modelling.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Modelling'], [
    'Sensitivity Analysis', 'Scenario Analysis', 'Break-Even Analysis', 'Cash-Flow Forecasting', 'What-If Modelling',
  ]),
  page('/finance/analysis/modelling/sensitivity', 'Sensitivity Analysis', 'Sensitivity of key outcomes to driver changes.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Modelling', 'Sensitivity Analysis'], undefined, '/finance/analysis/modelling'),
  page('/finance/analysis/modelling/scenario', 'Scenario Analysis', 'Base, upside and downside scenario comparison.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Modelling', 'Scenario Analysis'], undefined, '/finance/analysis/modelling'),
  page('/finance/analysis/modelling/break-even', 'Break-Even Analysis', 'Break-even volume, revenue and margin analysis.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Modelling', 'Break-Even Analysis'], undefined, '/finance/analysis/modelling'),
  page('/finance/analysis/modelling/cash-flow-forecast', 'Cash-Flow Forecasting', 'Cash-flow forecast model with assumptions.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Modelling', 'Cash-Flow Forecasting'], undefined, '/finance/analysis/modelling'),
  page('/finance/analysis/modelling/what-if', 'What-If Modelling', 'Interactive what-if modelling workspace.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Modelling', 'What-If Modelling'], undefined, '/finance/analysis/modelling'),

  page('/finance/analysis/investment', 'Investment Analysis', 'ROI, NPV, IRR and payback evaluation.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Investment Analysis'], [
    'Return on Investment', 'Net Present Value', 'Internal Rate of Return', 'Payback Period',
  ]),
  page('/finance/analysis/investment/roi', 'Return on Investment', 'ROI calculation and comparative ranking.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Investment Analysis', 'Return on Investment'], undefined, '/finance/analysis/investment'),
  page('/finance/analysis/investment/npv', 'Net Present Value', 'NPV modelling with discount rate controls.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Investment Analysis', 'Net Present Value'], undefined, '/finance/analysis/investment'),
  page('/finance/analysis/investment/irr', 'Internal Rate of Return', 'IRR evaluation for capital projects.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Investment Analysis', 'Internal Rate of Return'], undefined, '/finance/analysis/investment'),
  page('/finance/analysis/investment/payback', 'Payback Period', 'Simple and discounted payback period analysis.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Investment Analysis', 'Payback Period'], undefined, '/finance/analysis/investment'),

  page('/finance/analysis/working-capital', 'Working Capital', 'Working capital overview and cash conversion cycle.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Working Capital'], [
    'Working Capital Overview', 'Receivable Days', 'Payable Days', 'Inventory Days', 'Cash Conversion Cycle',
  ]),
  page('/finance/analysis/working-capital/overview', 'Working Capital Overview', 'Working capital composition and movement.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Working Capital', 'Working Capital Overview'], undefined, '/finance/analysis/working-capital'),
  page('/finance/analysis/working-capital/receivable-days', 'Receivable Days', 'Days sales outstanding and AR velocity.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Working Capital', 'Receivable Days'], undefined, '/finance/analysis/working-capital'),
  page('/finance/analysis/working-capital/payable-days', 'Payable Days', 'Days payable outstanding and payment cycle.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Working Capital', 'Payable Days'], undefined, '/finance/analysis/working-capital'),
  page('/finance/analysis/working-capital/inventory-days', 'Inventory Days', 'Inventory days and turnover.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Working Capital', 'Inventory Days'], undefined, '/finance/analysis/working-capital'),
  page('/finance/analysis/working-capital/cash-conversion', 'Cash Conversion Cycle', 'End-to-end cash conversion cycle.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Working Capital', 'Cash Conversion Cycle'], undefined, '/finance/analysis/working-capital'),

  page('/finance/analysis/ratios', 'Financial Ratios', 'Liquidity, profitability, efficiency and leverage ratios.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Ratios'], [
    'Liquidity Ratios', 'Profitability Ratios', 'Efficiency Ratios', 'Leverage Ratios', 'Ratio Comparison',
  ]),
  page('/finance/analysis/ratios/liquidity', 'Liquidity Ratios', 'Current, quick and cash ratio analysis.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Ratios', 'Liquidity Ratios'], undefined, '/finance/analysis/ratios'),
  page('/finance/analysis/ratios/profitability', 'Profitability Ratios', 'Margin and return ratios.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Ratios', 'Profitability Ratios'], undefined, '/finance/analysis/ratios'),
  page('/finance/analysis/ratios/efficiency', 'Efficiency Ratios', 'Asset and working-capital efficiency ratios.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Ratios', 'Efficiency Ratios'], undefined, '/finance/analysis/ratios'),
  page('/finance/analysis/ratios/leverage', 'Leverage Ratios', 'Debt, gearing and coverage ratios.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Ratios', 'Leverage Ratios'], undefined, '/finance/analysis/ratios'),
  page('/finance/analysis/ratios/comparison', 'Ratio Comparison', 'Cross-period and peer ratio comparison.', 'analysis', 'analysis-workspace', ['Financial Analysis', 'Financial Ratios', 'Ratio Comparison'], undefined, '/finance/analysis/ratios'),

  // AI Copilot (landing + all guided surfaces)
  page('/finance/ai-copilot', 'Ask Finance', 'AI-assisted financial insights with evidence, confidence and human-review controls.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Ask Finance']),
  page('/finance/ai-copilot/performance-summary', 'Financial Performance Summary', 'AI summary of period financial performance.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Financial Performance Summary']),
  page('/finance/ai-copilot/revenue-expense', 'Revenue & Expense Insights', 'AI insights into revenue and expense movements.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Revenue & Expense Insights']),
  page('/finance/ai-copilot/cash-flow', 'Cash-Flow Intelligence', 'AI cash-flow outlook and risk commentary.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Cash-Flow Intelligence']),
  page('/finance/ai-copilot/budget-variance', 'Budget Variance Intelligence', 'AI explanation of budget variances.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Budget Variance Intelligence']),
  page('/finance/ai-copilot/project-margin', 'Project Margin Intelligence', 'AI detection of project margin pressure.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Project Margin Intelligence']),
  page('/finance/ai-copilot/anomalies', 'Transaction Anomalies', 'AI-flagged unusual transactions from Sage X3 feeds.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Transaction Anomalies']),
  page('/finance/ai-copilot/duplicates', 'Duplicate Invoice Detection', 'Potential duplicate invoice detection workspace.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Duplicate Invoice Detection']),
  page('/finance/ai-copilot/receivable-risk', 'Receivable Risk Insights', 'AI receivable risk scoring and concentration alerts.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Receivable Risk Insights']),
  page('/finance/ai-copilot/cost-reduction', 'Cost Reduction Opportunities', 'AI-suggested cost reduction opportunities.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Cost Reduction Opportunities']),
  page('/finance/ai-copilot/forecast', 'Forecast & Scenario Assistant', 'AI-assisted forecast and scenario narrative.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Forecast & Scenario Assistant']),
  page('/finance/ai-copilot/management-commentary', 'Management Commentary', 'Draft management commentary for reporting packs.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Management Commentary']),
  page('/finance/ai-copilot/board-narrative', 'Board Narrative Generator', 'Board-ready narrative drafts with evidence links.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Board Narrative Generator']),
  page('/finance/ai-copilot/presentation-summary', 'Presentation Summary Generator', 'Executive presentation summaries from finance packs.', 'ai-copilot', 'ai-copilot', ['AI Finance Copilot', 'Presentation Summary Generator']),
  page('/finance/ai-copilot/history', 'AI Analysis History', 'History of AI queries, drafts and shared analyses.', 'ai-copilot', 'workspace', ['AI Finance Copilot', 'AI Analysis History']),

  // Payment Approvals — full request types
  page('/finance/approvals', 'Approval Dashboard', 'Payment and finance approval command centre.', 'approvals', 'approvals-dashboard', ['Payment Approvals', 'Approval Dashboard']),
  page('/finance/approvals/inbox', 'My Approval Inbox', 'Requests awaiting your decision.', 'approvals', 'approval-queue', ['Payment Approvals', 'My Approval Inbox']),
  page('/finance/approvals/payments', 'Payment Requests', 'Create, submit, track and manage payment requests through the full approval lifecycle.', 'approvals', 'payment-requests', ['Payment Approvals', 'Payment Requests']),
  page('/finance/approvals/my-requests', 'My Requests', 'Drafts, pending, returned, approved, awaiting retirement and completed requests you own.', 'approvals', 'payment-requests', ['Payment Approvals', 'My Requests']),
  page('/finance/approvals/treasury', 'Treasury Operations', 'Ready for payment, paid today, retirement verification and payment history.', 'approvals', 'treasury-ops', ['Payment Approvals', 'Treasury Operations']),
  page('/finance/approvals/sage-posting', 'Finance Posting Desk', 'Paid and retired payments awaiting finance acknowledgement as posted. Marked posted items leave this worklist.', 'approvals', 'finance-posting', ['Payment Approvals', 'Finance Posting Desk']),
  page('/finance/approvals/supplier-payments', 'Supplier Payments', 'Supplier invoice payment queue (PO-backed).', 'approvals', 'payment-requests', ['Payment Approvals', 'Supplier Payments']),
  page('/finance/approvals/expense-payments', 'Expense Payments', 'Expense bills without a purchase order (utility, LAWMA, rent, etc.).', 'approvals', 'payment-requests', ['Payment Approvals', 'Expense Payments']),
  page('/finance/approvals/batches', 'Payment Batches', 'Batch payment approval and release monitoring.', 'approvals', 'approval-queue', ['Payment Approvals', 'Payment Batches']),
  page('/finance/approvals/cash-advances', 'Cash Advances', 'Cash advance requests for approval.', 'approvals', 'payment-requests', ['Payment Approvals', 'Cash Advances']),
  page('/finance/approvals/advance-retirement', 'Cash Advance Controls', 'CFO controls for outstanding cash advances: cancel retirement requirement or grant a one-time waiver.', 'approvals', 'cash-advance-controls', ['Payment Approvals', 'Cash Advance Controls']),
  page('/finance/approvals/expense-claims', 'Expense Claims', 'Employee expense claim approvals.', 'approvals', 'approval-queue', ['Payment Approvals', 'Expense Claims']),
  page('/finance/approvals/budget-requests', 'Budget Requests', 'Budget request approvals.', 'approvals', 'approval-queue', ['Payment Approvals', 'Budget Requests']),
  page('/finance/approvals/budget-transfers', 'Budget Transfers', 'Budget transfer approvals.', 'approvals', 'approval-queue', ['Payment Approvals', 'Budget Transfers']),
  page('/finance/approvals/fx-requests', 'Foreign Exchange Requests', 'FX purchase and conversion requests.', 'approvals', 'approval-queue', ['Payment Approvals', 'Foreign Exchange Requests']),
  page('/finance/approvals/tax-payments', 'Tax Payments', 'Tax payment approval requests.', 'approvals', 'approval-queue', ['Payment Approvals', 'Tax Payments']),
  page('/finance/approvals/write-offs', 'Write-Off Requests', 'Write-off approval requests.', 'approvals', 'approval-queue', ['Payment Approvals', 'Write-Off Requests']),
  page('/finance/approvals/asset-disposal', 'Asset Disposal Requests', 'Asset disposal approval requests.', 'approvals', 'approval-queue', ['Payment Approvals', 'Asset Disposal Requests']),
  page('/finance/approvals/project-variations', 'Project Variation Requests', 'Project variation / change-order financial approvals.', 'approvals', 'approval-queue', ['Payment Approvals', 'Project Variation Requests']),
  page('/finance/approvals/report-signoff', 'Report Sign-Off Requests', 'Financial report sign-off requests.', 'approvals', 'approval-queue', ['Payment Approvals', 'Report Sign-Off Requests']),
  page('/finance/approvals/other', 'Other Finance Requests', 'Cash advances, expenses, budget, FX, tax, write-offs and related requests.', 'approvals', 'section-dashboard', ['Payment Approvals', 'Other Finance Requests'], [
    'Cash Advances', 'Cash Advance Controls', 'Expense Claims', 'Budget Requests', 'Budget Transfers', 'Foreign Exchange Requests', 'Tax Payments', 'Write-Off Requests', 'Asset Disposal Requests', 'Project Variation Requests', 'Report Sign-Off Requests',
  ]),
  page('/finance/approvals/request/[requestId]', 'Approval Detail', 'Payment approval detail with financial context, evidence and workflow actions.', 'approvals', 'approval-detail', ['Payment Approvals', 'Approval Detail']),

  // Monitoring
  page('/finance/approvals/monitoring', 'Approval Tracker', 'Enterprise view of approval progress across stages.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Approval Tracker']),
  page('/finance/approvals/monitoring/pending', 'Pending Approvals', 'All pending finance approvals.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Pending Approvals']),
  page('/finance/approvals/monitoring/overdue', 'Overdue Approvals', 'Approvals past SLA.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Overdue Approvals']),
  page('/finance/approvals/monitoring/returned', 'Returned Requests', 'Requests returned for correction.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Returned Requests']),
  page('/finance/approvals/monitoring/rejected', 'Rejected Requests', 'Rejected finance approval requests.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Rejected Requests']),
  page('/finance/approvals/monitoring/delegated', 'Delegated Approvals', 'Delegated approval assignments.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Delegated Approvals']),
  page('/finance/approvals/monitoring/escalated', 'Escalated Approvals', 'Escalated approval items.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Escalated Approvals']),
  page('/finance/approvals/monitoring/completed', 'Completed Approvals', 'Completed approval outcomes.', 'monitoring', 'approval-queue', ['Approval Monitoring', 'Completed Approvals']),
  page('/finance/approvals/monitoring/history', 'Approval History', 'Historical approval activity.', 'monitoring', 'audit', ['Approval Monitoring', 'Approval History']),
  page('/finance/approvals/monitoring/audit-trail', 'Approval Audit Trail', 'Immutable approval audit trail.', 'monitoring', 'audit', ['Approval Monitoring', 'Approval Audit Trail']),

  // Packs / presentations
  page('/finance/packs', 'Pack Dashboard', 'Finance packs and presentation assembly.', 'packs', 'section-dashboard', ['Finance Packs'], [
    'Monthly Finance Pack', 'Executive Pack', 'Board Pack', 'Project Review Pack', 'Investor Presentation', 'Saved Presentations', 'Presentation Templates',
  ]),
  page('/finance/packs/monthly', 'Monthly Finance Pack', 'Monthly finance pack preparation and distribution.', 'packs', 'pack', ['Finance Packs', 'Monthly Finance Pack']),
  page('/finance/packs/executive', 'Executive Pack', 'Executive presentation pack.', 'packs', 'pack', ['Finance Packs', 'Executive Pack']),
  page('/finance/packs/board', 'Board Pack', 'Board pack assembly and narrative support.', 'packs', 'pack', ['Finance Packs', 'Board Pack']),
  page('/finance/packs/project-review', 'Project Review Pack', 'Project financial review pack.', 'packs', 'pack', ['Finance Packs', 'Project Review Pack']),
  page('/finance/packs/investor', 'Investor Presentation', 'Investor-facing financial presentation workspace.', 'packs', 'pack', ['Finance Packs', 'Investor Presentation']),
  page('/finance/packs/saved', 'Saved Presentations', 'Saved finance presentations.', 'packs', 'workspace', ['Finance Packs', 'Saved Presentations']),
  page('/finance/packs/templates', 'Presentation Templates', 'Presentation templates for finance packs.', 'packs', 'workspace', ['Finance Packs', 'Presentation Templates']),

  // Data explorer
  page('/finance/data-explorer', 'Sage X3 Data Explorer', 'Read-only exploration of Sage X3 financial data.', 'data-explorer', 'explorer', ['Data Explorer', 'Sage X3 Data Explorer']),
  page('/finance/data-explorer/account-balance', 'Account Balance Explorer', 'Explore account balances with period filters.', 'data-explorer', 'explorer', ['Data Explorer', 'Account Balance Explorer']),
  page('/finance/data-explorer/transactions', 'Transaction Explorer', 'Controlled drill-down into Sage X3 transactions.', 'data-explorer', 'explorer', ['Data Explorer', 'Transaction Explorer']),
  page('/finance/data-explorer/customers', 'Customer Explorer', 'Customer balances, invoices and ageing.', 'data-explorer', 'explorer', ['Data Explorer', 'Customer Explorer']),
  page('/finance/data-explorer/suppliers', 'Supplier Explorer', 'Supplier balances, invoices and payments.', 'data-explorer', 'explorer', ['Data Explorer', 'Supplier Explorer']),
  page('/finance/data-explorer/project-cost', 'Project Cost Explorer', 'Project cost and commitment exploration.', 'data-explorer', 'explorer', ['Data Explorer', 'Project Cost Explorer']),
  page('/finance/data-explorer/cost-centre', 'Cost Centre Explorer', 'Cost centre balances and movements.', 'data-explorer', 'explorer', ['Data Explorer', 'Cost Centre Explorer']),
  page('/finance/data-explorer/department', 'Department Explorer', 'Department financial exploration.', 'data-explorer', 'explorer', ['Data Explorer', 'Department Explorer']),
  page('/finance/data-explorer/bank-cash', 'Bank & Cash Explorer', 'Bank and cash account exploration.', 'data-explorer', 'explorer', ['Data Explorer', 'Bank & Cash Explorer']),
  page('/finance/data-explorer/source-documents', 'Source Document Viewer', 'View source documents linked to Sage X3 transactions.', 'data-explorer', 'explorer', ['Data Explorer', 'Source Document Viewer']),

  // Distribution
  page('/finance/distribution', 'Distribution Dashboard', 'Report distribution operations and delivery health.', 'distribution', 'distribution', ['Report Distribution']),
  page('/finance/distribution/scheduled', 'Scheduled Reports', 'Scheduled report generation and delivery.', 'distribution', 'distribution', ['Report Distribution', 'Scheduled Reports']),
  page('/finance/distribution/email', 'Email Distribution', 'Email distribution of finance reports and packs.', 'distribution', 'distribution', ['Report Distribution', 'Email Distribution']),
  page('/finance/distribution/lists', 'Distribution Lists', 'Recipient lists for finance report distribution.', 'distribution', 'distribution', ['Report Distribution', 'Distribution Lists']),
  page('/finance/distribution/subscriptions', 'Report Subscriptions', 'User and role report subscriptions.', 'distribution', 'distribution', ['Report Distribution', 'Report Subscriptions']),
  page('/finance/distribution/history', 'Delivery History', 'Successful and attempted delivery history.', 'distribution', 'distribution', ['Report Distribution', 'Delivery History']),
  page('/finance/distribution/failed', 'Failed Deliveries', 'Failed report deliveries requiring remediation.', 'distribution', 'distribution', ['Report Distribution', 'Failed Deliveries']),

  // Audit
  page('/finance/audit', 'Finance Audit Dashboard', 'Governance overview for report access, approvals, AI and drill-down.', 'audit', 'audit', ['Audit & Governance']),
  page('/finance/audit/access-log', 'Report Access Log', 'Who accessed which finance reports.', 'audit', 'audit', ['Audit & Governance', 'Report Access Log']),
  page('/finance/audit/export-log', 'Report Export Log', 'Export activity for finance reports.', 'audit', 'audit', ['Audit & Governance', 'Report Export Log']),
  page('/finance/audit/approval-log', 'Approval Audit Log', 'Approval decision audit log.', 'audit', 'audit', ['Audit & Governance', 'Approval Audit Log']),
  page('/finance/audit/ai-query-log', 'AI Query Audit', 'AI Finance Copilot query audit.', 'audit', 'audit', ['Audit & Governance', 'AI Query Audit']),
  page('/finance/audit/drilldown-log', 'Data Drill-Down Log', 'Sage X3 drill-down access log.', 'audit', 'audit', ['Audit & Governance', 'Data Drill-Down Log']),
  page('/finance/audit/signoff-history', 'Sign-Off History', 'Report and pack sign-off history.', 'audit', 'audit', ['Audit & Governance', 'Sign-Off History']),
  page('/finance/audit/delegation-history', 'Delegation History', 'Approval delegation history.', 'audit', 'audit', ['Audit & Governance', 'Delegation History']),
  page('/finance/audit/exceptions', 'Exception Register', 'Finance exceptions requiring governance attention.', 'audit', 'audit', ['Audit & Governance', 'Exception Register']),

  // Configuration
  page('/finance/configuration', 'Finance Configuration', 'Module configuration for Sage X3, reporting, approvals and AI governance.', 'configuration', 'configuration', ['Finance Configuration']),
  page('/finance/configuration/sage-x3', 'Sage X3 Integration', 'Configure read-only Sage X3 integration and controlled update queues.', 'configuration', 'configuration', ['Finance Configuration', 'Sage X3 Integration']),
  page('/finance/configuration/data-mapping', 'Data Source Mapping', 'Map Sage X3 tables/views into Finance Intelligence datasets.', 'configuration', 'configuration', ['Finance Configuration', 'Data Source Mapping']),
  page('/finance/configuration/statement-mapping', 'Financial Statement Mapping', 'Map chart-of-accounts lines into statement structures.', 'configuration', 'configuration', ['Finance Configuration', 'Financial Statement Mapping']),
  page('/finance/configuration/report-definitions', 'Report Definitions', 'Define reusable financial report definitions.', 'configuration', 'configuration', ['Finance Configuration', 'Report Definitions']),
  page('/finance/configuration/periods', 'Reporting Periods', 'Configure fiscal periods and reporting calendars.', 'configuration', 'configuration', ['Finance Configuration', 'Reporting Periods']),
  page('/finance/configuration/entities', 'Company & Entity Setup', 'Company, business unit and entity hierarchy.', 'configuration', 'configuration', ['Finance Configuration', 'Company & Entity Setup']),
  page('/finance/configuration/currency', 'Currency Configuration', 'Functional and reporting currency setup.', 'configuration', 'configuration', ['Finance Configuration', 'Currency Configuration']),
  page('/finance/configuration/approval-matrix', 'Approval Matrix', 'Configure approval strategies and workflows based on payment type, amount thresholds and organisational structure.', 'configuration', 'approval-matrix', ['Finance Configuration', 'Approval Matrix']),
  page('/finance/configuration/approval-limits', 'Approval Limits', 'Define monetary limits and dual-control thresholds for approvals.', 'configuration', 'approval-limits', ['Finance Configuration', 'Approval Limits']),
  page('/finance/configuration/delegation-rules', 'Delegation Rules', 'Rules for temporary and standing approval delegation.', 'configuration', 'delegation-rules', ['Finance Configuration', 'Delegation Rules']),
  page('/finance/configuration/distribution-rules', 'Report Distribution Rules', 'Rules governing report distribution audiences.', 'configuration', 'configuration', ['Finance Configuration', 'Report Distribution Rules']),
  page('/finance/configuration/ai-governance', 'AI Governance', 'AI confidence, human-review and usage controls.', 'configuration', 'configuration', ['Finance Configuration', 'AI Governance']),
  page('/finance/configuration/permissions', 'Finance Permissions', 'Finance Intelligence permission catalogue and role mapping.', 'configuration', 'configuration', ['Finance Configuration', 'Finance Permissions']),
];

export const FINANCE_PAGE_BY_HREF = new Map(FINANCE_PAGES.map((item) => [item.href, item]));

export const resolveFinancePage = (pathname: string): FinancePageMeta | null => {
  const clean = pathname.replace(/\/$/, '') || '/finance';
  if (FINANCE_PAGE_BY_HREF.has(clean)) return FINANCE_PAGE_BY_HREF.get(clean)!;
  // Dynamic approval detail
  if (/^\/finance\/approvals\/request\/[^/]+$/.test(clean)) {
    return FINANCE_PAGE_BY_HREF.get('/finance/approvals/request/[requestId]')!;
  }
  return null;
};

export const ALL_FINANCE_NAV_HREFS = Array.from(
  new Set([
    ...FINANCE_NAV_SECTIONS.flatMap((section) => [section.href, ...section.children.map((child) => child.href)]),
    ...FINANCE_PAGES.map((pageMeta) => pageMeta.href),
  ]),
);

export const FINANCE_MODULE = {
  name: 'Finance Intelligence & Approvals',
  shortName: 'Finance Intelligence',
  description:
    'Financial reporting, analytics, AI-assisted decision support and controlled payment approvals integrated with Sage X3 Enterprise.',
  homeHref: '/finance/overview/command-centre',
  permissionView: 'finance.view',
  permissionLegacy: 'view_finance_accounting',
  permissionIntelligence: 'view_finance_intelligence',
} as const;
