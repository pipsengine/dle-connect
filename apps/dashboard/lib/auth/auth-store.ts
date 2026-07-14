import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import sql from 'mssql';
import { readDirectoryEmployees } from '@/lib/payroll-employee-source';
import { getDleEnterpriseDbPool, type DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { defaultRoleForEmployee, enterpriseRoles, permissionsForRoles, roleDefinitions } from '@/lib/auth/rbac';
import type { SessionPayload, SessionUser } from '@/lib/auth/session';
import { passwordPolicyErrors } from '@/lib/auth/session';
import { effectivePermissionsForRoles, effectivePermissionsForUser, effectivePermissionsForUsers } from '@/lib/auth/access-control-store';
import { assertActorCanAssignRoles, canManageSuperAdministratorRole } from '@/lib/auth/role-delegation';

export type UserStatus = 'Active' | 'Inactive' | 'Disabled' | 'Locked' | 'Pending First Login' | 'Password Reset Required';

export type UserAccount = {
  id: string;
  username: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  surname: string;
  email: string;
  department: string;
  unit: string;
  jobTitle: string;
  grade: string;
  location: string;
  employmentStatus: string;
  reportingManager: string;
  passwordHash: string;
  passwordSalt: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  departmentAccess: string[];
  moduleAccess: string[];
  firstLoginRequired: boolean;
  passwordResetRequired: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  disabledAt?: string | null;
  deleted?: boolean;
};

export type SecurityAudit = {
  id: string;
  user: string;
  action: string;
  at: string;
  ipAddress: string;
  device: string;
  oldValue?: string | null;
  newValue?: string | null;
  performedBy: string;
};

export type LoginHistory = {
  id: string;
  userId: string;
  username: string;
  at: string;
  logoutAt?: string | null;
  ipAddress: string;
  device: string;
  status: 'Success' | 'Failed' | 'Blocked' | 'Logout';
  reason?: string;
};

type GlobalAdminState = {
  username: 'Admin';
  passwordHash: string;
  passwordSalt: string;
  firstLoginRequired: boolean;
  passwordResetRequired: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
};

const resolveDashboardRoot = () => {
  if (process.env.DLE_AUTH_DATA_DIR) return path.dirname(path.dirname(process.env.DLE_AUTH_DATA_DIR));
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = process.env.DLE_AUTH_DATA_DIR || path.join(resolveDashboardRoot(), 'data', 'auth');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const AUDIT_PATH = path.join(DATA_DIR, 'security-audit.json');
const LOGIN_PATH = path.join(DATA_DIR, 'login-history.json');
const GLOBAL_ADMIN_PATH = path.join(DATA_DIR, 'global-admin.json');
const LOCKOUT_LIMIT = 5;
const LOCKOUT_MINUTES = 30;
const GLOBAL_ADMIN_KEY = 'Admin';

let authDbReady: Promise<sql.ConnectionPool | null> | null = null;

const nowIso = () => new Date().toISOString();
const compact = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();
const activeEmployee = (employee: DleEmployeeDirectoryRow) => !lower(employee.status).match(/exited|suspended|terminated|inactive|disabled|resigned|retired/);

const ensure = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  for (const [file, fallback] of [[USERS_PATH, []], [AUDIT_PATH, []], [LOGIN_PATH, []]] as const) {
    try {
      await access(file);
    } catch {
      try {
        await writeFile(file, JSON.stringify(fallback, null, 2), 'utf8');
      } catch (error) {
        console.warn('[Auth] Local JSON store is not writable:', error instanceof Error ? error.message : error);
      }
    }
  }
};

const readJson = async <T,>(file: string, fallback: T): Promise<T> => {
  await ensure();
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const authMirrorPath = (file: string) => {
  const normalizedFile = path.normalize(file);
  const deployedMarker = path.normalize(path.join('deployment', 'iis', 'site', 'apps', 'dashboard', 'data', 'auth'));
  const markerIndex = normalizedFile.toLowerCase().lastIndexOf(deployedMarker.toLowerCase());
  if (markerIndex === -1) return null;
  const repoRoot = normalizedFile.slice(0, markerIndex);
  const fileName = path.basename(normalizedFile);
  return path.join(repoRoot, 'apps', 'dashboard', 'data', 'auth', fileName);
};

const writeJson = async (file: string, value: unknown) => {
  await ensure();
  const content = JSON.stringify(value, null, 2);
  const mirror = authMirrorPath(file);
  try {
    await writeFile(file, content, 'utf8');
  } catch (error) {
    if (mirror && path.normalize(mirror) !== path.normalize(file)) {
      try {
        await mkdir(path.dirname(mirror), { recursive: true });
        await writeFile(mirror, content, 'utf8');
        return;
      } catch {
        // Fall through to the non-blocking warning below.
      }
    }
    console.warn('[Auth] Local JSON write skipped:', error instanceof Error ? error.message : error);
    return;
  }
  if (mirror && path.normalize(mirror) !== path.normalize(file)) {
    try {
      await mkdir(path.dirname(mirror), { recursive: true });
      await writeFile(mirror, content, 'utf8');
    } catch {
      // The IIS runtime must remain writable even when the deployed repo mirror is read-only.
    }
  }
};

const ensureAuthDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  await pool.request().query(`
IF SCHEMA_ID(N'security') IS NULL EXEC(N'CREATE SCHEMA [security]');
IF OBJECT_ID(N'[security].[AuthUsers]', N'U') IS NULL
CREATE TABLE [security].[AuthUsers] (
  [UserId] NVARCHAR(120) NOT NULL CONSTRAINT [PK_AuthUsers] PRIMARY KEY,
  [Username] NVARCHAR(120) NOT NULL,
  [EmployeeCode] NVARCHAR(120) NULL,
  [EmployeeId] NVARCHAR(120) NULL,
  [Email] NVARCHAR(320) NULL,
  [UserJson] NVARCHAR(MAX) NOT NULL,
  [Deleted] BIT NOT NULL CONSTRAINT [DF_AuthUsers_Deleted] DEFAULT 0,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AuthUsers_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AuthUsers_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [CK_AuthUsers_UserJson] CHECK (ISJSON([UserJson]) = 1)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthUsers_Username' AND object_id = OBJECT_ID(N'[security].[AuthUsers]'))
CREATE INDEX [IX_AuthUsers_Username] ON [security].[AuthUsers]([Username]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthUsers_EmployeeCode' AND object_id = OBJECT_ID(N'[security].[AuthUsers]'))
CREATE INDEX [IX_AuthUsers_EmployeeCode] ON [security].[AuthUsers]([EmployeeCode]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthUsers_EmployeeId' AND object_id = OBJECT_ID(N'[security].[AuthUsers]'))
CREATE INDEX [IX_AuthUsers_EmployeeId] ON [security].[AuthUsers]([EmployeeId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthUsers_Email' AND object_id = OBJECT_ID(N'[security].[AuthUsers]'))
CREATE INDEX [IX_AuthUsers_Email] ON [security].[AuthUsers]([Email]);
IF OBJECT_ID(N'[security].[AuthGlobalAdmin]', N'U') IS NULL
CREATE TABLE [security].[AuthGlobalAdmin] (
  [Username] NVARCHAR(120) NOT NULL CONSTRAINT [PK_AuthGlobalAdmin] PRIMARY KEY,
  [StateJson] NVARCHAR(MAX) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AuthGlobalAdmin_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AuthGlobalAdmin_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [CK_AuthGlobalAdmin_StateJson] CHECK (ISJSON([StateJson]) = 1)
);
IF OBJECT_ID(N'[security].[AuthLoginHistory]', N'U') IS NULL
CREATE TABLE [security].[AuthLoginHistory] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_AuthLoginHistory] PRIMARY KEY,
  [UserId] NVARCHAR(120) NOT NULL,
  [Username] NVARCHAR(150) NOT NULL,
  [At] DATETIME2(0) NOT NULL,
  [LogoutAt] DATETIME2(0) NULL,
  [IpAddress] NVARCHAR(100) NOT NULL,
  [Device] NVARCHAR(600) NOT NULL,
  [Status] NVARCHAR(30) NOT NULL,
  [Reason] NVARCHAR(600) NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AuthLoginHistory_CreatedAt] DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'[security].[AuthSecurityAudit]', N'U') IS NULL
CREATE TABLE [security].[AuthSecurityAudit] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_AuthSecurityAudit] PRIMARY KEY,
  [User] NVARCHAR(150) NOT NULL,
  [Action] NVARCHAR(150) NOT NULL,
  [At] DATETIME2(0) NOT NULL,
  [IpAddress] NVARCHAR(100) NOT NULL,
  [Device] NVARCHAR(600) NOT NULL,
  [OldValue] NVARCHAR(MAX) NULL,
  [NewValue] NVARCHAR(MAX) NULL,
  [PerformedBy] NVARCHAR(150) NOT NULL,
  [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_AuthSecurityAudit_CreatedAt] DEFAULT SYSUTCDATETIME()
);`);
  return pool;
};

const authDb = async () => {
  if (!authDbReady) {
    authDbReady = ensureAuthDb().catch((error) => {
      authDbReady = null;
      console.warn('[Auth] SQL persistence unavailable; falling back to local JSON:', error instanceof Error ? error.message : error);
      return null;
    });
  }
  return authDbReady;
};

const parseJson = <T,>(value: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(value || '')) as T;
  } catch {
    return fallback;
  }
};

