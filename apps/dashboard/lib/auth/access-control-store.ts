import { access, readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { expandPublishedPermissions } from '@/lib/auth/permission-match';
import {
  applyHrisExclusionForRoles,
  applyHrisExclusionForSubject,
  PLATFORM_ROLES_WITHOUT_HRIS,
  PLATFORM_WITHOUT_HRIS_PERMISSIONS,
  stripHrisPermissions,
} from '@/lib/auth/platform-access';
import {
  assertActorCanGrantPermissions,
  canActorModifyRole,
  isSuperActor,
} from '@/lib/auth/role-delegation';
import { enterpriseRoles, permissionsForRoles, roleDefinitions } from '@/lib/auth/rbac';
import type { SessionPayload } from '@/lib/auth/session';

export const accessActions = [
  'view',
  'create',
  'edit',
  'delete',
  'submit',
  'review',
  'approve',
  'reject',
  'return',
  'process',
  'post',
  'release',
  'publish',
  'lock',
  'unlock',
  'reopen',
  'export',
  'import',
  'print',
  'upload',
  'download',
  'configure',
  'audit',
  'enable',
  'disable',
  'assign',
  'delegate',
  'escalate',
  'override',
  'mask',
  'unmask',
  'sync',
  'schedule',
  'notify',
  'impersonate',
] as const;

export type AccessAction = typeof accessActions[number];
export type PermissionScope = 'role' | 'user';
export type AccessStatus = 'draft' | 'published' | 'pending-approval';

export type PermissionNode = {
  module: string;
  subModule: string;
  feature: string;
  functionName: string;
  category: 'Module' | 'Workflow' | 'Report' | 'Dashboard' | 'API' | 'System' | 'Page' | 'Button' | 'Dropdown';
  approvalLevel: string;
  dataScope: 'Own' | 'Team' | 'Department' | 'Location' | 'Company' | 'Global';
  permissionPrefix: string;
  protected?: boolean;
};

export type PermissionAssignment = {
  subjectType: PermissionScope;
  subjectId: string;
  permissions: string[];
  dataScope: PermissionNode['dataScope'];
  approvalLevel: string;
  status: AccessStatus;
  reason: string;
  updatedAt: string;
  updatedBy: string;
};

export type PermissionTemplate = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  dataScope: PermissionNode['dataScope'];
  approvalLevel: string;
};

export type AccessAuditRecord = {
  id: string;
  modifiedBy: string;
  modifiedAt: string;
  roleOrUserAffected: string;
  permissionChanged: string;
  oldValue: string;
  newValue: string;
  reason: string;
  ipAddress: string;
  device: string;
};

type AccessControlState = {
  published: PermissionAssignment[];
  drafts: PermissionAssignment[];
  templates: PermissionTemplate[];
  audit: AccessAuditRecord[];
};

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'auth');
const ACCESS_PATH = path.join(DATA_DIR, 'access-control.json');
const ACCESS_STATE_KEY = 'global-access-control-centre';
const ACCESS_STATE_CACHE_MS = Number(process.env.ACCESS_CONTROL_STATE_CACHE_MS || 0);

let dbReady: Promise<sql.ConnectionPool> | null = null;
let cachedAccessState: { state: AccessControlState; expiresAt: number } | null = null;

export const invalidateAccessControlStateCache = () => {
  cachedAccessState = null;
};

const nowIso = () => new Date().toISOString();
const compact = (value: unknown) => String(value || '').trim();
const id = (prefix: string) => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const unique = (values: string[]) => Array.from(new Set(values.map(compact).filter(Boolean))).sort();

const client = (headers: Headers) => ({
  ip: compact(headers.get('x-forwarded-for')).split(',')[0] || compact(headers.get('x-real-ip')) || 'local',
  device: compact(headers.get('user-agent')) || 'Unknown device',
});

const node = (
  module: string,
  subModule: string,
  feature: string,
  functionName: string,
  category: PermissionNode['category'],
  approvalLevel: string,
  dataScope: PermissionNode['dataScope'],
  permissionPrefix: string,
  protectedNode = false,
): PermissionNode => ({ module, subModule, feature, functionName, category, approvalLevel, dataScope, permissionPrefix, protected: protectedNode });

