import { CbeWorkspaceClient } from './CbeWorkspaceClient';

export const metadata = { title: 'CBE Workspace' };

type Props = { params: Promise<{ id: string }> | { id: string } };

export default async function CbeDetailPage({ params }: Props) {
  const resolved = await Promise.resolve(params);
  const cbeId = decodeURIComponent(resolved.id);
  return <CbeWorkspaceClient cbeId={cbeId} />;
}
