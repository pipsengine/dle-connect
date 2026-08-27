import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Ticket Assignments' };

export default function Page() {
  return <TicketsWorkspace mode="assignments" title="Ticket Assignments" description="Assign and bulk-assign open work." />;
}
