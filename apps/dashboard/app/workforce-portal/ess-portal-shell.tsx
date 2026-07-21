'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Clock,
  FileArchive,
  FileBarChart,
  Fingerprint,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Plane,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Target,
  UserRound,
  WalletCards,
  GitBranch,
} from 'lucide-react';
import { NotificationCenter } from '@/components/layout/notification-center';
import { EnterpriseUserProfile } from '@hris/components/layout/enterprise-user-profile';
import { essTokens } from './ess-portal-ui';

export type EssTab =
  | 'dashboard'
  | 'profile'
  | 'leave'
  | 'time'
  | 'payroll'
  | 'documents'
  | 'performance'
  | 'learning'
  | 'claims'
  | 'loans'
  | 'services'
  | 'travel'
  | 'assets'
  | 'communication'
  | 'workflow'
  | 'reports'
  | 'security'
  | 'exit';

export const ESS_NAV_ITEMS: Array<{ id: EssTab; label: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'leave', label: 'Leave', icon: CalendarCheck },
  { id: 'time', label: 'Time', icon: Clock },
  { id: 'payroll', label: 'Payslip', icon: Banknote },
  { id: 'documents', label: 'Documents', icon: FileArchive },
  { id: 'performance', label: 'Performance', icon: Target },
  { id: 'learning', label: 'Learning', icon: GraduationCap },
  { id: 'claims', label: 'Claims', icon: WalletCards },
  { id: 'loans', label: 'Loans', icon: Landmark },
  { id: 'services', label: 'Services', icon: ClipboardList },
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'assets', label: 'Assets', icon: BriefcaseBusiness },
  { id: 'communication', label: 'Communications', icon: Megaphone },
  { id: 'workflow', label: 'Workflow', icon: GitBranch },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'exit', label: 'Admin', icon: Settings },
];

const QUICK_ACCESS = [
  { label: 'HR Policy', href: '/workforce-portal?tab=documents' },
  { label: 'Org Chart', href: '/hris/organization' },
  { label: 'Directory', href: '/hris/employees' },
  { label: 'Help & Support', href: '/workforce-portal?tab=services' },
];

type EssPortalShellProps = {
  tab: EssTab;
  onTabChange: (tab: EssTab, options?: { leaveSection?: string }) => void;
  locale: string;
  onLocaleChange: (locale: string) => void;
  loading: boolean;
  onRefresh: () => void;
  generatedAt?: string;
  department?: string;
  employee?: {
    fullName?: string;
    jobTitle?: string;
    employeeCode?: string;
    employeeId?: string;
    department?: string;
    photoUrl?: string;
    hasPhoto?: boolean;
  };
  managerMetrics?: {
    teamSize?: number;
    pendingApprovals?: number;
    onLeave?: number;
    missingTimesheets?: number;
    teamAttendancePct?: number;
    trainingToday?: number;
    pendingPerformanceReviews?: number;
  };
  children: ReactNode;
  rightPanel?: ReactNode;
};

