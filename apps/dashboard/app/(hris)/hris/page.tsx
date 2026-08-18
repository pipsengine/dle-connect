import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  CalendarCheck,
  Clock3,
  Gift,
  FileText,
  Link2,
  Search,
  ShieldCheck,
  Target,
  UserCircle2,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { WORKFORCE_PORTAL_ENABLED } from '@/lib/workforce-portal-availability';

const quickLinks = [
  { title: 'Executive HR Dashboard', href: '/hris/dashboard/executive-hr-dashboard', icon: BarChart3, detail: 'Strategic workforce metrics and HR risk signals', permissions: ['dashboard.view', 'hris.view'], tone: 'blue' },
  { title: 'HR Operations Dashboard', href: '/hris/dashboard/hr-operations-dashboard', icon: ShieldCheck, detail: 'Operational workload, compliance, attendance and employee actions', permissions: ['hris.view', 'employees.view', 'attendance.view'], tone: 'blue' },
  { title: 'Employee Directory', href: '/hris/employees/employee-directory', icon: Search, detail: 'Search employee records, departments, locations and job details', permissions: ['employees.view', 'employees.*'], tone: 'blue' },
  { title: 'Employee Profile', href: '/hris/employees/employee-profile', icon: UserRound, detail: 'Personal, job, contact, document and payroll profile records', permissions: ['employees.view', 'profile.view'], tone: 'blue' },
  { title: 'Attendance Register', href: '/hris/attendance/attendance-register', icon: CalendarCheck, detail: 'Daily attendance, review status, payroll readiness and exceptions', permissions: ['attendance.view', 'attendance.*'], tone: 'green' },
  { title: 'Timesheet Entry', href: '/hris/time-and-logs/timesheet-entry', icon: Clock3, detail: 'Project time, overtime, employee self-service entries and approvals', permissions: ['timesheet.submit', 'timesheet.approve', 'timesheet.view'], tone: 'violet' },
  { title: 'Payroll Dashboard', href: '/hris/payroll/payroll-dashboard', icon: Banknote, detail: 'Payroll setup, processing, approvals, payslips, tax and deductions', permissions: ['payroll.view', 'payroll.*'], tone: 'green' },
  { title: 'Benefits Management', href: '/hris/benefits/overview', icon: Gift, detail: 'Medical, insurance, pension, welfare, enrollment, claims, and compliance', permissions: ['hris.view', 'payroll.view', 'employees.view'], tone: 'violet' },
  { title: 'Workforce Portal', href: '/workforce-portal', icon: UserCircle2, detail: 'Employee self-service dashboard, profile, leave, attendance, payroll and documents', permissions: ['ess.view', 'profile.view'], tone: 'orange' },
  { title: 'Documents', href: '/hris/employees/employee-documents', icon: FileText, detail: 'Employee documents, expiries, evidence and controlled records', permissions: ['documents.view', 'employees.view'], tone: 'blue' },
];

const statusCards = [
  { title: 'Fast Entry', detail: 'No live data wait on portal open', icon: Zap, tone: 'blue' },
  { title: 'RBAC Ready', detail: 'Access follows HRIS permissions', icon: ShieldCheck, tone: 'green' },
  { title: 'Integrated', detail: 'Payroll, attendance, documents, and workflows', icon: Link2, tone: 'violet' },
  { title: 'Operational', detail: 'Jump directly to the work area you need', icon: Target, tone: 'orange' },
];

const toneStyles = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  orange: 'bg-orange-50 text-orange-600 ring-orange-100',
} as const;

const can = (permissions: string[], required: string) => {
  if (permissions.includes('*') || permissions.includes(required)) return true;
  return permissions.includes(`${required.split('.')[0]}.*`);
};

const getPermissions = async () => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return [] as string[];
  return effectivePermissionsForUser(session.sub, session.roles).catch(() => session.permissions);
};

