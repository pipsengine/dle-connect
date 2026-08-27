import { TicketsWorkspace } from '../../_components/TicketsWorkspace';
export const metadata = { title: 'SLA Monitoring' };
export default function Page() {
  return <TicketsWorkspace mode="all" title="SLA Monitoring" description="Watch ticket SLA timers against active policies." />;
}
