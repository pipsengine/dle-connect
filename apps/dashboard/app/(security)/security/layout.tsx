import type { ReactNode } from 'react';
import { SecurityPortalShell } from './security-portal-shell';

export const metadata = {
  title: 'Security',
  description:
    'Security Operations Portal — visitor management, reception, approvals, badges, and site security control.',
};

export default function SecurityPortalLayout({ children }: { children: ReactNode }) {
  return <SecurityPortalShell>{children}</SecurityPortalShell>;
}