export const hashPassword = (password: string, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256').toString('hex'),
});

const verifyPassword = (password: string, hash: string, salt: string) => {
  const next = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(next, 'hex'), Buffer.from(hash, 'hex'));
};

const upsertDbUser = async (pool: sql.ConnectionPool, user: UserAccount) => {
  await pool.request()
    .input('UserId', sql.NVarChar(120), user.id)
    .input('Username', sql.NVarChar(120), user.username)
    .input('EmployeeCode', sql.NVarChar(120), compact(user.employeeCode) || null)
    .input('EmployeeId', sql.NVarChar(120), compact(user.employeeId) || null)
    .input('Email', sql.NVarChar(320), compact(user.email) || null)
    .input('UserJson', sql.NVarChar(sql.MAX), JSON.stringify(user))
    .input('Deleted', sql.Bit, Boolean(user.deleted))
    .query(`
MERGE [security].[AuthUsers] AS target
USING (SELECT @UserId AS [UserId]) AS source
ON target.[UserId] = source.[UserId]
WHEN MATCHED THEN UPDATE SET
  [Username] = @Username,
  [EmployeeCode] = @EmployeeCode,
  [EmployeeId] = @EmployeeId,
  [Email] = @Email,
  [UserJson] = @UserJson,
  [Deleted] = @Deleted,
  [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([UserId], [Username], [EmployeeCode], [EmployeeId], [Email], [UserJson], [Deleted])
VALUES (@UserId, @Username, @EmployeeCode, @EmployeeId, @Email, @UserJson, @Deleted);`);
};

