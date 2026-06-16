import type { Metadata } from 'next';
import StatutoryFundsClient from './StatutoryFundsClient';

export const metadata: Metadata = {
  title: 'NHF, NSITF and ITF',
};

export default function NhfNsitfItfPage() {
  return <StatutoryFundsClient initialNow={new Date().toISOString()} />;
}
