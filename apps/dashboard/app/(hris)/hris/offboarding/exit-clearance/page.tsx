import type { Metadata } from 'next';
import ExitClearanceWorkspace from './ExitClearanceWorkspace';

export const metadata: Metadata = {
  title: 'Exit Clearance',
};

export default async function ExitClearancePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const pick = (key: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : Array.isArray(sp[key]) ? sp[key]![0] : undefined;
  return (
    <ExitClearanceWorkspace
      initialPeriod={pick('period')}
      initialId={pick('id')}
      initialEmployeeCode={pick('employeeCode') || pick('code')}
      initialEmployeeId={pick('employeeId')}
      initialOpenForm={pick('openForm') === '1'}
      initialSectionId={pick('section')}
    />
  );
}
