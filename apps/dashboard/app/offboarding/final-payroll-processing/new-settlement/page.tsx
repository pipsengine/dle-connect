import { redirect } from 'next/navigation';

export default async function OffboardingNewSettlementRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const id = typeof sp.id === 'string' ? sp.id : '';
  const qs = id ? `?id=${encodeURIComponent(id)}` : '';
  redirect(`/hris/offboarding/final-payroll-processing/new-settlement${qs}`);
}
