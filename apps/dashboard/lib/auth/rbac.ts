import { PLATFORM_WITHOUT_HRIS_PERMISSIONS } from '@/lib/auth/platform-access';

export const actions = ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'reject', 'export', 'import', 'configure', 'audit'] as const;

export const enterpriseRoles = [
  'Super Administrator',
  'Admin',
  'System Administrator',
  'Application Administrator',
  'Security Administrator',
  'Audit Administrator',
  'Integration Administrator',
  'Executive User',
  'Department Head',
  'Manager',
  'Supervisor',
  'Employee',
  'Auditor',
  'Read-Only User',
  'HR Administrator',
  'HR Manager',
  'HR Officer',
  'Recruitment Officer',
  'Onboarding Officer',
  'Offboarding Officer',
  'Employee Records Officer',
  'Payroll Administrator',
  'Payroll Officer',
  'Payroll Supervisor',
  'Payroll Approver',
  'Payroll Auditor',
  'Finance Payroll Reviewer',
  'Finance Administrator',
  'Finance Manager',
  'Accountant',
  'Accounts Payable Officer',
  'Accounts Receivable Officer',
  'Budget Officer',
  'Treasury Officer',
  'Procurement Administrator',
  'Procurement Officer',
  'Procurement Manager',
  'Vendor Manager',
  'Purchase Request Approver',
  'Project Administrator',
  'Project Manager',
  'Project Engineer',
  'Project Planner',
  'Project Cost Controller',
  'Operations Manager',
  'Operations Officer',
  'Cost Control Officer',
  'Asset Administrator',
  'Maintenance Manager',
  'Maintenance Planner',
  'Maintenance Technician',
  'Asset Custodian',
  'HSE Administrator',
  'HSE Manager',
  'HSE Officer',
  'Incident Investigator',
  'Compliance Reviewer',
  'Quality Administrator',
  'Quality Manager',
  'Quality Inspector',
  'NCR Reviewer',
  'Corrective Action Owner',
  'Inventory Administrator',
  'Store Manager',
  'Store Officer',
  'Inventory Controller',
  'Stock Approver',
  'Fleet Administrator',
  'Fleet Manager',
  'Logistics Officer',
  'Driver Supervisor',
  'Vehicle Custodian',
  'IT Administrator',
  'IT Support Officer',
  'Service Desk Agent',
  'Infrastructure Officer',
  'Application Support Officer',
  'Document Administrator',
  'Document Controller',
  'Document Reviewer',
  'Document Approver',
  'Document Viewer',
] as const;

export type EnterpriseRole = typeof enterpriseRoles[number];

export type RoleDefinition = {
  name: EnterpriseRole;
  category: string;
  permissions: string[];
  description: string;
};

const crud = (module: string) => actions.map((action) => `${module}.${action}`);
const read = (module: string) => [`${module}.view`, `${module}.export`];

const financeBankFinancePerms = [
  'page.payroll.management.bank-finance.view',
  'reports.payroll.bank-schedule.view',
  'reports.payroll.bank-schedule.export',
  'button.payroll.post.view',
  'button.payroll.post.post',
  'payroll.workflow.finance-review.view',
  'payroll.workflow.finance-review.approve',
  'finance.view',
  'finance.export',
];

const role = (name: EnterpriseRole, category: string, permissions: string[], description: string): RoleDefinition => ({
  name,
  category,
  permissions: Array.from(new Set(permissions)),
  description,
});

const platformWithoutHris = [...PLATFORM_WITHOUT_HRIS_PERMISSIONS];

