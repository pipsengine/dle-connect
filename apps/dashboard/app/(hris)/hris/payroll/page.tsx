import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Payroll Management',
};

export default function PayrollPage() {
  redirect('/hris/payroll/payroll-processing');
}
