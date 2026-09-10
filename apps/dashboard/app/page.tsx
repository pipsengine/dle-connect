import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart4,
  Box,
  FileKey,
  Files,
  HelpCircle,
  LayoutDashboard,
  Scale,
  ShieldCheck,
  Target,
  UserRound,
  Users,
  Webhook,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { canAccessFullFinanceIntelligence } from '@/lib/access/finance-access';
import { canAccessFleetOperations } from '@/lib/access/fleet-access';
import { canAccessItSupportPortal } from '@/lib/access/it-support-access';
import { canAccessSecurityPortal } from '@/lib/access/security-access';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { hasAnyPermission } from '@/lib/auth/permission-match';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { WORKFORCE_PORTAL_ENABLED } from '@/lib/workforce-portal-availability';

const getSessionPermissions = async () => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return { permissions: [] as string[], name: 'Signed-in user', session: null, isGlobalAdmin: false };
  const permissions = await effectivePermissionsForUser(session.sub, session.roles).catch(() => session.permissions);
  return {
    permissions,
    name: session.fullName || session.username,
    session: { ...session, permissions },
    isGlobalAdmin: Boolean(session.isGlobalAdmin),
  };
};

const workspaceModules = [
  {
    id: 'hris',
    title: 'HR Management',
    href: '/hris',
    icon: Users,
    status: 'Live',
    signal: 'Employee records, HR workflows, attendance, leave, and organization controls',
    permissions: ['page.hris.management.view', 'hris.view', 'employees.view', 'leave.view', 'attendance.view', 'recruitment.view', 'onboarding.view'],
  },
  {
    id: 'workforce-portal',
    title: 'Workforce Portal',
    href: '/workforce-portal',
    icon: UserRound,
    status: 'Live',
    signal: 'Personal profile, leave, time, payslips, documents, and employee services',
    permissions: ['page.workforce.portal.view', 'ess.view', 'profile.view'],
  },
  {
    id: 'payroll',
    title: 'Payroll Management',
    href: '/hris/payroll-management',
    icon: Banknote,
    status: 'Live',
    signal: 'Payroll setup, processing, approval, payslips, tax, and deductions',
    permissions: ['page.payroll.management.view', 'payroll.view', 'payroll.create', 'payroll.edit', 'payroll.approve'],
  },
  {
    id: 'operations',
    title: 'Operations Center',
    href: '/operations-center',
    icon: Box,
    status: 'Live',
    signal: 'Workforce execution, labor allocation, reports, and production tracking',
    permissions: ['page.operations.center.view', 'operations.view', 'operations.dashboard.view', 'operations.allocation.view', 'operations.production.view'],
  },
  {
    id: 'finance',
    title: 'Finance Intelligence & Approvals',
    href: '/finance',
    icon: Banknote,
    status: 'Live',
    signal: 'Financial reporting, analytics, AI insights and payment approvals with Sage X3',
    permissions: ['finance.view', 'view_finance_intelligence', 'view_finance_accounting', 'budget.view', 'treasury.view'],
  },
  {
    id: 'procurement',
    title: 'Procurement',
    href: '/procurement',
    icon: Webhook,
    status: 'Live',
    signal: 'Vendor, sourcing, CBE, procurement requests, and approvals',
    permissions: ['procurement.view', 'view_procurement', 'vendor.view'],
  },
  {
    id: 'projects',
    title: 'Projects & Engineering',
    href: '/projects-engineering',
    icon: Target,
    status: 'Ready',
    signal: 'Project delivery, planning, engineering, and cost controls',
    permissions: ['project.view', 'planning.view', 'cost.view', 'view_projects_engineering'],
  },
  {
    id: 'eam',
    title: 'EAM / CMMS',
    href: '/eam-cmms',
    icon: FileKey,
    status: 'Ready',
    signal: 'Asset reliability, maintenance planning, and work orders',
    permissions: ['asset.view', 'maintenance.view', 'view_eam_cmms'],
  },
  {
    id: 'hse',
    title: 'HSE Management',
    href: '/hse-management',
    icon: ShieldCheck,
    status: 'Ready',
    signal: 'Safety compliance, incidents, investigation, and corrective controls',
    permissions: ['hse.view', 'incident.view', 'compliance.view', 'view_hse_management'],
  },
  {
    id: 'quality',
    title: 'Quality Management',
    href: '/quality-management',
    icon: Scale,
    status: 'Ready',
    signal: 'Inspection, NCR review, and corrective action workflows',
    permissions: ['quality.view', 'ncr.view', 'corrective-action.view', 'view_quality_management'],
  },
  {
    id: 'documents',
    title: 'Document Management',
    href: '/document-management',
    icon: Files,
    status: 'Ready',
    signal: 'Enterprise records, controlled documents, review, and approvals',
    permissions: ['documents.view', 'view_document_management'],
  },
  {
    id: 'logistics',
    title: 'Logistics & Fleet',
    href: '/logistics-fleet',
    icon: Box,
    status: 'Live',
    signal: 'Fleet portal for vehicles, drivers, trips, fuel, maintenance, and compliance',
    permissions: ['view_logistics_fleet', 'fleet.view', 'logistics.view', 'driver.view'],
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    href: '/reports-analytics',
    icon: BarChart4,
    status: 'Ready',
    signal: 'Reports, exports, dashboards, and business intelligence',
    permissions: ['reports.view', 'reports.export', 'view_reports_analytics'],
  },
  {
    id: 'it-support',
    title: 'IT & Support',
    href: '/it-support',
    icon: HelpCircle,
    status: 'Live',
    signal: 'IT Service & Operations portal — recovery, assets, service desk, and monitoring',
    permissions: ['it.view', 'infrastructure.view', 'application-support.view', 'service-desk.view', 'view_it_support', 'view_it_assets'],
  },
  {
    id: 'security',
    title: 'Security',
    href: '/security',
    icon: ShieldCheck,
    status: 'Live',
    signal: 'Security portal for visitor management, reception, approvals, and site control',
    permissions: ['view_security', 'security.view', 'security.visitor.view', 'visitor.view'],
  },
] as const;

