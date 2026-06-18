import { access, readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { enterpriseRoles, permissionsForRoles, roleDefinitions } from '@/lib/auth/rbac';
import type { SessionPayload } from '@/lib/auth/session';

export const accessActions = ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'export', 'print', 'upload', 'download', 'enable', 'disable', 'assign', 'override'] as const;

export type AccessAction = typeof accessActions[number];
export type PermissionScope = 'role' | 'user';
export type AccessStatus = 'draft' | 'published' | 'pending-approval';

export type PermissionNode = {
  module: string;
  subModule: string;
  feature: string;
  functionName: string;
  category: 'Module' | 'Workflow' | 'Report' | 'Dashboard' | 'API' | 'System';
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
  node('Administration', 'Audit Trail', 'Security Audit', 'Audit Review', 'System', 'L3 - Super Admin', 'Global', 'audit', true),
  node('Security', 'Authentication', 'Login & Sessions', 'Session Control', 'System', 'L3 - Super Admin', 'Global', 'security', true),
  node('Integration', 'APIs', 'External Interfaces', 'API Access', 'API', 'L3 - Super Admin', 'Global', 'integration'),
  node('Enterprise', 'Home', 'Enterprise Shell', 'Application Access', 'Module', 'L1 - User', 'Company', 'enterprise'),
  node('Dashboard', 'Executive', 'Executive HR Dashboard', 'Dashboard Access', 'Dashboard', 'L2 - Manager', 'Company', 'dashboard'),
  node('Reports & Analytics', 'Reports', 'Enterprise Reports', 'Report Exports', 'Report', 'L2 - Manager', 'Company', 'reports'),
  node('Human Resources', 'HRIS', 'HR Management', 'HRIS Module', 'Module', 'L2 - HR Admin', 'Company', 'hris'),
  node('Human Resources', 'Employees', 'Employee Records', 'Employee Lifecycle', 'Module', 'L2 - HR Admin', 'Department', 'employees'),
  node('Human Resources', 'Leave', 'Leave Management', 'Leave Workflow', 'Workflow', 'L2 - Manager', 'Team', 'leave'),
  node('Human Resources', 'Timesheet', 'Time & Logs', 'Timesheet Workflow', 'Workflow', 'L2 - Manager', 'Team', 'timesheet'),
  node('Human Resources', 'Attendance', 'Attendance Management', 'Attendance Operations', 'Module', 'L1 - Officer', 'Department', 'attendance'),
  node('Human Resources', 'Recruitment', 'Recruitment', 'Hiring Workflow', 'Workflow', 'L2 - HR Admin', 'Department', 'recruitment'),
  node('Human Resources', 'Onboarding', 'Onboarding', 'Employee Onboarding', 'Workflow', 'L2 - HR Admin', 'Department', 'onboarding'),
  node('Human Resources', 'Offboarding', 'Offboarding', 'Exit Workflow', 'Workflow', 'L2 - HR Admin', 'Department', 'offboarding'),
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
  node('IT & Support', 'Infrastructure', 'Infrastructure', 'Infrastructure Controls', 'Module', 'L3 - IT Admin', 'Global', 'infrastructure'),
  node('IT & Support', 'Application Support', 'Application Support', 'Application Controls', 'Module', 'L2 - IT Admin', 'Global', 'application-support'),
  node('Document Management', 'Documents', 'Documents', 'Document Workflow', 'Workflow', 'L2 - Document Controller', 'Company', 'documents'),
  node('Employee Self Service', 'ESS', 'Workforce Portal', 'Employee Self Service', 'Module', 'L1 - User', 'Own', 'ess'),
  node('Employee Self Service', 'Profile', 'Employee Profile', 'Profile Access', 'Module', 'L1 - User', 'Own', 'profile'),
  node('Workflow', 'Approvals', 'Approval Engine', 'Workflow Approval', 'Workflow', 'L2 - Manager', 'Team', 'workflow'),
];

const allCatalogPermissions = () => permissionCatalog.flatMap((item) => accessActions.map((action) => `${item.permissionPrefix}.${action}`));

