import type { Metadata } from 'next';
import AssetReturnWorkspace from './AssetReturnWorkspace';

export const metadata: Metadata = {
  title: 'Asset Return',
};

export default async function AssetReturnPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const pick = (key: string) =>
    typeof sp[key] === 'string' ? (sp[key] as string) : Array.isArray(sp[key]) ? sp[key]![0] : undefined;
  return (
    <AssetReturnWorkspace
      initialPeriod={pick('period')}
      initialId={pick('id')}
      initialEmployeeCode={pick('employeeCode') || pick('code')}
      initialEmployeeId={pick('employeeId')}
    />
  );
}
