export type Health = 'Healthy' | 'Watch' | 'Critical';

export type ProjectStatus =
  | 'Draft'
  | 'Active'
  | 'Approved'
  | 'Open'
  | 'Suspended'
  | 'Completed'
  | 'Closed'
  | 'Archived';

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
  /** Timesheet / enterprise registry id (`hris.TimesheetProjects.Id`). */
  registryId?: string;
  /** Optional `pm.Projects.ProjectId` when a rich PM profile exists. */
  pmProjectId?: string;
};

export const PROJECT_STATUS_OPTIONS: ProjectStatus[] = [
  'Draft',
  'Active',
  'Approved',
  'Open',
  'Suspended',
  'Completed',
  'Closed',
  'Archived',
];

export const PROJECT_HEALTH_OPTIONS: Health[] = ['Healthy', 'Watch', 'Critical'];

export type NavItem = { label: string; href: string; icon: string; permission?: string };
export type SectionKey =
  | 'overview'
  | 'planning'
  | 'engineering'
  | 'deliverables'
  | 'documents'
  | 'procurement'
  | 'cost'
  | 'cost-control'
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
