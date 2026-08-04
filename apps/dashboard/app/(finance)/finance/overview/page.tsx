import { redirect } from 'next/navigation';
import { FINANCE_MODULE } from '@/lib/finance-intelligence/nav';

export default function FinanceOverviewIndexPage() {
  redirect(FINANCE_MODULE.homeHref);
}
