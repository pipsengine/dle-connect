import type { Metadata } from 'next';
import DailyRatePayClient from './DailyRatePayClient';

export const metadata: Metadata = {
  title: 'Daily Rate Pay',
};

export default function DailyRatePayPage() {
  return <DailyRatePayClient initialNow={new Date().toISOString()} />;
}
