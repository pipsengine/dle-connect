'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ClipboardList,
  GitBranch,
  Headphones,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  Settings,
  Shield,
  Ticket,
  Workflow,
  Wrench,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';

const sections = [
  { id: 'dashboard', label: 'Dashboard', href: '/it-support/service-desk-itsm/dashboard', icon: LayoutDashboard },
  { id: 'tickets', label: 'Tickets', href: '/it-support/service-desk-itsm/tickets', icon: Ticket },
  { id: 'incidents', label: 'Incidents', href: '/it-support/service-desk-itsm/incidents', icon: AlertTriangle },
  { id: 'service-requests', label: 'Requests', href: '/it-support/service-desk-itsm/service-requests', icon: ClipboardList },
  { id: 'problems', label: 'Problems', href: '/it-support/service-desk-itsm/problems', icon: Wrench },
  { id: 'slas', label: 'SLAs', href: '/it-support/service-desk-itsm/slas', icon: Shield },
  { id: 'changes', label: 'Changes', href: '/it-support/service-desk-itsm/changes', icon: GitBranch },
  { id: 'automation', label: 'Automation', href: '/it-support/service-desk-itsm/automation', icon: Workflow },
  { id: 'reports', label: 'Reports', href: '/it-support/service-desk-itsm/reports', icon: RefreshCw },
  { id: 'customer-feedback', label: 'Feedback', href: '/it-support/service-desk-itsm/customer-feedback', icon: MessageSquare },
  { id: 'settings', label: 'Settings', href: '/it-support/service-desk-itsm/settings', icon: Settings },
] as const;

const ticketLinks = [
  { label: 'All Tickets', href: '/it-support/service-desk-itsm/tickets/all-tickets' },
  { label: 'My Tickets', href: '/it-support/service-desk-itsm/tickets/my-tickets' },
  { label: 'Assignments', href: '/it-support/service-desk-itsm/tickets/ticket-assignments' },
  { label: 'Templates', href: '/it-support/service-desk-itsm/tickets/ticket-templates' },
  { label: 'Open', href: '/it-support/service-desk-itsm/tickets/open-tickets' },
  { label: 'In Progress', href: '/it-support/service-desk-itsm/tickets/in-progress' },
  { label: 'Pending', href: '/it-support/service-desk-itsm/tickets/pending-tickets' },
  { label: 'Overdue', href: '/it-support/service-desk-itsm/tickets/overdue' },
  { label: 'Resolved', href: '/it-support/service-desk-itsm/tickets/resolved' },
  { label: 'Closed', href: '/it-support/service-desk-itsm/tickets/closed' },
  { label: 'Reopened', href: '/it-support/service-desk-itsm/tickets/reopened' },
  { label: 'Archived', href: '/it-support/service-desk-itsm/tickets/archived' },
];

const incidentLinks = [
  { label: 'Active', href: '/it-support/service-desk-itsm/incidents/active-incidents' },
  { label: 'Major', href: '/it-support/service-desk-itsm/incidents/major-incidents' },
  { label: 'Timeline', href: '/it-support/service-desk-itsm/incidents/incident-timeline' },
  { label: 'Reports', href: '/it-support/service-desk-itsm/incidents/incident-reports' },
  { label: 'RCA', href: '/it-support/service-desk-itsm/incidents/rca' },
];

const requestLinks = [
  { label: 'All Requests', href: '/it-support/service-desk-itsm/service-requests/all-requests' },
  { label: 'New Request', href: '/it-support/service-desk-itsm/service-requests/new-requests' },
  { label: 'Approved', href: '/it-support/service-desk-itsm/service-requests/approved' },
  { label: 'Rejected', href: '/it-support/service-desk-itsm/service-requests/rejected' },
  { label: 'Fulfilled', href: '/it-support/service-desk-itsm/service-requests/fulfilled' },
  { label: 'Cancelled', href: '/it-support/service-desk-itsm/service-requests/cancelled' },
  { label: 'Templates', href: '/it-support/service-desk-itsm/service-requests/templates' },
];

const problemLinks = [
  { label: 'Active Problems', href: '/it-support/service-desk-itsm/problems/active-problems' },
  { label: 'Known Errors', href: '/it-support/service-desk-itsm/problems/known-errors' },
  { label: 'Workarounds', href: '/it-support/service-desk-itsm/problems/workarounds' },
  { label: 'RCA', href: '/it-support/service-desk-itsm/problems/root-cause-analysis' },
  { label: 'Reports', href: '/it-support/service-desk-itsm/problems/reports' },
];

