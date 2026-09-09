import { redirect } from 'next/navigation';
import { recruitmentRoutes } from '@/lib/recruitment-shared';

export const dynamic = 'force-dynamic';

/** Create/edit now runs in a modal on the register page. */
export default function Page() {
  redirect(recruitmentRoutes.manpower);
}
