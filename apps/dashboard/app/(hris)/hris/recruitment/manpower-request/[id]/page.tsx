import { redirect } from 'next/navigation';
import { recruitmentRoutes } from '@/lib/recruitment-shared';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

/** Detail/edit now runs in a modal on the register page. */
export default async function Page({ params }: Props) {
  const { id } = await params;
  redirect(`${recruitmentRoutes.manpower}?edit=${encodeURIComponent(id)}`);
}
