import type { SectionKey } from '@/lib/projects-engineering/types';

/** Workspace section tabs — navigation config only (no mock project data). */
export const workspaceTabs: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'planning', label: 'Planning' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'deliverables', label: 'Deliverables' },
  { key: 'documents', label: 'Documents' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'cost-control', label: 'Cost Control' },
  { key: 'resources', label: 'Man-Hours' },
  { key: 'construction', label: 'Construction' },
  { key: 'quality', label: 'Quality' },
  { key: 'hse', label: 'HSE' },
  { key: 'risks', label: 'Risks' },
  { key: 'changes', label: 'Changes' },
  { key: 'actions', label: 'Actions' },
  { key: 'interface', label: 'Client Interface' },
  { key: 'progress', label: 'Progress' },
  { key: 'reports', label: 'Reports' },
  { key: 'ai', label: 'AI Intelligence' },
  { key: 'closeout', label: 'Closeout' },
];