const seedDbUsersFromJsonIfEmpty = async (pool: sql.ConnectionPool) => {
  const count = await pool.request().query(`SELECT COUNT_BIG(1) AS [count] FROM [security].[AuthUsers]`);
  if (Number(count.recordset[0]?.count || 0) > 0) return;
  const legacy = await readJson<UserAccount[]>(USERS_PATH, []);
  for (const user of legacy) await upsertDbUser(pool, user);
};

const readUsersStoreRaw = async () => {
  const pool = await authDb();
  if (!pool) return readJson<UserAccount[]>(USERS_PATH, []);
  await seedDbUsersFromJsonIfEmpty(pool);
  const result = await pool.request().query(`SELECT [UserJson] FROM [security].[AuthUsers] WHERE [Deleted] = 0 ORDER BY [Username]`);
  return result.recordset.map((row) => parseJson<UserAccount>(row.UserJson, null as unknown as UserAccount)).filter(Boolean);
};

const writeUsersStore = async (users: UserAccount[]) => {
  const pool = await authDb();
  if (!pool) {
    await writeJson(USERS_PATH, users);
    return;
  }
  for (const user of users) await upsertDbUser(pool, user);
  await writeJson(USERS_PATH, users).catch(() => undefined);
};

const surnameOf = (employee: DleEmployeeDirectoryRow) => compact(employee.lastName || employee.fullName.split(/\s+/).slice(-1)[0] || employee.employeeCode);