export const permissionCatalog: PermissionNode[] = [
  node('Administration', 'Access Control', 'Roles & Permissions', 'Access Control Centre', 'System', 'L3 - Super Admin', 'Global', 'admin.roles', true),
  node('Administration', 'User Management', 'User Accounts', 'Account Administration', 'System', 'L3 - Super Admin', 'Global', 'admin.users', true),
  node('Administration', 'Backup & Disaster Recovery', 'Backup Centre', 'Enterprise Backup Operations', 'System', 'L3 - Super Admin', 'Global', 'backup', true),
  node('Administration', 'Audit Trail', 'Security Audit', 'Audit Review', 'System', 'L3 - Super Admin', 'Global', 'audit', true),
  node('Security', 'Authentication', 'Login & Sessions', 'Session Control', 'System', 'L3 - Super Admin', 'Global', 'security', true),
  node('Integration', 'APIs', 'External Interfaces', 'API Access', 'API', 'L3 - Super Admin', 'Global', 'integration'),
  node('Enterprise', 'Home', 'Enterprise Shell', 'Application Access', 'Module', 'L1 - User', 'Company', 'enterprise'),
  node('Dashboard', 'Executive', 'Executive HR Dashboard', 'Dashboard Access', 'Dashboard', 'L2 - Manager', 'Company', 'dashboard'),
  node('Page Access', 'Enterprise', 'Enterprise Home', 'Landing Dashboard Page', 'Page', 'L1 - User', 'Company', 'page.enterprise.home'),
  node('Page Access', 'HRIS', 'HR Management', 'HRIS Portal Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.management'),
  node('Page Access', 'Employee Self Service', 'Workforce Portal', 'ESS Portal Page', 'Page', 'L1 - User', 'Own', 'page.workforce.portal'),
  node('Page Access', 'Payroll', 'Payroll Management', 'Payroll Workspace Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.payroll.management'),
  node('Page Access', 'Payroll', 'Bank & Finance', 'Bank & Finance Workspace', 'Page', 'L3 - Finance Approver', 'Company', 'page.payroll.management.bank-finance'),
  node('Page Access', 'Payroll', 'Payroll Approval Workspace', 'Payroll Approval Center', 'Page', 'L3 - Payroll Approver', 'Company', 'page.payroll.management.approval'),
  node('Page Access', 'Operations', 'Operations Center', 'Operations Workspace Page', 'Page', 'L2 - Manager', 'Company', 'page.operations.center'),
  node('Page Access', 'Administration', 'Access Control Centre', 'Access Control Page', 'Page', 'L3 - Super Admin', 'Global', 'page.admin.access-control', true),
  node('Page Access', 'Administration', 'Backup & Disaster Recovery', 'Backup Centre Page', 'Page', 'L3 - Super Admin', 'Global', 'page.admin.backup-disaster-recovery', true),
  node('Button Access', 'Administration', 'Access Control Centre', 'Publish Permissions Button', 'Button', 'L3 - Super Admin', 'Global', 'button.admin.access-control.publish', true),
  node('Button Access', 'Administration', 'Backup & Disaster Recovery', 'Configure Backup Policy Button', 'Button', 'L3 - Super Admin', 'Global', 'button.admin.backup.configure', true),
  node('Button Access', 'Administration', 'Backup & Disaster Recovery', 'Run Restore Drill Button', 'Button', 'L3 - Super Admin', 'Global', 'button.admin.backup.restore-drill', true),
  node('Button Access', 'Administration', 'Access Control Centre', 'Save Draft Button', 'Button', 'L3 - Super Admin', 'Global', 'button.admin.access-control.save-draft', true),
  node('Button Access', 'Payroll', 'Employee Salary Setup', 'Export Button', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.employee-salary-setup.export'),
  node('Button Access', 'Operations', 'Operations Center', 'Export Button', 'Button', 'L2 - Manager', 'Company', 'button.operations-center.export'),
  node('Reports & Analytics', 'Reports', 'Enterprise Reports', 'Report Exports', 'Report', 'L2 - Manager', 'Company', 'reports'),
  node('Human Resources', 'HRIS', 'HR Management', 'HRIS Module', 'Module', 'L2 - HR Admin', 'Company', 'hris'),
  node('Human Resources', 'Employees', 'Employee Records', 'Employee Lifecycle', 'Module', 'L2 - HR Admin', 'Department', 'employees'),
  node('Human Resources', 'Leave', 'Leave Management', 'Leave Workflow', 'Workflow', 'L2 - Manager', 'Team', 'leave'),
  node('Human Resources', 'Timesheet', 'Time & Logs', 'Timesheet Workflow', 'Workflow', 'L2 - Manager', 'Team', 'timesheet'),
  node('Human Resources', 'Attendance', 'Attendance Management', 'Attendance Operations', 'Module', 'L1 - Officer', 'Department', 'attendance'),
  node('Human Resources', 'Recruitment', 'Recruitment', 'Hiring Workflow', 'Workflow', 'L2 - HR Admin', 'Department', 'recruitment'),
  node('Human Resources', 'Onboarding', 'Onboarding', 'Employee Onboarding', 'Workflow', 'L2 - HR Admin', 'Department', 'onboarding'),
  node('Human Resources', 'Offboarding', 'Offboarding', 'Exit Workflow', 'Workflow', 'L2 - HR Admin', 'Department', 'offboarding'),
  node('Operations Center', 'Module Access', 'Operations Center', 'Operations Module Access', 'Module', 'L2 - Manager', 'Company', 'operations'),
  node('Operations Center', 'Dashboard', 'Operations Dashboard', 'Operational KPIs', 'Dashboard', 'L2 - Manager', 'Company', 'operations.dashboard'),
  node('Operations Center', 'Timesheets', 'Crew Timesheets', 'Timesheet Execution', 'Workflow', 'L2 - Supervisor', 'Team', 'operations.timesheets'),
  node('Operations Center', 'Timesheet Controls', 'Supervisor Selector', 'Enable Supervisor Dropdown', 'Dropdown', 'L2 - Manager', 'Company', 'operations.timesheets.controls.supervisor'),
  node('Operations Center', 'Timesheet Controls', 'Location Selector', 'Enable Location Dropdown', 'Dropdown', 'L2 - Manager', 'Company', 'operations.timesheets.controls.location'),
  node('Operations Center', 'Timesheet Controls', 'Work Center Selector', 'Enable Work Center Dropdown', 'Dropdown', 'L2 - Manager', 'Company', 'operations.timesheets.controls.work-center'),
  node('Operations Center', 'Timesheet Controls', 'Working Date Selector', 'Enable Working Date Control', 'Dropdown', 'L2 - Manager', 'Company', 'operations.timesheets.controls.working-date'),
  node('Operations Center', 'Workforce Allocation', 'Crew Allocation', 'Manpower Distribution', 'Module', 'L2 - Manager', 'Location', 'operations.allocation'),
  node('Operations Center', 'Resource Planning', 'Resource Demand', 'Capacity Planning', 'Module', 'L2 - Manager', 'Company', 'operations.resource-planning'),
  node('Operations Center', 'Daily Activity Reports', 'Daily Activity Reports', 'Site Reporting', 'Workflow', 'L2 - Supervisor', 'Location', 'operations.daily-reports'),
  node('Operations Center', 'Production Tracking', 'Production Performance', 'Targets vs Actuals', 'Dashboard', 'L2 - Manager', 'Company', 'operations.production'),
  node('Operations Center', 'Cost Control', 'Project Labour Cost', 'Cost Control Review', 'Workflow', 'L3 - Approver', 'Company', 'operations.cost-control'),
  node('Payroll', 'Payroll Management', 'Payroll Processing', 'Payroll Runs', 'Workflow', 'L3 - Payroll Approver', 'Company', 'payroll'),
  node('Finance', 'Finance & Accounting', 'Finance Operations', 'Financial Controls', 'Module', 'L3 - Finance Approver', 'Company', 'finance'),
  node('Finance', 'Budget', 'Budget Control', 'Budget Workflow', 'Workflow', 'L2 - Manager', 'Company', 'budget'),
  node('Finance', 'Treasury', 'Treasury', 'Treasury Operations', 'Module', 'L3 - Finance Approver', 'Company', 'treasury'),
  node('Procurement', 'Procurement', 'Purchase Requests', 'Procurement Workflow', 'Workflow', 'L2 - Manager', 'Company', 'procurement'),
  node('Procurement', 'Vendor', 'Vendor Management', 'Vendor Lifecycle', 'Module', 'L2 - Manager', 'Company', 'vendor'),
  node('Projects & Engineering', 'Projects', 'Project Delivery', 'Project Controls', 'Module', 'L2 - Project Manager', 'Company', 'project'),
  node('Projects & Engineering', 'Planning', 'Project Planning', 'Planning Controls', 'Module', 'L2 - Project Manager', 'Company', 'planning'),
  node('Projects & Engineering', 'Cost', 'Cost Control', 'Cost Approval', 'Workflow', 'L3 - Approver', 'Company', 'cost'),
  node('EAM / CMMS', 'Assets', 'Asset Register', 'Asset Operations', 'Module', 'L2 - Manager', 'Company', 'asset'),
  node('EAM / CMMS', 'Maintenance', 'Maintenance', 'Work Orders', 'Workflow', 'L2 - Manager', 'Company', 'maintenance'),
  node('HSE', 'HSE Management', 'HSE Operations', 'Safety Controls', 'Module', 'L2 - HSE Manager', 'Company', 'hse'),
  node('HSE', 'Incidents', 'Incident Management', 'Incident Workflow', 'Workflow', 'L2 - HSE Manager', 'Company', 'incident'),
  node('HSE', 'Compliance', 'Compliance', 'Compliance Review', 'Workflow', 'L3 - Compliance', 'Company', 'compliance'),
  node('Quality', 'Quality Management', 'Quality Operations', 'Quality Controls', 'Module', 'L2 - Quality Manager', 'Company', 'quality'),
  node('Quality', 'NCR', 'Non-Conformance', 'NCR Review', 'Workflow', 'L2 - Quality Manager', 'Company', 'ncr'),
  node('Quality', 'Corrective Action', 'Corrective Action', 'Corrective Action Workflow', 'Workflow', 'L2 - Quality Manager', 'Company', 'corrective-action'),
  node('Inventory', 'Stores', 'Inventory Management', 'Stock Control', 'Module', 'L2 - Store Manager', 'Company', 'inventory'),
  node('Logistics & Fleet', 'Fleet', 'Fleet Management', 'Fleet Operations', 'Module', 'L2 - Fleet Manager', 'Company', 'fleet'),
  node('Logistics & Fleet', 'Logistics', 'Logistics Operations', 'Logistics Workflow', 'Workflow', 'L2 - Manager', 'Company', 'logistics'),
  node('Logistics & Fleet', 'Drivers', 'Driver Management', 'Driver Controls', 'Module', 'L2 - Supervisor', 'Company', 'driver'),
  node('IT & Support', 'Service Desk', 'ITSM', 'Service Desk Workflow', 'Workflow', 'L2 - IT Admin', 'Company', 'it'),
  node('IT & Support', 'Asset Management', 'IT Assets', 'Asset Lifecycle Operations', 'Module', 'L2 - IT Admin', 'Company', 'it.assets'),
  node('IT & Support', 'Infrastructure', 'Infrastructure', 'Infrastructure Controls', 'Module', 'L3 - IT Admin', 'Global', 'infrastructure'),
  node('IT & Support', 'Application Support', 'Application Support', 'Application Controls', 'Module', 'L2 - IT Admin', 'Global', 'application-support'),
  node('Document Management', 'Documents', 'Documents', 'Document Workflow', 'Workflow', 'L2 - Document Controller', 'Company', 'documents'),
  node('Employee Self Service', 'ESS', 'Workforce Portal', 'Employee Self Service', 'Module', 'L1 - User', 'Own', 'ess'),
  node('Employee Self Service', 'Profile', 'Employee Profile', 'Profile Access', 'Module', 'L1 - User', 'Own', 'profile'),
  node('Workflow', 'Approvals', 'Approval Engine', 'Workflow Approval', 'Workflow', 'L2 - Manager', 'Team', 'workflow'),
];

permissionCatalog.push(
  node('Page Access', 'Employees', 'Employee Directory', 'Employee Directory Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.employees.employee-directory'),
  node('Page Access', 'Employees', 'Add New Employee', 'Employee Creation Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.employees.add-new-employee'),
  node('Page Access', 'Employees', 'Employee Profile', 'Employee Profile Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.employee-profile'),
  node('Page Access', 'Employees', 'Job Information', 'Job Information Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.job-information'),
  node('Page Access', 'Employees', 'Department & Unit Assignment', 'Assignment Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.department-assignment'),
  node('Page Access', 'Employees', 'Reporting Line', 'Reporting Line Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.reporting-line'),
  node('Page Access', 'Employees', 'Employment History', 'Employment History Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.employment-history'),
  node('Page Access', 'Employees', 'Employee Status', 'Employee Status Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.employee-status'),
  node('Page Access', 'Employees', 'Employee Confirmation', 'Confirmation Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.confirmation'),
  node('Page Access', 'Employees', 'Employee Promotion', 'Promotion Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.promotion'),
  node('Page Access', 'Employees', 'Employee Exit Status', 'Exit Status Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.exit-status'),
  node('Page Access', 'Employees', 'Emergency Contacts', 'Emergency Contacts Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.emergency-contacts'),
  node('Page Access', 'Employees', 'Next of Kin', 'Next of Kin Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.next-of-kin'),
  node('Page Access', 'Employees', 'Employee Documents', 'Employee Documents Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.documents'),
  node('Page Access', 'Employees', 'Employee Timeline', 'Employee Timeline Page', 'Page', 'L2 - HR Admin', 'Department', 'page.hris.employees.timeline'),

  node('Employee Data', 'Identity', 'Personal Information', 'DOB, Gender, Marital Status, Nationality', 'Module', 'L2 - HR Admin', 'Department', 'data.employee.personal'),
  node('Employee Data', 'Contact', 'Contact Information', 'Email, Phone, Address', 'Module', 'L2 - HR Admin', 'Department', 'data.employee.contact'),
  node('Employee Data', 'Banking', 'Bank Details', 'Bank Name, Account Number, Account Name', 'Module', 'L3 - Payroll Approver', 'Company', 'data.employee.bank'),
  node('Employee Data', 'Payroll', 'Compensation Details', 'Salary, Grade, Allowances, Deductions', 'Module', 'L3 - Payroll Approver', 'Company', 'data.employee.payroll'),
  node('Employee Data', 'Statutory', 'Tax/Pension/NHF Details', 'Tax ID, Pension PIN, NHF/NHIA Numbers', 'Module', 'L3 - Payroll Approver', 'Company', 'data.employee.statutory'),
  node('Employee Data', 'Medical', 'Medical Records', 'Restricted Medical Information', 'Module', 'L3 - Compliance', 'Own', 'data.employee.medical'),
  node('Employee Data', 'Documents', 'Confidential Documents', 'Contracts, IDs, Certificates, Letters', 'Module', 'L2 - HR Admin', 'Department', 'data.employee.documents'),
  node('Employee Data', 'Audit', 'Employee Change History', 'Before/After Change Tracking', 'System', 'L3 - Super Admin', 'Company', 'data.employee.audit'),

  node('Page Access', 'Organization', 'Company Structure', 'Company Structure Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.company-structure'),
  node('Page Access', 'Organization', 'Departments', 'Departments Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.departments'),
  node('Page Access', 'Organization', 'Units & Sections', 'Units & Sections Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.units-sections'),
  node('Page Access', 'Organization', 'Job Grades', 'Job Grades Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.job-grades'),
  node('Page Access', 'Organization', 'Job Titles', 'Job Titles Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.job-titles'),
  node('Page Access', 'Organization', 'Positions', 'Positions Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.positions'),
  node('Page Access', 'Organization', 'Locations & Sites', 'Locations & Sites Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.locations-sites'),
  node('Page Access', 'Organization', 'Work Centers', 'Work Centers Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.work-centers'),
  node('Page Access', 'Organization', 'Reporting Hierarchy', 'Reporting Hierarchy Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.reporting-hierarchy'),
  node('Page Access', 'Organization', 'Organogram', 'Organogram Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.organogram'),
  node('Page Access', 'Organization', 'Vacancy Management', 'Vacancy Management Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.vacancy-management'),
  node('Page Access', 'Organization', 'Workforce Planning', 'Workforce Planning Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.organization.workforce-planning'),

  node('Page Access', 'Attendance', 'Attendance Register', 'Attendance Register Page', 'Page', 'L2 - Manager', 'Department', 'page.hris.attendance.register'),
  node('Page Access', 'Attendance', 'Biometric Attendance', 'Biometric Attendance Page', 'Page', 'L2 - Manager', 'Location', 'page.hris.attendance.biometric'),
  node('Page Access', 'Attendance', 'Clock In Clock Out', 'Clock In/Out Page', 'Page', 'L2 - Manager', 'Location', 'page.hris.attendance.clock'),
  node('Page Access', 'Attendance', 'Daily Attendance', 'Daily Attendance Page', 'Page', 'L2 - Manager', 'Location', 'page.hris.attendance.daily'),
  node('Page Access', 'Attendance', 'Mobile Attendance', 'Mobile Attendance Page', 'Page', 'L2 - Manager', 'Location', 'page.hris.attendance.mobile'),
  node('Page Access', 'Attendance', 'Site Attendance', 'Site Attendance Page', 'Page', 'L2 - Manager', 'Location', 'page.hris.attendance.site'),

  node('Page Access', 'Time & Logs', 'Timesheet Entry', 'Timesheet Entry Page', 'Page', 'L2 - Supervisor', 'Team', 'page.hris.time-and-logs.timesheet-entry'),
  node('Page Access', 'Time & Logs', 'Timesheet Approval', 'Timesheet Approval Page', 'Page', 'L2 - Manager', 'Team', 'page.hris.time-and-logs.timesheet-approval'),
  node('Page Access', 'Time & Logs', 'Timesheet Reports', 'Timesheet Reports Page', 'Page', 'L2 - Manager', 'Company', 'page.hris.time-and-logs.timesheet-reports'),
  node('Page Access', 'Time & Logs', 'Timesheet Period', 'Timesheet Period Page', 'Page', 'L2 - HR Admin', 'Company', 'page.hris.time-and-logs.timesheet-period'),
  node('Timesheet', 'Period Control', 'Timesheet Period Management', 'Open, Close, and Lock Timesheet Periods', 'Workflow', 'L2 - HR Admin', 'Company', 'timesheet.period'),
  node('Payroll', 'Period Control', 'Payroll Period Management', 'Open, Close, and Reopen Payroll Periods', 'Workflow', 'L3 - Payroll Approver', 'Company', 'payroll.period'),
  node('Leave', 'Approval', 'Line Manager Leave Approval', 'Supervisor / Line Manager Leave Review', 'Workflow', 'L2 - Manager', 'Team', 'leave.workflow.line-manager'),
  node('Leave', 'Approval', 'HR Leave Approval', 'HR Manager Leave Review', 'Workflow', 'L2 - HR Admin', 'Company', 'leave.workflow.hr'),
  node('Leave', 'Approval', 'Leave Email Authorization', 'Authenticated Leave Email Approve/Reject', 'API', 'L2 - Manager', 'Team', 'leave.workflow.email-action'),
  node('Payroll', 'Approval', 'MD / CEO Payroll Approval', 'Executive Payroll Sign-off', 'Workflow', 'L3 - Executive Approver', 'Company', 'payroll.workflow.md-approval'),

  node('Timesheet', 'Entry', 'Timesheet Entry', 'Capture and Save Timesheet Lines', 'Workflow', 'L2 - Supervisor', 'Team', 'timesheet.entry'),
  node('Timesheet', 'Submission', 'Timesheet Submission', 'Submit Timesheet for Approval', 'Workflow', 'L2 - Supervisor', 'Team', 'timesheet.submission'),
  node('Timesheet', 'Supervisor Review', 'Supervisor Approval', 'Approve/Return/Reject Supervisor Stage', 'Workflow', 'L2 - Supervisor', 'Team', 'timesheet.supervisor'),
  node('Timesheet', 'Cost Control Review', 'Cost Control Approval', 'Validate Cost Centre, Charge Code, Budget', 'Workflow', 'L3 - Approver', 'Company', 'timesheet.cost-control'),
  node('Timesheet', 'Project Manager Review', 'Project Approval', 'Approve Project-Specific Time', 'Workflow', 'L2 - Project Manager', 'Team', 'timesheet.project-manager'),
  node('Timesheet', 'HR Review', 'HR Approval', 'Payroll Readiness Review', 'Workflow', 'L2 - HR Admin', 'Company', 'timesheet.hr'),
  node('Timesheet', 'Payroll Processing', 'Payroll Hours Processing', 'Consolidate Approved Hours', 'Workflow', 'L3 - Payroll Approver', 'Company', 'timesheet.payroll'),
  node('Timesheet', 'Payroll Posting', 'Timesheet Payroll Posting', 'Post Approved Hours to Payroll', 'Workflow', 'L3 - Payroll Approver', 'Company', 'timesheet.payroll-posting'),
  node('Timesheet', 'Bulk Operations', 'Bulk Timesheet Actions', 'Bulk Approve/Return/Reject/Export', 'Button', 'L3 - Approver', 'Company', 'button.timesheet.bulk-actions'),
  node('Timesheet', 'Reports', 'Timesheet Reports', 'Timesheet Reporting and Analytics', 'Report', 'L2 - Manager', 'Company', 'reports.timesheet'),

  node('Page Access', 'Payroll', 'Salary Management', 'Payroll Administration Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.salary-management'),
  node('Page Access', 'Payroll', 'Salary Structure', 'Salary Structure Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.salary-structure'),
  node('Page Access', 'Payroll', 'Employee Salary Setup', 'Employee Salary Setup Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.employee-salary-setup'),
  node('Page Access', 'Payroll', 'Sage Migration Review', 'Sage Migration Review Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.sage-migration-review'),
  node('Page Access', 'Payroll', 'Sage Reconciliation', 'Sage Reconciliation Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.sage-reconciliation'),
  node('Page Access', 'Payroll', 'Allowances', 'Allowances Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.allowances'),
  node('Page Access', 'Payroll', 'Deductions', 'Deductions Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.deductions'),
  node('Page Access', 'Payroll', 'Daily Rate Pay', 'Daily Rate Pay Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.daily-rate-pay'),
  node('Page Access', 'Payroll', 'Overtime Pay', 'Overtime Pay Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.overtime-pay'),
  node('Page Access', 'Payroll', 'Payroll Processing', 'Payroll Processing Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.processing'),
  node('Page Access', 'Payroll', 'Payroll Approval', 'Payroll Approval Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.approval'),
  node('Page Access', 'Payroll', 'Payslip Generation', 'Payslip Generation Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.payslip-generation'),
  node('Page Access', 'Payroll', 'Tax PAYE', 'PAYE Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.tax-paye'),
  node('Page Access', 'Payroll', 'Pension', 'Pension Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.pension'),
  node('Page Access', 'Payroll', 'NHF NSITF ITF', 'Statutory Funds Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.statutory-funds'),
  node('Page Access', 'Payroll', 'Loans & Salary Advances', 'Loans Page', 'Page', 'L3 - Payroll Approver', 'Company', 'page.hris.payroll.loans'),

  node('Payroll Controls', 'Command Center', 'Validate Payroll', 'Run Payroll Validation', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.validate'),
  node('Payroll Controls', 'Command Center', 'Run Payroll', 'Compute Payroll', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.run'),
  node('Payroll Controls', 'Command Center', 'Submit Payroll', 'Submit Payroll for Approval', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.submit'),
  node('Payroll Controls', 'Approval', 'HR Payroll Review', 'HR Payroll Approval Stage', 'Workflow', 'L2 - HR Admin', 'Company', 'payroll.workflow.hr-review'),
  node('Payroll Controls', 'Approval', 'Finance Payroll Review', 'Finance Payroll Approval Stage', 'Workflow', 'L3 - Finance Approver', 'Company', 'payroll.workflow.finance-review'),
  node('Payroll Controls', 'Approval', 'CFO Approval', 'Final Payroll Approval', 'Workflow', 'L3 - Finance Approver', 'Company', 'payroll.workflow.cfo-approval'),
  node('Payroll Controls', 'Approval', 'Global Payroll Workflow Override', 'Approve Entire Payroll Workflow End-to-End', 'Button', 'L3 - Super Admin', 'Global', 'payroll.workflow.global-override', true),
  node('Payroll Controls', 'Release', 'Release Payroll', 'Release Approved Payroll', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.release'),
  node('Payroll Controls', 'Locking', 'Payroll Lock', 'Lock Payroll Period and Transactions', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.lock'),
  node('Payroll Controls', 'Reopening', 'Payroll Reopening', 'Reopen Closed Payroll Period', 'Workflow', 'L3 - Finance Approver', 'Company', 'payroll.workflow.reopen'),
  node('Payroll Controls', 'Posting', 'Payroll Posting', 'Post Payroll to Finance', 'Button', 'L3 - Finance Approver', 'Company', 'button.payroll.post'),
  node('Payroll Outputs', 'Payslips', 'Publish Payslips', 'Publish Payslips to ESS', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.payslips.publish'),
  node('Payroll Outputs', 'Payslips', 'Download Payslips', 'Bulk Payslip Download', 'Button', 'L3 - Payroll Approver', 'Company', 'button.payroll.payslips.download'),
  node('Payroll Outputs', 'Bank Schedule', 'Generate Bank Schedule', 'Salary Bank Schedule', 'Report', 'L3 - Finance Approver', 'Company', 'reports.payroll.bank-schedule'),
  node('Payroll Outputs', 'Payroll Register', 'Payroll Register', 'Payroll Register Export', 'Report', 'L3 - Payroll Approver', 'Company', 'reports.payroll.register'),
  node('Payroll Outputs', 'Statutory', 'PAYE Schedule', 'PAYE Statutory Output', 'Report', 'L3 - Payroll Approver', 'Company', 'reports.payroll.paye'),
  node('Payroll Outputs', 'Statutory', 'Pension Schedule', 'Pension Statutory Output', 'Report', 'L3 - Payroll Approver', 'Company', 'reports.payroll.pension'),
  node('Payroll Outputs', 'Statutory', 'NHF Schedule', 'NHF Statutory Output', 'Report', 'L3 - Payroll Approver', 'Company', 'reports.payroll.nhf'),
  node('Payroll Outputs', 'Statutory', 'NSITF Schedule', 'NSITF Statutory Output', 'Report', 'L3 - Payroll Approver', 'Company', 'reports.payroll.nsitf'),
  node('Payroll Outputs', 'Statutory', 'ITF Schedule', 'ITF Statutory Output', 'Report', 'L3 - Payroll Approver', 'Company', 'reports.payroll.itf'),

  node('Reports & Analytics', 'Dashboards', 'HR Operations Dashboard', 'HR Operations Dashboard Access', 'Dashboard', 'L2 - HR Admin', 'Company', 'dashboard.hr-operations'),
  node('Reports & Analytics', 'Dashboards', 'Executive HR Dashboard', 'Executive HR Dashboard Access', 'Dashboard', 'L3 - Approver', 'Company', 'dashboard.executive-hr'),
  node('Reports & Analytics', 'Exports', 'Excel Export', 'Excel Export Control', 'Button', 'L2 - Manager', 'Company', 'button.exports.excel'),
  node('Reports & Analytics', 'Exports', 'PDF Export', 'PDF Export Control', 'Button', 'L2 - Manager', 'Company', 'button.exports.pdf'),
  node('Reports & Analytics', 'Exports', 'CSV Export', 'CSV Export Control', 'Button', 'L2 - Manager', 'Company', 'button.exports.csv'),
  node('Reports & Analytics', 'Schedules', 'Scheduled Reports', 'Scheduled Report Delivery', 'Report', 'L2 - Manager', 'Company', 'reports.schedule'),
  node('Reports & Analytics', 'Subscriptions', 'Report Subscriptions', 'Email and In-App Report Delivery', 'Report', 'L2 - Manager', 'Company', 'reports.subscription'),
  node('Reports & Analytics', 'Power BI', 'Power BI / Fabric', 'Analytics Platform Integration', 'API', 'L3 - Super Admin', 'Global', 'integration.analytics.powerbi'),

  node('Integration', 'Sage Payroll', 'Sage Payroll Migration', 'Sage Payroll Sync and Review', 'API', 'L3 - Super Admin', 'Global', 'integration.sage.payroll'),
  node('Integration', 'Sage ERP', 'Sage ERP Finance', 'Sage Finance Integration', 'API', 'L3 - Super Admin', 'Global', 'integration.sage.erp'),
  node('Integration', 'Biometric Devices', 'Biometric Attendance Sync', 'Device/API Sync', 'API', 'L3 - IT Admin', 'Global', 'integration.biometric'),
  node('Integration', 'Email', 'Email Notifications', 'Email Delivery Control', 'API', 'L3 - IT Admin', 'Global', 'integration.email'),
  node('Integration', 'ESS', 'Employee Self-Service Publishing', 'ESS Data Publishing', 'API', 'L3 - Payroll Approver', 'Company', 'integration.ess'),

  node('Administration', 'Workflow Configuration', 'Approval Workflow Setup', 'Approval Levels, Delegation, Escalation', 'System', 'L3 - Super Admin', 'Global', 'admin.workflow'),
  node('Administration', 'Notifications', 'Notification Rules', 'Email and In-App Notification Configuration', 'System', 'L3 - Super Admin', 'Global', 'admin.notifications'),
  node('Administration', 'Data Retention', 'Retention Policies', 'Retention, Archive, Purge Controls', 'System', 'L3 - Super Admin', 'Global', 'admin.retention'),
  node('Administration', 'Impersonation', 'User Impersonation', 'Support Impersonation with Audit', 'System', 'L3 - Super Admin', 'Global', 'admin.impersonation', true),

  node('Page Access', 'Workforce Management', 'Overtime Management', 'Overtime Management Page', 'Page', 'L2 - Manager', 'Company', 'page.hris.workforce-management.overtime-management'),
  node('Overtime Authorization', 'Request', 'Pre-Overtime Authorization', 'Create Production Overtime Authorization', 'Workflow', 'L2 - Production Manager', 'Company', 'overtime.authorization'),
  node('Overtime Authorization', 'Project Manager Approval', 'Project Manager Overtime Approval', 'Approve or Reject Project Overtime', 'Workflow', 'L2 - Project Manager', 'Company', 'overtime.authorization.project-manager'),
  node('Overtime Authorization', 'MD Approval', 'MD Overtime Approval', 'Final MD Overtime Approval', 'Workflow', 'L3 - Executive Approver', 'Company', 'overtime.authorization.md'),
  node('Overtime Authorization', 'Super Administrator Override', 'Approve Entire Overtime Workflow', 'Override Remaining Overtime Stages', 'Button', 'L3 - Super Admin', 'Global', 'overtime.authorization.override', true),
  node('Overtime Authorization', 'Email Actions', 'Email Approve/Reject Links', 'Tokenized Email Approval Endpoint', 'API', 'L3 - Approver', 'Company', 'overtime.authorization.email-action'),
  node('Overtime Authorization', 'Supervisor Notification', 'Approved Overtime Booking Notice', 'Notify Supervisor After Final Approval', 'Workflow', 'L2 - Supervisor', 'Team', 'overtime.authorization.supervisor-notify'),
  node('Overtime Authorization', 'Email Notifications', 'Overtime Approval Email Delivery', 'Send Approval Emails and Outbox Records', 'API', 'L3 - IT Admin', 'Global', 'overtime.notification.email'),
  node('Overtime Authorization', 'Bell Notifications', 'Overtime In-App Notifications', 'Send Bell Notifications', 'API', 'L2 - Manager', 'Company', 'overtime.notification.in-app'),

  node('Page Access', 'IT & Support', 'Asset Management', 'IT Asset Management Page', 'Page', 'L2 - IT Admin', 'Company', 'page.it-support.asset-management'),
  node('Button Access', 'IT & Support', 'Asset Management', 'Export Asset Records', 'Button', 'L2 - IT Admin', 'Company', 'button.it-support.asset-management.export'),

  node('Timesheet Controls', 'Searchable Selectors', 'Search Supervisor Dropdown', 'Search and Select Supervisor', 'Dropdown', 'L2 - Manager', 'Company', 'timesheet.controls.supervisor-search'),
  node('Timesheet Controls', 'Searchable Selectors', 'Search Location Dropdown', 'Search and Select Location', 'Dropdown', 'L2 - Manager', 'Company', 'timesheet.controls.location-search'),
  node('Timesheet Controls', 'Searchable Selectors', 'Search Work Center Dropdown', 'Search and Select Work Center', 'Dropdown', 'L2 - Manager', 'Company', 'timesheet.controls.work-center-search'),
  node('Timesheet Controls', 'Work Centers', 'Manage Work Centers', 'Add, Edit, or Disable Work Centers', 'Button', 'L2 - HR Admin', 'Company', 'timesheet.work-center'),
  node('Timesheet Controls', 'Work Centers', 'Maintenance Work Center', 'Maintenance Work Center Access', 'Dropdown', 'L2 - Manager', 'Company', 'timesheet.work-center.maintenance'),
  node('Reporting Line', 'Supervisor Assignment', 'Maintenance Manager Assignment', 'Assign Maintenance Employees to Maintenance Manager', 'Workflow', 'L2 - HR Admin', 'Department', 'reporting-line.maintenance-assignment'),
  node('Reporting Line', 'Supervisor Assignment', 'Bulk Supervisor Reassignment', 'Bulk Update Reporting Manager', 'Button', 'L2 - HR Admin', 'Department', 'reporting-line.bulk-reassignment'),
);

const allCatalogPermissions = () => permissionCatalog.flatMap((item) => accessActions.map((action) => `${item.permissionPrefix}.${action}`));

const defaultTemplates = (): PermissionTemplate[] => {
  const all = allCatalogPermissions();
  const pick = (...prefixes: string[]) => all.filter((item) => prefixes.some((prefix) => item.startsWith(`${prefix}.`)));
  return [
    {
      id: 'tpl-platform-no-hris',
      name: 'Platform Admin (Exclude HRIS)',
      description: 'Full DLE Connect platform access for Admin / System Administrator roles, excluding HR Management / HRIS.',
      permissions: stripHrisPermissions([
        ...PLATFORM_WITHOUT_HRIS_PERMISSIONS,
        ...all.filter((item) => !item.startsWith('hris.')
          && !item.startsWith('employees.')
          && !item.startsWith('leave.')
          && !item.startsWith('payroll.')
          && !item.startsWith('page.hris.')
          && !item.startsWith('page.payroll.')
          && !item.startsWith('overtime.')
          && !item.startsWith('reporting-line.')
          && !item.startsWith('performance.')
          && !item.startsWith('recruitment.')
          && !item.startsWith('onboarding.')
          && !item.startsWith('offboarding.')
          && !item.startsWith('attendance.')
          && !item.startsWith('benefits.')),
      ]),
      dataScope: 'Global',
      approvalLevel: 'L3 - Super Admin',
    },
    { id: 'tpl-read-only', name: 'Read Only', description: 'View, export, print, and download only.', permissions: all.filter((item) => /\.(view|export|print|download)$/.test(item)), dataScope: 'Company', approvalLevel: 'L1 - User' },
    { id: 'tpl-module-admin', name: 'Module Administrator', description: 'Operational administration without security override.', permissions: all.filter((item) => !item.startsWith('security.') && !item.startsWith('audit.') && !item.startsWith('admin.roles.')), dataScope: 'Company', approvalLevel: 'L2 - Manager' },
    { id: 'tpl-approver', name: 'Approver', description: 'Workflow review and decision permissions.', permissions: all.filter((item) => /\.(view|approve|reject|export)$/.test(item)), dataScope: 'Team', approvalLevel: 'L2 - Manager' },
    {
      id: 'tpl-overtime-pm-approver',
      name: 'Overtime Project Manager Approver',
      description: 'View overtime requests and approve or reject at the project manager stage.',
      permissions: [
        'page.hris.workforce-management.overtime-management.view',
        'overtime.authorization.view',
        'overtime.authorization.project-manager.approve',
        'overtime.authorization.project-manager.reject',
        'overtime.authorization.export',
      ],
      dataScope: 'Company',
      approvalLevel: 'L2 - Project Manager',
    },
    {
      id: 'tpl-overtime-md-approver',
      name: 'Overtime MD Approver',
      description: 'Final executive approval for authorized overtime requests.',
      permissions: [
        'page.hris.workforce-management.overtime-management.view',
        'overtime.authorization.view',
        'overtime.authorization.md.approve',
        'overtime.authorization.md.reject',
        'overtime.authorization.export',
      ],
      dataScope: 'Company',
      approvalLevel: 'L3 - Executive Approver',
    },
    {
      id: 'tpl-timesheet-supervisor-approver',
      name: 'Timesheet Supervisor Approver',
      description: 'Review and approve submitted timesheets at the supervisor stage.',
      permissions: [
        'page.hris.time-and-logs.timesheet-approval.view',
        'timesheet.supervisor.approve',
        'timesheet.supervisor.reject',
        'timesheet.supervisor.return',
        'timesheet.view',
        'timesheet.export',
        'operations.timesheets.view',
        'operations.timesheets.approve',
      ],
      dataScope: 'Team',
      approvalLevel: 'L2 - Manager',
    },
    {
      id: 'tpl-timesheet-cost-control-approver',
      name: 'Timesheet Cost Control Approver',
      description: 'Validate cost centre and charge codes during timesheet approval.',
      permissions: pick('timesheet.cost-control', 'timesheet', 'operations.timesheets', 'page.hris.time-and-logs.timesheet-approval').filter((item) => /\.(view|approve|reject|return|export)$/.test(item)),
      dataScope: 'Company',
      approvalLevel: 'L3 - Approver',
    },
    {
      id: 'tpl-finance-payroll-operator',
      name: 'Finance Payroll Operator',
      description: 'Bank schedule, journal posting, and finance payroll outputs only. No full payroll workspace access.',
      permissions: [
        'page.payroll.management.bank-finance.view',
        'page.payroll.management.bank-finance.export',
        'reports.payroll.bank-schedule.view',
        'reports.payroll.bank-schedule.export',
        'button.payroll.post.view',
        'button.payroll.post.post',
        'payroll.workflow.finance-review.view',
        'payroll.workflow.finance-review.approve',
        'finance.view',
        'finance.export',
        'reports.view',
      ],
      dataScope: 'Company',
      approvalLevel: 'L3 - Finance Approver',
    },
    {
      id: 'tpl-overtime-requestor',
      name: 'Overtime Requestor',
      description: 'Create and submit pre-overtime authorization requests.',
      permissions: [
        'page.hris.workforce-management.overtime-management.view',
        'overtime.authorization.view',
        'overtime.authorization.create',
        'overtime.authorization.submit',
      ],
      dataScope: 'Company',
      approvalLevel: 'L2 - Production Manager',
    },
  ];
};

const defaultState = (): AccessControlState => ({ published: [], drafts: [], templates: defaultTemplates(), audit: [] });

const readLegacyState = async () => {
  try {
    await access(ACCESS_PATH);
    const parsed = JSON.parse(await readFile(ACCESS_PATH, 'utf8')) as AccessControlState;
    return { ...defaultState(), ...parsed, templates: parsed.templates?.length ? parsed.templates : defaultTemplates() };
  } catch {
    return defaultState();
  }
};

const ensureAccessControlSchema = async (pool: sql.ConnectionPool) => {
  await pool.request().query(`
IF SCHEMA_ID(N'security') IS NULL EXEC(N'CREATE SCHEMA [security]');
IF OBJECT_ID(N'[security].[AccessControlState]', N'U') IS NULL
CREATE TABLE [security].[AccessControlState] (
  [StateKey] NVARCHAR(120) NOT NULL CONSTRAINT [PK_AccessControlState] PRIMARY KEY,
  [StateJson] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AccessControlState_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AccessControlState_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [CK_AccessControlState_StateJson] CHECK (ISJSON([StateJson]) = 1)
);
IF OBJECT_ID(N'[security].[AccessControlAudit]', N'U') IS NULL
CREATE TABLE [security].[AccessControlAudit] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_AccessControlAudit] PRIMARY KEY,
  [ModifiedBy] NVARCHAR(150) NOT NULL,
  [ModifiedAt] DATETIME2(0) NOT NULL,
  [RoleOrUserAffected] NVARCHAR(260) NOT NULL,
  [PermissionChanged] NVARCHAR(MAX) NOT NULL,
  [OldValue] NVARCHAR(MAX) NOT NULL,
  [NewValue] NVARCHAR(MAX) NOT NULL,
  [Reason] NVARCHAR(600) NOT NULL,
  [IpAddress] NVARCHAR(100) NOT NULL,
  [Device] NVARCHAR(600) NOT NULL
);`);
  const existing = await pool.request()
    .input('StateKey', sql.NVarChar(120), ACCESS_STATE_KEY)
    .query(`SELECT [StateKey] FROM [security].[AccessControlState] WHERE [StateKey]=@StateKey`);
  if (!existing.recordset.length) {
    const legacy = await readLegacyState();
    await pool.request()
      .input('StateKey', sql.NVarChar(120), ACCESS_STATE_KEY)
      .input('StateJson', sql.NVarChar(sql.MAX), JSON.stringify(legacy))
      .query(`INSERT [security].[AccessControlState] ([StateKey],[StateJson]) VALUES (@StateKey,@StateJson)`);
  }
};

const db = async () => {
  if (!dbReady) {
    dbReady = (async () => {
      const pool = await getDleEnterpriseDbPool();
      if (!pool) throw new Error('DLE Enterprise database is not configured. Access Control Centre data must be stored in the database.');
      await ensureAccessControlSchema(pool);
      return pool;
    })().catch((error) => {
      dbReady = null;
      throw error;
    });
  }
  return dbReady;
};

const mergeTemplates = (existing: PermissionTemplate[] = []) => {
  const defaults = defaultTemplates();
  const known = new Set(existing.map((item) => item.id));
  return [...existing, ...defaults.filter((item) => !known.has(item.id))];
};

const normalizeState = (state: AccessControlState): AccessControlState => ({
  ...defaultState(),
  ...state,
  templates: mergeTemplates(state.templates?.length ? state.templates : defaultTemplates()),
  published: Array.isArray(state.published) ? state.published : [],
  drafts: Array.isArray(state.drafts) ? state.drafts : [],
  audit: Array.isArray(state.audit) ? state.audit : [],
});

const readState = async () => {
  const now = Date.now();
  if (cachedAccessState && cachedAccessState.expiresAt > now) return cachedAccessState.state;

  const pool = await db();
  const result = await pool.request()
    .input('StateKey', sql.NVarChar(120), ACCESS_STATE_KEY)
    .query(`SELECT [StateJson] FROM [security].[AccessControlState] WHERE [StateKey]=@StateKey`);
  const state = result.recordset[0]?.StateJson ? JSON.parse(result.recordset[0].StateJson) as AccessControlState : defaultState();
  const normalized = normalizeState(state);
  cachedAccessState = { state: normalized, expiresAt: now + ACCESS_STATE_CACHE_MS };
  return normalized;
};

const writeState = async (state: AccessControlState) => {
  const pool = await db();
  await pool.request()
    .input('StateKey', sql.NVarChar(120), ACCESS_STATE_KEY)
    .input('StateJson', sql.NVarChar(sql.MAX), JSON.stringify(normalizeState(state)))
    .query(`
MERGE [security].[AccessControlState] AS target
USING (SELECT @StateKey AS [StateKey]) AS source ON target.[StateKey]=source.[StateKey]
WHEN MATCHED THEN UPDATE SET [StateJson]=@StateJson,[UpdatedAt]=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([StateKey],[StateJson]) VALUES (@StateKey,@StateJson);`);
  invalidateAccessControlStateCache();
};

const isProtectedPermission = (permission: string) => permission === '*' || ['admin.roles', 'admin.users', 'audit', 'security'].some((prefix) => permission === `${prefix}.*` || permission.startsWith(`${prefix}.`));

const assignmentKey = (assignment: Pick<PermissionAssignment, 'subjectType' | 'subjectId'>) => `${assignment.subjectType}:${assignment.subjectId}`;

const baselinePermissions = (subjectType: PermissionScope, subjectId: string) => {
  if (subjectType === 'role' && enterpriseRoles.includes(subjectId as any)) return permissionsForRoles([subjectId]);
  return [] as string[];
};

export const readAccessControlPayload = async () => {
  const state = await readState();
  return {
    catalog: permissionCatalog,
    actions: accessActions,
    roles: roleDefinitions,
    templates: state.templates,
    published: state.published,
    drafts: state.drafts,
    audit: state.audit,
  };
};

export const effectivePermissionsForRoles = async (roles: string[]) => {
  if (roles.includes('Super Administrator')) return ['*'];
  const state = await readState();
  const base = permissionsForRoles(roles);
  const published = state.published
    .filter((item) => item.subjectType === 'role' && roles.includes(item.subjectId) && item.status === 'published')
    .flatMap((item) => item.permissions);
  return applyHrisExclusionForRoles(unique([...base, ...published]), roles);
};

const resolveEffectivePermissions = (state: AccessControlState, userId: string, roles: string[]) => {
  if (roles.includes('Super Administrator') || userId === 'global-admin') return ['*'];
  const base = permissionsForRoles(roles);
  const roleGrants = state.published
    .filter((item) => item.subjectType === 'role' && roles.includes(item.subjectId) && item.status === 'published')
    .flatMap((item) => item.permissions);
  const userGrants = state.published
    .filter((item) => item.subjectType === 'user' && item.subjectId === userId && item.status === 'published')
    .flatMap((item) => item.permissions);
  return applyHrisExclusionForRoles(unique([...base, ...roleGrants, ...userGrants]), roles);
};

export const effectivePermissionsForUser = async (userId: string, roles: string[]) => {
  const state = await readState();
  return resolveEffectivePermissions(state, userId, roles);
};

export const effectivePermissionsForUsers = async (entries: Array<{ id: string; roles: string[] }>) => {
  const state = await readState();
  return entries.map((entry) => resolveEffectivePermissions(state, entry.id, entry.roles));
};

export const saveAccessAssignment = async (
  payload: Partial<PermissionAssignment> & { publish?: boolean; requireApproval?: boolean },
  headers: Headers,
  actor: SessionPayload,
) => {
  const subjectType = payload.subjectType === 'user' ? 'user' : 'role';
  const subjectId = compact(payload.subjectId);
  if (!subjectId) throw new Error('Select a role or user before saving permissions.');
  if (subjectType === 'role' && subjectId === 'Super Administrator') throw new Error('The Super Administrator role is protected and cannot be edited, restricted, or demoted.');
  if (subjectType === 'user' && ['global-admin', 'Admin'].includes(subjectId)) throw new Error('The protected default Super Administrator account cannot be edited, disabled, restricted, or demoted.');

  const actorIsSuper = isSuperActor(actor);
  let requested = unique(expandPublishedPermissions(Array.isArray(payload.permissions) ? payload.permissions : []));
  if (subjectType === 'role' && PLATFORM_ROLES_WITHOUT_HRIS.has(subjectId)) {
    requested = stripHrisPermissions(requested);
  }
  if (subjectType === 'role' && !canActorModifyRole(actor.roles, subjectId, actorIsSuper)) {
    throw new Error('You cannot modify permissions for a role higher than your own access level.');
  }
  if (!actorIsSuper && requested.some(isProtectedPermission)) throw new Error('Admins cannot change security, audit, authentication, system control, or Super Administrator permissions.');
  assertActorCanGrantPermissions(actor.permissions, requested, actorIsSuper);

  const riskyActions = ['delete', 'disable', 'assign', 'override', 'approve', 'post', 'release', 'lock', 'unlock', 'reopen', 'unmask', 'sync', 'delegate', 'escalate', 'impersonate'];
  const risky = requested.filter((permission) => riskyActions.some((action) => permission.endsWith(`.${action}`)) || isProtectedPermission(permission));
  const status: AccessStatus = payload.requireApproval && !actorIsSuper ? 'pending-approval' : payload.publish ? 'published' : 'draft';
  const state = await readState();
  const targetList = status === 'published' ? 'published' : 'drafts';
  const key = assignmentKey({ subjectType, subjectId });
  const previous = [...state.published, ...state.drafts].find((item) => assignmentKey(item) === key);
  const assignment: PermissionAssignment = {
    subjectType,
    subjectId,
    permissions: requested,
    dataScope: payload.dataScope || 'Company',
    approvalLevel: payload.approvalLevel || 'L1 - User',
    status,
    reason: compact(payload.reason),
    updatedAt: nowIso(),
    updatedBy: actor.username,
  };

  state.published = state.published.filter((item) => assignmentKey(item) !== key);
  state.drafts = state.drafts.filter((item) => assignmentKey(item) !== key);
  state[targetList].unshift(assignment);

  const { ip, device } = client(headers);
  const auditRecord: AccessAuditRecord = {
    id: id('acl'),
    modifiedBy: actor.username,
    modifiedAt: nowIso(),
    roleOrUserAffected: `${subjectType}:${subjectId}`,
    permissionChanged: requested.join(', ') || 'No permissions selected',
    oldValue: JSON.stringify(previous || { permissions: baselinePermissions(subjectType, subjectId) }),
    newValue: JSON.stringify(assignment),
    reason: assignment.reason || (status === 'draft' ? 'Saved as draft' : 'Published permission change'),
    ipAddress: ip,
    device,
  };
  state.audit.unshift(auditRecord);
  state.audit = state.audit.slice(0, 1000);
  await writeState(state);
  await appendAccessAuditRecord(auditRecord);
  return { assignment, warnings: buildPermissionWarnings(requested, subjectId), risky };
};

const appendAccessAuditRecord = async (record: AccessAuditRecord) => {
  const pool = await db();
  await pool.request()
    .input('Id', sql.NVarChar(80), record.id)
    .input('ModifiedBy', sql.NVarChar(150), record.modifiedBy)
    .input('ModifiedAt', sql.DateTime2, new Date(record.modifiedAt))
    .input('RoleOrUserAffected', sql.NVarChar(260), record.roleOrUserAffected)
    .input('PermissionChanged', sql.NVarChar(sql.MAX), record.permissionChanged)
    .input('OldValue', sql.NVarChar(sql.MAX), record.oldValue)
    .input('NewValue', sql.NVarChar(sql.MAX), record.newValue)
    .input('Reason', sql.NVarChar(600), record.reason)
    .input('IpAddress', sql.NVarChar(100), record.ipAddress)
    .input('Device', sql.NVarChar(600), record.device)
    .query(`
IF NOT EXISTS (SELECT 1 FROM [security].[AccessControlAudit] WHERE [Id]=@Id)
INSERT [security].[AccessControlAudit] (
  [Id],[ModifiedBy],[ModifiedAt],[RoleOrUserAffected],[PermissionChanged],[OldValue],[NewValue],[Reason],[IpAddress],[Device]
) VALUES (
  @Id,@ModifiedBy,@ModifiedAt,@RoleOrUserAffected,@PermissionChanged,@OldValue,@NewValue,@Reason,@IpAddress,@Device
);`);
};

export const cloneRolePermissions = async (sourceRole: string, targetRole: string, headers: Headers, actor: SessionPayload, reason = '') => {
  if (targetRole === 'Super Administrator') throw new Error('The Super Administrator role is protected and cannot receive cloned changes.');
  const actorIsSuper = isSuperActor(actor);
  if (!canActorModifyRole(actor.roles, sourceRole, actorIsSuper) || !canActorModifyRole(actor.roles, targetRole, actorIsSuper)) {
    throw new Error('You cannot clone permissions for roles above your own access level.');
  }
  const permissions = await effectivePermissionsForRoles([sourceRole]);
  return saveAccessAssignment({ subjectType: 'role', subjectId: targetRole, permissions, publish: false, reason: reason || `Cloned from ${sourceRole}` }, headers, actor);
};

/** One-click: publish a role's baseline RBAC permissions (and platform-no-HRIS pack when applicable). */
export const publishRoleBaselinePermissions = async (
  targetRole: string,
  headers: Headers,
  actor: SessionPayload,
  options?: { includePlatformPack?: boolean; reason?: string },
) => {
  if (targetRole === 'Super Administrator') throw new Error('The Super Administrator role is protected and cannot receive published changes.');
  if (!isSuperActor(actor)) throw new Error('Only the Global Super Administrator can publish role baselines in one step.');
  const baseline = permissionsForRoles([targetRole]);
  const platformPack = PLATFORM_ROLES_WITHOUT_HRIS.has(targetRole) || options?.includePlatformPack
    ? [...PLATFORM_WITHOUT_HRIS_PERMISSIONS]
    : [];
  const permissions = applyHrisExclusionForSubject(
    unique([...baseline, ...platformPack]),
    'role',
    targetRole,
  );
  return saveAccessAssignment({
    subjectType: 'role',
    subjectId: targetRole,
    permissions,
    dataScope: 'Global',
    approvalLevel: 'L3 - Super Admin',
    publish: true,
    reason: options?.reason || `Published baseline permissions for ${targetRole}`,
  }, headers, actor);
};

export const compareRolePermissions = async (leftRole: string, rightRole: string) => {
  const [left, right] = await Promise.all([effectivePermissionsForRoles([leftRole]), effectivePermissionsForRoles([rightRole])]);
  return {
    leftOnly: left.filter((item) => !right.includes(item)),
    rightOnly: right.filter((item) => !left.includes(item)),
    shared: left.filter((item) => right.includes(item)),
  };
};

export const buildPermissionWarnings = (permissions: string[], subjectId: string) => {
  const warnings: string[] = [];
  const hasApprove = permissions.some((item) => item.endsWith('.approve'));
  const hasCreateOrEdit = permissions.some((item) => item.endsWith('.create') || item.endsWith('.edit'));
  const hasOverride = permissions.some((item) => item.endsWith('.override'));
  if (hasApprove && hasCreateOrEdit) warnings.push('Segregation of Duties: create/edit and approve are assigned together.');
  if (hasOverride) warnings.push('Risk warning: override permissions bypass normal workflow checks.');
  if (permissions.some((item) => item.endsWith('.post') || item.endsWith('.release') || item.endsWith('.lock') || item.endsWith('.reopen'))) warnings.push('Payroll/finance risk: posting, release, locking, or reopening permissions are selected.');
  if (permissions.some((item) => item.endsWith('.unmask') || item.endsWith('.impersonate'))) warnings.push('Sensitive access risk: unmasking or impersonation permissions are selected.');
  if (permissions.some((item) => item.endsWith('.sync'))) warnings.push('Integration risk: external system synchronization permissions are selected.');
  if (permissions.some(isProtectedPermission) && subjectId !== 'Super Administrator') warnings.push('Security-sensitive permissions are included and require Super Administrator ownership.');
  if (permissions.some((item) => item.endsWith('.delete') || item.endsWith('.disable'))) warnings.push('Risk warning: destructive disable/delete permissions are selected.');
  return warnings;
};
