import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Resolved Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="resolved" title="Resolved Tickets" description="Resolved tickets awaiting closure." />;
}