export const roleDefinitions: RoleDefinition[] = [
  role('Super Administrator', 'Global / System', ['*'], 'Unrestricted emergency system administration including HRIS.'),
  role('Admin', 'Global / System', platformWithoutHris, 'Full platform administration across DLE Connect modules except HRIS / HR Management. Only Super Administrators may access HRIS.'),
  role('System Administrator', 'Global / System', platformWithoutHris, 'System and platform operations across all modules except HRIS / HR Management. Only Super Administrators may access HRIS.'),
  role('Application Administrator', 'Global / System', ['admin.*', 'hris.*', 'workflow.*'], 'Application configuration and module administration.'),
  role('Security Administrator', 'Global / System', ['security.*', 'admin.users.view', 'admin.users.edit', 'audit.view'], 'Identity, session, lockout, MFA, and access control operations.'),
  role('Audit Administrator', 'Global / System', ['audit.*', 'admin.roles.view', 'admin.users.view'], 'Security and compliance audit administration.'),
  role('Integration Administrator', 'Global / System', ['integration.*', 'admin.roles.view', 'audit.view'], 'ERP, AD, SSO, API, and service integration administration.'),
  role('Executive User', 'General Enterprise', ['enterprise.view', 'dashboard.view', 'reports.view', 'reports.export', 'hris.view', 'operations.view', 'operations.dashboard.view', 'operations.reports.view'], 'Executive dashboard and reports access.'),
  role('Department Head', 'General Enterprise', ['hris.view', 'employees.view', 'workflow.approve', 'reports.view', 'operations.view', 'operations.allocation.view', 'operations.dashboard.view'], 'Department-level visibility and approvals.'),
  role('Manager', 'General Enterprise', ['hris.view', 'employees.view', 'workflow.approve', 'leave.approve', 'timesheet.approve', 'operations.view', 'operations.timesheets.approve', 'operations.allocation.view'], 'Team management and approvals.'),
  role('Supervisor', 'General Enterprise', ['hris.view', 'employees.view', 'timesheet.submit', 'timesheet.approve', 'attendance.view', 'operations.view', 'operations.timesheets.submit', 'operations.timesheets.approve', 'operations.daily-reports.create'], 'Supervisor timesheet and attendance review.'),
  role('Employee', 'General Enterprise', ['ess.view', 'profile.view', 'leave.submit', 'timesheet.submit', 'payroll.payslip.view'], 'Employee self-service access.'),
  role('Auditor', 'General Enterprise', ['audit.view', 'reports.view', 'reports.export'], 'Read-oriented compliance review.'),
  role('Read-Only User', 'General Enterprise', ['enterprise.view', 'hris.view', 'reports.view'], 'Read-only enterprise visibility.'),
  role('HR Administrator', 'HRIS', ['hris.*', 'employees.*', 'leave.*', 'workflow.*'], 'Full HRIS administration.'),
  role('HR Manager', 'HRIS', ['hris.view', ...crud('employees'), ...crud('leave'), 'workflow.approve', 'reports.view', 'reports.export'], 'HR management and approval authority.'),
  role('HR Officer', 'HRIS', ['hris.view', 'employees.view', 'employees.create', 'employees.edit', 'leave.view', 'leave.edit', 'reports.view'], 'HR operations and records maintenance.'),
  role('Recruitment Officer', 'HRIS', ['recruitment.*', 'employees.view', 'onboarding.submit'], 'Recruitment and hiring workflows.'),
  role('Onboarding Officer', 'HRIS', ['onboarding.*', 'employees.view', 'employees.edit'], 'Onboarding and employee setup.'),
  role('Offboarding Officer', 'HRIS', ['offboarding.*', 'employees.view', 'employees.edit'], 'Exit management and offboarding.'),
  role('Employee Records Officer', 'HRIS', ['employees.view', 'employees.create', 'employees.edit', 'documents.view', 'documents.edit'], 'Employee records and document control.'),
  role('Payroll Administrator', 'Payroll', ['payroll.*'], 'Full payroll administration.'),
  role('Payroll Officer', 'Payroll', ['payroll.view', 'payroll.create', 'payroll.edit', 'payroll.export', 'payroll.payslip.view'], 'Payroll processing operations.'),
  role('Payroll Supervisor', 'Payroll', ['payroll.view', 'payroll.edit', 'payroll.approve', 'payroll.export'], 'Payroll supervision.'),
  role('Payroll Approver', 'Payroll', ['payroll.view', 'payroll.approve', 'payroll.reject'], 'Payroll approval authority.'),
  role('Payroll Auditor', 'Payroll', ['payroll.view', 'payroll.audit', 'audit.view', 'reports.export'], 'Payroll audit access.'),
  role('Finance Payroll Reviewer', 'Payroll', [...financeBankFinancePerms, 'payroll.approve', 'payroll.reject'], 'Finance-side bank schedule, journal posting, and payroll review.'),
  role('Finance Administrator', 'Finance', ['finance.*', ...financeBankFinancePerms], 'Finance module administration.'),
  role('Finance Manager', 'Finance', [...financeBankFinancePerms, 'finance.approve', 'reports.view'], 'Finance management with bank-and-finance payroll workspace access only.'),
  role('Accountant', 'Finance', [...financeBankFinancePerms, 'finance.create', 'finance.edit'], 'Accounting transactions and bank-and-finance payroll outputs.'),
  role('Accounts Payable Officer', 'Finance', ['finance.ap.view', 'finance.ap.create', 'finance.ap.edit'], 'Accounts payable operations.'),
  role('Accounts Receivable Officer', 'Finance', ['finance.ar.view', 'finance.ar.create', 'finance.ar.edit'], 'Accounts receivable operations.'),
  role('Budget Officer', 'Finance', ['budget.view', 'budget.create', 'budget.edit', 'budget.export'], 'Budget management.'),
  role('Treasury Officer', 'Finance', [...financeBankFinancePerms, 'treasury.view', 'treasury.create', 'treasury.edit'], 'Treasury operations and bank payment outputs.'),
  role('Procurement Administrator', 'Procurement', ['procurement.*'], 'Procurement administration.'),
  role('Procurement Officer', 'Procurement', ['procurement.view', 'procurement.create', 'procurement.edit'], 'Procurement operations.'),
  role('Procurement Manager', 'Procurement', ['procurement.view', 'procurement.approve', 'procurement.export'], 'Procurement management.'),
  role('Vendor Manager', 'Procurement', ['vendor.view', 'vendor.create', 'vendor.edit', 'vendor.approve'], 'Vendor administration.'),
  role('Purchase Request Approver', 'Procurement', ['procurement.view', 'procurement.approve', 'procurement.reject'], 'Purchase request approvals.'),
  role('Project Administrator', 'Project', ['project.*'], 'Project module administration.'),
  role('Project Manager', 'Project', ['project.view', 'project.create', 'project.edit', 'project.approve', 'timesheet.approve', 'operations.view', 'operations.timesheets.approve', 'operations.production.view', 'operations.reports.view'], 'Project delivery and approvals.'),
  role('Project Engineer', 'Project', ['project.view', 'project.edit', 'timesheet.submit', 'operations.view', 'operations.daily-reports.create', 'operations.production.view'], 'Engineering project execution.'),
  role('Project Planner', 'Project', ['project.view', 'planning.view', 'planning.create', 'planning.edit', 'operations.view', 'operations.resource-planning.view', 'operations.resource-planning.edit'], 'Project planning.'),
  role('Project Cost Controller', 'Project', ['project.view', 'cost.view', 'cost.approve', 'timesheet.approve', 'operations.view', 'operations.cost-control.view', 'operations.timesheets.approve', 'operations.reports.view'], 'Project cost control.'),
  role('Operations Manager', 'Operations', ['operations.*', 'timesheet.approve', 'reports.view', 'reports.export'], 'Operations execution, workforce allocation, and production oversight.'),
  role('Operations Officer', 'Operations', ['operations.view', 'operations.timesheets.submit', 'operations.allocation.view', 'operations.daily-reports.create', 'operations.production.view'], 'Daily operations execution and reporting.'),
  role('Cost Control Officer', 'Operations', ['operations.view', 'operations.cost-control.view', 'operations.timesheets.approve', 'operations.reports.view', 'cost.view', 'cost.approve'], 'Operations cost control and labor allocation review.'),
  role('Asset Administrator', 'EAM / CMMS', ['asset.*'], 'Asset administration.'),
  role('Maintenance Manager', 'EAM / CMMS', ['maintenance.view', 'maintenance.approve', 'asset.view'], 'Maintenance management.'),
  role('Maintenance Planner', 'EAM / CMMS', ['maintenance.view', 'maintenance.create', 'maintenance.edit'], 'Maintenance planning.'),
  role('Maintenance Technician', 'EAM / CMMS', ['maintenance.view', 'maintenance.submit', 'asset.view'], 'Maintenance execution.'),
  role('Asset Custodian', 'EAM / CMMS', ['asset.view', 'asset.submit'], 'Assigned asset custody.'),
  role('HSE Administrator', 'HSE', ['hse.*'], 'HSE administration.'),
  role('HSE Manager', 'HSE', ['hse.view', 'hse.approve', 'hse.export'], 'HSE management.'),
  role('HSE Officer', 'HSE', ['hse.view', 'hse.create', 'hse.edit'], 'HSE operations.'),
  role('Incident Investigator', 'HSE', ['incident.view', 'incident.create', 'incident.edit', 'incident.submit'], 'Incident investigation.'),
  role('Compliance Reviewer', 'HSE', ['compliance.view', 'compliance.approve', 'audit.view'], 'Compliance review.'),
  role('Quality Administrator', 'Quality', ['quality.*'], 'Quality administration.'),
  role('Quality Manager', 'Quality', ['quality.view', 'quality.approve', 'quality.export'], 'Quality management.'),
  role('Quality Inspector', 'Quality', ['quality.view', 'quality.create', 'quality.edit'], 'Inspection operations.'),
  role('NCR Reviewer', 'Quality', ['ncr.view', 'ncr.approve', 'ncr.reject'], 'NCR reviews.'),
  role('Corrective Action Owner', 'Quality', ['corrective-action.view', 'corrective-action.edit', 'corrective-action.submit'], 'Corrective action execution.'),
  role('Inventory Administrator', 'Inventory', ['inventory.*'], 'Inventory administration.'),
  role('Store Manager', 'Inventory', ['inventory.view', 'inventory.approve', 'inventory.export'], 'Store management.'),
  role('Store Officer', 'Inventory', ['inventory.view', 'inventory.create', 'inventory.edit'], 'Store operations.'),
  role('Inventory Controller', 'Inventory', ['inventory.view', 'inventory.edit', 'inventory.audit'], 'Inventory control.'),
  role('Stock Approver', 'Inventory', ['inventory.view', 'inventory.approve', 'inventory.reject'], 'Stock approvals.'),
  role('Fleet Administrator', 'Logistics & Fleet', ['fleet.*'], 'Fleet administration.'),
  role('Fleet Manager', 'Logistics & Fleet', ['fleet.view', 'fleet.approve', 'fleet.export'], 'Fleet management.'),
  role('Logistics Officer', 'Logistics & Fleet', ['logistics.view', 'logistics.create', 'logistics.edit'], 'Logistics operations.'),
  role('Driver Supervisor', 'Logistics & Fleet', ['driver.view', 'driver.approve', 'fleet.view'], 'Driver supervision.'),
  role('Vehicle Custodian', 'Logistics & Fleet', ['fleet.view', 'fleet.submit'], 'Vehicle custody.'),
  role('IT Administrator', 'IT Support', ['it.*', 'it.assets.*', 'view_it_assets'], 'IT platform administration without global access-control rights.'),
  role('IT Support Officer', 'IT Support', ['it.view', 'it.create', 'it.edit', 'it.assets.view', 'it.assets.create', 'it.assets.edit', 'view_it_assets'], 'IT support operations.'),
  role('Service Desk Agent', 'IT Support', ['service-desk.view', 'service-desk.create', 'service-desk.edit'], 'Service desk operations.'),
  role('Infrastructure Officer', 'IT Support', ['infrastructure.view', 'infrastructure.edit'], 'Infrastructure support.'),
  role('Application Support Officer', 'IT Support', ['application-support.view', 'application-support.edit'], 'Application support.'),
  role('Document Administrator', 'Document Management', ['documents.*'], 'Document management administration.'),
  role('Document Controller', 'Document Management', ['documents.view', 'documents.create', 'documents.edit', 'documents.configure'], 'Document control.'),
  role('Document Reviewer', 'Document Management', ['documents.view', 'documents.approve', 'documents.reject'], 'Document review.'),
  role('Document Approver', 'Document Management', ['documents.view', 'documents.approve'], 'Document approval.'),
  role('Document Viewer', 'Document Management', ['documents.view'], 'Document viewing.'),
];

