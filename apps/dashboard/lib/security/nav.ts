import type { LucideIcon } from 'lucide-react';
import {
  ClipboardCheck,
  ClipboardList,
  IdCard,
  LayoutDashboard,
  LogIn,
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
  UserRoundCheck,
  FileBarChart,
} from 'lucide-react';

export const SECURITY_MODULE = {
  id: 'security',
  shortName: 'Security',
  name: 'Security Operations Portal',
  homeHref: '/security',
  description:
    'Visitor management, reception control, host approvals, badges, and site security operations in one workspace.',
} as const;

export type SecurityNavLeaf = {
  id: string;
  label: string;
  href: string;
  status?: 'live' | 'ready';
  permissionKeys?: string[];
};

export type SecurityNavSection = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  status?: 'live' | 'ready';
  permissionKeys?: string[];
  children: SecurityNavLeaf[];
};

const VISITOR_PERMS = [
  'view_security',
  'security.view',
  'security.visitor.view',
  'visitor.view',
  'visitor.*',
  'security.*',
] as const;

export const SECURITY_NAV_SECTIONS: SecurityNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/security',
    icon: LayoutDashboard,
    status: 'live',
    permissionKeys: [...VISITOR_PERMS],
    children: [
      { id: 'command-centre', label: 'Command Centre', href: '/security', status: 'live', permissionKeys: [...VISITOR_PERMS] },
    ],
  },
  {
    id: 'visitor-operations',
    label: 'Visitor Operations',
    href: '/security/visitor-management/dashboard',
    icon: Users,
    status: 'live',
    permissionKeys: [...VISITOR_PERMS],
    children: [
      { id: 'vm-dashboard', label: 'Visitor Dashboard', href: '/security/visitor-management/dashboard', status: 'live', permissionKeys: [...VISITOR_PERMS] },
      { id: 'vm-registration', label: 'Visitor Registration', href: '/security/visitor-management/visitor-registration', status: 'live', permissionKeys: [...VISITOR_PERMS] },
      { id: 'vm-checkin', label: 'Check-In / Check-Out', href: '/security/visitor-management/check-in-out', status: 'live', permissionKeys: [...VISITOR_PERMS] },
      { id: 'vm-records', label: 'Visitor Records', href: '/security/visitor-management/visitor-records', status: 'live', permissionKeys: [...VISITOR_PERMS] },
    ],
  },
  {
    id: 'reception-hosts',
    label: 'Reception & Hosts',
    href: '/security/visitor-management/receptionist-dashboard',
    icon: UserRoundCheck,
    status: 'live',
    permissionKeys: [...VISITOR_PERMS],
    children: [
      { id: 'receptionist', label: 'Receptionist Dashboard', href: '/security/visitor-management/receptionist-dashboard', status: 'live', permissionKeys: [...VISITOR_PERMS] },
      { id: 'requester', label: 'Requester Dashboard', href: '/security/visitor-management/requester-dashboard', status: 'live', permissionKeys: [...VISITOR_PERMS] },
    ],
  },
  {
    id: 'security-control',
    label: 'Security Control',
    href: '/security/visitor-management/security-dashboard',
    icon: ShieldCheck,
    status: 'live',
    permissionKeys: [...VISITOR_PERMS],
    children: [
      { id: 'security-dashboard', label: 'Security Dashboard', href: '/security/visitor-management/security-dashboard', status: 'live', permissionKeys: [...VISITOR_PERMS] },
      { id: 'approvals', label: 'Approvals', href: '/security/visitor-management/approvals', status: 'live', permissionKeys: [...VISITOR_PERMS] },
      { id: 'badges', label: 'Badge Management', href: '/security/visitor-management/badge-management', status: 'live', permissionKeys: [...VISITOR_PERMS] },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    href: '/security/visitor-management/reports',
    icon: FileBarChart,
    status: 'live',
    permissionKeys: [...VISITOR_PERMS],
    children: [
      { id: 'reports', label: 'Reports', href: '/security/visitor-management/reports', status: 'live', permissionKeys: [...VISITOR_PERMS] },
    ],
  },
];

export const SECURITY_MODULE_CARDS = [
  {
    id: 'visitor-dashboard',
    title: 'Visitor Dashboard',
    description: 'Live arrivals, occupancy, approvals, and reception activity.',
    href: '/security/visitor-management/dashboard',
    icon: LayoutDashboard,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
  {
    id: 'visitor-registration',
    title: 'Visitor Registration',
    description: 'Register guests, vendors, contractors, and walk-ins.',
    href: '/security/visitor-management/visitor-registration',
    icon: UserPlus,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
  {
    id: 'check-in-out',
    title: 'Check-In / Check-Out',
    description: 'Scan, verify identity, issue badges, and close visits.',
    href: '/security/visitor-management/check-in-out',
    icon: LogIn,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
  {
    id: 'approvals',
    title: 'Approvals',
    description: 'Host and security approval queues for expected visitors.',
    href: '/security/visitor-management/approvals',
    icon: ClipboardCheck,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
  {
    id: 'badge-management',
    title: 'Badge Management',
    description: 'Print, track, and revoke visitor badges.',
    href: '/security/visitor-management/badge-management',
    icon: IdCard,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
  {
    id: 'security-dashboard',
    title: 'Security Dashboard',
    description: 'Site security posture and visitor risk signals.',
    href: '/security/visitor-management/security-dashboard',
    icon: Shield,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
  {
    id: 'records',
    title: 'Visitor Records',
    description: 'Searchable historical visitor and visit records.',
    href: '/security/visitor-management/visitor-records',
    icon: ClipboardList,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
  {
    id: 'reports',
    title: 'Reports',
    description: 'Occupancy, throughput, and compliance reporting.',
    href: '/security/visitor-management/reports',
    icon: FileBarChart,
    status: 'live' as const,
    permissionKeys: [...VISITOR_PERMS],
  },
] as const;

export type SecurityModuleCard = (typeof SECURITY_MODULE_CARDS)[number];
