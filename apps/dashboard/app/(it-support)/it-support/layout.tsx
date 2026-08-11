import type { ReactNode } from 'react';
import { ItSupportPortalShell } from './it-support-portal-shell';

export const metadata = {
  title: 'IT & Support',
  description:
    'IT Service & Operations Portal — service desk, account recovery, asset lifecycle, knowledge, cybersecurity, and system monitoring.',
};

export default function ItSupportPortalLayout({ children }: { children: ReactNode }) {
  return <ItSupportPortalShell>{children}</ItSupportPortalShell>;
}
