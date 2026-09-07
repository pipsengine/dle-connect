import { redirect } from 'next/navigation';

export default async function CostControlIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects-engineering/projects/${id}/cost-control/overview`);
}
