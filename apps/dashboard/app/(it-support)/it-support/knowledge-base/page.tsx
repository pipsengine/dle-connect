import { BookOpen } from 'lucide-react';
import { ItSupportComingSoon } from '../_components/ItSupportComingSoon';

export const metadata = { title: 'Knowledge Base' };

export default function KnowledgeBasePage() {
  return (
    <ItSupportComingSoon
      title="Knowledge Base"
      description="Enterprise runbooks, FAQs, and support articles will be curated and searchable here."
      crumbs={['Service Operations', 'Knowledge Base']}
      icon={BookOpen}
      highlights={[
        'Searchable operational articles',
        'Role-aware publishing controls',
        'Linked guidance from Service Desk tickets',
      ]}
    />
  );
}
