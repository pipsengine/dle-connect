import { TicketsWorkspace } from '../../_components/TicketsWorkspace';

export const metadata = { title: 'Overdue Tickets' };

export default function Page() {
  return <TicketsWorkspace mode="overdue" title="Overdue Tickets" description="Tickets past their SLA due time." />;
}
