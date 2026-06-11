'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/dashboard-layout';

const HRIS_DASHBOARD_PATHS = new Set([
  '/dashboard/executive-hr-dashboard',
]);

export default function DashboardRouteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (HRIS_DASHBOARD_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
