import type { Metadata } from 'next';
import LoansAndSalaryAdvancesClient from './LoansAndSalaryAdvancesClient';

export const metadata: Metadata = {
  title: 'Loans and Salary Advances',
};

export default function LoansAndSalaryAdvancesPage() {
  return <LoansAndSalaryAdvancesClient initialNow={new Date().toISOString()} />;
}
