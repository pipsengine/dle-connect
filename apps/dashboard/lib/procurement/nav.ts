import {
  BriefcaseBusiness,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  Scale,
  Settings,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type ProcurementNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permissionKeys: string[];
};

export const PROCUREMENT_NAV: ProcurementNavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/procurement',
    icon: LayoutDashboard,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*', 'vendor.view'],
  },
  {
    id: 'purchase-requisitions',
    label: 'Purchase Requisitions',
    href: '/procurement/purchase-requisitions',
    icon: FileText,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*'],
  },
  {
    id: 'rfqs',
    label: 'RFQs',
    href: '/procurement/rfqs',
    icon: FileText,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*'],
  },
  {
    id: 'cbe',
    label: 'Competitive Bid Evaluations',
    href: '/procurement/cbe',
    icon: Scale,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*'],
  },
  {
    id: 'purchase-orders',
    label: 'Purchase Orders',
    href: '/procurement/purchase-orders',
    icon: ShoppingCart,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*'],
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    href: '/procurement/suppliers',
    icon: Users,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*', 'vendor.view', 'vendor.*'],
  },
  {
    id: 'contracts',
    label: 'Contracts',
    href: '/procurement/contracts',
    icon: BriefcaseBusiness,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*'],
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/procurement/reports',
    icon: FileBarChart2,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*', 'procurement.export'],
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/procurement/settings',
    icon: Settings,
    permissionKeys: ['view_procurement', 'procurement.view', 'procurement.*', 'procurement.edit'],
  },
];

export const PROCUREMENT_ACCENT = {
  primary: '#1458d8',
  primarySoft: '#edf4ff',
  ink: '#0d1b3d',
  muted: '#63708a',
} as const;