const userFromEmployee = (employee: DleEmployeeDirectoryRow): UserAccount => {
  const password = surnameOf(employee);
  const hashed = hashPassword(password);
  const role = defaultRoleForEmployee(
    employee.jobTitle || employee.designation,
    employee.department,
    { employeeCode: employee.employeeCode || employee.employeeId, employmentType: employee.employmentType },
  );
  const username = employee.employeeCode || employee.employeeId;
  const status: UserStatus = activeEmployee(employee) ? 'Pending First Login' : 'Inactive';
  const roles = [role];
  return {
    id: `usr-${username}`,
    username,
    employeeId: employee.employeeId,
    employeeCode: employee.employeeCode || employee.employeeId,
    fullName: employee.fullName,
    surname: surnameOf(employee),
    email: employee.officialEmail || employee.email || employee.personalEmail || '',
    department: employee.department || '',
    unit: employee.businessUnit || employee.division || '',
    jobTitle: employee.jobTitle || employee.designation || '',
    grade: employee.salaryGrade || employee.jobGrade || '',
    location: employee.workLocation || employee.location || employee.officeLocation || '',
    employmentStatus: employee.status || 'Active',
    reportingManager: employee.managerName || employee.functionalManager || employee.departmentHead || '',
    passwordHash: hashed.hash,
    passwordSalt: hashed.salt,
    status,
    roles,
    permissions: permissionsForRoles(roles),
    departmentAccess: [employee.department || ''].filter(Boolean),
    moduleAccess: [],
    firstLoginRequired: true,
    passwordResetRequired: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    disabledAt: null,
    deleted: false,
  };
};

const mergeEmployee = (user: UserAccount, employee: DleEmployeeDirectoryRow): UserAccount => {
  const employmentStatus = employee.status || user.employmentStatus;
  const inactive = !activeEmployee(employee);
  return {
    ...user,
    employeeId: employee.employeeId || user.employeeId,
    employeeCode: employee.employeeCode || user.employeeCode,
    fullName: employee.fullName || user.fullName,
    surname: surnameOf(employee) || user.surname,
    email: employee.officialEmail || employee.email || employee.personalEmail || user.email,
    department: employee.department || user.department,
    unit: employee.businessUnit || employee.division || user.unit,
    jobTitle: employee.jobTitle || employee.designation || user.jobTitle,
    grade: employee.salaryGrade || employee.jobGrade || user.grade,
    location: employee.workLocation || employee.location || employee.officeLocation || user.location,
    employmentStatus,
    reportingManager: employee.managerName || employee.functionalManager || employee.departmentHead || user.reportingManager,
    status: inactive && user.status !== 'Locked' ? 'Inactive' : user.status,
    updatedAt: nowIso(),
  };
};

export const appendAudit = async (event: Omit<SecurityAudit, 'id' | 'at'>) => {
  const record = { id: `sec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, at: nowIso(), ...event };
  const pool = await authDb();
  if (pool) {
    await pool.request()
      .input('Id', sql.NVarChar(80), record.id)
      .input('User', sql.NVarChar(150), record.user)
      .input('Action', sql.NVarChar(150), record.action)
      .input('At', sql.DateTime2, new Date(record.at))
      .input('IpAddress', sql.NVarChar(100), record.ipAddress)
      .input('Device', sql.NVarChar(600), record.device)
      .input('OldValue', sql.NVarChar(sql.MAX), record.oldValue || null)
      .input('NewValue', sql.NVarChar(sql.MAX), record.newValue || null)
      .input('PerformedBy', sql.NVarChar(150), record.performedBy)
      .query(`INSERT [security].[AuthSecurityAudit] ([Id],[User],[Action],[At],[IpAddress],[Device],[OldValue],[NewValue],[PerformedBy])
VALUES (@Id,@User,@Action,@At,@IpAddress,@Device,@OldValue,@NewValue,@PerformedBy)`);
  }
  const audit = await readJson<SecurityAudit[]>(AUDIT_PATH, []);
  audit.unshift(record);
  await writeJson(AUDIT_PATH, audit.slice(0, 1000));
};

const appendLogin = async (event: Omit<LoginHistory, 'id' | 'at'>) => {
  const record = { id: `login-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, at: nowIso(), ...event };
  const pool = await authDb();
  if (pool) {
    await pool.request()
      .input('Id', sql.NVarChar(80), record.id)
      .input('UserId', sql.NVarChar(120), record.userId)
      .input('Username', sql.NVarChar(150), record.username)
      .input('At', sql.DateTime2, new Date(record.at))
      .input('LogoutAt', sql.DateTime2, record.logoutAt ? new Date(record.logoutAt) : null)
      .input('IpAddress', sql.NVarChar(100), record.ipAddress)
      .input('Device', sql.NVarChar(600), record.device)
      .input('Status', sql.NVarChar(30), record.status)
      .input('Reason', sql.NVarChar(600), record.reason || null)
      .query(`INSERT [security].[AuthLoginHistory] ([Id],[UserId],[Username],[At],[LogoutAt],[IpAddress],[Device],[Status],[Reason])
VALUES (@Id,@UserId,@Username,@At,@LogoutAt,@IpAddress,@Device,@Status,@Reason)`);
  }
  const history = await readJson<LoginHistory[]>(LOGIN_PATH, []);
  history.unshift(record);
  await writeJson(LOGIN_PATH, history.slice(0, 1000));
};

