import AddNewEmployeeClient from './AddNewEmployeeClient';

export default async function AddNewEmployeePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const raw = sp.draftId;
  const draftId = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  const rawCode = sp.employeeCode;
  const employeeCode = typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim() : undefined;
  return <AddNewEmployeeClient initialNow={new Date().toISOString()} initialDraftId={draftId} initialEmployeeCode={employeeCode} />;
}

