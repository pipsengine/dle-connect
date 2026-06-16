import type { Metadata } from 'next';
import SageMigrationReviewClient from './SageMigrationReviewClient';

export const metadata: Metadata = {
  title: 'Sage Payroll Migration Review',
};

export default function SageMigrationReviewPage() {
  return <SageMigrationReviewClient initialNow={new Date().toISOString()} />;
}
