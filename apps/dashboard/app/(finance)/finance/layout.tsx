import type { ReactNode } from 'react';
import { FinancePortalShell } from './finance-portal-shell';
import { buildFinanceBadges } from '@/lib/finance-intelligence/store';

export const metadata = {
  title: 'Finance Intelligence & Approvals',
  description:
    'Financial reporting, analytics, AI-assisted decision support and controlled payment approvals integrated with Sage X3 Enterprise.',
};

export default async function FinancePortalLayout({ children }: { children: ReactNode }) {
  const badges = await buildFinanceBadges().catch(() => undefined);
  return <FinancePortalShell badges={badges}>{children}</FinancePortalShell>;
}
