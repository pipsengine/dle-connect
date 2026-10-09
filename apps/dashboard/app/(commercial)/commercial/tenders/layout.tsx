import type { ReactNode } from 'react';
import { TendersPortalShell } from './tenders-portal-shell';

export const metadata = {
  title: 'Tenders Management',
  description: 'Commercial tender opportunities, bid preparation, evaluation, submission and awards.',
};

export default function TendersLayout({ children }: { children: ReactNode }) {
  return <TendersPortalShell>{children}</TendersPortalShell>;
}
