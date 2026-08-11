import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  Headphones,
  KeyRound,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  Shield,
} from 'lucide-react';

export type ItSupportBadgeTone = 'blue' | 'amber' | 'red' | 'green' | 'grey';

export type ItSupportNavLeaf = {
  id: string;
  label: string;
  href: string;
  status?: 'live' | 'ready';
  permissionKeys?: string[];
};

export type ItSupportNavSection = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  status?: 'live' | 'ready';
  permissionKeys?: string[];
  children: ItSupportNavLeaf[];
};

export const IT_SUPPORT_MODULE = {
  id: 'it-support',
  shortName: 'IT & Support',
  name: 'IT Service & Operations Portal',
  homeHref: '/it-support',
  description:
    'Service desk, account recovery, asset lifecycle, knowledge, cybersecurity, and system health in one controlled workspace.',
} as const;

/** Portal sidebar — L1 sections with L2 children. */
export const IT_SUPPORT_NAV_SECTIONS: ItSupportNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/it-support',
    icon: LayoutDashboard,
    status: 'live',
    permissionKeys: ['view_it_support', 'it.view', 'it.*'],
    children: [
      { id: 'command-centre', label: 'Command Centre', href: '/it-support', status: 'live', permissionKeys: ['view_it_support', 'it.view', 'it.*'] },
    ],
  },
  {
    id: 'service-operations',
    label: 'Service Operations',
    href: '/it-support/service-desk-itsm',
    icon: Headphones,
    status: 'ready',
    permissionKeys: ['view_itsm', 'service-desk.view', 'view_it_support', 'it.view', 'it.*'],
    children: [
      {
        id: 'service-desk',
        label: 'Service Desk (ITSM)',
        href: '/it-support/service-desk-itsm',
        status: 'ready',
        permissionKeys: ['view_itsm', 'service-desk.view', 'view_it_support', 'it.view', 'it.*'],
      },
      {
        id: 'account-recovery',
        label: 'Account Recovery',
        href: '/it-support/account-recovery',
        status: 'live',
        permissionKeys: [
          'it.account-recovery.view',
          'it.account-recovery.edit',
          'page.it-support.account-recovery.view',
          'admin.users.edit',
          'admin.users.view',
          'security.*',
          'view_it_support',
          'it.*',
        ],
      },
      {
        id: 'knowledge-base',
        label: 'Knowledge Base',
        href: '/it-support/knowledge-base',
        status: 'ready',
        permissionKeys: ['view_knowledge_base', 'view_it_support', 'it.view', 'it.*'],
      },
    ],
  },
  {
    id: 'asset-lifecycle',
    label: 'Asset Lifecycle',
    href: '/it-support/asset-management',
    icon: Package,
    status: 'live',
    permissionKeys: [
      'view_it_assets',
      'view_it_support',
      'it.view',
      'it.assets.view',
      'it.assets.*',
      'page.it-support.asset-management.view',
    ],
    children: [
      {
        id: 'asset-management',
        label: 'Asset Management',
        href: '/it-support/asset-management',
        status: 'live',
        permissionKeys: [
          'view_it_assets',
          'view_it_support',
          'it.view',
          'it.assets.view',
          'it.assets.*',
          'page.it-support.asset-management.view',
        ],
      },
      {
        id: 'hardware',
        label: 'Hardware Inventory',
        href: '/it-support/asset-management/hardware',
        status: 'live',
        permissionKeys: [
          'view_it_assets',
          'view_it_support',
          'it.view',
          'it.assets.view',
          'it.assets.*',
          'page.it-support.asset-management.view',
        ],
      },
      {
        id: 'software',
        label: 'Software & Licenses',
        href: '/it-support/asset-management/software',
        status: 'live',
        permissionKeys: [
          'view_it_assets',
          'view_it_support',
          'it.view',
          'it.assets.view',
          'it.assets.*',
          'page.it-support.asset-management.view',
        ],
      },
      {
        id: 'assignment',
        label: 'Assignments',
        href: '/it-support/asset-management/asset-assignment',
        status: 'live',
        permissionKeys: [
          'view_it_assets',
          'view_it_support',
          'it.view',
          'it.assets.view',
          'it.assets.*',
          'page.it-support.asset-management.view',
        ],
      },
    ],
  },
  {
    id: 'security-ops',
    label: 'Security & Operations',
    href: '/it-support/cybersecurity-center',
    icon: Shield,
    status: 'ready',
    permissionKeys: ['view_cybersecurity', 'view_system_monitoring', 'infrastructure.view', 'view_it_support', 'it.view', 'it.*'],
    children: [
      {
        id: 'cybersecurity',
        label: 'Cybersecurity Center',
        href: '/it-support/cybersecurity-center',
        status: 'ready',
        permissionKeys: ['view_cybersecurity', 'view_it_support', 'it.view', 'it.*'],
      },
      {
        id: 'system-monitoring',
        label: 'System Monitoring',
        href: '/it-support/system-monitoring',
        status: 'ready',
        permissionKeys: ['view_system_monitoring', 'infrastructure.view', 'view_it_support', 'it.view', 'it.*'],
      },
    ],
  },
];

