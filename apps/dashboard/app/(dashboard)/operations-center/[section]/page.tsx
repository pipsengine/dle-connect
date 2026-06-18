import { notFound } from 'next/navigation';
import OperationsCenterClient from '../OperationsCenterClient';
import type { OperationsSection } from '@/lib/operations-center-store';

const sections: OperationsSection[] = [
  'timesheets',
  'workforce-allocation',
  'resource-planning',
  'daily-activity-reports',
  'production-tracking',
];

export default async function OperationsCenterSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as OperationsSection)) notFound();
  return <OperationsCenterClient initialSection={section as OperationsSection} />;
}
