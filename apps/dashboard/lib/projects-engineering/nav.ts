import {
  Activity,
  AlertTriangle,
  Bot,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  FileStack,
  FileText,
  FolderKanban,
  Handshake,
  HardHat,
  LayoutDashboard,
  Link2,
  Package,
  PlusCircle,
  Scale,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Users,
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

export type ProjectsEngineeringNavGroup = {
  id: string;
  label: string;
  items: ProjectsEngineeringNavItem[];
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

const view = [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS];
const cost = [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, ...PROJECTS_ENGINEERING_COST_PERMISSIONS];
const admin = [...PROJECTS_ENGINEERING_VIEW_PERMISSIONS, 'project.admin', 'manage_project_integrations'];

/** Canonical grouped sidebar (EPC Project Management). */
export const PROJECTS_ENGINEERING_NAV_GROUPS: ProjectsEngineeringNavGroup[] = [
  {
    id: 'portfolio',
    label: 'Project Portfolio',
    items: [
      { id: 'dashboard', label: 'Portfolio Dashboard', href: '/projects-engineering', icon: LayoutDashboard, permissionKeys: view },
      { id: 'projects', label: 'Projects', href: '/projects-engineering/projects', icon: FolderKanban, permissionKeys: view },
      { id: 'new-project', label: 'New Project', href: '/projects-engineering/projects/new', icon: PlusCircle, permissionKeys: [...view, 'create_project', 'edit_project'] },
      { id: 'active-project', label: 'Active Project Workspace', href: '/projects-engineering/workspace', icon: BriefcaseBusiness, permissionKeys: view },
    ],
  },
  {
    id: 'controls',
    label: 'Project Controls',
    items: [
      { id: 'planning', label: 'Planning & Schedule', href: '/projects-engineering/planning', icon: Target, permissionKeys: [...view, 'manage_project_planning'] },
      { id: 'cost-control', label: 'Cost Control', href: '/projects-engineering/cost-control', icon: WalletCards, permissionKeys: cost },
      { id: 'timesheets', label: 'Timesheets & Man-Hours', href: '/projects-engineering/timesheets', icon: Timer, permissionKeys: cost },
      { id: 'resources', label: 'Resources', href: '/projects-engineering/resources', icon: Users, permissionKeys: view },
      { id: 'progress', label: 'Progress Measurement', href: '/projects-engineering/progress', icon: Activity, permissionKeys: view },
    ],
  },
  {
    id: 'engineering-delivery',
    label: 'Engineering & Delivery',
    items: [
      { id: 'engineering', label: 'Engineering', href: '/projects-engineering/engineering', icon: Building2, permissionKeys: view },
      { id: 'deliverables', label: 'Deliverables Register', href: '/projects-engineering/deliverables', icon: FileStack, permissionKeys: view },
      { id: 'document-control', label: 'Document Control', href: '/projects-engineering/document-control', icon: FileText, permissionKeys: view },
      { id: 'procurement', label: 'Procurement & Expediting', href: '/projects-engineering/procurement', icon: Package, permissionKeys: view },
      { id: 'construction', label: 'Construction / Fabrication', href: '/projects-engineering/construction', icon: HardHat, permissionKeys: view },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial & Contracts',
    items: [
      { id: 'commercial', label: 'Commercial & Contracts', href: '/projects-engineering/commercial', icon: Scale, permissionKeys: view },
      { id: 'changes', label: 'Changes & Variations', href: '/projects-engineering/changes', icon: ClipboardCheck, permissionKeys: view },
      { id: 'billing', label: 'Client Billing & Certificates', href: '/projects-engineering/commercial/billing', icon: Calculator, permissionKeys: view },
      { id: 'claims', label: 'Claims & Notices', href: '/projects-engineering/commercial/claims', icon: AlertTriangle, permissionKeys: view },
    ],
  },
  {
    id: 'assurance',
    label: 'Project Assurance',
    items: [
      { id: 'quality', label: 'Quality Management', href: '/projects-engineering/quality', icon: ShieldCheck, permissionKeys: view },
      { id: 'hse', label: 'HSE Management', href: '/projects-engineering/hse', icon: HardHat, permissionKeys: view },
      { id: 'risks', label: 'Risks, Issues & Opportunities', href: '/projects-engineering/risks', icon: AlertTriangle, permissionKeys: view },
      { id: 'actions', label: 'Meetings, Actions & Decisions', href: '/projects-engineering/actions', icon: ClipboardList, permissionKeys: view },
      { id: 'interfaces', label: 'Client / Contractor Interface', href: '/projects-engineering/interfaces', icon: Handshake, permissionKeys: view },
    ],
  },
  {
    id: 'reporting',
    label: 'Reporting & Closeout',
    items: [
      { id: 'reports-portfolio', label: 'Portfolio Reports', href: '/projects-engineering/reports/portfolio', icon: FileBarChart2, permissionKeys: view },
      { id: 'reports-project', label: 'Project Reports', href: '/projects-engineering/reports/project', icon: FileBarChart2, permissionKeys: view },
      { id: 'closeout', label: 'Project Closeout & Handover', href: '/projects-engineering/closeout', icon: ClipboardCheck, permissionKeys: view },
      { id: 'lessons', label: 'Lessons Learned', href: '/projects-engineering/lessons-learned', icon: Sparkles, permissionKeys: view },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence & Administration',
    items: [
      { id: 'ai', label: 'AI Project Intelligence', href: '/projects-engineering/ai-intelligence', icon: Bot, permissionKeys: [...view, 'use_project_ai'] },
      { id: 'integrations', label: 'Integrations & Connectors', href: '/projects-engineering/integrations', icon: Link2, permissionKeys: admin },
      { id: 'admin', label: 'Project Administration', href: '/projects-engineering/admin', icon: Settings2, permissionKeys: admin },
      { id: 'configuration', label: 'Configuration', href: '/projects-engineering/configuration', icon: Settings2, permissionKeys: admin },
    ],
  },
];

/** Flat list for permission filtering and active-route helpers. */
export const PROJECTS_ENGINEERING_NAV: ProjectsEngineeringNavItem[] = PROJECTS_ENGINEERING_NAV_GROUPS.flatMap((group) => group.items);

/** Legacy path redirects preserved for bookmarks. */
export const PROJECTS_ENGINEERING_REDIRECTS: Record<string, string> = {
  '/projects-engineering/portfolio': '/projects-engineering/planning',
  '/projects-engineering/settings': '/projects-engineering/configuration',
  '/projects-engineering/reports': '/projects-engineering/reports/portfolio',
};