export const IT_SUPPORT_MODULE_CARDS = [
  {
    id: 'service-desk',
    title: 'Service Desk (ITSM)',
    description: 'Incident, request, and change workflows with SLA tracking.',
    href: '/it-support/service-desk-itsm',
    icon: Headphones,
    status: 'ready' as const,
    permissionKeys: ['view_itsm', 'service-desk.view', 'view_it_support', 'it.view', 'it.*'],
  },
  {
    id: 'account-recovery',
    title: 'Account Recovery',
    description: 'Unlock accounts, reset credentials, and clear first-login flags.',
    href: '/it-support/account-recovery',
    icon: KeyRound,
    status: 'live' as const,
    permissionKeys: [
      'it.account-recovery.view',
      'it.account-recovery.edit',
      'page.it-support.account-recovery.view',
      'admin.users.edit',
      'admin.users.view',
      'security.*',
      'view_it_support',
      'it.*',
    ],
  },
  {
    id: 'knowledge-base',
    title: 'Knowledge Base',
    description: 'Curated runbooks, FAQs, and support articles for the enterprise.',
    href: '/it-support/knowledge-base',
    icon: BookOpen,
    status: 'ready' as const,
    permissionKeys: ['view_knowledge_base', 'view_it_support', 'it.view', 'it.*'],
  },
  {
    id: 'asset-management',
    title: 'Asset Management',
    description: 'Hardware, software, assignment, maintenance, and procurement lifecycle.',
    href: '/it-support/asset-management',
    icon: Package,
    status: 'live' as const,
    permissionKeys: [
      'view_it_assets',
      'view_it_support',
      'it.view',
      'it.assets.view',
      'it.assets.*',
      'page.it-support.asset-management.view',
    ],
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity Center',
    description: 'Threat posture, controls monitoring, and security response playbooks.',
    href: '/it-support/cybersecurity-center',
    icon: Shield,
    status: 'ready' as const,
    permissionKeys: ['view_cybersecurity', 'view_it_support', 'it.view', 'it.*'],
  },
  {
    id: 'system-monitoring',
    title: 'System Monitoring',
    description: 'Platform health, uptime signals, and infrastructure observability.',
    href: '/it-support/system-monitoring',
    icon: Activity,
    status: 'ready' as const,
    permissionKeys: ['view_system_monitoring', 'infrastructure.view', 'view_it_support', 'it.view', 'it.*'],
  },
] as const;

export const IT_SUPPORT_ACCENT = {
  primary: '#0F766E',
  primarySoft: '#CCFBF1',
  primaryHover: '#0D9488',
  ink: '#0F172A',
  muted: '#64748B',
} as const;

/** Used by shell header chips / footer. */
export const IT_SUPPORT_CAPABILITY_HINT = 'it.view · service-desk · assets · recovery';

export type ItSupportModuleCard = (typeof IT_SUPPORT_MODULE_CARDS)[number];

export const resolveItSupportNavIcon = (id: string): LucideIcon => {
  switch (id) {
    case 'overview':
      return LayoutDashboard;
    case 'service-operations':
      return Headphones;
    case 'asset-lifecycle':
      return Package;
    case 'security-ops':
      return Shield;
    case 'service-desk':
      return Headphones;
    case 'account-recovery':
      return KeyRound;
    case 'knowledge-base':
      return BookOpen;
    case 'asset-management':
    case 'hardware':
    case 'software':
    case 'assignment':
      return MonitorSmartphone;
    case 'cybersecurity':
      return Shield;
    case 'system-monitoring':
      return Activity;
    default:
      return LayoutDashboard;
  }
};
