import CbeWorkspaceClient from './CbeWorkspaceClient';

export const metadata = { title: 'CBE Workspace' };

type Props = { params: Promise<{ id: string }> };

export default async function CbeDetailPage({ params }: Props) {
  const { id } = await params;
  const cbeId = decodeURIComponent(id);
  return <CbeWorkspaceClient cbeId={cbeId} />;
}
