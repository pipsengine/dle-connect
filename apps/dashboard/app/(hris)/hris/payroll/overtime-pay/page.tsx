import type { Metadata } from 'next';
import OvertimePayClient from './OvertimePayClient';

export const metadata: Metadata = {
  title: 'Overtime Pay',
};

export default function OvertimePayPage() {
  return <OvertimePayClient initialNow={new Date().toISOString()} />;
}
