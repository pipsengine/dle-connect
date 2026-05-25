import type { ReactNode } from 'react';
import DashboardLayout from '@hris/components/layout/dashboard-layout';

export default function HRISRootLayout({ children }: { children: ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

