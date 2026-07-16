'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { EssDashboardView, EssRightPanel } from './ess-dashboard-view';
import { EssCelebrationFlyerModal, buildTodaysCelebrations } from './ess-celebrations';
import { EssLeaveDashboardView, type EssLeavePayload, type LeaveWorkspaceTab } from './ess-leave-dashboard-view';
import { EssLeaveApprovalsView, type EssLeaveApprovalsPayload } from './ess-leave-approvals-view';
import { EssServicesView, type EssServicesPayload } from './ess-services-view';
import { EssReportsView, type EssReportsPayload } from './ess-reports-view';
import { EssDocumentsView, type EssDocumentsPayload } from './ess-documents-view';
import { EssCommunicationsView, type EssCommunicationsPayload } from './ess-communications-view';
import { EssTimeView, type EssTimePayload } from './ess-time-view';
import EssWorkflowDashboardView from './ess-workflow-dashboard-view';
import { EssWorkflowDeliveryPanel, EssWorkflowDiagnosticsBanner, type WorkflowDeliveryTrace } from './ess-workflow-delivery-panel';
import type { WorkflowIntelligence } from '@/lib/ess-workflow-intelligence';
import { EssProfileDashboardView, type EssProfilePayload } from './ess-profile-dashboard-view';
import { EssPayrollDashboardView, type EssPayrollPayload } from './ess-payroll-dashboard-view';
import { EssTravelDashboardView, type EssTravelPayload } from './ess-travel-dashboard-view';
import type { EssTravelRecord } from '@/lib/ess-portal-derived-data';
import { ESS_NAV_ITEMS, EssPortalShell, EssMobileNav, type EssTab } from './ess-portal-shell';
import { EssEmptyState } from './ess-portal-ui';
import {
  Activity,
  ArrowRight,
  Building2,
  BadgeCheck,
  Banknote,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileArchive,
  FileText,
  Fingerprint,
  Globe2,
  GraduationCap,
  Languages,
  Landmark,
  LockKeyhole,
  Megaphone,
  Plane,
  Printer,
  RefreshCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Target,
  UserRound,
  WalletCards,
} from 'lucide-react';

type EssRequest = {
  id: string;
  employeeId: string;
  category: string;
  title: string;
  status: string;
  priority: string;
  submittedAt: string;
  updatedAt: string;
  approvers: string[];
  comments: Array<{ at: string; actor: string; comment: string }>;
  relieverEmployeeId?: string;
  relieverName?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  workflow?: Array<{ stage: string; owner: string; status: string; actedAt?: string | null; comment?: string | null }>;
};
type LoanProduct = { id: string; label: string; type: string; interestRate: number; maxPrincipalMultiple: number; maxTenorMonths: number };
type SimpleRecord = Record<string, string | number | boolean | null>;
type PayrollLine = { code?: string; label: string; units?: number; amount: number; taxable?: boolean };
type PayrollHistoryRow = {
  period: string;
  periodLabel?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  payDate?: string;
  payrollNumber?: string;
  payeReference?: string;
  grossPay: number;
  allowances?: number;
  pensionEmployee?: number;
  deductions: number;
  netPay: number;
  status: string;
  dataSource?: 'enterprise' | 'enterprise-db' | 'calculated' | 'sage';
  payslipType?: 'permanent' | 'non-permanent';
  earnings?: PayrollLine[];
  deductionLines?: Array<{ code?: string; label: string; units?: number; amount: number }>;
  employerContributionLines?: Array<{ code?: string; label: string; units?: number; amount: number }>;
  totalEmployerContributions?: number;
  employeeInfo?: Record<string, string | number>;
  statutoryInfo?: Record<string, string | number>;
  leaveInfo?: { annualLeaveEntitlement: number; leaveTaken: number; leaveBalance: number; carryForwardLeave: number };
  ytd?: { grossEarnings: number; taxPaid: number; pensionContribution: number; deductions: number; netEarnings: number };
  verification?: { qrCode: string; generatedAt: string; approvalStatus: string };
};
type Payload = {
  generatedAt: string;
  locale: string;
  security: Record<string, string>;
  employee: { employeeId: string; employeeCode: string; fullName: string; jobTitle: string; department: string; businessUnit: string; location: string; manager: string; email: string; phone: string; photoUrl: string; hasPhoto?: boolean; status?: string; yearsOfService: number; payrollGroup: string; salaryGrade: string };
  widgets: {
    leave: { entitlement: number; used: number; balance: number; pending: number };
    attendance: { monthRate: number; lateArrivals: number; overtimeHours: number; remoteDays: number };
    payroll: { monthlyPay: number; currency: string; payslips: number; deductions: number; pension: number; allowances: number };
    requests: { pending: number; approved: number; total: number };
    loans: { applications: number; outstanding: number };
  };
  announcements: Array<{ id: string; title: string; channel: string; publishedAt: string; priority: string }>;
  communications?: {
    summary?: {
      announcementCount: number;
      engagementCount: number;
      notificationCount: number;
      unreadCount: number;
      lastUpdated: string;
    };
    engagements?: Array<{ id: string; title: string; type: string; status: string; dueAt?: string | null; actionHref?: string }>;
  };
  notifications: Array<{ id: string; title: string; type: string; status: string; createdAt: string; href?: string }>;
  approvalQueue?: Array<{ id: string; employee: string; type: string; days: number; startDate: string; endDate: string; stage: string }>;
  birthdays: Array<{ id: string; fullName: string; department: string; date: string; employeeId?: string; employeeCode?: string; hasPhoto?: boolean }>;
  anniversaries: Array<{ id: string; fullName: string; years: number; date: string; department?: string; employeeId?: string; employeeCode?: string; hasPhoto?: boolean }>;
  todaysBirthdays?: Array<{ id: string; fullName: string; department: string; date: string; employeeId?: string; employeeCode?: string; hasPhoto?: boolean }>;
  todaysAnniversaries?: Array<{ id: string; fullName: string; years: number; date: string; department?: string; employeeId?: string; employeeCode?: string; hasPhoto?: boolean }>;
  events: Array<{ id: string; label: string; date: string; type: string }>;
  documents: Array<{ id: string; title: string; category: string; version: string; status: string; uploadedAt?: string | null; expiresAt?: string | null; mimeType?: string; sizeBytes?: number; verifiedAt?: string | null; acknowledgement?: string; accessScope?: string }>;
  documentGovernance?: Array<{ id: string; documentId: string; title: string; category: string; version: string; accessScope: string; acknowledgement: string; status: string; lastUpdated: string }>;
  profileSections: Array<{ id: string; label: string; status: string; approvalRequired: boolean; fields: Array<{ label: string; value: string; key?: string; editable?: boolean; inputType?: string; options?: string[] }> }>;
  profilePendingUpdates?: Array<{ id: string; sectionId: string; title: string; status: string; submittedAt: string; changes: Record<string, string> }>;
  profileApprovalQueue?: Array<{ id: string; employeeId: string; employeeName: string; sectionId: string; title: string; status: string; submittedAt: string; changes: Record<string, string>; previousValues?: Record<string, string> }>;
  canApproveProfileUpdates?: boolean;
  leave: {
    balances: SimpleRecord[];
    calendar: SimpleRecord[];
    history: SimpleRecord[];
    workflows: SimpleRecord[];
    allowance: SimpleRecord[];
    approvals: SimpleRecord[];
    pendingApprovalCount?: number;
    reports: SimpleRecord[];
    notifications: SimpleRecord[];
    security: SimpleRecord[];
    relieverOptions: Array<{ employeeId: string; employeeCode: string; fullName: string; jobTitle: string; department: string }>;
  };
  attendance: {
    records: SimpleRecord[];
    shifts: SimpleRecord[];
    timesheets: SimpleRecord[];
    todaySession?: Record<string, unknown> | null;
    clockingState?: 'ready' | 'clocked-in' | 'clocked-out';
    mobileClockEnabled?: boolean;
    timeRequests?: Array<{ id: string; title: string; category: string; status: string; submittedAt: string; updatedAt?: string }>;
  };
  payrollHistory: PayrollHistoryRow[];
  payrollAccess?: {
    currentPeriod: string;
    currentPeriodReleased: boolean;
    releasedPeriodCount: number;
    message: string;
  };
  performance: { goals: SimpleRecord[]; kpis: SimpleRecord[]; reviews: SimpleRecord[]; developmentPlans: SimpleRecord[] };
  learning: { courses: SimpleRecord[]; materials: SimpleRecord[]; certifications: SimpleRecord[] };
  claims: SimpleRecord[];
  loanManagement: { products: LoanProduct[]; applications: SimpleRecord[]; repaymentSchedules: SimpleRecord[]; history: SimpleRecord[] };
  travel: EssTravelRecord[];
  assets: SimpleRecord[];
  exitServices: { resignation: SimpleRecord; clearance: SimpleRecord[]; exitInterview: SimpleRecord; finalSettlement: SimpleRecord };
  businessRules: SimpleRecord[];
  auditTrail: SimpleRecord[];
  reports: SimpleRecord[];
  reportDownloads?: Array<{ id: string; title: string; format: string; accent: string; bg: string; status: string }>;
  moduleCatalog: string[];
  serviceCatalog: Array<{ id: string; label: string; area: string; workflow: string[]; slaHours: number }>;
  requests: EssRequest[];
  integrations: string[];
  analytics: Array<{ label: string; value: number; unit: string }>;
  dashboardAnalytics?: {
    activityByCategory: Array<{ label: string; value: number; color: string }>;
    totalActivities: number;
    hrInsights: {
      attendanceTrend: { trend: number; series: number[] };
      leaveUtilization: { trend: number; series: number[] };
      payrollSummary: { netPay: number; label: string };
      requestsCompleted: { count: number; trend: number };
      trainingProgress: { percent: number };
    };
  };
  workflowIntelligence?: WorkflowIntelligence;
  workflowDiagnostics?: {
    mailProvider?: string | null;
    mailConfigured?: boolean;
    recentFailures?: Array<WorkflowDeliveryTrace['steps'][number] & { requestId?: string }>;
    requestTraces?: Record<string, WorkflowDeliveryTrace>;
  };
  managerMetrics?: {
    teamSize: number;
    pendingApprovals: number;
    onLeave: number;
    missingTimesheets: number;
    teamAttendancePct: number;
    trainingToday: number;
  };
};
type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };
type Tab = EssTab;

