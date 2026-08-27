import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'In Progress' };

export default function Page() {
  return <TicketsWorkspace mode="in-progress" title="In Progress" description="Tickets being worked." />;
}
