import type { ReactNode } from 'react';
import { FinancePortalShell } from './finance-portal-shell';

export const metadata = {
  title: 'Finance Intelligence & Approvals',
  description:
    'Financial reporting, analytics, AI-assisted decision support and controlled payment approvals integrated with Sage X3 Enterprise.',
};

/**
 * Do not await finance badge DB work on the layout — email deep-links must paint immediately.
 * FinancePortalShell loads badges client-side after mount.
 */
export default function FinancePortalLayout({ children }: { children: ReactNode }) {
  return <FinancePortalShell>{children}</FinancePortalShell>;
}
