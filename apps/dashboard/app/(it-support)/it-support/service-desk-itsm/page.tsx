import { Headphones } from 'lucide-react';
import { ItSupportComingSoon } from '../_components/ItSupportComingSoon';

export const metadata = { title: 'Service Desk (ITSM)' };

export default function ServiceDeskItsmPage() {
  return (
    <ItSupportComingSoon
      title="Service Desk (ITSM)"
      description="Incident, request, and change management with SLA ownership will operate from this workspace."
      crumbs={['Service Operations', 'Service Desk (ITSM)']}
      icon={Headphones}
      highlights={[
        'Ticket intake and assignment queues',
        'SLA timers and escalation paths',
        'Change and problem management hooks',
      ]}
    />
  );
}
