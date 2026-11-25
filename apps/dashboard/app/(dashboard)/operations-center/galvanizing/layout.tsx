import type { ReactNode } from 'react';
import { GalvanizingPortalShell } from './galvanizing-portal-shell';

export const metadata = {
  title: 'Galvanizing Operations',
  description: 'Gate intake, production, quality disposition, inventory and dispatch for the DLE galvanizing plant.',
};

export default function GalvanizingLayout({ children }: { children: ReactNode }) {
  return <GalvanizingPortalShell>{children}</GalvanizingPortalShell>;
}
