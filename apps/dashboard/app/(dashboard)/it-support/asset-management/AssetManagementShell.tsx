'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ClipboardList,
  Cpu,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { PageTemplate } from '@/components/layout/page-template';

const sections = [
  { id: 'dashboard', label: 'Dashboard', href: '/it-support/asset-management', icon: LayoutDashboard },
  { id: 'hardware', label: 'Hardware', href: '/it-support/asset-management/hardware', icon: Cpu },
  { id: 'software', label: 'Software', href: '/it-support/asset-management/software', icon: FileText },
  { id: 'assignment', label: 'Asset Assignment', href: '/it-support/asset-management/asset-assignment', icon: UserCheck },
  { id: 'maintenance', label: 'Maintenance', href: '/it-support/asset-management/maintenance', icon: Wrench },
  { id: 'vendors', label: 'Vendors', href: '/it-support/asset-management/vendors', icon: Boxes },
  { id: 'warranties', label: 'Warranties', href: '/it-support/asset-management/warranties', icon: ShieldCheck },
  { id: 'procurement', label: 'Procurement', href: '/it-support/asset-management/procurement', icon: ShoppingCart },
  { id: 'audit', label: 'Audit Log', href: '/it-support/asset-management/audit-log', icon: ClipboardList },
] as const;

const hardwareLinks = [
  { label: 'All Hardware', href: '/it-support/asset-management/hardware' },
  { label: 'Laptops', href: '/it-support/asset-management/hardware/laptops' },
  { label: 'Computers', href: '/it-support/asset-management/hardware/computers' },
  { label: 'Servers', href: '/it-support/asset-management/hardware/servers' },
  { label: 'Routers', href: '/it-support/asset-management/hardware/routers' },
  { label: 'Switches', href: '/it-support/asset-management/hardware/switches' },
  { label: 'Firewalls', href: '/it-support/asset-management/hardware/firewalls' },
  { label: 'Storage', href: '/it-support/asset-management/hardware/storage' },
  { label: 'Printers', href: '/it-support/asset-management/hardware/printers' },
  { label: 'Mobile Devices', href: '/it-support/asset-management/hardware/mobile-devices' },
  { label: 'Other Devices', href: '/it-support/asset-management/hardware/other-devices' },
];

const softwareLinks = [
  { label: 'Overview', href: '/it-support/asset-management/software' },
  { label: 'Licenses', href: '/it-support/asset-management/software/licenses' },
  { label: 'Software Catalog', href: '/it-support/asset-management/software/software-catalog' },
  { label: 'Installed Software', href: '/it-support/asset-management/software/installed-software' },
  { label: 'License Compliance', href: '/it-support/asset-management/software/license-compliance' },
  { label: 'Software Requests', href: '/it-support/asset-management/software/software-requests' },
];

type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function AssetManagementShell({ title, description, children }: Props) {
  const pathname = usePathname();
  const active = (href: string) => (href === '/it-support/asset-management' ? pathname === href : pathname.startsWith(href));

  return (
    <PageTemplate
      title={title}
      description={description || 'Enterprise module for managing IT assets, assignments, and lifecycle operations.'}
      breadcrumbs={[
        { label: 'IT & Support', href: '/it-support' },
        { label: 'Asset Management', href: '/it-support/asset-management' },
        ...(title !== 'Asset Management' ? [{ label: title }] : []),
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
              className={`flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-black transition-colors ${selected ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </Link>
          );
        })}
      </nav>

      {pathname.startsWith('/it-support/asset-management/hardware') ? (
        <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {hardwareLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${pathname === link.href ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {pathname.startsWith('/it-support/asset-management/software') ? (
        <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          {softwareLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${pathname === link.href ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-white/70'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {children}

      <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-400">
        <ClipboardList className="h-4 w-4 text-slate-400" />
        <span>
          Module access logged. Required Permissions: <span className="font-mono text-slate-500">view_it_assets</span>
        </span>
      </div>
    </PageTemplate>
  );
}
