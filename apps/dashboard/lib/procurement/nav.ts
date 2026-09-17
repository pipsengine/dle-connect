import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  FileSearch,
  FileText,
  FolderOpen,
  LayoutDashboard,
  PackageCheck,
  Scale,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type ProcurementNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permissionKeys: string[];
};

const view = ['view_procurement', 'procurement.view', 'procurement.*'] as const;
const vendor = [...view, 'vendor.view', 'vendor.*'] as const;

export const PROCUREMENT_NAV: ProcurementNavItem[] = [
  { id: 'dashboard', label: 'Procurement Command Centre', href: '/procurement', icon: LayoutDashboard, permissionKeys: [...view, 'vendor.view'] },
  { id: 'plans', label: 'Procurement Planning', href: '/procurement/plans', icon: ClipboardList, permissionKeys: [...view] },
  { id: 'purchase-requisitions', label: 'Purchase Requisitions', href: '/procurement/purchase-requisitions', icon: FileText, permissionKeys: [...view] },
  { id: 'sourcing', label: 'Sourcing & RFx', href: '/procurement/sourcing', icon: FileSearch, permissionKeys: [...view] },
  { id: 'tenders', label: 'E-Tendering', href: '/procurement/tenders', icon: FolderOpen, permissionKeys: [...view] },
  { id: 'cbe', label: 'Competitive Bid Evaluation', href: '/procurement/cbe', icon: Scale, permissionKeys: [...view] },
  { id: 'suppliers', label: 'Supplier Management', href: '/procurement/suppliers', icon: Users, permissionKeys: [...vendor] },
  { id: 'contracts', label: 'Contracts & Frameworks', href: '/procurement/contracts', icon: BriefcaseBusiness, permissionKeys: [...view] },
  { id: 'purchase-orders', label: 'Purchase Orders', href: '/procurement/purchase-orders', icon: ShoppingCart, permissionKeys: [...view] },
  { id: 'expediting', label: 'Expediting & Logistics', href: '/procurement/expediting', icon: Truck, permissionKeys: [...view] },
  { id: 'receiving', label: 'Receiving & Inspection', href: '/procurement/receiving', icon: PackageCheck, permissionKeys: [...view] },
  { id: 'commercial', label: 'Commercial / Advanced Procurement', href: '/procurement/commercial', icon: Wallet, permissionKeys: [...view] },
  { id: 'customer-orders', label: 'Customer Orders & Client POs', href: '/procurement/customer-orders', icon: ClipboardCheck, permissionKeys: [...view] },
  { id: 'delivery', label: 'Delivery & Fulfilment', href: '/procurement/delivery', icon: Truck, permissionKeys: [...view] },
  { id: 'costing', label: 'Procurement Finance & Costing', href: '/procurement/costing', icon: BarChart3, permissionKeys: [...view] },
  { id: 'analytics', label: 'Procurement Analytics', href: '/procurement/analytics', icon: FileBarChart2, permissionKeys: [...view, 'procurement.export'] },
  { id: 'approvals', label: 'Approvals & Work Queue', href: '/procurement/approvals', icon: ClipboardCheck, permissionKeys: [...view] },
  { id: 'compliance', label: 'Compliance & Audit', href: '/procurement/compliance', icon: ShieldCheck, permissionKeys: [...view] },
  { id: 'documents', label: 'Documents & Correspondence', href: '/procurement/documents', icon: FolderOpen, permissionKeys: [...view] },
  { id: 'configuration', label: 'Procurement Configuration', href: '/procurement/configuration', icon: Settings, permissionKeys: [...view, 'procurement.edit'] },
];

export const PROCUREMENT_ACCENT = {
  primary: '#1458d8',
  primarySoft: '#edf4ff',
  ink: '#0d1b3d',
  muted: '#63708a',
} as const;
