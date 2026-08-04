import { redirect } from 'next/navigation';
import { FINANCE_MODULE } from '@/lib/finance-intelligence/nav';

export default function FinanceIndexPage() {
  redirect(FINANCE_MODULE.homeHref);
}
