import {
  Bot,
  ClipboardList,
  FileBarChart2,
  FolderKanban,
  LayoutDashboard,
  Link2,
  PlusCircle,
  Settings2,
  Target,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

export type ProjectsEngineeringNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permissionKeys: string[];
};

export const PROJECTS_ENGINEERING_VIEW_PERMISSIONS = [
  'view_projects_engineering',
  'project.view',
  'project.*',
] as const;

export const PROJECTS_ENGINEERING_COST_PERMISSIONS = [
  'view_project_costs',
  'COST_CONTROL_VIEW',
  'COST_CONTROL_VALIDATE',
  'COST_CONTROL_FORECAST',
  'COST_CONTROL_REPORT',
  'project.admin',
  'project.*',
] as const;

export const PROJECTS_ENGINEERING_NAV: ProjectsEngineeringNavItem[] = [
  {
    id: 'dashboard',
    label: 'Portfolio Dashboard',
    href: '/projects-engineering',
    icon: LayoutDashboard,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS],
  },
  {
    id: 'projects',
    label: 'Projects',
    href: '/projects-engineering/projects',
    icon: FolderKanban,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS],
  },
  {
    id: 'cost-control',
    label: 'Cost Control',
    href: '/projects-engineering/cost-control',
    icon: WalletCards,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, ...PROJECTS_ENGINEERING_COST_PERMISSIONS],
  },
  {
    id: 'portfolio',
    label: 'Planning & Controls',
    href: '/projects-engineering/portfolio',
    icon: Target,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, 'manage_project_planning'],
  },
  {
    id: 'new-project',
    label: 'New Project',
    href: '/projects-engineering/projects?action=create',
    icon: PlusCircle,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, 'create_project', 'edit_project'],
  },
  {
    id: 'active-project',
    label: 'Active Project Workspace',
    href: '/projects-engineering/projects',
    icon: FolderKanban,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS],
  },
  {
    id: 'reports',
    label: 'Portfolio Reports',
    href: '/projects-engineering/reports',
    icon: FileBarChart2,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS],
  },
  {
    id: 'integrations',
    label: 'Integrations & Connectors',
    href: '/projects-engineering/integrations',
    icon: Link2,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, 'manage_project_integrations', 'project.admin'],
  },
  {
    id: 'ai',
    label: 'AI Intelligence',
    href: '/projects-engineering/projects',
    icon: Bot,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, 'use_project_ai'],
  },
  {
    id: 'actions',
    label: 'Actions & Decisions',
    href: '/projects-engineering/projects',
    icon: ClipboardList,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS],
  },
  {
    id: 'settings',
    label: 'Configuration',
    href: '/projects-engineering/settings',
    icon: Settings2,
    permissionKeys: [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, 'project.admin', 'manage_project_integrations'],
  },
];
