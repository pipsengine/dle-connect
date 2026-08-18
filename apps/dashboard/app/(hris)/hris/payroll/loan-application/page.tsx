import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { WORKFORCE_PORTAL_ENABLED } from '@/lib/workforce-portal-availability';
import { WorkforcePortalSuspended } from '@/components/workforce-portal-suspended';

export const metadata: Metadata = {
  title: 'Loan Application',
};

export default function LoanApplicationPage() {
  if (!WORKFORCE_PORTAL_ENABLED) return <WorkforcePortalSuspended />;
  redirect('/workforce-portal?tab=loans');
}