export const readSecurityAudit = async () => {
  const pool = await authDb();
  if (!pool) return readJson<SecurityAudit[]>(AUDIT_PATH, []);
  const result = await pool.request().query(`SELECT TOP (1000) [Id],[User],[Action],[At],[IpAddress],[Device],[OldValue],[NewValue],[PerformedBy] FROM [security].[AuthSecurityAudit] ORDER BY [At] DESC, [CreatedAt] DESC`);
  return result.recordset.map((row) => ({
    id: row.Id,
    user: row.User,
    action: row.Action,
    at: row.At instanceof Date ? row.At.toISOString() : String(row.At),
    ipAddress: row.IpAddress,
    device: row.Device,
    oldValue: row.OldValue,
    newValue: row.NewValue,
    performedBy: row.PerformedBy,
  } satisfies SecurityAudit));
};

export const readLoginHistory = async () => {
  const pool = await authDb();
  if (!pool) return readJson<LoginHistory[]>(LOGIN_PATH, []);
  const result = await pool.request().query(`SELECT TOP (1000) [Id],[UserId],[Username],[At],[LogoutAt],[IpAddress],[Device],[Status],[Reason] FROM [security].[AuthLoginHistory] ORDER BY [At] DESC, [CreatedAt] DESC`);
  return result.recordset.map((row) => ({
    id: row.Id,
    userId: row.UserId,
    username: row.Username,
    at: row.At instanceof Date ? row.At.toISOString() : String(row.At),
    logoutAt: row.LogoutAt instanceof Date ? row.LogoutAt.toISOString() : row.LogoutAt,
    ipAddress: row.IpAddress,
    device: row.Device,
    status: row.Status,
    reason: row.Reason,
  } satisfies LoginHistory));
};

export const syncUsersFromEmployeeDirectory = async () => {
  const source = await readDirectoryEmployees();
  const stored = await readUsersStoreRaw();
  const byCode = new Map(stored.map((user) => [lower(user.employeeCode || user.employeeId), user]));
  const next = source.employees.map((employee) => {
    const key = lower(employee.employeeCode || employee.employeeId);
    const existing = byCode.get(key);
    return existing ? mergeEmployee(existing, employee) : userFromEmployee(employee);
  });
  await writeUsersStore(next);
  return { users: next.filter((user) => !user.deleted), source };
};

export const readUsers = async () => {
  const stored = await readUsersStoreRaw();
  const activeUsers = stored.filter((user) => !user.deleted);
  const permissions = await effectivePermissionsForUsers(activeUsers.map((user) => ({ id: user.id, roles: user.roles })));
  return activeUsers.map((user, index) => ({ ...user, permissions: permissions[index] }));
};

export const readUsersForAccessControl = async () => {
  const stored = await readUsersStoreRaw();
  const activeUsers = stored.filter((user) => !user.deleted);
  const permissions = await effectivePermissionsForUsers(activeUsers.map((user) => ({ id: user.id, roles: user.roles })));
  return activeUsers.map((user, index) => ({
    id: user.id,
    username: user.username,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    department: user.department,
    jobTitle: user.jobTitle,
    status: user.status,
    roles: user.roles,
    permissions: permissions[index],
  }));
};

const globalAdminDefault = (): GlobalAdminState => {
  const hashed = hashPassword('P@882w0rd');
  return {
    username: 'Admin',
    passwordHash: hashed.hash,
    passwordSalt: hashed.salt,
    firstLoginRequired: false,
    passwordResetRequired: false,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    updatedAt: nowIso(),
  };
};

const readGlobalAdmin = async () => {
  const pool = await authDb();
  if (pool) {
    const result = await pool.request()
      .input('Username', sql.NVarChar(120), GLOBAL_ADMIN_KEY)
      .query(`SELECT [StateJson] FROM [security].[AuthGlobalAdmin] WHERE [Username] = @Username`);
    if (result.recordset[0]?.StateJson) return parseJson<GlobalAdminState>(result.recordset[0].StateJson, globalAdminDefault());
    const legacy = await readJson<GlobalAdminState>(GLOBAL_ADMIN_PATH, globalAdminDefault());
    await writeGlobalAdmin(legacy);
    return legacy;
  }
  await ensure();
  try {
    await access(GLOBAL_ADMIN_PATH);
  } catch {
    await writeJson(GLOBAL_ADMIN_PATH, globalAdminDefault());
  }
  return readJson<GlobalAdminState>(GLOBAL_ADMIN_PATH, globalAdminDefault());
};

