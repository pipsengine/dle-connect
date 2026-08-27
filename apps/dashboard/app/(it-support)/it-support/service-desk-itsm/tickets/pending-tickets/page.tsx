import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Pending Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="pending" title="Pending Tickets" description="Tickets waiting on input." />;
}
