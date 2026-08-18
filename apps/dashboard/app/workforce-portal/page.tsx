import { Suspense } from 'react';
import type { Metadata } from 'next';
import { WORKFORCE_PORTAL_ENABLED } from '@/lib/workforce-portal-availability';
import { WorkforcePortalSuspended } from '@/components/workforce-portal-suspended';
import WorkforcePortalClient from './workforce-portal-client';

export const metadata: Metadata = {
  title: 'Employee Self-Service Portal',
};

export default function WorkforcePortalPage() {
  if (!WORKFORCE_PORTAL_ENABLED) return <WorkforcePortalSuspended />;
  return (
    <Suspense fallback={null}>
      <WorkforcePortalClient initialNow={new Date().toISOString()} />
    </Suspense>
  );
}
