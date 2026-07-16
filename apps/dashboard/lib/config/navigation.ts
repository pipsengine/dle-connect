import {
  LayoutDashboard,
  Box,
  Users,
  Building2,
  Banknote,
  Clock,
  Gift,
  Megaphone,
  Target,
  Scale,
  Files,
  BarChart4,
  UserCog,
  ShieldCheck,
  FileKey,
  Webhook,
  Bot,
  HelpCircle,
  Truck,
} from 'lucide-react';

export interface SubMenu {
  title: string;
  slug: string;
  route: string;
  permissionKey: string;
}

export interface NavItem {
  id: string;
  label: string;
  slug: string;
  icon: any; // using any for Lucide icon component type simplicity
  group: 'main' | 'administration' | 'support';
  route?: string;
  subItems?: SubMenu[];
  permissionKey: string;
  badgeCount?: number;
}

export const navigationConfig: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    slug: 'dashboard',
    icon: LayoutDashboard,
    group: 'main',
    route: '/',
    permissionKey: 'view_dashboard'
  },
  {
    id: 'ai-copilot',
    label: 'AI Copilot',
    slug: 'ai-copilot',
    icon: Bot,
    group: 'main',
    route: '/ai-copilot',
    permissionKey: 'view_ai_copilot'
  },
  {
    id: 'hris',
    label: 'Human Resources',
    slug: 'human-resources',
    icon: Users,
    group: 'main',
    route: '/hris',
    permissionKey: 'view_hris',
    subItems: [
      { title: 'HR Management', slug: 'hr-management', route: '/hris', permissionKey: 'view_hris' },
      { title: 'Workforce Portal', slug: 'workforce-portal', route: '/workforce-portal', permissionKey: 'view_workforce_portal' },
      { title: 'Pay Setup', slug: 'pay-setup', route: '/hris/payroll-management/pay-setup', permissionKey: 'page.hris.payroll.salary-management.view' },
      { title: 'Bank & Finance', slug: 'bank-finance', route: '/hris/payroll-management/bank-finance', permissionKey: 'page.payroll.management.bank-finance.view' },
    ]
  },
  {
    id: 'erp',
    label: 'ERP',
    slug: 'erp',
    icon: Building2,
    group: 'main',
    route: '/erp',
    permissionKey: 'view_erp'
  },
  {
    id: 'finance-accounting',
    label: 'Finance & Accounting',
    slug: 'finance-accounting',
    icon: Banknote,
    group: 'main',
    route: '/finance-accounting',
    permissionKey: 'view_finance_accounting'
  },
  {
    id: 'procurement',
    label: 'Procurement',
    slug: 'procurement',
    icon: Webhook,
    group: 'main',
    route: '/procurement',
    permissionKey: 'view_procurement'
  },
  {
    id: 'eam-cmms',
    label: 'EAM / CMMS',
    slug: 'eam-cmms',
    icon: FileKey,
    group: 'main',
    route: '/eam-cmms',
    permissionKey: 'view_eam_cmms'
  },
  {
    id: 'projects-engineering',
    label: 'Projects & Engineering',
    slug: 'projects-engineering',
    icon: Target,
    group: 'main',
    route: '/projects-engineering',
    permissionKey: 'view_projects_engineering'
  },
  {
    id: 'quality-management',
    label: 'Quality Management',
    slug: 'quality-management',
    icon: Scale,
    group: 'main',
    route: '/quality-management',
    permissionKey: 'view_quality_management'
  },
  {
    id: 'hse-management',
    label: 'HSE Management',
    slug: 'hse-management',
    icon: ShieldCheck,
    group: 'main',
    route: '/hse-management',
    permissionKey: 'view_hse_management'
  },
  {
    id: 'sales-crm',
    label: 'Sales & CRM',
    slug: 'sales-crm',
    icon: Megaphone,
    group: 'main',
    route: '/sales-crm',
    permissionKey: 'view_sales_crm'
  },
  {
    id: 'inventory-management',
    label: 'Inventory Management',
    slug: 'inventory-management',
    icon: Gift,
    group: 'main',
    route: '/inventory-management',
    permissionKey: 'view_inventory_management'
  },
  {
    id: 'logistics-fleet',
    label: 'Logistics & Fleet',
    slug: 'logistics-fleet',
    icon: Truck,
    group: 'main',
    route: '/logistics-fleet',
    permissionKey: '',
  },
  {
    id: 'operations-center',
    label: 'Operations Center',
    slug: 'operations-center',
    icon: Box,
    group: 'main',
    route: '/operations-center',
    permissionKey: 'operations.view',
    subItems: [
      { title: 'Operations Dashboard', slug: 'operations-dashboard', route: '/operations-center', permissionKey: 'operations.dashboard.view' },
      { title: 'Timesheets', slug: 'timesheets', route: '/operations-center/timesheets', permissionKey: 'operations.timesheets.submit' },
      { title: 'Workforce Allocation', slug: 'workforce-allocation', route: '/operations-center/workforce-allocation', permissionKey: 'operations.allocation.view' },
      { title: 'Resource Planning', slug: 'resource-planning', route: '/operations-center/resource-planning', permissionKey: 'operations.resource-planning.view' },
      { title: 'Daily Activity Reports', slug: 'daily-activity-reports', route: '/operations-center/daily-activity-reports', permissionKey: 'operations.daily-reports.create' },
      { title: 'Production Tracking', slug: 'production-tracking', route: '/operations-center/production-tracking', permissionKey: 'operations.production.view' },
    ]
  },
  {
    id: 'document-management',
    label: 'Document Management',
    slug: 'document-management',
    icon: Files,
    group: 'main',
    route: '/document-management',
    permissionKey: 'view_document_management'
  },
  {
    id: 'reports-analytics',
    label: 'Reports & Analytics',
    slug: 'reports-analytics',
    icon: BarChart4,
    group: 'main',
    route: '/reports-analytics',
    permissionKey: 'view_reports_analytics'
  },

  {
    id: 'it-support',
    label: 'IT & Support',
    slug: 'it-support',
    icon: HelpCircle,
    group: 'support',
    route: '/it-support',
    permissionKey: 'view_it_support',
    subItems: [
      { title: 'Service Desk (ITSM)', slug: 'service-desk-itsm', route: '/it-support/service-desk-itsm', permissionKey: 'view_itsm' },
      { title: 'Account Recovery', slug: 'account-recovery', route: '/it-support/account-recovery', permissionKey: 'it.account-recovery.view' },
      { title: 'Knowledge Base', slug: 'knowledge-base', route: '/it-support/knowledge-base', permissionKey: 'view_knowledge_base' },
      { title: 'Asset Management', slug: 'asset-management', route: '/it-support/asset-management', permissionKey: 'view_it_assets' },
      { title: 'Cybersecurity Center', slug: 'cybersecurity-center', route: '/it-support/cybersecurity-center', permissionKey: 'view_cybersecurity' },
      { title: 'System Monitoring', slug: 'system-monitoring', route: '/it-support/system-monitoring', permissionKey: 'view_system_monitoring' },
    ]
  },
  {
    id: 'administration',
    label: 'Administration',
    slug: 'administration',
    icon: UserCog,
    group: 'administration',
    route: '/administration',
    permissionKey: 'view_administration',
    subItems: [
      { title: 'User Management', slug: 'user-management', route: '/administration/user-management', permissionKey: 'admin.users.view' },
      { title: 'Roles & Permissions', slug: 'roles-and-permissions', route: '/administration/access-control', permissionKey: 'admin.roles.view' },
      { title: 'Approval Workflow', slug: 'approval-workflow', route: '/administration/approval-workflow', permissionKey: 'workflow.configure' },
      { title: 'System Settings', slug: 'system-settings', route: '/administration/system-settings', permissionKey: 'security.configure' },
      { title: 'Backup & Disaster Recovery', slug: 'backup-disaster-recovery', route: '/administration/backup-disaster-recovery', permissionKey: 'backup.configure' },
      { title: 'Audit Trail', slug: 'audit-trail', route: '/administration/audit-trail', permissionKey: 'audit.view' },
      { title: 'Integrations', slug: 'integrations', route: '/administration/integrations', permissionKey: 'integration.view' },
      { title: 'AI & Automation', slug: 'ai-and-automation', route: '/administration/ai-and-automation', permissionKey: 'it.view' },
      { title: 'Compliance & Governance', slug: 'compliance-and-governance', route: '/administration/compliance-and-governance', permissionKey: 'audit.view' },
    ]
  },
];
