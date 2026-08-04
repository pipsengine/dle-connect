import { redirect } from 'next/navigation';

/** Legacy Finance & Accounting route → Finance Intelligence & Approvals portal. */
export default function FinanceAccountingRedirectPage() {
  redirect('/finance/overview/command-centre');
}
