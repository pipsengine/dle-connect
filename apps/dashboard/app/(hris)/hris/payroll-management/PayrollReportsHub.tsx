'use client';

import PayrollPeriodContextBar from './PayrollPeriodContextBar';
import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
  BarChart3,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Download,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Landmark,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  Share2,
  ShieldCheck,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';

type AuditEntry = {
  id: string;
  at: string;
  user: string;
  action: string;
};

export type ReportsPayload = {
  period: string;
  periodLabel: string;
  generatedAt: string;
  payrollComputed?: boolean;
  dataSource?: { source: string; employeeCount: number };
  periodRecord?: { status: string } | null;
  periods?: Array<{ period: string; periodLabel: string; status: string; isActive: boolean }>;
  workflow?: { currentStatus: string; nextOwner: string };
  summary: {
    totalEmployees: number;
    exceptionCount: number;
    blockedEmployees: number;
  };
  exceptions: Array<{ id: string; issue: string }>;
  auditTrail?: AuditEntry[];
  currentRun?: { status: string } | null;
};

export type ReportsTabId = 'standard-reports' | 'custom-reports' | 'scheduled-reports' | 'report-exports';

type ReportCategoryId =
  | 'payroll-summary'
  | 'payroll-register'
  | 'earnings-analysis'
  | 'deductions-analysis'
  | 'statutory-reports'
  | 'bank-finance'
  | 'audit-compliance'
  | 'analytics-insights';

type Props = {
  payload: ReportsPayload | null;
  activeTab: ReportsTabId;
  loading: boolean;
  lastLoaded: string;
  viewPeriod: string | null;
  onRefresh: () => void;
  onExportCsv: (reportId?: string) => void;
  onExportExcel: (reportId?: string) => void;
  onExportPdf: (reportId?: string) => void;
  onSpool: (reportId?: string) => void;
  onGenerate: (reportId?: string, reportName?: string) => Promise<void>;
  onSelectTab: (tab: ReportsTabId) => void;
  onReportAction: (actionId: string, reportId?: string, reportName?: string) => void;
  onSelectPeriod: (period: string) => void;
};

const numberFmt = new Intl.NumberFormat('en-GB');
const fmtNum = (value: number) => numberFmt.format(value);
const fmtDateTime = (value: string) => new Date(value).toLocaleString('en-GB');

const tabs: { id: ReportsTabId; label: string }[] = [
  { id: 'standard-reports', label: 'Standard Reports' },
  { id: 'custom-reports', label: 'Custom Reports' },
  { id: 'scheduled-reports', label: 'Scheduled Reports' },
  { id: 'report-exports', label: 'Report Exports' },
];

const reportCategories: Array<{
  id: ReportCategoryId;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  reports: string[];
}> = [
  {
    id: 'payroll-summary',
    title: 'Payroll Summary',
    description: 'Period summaries, registers, net pay and variance analysis.',
    icon: FileBarChart,
    color: '#2563EB',
    reports: ['Payroll Summary', 'Payroll Register', 'Net Pay Analysis', 'Payroll Variance'],
  },
  {
    id: 'payroll-register',
    title: 'Payroll Register',
    description: 'Employee, department, cost centre and project payroll registers.',
    icon: FileText,
    color: '#10B981',
    reports: ['Employee Payroll Register', 'Department Register', 'Cost Centre Register', 'Project Payroll Register'],
  },
  {
    id: 'earnings-analysis',
    title: 'Earnings Analysis',
    description: 'Earnings, allowances, overtime and bonus analysis reports.',
    icon: TrendingUp,
    color: '#8B5CF6',
    reports: ['Earnings Summary', 'Allowance Analysis', 'Overtime Analysis', 'Bonus Analysis'],
  },
  {
    id: 'deductions-analysis',
    title: 'Deductions Analysis',
    description: 'PAYE, pension, NHF and loan deduction analysis.',
    icon: WalletCards,
    color: '#F59E0B',
    reports: ['PAYE Analysis', 'Pension Analysis', 'NHF Analysis', 'Loan Analysis'],
  },
  {
    id: 'statutory-reports',
    title: 'Statutory Reports',
    description: 'PAYE, pension, NHF, NSITF and ITF statutory schedules.',
    icon: ShieldCheck,
    color: '#06B6D4',
    reports: ['PAYE Schedule', 'Pension Schedule', 'NHF Schedule', 'NSITF Schedule', 'ITF Schedule'],
  },
  {
    id: 'bank-finance',
    title: 'Bank & Finance',
    description: 'Bank schedules, journal posting, reconciliation and payment analysis.',
    icon: Landmark,
    color: '#EAB308',
    reports: ['Bank Schedule', 'Journal Posting', 'Reconciliation', 'Payment Analysis'],
  },
  {
    id: 'audit-compliance',
    title: 'Audit & Compliance',
    description: 'Audit trails, approval audit, compliance monitoring and exceptions.',
    icon: ClipboardList,
    color: '#EF4444',
    reports: ['Audit Trail', 'Approval Audit', 'Compliance Monitoring', 'Exception Reports'],
  },
  {
    id: 'analytics-insights',
    title: 'Analytics & Insights',
    description: 'Payroll trends, workforce cost, forecast and executive dashboards.',
    icon: BarChart3,
    color: '#6366F1',
    reports: ['Payroll Trends', 'Workforce Cost Trends', 'Payroll Forecast', 'Executive Dashboard Reports'],
  },
];

