import { Suspense } from 'react';
import { FleetWorkspaceClient } from '../fleet-workspace-client';

export default async function LogisticsFleetWorkspacePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-[#F5F8FC] text-sm font-semibold text-slate-500">Loading fleet portal…</div>}>
      <FleetWorkspaceClient workspaceSlug={workspace} />
    </Suspense>
  );
}
