import type { Metadata } from 'next';
import DeductionsClient from './DeductionsClient';

export const metadata: Metadata = {
  title: 'Deductions',
};

export default function DeductionsPage() {
  return <DeductionsClient initialNow={new Date().toISOString()} />;
}
