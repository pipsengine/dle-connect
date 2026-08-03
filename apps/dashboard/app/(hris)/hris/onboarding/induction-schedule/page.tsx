import { buildInductionScheduleWorkspace } from '@/lib/induction-schedule-service';
import InductionScheduleClient from './InductionScheduleClient';

export const dynamic = 'force-dynamic';

export default async function InductionSchedulePage() {
  const workspace = await buildInductionScheduleWorkspace();
  return <InductionScheduleClient initialWorkspace={workspace} />;
}
