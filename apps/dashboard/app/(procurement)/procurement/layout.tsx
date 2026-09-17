import type { ReactNode } from 'react';
import { ProcurementPortalShell } from './procurement-portal-shell';

export const metadata = {
  title: 'Procurement',
  description:
    'End-to-end procurement portal — planning, requisitions, sourcing, CBE, contracts, purchase orders, expediting, receiving, commercial fulfilment, costing, compliance and configuration.',
};

export default function ProcurementLayout({ children }: { children: ReactNode }) {
  return <ProcurementPortalShell>{children}</ProcurementPortalShell>;
}