export function EssPortalShell({
  tab,
  onTabChange,
  locale,
  onLocaleChange,
  loading,
  onRefresh,
  generatedAt,
  department,
  employee,
  managerMetrics,
  children,
  rightPanel,
}: EssPortalShellProps) {
  const syncLabel = generatedAt
    ? new Date(generatedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="flex min-h-dvh" style={{ backgroundColor: essTokens.pageBg, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside className="ess-no-print fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col lg:flex" style={{ backgroundColor: essTokens.sidebar }}>
        <div className="border-b border-white/10 px-5 py-5">
          <div className="relative h-12 w-full">
            <Image src="/brand/dorman-long-logo.svg" alt="Dorman Long Engineering Limited" fill sizes="240px" className="object-contain object-left brightness-0 invert" priority />
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {ESS_NAV_ITEMS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] font-medium transition-all duration-150 ${
                  active
                    ? 'bg-[#2563EB] text-white shadow-[0_0_20px_rgba(37,99,235,0.45)]'
                    : 'text-white/75 hover:bg-[#173067] hover:text-white'
                }`}
              >
                <item.icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Quick Access</p>
          <div className="space-y-1">
            {QUICK_ACCESS.map((item) => (
              <Link key={item.label} href={item.href} className="block rounded-lg px-2 py-1.5 text-[13px] text-white/60 hover:bg-white/5 hover:text-white">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="rounded-[16px] border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[13px] font-semibold text-emerald-400">Online</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-white/50">Last sync: {syncLabel}</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-white/50">
              <Activity className="h-3 w-3 text-emerald-400" /> All systems operational
            </p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-[280px]">
        {/* Header */}
        <header className="ess-no-print sticky top-0 z-20 flex h-[88px] items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 sm:px-5">
          <div className="hidden min-w-0 shrink-0 lg:block">
            <h1 className="truncate text-[15px] font-bold text-[#0F172A]">Employee Self-Service Portal</h1>
            <p className="truncate text-[13px] text-[#94A3B8]">{department || employee?.department || 'Employee workspace'}</p>
          </div>

          <div className="relative mx-auto hidden max-w-xl flex-1 lg:block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="search"
              placeholder="Search services, documents, leave, payroll, people..."
              className="h-11 w-full rounded-[14px] border border-[#E5E7EB] bg-[#F5F8FC] pl-11 pr-16 text-[14px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#93C5FD] focus:ring-2 focus:ring-[#DBEAFE]"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-[#E5E7EB] bg-white px-2 py-0.5 text-[11px] font-medium text-[#94A3B8]">
              Ctrl /
            </span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/"
              className="hidden h-10 items-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-semibold text-[#475569] hover:bg-[#F5F8FC] sm:inline-flex"
            >
              <Building2 className="h-4 w-4" /> Enterprise Home
            </Link>
            <select
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value)}
              className="hidden h-10 rounded-[14px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-semibold text-[#475569] outline-none sm:block"
            >
              {['en-NG', 'fr-FR', 'ar', 'es-ES'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <NotificationCenter scope="notifications" essMode />
            <NotificationCenter scope="messages" essMode />
            <EnterpriseUserProfile
              context="ess"
              name={employee?.fullName}
              role={employee?.jobTitle || 'Employee Self-Service'}
              employeeCode={employee?.employeeCode || employee?.employeeId}
              department={employee?.department}
              photoUrl={employee?.photoUrl}
              hasPhoto={employee?.hasPhoto}
              profileHref="/workforce-portal?tab=profile"
              teamSize={managerMetrics?.teamSize}
              pendingApprovals={managerMetrics?.pendingApprovals}
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#E5E7EB] bg-white text-[#475569] hover:bg-[#F5F8FC] disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <div className="ess-no-print border-b border-[#E2E8F0] bg-white px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: 'System Status', value: 'All Systems Online', tone: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]' },
              { label: 'Last Sync', value: syncLabel, tone: 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]' },
              { label: 'Payroll Run', value: 'Complete', tone: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]' },
              { label: 'Attendance Devices', value: '18/18 Online', tone: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]' },
            ].map((chip) => (
              <span key={chip.label} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-semibold ${chip.tone}`}>
                <span className="text-[#64748B]">{chip.label}:</span>
                <span>{chip.value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col xl:flex-row">
          <main className="min-w-0 flex-1 px-3 py-2 sm:px-4">{children}</main>
          {rightPanel ? (
            <aside className="w-full shrink-0 border-t border-[#E2E8F0] bg-[#F5F7FB] px-3 py-2 xl:w-[360px] xl:border-l xl:border-t-0 xl:px-3">
              {rightPanel}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EssMobileNav({ tab, onTabChange }: { tab: EssTab; onTabChange: (tab: EssTab) => void }) {
  return (
    <div className="ess-no-print mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
      {ESS_NAV_ITEMS.slice(0, 8).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTabChange(item.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
            tab === item.id ? 'bg-[#2563EB] text-white' : 'bg-white text-[#475569] ring-1 ring-[#E5E7EB]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function EssProfilePanel({
  employee,
  employeeCode,
  onMenuClick,
}: {
  employee?: {
    fullName?: string;
    jobTitle?: string;
    salaryGrade?: string;
    location?: string;
    payrollGroup?: string;
    yearsOfService?: number;
    photoUrl?: string;
    hasPhoto?: boolean;
  };
  employeeCode?: string;
  onMenuClick?: () => void;
}) {
  const firstName = employee?.fullName?.split(' ').slice(-1)[0] || 'there';
  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border border-[#E5E7EB] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[12px] font-medium text-emerald-600">Online</span>
          </div>
          <button type="button" onClick={onMenuClick} aria-label="Options" className="text-[#94A3B8] hover:text-[#475569]">
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 flex flex-col items-center text-center">
          <div className="relative h-20 w-20 overflow-hidden rounded-full ring-4 ring-[#DBEAFE]">
            {employee?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={employee.photoUrl} alt={employee.fullName || 'Employee'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#2563EB] text-2xl font-bold text-white">
                {(employee?.fullName || 'E').charAt(0)}
              </div>
            )}
          </div>
          <p className="mt-3 text-[15px] font-bold uppercase leading-snug text-[#0F172A]">{employee?.fullName || 'Employee'}</p>
          <p className="mt-1 text-[13px] font-semibold text-[#2563EB]">{employeeCode || '—'}</p>
          <p className="mt-0.5 text-[13px] text-[#475569]">{employee?.jobTitle || '—'}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ['Grade', employee?.salaryGrade || '—'],
            ['Location', employee?.location || '—'],
            ['Payroll', employee?.payrollGroup || '—'],
            ['Service', `${employee?.yearsOfService || 0} years`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[14px] border border-[#E9EEF5] bg-[#F5F8FC] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">{label}</p>
              <p className="mt-1 truncate text-[13px] font-semibold text-[#0F172A]">{value}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-[12px] text-[#94A3B8] lg:hidden">Welcome back, {firstName} 👋</p>
    </div>
  );
}

export function EssSidebarFingerprint() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-white/50">
      <Fingerprint className="h-4 w-4" /> MFA enabled
    </div>
  );
}
