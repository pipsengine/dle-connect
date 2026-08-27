import type { ReactNode } from 'react';
import { ProcurementPortalShell } from './procurement-portal-shell';

export const metadata = {
  title: 'Procurement',
  description: 'Procurement portal — requisitions, RFQs, competitive bid evaluation, purchase orders, suppliers, and contracts.',
};

export default function ProcurementLayout({ children }: { children: ReactNode }) {
  return <ProcurementPortalShell>{children}</ProcurementPortalShell>;
}