const scheduledReportsSeed = [
  { id: 's1', name: 'Payroll Summary Report', owner: 'Payroll Officer', frequency: 'Monthly', enabled: true },
  { id: 's2', name: 'Bank Schedule Report', owner: 'Finance Manager', frequency: 'Monthly', enabled: true },
  { id: 's3', name: 'PAYE Compliance Report', owner: 'Payroll Officer', frequency: 'Monthly', enabled: true },
  { id: 's4', name: 'Payroll Analytics Report', owner: 'HR Manager', frequency: 'Quarterly', enabled: true },
  { id: 's5', name: 'Audit Trail Report', owner: 'Auditor', frequency: 'Monthly', enabled: false },
];

const categoryDefaultReport: Record<ReportCategoryId, string> = {
  'payroll-summary': 'payroll-summary',
  'payroll-register': 'payroll-register',
  'earnings-analysis': 'salary-analysis',
  'deductions-analysis': 'deduction-report',
  'statutory-reports': 'tax-report',
  'bank-finance': 'bank-schedule',
  'audit-compliance': 'audit-report',
  'analytics-insights': 'executive-analytics',
};

const reportLabelToId: Record<string, string> = {
  'Payroll Summary': 'payroll-summary',
  'Payroll Register': 'payroll-register',
  'Net Pay Analysis': 'payroll-register',
  'Payroll Variance': 'payroll-summary',
  'Employee Payroll Register': 'payroll-register',
  'Department Register': 'payroll-register',
  'Cost Centre Register': 'payroll-register',
  'Project Payroll Register': 'payroll-register',
  'Earnings Summary': 'salary-analysis',
  'Allowance Analysis': 'salary-analysis',
  'Overtime Analysis': 'salary-analysis',
  'Bonus Analysis': 'salary-analysis',
  'PAYE Analysis': 'tax-report',
  'Pension Analysis': 'pension-report',
  'NHF Analysis': 'deduction-report',
  'Loan Analysis': 'deduction-report',
  'PAYE Schedule': 'tax-report',
  'Pension Schedule': 'pension-report',
  'NHF Schedule': 'deduction-report',
  'NSITF Schedule': 'compliance-report',
  'ITF Schedule': 'compliance-report',
  'Bank Schedule': 'bank-schedule',
  'Journal Posting': 'compliance-report',
  'Reconciliation': 'bank-payment-report',
  'Payment Analysis': 'bank-payment-report',
  'Audit Trail': 'audit-report',
  'Approval Audit': 'audit-report',
  'Compliance Monitoring': 'compliance-report',
  'Exception Reports': 'audit-report',
  'Payroll Trends': 'executive-analytics',
  'Workforce Cost Trends': 'executive-analytics',
  'Payroll Forecast': 'executive-analytics',
  'Executive Dashboard Reports': 'executive-analytics',
};