const roleMap = new Map(roleDefinitions.map((item) => [item.name, item]));

export const permissionsForRoles = (roles: string[]) => {
  if (roles.includes('Super Administrator')) return ['*'];
  return Array.from(new Set(['enterprise.view', ...roles.flatMap((item) => roleMap.get(item as EnterpriseRole)?.permissions || [])]));
};

export const roleCategory = (roleName: string) => roleMap.get(roleName as EnterpriseRole)?.category || 'Custom';

export const defaultRoleForEmployee = (
  jobTitle: string,
  department: string,
  options?: { employeeCode?: string; employmentType?: string },
) => {
  const text = `${jobTitle} ${department} ${options?.employmentType || ''}`.toLowerCase();
  const code = String(options?.employeeCode || '').trim().toUpperCase();
  if (/^IT\d+/.test(code) || /industrial train|it student|intern|trainee|nysc/i.test(text)) return 'Employee';
  if (text.includes('payroll')) return 'Payroll Officer';
  if (text.includes('human') || text.includes('hr')) return 'HR Officer';
  if (text.includes('finance') || text.includes('account')) return 'Accountant';
  if (text.includes('procurement') || text.includes('purchase')) return 'Procurement Officer';
  if (text.includes('hse') || text.includes('safety')) return 'HSE Officer';
  if (text.includes('quality') || text.includes('qc')) return 'Quality Inspector';
  if (/it administrator|systems administrator|system administrator|ict manager|network administrator/i.test(text)) return 'IT Administrator';
  if (text.includes('information technology') || text.includes('ict')) {
    if (/support|helpdesk|service desk/i.test(text)) return 'IT Support Officer';
    return 'IT Support Officer';
  }
  if (text.includes('manager') || text.includes('head')) return 'Manager';
  if (text.includes('supervisor')) return 'Supervisor';
  return 'Employee';
};
