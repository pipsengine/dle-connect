import { TicketsWorkspace } from '../_components/TicketsWorkspace';

export const metadata = { title: 'Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="all" title="Tickets" description="All service desk tickets." />;
}