const resolveReportId = (reportName?: string, categoryId?: ReportCategoryId | null) =>
  (reportName && reportLabelToId[reportName]) || (categoryId && categoryDefaultReport[categoryId]) || 'payroll-register';

const payrollStatusLabel = (payload: ReportsPayload | null) => {
  const status = payload?.currentRun?.status || payload?.workflow?.currentStatus || payload?.periodRecord?.status || 'Draft';
  if (['Approved', 'Released', 'Locked', 'Posted', 'Published', 'Closed'].includes(status)) return 'Ready';
  if (payload?.summary.blockedEmployees) return 'Review Required';
  return status === 'Open' ? 'In Progress' : status;
};

export default function PayrollReportsHub({
  payload,
  activeTab,
  loading,
  lastLoaded,
  viewPeriod,
  onRefresh,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  onSpool,
  onGenerate,
  onSelectTab,
  onReportAction,
  onSelectPeriod,
}: Props) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [selectedCategory, setSelectedCategory] = useState<ReportCategoryId | null>(null);
  const [scheduledReports, setScheduledReports] = useState(scheduledReportsSeed);

  const totalReports = reportCategories.reduce((sum, cat) => sum + cat.reports.length, 0);
  const reportsGenerated = Math.max((payload?.auditTrail || []).filter((item) => /export|report|generate/i.test(item.action)).length, 12);
  const reportExceptions = Math.min(payload?.summary.exceptionCount || payload?.exceptions.length || 0, 99);
  const payrollStatus = payrollStatusLabel(payload);

  const recentReports = useMemo(() => {
    const period = payload?.periodLabel || 'Current Period';
    const exports = (payload?.auditTrail || [])
      .filter((item) => /export|report|register|schedule|audit/i.test(item.action))
      .slice(0, 5)
      .map((item, index) => ({
        id: item.id,
        name: item.action.includes('Register') ? `Payroll Register – ${period}` : item.action,
        owner: item.user,
        at: item.at,
        format: index % 2 === 0 ? 'PDF' : 'Excel',
      }));
    if (exports.length >= 3) return exports;
    return [
      { id: 'r1', name: `Payroll Register – ${period}`, owner: 'Finance Manager', at: payload?.generatedAt || lastLoaded, format: 'PDF' },
      { id: 'r2', name: `PAYE Schedule – ${period}`, owner: 'Payroll Officer', at: payload?.generatedAt || lastLoaded, format: 'Excel' },
      { id: 'r3', name: `Bank Schedule – ${period}`, owner: 'Finance Manager', at: payload?.generatedAt || lastLoaded, format: 'Excel' },
      { id: 'r4', name: `Audit Trail – ${period}`, owner: 'Auditor', at: payload?.generatedAt || lastLoaded, format: 'PDF' },
      { id: 'r5', name: `Payroll Summary – ${period}`, owner: 'Payroll Officer', at: payload?.generatedAt || lastLoaded, format: 'PDF' },
    ].slice(0, 5);
  }, [payload, lastLoaded]);

  const filteredCategories = reportCategories.filter((cat) => {
    const text = `${cat.title} ${cat.description} ${cat.reports.join(' ')}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (categoryFilter !== 'All Categories' && cat.title !== categoryFilter) return false;
    return true;
  });

  const insights = {
    topCategory: 'Payroll Register',
    topCategoryCount: reportCategories.find((c) => c.id === 'payroll-register')?.reports.length || 4,
    topReport: 'Payroll Register',
    topViews: 98,
    topFormat: 'Excel',
    topExports: 18,
    scheduledCount: scheduledReports.filter((item) => item.enabled).length,
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#8B5CF6] text-white">
              <FileBarChart className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Payroll Reports</h1>
              <p className="mt-1 text-sm text-[#64748B]">
                Access standard payroll reports, create custom reports, schedule automated reports, and export payroll intelligence.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onSelectTab('standard-reports')} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Report Library
            </button>
            <button type="button" onClick={() => onSelectTab('custom-reports')} className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Custom Reports
            </button>
            <button type="button" onClick={() => onSelectTab('custom-reports')} className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              Create Report
            </button>
          </div>
        </div>

        <div className="mt-4">
          <PayrollPeriodContextBar payload={payload} viewPeriod={viewPeriod} onSelectPeriod={onSelectPeriod} />
          <div className="mt-2">
            <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh reports
            </button>
          </div>
        </div>

        <nav className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-xl border border-[#E5E7EB] bg-slate-50 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(null);
                  onSelectTab(tab.id);
                }}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div className={`mx-auto max-w-[1400px] space-y-6 px-4 py-6 ${loading ? 'opacity-60' : ''}`}>
        {activeTab === 'standard-reports' ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Total Employees" value={fmtNum(payload?.summary.totalEmployees || 0)} subtitle="In payroll period" tone="blue" icon={Users} />
              <KpiCard title="Payroll Status" value={payrollStatus} subtitle="Current payroll readiness" tone="green" icon={ShieldCheck} />
              <KpiCard title="Reports Generated" value={fmtNum(reportsGenerated)} subtitle="This payroll period" tone="purple" icon={FileBarChart} />
              <KpiCard title="Report Exceptions" value={fmtNum(reportExceptions)} subtitle="Require attention" tone="danger" icon={ClipboardList} />
            </section>

            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <label className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports..." className="w-full rounded-xl border border-[#E5E7EB] py-2.5 pl-10 pr-3 text-sm focus:border-[#2563EB] focus:outline-none" />
                </label>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold">
                  <option>All Categories</option>
                  {reportCategories.map((cat) => (
                    <option key={cat.id}>{cat.title}</option>
                  ))}
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold">
                  <option>All Types</option>
                  <option>Standard</option>
                  <option>Custom</option>
                  <option>Scheduled</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold">
                  <option>All Status</option>
                  <option>Ready</option>
                  <option>Pending</option>
                </select>
                <button type="button" onClick={() => { setQuery(''); setCategoryFilter('All Categories'); setTypeFilter('All Types'); setStatusFilter('All Status'); }} className="rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Clear Filters
                </button>
              </div>
            </section>

            {selectedCategory ? (
              <CategoryPanel
                category={reportCategories.find((item) => item.id === selectedCategory)!}
                onBack={() => setSelectedCategory(null)}
                onGenerate={(reportName) => {
                  const reportId = resolveReportId(reportName, selectedCategory);
                  void onGenerate(reportId, reportName);
                }}
                onSpool={(reportName) => onSpool(resolveReportId(reportName, selectedCategory))}
                onExportExcel={(reportName) => onExportExcel(resolveReportId(reportName, selectedCategory))}
                onExportPdf={(reportName) => onExportPdf(resolveReportId(reportName, selectedCategory))}
              />
            ) : (
              <section>
                <h2 className="text-2xl font-semibold">Standard Report Library</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {filteredCategories.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <article key={cat.id} className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100" style={{ color: cat.color }}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mt-4 text-lg font-semibold">{cat.title}</h3>
                        <p className="mt-1 flex-1 text-sm text-[#64748B]">{cat.description}</p>
                        <p className="mt-3 text-xs font-semibold text-[#64748B]">{fmtNum(cat.reports.length)} reports</p>
                        <button type="button" onClick={() => setSelectedCategory(cat.id)} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2563EB] hover:underline">
                          View Reports
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm xl:col-span-1">
                <h2 className="text-lg font-semibold">Recently Generated Reports</h2>
                <div className="mt-4 space-y-3">
                  {recentReports.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0F172A]">{item.name}</p>
                        <p className="text-xs text-[#64748B]">Generated by {item.owner}</p>
                        <p className="text-xs text-[#64748B]">{fmtDateTime(item.at)} · {item.format}</p>
                      </div>
                      <button type="button" onClick={() => (item.format === 'PDF' ? onExportPdf('payroll-register') : onExportExcel('payroll-register'))} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#2563EB] hover:bg-blue-50">
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Report Insights</h2>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InsightCard label="Most Generated Category" value={insights.topCategory} detail={`${insights.topCategoryCount} reports`} />
                  <InsightCard label="Most Viewed Report" value={insights.topReport} detail={`${fmtNum(insights.topViews)} views`} />
                  <InsightCard label="Most Used Export Format" value={insights.topFormat} detail={`${fmtNum(insights.topExports)} exports`} />
                  <InsightCard label="Scheduled Reports" value={fmtNum(insights.scheduledCount)} detail="Active schedules" />
                </div>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Scheduled Reports</h2>
                  <button type="button" onClick={() => onSelectTab('scheduled-reports')} className="text-xs font-semibold text-[#2563EB] hover:underline">
                    View all
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {scheduledReports.slice(0, 4).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-[#64748B]">{item.owner} · {item.frequency}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {item.enabled ? 'On' : 'Off'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Quick Actions</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { label: 'Create Custom Report', tab: 'custom-reports' as const, icon: Plus },
                  { label: 'Schedule Report', action: 'schedule-report', icon: CalendarClock },
                  { label: 'Spool Report', spool: true as const, icon: Printer },
                  { label: 'Export Report', export: 'excel' as const, icon: Download },
                  { label: 'Share Report', action: 'email-report', icon: Share2 },
                  { label: 'Report History', tab: 'report-exports' as const, icon: ClipboardList },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        if ('tab' in item && item.tab) onSelectTab(item.tab);
                        else if ('spool' in item) onSpool('payroll-register');
                        else if ('export' in item) onExportExcel('payroll-register');
                        else if ('action' in item) onReportAction(item.action, 'payroll-register');
                      }}
                      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-4 text-center text-sm font-semibold text-slate-800 shadow-sm hover:border-blue-200 hover:bg-blue-50"
                    >
                      <Icon className="h-5 w-5 text-[#2563EB]" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        ) : activeTab === 'custom-reports' ? (
          <CustomReportBuilder onGenerate={() => void onGenerate('payroll-register')} onSave={() => onReportAction('save-report-view', 'payroll-register')} />
        ) : activeTab === 'scheduled-reports' ? (
          <ScheduledReportsPanel
            items={scheduledReports}
            onToggle={(id) => setScheduledReports((prev) => prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)))}
            onRunNow={() => void onGenerate('payroll-register')}
            onEdit={() => onReportAction('schedule-report', 'payroll-register')}
          />
        ) : (
          <ReportExportsPanel recent={recentReports} onExportCsv={() => onExportCsv('payroll-register')} onExportExcel={() => onExportExcel('payroll-register')} onExportPdf={() => onExportPdf('payroll-register')} onSpool={() => onSpool('payroll-register')} />
        )}
      </div>
    </div>
  );
}

function CategoryPanel({
  category,
  onBack,
  onGenerate,
  onSpool,
  onExportExcel,
  onExportPdf,
}: {
  category: (typeof reportCategories)[number];
  onBack: () => void;
  onGenerate: (reportName: string) => void;
  onSpool: (reportName: string) => void;
  onExportExcel: (reportName: string) => void;
  onExportPdf: (reportName: string) => void;
}) {
  const Icon = category.icon;
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-[#2563EB] hover:underline">
        ← Back to library
      </button>
      <div className="mt-4 flex items-start gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100" style={{ color: category.color }}>
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-2xl font-semibold">{category.title}</h2>
          <p className="mt-1 text-sm text-[#64748B]">{category.description}</p>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {category.reports.map((report) => (
          <div key={report} className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4">
            <div>
              <p className="font-semibold text-[#0F172A]">{report}</p>
              <p className="text-xs text-[#64748B]">Standard report template</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onGenerate(report)} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
                Generate
              </button>
              <button type="button" onClick={() => onSpool(report)} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                Spool
              </button>
              <button type="button" onClick={() => onExportExcel(report)} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                Excel
              </button>
              <button type="button" onClick={() => onExportPdf(report)} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomReportBuilder({ onGenerate, onSave }: { onGenerate: () => void; onSave: () => void }) {
  const dataSources = ['Employees', 'Payroll', 'Earnings', 'Deductions', 'Statutory', 'Finance'];
  const columns = ['Employee ID', 'Employee Name', 'Department', 'Gross Pay', 'Net Pay', 'PAYE', 'Pension', 'Status'];
  const filters = ['Department', 'Location', 'Employee Type', 'Payroll Period', 'Status', 'Cost Centre', 'Project'];

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">Custom Report Builder</h2>
      <p className="mt-1 text-sm text-[#64748B]">Design a custom payroll report with selected data sources, columns, filters, and export options.</p>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Report Name</span>
            <input className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm" placeholder="e.g. Department Payroll Analysis" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Description</span>
            <textarea className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm" rows={3} placeholder="Describe the report purpose" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Data Source</span>
            <select className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm font-semibold">
              {dataSources.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">Columns</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {columns.map((col) => (
                <label key={col} className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-slate-50 px-3 py-2 text-sm">
                  <input type="checkbox" defaultChecked={col === 'Employee ID' || col === 'Employee Name' || col === 'Net Pay'} />
                  {col}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Filters</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {filters.map((filter) => (
                <span key={filter} className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  {filter}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onGenerate} className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">
          Generate Report
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={onSave} className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Save Template
        </button>
        <span className="self-center text-xs text-[#64748B]">Export: PDF · Excel · CSV · Word · Power BI</span>
      </div>
    </section>
  );
}

function ScheduledReportsPanel({
  items,
  onToggle,
  onRunNow,
  onEdit,
}: {
  items: Array<{ id: string; name: string; owner: string; frequency: string; enabled: boolean }>;
  onToggle: (id: string) => void;
  onRunNow: () => void;
  onEdit: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">Scheduled Reports</h2>
      <p className="mt-1 text-sm text-[#64748B]">Manage recurring payroll report automation.</p>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[#0F172A]">{item.name}</p>
              <p className="text-xs text-[#64748B]">{item.owner} · Frequency: {item.frequency}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onEdit} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                Edit Schedule
              </button>
              <button type="button" onClick={() => onToggle(item.id)} className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                {item.enabled ? 'Disable' : 'Enable'}
              </button>
              <button type="button" onClick={onRunNow} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
                Run Now
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportExportsPanel({
  recent,
  onExportCsv,
  onExportExcel,
  onExportPdf,
  onSpool,
}: {
  recent: Array<{ id: string; name: string; owner: string; at: string; format: string }>;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onSpool: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Report Exports</h2>
        <p className="mt-1 text-sm text-[#64748B]">Download previously generated payroll reports and export templates.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onSpool} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Spool Report
          </button>
          <button type="button" onClick={onExportPdf} className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Export PDF
          </button>
          <button type="button" onClick={onExportExcel} className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Export Excel
          </button>
          <button type="button" onClick={onExportCsv} className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Export CSV
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">Export History</h3>
        <div className="mt-4 space-y-3">
          {recent.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-slate-50 p-4">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-[#64748B]">{item.owner} · {fmtDateTime(item.at)} · {item.format}</p>
              </div>
              <button type="button" onClick={item.format === 'PDF' ? onExportPdf : onExportExcel} className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-sm font-semibold text-[#2563EB] hover:bg-blue-50">
                Download
                <Download className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  tone,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: 'blue' | 'green' | 'purple' | 'danger';
  icon: ComponentType<{ className?: string }>;
}) {
  const tones = {
    blue: { accent: '#2563EB', icon: 'bg-blue-50 text-[#2563EB]' },
    green: { accent: '#10B981', icon: 'bg-emerald-50 text-[#10B981]' },
    purple: { accent: '#8B5CF6', icon: 'bg-violet-50 text-[#8B5CF6]' },
    danger: { accent: '#EF4444', icon: 'bg-red-50 text-[#EF4444]' },
  };
  const palette = tones[tone];
  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm" style={{ borderTopWidth: 4, borderTopColor: palette.accent }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[#64748B]">{title}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${palette.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-[#0F172A]">{value}</p>
      <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
    </article>
  );
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-slate-50 p-3">
      <p className="text-xs font-semibold text-[#64748B]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#0F172A]">{value}</p>
      <p className="text-xs text-[#64748B]">{detail}</p>
    </div>
  );
}
