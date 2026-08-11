import { Activity } from 'lucide-react';
import { ItSupportComingSoon } from '../_components/ItSupportComingSoon';

export const metadata = { title: 'System Monitoring' };

export default function SystemMonitoringPage() {
  return (
    <ItSupportComingSoon
      title="System Monitoring"
      description="Platform health, uptime signals, and infrastructure observability will surface in this operations view."
      crumbs={['Security & Operations', 'System Monitoring']}
      icon={Activity}
      highlights={[
        'Service health and availability signals',
        'Infrastructure exception visibility',
        'On-call friendly operational summaries',
      ]}
    />
  );
}