const slaLinks = [
  { label: 'Policies', href: '/it-support/service-desk-itsm/slas/sla-policies' },
  { label: 'Monitoring', href: '/it-support/service-desk-itsm/slas/sla-monitoring' },
  { label: 'Breaches', href: '/it-support/service-desk-itsm/slas/sla-breaches' },
  { label: 'Escalations', href: '/it-support/service-desk-itsm/slas/escalations' },
  { label: 'Reports', href: '/it-support/service-desk-itsm/slas/reports' },
];

const changeLinks = [
  { label: 'Standard', href: '/it-support/service-desk-itsm/changes/standard-changes' },
  { label: 'Normal', href: '/it-support/service-desk-itsm/changes/normal-changes' },
  { label: 'Emergency', href: '/it-support/service-desk-itsm/changes/emergency-changes' },
  { label: 'CAB', href: '/it-support/service-desk-itsm/changes/cab-approvals' },
  { label: 'Calendar', href: '/it-support/service-desk-itsm/changes/change-calendar' },
  { label: 'Rollback', href: '/it-support/service-desk-itsm/changes/rollback-plans' },
];

const settingsLinks = [
  { label: 'Categories', href: '/it-support/service-desk-itsm/settings/categories' },
  { label: 'Priorities', href: '/it-support/service-desk-itsm/settings/priorities' },
  { label: 'Statuses', href: '/it-support/service-desk-itsm/settings/statuses' },
  { label: 'Queues', href: '/it-support/service-desk-itsm/settings/queues' },
  { label: 'Business Hours', href: '/it-support/service-desk-itsm/settings/business-hours' },
  { label: 'Holidays', href: '/it-support/service-desk-itsm/settings/holidays' },
  { label: 'Email Templates', href: '/it-support/service-desk-itsm/settings/email-templates' },
];

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

function SubNav({ pathname, links }: { pathname: string; links: Array<{ label: string; href: string }> }) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${pathname === link.href ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function ServiceDeskItsmShell({ title, description, children }: Props) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <PageTemplate
      title={title}
      description={description || 'Incident, request, and change management with SLA ownership on DLE_Enterprise.'}
      breadcrumbs={[
        { label: 'IT & Support', href: '/it-support' },
        { label: 'Service Desk (ITSM)', href: '/it-support/service-desk-itsm' },
        ...(title !== 'Service Desk (ITSM)' && title !== 'Dashboard' ? [{ label: title }] : []),
      ]}
    >
      <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        {sections.map((section) => {
          const Icon = section.icon;
          const selected = active(section.href);
          return (
            <Link
              key={section.id}
              href={section.href}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-black transition-colors ${selected ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </Link>
          );
        })}
      </nav>

      {pathname.startsWith('/it-support/service-desk-itsm/tickets') ? <SubNav pathname={pathname} links={ticketLinks} /> : null}
      {pathname.startsWith('/it-support/service-desk-itsm/incidents') ? <SubNav pathname={pathname} links={incidentLinks} /> : null}
      {pathname.startsWith('/it-support/service-desk-itsm/service-requests') ? <SubNav pathname={pathname} links={requestLinks} /> : null}
      {pathname.startsWith('/it-support/service-desk-itsm/problems') ? <SubNav pathname={pathname} links={problemLinks} /> : null}
      {pathname.startsWith('/it-support/service-desk-itsm/slas') ? <SubNav pathname={pathname} links={slaLinks} /> : null}
      {pathname.startsWith('/it-support/service-desk-itsm/changes') ? <SubNav pathname={pathname} links={changeLinks} /> : null}
      {pathname.startsWith('/it-support/service-desk-itsm/settings') ? <SubNav pathname={pathname} links={settingsLinks} /> : null}

      {children}

      <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-400">
        <Headphones className="h-4 w-4 text-slate-400" />
        <span>
          Persisted in DLE_Enterprise <span className="font-mono text-slate-500">[it].[Itsm*]</span>. Permissions:{' '}
          <span className="font-mono text-slate-500">service-desk.view · create · edit</span>
        </span>
      </div>
    </PageTemplate>
  );
}
