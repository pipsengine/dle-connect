import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'All Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="all" title="All Tickets" description="Browse and manage every ticket." />;
}
