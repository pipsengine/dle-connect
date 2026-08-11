import { Shield } from 'lucide-react';
import { ItSupportComingSoon } from '../_components/ItSupportComingSoon';

export const metadata = { title: 'Cybersecurity Center' };

export default function CybersecurityCenterPage() {
  return (
    <ItSupportComingSoon
      title="Cybersecurity Center"
      description="Threat posture, control monitoring, and response playbooks will be coordinated from this centre."
      crumbs={['Security & Operations', 'Cybersecurity Center']}
      icon={Shield}
      highlights={[
        'Security control health overview',
        'Incident response playbooks',
        'Audit-ready evidence trails',
      ]}
    />
  );
}
