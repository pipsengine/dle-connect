import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Closed Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="closed" title="Closed Tickets" description="Fully closed tickets." />;
}
