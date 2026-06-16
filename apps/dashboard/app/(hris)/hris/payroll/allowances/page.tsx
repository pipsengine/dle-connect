import type { Metadata } from 'next';
import AllowancesClient from './AllowancesClient';

export const metadata: Metadata = {
  title: 'Allowances',
};

export default function AllowancesPage() {
  return <AllowancesClient initialNow={new Date().toISOString()} />;
}