const defaultTemplates = (): PermissionTemplate[] => [
  { id: 'tpl-read-only', name: 'Read Only', description: 'View, export, print, and download only.', permissions: allCatalogPermissions().filter((item) => /\.(view|export|print|download)$/.test(item)), dataScope: 'Company', approvalLevel: 'L1 - User' },
  { id: 'tpl-module-admin', name: 'Module Administrator', description: 'Operational administration without security override.', permissions: allCatalogPermissions().filter((item) => !item.startsWith('security.') && !item.startsWith('audit.') && !item.startsWith('admin.roles.')), dataScope: 'Company', approvalLevel: 'L2 - Manager' },
  { id: 'tpl-approver', name: 'Approver', description: 'Workflow review and decision permissions.', permissions: allCatalogPermissions().filter((item) => /\.(view|approve|reject|export)$/.test(item)), dataScope: 'Team', approvalLevel: 'L2 - Manager' },
];

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

const db = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Access Control Centre data must be stored in the database.');
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
  return pool;
};

const normalizeState = (state: AccessControlState): AccessControlState => ({
  ...defaultState(),
  ...state,
  templates: state.templates?.length ? state.templates : defaultTemplates(),
  published: Array.isArray(state.published) ? state.published : [],
  drafts: Array.isArray(state.drafts) ? state.drafts : [],
  audit: Array.isArray(state.audit) ? state.audit : [],
});

const readState = async () => {
  const pool = await db();
  const result = await pool.request()
    .input('StateKey', sql.NVarChar(120), ACCESS_STATE_KEY)
    .query(`SELECT [StateJson] FROM [security].[AccessControlState] WHERE [StateKey]=@StateKey`);
  const state = result.recordset[0]?.StateJson ? JSON.parse(result.recordset[0].StateJson) as AccessControlState : defaultState();
  return normalizeState(state);
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
};

const isProtectedPermission = (permission: string) => permission === '*' || ['admin.roles', 'admin.users', 'audit', 'security'].some((prefix) => permission === `${prefix}.*` || permission.startsWith(`${prefix}.`));
const isHigherThanActor = (permission: string, actorPermissions: string[]) => !actorPermissions.includes('*') && !actorPermissions.includes(permission) && !actorPermissions.includes(`${permission.split('.')[0]}.*`);

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
  return unique([...base, ...published]);
};

export const effectivePermissionsForUser = async (userId: string, roles: string[]) => {
  if (roles.includes('Super Administrator') || userId === 'global-admin') return ['*'];
  const state = await readState();
  const base = await effectivePermissionsForRoles(roles);
  const userGrants = state.published
    .filter((item) => item.subjectType === 'user' && item.subjectId === userId && item.status === 'published')
    .flatMap((item) => item.permissions);
  return unique([...base, ...userGrants]);
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

  const actorIsSuper = actor.roles.includes('Super Administrator') || actor.permissions.includes('*');
  const requested = unique(Array.isArray(payload.permissions) ? payload.permissions : []);
  if (!actorIsSuper && requested.some(isProtectedPermission)) throw new Error('Admins cannot change security, audit, authentication, system control, or Super Administrator permissions.');
  if (!actorIsSuper && requested.some((permission) => isHigherThanActor(permission, actor.permissions))) throw new Error('Admins cannot grant permissions higher than their own access.');

  const risky = requested.filter((permission) => ['delete', 'disable', 'assign', 'override', 'approve'].some((action) => permission.endsWith(`.${action}`)) || isProtectedPermission(permission));
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
  const permissions = await effectivePermissionsForRoles([sourceRole]);
  return saveAccessAssignment({ subjectType: 'role', subjectId: targetRole, permissions, publish: false, reason: reason || `Cloned from ${sourceRole}` }, headers, actor);
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
  if (permissions.some(isProtectedPermission) && subjectId !== 'Super Administrator') warnings.push('Security-sensitive permissions are included and require Super Administrator ownership.');
  if (permissions.some((item) => item.endsWith('.delete') || item.endsWith('.disable'))) warnings.push('Risk warning: destructive disable/delete permissions are selected.');
  return warnings;
};
