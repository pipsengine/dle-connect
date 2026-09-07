export type Health = 'Healthy' | 'Watch' | 'Critical';

export type Project = {
  id: string;
  code: string;
  name: string;
  client: string;
  manager: string;
  managerEmployeeCode?: string;
  managerEmployeeId?: string;
  managerUsername?: string;
  contractValue: number;
  currency: string;
  start: string;
  finish: string;
  planned: number;
  actual: number;
  costPerformance: number;
  schedulePerformance: number;
  phase: string;
  status: string;
  health: Health;
  location: string;
  businessUnit: string;
  description: string;
  projectType?: string;
  createdBy?: string;
  createdAt?: string;
};

export type NavItem = { label: string; href: string; icon: string; permission?: string };
export type SectionKey =
  | 'overview'
  | 'planning'
  | 'engineering'
  | 'deliverables'
  | 'documents'
  | 'procurement'
  | 'cost'
  | 'resources'
  | 'construction'
  | 'quality'
  | 'hse'
  | 'risks'
  | 'changes'
  | 'actions'
  | 'interface'
  | 'progress'
  | 'reports'
  | 'ai'
  | 'closeout';