const writeGlobalAdmin = async (state: GlobalAdminState) => {
  const pool = await authDb();
  if (pool) {
    await pool.request()
      .input('Username', sql.NVarChar(120), GLOBAL_ADMIN_KEY)
      .input('StateJson', sql.NVarChar(sql.MAX), JSON.stringify(state))
      .query(`
MERGE [security].[AuthGlobalAdmin] AS target
USING (SELECT @Username AS [Username]) AS source
ON target.[Username] = source.[Username]
WHEN MATCHED THEN UPDATE SET [StateJson] = @StateJson, [UpdatedAt] = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT ([Username], [StateJson]) VALUES (@Username, @StateJson);`);
  }
  await writeJson(GLOBAL_ADMIN_PATH, state);
};

const client = (headers: Headers) => ({
  ip: compact(headers.get('x-forwarded-for')).split(',')[0] || compact(headers.get('x-real-ip')) || 'local',
  device: compact(headers.get('user-agent')) || 'Unknown device',
});

const findLoginUser = (users: UserAccount[], login: string) => {
  const key = lower(login);
  if (!key) return undefined;
  return users.find((item) => lower(item.username) === key)
    || users.find((item) => lower(item.employeeCode) === key)
    || users.find((item) => lower(item.employeeId) === key)
    || users.find((item) => lower(item.email) === key);
};

const publicUser = async (user: UserAccount): Promise<SessionUser> => ({
  userId: user.id,
  username: user.username,
  employeeId: user.employeeId,
  employeeCode: user.employeeCode,
  fullName: user.fullName,
  email: user.email,
  department: user.department,
  unit: user.unit,
  roles: user.roles,
  permissions: await effectivePermissionsForUser(user.id, user.roles),
  status: user.status,
  firstLoginRequired: user.firstLoginRequired,
  passwordResetRequired: user.passwordResetRequired,
});

const globalSessionUser = (state: GlobalAdminState): SessionUser => ({
  userId: 'global-admin',
  username: 'Admin',
  fullName: 'Global Super Administrator',
  department: 'System Administration',
  unit: 'Global Administration',
  roles: ['Super Administrator'],
  permissions: ['*'],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  isGlobalAdmin: true,
});