export default async function Home() {
  const { permissions, name, isGlobalAdmin } = await getSessionPermissions();

  const visibleModules = workspaceModules.filter((module) => {
    if (module.href === '/workforce-portal' && !WORKFORCE_PORTAL_ENABLED) return false;

    if (module.id === 'finance') {
      return canAccessFullFinanceIntelligence(permissions, isGlobalAdmin);
    }
    if (module.id === 'logistics') {
      return canAccessFleetOperations(permissions, isGlobalAdmin);
    }
    if (module.id === 'security') {
      return canAccessSecurityPortal(permissions, isGlobalAdmin);
    }
    if (module.id === 'it-support') {
      return canAccessItSupportPortal(permissions, isGlobalAdmin);
    }

    // Never treat empty permission lists as allow-all.
    if (!module.permissions.length) return false;
    return hasAnyPermission(permissions, [...module.permissions]);
  });

  // Prefer ESS as primary for self-service users; otherwise first entitled workspace.
  const primaryModule = visibleModules.find((module) => module.id === 'workforce-portal')
    || visibleModules[0];

  const enterpriseKpis = [
    { label: 'My Workspaces', value: String(visibleModules.length), detail: 'Available from your published access' },
    { label: 'Primary Area', value: primaryModule?.title || 'None', detail: 'First available function for this user' },
    { label: 'Control Plane', value: 'Active', detail: 'Page, button, dropdown, and API permissions' },
    { label: 'Access Source', value: 'Published', detail: 'Resolved from Access Control Centre' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-dle-blue/20 bg-dle-blue/10 px-3 py-1 text-xs font-extrabold text-dle-blue">
                <LayoutDashboard className="h-4 w-4" />
                My Enterprise Dashboard
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">Welcome, {name}</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                This dashboard shows only the workspaces your role or published Access Control entitlements allow. Modules outside your access stay hidden.
              </p>
            </div>
            {primaryModule ? (
              <Link href={primaryModule.href} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-dle-blue px-4 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-dle-blue-deep">
                Open {primaryModule.title}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {enterpriseKpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{kpi.label}</div>
              <div className="mt-2 truncate text-2xl font-extrabold text-slate-950">{kpi.value}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">{kpi.detail}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_0.55fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-950">My Workspaces</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Function-specific pages available to your account.</p>
              </div>
              <BadgeCheck className="h-5 w-5 text-dle-green" />
            </div>
            {visibleModules.length ? (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleModules.map((module) => (
                  <Link key={module.title} href={module.href} className="group rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-dle-blue/40 hover:bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-dle-blue ring-1 ring-slate-200">
                          <module.icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-extrabold text-slate-900 group-hover:text-dle-blue">{module.title}</div>
                          <div className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{module.signal}</div>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${module.status === 'Live' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {module.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                No workspace has been published for this account yet. Ask an administrator to assign page access in the Access Control Centre.
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div>
                  <h2 className="text-base font-extrabold text-slate-950">Access Notice</h2>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    Human Resources, Payroll, Operations, and ESS are separated by published page permissions. Employees only see workspaces they are entitled to.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-950">Control Coverage</h2>
              <div className="mt-4 space-y-3">
                {['Page access', 'Button access', 'Dropdown access', 'API action enforcement'].map((item) => (
                  <div key={item} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-xs font-extrabold text-slate-700">{item}</span>
                    <span className="rounded-full bg-dle-blue/10 px-2 py-0.5 text-[10px] font-extrabold text-dle-blue">Ready</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
