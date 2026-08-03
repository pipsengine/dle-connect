import { buildNewHireChecklistWorkspace } from '@/lib/new-hire-checklist-service';
import NewHireChecklistClient from './NewHireChecklistClient';

export const dynamic = 'force-dynamic';

export default async function NewHireChecklistPage() {
  const workspace = await buildNewHireChecklistWorkspace();
  return <NewHireChecklistClient initialWorkspace={workspace} />;
}
