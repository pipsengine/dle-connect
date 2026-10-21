import type { LucideIcon } from 'lucide-react';
import { Inbox, LayoutDashboard, Mail, PlusCircle } from 'lucide-react';

export const CORPORATE_OFFICE_MODULE = {
  id: 'corporate-office',
  shortName: 'Corporate Office',
  name: 'Corporate Office Portal',
  homeHref: '/corporate-office',
  description: 'Corporate office workspace for front-desk correspondence, routing, and handover records.',
} as const;

export type CorporateOfficeNavLeaf = {
  id: string;
  label: string;
  href: string;
  permissionKeys?: string[];
};

export type CorporateOfficeNavSection = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permissionKeys?: string[];
  children: CorporateOfficeNavLeaf[];
};

const OFFICE_PERMS = [
  'view_corporate_office',
  'corporate.view',
  'corporate.*',
  'corporate.front-desk.view',
  'corporate.front-desk.*',
  'page.corporate-office.view',
  'page.corporate-office.front-desk.view',
] as const;

const OFFICE_OR_PARTICIPANT = [...OFFICE_PERMS, 'corporate.front-desk.participant'] as const;

export const CORPORATE_OFFICE_NAV_SECTIONS: CorporateOfficeNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/corporate-office',
    icon: LayoutDashboard,
    permissionKeys: [...OFFICE_OR_PARTICIPANT],
    children: [],
  },
  {
    id: 'front-desk',
    label: 'Front Desk',
    href: '/corporate-office/front-desk',
    icon: Mail,
    permissionKeys: [...OFFICE_OR_PARTICIPANT],
    children: [
      { id: 'register', label: 'Correspondence Register', href: '/corporate-office/front-desk', permissionKeys: [...OFFICE_OR_PARTICIPANT] },
      { id: 'log', label: 'Log Correspondence', href: '/corporate-office?log=1', permissionKeys: [...OFFICE_PERMS] },
    ],
  },
];

export const CORPORATE_OFFICE_MODULE_CARDS = [
  {
    id: 'front-desk-register',
    title: 'Correspondence Register',
    description: 'Search, route, close, and export letters and documents received at the front desk.',
    href: '/corporate-office/front-desk',
    icon: Inbox,
    permissionKeys: [...OFFICE_PERMS],
  },
  {
    id: 'front-desk-log',
    title: 'Log Correspondence',
    description: 'Record an incoming letter or document and attach the scanned file.',
    href: '/corporate-office/front-desk/new',
    icon: PlusCircle,
    permissionKeys: [...OFFICE_PERMS],
  },
];
