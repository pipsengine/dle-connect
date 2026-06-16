import type { Metadata } from 'next';
import PensionClient from './PensionClient';

export const metadata: Metadata = {
  title: 'Pension',
};

export default function PensionPage() {
  return <PensionClient initialNow={new Date().toISOString()} />;
}