export const authenticate = async (login: string, password: string, headers: Headers) => {
  const username = compact(login);
  const { ip, device } = client(headers);
  if (lower(username) === 'admin') {
    const state = await readGlobalAdmin();
    if (state.lockedUntil && new Date(state.lockedUntil) > new Date()) {
      await appendLogin({ userId: 'global-admin', username: 'Admin', ipAddress: ip, device, status: 'Blocked', reason: 'Account locked' });
      throw new Error('Account is locked. Contact a security administrator.');
    }
    if (!verifyPassword(password, state.passwordHash, state.passwordSalt)) {
      const failedAttempts = state.failedAttempts + 1;
      state.failedAttempts = failedAttempts;
      state.lockedUntil = failedAttempts >= LOCKOUT_LIMIT ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString() : null;
      await writeGlobalAdmin(state);
      await appendLogin({ userId: 'global-admin', username: 'Admin', ipAddress: ip, device, status: 'Failed', reason: 'Invalid password' });
      await appendAudit({ user: 'Admin', action: 'Failed login', ipAddress: ip, device, performedBy: 'System', newValue: `Failed attempts: ${failedAttempts}` });
      throw new Error('Invalid username or password.');
    }
    state.failedAttempts = 0;
    state.lockedUntil = null;
    state.lastLoginAt = nowIso();
    await writeGlobalAdmin(state);
    await appendLogin({ userId: 'global-admin', username: 'Admin', ipAddress: ip, device, status: 'Success' });
    await appendAudit({ user: 'Admin', action: 'Login', ipAddress: ip, device, performedBy: 'Admin' });
    return globalSessionUser(state);
  }

  let users = await readUsersStoreRaw();
  if (!username || !password) {
    await appendLogin({ userId: 'unknown', username: username || '(blank)', ipAddress: ip, device, status: 'Failed', reason: 'Missing username or password' });
    throw new Error('Invalid username or password.');
  }
  let user = findLoginUser(users, username);
  if (!user) {
    users = (await syncUsersFromEmployeeDirectory()).users;
    user = findLoginUser(users, username);
  }
  if (!user || user.deleted) {
    await appendLogin({ userId: 'unknown', username, ipAddress: ip, device, status: 'Failed', reason: 'Unknown user' });
    throw new Error('Invalid username or password.');
  }
  if (['Inactive', 'Disabled'].includes(user.status) || lower(user.employmentStatus).match(/exited|suspended|terminated|inactive|disabled|resigned|retired/)) {
    await appendLogin({ userId: user.id, username: user.username, ipAddress: ip, device, status: 'Blocked', reason: `Status: ${user.status} / ${user.employmentStatus}` });
    throw new Error('This account is not active.');
  }
  if (user.status === 'Locked' || (user.lockedUntil && new Date(user.lockedUntil) > new Date())) {
    await appendLogin({ userId: user.id, username: user.username, ipAddress: ip, device, status: 'Blocked', reason: 'Account locked' });
    throw new Error('Account is locked. Contact an administrator.');
  }
  if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    const nextUsers = users.map((item) => {
      if (item.id !== user.id) return item;
      const failedAttempts = item.failedAttempts + 1;
      return {
        ...item,
        failedAttempts,
        status: failedAttempts >= LOCKOUT_LIMIT ? 'Locked' as UserStatus : item.status,
        lockedUntil: failedAttempts >= LOCKOUT_LIMIT ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString() : item.lockedUntil,
        updatedAt: nowIso(),
      };
    });
    await writeUsersStore(nextUsers);
    await appendLogin({ userId: user.id, username: user.username, ipAddress: ip, device, status: 'Failed', reason: 'Invalid password' });
    await appendAudit({ user: user.username, action: 'Failed login', ipAddress: ip, device, performedBy: 'System', newValue: `Failed attempts: ${user.failedAttempts + 1}` });
    throw new Error('Invalid username or password.');
  }
  const nextUsers = users.map((item) => item.id === user.id ? { ...item, failedAttempts: 0, lockedUntil: null, lastLoginAt: nowIso(), status: item.status === 'Pending First Login' ? item.status : 'Active' as UserStatus, updatedAt: nowIso() } : item);
  await writeUsersStore(nextUsers);
  const fresh = nextUsers.find((item) => item.id === user.id) || user;
  await appendLogin({ userId: user.id, username: user.username, ipAddress: ip, device, status: 'Success' });
  await appendAudit({ user: user.username, action: 'Login', ipAddress: ip, device, performedBy: user.username });
  return publicUser(fresh);
};

export const changePassword = async (userId: string, currentPassword: string | undefined, newPassword: string, headers: Headers, performedBy?: string) => {
  const errors = passwordPolicyErrors(newPassword);
  if (errors.length) throw new Error(`Password policy failed: ${errors.join(', ')}`);
  const { ip, device } = client(headers);
  if (userId === 'global-admin') {
    const state = await readGlobalAdmin();
    if (currentPassword && !verifyPassword(currentPassword, state.passwordHash, state.passwordSalt)) throw new Error('Current password is not correct.');
    const hashed = hashPassword(newPassword);
    await writeGlobalAdmin({ ...state, passwordHash: hashed.hash, passwordSalt: hashed.salt, firstLoginRequired: false, passwordResetRequired: false, failedAttempts: 0, lockedUntil: null, updatedAt: nowIso() });
    await appendAudit({ user: 'Admin', action: 'Password change', ipAddress: ip, device, performedBy: performedBy || 'Admin' });
    return globalSessionUser(await readGlobalAdmin());
  }
  const users = await readUsersStoreRaw();
  const target = users.find((item) => item.id === userId);
  if (!target) throw new Error('User account was not found.');
  if (currentPassword && !verifyPassword(currentPassword, target.passwordHash, target.passwordSalt)) throw new Error('Current password is not correct.');
  const hashed = hashPassword(newPassword);
  const nextUsers = users.map((item) => item.id === userId ? {
    ...item,
    passwordHash: hashed.hash,
    passwordSalt: hashed.salt,
    firstLoginRequired: false,
    passwordResetRequired: false,
    status: 'Active' as UserStatus,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: nowIso(),
  } : item);
  await writeUsersStore(nextUsers);
  await appendAudit({ user: target.username, action: 'Password change', ipAddress: ip, device, performedBy: performedBy || target.username });
  return publicUser(nextUsers.find((item) => item.id === userId) || target);
};

