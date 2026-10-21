'use client';

import { CorporateOfficeBreadcrumbs } from '../corporate-office-portal-shell';
import { FrontDeskDashboard } from './FrontDeskDashboard';

export default function FrontDeskPage() {
  return (
    <div className="mx-auto max-w-[1640px] space-y-4">
      <CorporateOfficeBreadcrumbs items={['Front Desk']} />
      <FrontDeskDashboard />
    </div>
  );
}