const parseJsonResponse = async (res: Response, label: string) => {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`${label} returned an empty response (${res.status}). Refresh and try again.`);
  }
  try {
    return JSON.parse(text) as ApiResponse<unknown>;
  } catch {
    throw new Error(`${label} returned an unexpected server response (${res.status}). The request may have timed out or the API route is unavailable.`);
  }
};

const moneyFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const money2Fmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('en-GB');
const money = (value: number) => moneyFmt.format(value || 0);
const money2 = (value: number) => money2Fmt.format(value || 0);
const fmtDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { timeZone: 'UTC' });
};
const wordsUnderThousand = (value: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if (value < 20) return ones[value];
  if (value < 100) return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`;
  return `${ones[Math.floor(value / 100)]} Hundred${value % 100 ? ` and ${wordsUnderThousand(value % 100)}` : ''}`;
};
const numberToWords = (value: number): string => {
  const whole = Math.floor(Math.abs(value));
  if (!whole) return 'Zero';
  const scales: Array<[number, string]> = [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1_000, 'Thousand']];
  let remainder = whole;
  const parts: string[] = [];
  for (const [scale, label] of scales) {
    const count = Math.floor(remainder / scale);
    if (count) {
      parts.push(`${wordsUnderThousand(count)} ${label}`);
      remainder %= scale;
    }
  }
  if (remainder) parts.push(wordsUnderThousand(remainder));
  return parts.join(', ');
};
const amountInWords = (value: number) => {
  const naira = Math.floor(Math.abs(value || 0));
  const kobo = Math.round((Math.abs(value || 0) - naira) * 100);
  return `${numberToWords(naira)} Naira${kobo ? `, ${numberToWords(kobo)} Kobo` : ''} Only`;
};
const stableDateTime = (value: string) => {
  const iso = new Date(value).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
};
const dateText = (value: string) => {
  const iso = new Date(value).toISOString();
  return `${iso.slice(8, 10)} ${iso.slice(5, 7)} ${iso.slice(0, 4)}`;
};
const statusTone = (status: string) => {
  if (['Approved', 'Closed'].includes(status)) return 'bg-emerald-100 text-emerald-800';
  if (status === 'Rejected') return 'bg-red-100 text-red-800';
  if (status.includes('Review') || status === 'Submitted') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
};
const statusSurface = (status: string) => {
  if (['Approved', 'Closed', 'Current', 'Ready', 'Delivered', 'Active', 'Completed', 'Valid', 'On Track'].includes(status)) return 'border-emerald-200 bg-emerald-50';
  if (['Rejected', 'Restricted', 'Overdue'].includes(status)) return 'border-red-200 bg-red-50';
  if (status.includes('Review') || ['Submitted', 'Pending', 'Renewal Due', 'Acknowledgement Due', 'Required'].includes(status)) return 'border-amber-200 bg-amber-50';
  if (status.includes('Policy') || status.includes('Payroll')) return 'border-blue-200 bg-blue-50';
  return 'border-slate-200 bg-white';
};
const areaTone = (value: string) => {
  const text = value.toLowerCase();
  if (text.includes('leave') || text.includes('balance')) return { section: 'border-emerald-200 bg-emerald-50/45', header: 'border-emerald-100 bg-emerald-50/80', item: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-700' };
  if (text.includes('attendance') || text.includes('time') || text.includes('shift')) return { section: 'border-sky-200 bg-sky-50/45', header: 'border-sky-100 bg-sky-50/80', item: 'border-sky-200 bg-sky-50', icon: 'text-sky-700' };
  if (text.includes('payroll') || text.includes('pay') || text.includes('pension') || text.includes('payslip')) return { section: 'border-violet-200 bg-violet-50/45', header: 'border-violet-100 bg-violet-50/80', item: 'border-violet-200 bg-violet-50', icon: 'text-violet-700' };
  if (text.includes('loan')) return { section: 'border-cyan-200 bg-cyan-50/45', header: 'border-cyan-100 bg-cyan-50/80', item: 'border-cyan-200 bg-cyan-50', icon: 'text-cyan-700' };
  if (text.includes('claim') || text.includes('reimbursement') || text.includes('travel')) return { section: 'border-orange-200 bg-orange-50/45', header: 'border-orange-100 bg-orange-50/80', item: 'border-orange-200 bg-orange-50', icon: 'text-orange-700' };
  if (text.includes('document') || text.includes('version') || text.includes('letter')) return { section: 'border-indigo-200 bg-indigo-50/45', header: 'border-indigo-100 bg-indigo-50/80', item: 'border-indigo-200 bg-indigo-50', icon: 'text-indigo-700' };
  if (text.includes('performance') || text.includes('goal') || text.includes('kpi')) return { section: 'border-rose-200 bg-rose-50/45', header: 'border-rose-100 bg-rose-50/80', item: 'border-rose-200 bg-rose-50', icon: 'text-rose-700' };
  if (text.includes('learning') || text.includes('training') || text.includes('certification')) return { section: 'border-teal-200 bg-teal-50/45', header: 'border-teal-100 bg-teal-50/80', item: 'border-teal-200 bg-teal-50', icon: 'text-teal-700' };
  if (text.includes('asset') || text.includes('directory') || text.includes('organization')) return { section: 'border-lime-200 bg-lime-50/45', header: 'border-lime-100 bg-lime-50/80', item: 'border-lime-200 bg-lime-50', icon: 'text-lime-700' };
  if (text.includes('security') || text.includes('audit') || text.includes('workflow') || text.includes('approval')) return { section: 'border-amber-200 bg-amber-50/45', header: 'border-amber-100 bg-amber-50/80', item: 'border-amber-200 bg-amber-50', icon: 'text-amber-700' };
  return { section: 'border-slate-200 bg-white', header: 'border-slate-100 bg-slate-50/70', item: 'border-slate-200 bg-slate-50', icon: 'text-blue-700' };
};
const metricSurface = (tone: string) => {
  if (tone.includes('emerald')) return 'border-emerald-200 bg-emerald-50';
  if (tone.includes('blue')) return 'border-blue-200 bg-blue-50';
  if (tone.includes('violet')) return 'border-violet-200 bg-violet-50';
  if (tone.includes('amber')) return 'border-amber-200 bg-amber-50';
  if (tone.includes('cyan')) return 'border-cyan-200 bg-cyan-50';
  return 'border-slate-200 bg-white';
};

const navItems = ESS_NAV_ITEMS;

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: any; tone: string }) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${metricSurface(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-normal text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></span>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  const tone = areaTone(title);
  return (
    <section className={`rounded-lg border shadow-sm ${tone.section}`}>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${tone.header}`}>
        <h2 className="text-sm font-black text-slate-950">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DataList({
  rows,
  titleKey = 'title',
  subtitleKeys = [],
  statusKey = 'status',
  emptyTitle = 'No records found',
  emptyDescription = 'Records will appear here once they are available in the HRIS.',
}: {
  rows: SimpleRecord[];
  titleKey?: string;
  subtitleKeys?: string[];
  statusKey?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!rows.length) {
    return <EssEmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const status = String(row[statusKey] ?? row.type ?? row.category ?? row.label ?? row.title ?? '');
        const surface = row[statusKey] !== undefined ? statusSurface(status) : areaTone(status).item;
        return (
          <div key={String(row.id || row.title || row.label || index)} className={`rounded-[14px] border p-3 transition hover:border-[#CBD5E1] ${surface}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[#0F172A]">{String(row[titleKey] || row.label || row.type || row.name || row.id || 'Record')}</p>
                {subtitleKeys.length ? (
                  <p className="mt-0.5 text-[11px] font-medium text-[#64748B]">
                    {subtitleKeys.map((key) => String(row[key] ?? '')).filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>
              {row[statusKey] !== undefined ? (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusTone(String(row[statusKey]))}`}>
                  {String(row[statusKey])}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PayrollHistoryPanel({ rows }: { rows: PayrollHistoryRow[] }) {
  if (!rows.length) {
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">No payroll records found.</div>;
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <article key={row.period} className="rounded-lg border border-violet-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-4 py-3">
            <div>
              <p className="text-sm font-black text-slate-950">{row.period}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Employee payroll statement</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone(row.status)}`}>{row.status}</span>
          </div>

          <div className="grid grid-cols-3 border-b border-slate-100 text-center text-xs font-black">
            <div className="p-3">
              <p className="text-slate-500">Gross</p>
              <p className="mt-1 text-slate-950">{money(row.grossPay)}</p>
            </div>
            <div className="border-x border-slate-100 p-3">
              <p className="text-slate-500">Deductions</p>
              <p className="mt-1 text-red-700">{money(row.deductions)}</p>
            </div>
            <div className="p-3">
              <p className="text-slate-500">Net Pay</p>
              <p className="mt-1 text-emerald-700">{money(row.netPay)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-normal text-slate-500">Earnings</p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50">
                {(row.earnings || []).map((line) => (
                  <div key={`${row.period}-${line.code || line.label}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-black text-slate-950">{line.label}</p>
                      <p className="mt-0.5 font-semibold text-slate-500">{line.code || 'Payroll earning'} - {line.taxable ? 'Taxable' : 'Non-taxable'}</p>
                    </div>
                    <p className="font-black text-slate-950">{money(line.amount)}</p>
                  </div>
                ))}
                {!(row.earnings || []).length ? <p className="p-3 text-xs font-bold text-slate-500">No earnings recorded.</p> : null}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-normal text-slate-500">Deductions</p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50">
                {(row.deductionLines || []).map((line) => (
                  <div key={`${row.period}-${line.label}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                    <p className="font-black text-slate-950">{line.label}</p>
                    <p className="font-black text-red-700">{money(line.amount)}</p>
                  </div>
                ))}
                {!(row.deductionLines || []).length ? <p className="p-3 text-xs font-bold text-slate-500">No deductions recorded.</p> : null}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

const matchesPayrollLine = (line: PayrollLine, matchers: string[]) => {
  const text = `${line.code || ''} ${line.label || ''}`.toUpperCase();
  return matchers.some((matcher) => text.includes(matcher));
};

const lineAmount = (lines: PayrollLine[] | undefined, matchers: string[]): PayrollLine | null => {
  const matched = (lines || []).filter((line) => matchesPayrollLine(line, matchers));
  if (!matched.length) return null;
  const first = matched[0];
  return {
    ...first,
    units: matched.reduce((sum, line) => sum + Number(line.units || 0), 0),
    amount: matched.reduce((sum, line) => sum + Number(line.amount || 0), 0),
  };
};

const nonZeroPayrollLine = (line: Pick<PayrollLine, 'amount'>) => Math.abs(Number(line.amount || 0)) > 0.004;

const standardLines = (lines: PayrollLine[] | undefined, defs: Array<[string, string[]]>) => {
  const source = lines || [];
  const standard = defs
    .map(([, matchers]) => lineAmount(source, matchers))
    .filter((line): line is PayrollLine => line !== null && nonZeroPayrollLine(line));
  const unmatched = source.filter((line) =>
    nonZeroPayrollLine(line) &&
    !defs.some(([, matchers]) => matchesPayrollLine(line, matchers))
  );
  return [...standard, ...unmatched];
};

const nonZeroSummaryRow = ([, value]: [string, string]) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const numeric = Number(text.replace(/[^\d.-]/g, ''));
  return !Number.isFinite(numeric) || Math.abs(numeric) > 0.004;
};
const visibleInfoRow = ([, value]: [string, unknown]) => {
  const text = String(value || '').trim();
  if (!text || text === '-') return false;
  return !/^(not configured|not applicable|n\/a)$/i.test(text);
};

function PayslipWorkspace({ payload, employee }: { payload: Payload | null; employee?: Payload['employee'] }) {
  const periods = payload?.payrollHistory || [];
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const selected = periods.find((item) => item.period === selectedPeriod) || periods[0];

  useEffect(() => {
    const preferred = payload?.payrollAccess?.currentPeriod || periods[0]?.period || '';
    if (!selectedPeriod && preferred) setSelectedPeriod(preferred);
  }, [periods, payload?.payrollAccess?.currentPeriod, selectedPeriod]);

  if (!selected) {
    const pendingMessage = payload?.payrollAccess?.message
      || 'No payslip is available yet. Payslips are published here only after payroll approval and release.';
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <LockKeyhole className="mx-auto h-8 w-8 text-amber-600" />
        <p className="mt-3 text-sm font-extrabold text-amber-950">Payslip not yet released</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">{pendingMessage}</p>
      </div>
    );
  }

  const info = selected.employeeInfo || {};
  const statutory = selected.statutoryInfo || {};
  const leave = selected.leaveInfo || { annualLeaveEntitlement: 0, leaveTaken: 0, leaveBalance: 0, carryForwardLeave: 0 };
  const ytd = selected.ytd || { grossEarnings: 0, taxPaid: 0, pensionContribution: 0, deductions: 0, netEarnings: 0 };
  const verification = selected.verification || { qrCode: `DLE|${employee?.employeeId || ''}|${selected.period}`, generatedAt: payload?.generatedAt || new Date().toISOString(), approvalStatus: 'Payroll Approved' };
  const isNonPermanentPayslip = selected.payslipType === 'non-permanent';
  const permanentEarnings = standardLines(selected.earnings, [
    ['Basic Salary', ['BASIC', 'WEEKDAY EARNING', 'JCWEEKDAY']],
    ['Housing Allowance', ['HOUSING', 'HOUSE']],
    ['Transport Allowance', ['TRANSPORT', 'TRANS']],
    ['Other Allowance', ['OTHERALL', 'OTHER ALLOWANCE']],
    ['Utility Allowance', ['UTILITY', 'UTILITIES']],
    ['Furniture Allowance', ['FURNITURE', 'FURN']],
    ['Leave Allowance', ['LEAVE ALLOWANCE', 'LEAVE_ALLOW']],
    ['Medical Allowance', ['MEDICAL']],
    ['Meal Allowance', ['MEAL']],
    ['Shift Allowance', ['SHIFT']],
    ['Overtime', ['OVERTIME', 'OVT', 'WEEKDAY OVT']],
    ['Bonus', ['BONUS']],
    ['Other Earnings', ['REFUND', 'OTHER PAY', 'OTHER EARNINGS', 'HIGH TAX']],
  ]);
  const nonPermanentEarnings = (selected.earnings || []).filter(nonZeroPayrollLine);
  const earnings = isNonPermanentPayslip ? nonPermanentEarnings : permanentEarnings;
  const earningsTotal = earnings.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const grossPay = Math.max(Number(selected.grossPay || 0), earningsTotal);
  const deductions = standardLines(selected.deductionLines, [
    ['PAYE Tax', ['PAYE']],
    ['Pension Employee Contribution', ['PENSION']],
    ['NHF', ['NHF']],
    ['NHIA', ['NHIA']],
    ['Cooperative Deduction', ['COOPERATIVE']],
    ['Loan Repayment', ['LOAN']],
    ['Union Dues', ['UNION']],
    ['Absence/Late Penalty', ['ABSENCE', 'LATE']],
    ['Other Deductions', ['OTHER']],
  ]);
  const employerLines = standardLines(selected.employerContributionLines as PayrollLine[] | undefined, [
    ['Pension Employer Contribution', ['PENSION_EMPLOYER', 'PENSION EMPLOYER']],
    ['NSITF', ['NSITF']],
    ['ITF Levy', ['ITF']],
    ['Industrial Training Fund', ['INDUSTRIAL TRAINING']],
    ['Group Life Insurance', ['GROUP LIFE']],
    ['Other Employer Contributions', ['OTHER EMPLOYER']],
  ]);
  const totalEmployer = selected.totalEmployerContributions ?? employerLines.reduce((sum, line) => sum + line.amount, 0);
  const employeeRows: Array<[string, unknown]> = [
    ['Employee Code', info.employeeCode || employee?.employeeCode],
    ['Employee Name', info.employeeName || employee?.fullName],
    ['Employee Category', info.employeeCategory || employee?.payrollGroup],
    ['Department', info.department || employee?.department],
    ['Unit', info.unit || employee?.businessUnit],
    ['Designation / Job Title', info.designation || employee?.jobTitle],
    ['Grade Level', info.gradeLevel || employee?.salaryGrade],
    ['Employment Type', info.employmentType || 'Permanent'],
    ['Date of Employment', fmtDate(String(info.dateOfEmployment || ''))],
    ['Employee Status', info.employeeStatus || 'Active'],
  ];
  const bankRows: Array<[string, unknown]> = [
    ['Bank Name', statutory.bankName || 'Stanbic IBTC'],
    ['Account Number', statutory.accountNumber || 'Not configured'],
    ...(isNonPermanentPayslip ? [] : [
      ['Pension Fund Administrator', statutory.pensionFundAdministrator || 'Not configured'],
      ['Pension Number', statutory.pensionNumber || 'Not configured'],
      ['NHF Number', statutory.nhfNumber || 'Not applicable'],
    ] as Array<[string, unknown]>),
    ['Tax Number', statutory.taxNumber || selected.payeReference || 'Not configured'],
    ...(isNonPermanentPayslip ? [] : [['NHIA Number', statutory.nhiaNumber || 'Not applicable']] as Array<[string, unknown]>),
    ['Employee Address', info.address || 'Not configured'],
  ];
  const leaveRows: Array<[string, string]> = [
    ['Annual Leave Entitlement', `${leave.annualLeaveEntitlement} days`],
    ['Leave Taken', `${leave.leaveTaken} days`],
    ['Leave Balance', `${leave.leaveBalance} days`],
    ['Carry Forward Leave', `${leave.carryForwardLeave} days`],
  ];
  const ytdRows: Array<[string, string]> = [
    ['YTD Gross Earnings', money2(ytd.grossEarnings)],
    ['YTD Tax Paid', money2(ytd.taxPaid)],
    ['YTD Pension Contribution', money2(ytd.pensionContribution)],
    ['YTD Deductions', money2(ytd.deductions)],
    ['YTD Net Earnings', money2(ytd.netEarnings)],
  ];

  const printPayslip = () => window.print();
  const emailPayslip = () => {
    const subject = encodeURIComponent(`Payslip ${selected.periodLabel || selected.period}`);
    const body = encodeURIComponent(`Please find my payslip for ${selected.periodLabel || selected.period}. Net pay: ${money2(selected.netPay)}.`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Gross Pay" value={money(grossPay)} detail={`${selected.periodLabel || selected.period}${selected.dataSource === 'sage' ? ' · Sage payroll' : ''}`} icon={Banknote} tone="bg-violet-100 text-violet-700" />
        <MetricCard label="Allowances" value={money(selected.allowances ?? Math.max(0, grossPay - (earnings.find((line) => /BASIC|WEEKDAY EARNING/i.test(line.label || ''))?.amount || 0)))} detail={isNonPermanentPayslip ? 'Non-permanent payroll template' : selected.dataSource === 'enterprise' || selected.dataSource === 'sage' ? 'From released payroll' : 'Calculated payroll'} icon={WalletCards} tone="bg-emerald-100 text-emerald-700" />
        <MetricCard label="Tax / Deductions" value={money(selected.deductions)} detail="PAYE and statutory deductions" icon={FileText} tone="bg-amber-100 text-amber-700" />
        <MetricCard label="Pension" value={money(selected.pensionEmployee ?? (selected.deductionLines?.find((line) => /PENSION/i.test(line.code || line.label || ''))?.amount || 0))} detail="Employee contribution" icon={Landmark} tone="bg-cyan-100 text-cyan-700" />
      </div>
      <style jsx global>{`
        #ess-payslip-print {
          width: min(100%, 210mm);
          min-height: 297mm;
          overflow: visible;
        }
        @media print {
          html, body {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
          }
          body * { visibility: hidden !important; }
          #ess-payslip-print, #ess-payslip-print * { visibility: visible !important; }
          #ess-payslip-print {
            position: fixed !important;
            inset: 0 auto auto 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 0 !important;
            max-height: 297mm !important;
            padding: 4mm !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: hidden !important;
            font-size: 7.6px !important;
            line-height: 1.06 !important;
          }
          #ess-payslip-print header {
            padding-bottom: 1.4mm !important;
            gap: 1.5mm !important;
          }
          #ess-payslip-print header .relative {
            height: 11mm !important;
            width: 34mm !important;
          }
          #ess-payslip-print h2 {
            font-size: 18px !important;
            line-height: 1 !important;
          }
          #ess-payslip-print h3 {
            padding: 0.8mm 1.6mm !important;
            font-size: 7.8px !important;
            line-height: 1 !important;
          }
          #ess-payslip-print section,
          #ess-payslip-print footer {
            margin-top: 1.4mm !important;
          }
          #ess-payslip-print .p-3,
          #ess-payslip-print .p-2\\.5 {
            padding: 1.3mm !important;
          }
          #ess-payslip-print .px-3 {
            padding-left: 1.6mm !important;
            padding-right: 1.6mm !important;
          }
          #ess-payslip-print .py-3 {
            padding-top: 1.4mm !important;
            padding-bottom: 1.4mm !important;
          }
          #ess-payslip-print .gap-3 {
            gap: 1.4mm !important;
          }
          #ess-payslip-print .gap-2 {
            gap: 1mm !important;
          }
          #ess-payslip-print table {
            font-size: 7.1px !important;
            line-height: 1.03 !important;
          }
          #ess-payslip-print th,
          #ess-payslip-print td {
            padding: 0.45mm 0.8mm !important;
          }
          #ess-payslip-print .text-xs,
          #ess-payslip-print .text-\\[11px\\] {
            font-size: 7.5px !important;
            line-height: 1.06 !important;
          }
          #ess-payslip-print .text-lg {
            font-size: 12px !important;
            line-height: 1.05 !important;
          }
          #ess-payslip-print .text-xl {
            font-size: 13px !important;
            line-height: 1.05 !important;
          }
          #ess-payslip-print .leading-5 {
            line-height: 1.18 !important;
          }
          #ess-payslip-print .h-20 {
            height: 14mm !important;
          }
          #ess-payslip-print .w-20 {
            width: 14mm !important;
          }
          #ess-payslip-print .rounded-lg {
            border-radius: 2px !important;
          }
          .ess-no-print { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      <div className="ess-no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select value={selected.period} onChange={(event) => setSelectedPeriod(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800">
            {periods.map((period) => <option key={period.period} value={period.period}>{period.periodLabel || period.period}</option>)}
          </select>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">{selected.status}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={printPayslip} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#008FD5] px-3 text-xs font-black text-white hover:bg-[#087bb5]"><Printer className="h-4 w-4" /> Print Payslip</button>
          <button type="button" onClick={printPayslip} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50"><Download className="h-4 w-4" /> Download PDF</button>
          <button type="button" onClick={emailPayslip} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50"><Send className="h-4 w-4" /> Email</button>
        </div>
      </div>

      <article id="ess-payslip-print" className="mx-auto rounded-lg border border-[#2f67b1] bg-white p-3 text-[11px] leading-tight text-slate-950 shadow-sm">
        <header className="grid grid-cols-1 gap-3 border-b border-[#2f67b1] pb-3 md:grid-cols-[1fr_auto]">
          <div className="flex items-start gap-4">
            <div className="relative h-16 w-48 shrink-0">
              <Image src="/brand/dorman-long-logo.jpg" alt="Dorman Long Engineering Limited" fill sizes="208px" className="object-contain" priority />
            </div>
          </div>
          <div className="text-left md:text-right">
            <h2 className="text-3xl font-black tracking-normal text-[#123f82]">PAYSLIP</h2>
            <p className="mt-0.5 text-xs font-black uppercase text-slate-700">For the month of</p>
            <p className="text-lg font-black text-[#123f82]">{selected.periodLabel || selected.period}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-3 border-b border-[#9bb9df] py-3 md:grid-cols-2">
          <div className="grid grid-cols-[130px_10px_1fr] gap-y-1">
            <p className="font-black">Company Name</p><p>:</p><p>DORMANLONG ENGINEERING LIMITED</p>
            <p className="font-black">Company Address</p><p>:</p><p>12/14 AGEGE MOTOR ROAD, IDI-ORO MUSHIN, LAGOS</p>
            <p className="font-black">RC Number</p><p>:</p><p>744</p>
            <p className="font-black">TIN</p><p>:</p><p>01714597-0001</p>
          </div>
          <div className="grid grid-cols-[120px_10px_1fr] gap-y-1 md:border-l md:border-[#9bb9df] md:pl-6">
            <p className="font-black">Pay Period</p><p>:</p><p>{fmtDate(selected.payPeriodStart)} - {fmtDate(selected.payPeriodEnd)}</p>
            <p className="font-black">Pay Date</p><p>:</p><p>{fmtDate(selected.payDate)}</p>
            <p className="font-black">Payroll No.</p><p>:</p><p>{selected.payrollNumber || '-'}</p>
            <p className="font-black">PAYE Ref. No.</p><p>:</p><p>{selected.payeReference || '-'}</p>
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-[#2f67b1]">
          <h3 className="border-b border-[#2f67b1] px-3 py-1.5 text-xs font-black uppercase text-[#123f82]">Employee Information</h3>
          <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
            {[employeeRows.filter(visibleInfoRow), bankRows.filter(visibleInfoRow)].map((rows, idx) => (
              <div key={idx ? 'bank' : 'employee'} className={`grid grid-cols-[128px_10px_1fr] gap-y-1 p-3 ${idx ? 'md:border-l md:border-[#9bb9df]' : ''}`}>
                {rows.map(([label, value]) => <Fragment key={label}><p className="font-black">{label}</p><p>:</p><p>{String(value || '-')}</p></Fragment>)}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PayslipTable title="Earnings" lines={earnings} totalLabel="Total Earnings" total={grossPay} />
          <PayslipTable title="Deductions" lines={deductions} totalLabel="Total Deductions" total={selected.deductions} />
        </section>

        <section className="mt-3 rounded-lg border border-[#2f67b1] bg-blue-50/40 p-2.5 text-center">
          <div className="grid grid-cols-1 gap-2 text-xs font-black md:grid-cols-3">
            <p>Gross Pay: <span className="text-[#123f82]">{money2(grossPay)}</span></p>
            <p>Total Deductions: <span className="text-red-700">{money2(selected.deductions)}</span></p>
            <p>Net Pay: <span className="text-xl text-[#123f82]">{money2(selected.netPay)}</span></p>
          </div>
          <p className="mt-1.5 text-xs font-black">Amount in Words: {amountInWords(selected.netPay)}</p>
        </section>

        <section className="mt-3 rounded-lg border border-[#2f67b1]">
          <PayslipTable title="Company Contributions" lines={employerLines} totalLabel="Total Company Contributions" total={totalEmployer} wide />
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <SummaryBlock title="Leave Information" rows={leaveRows.filter(nonZeroSummaryRow)} />
          <SummaryBlock title="Year-To-Date Summary" rows={ytdRows.filter(nonZeroSummaryRow)} />
        </section>

        <footer className="mt-3 rounded-lg border border-[#9bb9df] p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_110px]">
            <div className="leading-5">
              <p className="font-black text-[#123f82]">NOTES</p>
              <p>1. This is a system generated payslip and does not require any signature.</p>
              <p>2. Payroll Processing Date: {stableDateTime(verification.generatedAt)}</p>
              <p>3. HR Approval Status: {verification.approvalStatus}</p>
              <p>4. All amounts are in Nigerian Naira (NGN).</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="grid h-20 w-20 grid-cols-5 grid-rows-5 gap-0.5 rounded-lg border border-[#123f82] bg-white p-1.5">
                {Array.from({ length: 25 }).map((_, index) => <span key={index} className={(verification.qrCode.charCodeAt(index % verification.qrCode.length) + index) % 2 ? 'bg-[#123f82]' : 'bg-slate-100'} />)}
              </div>
              <p className="text-center text-[10px] font-black text-slate-600">Verification QR</p>
            </div>
          </div>
          <p className="mt-2 text-center text-xs font-black italic text-[#123f82]">THANK YOU FOR YOUR CONTINUED CONTRIBUTION TO DORMANLONG ENGINEERING LIMITED.</p>
        </footer>
      </article>
    </section>
  );
}

function PayslipTable({ title, lines, totalLabel, total, wide = false }: { title: string; lines: PayrollLine[]; totalLabel: string; total: number; wide?: boolean }) {
  const visibleLines = lines.filter(nonZeroPayrollLine);
  return (
    <div className={`${wide ? '' : 'rounded-lg border border-[#2f67b1]'} overflow-hidden`}>
      <h3 className="bg-[#123f82] px-2 py-1.5 text-center text-xs font-black uppercase text-white">{title}</h3>
      <table className="w-full border-collapse text-[11px]">
        <thead className="bg-blue-50 text-xs uppercase">
          <tr><th className="border border-[#9bb9df] px-2 py-1.5 text-left">Description</th><th className="border border-[#9bb9df] px-2 py-1.5 text-center">Units</th><th className="border border-[#9bb9df] px-2 py-1.5 text-right">Amount (NGN)</th></tr>
        </thead>
        <tbody>
          {visibleLines.map((line) => (
            <tr key={`${title}-${line.code || line.label}`}>
              <td className="border border-[#d7e4f4] px-2 py-1 font-semibold">{line.label}</td>
              <td className="border border-[#d7e4f4] px-2 py-1 text-center">{Number(line.units || 0).toFixed(2)}</td>
              <td className="border border-[#d7e4f4] px-2 py-1 text-right font-semibold">{money2(line.amount).replace('NGN', '').trim()}</td>
            </tr>
          ))}
          <tr className="bg-blue-50">
            <td className="border border-[#2f67b1] px-2 py-1.5 font-black uppercase text-[#123f82]" colSpan={2}>{totalLabel}</td>
            <td className="border border-[#2f67b1] px-2 py-1.5 text-right font-black">{money2(total).replace('NGN', '').trim()}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SummaryBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  if (!rows.length) return null;
  return (
    <section className="rounded-lg border border-[#2f67b1]">
      <h3 className="border-b border-[#9bb9df] px-3 py-1.5 text-xs font-black uppercase text-[#123f82]">{title}</h3>
      <div className="divide-y divide-[#d7e4f4]">
        {rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 px-3 py-1 text-[11px]"><span className="font-bold text-slate-600">{label}</span><span className="font-black text-slate-950">{value}</span></div>)}
      </div>
    </section>
  );
}

function ActionGrid({ items }: { items: Array<[string, any, string?]> }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {items.map(([label, Icon, detail]) => {
        const tone = areaTone(label);
        return (
        <button key={label} type="button" className={`flex min-h-20 flex-col items-start justify-between rounded-lg border p-3 text-left hover:bg-white ${tone.item}`}>
          <Icon className={`h-5 w-5 ${tone.icon}`} />
          <span className="text-xs font-black text-slate-800">{label}</span>
          {detail ? <span className="text-[11px] font-semibold text-slate-500">{detail}</span> : null}
        </button>
      );
      })}
    </div>
  );
}

const leaveTabs = ['Leave Dashboard', 'Apply Leave', 'My Applications', 'Leave Calendar', 'Leave History', 'Approvals', 'Policy & Entitlement'] as const;
type LeaveTab = typeof leaveTabs[number];

const dayMs = 24 * 60 * 60 * 1000;
const calcLeaveDays = (from: string, to: string, basis: string) => {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  if (basis === 'Calendar days') return Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
  let days = 0;
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + dayMs)) {
    if (![0, 6].includes(d.getDay())) days += 1;
  }
  return days;
};

const leaveSectionToTab = (value?: string | null): LeaveTab | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'approvals') return 'Approvals';
  if (normalized === 'applications' || normalized === 'my applications') return 'My Applications';
  if (normalized === 'apply' || normalized === 'apply leave') return 'Apply Leave';
  return leaveTabs.find((tab) => tab.toLowerCase() === normalized) || null;
};

function EssLeaveWorkspace({ payload, employee, onLeaveSubmitted, onLeaveAction, onWithdrawLeave, onRetryNotification, retryingRequestId, saving, actingRequestId, submitError, initialNow, initialSection, managerMetrics }: { payload: Payload | null; employee?: Payload['employee']; onLeaveSubmitted?: (input: { requestId: string; leaveType: string; startDate: string; endDate: string; days: number; reason: string; relieverEmployeeId: string; relieverName: string; handover: string; attachmentNames: string[] }) => Promise<boolean>; onLeaveAction?: (input: { requestId: string; action: 'approve' | 'reject'; comment?: string }) => Promise<void>; onWithdrawLeave?: (requestId: string) => Promise<void>; onRetryNotification?: (requestId: string) => Promise<void>; retryingRequestId?: string; saving?: boolean; actingRequestId?: string; submitError?: string; initialNow: string; initialSection?: string | null; managerMetrics?: Payload['managerMetrics'] }) {
  const [active, setActive] = useState<LeaveTab>(() => leaveSectionToTab(initialSection) || 'Leave Dashboard');

  useEffect(() => {
    const next = leaveSectionToTab(initialSection);
    if (next) setActive(next);
  }, [initialSection]);
  const [leaveType, setLeaveType] = useState('Annual Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [reliever, setReliever] = useState('');
  const [handover, setHandover] = useState('');
  const [contact, setContact] = useState(employee?.phone || '');
  const [address, setAddress] = useState(employee?.location || '');
  const [ack, setAck] = useState(false);
  const [draftRequestId] = useState(() => `ess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const selected = (payload?.leave.balances || []).find((item) => String(item.type) === leaveType) || payload?.leave.balances?.[0];
  const relieverOptions = payload?.leave.relieverOptions || [];
  const selectedReliever = relieverOptions.find((item) => item.employeeId === reliever || item.employeeCode === reliever);
  const basis = String(selected?.basis || 'Working days');
  const days = calcLeaveDays(startDate, endDate, basis);
  const balance = Number(selected?.balance || 0);
  const allowanceEligible = leaveType === 'Annual Leave' && days >= 10;
  const usesCarryForward = leaveType === 'Carry Forward Leave';
  const pendingLeaveRequests = (payload?.requests || []).filter((item) =>
    /leave/i.test(item.category)
    && !['Approved', 'Rejected', 'Terminated', 'Closed'].includes(item.status),
  );
  const overlappingPendingRequest = pendingLeaveRequests.find((item) =>
    item.startDate
    && item.endDate
    && startDate
    && endDate
    && startDate <= item.endDate
    && endDate >= item.startDate,
  );
  const validations = [
    ...(overlappingPendingRequest
      ? [`You already have a pending leave request (${overlappingPendingRequest.title}) with status ${overlappingPendingRequest.status}. Open My Applications or wait for approval before submitting again.`]
      : []),
    ...(days > balance ? ['Selected days exceed available balance.'] : []),
    ...(leaveType === 'Annual Leave' && String(selected?.eligibilityStatus || '').toLowerCase().includes('locked') ? ['Annual Leave is available only after confirmation of appointment.'] : []),
    ...(usesCarryForward && endDate > `${new Date().getFullYear()}-03-31` ? ['Carry Forward Leave must be consumed on or before 31 March.'] : []),
    ...(leaveType === 'Annual Leave' && days > 0 && days < 10 ? ['This request does not qualify for Leave Allowance.'] : []),
    ...(!reason.trim() ? ['Reason is required.'] : []),
    ...(!reliever ? ['A department reliever is required.'] : []),
    ...(!handover.trim() ? ['Handover notes are required.'] : []),
    ...(!ack ? ['Policy acknowledgement is required before submission.'] : []),
  ];

  const uploadAttachment = async (file: File) => {
    setUploadingAttachment(true);
    try {
      const form = new FormData();
      form.set('requestId', draftRequestId);
      form.set('file', file);
      const res = await fetch('/api/workforce-portal/leave-attachments', { method: 'POST', body: form });
      const json = (await res.json()) as ApiResponse<{ fileName: string }>;
      if (!res.ok || json.status !== 'success' || !json.data?.fileName) throw new Error(json.error || 'Unable to upload attachment');
      setAttachmentNames((current) => [...current, json.data!.fileName]);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const openApply = (type?: string) => {
    if (type) setLeaveType(type);
    setActive('Apply Leave');
  };

  const resetApplyForm = () => {
    setStartDate('');
    setEndDate('');
    setReason('');
    setReliever('');
    setHandover('');
    setAck(false);
    setAttachmentNames([]);
  };

  const submitLeaveForm = async () => {
    if (!onLeaveSubmitted) return;
    const submitted = await onLeaveSubmitted({
      requestId: draftRequestId,
      leaveType,
      startDate,
      endDate,
      days,
      reason,
      relieverEmployeeId: reliever,
      relieverName: selectedReliever?.fullName || '',
      handover,
      attachmentNames,
    });
    if (!submitted) return;
    resetApplyForm();
    setActive('My Applications');
  };

  return (
    <section className="space-y-4">
      {active === 'Leave Dashboard' ? (
        <EssLeaveDashboardView
          payload={payload as EssLeavePayload | null}
          initialNow={initialNow}
          activeTab={active as LeaveWorkspaceTab}
          onTabChange={(tab) => setActive(tab as LeaveTab)}
          onApplyLeave={openApply}
          managerMetrics={managerMetrics}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[20px] border border-[#E5E7EB] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <div className="flex min-w-max gap-1">
              {leaveTabs.map((tab) => (
                <button key={tab} type="button" onClick={() => setActive(tab)} className={`inline-flex h-10 shrink-0 items-center rounded-[14px] px-4 text-[13px] font-semibold ${active === tab ? 'bg-[#2563EB] text-white' : 'text-[#475569] hover:bg-[#F8FAFC]'}`}>{tab}</button>
              ))}
            </div>
          </div>

          {active === 'Apply Leave' && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
          {pendingLeaveRequests.length ? (
            <div className="xl:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              You have {pendingLeaveRequests.length} pending leave request(s) awaiting approval. Check <button type="button" onClick={() => setActive('My Applications')} className="font-black text-amber-950 underline">My Applications</button> before submitting another request for the same dates.
            </div>
          ) : null}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-slate-950">Guided Leave Application</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold">{(payload?.leave.balances || []).map((item) => <option key={String(item.id)}>{String(item.type)}</option>)}</select>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold" />
              <input value={`${days} ${basis.toLowerCase()}`} readOnly className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-black text-slate-800" />
              <select value={reliever} onChange={(e) => setReliever(e.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold">
                <option value="">Select department reliever...</option>
                {relieverOptions.map((item) => <option key={item.employeeId} value={item.employeeId}>{item.fullName} - {item.jobTitle}</option>)}
              </select>
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact number while on leave" className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold" />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Leave address / location" className="h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold md:col-span-2" />
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="min-h-24 rounded-lg border border-slate-200 p-3 text-sm font-bold md:col-span-2" />
              <textarea value={handover} onChange={(e) => setHandover(e.target.value)} placeholder="Handover notes" className="min-h-24 rounded-lg border border-slate-200 p-3 text-sm font-bold md:col-span-2" />
              <label className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-600 md:col-span-2">
                <span>Supporting documents (optional)</span>
                <input
                  type="file"
                  className="mt-2 block w-full text-xs font-semibold"
                  disabled={uploadingAttachment || saving}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAttachment(file);
                    event.currentTarget.value = '';
                  }}
                />
                {attachmentNames.length ? <p className="mt-2 text-xs font-semibold text-emerald-700">{attachmentNames.join(', ')}</p> : null}
              </label>
              <label className="flex items-start gap-2 text-sm font-bold text-slate-700 md:col-span-2"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" /> I acknowledge Dorman Long leave policy, balance, allowance, reliever, and audit requirements.</label>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-950">Policy Validation</h3>
            <p className="text-xs font-semibold text-slate-600">Allowance: {allowanceEligible && !usesCarryForward ? 'Eligible after approval and payroll notification' : 'Not eligible for this selection'}</p>
            <p className="text-xs font-semibold text-slate-600">Available balance: {balance} days</p>
            <div className="space-y-2">{validations.map((item, index) => <div key={`${item}-${index}`} className={`rounded-lg border px-3 py-2 text-xs font-bold ${item.includes('does not qualify') ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{item}</div>)}</div>
            {!validations.length && !submitError ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{'Ready to submit. Workflow: Employee Request -> Line Manager / Lead / Supervisor -> HR Manager / Head -> requester and reliever notifications.'}</div> : null}
            {submitError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{submitError}</div> : null}
            <button
              type="button"
              onClick={() => void submitLeaveForm()}
              disabled={saving || Boolean(validations.filter((item) => !item.includes('does not qualify')).length)}
              className="h-11 w-full rounded-lg bg-blue-600 text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-500"
            >
              {saving ? 'Submitting...' : 'Submit Leave Application'}
            </button>
          </div>
        </section>
          )}

      {active === 'My Applications' && (
        <section className="space-y-3">
          <EssWorkflowDiagnosticsBanner
            mailProvider={payload?.workflowDiagnostics?.mailProvider}
            mailConfigured={payload?.workflowDiagnostics?.mailConfigured}
            recentFailures={payload?.workflowDiagnostics?.recentFailures}
          />
          {(payload?.requests.filter((item) => /leave/i.test(item.category)) || []).map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-slate-950">{item.title}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">Status: {item.status} · Submitted: {new Date(item.submittedAt).toLocaleString('en-GB')}</p>
              <div className="mt-3">
                <EssWorkflowDeliveryPanel
                  requestId={item.id}
                  trace={payload?.workflowDiagnostics?.requestTraces?.[item.id]}
                  compact
                  retrying={retryingRequestId === item.id}
                  onRetry={onRetryNotification}
                />
              </div>
              {['Line Manager Review', 'HR Review', 'Submitted', 'Draft'].includes(item.status) ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onWithdrawLeave?.(item.id)}
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50"
                >
                  Withdraw request
                </button>
              ) : null}
            </div>
          ))}
          {!payload?.requests.filter((item) => /leave/i.test(item.category)).length ? (
            <p className="text-sm font-semibold text-slate-500">No leave applications submitted yet.</p>
          ) : null}
        </section>
      )}
      {active === 'Leave Calendar' && <section className="grid grid-cols-1 gap-4 xl:grid-cols-2"><InfoListLike title="Calendar" rows={payload?.leave.calendar || []} keys={['label', 'from', 'to', 'status', 'scope']} /><InfoListLike title="Notifications" rows={payload?.leave.notifications || []} keys={['title', 'channel', 'status']} /></section>}
      {active === 'Leave History' && <DataList rows={payload?.leave.history || []} titleKey="type" subtitleKeys={['from', 'to', 'days', 'approvalStage', 'allowanceStatus']} />}
      {active === 'Approvals' && (
        <EssLeaveApprovalsView
          payload={payload as unknown as EssLeaveApprovalsPayload | null}
          saving={saving}
          actingRequestId={actingRequestId}
          onLeaveAction={onLeaveAction}
        />
      )}
      {active === 'Policy & Entitlement' && <section className="grid grid-cols-1 gap-4 xl:grid-cols-2"><InfoListLike title="Payroll & Allowance" rows={payload?.leave.allowance || []} keys={['label', 'value', 'status']} /><InfoListLike title="Reports & RBAC" rows={[...(payload?.leave.reports || []), ...(payload?.leave.security || [])]} keys={['title', 'role', 'access', 'format', 'status']} /></section>}
        </>
      )}
    </section>
  );
}

