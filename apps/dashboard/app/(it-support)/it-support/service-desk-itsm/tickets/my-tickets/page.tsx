import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'My Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="my" title="My Tickets" description="Tickets you requested or are assigned to." />;
}
