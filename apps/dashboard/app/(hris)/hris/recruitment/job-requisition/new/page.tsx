import { redirect } from 'next/navigation';
import { recruitmentRoutes } from '@/lib/recruitment-shared';

export const dynamic = 'force-dynamic';

export default function Page() {
  redirect(recruitmentRoutes.requisition);
}
