import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Open Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="open" title="Open Tickets" description="Tickets currently open." />;
}
