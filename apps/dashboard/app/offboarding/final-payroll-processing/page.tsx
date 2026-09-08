import { redirect } from 'next/navigation';

export default async function OffboardingFinalPayrollRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const period = typeof sp.period === 'string' ? sp.period : '';
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  redirect(`/hris/offboarding/final-payroll-processing${qs}`);
}
