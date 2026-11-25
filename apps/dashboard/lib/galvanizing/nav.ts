import {
  BarChart3,
  Factory,
  LayoutDashboard,
  Package,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export type GalvanizingNavChild = { id: string; label: string; href: string };

export type GalvanizingNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  children?: GalvanizingNavChild[];
};

export const GALVANIZING_NAV: GalvanizingNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/operations-center/galvanizing', icon: LayoutDashboard },
  {
    id: 'jobs',
    label: 'Jobs & Intake',
    href: '/operations-center/galvanizing/jobs',
    icon: Truck,
    children: [
      { id: 'jobs-list', label: 'Jobs', href: '/operations-center/galvanizing/jobs' },
      { id: 'gate', label: 'Gate & weighing', href: '/operations-center/galvanizing/jobs/gate' },
      { id: 'materials', label: 'Material register', href: '/operations-center/galvanizing/jobs/materials' },
      { id: 'articles', label: 'Articles', href: '/operations-center/galvanizing/jobs/articles' },
      { id: 'release', label: 'Job release', href: '/operations-center/galvanizing/jobs/release' },
    ],
  },
  { id: 'production', label: 'Production', href: '/operations-center/galvanizing/production', icon: Factory },
  { id: 'quality', label: 'Quality & Disposition', href: '/operations-center/galvanizing/quality', icon: ShieldCheck },
  { id: 'inventory', label: 'Inventory & Dispatch', href: '/operations-center/galvanizing/inventory', icon: Package },
  { id: 'reports', label: 'Reports & Cost Control', href: '/operations-center/galvanizing/reports', icon: BarChart3 },
];
