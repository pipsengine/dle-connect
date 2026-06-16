import { Suspense } from 'react';
import type { Metadata } from 'next';
import WorkforcePortalClient from './workforce-portal-client';

export const metadata: Metadata = {
  title: 'Employee Self-Service Portal',
};

export default function WorkforcePortalPage() {
  return (
    <Suspense fallback={null}>
      <WorkforcePortalClient initialNow={new Date().toISOString()} />
    </Suspense>
  );
}
