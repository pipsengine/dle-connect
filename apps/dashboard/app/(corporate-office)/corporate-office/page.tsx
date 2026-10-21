import { Suspense } from 'react';
import { CorporateOfficeOverview } from './CorporateOfficeOverview';

export default function CorporateOfficeOverviewPage() {
  return (
    <Suspense fallback={null}>
      <CorporateOfficeOverview />
    </Suspense>
  );
}