function HeroVisual() {
  return (
    <div className="relative hidden h-[190px] min-w-[440px] flex-1 overflow-hidden lg:block" aria-hidden="true">
      <div className="absolute right-10 top-6 h-32 w-56 rounded-xl border border-blue-100 bg-white/85 p-4 shadow-[0_24px_60px_rgba(37,99,235,0.18)] backdrop-blur">
        <div className="flex gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200">
            <UserRound className="h-8 w-8" />
          </div>
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-28 rounded-full bg-blue-100" />
            <div className="h-3 w-20 rounded-full bg-slate-100" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="h-5 rounded bg-blue-50" />
              <div className="h-5 rounded bg-blue-50" />
              <div className="h-5 rounded bg-blue-50" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute right-64 top-[58px] flex h-28 w-24 items-center justify-center rounded-xl bg-blue-500 text-white shadow-[0_20px_50px_rgba(37,99,235,0.22)]">
        <UserCircle2 className="h-12 w-12" />
      </div>
      <div className="absolute right-0 top-[72px] h-14 w-14 rounded-xl border border-blue-100 bg-white/80 shadow-lg" />
      <div className="absolute right-20 bottom-4 h-16 w-16 rounded-full bg-emerald-100" />
      <div className="absolute right-4 bottom-7 h-20 w-8 rounded-full bg-emerald-500/70" />
      <div className="absolute right-[310px] top-2 h-8 w-8 rounded-full bg-emerald-100 text-center text-xs font-black leading-8 text-emerald-600">x</div>
      <div className="absolute right-[260px] top-0 h-12 w-12 rounded-full bg-blue-200/70 shadow-lg" />
    </div>
  );
}

export default async function HRISHomePage() {
  const permissions = await getPermissions();
  const visibleQuickLinks = quickLinks.filter((item) => {
    if (item.href === '/workforce-portal' && !WORKFORCE_PORTAL_ENABLED) return false;
    return item.permissions.some((permission) => can(permissions, permission));
  });

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-1 pb-8 text-[#0F172A]">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(37,99,235,0.14),transparent_28%),linear-gradient(90deg,rgba(255,255,255,1)_0%,rgba(239,246,255,0.92)_100%)]" />
          <div className="relative flex min-h-[210px] flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-blue-700 ring-1 ring-blue-100">
                <Building2 className="h-4 w-4" />
                Human Resources Information System
              </div>
              <h1 className="mt-7 text-4xl font-black tracking-normal text-slate-950 md:text-[36px]">HRIS Portal</h1>
              <p className="mt-4 max-w-3xl text-[15px] font-semibold leading-7 text-slate-600">
                Fast access to HR dashboards, employee records, attendance, time logs, payroll, organization setup, and controlled HR workflows.
              </p>
            </div>
            <HeroVisual />
            <Link href="/" className="relative inline-flex h-12 items-center justify-center gap-3 rounded-xl border border-blue-200 bg-white/80 px-5 text-sm font-black text-blue-700 shadow-sm transition hover:border-blue-400 hover:bg-white">
              Enterprise Home
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {statusCards.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex min-h-[120px] items-center gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1 ${toneStyles[item.tone as keyof typeof toneStyles]}`}>
                  <Icon className="h-7 w-7" />
                </span>
                <div>
                  <h2 className="text-base font-black text-slate-950">{item.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.detail}</p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div>
            <h2 className="text-2xl font-black tracking-normal text-slate-950">Open HRIS Module</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">Choose a work area available to your published access.</p>
          </div>

          {visibleQuickLinks.length ? (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {visibleQuickLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex h-[180px] rounded-xl border border-slate-200 bg-white p-6 shadow-[0_6px_22px_rgba(15,23,42,0.045)] transition duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_16px_38px_rgba(37,99,235,0.12)]"
                  >
                    <div className="flex w-full items-start gap-5">
                      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1 ${toneStyles[item.tone as keyof typeof toneStyles]}`}>
                        <Icon className="h-7 w-7" />
                      </span>
                      <div className="flex min-h-full min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-lg font-black leading-6 text-slate-950 transition group-hover:text-blue-700">{item.title}</h3>
                          <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition duration-200 group-hover:translate-x-1 group-hover:text-blue-600" />
                        </div>
                        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{item.detail}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">
              No HRIS work area has been published for this account. Use Enterprise Home or ask an administrator to assign page access.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
