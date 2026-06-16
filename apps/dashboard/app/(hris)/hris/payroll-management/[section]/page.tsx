import type { Metadata } from 'next';
import PayrollManagementClient from '../PayrollManagementClient';

const titleCase = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: titleCase(section || 'Payroll Management') };
}

export default async function PayrollManagementSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <PayrollManagementClient initialNow={new Date().toISOString()} initialSection={section} />;
}
