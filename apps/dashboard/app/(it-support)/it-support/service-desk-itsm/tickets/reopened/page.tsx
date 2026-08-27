import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Reopened Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="reopened" title="Reopened Tickets" description="Tickets that were reopened." />;
}
