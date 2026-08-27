import { TicketsWorkspace } from '../../_components/TicketsWorkspace';
export const metadata = { title: 'SLA Breaches' };
export default function Page() {
  return <TicketsWorkspace mode="overdue" title="SLA Breaches" description="Tickets that breached resolve SLA." />;
}