const canManageSuperAdministratorAccount = (actor?: Pick<SessionPayload, 'sub' | 'username' | 'isGlobalAdmin' | 'roles'> | null) => {
  return canManageSuperAdministratorRole(actor);
};

export const updateUser = async (
  userId: string,
  action: string,
  payload: any,
  headers: Headers,
  performedBy = 'Admin',
  actor?: Pick<SessionPayload, 'sub' | 'username' | 'isGlobalAdmin' | 'roles'> | null,
) => {
  const users = await readUsersStoreRaw();
  const target = users.find((item) => item.id === userId);
  if (!target) throw new Error('User account was not found.');
  let updated: UserAccount = target;
  const oldValue = JSON.stringify({ status: target.status, roles: target.roles, departmentAccess: target.departmentAccess, moduleAccess: target.moduleAccess });
  if (action === 'activate') updated = { ...target, status: 'Active', disabledAt: null, updatedAt: nowIso() };
  if (action === 'disable') updated = { ...target, status: 'Disabled', disabledAt: nowIso(), updatedAt: nowIso() };
  if (action === 'lock') updated = { ...target, status: 'Locked', lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString(), updatedAt: nowIso() };
  if (action === 'unlock') updated = { ...target, status: target.firstLoginRequired ? 'Pending First Login' : 'Active', failedAttempts: 0, lockedUntil: null, updatedAt: nowIso() };
  if (action === 'force-password-change') updated = { ...target, status: 'Password Reset Required', passwordResetRequired: true, updatedAt: nowIso() };
  if (action === 'reset-password') {
    const hashed = hashPassword(target.surname);
    updated = { ...target, passwordHash: hashed.hash, passwordSalt: hashed.salt, status: 'Password Reset Required', passwordResetRequired: true, failedAttempts: 0, lockedUntil: null, updatedAt: nowIso() };
  }
  if (action === 'assign-roles') {
    const roles = Array.isArray(payload.roles) ? payload.roles.filter((item: string) => enterpriseRoles.includes(item as any)) : target.roles;
    const touchesSuperAdministrator = roles.includes('Super Administrator') || target.roles.includes('Super Administrator');
    if (touchesSuperAdministrator && !canManageSuperAdministratorAccount(actor)) {
      throw new Error('Only Global / Super Administrators can grant, remove, or modify the Super Administrator role. Admin and System Administrator cannot self-elevate or promote others to that level.');
    }
    // Prevent non-super actors from elevating themselves even if the target check is bypassed.
    if (actor?.sub && actor.sub === userId && roles.includes('Super Administrator') && !canManageSuperAdministratorAccount(actor)) {
      throw new Error('You cannot assign the Super Administrator role to yourself.');
    }
    assertActorCanAssignRoles(actor?.roles || [], roles, actor || undefined);
    updated = { ...target, roles, permissions: await effectivePermissionsForRoles(roles), updatedAt: nowIso() };
  }
  if (action === 'assign-access') {
    updated = {
      ...target,
      departmentAccess: Array.isArray(payload.departmentAccess) ? payload.departmentAccess.map(compact).filter(Boolean) : target.departmentAccess,
      moduleAccess: Array.isArray(payload.moduleAccess) ? payload.moduleAccess.map(compact).filter(Boolean) : target.moduleAccess,
      updatedAt: nowIso(),
    };
  }
  const nextUsers = users.map((item) => item.id === userId ? updated : item);
  await writeUsersStore(nextUsers);
  const { ip, device } = client(headers);
  await appendAudit({ user: target.username, action: `User ${action}`, ipAddress: ip, device, oldValue, newValue: JSON.stringify({ status: updated.status, roles: updated.roles, departmentAccess: updated.departmentAccess, moduleAccess: updated.moduleAccess }), performedBy });
  return updated;
};

export const logoutAudit = async (user: string, userId: string, headers: Headers) => {
  const { ip, device } = client(headers);
  await appendLogin({ userId, username: user, ipAddress: ip, device, status: 'Logout' });
  await appendAudit({ user, action: 'Logout', ipAddress: ip, device, performedBy: user });
};

export const rolesPayload = () => roleDefinitions;
