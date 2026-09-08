import type { Metadata } from 'next';
import NewResignationWorkspace from './NewResignationWorkspace';

export const metadata: Metadata = {
  title: 'New Resignation',
};

export default async function NewResignationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const pick = (key: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : Array.isArray(sp[key]) ? sp[key]![0] : undefined;
  return (
    <NewResignationWorkspace
      initialId={pick('id')}
      initialEmployeeCode={pick('employeeCode') || pick('code')}
    />
  );
}
