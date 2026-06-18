import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart4,
  Box,
  Building2,
  Clock,
  FileKey,
  Files,
  HelpCircle,
  LayoutDashboard,
  Scale,
  ShieldCheck,
  Target,
  Users,
  Webhook,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';

export default function Home() {
  const modules = [
    { title: 'Human Resources', href: '/hris', icon: Users, status: 'Live', signal: 'HR management and workforce self-service' },
    { title: 'ERP', href: '/erp', icon: Building2, status: 'Ready', signal: 'Core operational transactions' },
    { title: 'Finance & Accounting', href: '/finance-accounting', icon: Banknote, status: 'Ready', signal: 'Financial controls and reporting' },
    { title: 'Procurement', href: '/procurement', icon: Webhook, status: 'Ready', signal: 'Vendor, sourcing and approvals' },
    { title: 'EAM / CMMS', href: '/eam-cmms', icon: FileKey, status: 'Ready', signal: 'Asset reliability and maintenance' },
    { title: 'Projects & Engineering', href: '/projects-engineering', icon: Target, status: 'Ready', signal: 'Project delivery and engineering controls' },
    { title: 'Quality Management', href: '/quality-management', icon: Scale, status: 'Ready', signal: 'Inspection, NCR and corrective actions' },
    { title: 'HSE Management', href: '/hse-management', icon: ShieldCheck, status: 'Ready', signal: 'Safety compliance and incident controls' },
    { title: 'Document Management', href: '/document-management', icon: Files, status: 'Ready', signal: 'Enterprise records and controlled documents' },
    { title: 'Reports & Analytics', href: '/reports-analytics', icon: BarChart4, status: 'Ready', signal: 'Cross-functional intelligence layer' },
    { title: 'Logistics & Fleet', href: '/logistics-fleet', icon: Clock, status: 'Ready', signal: 'Fleet usage and movement planning' },
    { title: 'Operations Center', href: '/operations-center', icon: Box, status: 'Live', signal: 'Workforce execution, labor allocation and production tracking' },
    { title: 'IT & Support', href: '/it-support', icon: HelpCircle, status: 'Ready', signal: 'Service desk and platform support' },
  ];

  const enterpriseKpis = [
    { label: 'Enterprise Modules', value: '13', detail: 'Core business capabilities tracked' },
    { label: 'Live Modules', value: 'HR + Operations', detail: 'Connected to DLE workforce and execution data' },
    { label: 'Control Plane', value: 'Active', detail: 'Navigation, RBAC and audit-ready shell' },
    { label: 'Data Sources', value: 'Staged', detail: 'Operational modules ready for integration' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-dle-blue/20 bg-dle-blue/10 px-3 py-1 text-xs font-extrabold text-dle-blue">
                <LayoutDashboard className="h-4 w-4" />
                Enterprise Command Dashboard
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">DLE Digital Enterprise Application</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                A cross-functional view of the entire enterprise platform. Human Resources is one module inside this landscape; finance, procurement, projects, assets, HSE, quality, documents, analytics and support remain separate enterprise workstreams.
              </p>
            </div>
            <Link href="/hris" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-dle-blue px-4 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-dle-blue-deep">
              Open HR Management
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {enterpriseKpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{kpi.label}</div>
              <div className="mt-2 text-2xl font-extrabold text-slate-950">{kpi.value}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">{kpi.detail}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_0.55fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-950">Enterprise Modules</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Separate business domains with independent dashboards and workflows.</p>
              </div>
              <BadgeCheck className="h-5 w-5 text-dle-green" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => (
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
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div>
                  <h2 className="text-base font-extrabold text-slate-950">Separation Notice</h2>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    `/` is the enterprise application dashboard. `/dashboard/executive-hr-dashboard` is the HRIS executive dashboard only.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-950">Integration Readiness</h2>
              <div className="mt-4 space-y-3">
                {['Identity and access control', 'Enterprise navigation', 'Module audit trail', 'Operational data connectors'].map((item) => (
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
