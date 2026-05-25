import AddNewEmployeeClient from './AddNewEmployeeClient';

export default async function AddNewEmployeePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const raw = sp.draftId;
  const draftId = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  return <AddNewEmployeeClient initialNow={new Date().toISOString()} initialDraftId={draftId} />;
}

