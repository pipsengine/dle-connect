'use client';

import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/dashboard-layout';

const HRIS_DASHBOARD_PATHS = new Set([
  '/dashboard/executive-hr-dashboard',
]);

export default function DashboardRouteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (
    HRIS_DASHBOARD_PATHS.has(pathname)
    || pathname === '/timesheet-management'
    || pathname.startsWith('/timesheet-management/')
    || pathname === '/operations-center/galvanizing'
    || pathname.startsWith('/operations-center/galvanizing/')
  ) {
    return <>{children}</>;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
