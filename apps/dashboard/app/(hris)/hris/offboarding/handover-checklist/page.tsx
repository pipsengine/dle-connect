import type { Metadata } from 'next';
import HandoverChecklistWorkspace from './HandoverChecklistWorkspace';

export const metadata: Metadata = {
  title: 'Handover Checklist',
};

export default async function HandoverChecklistPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const pick = (key: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : Array.isArray(sp[key]) ? sp[key]![0] : undefined;
  return (
    <HandoverChecklistWorkspace
      initialPeriod={pick('period')}
      initialId={pick('id')}
      initialEmployeeCode={pick('employeeCode') || pick('code')}
      initialEmployeeId={pick('employeeId')}
    />
  );
}
