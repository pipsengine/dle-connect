import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Loan Application',
};

export default function LoanApplicationPage() {
  redirect('/workforce-portal?tab=loans');
}