function InfoListLike({ title, rows, keys }: { title: string; rows: SimpleRecord[]; keys: string[] }) {
  return (
    <Section title={title}>
      <div className="space-y-3">
        {rows.map((row, index) => <div key={`${title}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-black text-slate-950">{String(row[keys[0]] || row[keys[1]] || 'Record')}</p><p className="mt-1 text-xs font-semibold text-slate-600">{keys.slice(1).map((key) => row[key]).filter(Boolean).join(' - ')}</p></div>)}
      </div>
    </Section>
  );
}

export default function WorkforcePortalClient({ initialNow }: { initialNow: string }) {
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [locale, setLocale] = useState('en-NG');
  const [requestServiceId, setRequestServiceId] = useState('profile-update');
  const [requestTitle, setRequestTitle] = useState('');
  const [requestPriority, setRequestPriority] = useState('Normal');
  const [serviceSubmitError, setServiceSubmitError] = useState('');
  const [travelSubmitError, setTravelSubmitError] = useState('');
  const [loanProductId, setLoanProductId] = useState('');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanTenorMonths, setLoanTenorMonths] = useState('');
  const [loanPurpose, setLoanPurpose] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingRequestId, setActingRequestId] = useState('');
  const [retryingRequestId, setRetryingRequestId] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [leaveSection, setLeaveSection] = useState<string | null>(null);
  const [forceCelebrationOpen, setForceCelebrationOpen] = useState(false);

  const navigateTab = (next: Tab, options?: { leaveSection?: string }) => {
    setTab(next);
    setLeaveSection(options?.leaveSection || null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      if (options?.leaveSection) url.searchParams.set('leaveSection', options.leaveSection);
      else url.searchParams.delete('leaveSection');
      window.history.replaceState(null, '', url.toString());
    }
  };

  const load = async (options?: { refresh?: boolean }) => {
    setLoading(true);
    setError('');
    try {
      const headers: Record<string, string> = { 'x-ess-locale': locale };
      if (options?.refresh) headers['x-ess-refresh'] = '1';
      const res = await fetch('/api/workforce-portal', { headers, cache: 'no-store' });
      const json = await parseJsonResponse(res, 'Workforce portal API') as ApiResponse<Payload>;
      if (!res.ok || json.status !== 'success' || !json.data) throw new Error(json.error || `Workforce portal request failed (${res.status})`);
      setPayload(json.data);
      if (json.data.serviceCatalog?.length) {
        const validIds = new Set(json.data.serviceCatalog.map((item) => item.id));
        if (!validIds.has(requestServiceId)) setRequestServiceId(json.data.serviceCatalog[0]?.id || 'profile-update');
      }
      if (!loanProductId && json.data.loanManagement.products[0]) {
        setLoanProductId(json.data.loanManagement.products[0].id);
        setLoanTenorMonths(String(Math.min(3, json.data.loanManagement.products[0].maxTenorMonths)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workforce portal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [locale]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab') as Tab | null;
    const requestedLeaveSection = searchParams.get('leaveSection');
    if (requestedTab && navItems.some((item) => item.id === requestedTab)) setTab(requestedTab);
    if (requestedLeaveSection) setLeaveSection(requestedLeaveSection);
  }, [searchParams]);

  const submitRequest = async () => {
    if (!payload) return;
    if (requestServiceId === 'leave') {
      setServiceSubmitError('Leave applications must be submitted from the Leave workspace.');
      setTab('leave');
      return;
    }
    setSaving(true);
    setToast('');
    setError('');
    setServiceSubmitError('');
    try {
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceId: requestServiceId, title: requestTitle, priority: requestPriority }),
      });
      const json = (await res.json()) as ApiResponse<{ request: EssRequest }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to submit request');
      setToast('Request submitted and routed to the configured workflow.');
      setRequestTitle('');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to submit request';
      setServiceSubmitError(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const submitTravelRequest = async (input: {
    serviceId: string;
    title: string;
    reason: string;
    startDate?: string;
    endDate?: string;
    priority: string;
  }) => {
    if (!payload) return;
    setSaving(true);
    setToast('');
    setError('');
    setTravelSubmitError('');
    try {
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: input.serviceId,
          title: input.title,
          reason: input.reason,
          startDate: input.startDate,
          endDate: input.endDate,
          priority: input.priority,
        }),
      });
      const json = (await res.json()) as ApiResponse<{ request: EssRequest }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to submit travel request');
      setToast('Travel request submitted and routed for approval.');
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to submit travel request';
      setTravelSubmitError(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const acknowledgePerformanceItem = async (kind: 'goal' | 'result', id: string) => {
    setSaving(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: kind === 'goal' ? 'acknowledge-performance-goal' : 'acknowledge-performance-result',
          id,
        }),
      });
      const json = await parseJsonResponse(res, 'Performance acknowledgement API') as ApiResponse<{ message?: string }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to acknowledge.');
      setToast(json.data?.message || 'Performance item acknowledged.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to acknowledge performance item.');
    } finally {
      setSaving(false);
    }
  };

  const submitLeaveApplication = async (input: { requestId: string; leaveType: string; startDate: string; endDate: string; days: number; reason: string; relieverEmployeeId: string; relieverName: string; handover: string; attachmentNames: string[] }): Promise<boolean> => {
    if (!payload) return false;
    setSaving(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: 'leave',
          category: 'Leave Application',
          title: `${input.leaveType} ${input.startDate} to ${input.endDate}`,
          priority: 'Normal',
          requestId: input.requestId,
          leaveType: input.leaveType,
          startDate: input.startDate,
          endDate: input.endDate,
          days: input.days,
          reason: input.reason,
          relieverEmployeeId: input.relieverEmployeeId,
          relieverName: input.relieverName,
          handover: input.handover,
          attachmentNames: input.attachmentNames,
        }),
      });
      const json = await parseJsonResponse(res, 'Leave submission API') as ApiResponse<{ request: EssRequest; message?: string; deliveryWarnings?: string[] }>;
      if (!res.ok || json.status !== 'success' || !json.data?.request) {
        throw new Error(json.error || 'Unable to submit leave application');
      }
      const submitted = json.data.request;
      if (json.data.deliveryWarnings?.length) {
        setError(json.data.deliveryWarnings.join(' '));
      }
      setToast(
        json.data.message
        || `Leave application submitted successfully. Reference ${submitted.id}. Status: ${submitted.status}.`,
      );
      navigateTab('leave', { leaveSection: 'applications' });
      await load({ refresh: true });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit leave application');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const withdrawLeaveRequest = async (requestId: string) => {
    if (!payload) return;
    setSaving(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw-leave', requestId }),
      });
      const json = (await res.json()) as ApiResponse<{ message?: string }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to withdraw leave request');
      setToast(json.data?.message || 'Leave request withdrawn. You can submit again.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to withdraw leave request');
    } finally {
      setSaving(false);
    }
  };

  const retryLeaveNotification = async (requestId: string) => {
    if (!payload) return;
    setRetryingRequestId(requestId);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'retry-leave-notification', requestId }),
      });
      const json = (await res.json()) as ApiResponse<{ message?: string }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to resend approval email.');
      setToast(json.data?.message || 'Approval email resent.');
      await load({ refresh: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend approval email.');
    } finally {
      setRetryingRequestId('');
    }
  };

  const submitLeaveApproval = async (input: { requestId: string; action: 'approve' | 'reject'; comment?: string }) => {
    if (!payload) return;
    setActingRequestId(input.requestId);
    setSaving(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: input.action === 'approve' ? 'approve-leave' : 'reject-leave',
          requestId: input.requestId,
          comment: input.comment,
        }),
      });
      const json = await parseJsonResponse(res, 'Leave approval API') as ApiResponse<{ request: EssRequest; leaveAllowance?: string }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to process leave approval');
      const updatedRequest = json.data?.request;
      if (updatedRequest) {
        setPayload((current) => {
          if (!current) return current;
          const approvals = (current.leave?.approvals || []).filter((item) => {
            const rowId = String((item as SimpleRecord).requestId || (item as SimpleRecord).id || '');
            return rowId !== input.requestId;
          });
          return {
            ...current,
            leave: {
              ...current.leave,
              approvals,
              pendingApprovalCount: approvals.length,
            },
          };
        });
      }
      setToast(json.data?.leaveAllowance || `Leave request ${input.action === 'approve' ? 'approved' : 'rejected'}.`);
      await load({ refresh: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process leave approval');
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
      setActingRequestId('');
    }
  };

  const submitLoanApplication = async () => {
    if (!payload) return;
    setSaving(true);
    setToast('');
    setError('');
    try {
      const res = await fetch('/api/hris/payroll/loan-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hris-role': 'Employee' },
        body: JSON.stringify({ productId: loanProductId, principal: Number(loanPrincipal), tenorMonths: Number(loanTenorMonths), purpose: loanPurpose }),
      });
      const json = (await res.json()) as ApiResponse<{ application: SimpleRecord }>;
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to submit loan application');
      setToast('Loan application submitted for approval.');
      setLoanPrincipal('');
      setLoanPurpose('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit loan application');
    } finally {
      setSaving(false);
    }
  };

  const employee = payload?.employee;
  const widgets = payload?.widgets;
  const employeeCode = employee?.employeeCode || employee?.employeeId;
  const selectedLoanProduct = payload?.loanManagement.products.find((product) => product.id === loanProductId) || null;
  const todaysCelebrations = useMemo(
    () => buildTodaysCelebrations(
      payload?.todaysBirthdays ?? payload?.birthdays,
      payload?.todaysAnniversaries ?? payload?.anniversaries,
    ),
    [payload?.anniversaries, payload?.birthdays, payload?.todaysAnniversaries, payload?.todaysBirthdays],
  );

  return (
    <EssPortalShell
      tab={tab}
      onTabChange={navigateTab}
      locale={locale}
      onLocaleChange={setLocale}
      loading={loading}
      onRefresh={() => void load()}
      generatedAt={payload?.generatedAt}
      department={employee?.department}
      employee={employee}
      managerMetrics={payload?.managerMetrics}
      rightPanel={tab === 'dashboard' ? (
        <EssRightPanel
          payload={payload}
          onNavigate={navigateTab}
          onOpenCelebrations={() => setForceCelebrationOpen(true)}
        />
      ) : undefined}
    >
      <EssCelebrationFlyerModal
        moments={todaysCelebrations}
        viewer={employee}
        forceOpen={forceCelebrationOpen}
        onForceOpenHandled={() => setForceCelebrationOpen(false)}
      />
      <EssMobileNav tab={tab} onTabChange={navigateTab} />

      {error && <div className="mb-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}
      {toast && <div className="mb-4 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{toast}</div>}

      {tab === 'dashboard' && (
        <EssDashboardView
          payload={payload}
          initialNow={initialNow}
          onNavigate={navigateTab}
        />
      )}

      {tab === 'profile' && (
        <EssProfileDashboardView
          payload={payload as EssProfilePayload | null}
          initialNow={initialNow}
          onNavigate={navigateTab}
          onRefresh={() => void load()}
        />
      )}

      {tab === 'payroll' && widgets && (
        <EssPayrollDashboardView
          payload={payload as EssPayrollPayload | null}
          onNavigate={navigateTab}
        />
      )}

      {tab === 'reports' && (
        <EssReportsView payload={payload as unknown as EssReportsPayload | null} locale={locale} />
      )}

      {tab === 'time' && (
        <EssTimeView payload={payload as unknown as EssTimePayload | null} locale={locale} onRefresh={() => void load()} onNavigate={(nextTab) => navigateTab(nextTab as EssTab)} />
      )}

      {tab === 'documents' && (
        <EssDocumentsView payload={payload as unknown as EssDocumentsPayload | null} onNavigate={(nextTab) => navigateTab(nextTab as EssTab)} />
      )}

      {tab === 'communication' && (
        <EssCommunicationsView payload={payload as unknown as EssCommunicationsPayload | null} onNavigate={(nextTab, options) => navigateTab(nextTab as EssTab, options)} />
      )}

      {tab === 'travel' && (
        <EssTravelDashboardView
          payload={payload as EssTravelPayload | null}
          saving={saving}
          submitError={travelSubmitError}
          submitNotice={toast && tab === 'travel' ? toast : ''}
          onSubmit={submitTravelRequest}
          onRefresh={() => void load()}
          onNavigate={navigateTab}
        />
      )}

      {tab !== 'dashboard' && tab !== 'profile' && tab !== 'payroll' && tab !== 'reports' && tab !== 'time' && tab !== 'documents' && tab !== 'communication' && tab !== 'travel' && (
        <div className="space-y-4">
          {tab === 'leave' && widgets && (
            <EssLeaveWorkspace payload={payload} employee={employee} onLeaveSubmitted={submitLeaveApplication} onLeaveAction={submitLeaveApproval} onWithdrawLeave={withdrawLeaveRequest} onRetryNotification={retryLeaveNotification} retryingRequestId={retryingRequestId} saving={saving} actingRequestId={actingRequestId} submitError={error} initialNow={initialNow} initialSection={leaveSection} managerMetrics={payload?.managerMetrics} />
          )}

          {tab === 'performance' && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Section title="Goals, KPIs & Performance Reviews">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <DataList rows={payload?.performance.goals || []} titleKey="title" subtitleKeys={['progress', 'dueDate', 'status']} emptyTitle="No goals on file" emptyDescription="OKRs assigned in Performance Management will appear here for review and acknowledgement." />
                    {(payload?.performance.goals || []).filter((goal) => /assigned|resubmitted|discussion/i.test(String(goal.status || ''))).map((goal) => (
                      <button
                        key={`ack-goal-${goal.id}`}
                        type="button"
                        disabled={saving}
                        onClick={() => void acknowledgePerformanceItem('goal', String(goal.id))}
                        className="w-full rounded-lg border border-[#0052CC]/30 bg-[#E8F1FF] px-3 py-2 text-left text-xs font-bold text-[#0052CC] hover:bg-[#D6E6FF] disabled:opacity-60"
                      >
                        Acknowledge goal: {String(goal.title || goal.id)}
                      </button>
                    ))}
                  </div>
                  <DataList rows={payload?.performance.kpis || []} titleKey="label" subtitleKeys={['value', 'target']} statusKey="label" emptyTitle="No KPIs available" emptyDescription="Live goal and check-in metrics from Performance Management will appear here." />
                </div>
              </Section>
              <Section title="Appraisals, Self-Assessments & Development Plans">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <DataList rows={payload?.performance.reviews || []} titleKey="cycle" subtitleKeys={['form', 'score', 'status']} emptyTitle="No appraisals yet" emptyDescription="Assessments and published results from Performance Management will appear here." />
                    {(payload?.performance.reviews || []).filter((review) => /published/i.test(String(review.status || ''))).map((review) => (
                      <button
                        key={`ack-result-${review.id}`}
                        type="button"
                        disabled={saving}
                        onClick={() => void acknowledgePerformanceItem('result', String(review.id))}
                        className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        Acknowledge result: {String(review.form || review.cycle || review.id)}
                      </button>
                    ))}
                  </div>
                  <DataList rows={payload?.performance.developmentPlans || []} titleKey="title" subtitleKeys={['owner', 'status']} emptyTitle="No development plans" emptyDescription="Development plans will appear when assigned by your manager." />
                </div>
              </Section>
            </section>
          )}

          {tab === 'learning' && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Section title="Training Enrollment & Course Registration"><DataList rows={payload?.learning.courses || []} titleKey="title" subtitleKeys={['date', 'type']} emptyTitle="No enrolled courses" emptyDescription="Training courses from your HR document library will appear here." /></Section>
              <Section title="Learning Materials, Assessments & Feedback"><DataList rows={payload?.learning.materials || []} titleKey="title" subtitleKeys={['type']} emptyTitle="No learning materials" emptyDescription="Handbooks, guides, and assessments on file will appear here." /></Section>
              <Section title="Certifications"><DataList rows={payload?.learning.certifications || []} titleKey="title" subtitleKeys={['expiresAt', 'status']} emptyTitle="No certifications on file" emptyDescription="Certificates uploaded to your employee record will appear here." /></Section>
            </section>
          )}

          {tab === 'claims' && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
              <Section title="Claims & Reimbursements">
                <ActionGrid items={[
                  ['Travel claim', Plane, 'Attach receipts'],
                  ['Expense claim', WalletCards, 'Cost center aware'],
                  ['Medical reimbursement', FileText, 'Evidence required'],
                  ['Advance request', Banknote, 'Finance approval'],
                ]} />
              </Section>
              <Section title="Claim Approvals, Uploads & Status Tracking">
                <DataList rows={payload?.claims || []} titleKey="type" subtitleKeys={['status', 'submittedAt', 'attachmentStatus']} emptyTitle="No claims submitted" emptyDescription="Submit a claim from Services or the actions on the left and it will track here." />
              </Section>
            </section>
          )}

          {tab === 'loans' && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr_1fr]">
              <Section title="New Loan Application">
                <div className="space-y-3">
                  <label className="block text-xs font-black uppercase tracking-normal text-slate-500">Applicant</label>
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-3">
                    <p className="text-sm font-black text-slate-900">{employee?.fullName || 'Signed-in employee'}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{employeeCode} - {employee?.department || 'Department'}</p>
                  </div>
                  <label className="block text-xs font-black uppercase tracking-normal text-slate-500">Product</label>
                  <select value={loanProductId} onChange={(e) => setLoanProductId(e.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none">
                    {(payload?.loanManagement.products || []).map((product) => <option key={product.id} value={product.id}>{product.label}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-normal text-slate-500">Amount</label>
                      <input value={loanPrincipal} onChange={(e) => setLoanPrincipal(e.target.value)} inputMode="decimal" className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-normal text-slate-500">Tenor</label>
                      <input value={loanTenorMonths} onChange={(e) => setLoanTenorMonths(e.target.value)} inputMode="numeric" className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none" />
                    </div>
                  </div>
                  <label className="block text-xs font-black uppercase tracking-normal text-slate-500">Purpose</label>
                  <textarea value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} className="min-h-24 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-800 outline-none" />
                  <button type="button" onClick={submitLoanApplication} disabled={saving || !loanProductId || !loanPrincipal || !loanTenorMonths || !loanPurpose.trim()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><Send className="h-4 w-4" />{saving ? 'Submitting' : 'Submit Application'}</button>
                  <p className="text-xs font-semibold text-slate-500">{selectedLoanProduct ? `${selectedLoanProduct.maxTenorMonths} months max, ${selectedLoanProduct.maxPrincipalMultiple}x base pay cap` : 'Loan products are loaded from payroll policy.'}</p>
                </div>
              </Section>
              <Section title="My Loan Applications"><DataList rows={payload?.loanManagement.applications || []} titleKey="productId" subtitleKeys={['principal', 'tenorMonths', 'requestedAt']} statusKey="approvalStatus" /></Section>
              <Section title="Repayment Schedules & Balances"><DataList rows={payload?.loanManagement.repaymentSchedules || []} titleKey="productId" subtitleKeys={['dueDate', 'amount', 'balance']} /></Section>
            </section>
          )}

          {tab === 'assets' && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
              <Section title="Assigned Assets">
                <DataList rows={payload?.assets || []} titleKey="name" subtitleKeys={['tag', 'acknowledgement', 'condition']} emptyTitle="No assigned assets" emptyDescription="Company assets assigned to you or recorded in HR documents will appear here." />
              </Section>
              <Section title="Asset Actions">
                <ActionGrid items={[
                  ['Acknowledge receipt', BadgeCheck, 'Digital evidence'],
                  ['Request replacement', RefreshCcw, 'Approval required'],
                  ['Report damage', FileText, 'Incident trail'],
                  ['Return asset', BriefcaseBusiness, 'Exit/transfer'],
                ]} />
              </Section>
            </section>
          )}

          {tab === 'services' && (
            <EssServicesView
              payload={payload as unknown as EssServicesPayload | null}
              requestServiceId={requestServiceId}
              requestTitle={requestTitle}
              requestPriority={requestPriority}
              onServiceChange={(value) => {
                setRequestServiceId(value);
                setServiceSubmitError('');
              }}
              onTitleChange={setRequestTitle}
              onPriorityChange={setRequestPriority}
              onSubmit={submitRequest}
              onOpenLeave={() => setTab('leave')}
              saving={saving}
              submitError={serviceSubmitError}
              submitNotice={toast && tab === 'services' ? toast : ''}
            />
          )}

          {tab === 'workflow' && (
            <EssWorkflowDashboardView
              payload={payload}
              onRefresh={() => void load()}
              onNavigate={(nextTab, options) => navigateTab(nextTab, options)}
              workflowDiagnostics={payload?.workflowDiagnostics}
            />
          )}

          {tab === 'exit' && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
              <Section title="Employee Exit & Separation Services">
                <ActionGrid items={[
                  ['Submit resignation', FileText, 'Notice period checked'],
                  ['Exit interview', ClipboardList, 'Questionnaire'],
                  ['Track final settlement', Banknote, 'Payroll/finance'],
                  ['Asset return', BriefcaseBusiness, 'Clearance item'],
                ]} />
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-xs font-black uppercase tracking-normal text-slate-500">Resignation Status</p>
                  <p className="mt-2 text-sm font-black text-slate-950">{String(payload?.exitServices.resignation.status || 'Not submitted')}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Notice period: {String(payload?.exitServices.resignation.noticePeriodDays || 0)} days</p>
                </div>
              </Section>
              <Section title="Clearance, Asset Return, Interview & Final Settlement">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DataList rows={payload?.exitServices.clearance || []} titleKey="unit" />
                  <DataList rows={[payload?.exitServices.exitInterview || {}, payload?.exitServices.finalSettlement || {}]} titleKey="form" subtitleKeys={['payrollPeriod']} />
                </div>
              </Section>
            </section>
          )}

          {tab === 'security' && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Section title="Enterprise Security & Access">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Object.entries(payload?.security || {}).map(([label, value]) => (
                    <div key={label} className={`rounded-lg border p-4 ${areaTone(label).item}`}>
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      <p className="mt-3 text-xs font-black uppercase tracking-normal text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Analytics, Reports & Integrations">
                <div className="grid grid-cols-2 gap-3">
                  {payload?.analytics.map((item) => (
                    <div key={item.label} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-2xl font-black text-slate-950">{numFmt.format(item.value)}{item.unit}</p>
                      <p className="mt-1 text-xs font-bold text-slate-600">{item.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {payload?.integrations.map((item) => <span key={item} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-800"><Globe2 className="h-3 w-3" />{item}</span>)}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-slate-600">
                  <Smartphone className="h-4 w-4 text-blue-600" />Responsive web and mobile access enabled for employee transactions.
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-black uppercase tracking-normal text-slate-500">Report Generation</p>
                  <DataList rows={payload?.reports || []} titleKey="title" subtitleKeys={['format']} />
                </div>
              </Section>
              <Section title="Configurable Rules, Audit Trail & Activity Logging">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DataList rows={payload?.businessRules || []} titleKey="name" subtitleKeys={['configurable']} />
                  <DataList rows={payload?.auditTrail || []} titleKey="action" subtitleKeys={['actor', 'channel', 'at']} statusKey="channel" />
                </div>
              </Section>
            </section>
          )}

        </div>
      )}
    </EssPortalShell>
  );
}
