import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Archived Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="archived" title="Archived Tickets" description="Archived ticket history." />;
}
