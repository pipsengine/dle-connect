import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type { SessionPayload } from '@/lib/auth/session';

const requirePool = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('Enterprise database is not available.');
  return pool;
};

export type LiveSession = {
  sessionKey: string;
  userId: string;
  username: string;
  fullName: string;
  roles: string;
  module: string;
  page: string;
  path: string;
  location: string;
  ipAddress: string;
  device: string;
  loggedInAt: string;
  lastSeenAt: string;
  status: 'Online' | 'Idle' | 'Disconnected';
};

export type ActivityEvent = {
  id: string;
  at: string;
  userId: string;
  username: string;
  fullName: string;
  action: string;
  module: string;
  page: string;
  path: string;
  location: string;
  ipAddress: string;
  device: string;
};

const ONLINE_MS = 3 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const dataDir = () => {
  if (process.env.DLE_AUTH_DATA_DIR) return process.env.DLE_AUTH_DATA_DIR;
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  const root = cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
  return path.join(root, 'data', 'auth');
};
const sessionsFile = () => path.join(dataDir(), 'user-sessions.json');
const activityFile = () => path.join(dataDir(), 'user-activity.json');
const revokedFile = () => path.join(dataDir(), 'revoked-sessions.json');

let chain: Promise<unknown> = Promise.resolve();
const enqueue = <T,>(work: () => Promise<T>) => {
  const run = chain.then(work, work);
  chain = run.then(() => undefined, () => undefined);
  return run;
};

const compact = (value: unknown, max = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const newId = () => `act-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

export const sessionKeyFor = (session: Pick<SessionPayload, 'sub' | 'iat'>) => `${session.sub}:${session.iat}`;

export const moduleFromPath = (pathname: string) => {
  const pathName = compact(pathname, 400);
  if (!pathName || pathName === '/') return 'Home';
  if (pathName.startsWith('/timesheet-management')) return 'Timesheet Management';
  if (pathName.startsWith('/hris')) return 'HRIS';
  if (pathName.startsWith('/administration')) return 'Administration';
  if (pathName.startsWith('/finance')) return 'Finance';
  if (pathName.startsWith('/procurement')) return 'Procurement';
  if (pathName.startsWith('/it-support')) return 'IT & Support';
  if (pathName.startsWith('/security')) return 'Security';
  if (pathName.startsWith('/projects-engineering')) return 'Projects & Engineering';
  if (pathName.startsWith('/operations')) return 'Operations';
  const segment = pathName.split('/').filter(Boolean)[0] || 'Home';
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const requestClientMeta = (request: Request) => {
  const forwarded = compact(request.headers.get('x-forwarded-for'), 200);
  return {
    ipAddress: forwarded.split(',')[0]?.trim() || compact(request.headers.get('x-real-ip'), 80) || 'Not recorded',
    device: compact(request.headers.get('user-agent'), 400) || 'Not recorded',
  };
};

const workLocation = (session: SessionPayload) => {
  const parts = [session.department, session.unit].map((item) => compact(item, 80)).filter(Boolean);
  return parts.join(' / ') || 'Not recorded';
};

const displayStatus = (row: { status: string; lastSeenAt: string }): LiveSession['status'] => {
  if (row.status === 'Disconnected' || row.status === 'Revoked') return 'Disconnected';
  const seen = new Date(row.lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return 'Disconnected';
  const age = Date.now() - seen;
  if (age <= ONLINE_MS) return 'Online';
  if (age <= IDLE_MS) return 'Idle';
  return 'Disconnected';
};

let schemaReady: Promise<boolean> | null = null;
const ensureSchema = () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      const pool = await getDleEnterpriseDbPool();
      if (!pool) return false;
      await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'security') EXEC(N'CREATE SCHEMA [security]')`);
      await pool.request().query(`
        IF OBJECT_ID(N'[security].[UserSessions]', N'U') IS NULL
        CREATE TABLE [security].[UserSessions] (
          [SessionKey] NVARCHAR(200) NOT NULL CONSTRAINT [PK_UserSessions] PRIMARY KEY,
          [UserId] NVARCHAR(120) NOT NULL,
          [Username] NVARCHAR(150) NOT NULL,
          [FullName] NVARCHAR(200) NOT NULL,
          [Roles] NVARCHAR(600) NOT NULL,
          [Module] NVARCHAR(120) NOT NULL,
          [Page] NVARCHAR(300) NOT NULL,
          [Path] NVARCHAR(400) NOT NULL,
          [Location] NVARCHAR(200) NOT NULL,
          [IpAddress] NVARCHAR(100) NOT NULL,
          [Device] NVARCHAR(400) NOT NULL,
          [LoggedInAt] DATETIME2(0) NOT NULL,
          [LastSeenAt] DATETIME2(0) NOT NULL,
          [Status] NVARCHAR(30) NOT NULL
        );
        IF OBJECT_ID(N'[security].[UserActivity]', N'U') IS NULL
        CREATE TABLE [security].[UserActivity] (
          [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_UserActivity] PRIMARY KEY,
          [At] DATETIME2(0) NOT NULL,
          [UserId] NVARCHAR(120) NOT NULL,
          [Username] NVARCHAR(150) NOT NULL,
          [FullName] NVARCHAR(200) NOT NULL,
          [Action] NVARCHAR(300) NOT NULL,
          [Module] NVARCHAR(120) NOT NULL,
          [Page] NVARCHAR(300) NOT NULL,
          [Path] NVARCHAR(400) NOT NULL,
          [Location] NVARCHAR(200) NOT NULL,
          [IpAddress] NVARCHAR(100) NOT NULL,
          [Device] NVARCHAR(400) NOT NULL,
          [CreatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_UserActivity_CreatedAt] DEFAULT SYSUTCDATETIME()
        );
        IF OBJECT_ID(N'[security].[UserSessionRevocations]', N'U') IS NULL
        CREATE TABLE [security].[UserSessionRevocations] (
          [SessionKey] NVARCHAR(200) NOT NULL CONSTRAINT [PK_UserSessionRevocations] PRIMARY KEY,
          [RevokedAt] DATETIME2(0) NOT NULL
        );
      `);
      return true;
    })().catch((error) => {
      schemaReady = null;
      console.warn('[user-activity] SQL unavailable; using auth files:', error instanceof Error ? error.message : error);
      return false;
    });
  }
  return schemaReady;
};

const readJson = async <T,>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async (file: string, value: unknown) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value), 'utf8');
};

export const isSessionRevoked = async (sessionKey: string) => {
  if (await ensureSchema()) {
    const pool = await requirePool();
    const result = await pool.request().input('key', sql.NVarChar(200), sessionKey).query(`SELECT 1 AS Hit FROM [security].[UserSessionRevocations] WHERE [SessionKey]=@key`);
    return result.recordset.length > 0;
  }
  const keys = await readJson<string[]>(revokedFile(), []);
  return keys.includes(sessionKey);
};

const rememberRevocation = async (sessionKey: string) => {
  if (await ensureSchema()) {
    const pool = await requirePool();
    await pool.request().input('key', sql.NVarChar(200), sessionKey).query(`
      IF NOT EXISTS (SELECT 1 FROM [security].[UserSessionRevocations] WHERE [SessionKey]=@key)
      INSERT [security].[UserSessionRevocations] ([SessionKey],[RevokedAt]) VALUES (@key, SYSUTCDATETIME())
    `);
    return;
  }
  const keys = await readJson<string[]>(revokedFile(), []);
  if (!keys.includes(sessionKey)) {
    keys.push(sessionKey);
    await writeJson(revokedFile(), keys.slice(-5000));
  }
};

export const recordPresence = async (input: {
  session: SessionPayload;
  kind: 'page' | 'action' | 'heartbeat';
  path: string;
  page: string;
  action?: string;
  ipAddress: string;
  device: string;
}) => enqueue(async () => {
  const key = sessionKeyFor(input.session);
  if (await isSessionRevoked(key)) return { revoked: true as const };
  const now = new Date();
  const loggedIn = new Date((input.session.iat || Math.floor(Date.now() / 1000)) * 1000);
  const row = {
    sessionKey: key,
    userId: compact(input.session.sub, 120),
    username: compact(input.session.username, 150) || compact(input.session.fullName, 150),
    fullName: compact(input.session.fullName, 200) || compact(input.session.username, 200),
    roles: compact((input.session.roles || []).join(', '), 600),
    module: moduleFromPath(input.path),
    page: compact(input.page, 300) || moduleFromPath(input.path),
    path: compact(input.path, 400) || '/',
    location: workLocation(input.session),
    ipAddress: compact(input.ipAddress, 100) || 'Not recorded',
    device: compact(input.device, 400) || 'Not recorded',
    loggedInAt: loggedIn.toISOString(),
    lastSeenAt: now.toISOString(),
    status: 'Online',
  };
  const action = input.kind === 'heartbeat'
    ? ''
    : input.kind === 'page'
      ? `Opened ${row.module} / ${row.page}`
      : `Clicked ${compact(input.action, 180) || 'a control'} on ${row.page}`;
  if (await ensureSchema()) {
    const pool = await requirePool();
    const request = pool.request()
      .input('key', sql.NVarChar(200), row.sessionKey)
      .input('userId', sql.NVarChar(120), row.userId)
      .input('username', sql.NVarChar(150), row.username)
      .input('fullName', sql.NVarChar(200), row.fullName)
      .input('roles', sql.NVarChar(600), row.roles)
      .input('module', sql.NVarChar(120), row.module)
      .input('page', sql.NVarChar(300), row.page)
      .input('path', sql.NVarChar(400), row.path)
      .input('location', sql.NVarChar(200), row.location)
      .input('ip', sql.NVarChar(100), row.ipAddress)
      .input('device', sql.NVarChar(400), row.device)
      .input('loggedIn', sql.DateTime2, loggedIn)
      .input('seen', sql.DateTime2, now);
    await request.query(`
      MERGE [security].[UserSessions] AS target
      USING (SELECT @key AS SessionKey) AS source ON target.[SessionKey]=source.[SessionKey]
      WHEN MATCHED THEN UPDATE SET
        [Username]=@username,[FullName]=@fullName,[Roles]=@roles,[Module]=@module,[Page]=@page,[Path]=@path,
        [Location]=@location,[IpAddress]=@ip,[Device]=@device,[LastSeenAt]=@seen,[Status]=N'Online'
      WHEN NOT MATCHED THEN INSERT
        ([SessionKey],[UserId],[Username],[FullName],[Roles],[Module],[Page],[Path],[Location],[IpAddress],[Device],[LoggedInAt],[LastSeenAt],[Status])
        VALUES (@key,@userId,@username,@fullName,@roles,@module,@page,@path,@location,@ip,@device,@loggedIn,@seen,N'Online');
    `);
    if (action) {
      await pool.request()
        .input('id', sql.NVarChar(80), newId())
        .input('at', sql.DateTime2, now)
        .input('userId', sql.NVarChar(120), row.userId)
        .input('username', sql.NVarChar(150), row.username)
        .input('fullName', sql.NVarChar(200), row.fullName)
        .input('action', sql.NVarChar(300), action)
        .input('module', sql.NVarChar(120), row.module)
        .input('page', sql.NVarChar(300), row.page)
        .input('path', sql.NVarChar(400), row.path)
        .input('location', sql.NVarChar(200), row.location)
        .input('ip', sql.NVarChar(100), row.ipAddress)
        .input('device', sql.NVarChar(400), row.device)
        .query(`INSERT [security].[UserActivity] ([Id],[At],[UserId],[Username],[FullName],[Action],[Module],[Page],[Path],[Location],[IpAddress],[Device])
          VALUES (@id,@at,@userId,@username,@fullName,@action,@module,@page,@path,@location,@ip,@device)`);
    }
    return { revoked: false as const };
  }
  const sessions = await readJson<LiveSession[]>(sessionsFile(), []);
  const index = sessions.findIndex((item) => item.sessionKey === row.sessionKey);
  const stored = { ...row, status: 'Online' as const };
  if (index >= 0) sessions[index] = { ...sessions[index], ...stored, loggedInAt: sessions[index].loggedInAt || stored.loggedInAt };
  else sessions.unshift(stored);
  await writeJson(sessionsFile(), sessions.slice(0, 500));
  if (action) {
    const events = await readJson<ActivityEvent[]>(activityFile(), []);
    events.unshift({
      id: newId(),
      at: now.toISOString(),
      userId: row.userId,
      username: row.username,
      fullName: row.fullName,
      action,
      module: row.module,
      page: row.page,
      path: row.path,
      location: row.location,
      ipAddress: row.ipAddress,
      device: row.device,
    });
    await writeJson(activityFile(), events.slice(0, 5000));
  }
  return { revoked: false as const };
});

const asIso = (value: unknown) => {
  const date = new Date(value instanceof Date ? value : String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

const mapSession = (row: Record<string, unknown>): LiveSession => {
  const lastSeenAt = row.LastSeenAt || row.lastSeenAt;
  const loggedInAt = row.LoggedInAt || row.loggedInAt;
  const status = String(row.Status || row.status || 'Online');
  const base = {
    sessionKey: String(row.SessionKey || row.sessionKey || ''),
    userId: String(row.UserId || row.userId || ''),
    username: String(row.Username || row.username || ''),
    fullName: String(row.FullName || row.fullName || ''),
    roles: String(row.Roles || row.roles || ''),
    module: String(row.Module || row.module || ''),
    page: String(row.Page || row.page || ''),
    path: String(row.Path || row.path || ''),
    location: String(row.Location || row.location || ''),
    ipAddress: String(row.IpAddress || row.ipAddress || ''),
    device: String(row.Device || row.device || ''),
    loggedInAt: asIso(loggedInAt),
    lastSeenAt: asIso(lastSeenAt),
    status: 'Online' as const,
  };
  return { ...base, status: displayStatus({ status, lastSeenAt: base.lastSeenAt }) };
};

export const listLiveSessions = async () => {
  if (await ensureSchema()) {
    const pool = await requirePool();
    const result = await pool.request().query(`SELECT TOP (500) [SessionKey],[UserId],[Username],[FullName],[Roles],[Module],[Page],[Path],[Location],[IpAddress],[Device],[LoggedInAt],[LastSeenAt],[Status] FROM [security].[UserSessions] ORDER BY [LastSeenAt] DESC`);
    return (result.recordset as Record<string, unknown>[]).map(mapSession);
  }
  const sessions = await readJson<LiveSession[]>(sessionsFile(), []);
  return sessions.map((row) => mapSession(row as unknown as Record<string, unknown>));
};

export const listActivity = async () => {
  if (await ensureSchema()) {
    const pool = await requirePool();
    const result = await pool.request().query(`SELECT TOP (2000) [Id],[At],[UserId],[Username],[FullName],[Action],[Module],[Page],[Path],[Location],[IpAddress],[Device] FROM [security].[UserActivity] ORDER BY [At] DESC`);
    return (result.recordset as Record<string, unknown>[]).map((row) => ({
      id: String(row.Id),
      at: asIso(row.At),
      userId: String(row.UserId || ''),
      username: String(row.Username || ''),
      fullName: String(row.FullName || ''),
      action: String(row.Action || ''),
      module: String(row.Module || ''),
      page: String(row.Page || ''),
      path: String(row.Path || ''),
      location: String(row.Location || ''),
      ipAddress: String(row.IpAddress || ''),
      device: String(row.Device || ''),
    }));
  }
  return readJson<ActivityEvent[]>(activityFile(), []);
};

export const disconnectSession = async (sessionKey: string) => enqueue(async () => {
  const key = compact(sessionKey, 200);
  if (!key) return;
  await rememberRevocation(key);
  if (await ensureSchema()) {
    const pool = await requirePool();
    await pool.request().input('key', sql.NVarChar(200), key).query(`UPDATE [security].[UserSessions] SET [Status]=N'Disconnected',[LastSeenAt]=SYSUTCDATETIME() WHERE [SessionKey]=@key`);
    return;
  }
  const sessions = await readJson<LiveSession[]>(sessionsFile(), []);
  await writeJson(sessionsFile(), sessions.map((item) => item.sessionKey === key ? { ...item, status: 'Disconnected' as const, lastSeenAt: new Date().toISOString() } : item));
});

export const removeSession = async (sessionKey: string) => enqueue(async () => {
  const key = compact(sessionKey, 200);
  if (!key) return;
  await rememberRevocation(key);
  if (await ensureSchema()) {
    const pool = await requirePool();
    await pool.request().input('key', sql.NVarChar(200), key).query(`DELETE FROM [security].[UserSessions] WHERE [SessionKey]=@key`);
    return;
  }
  const sessions = await readJson<LiveSession[]>(sessionsFile(), []);
  await writeJson(sessionsFile(), sessions.filter((item) => item.sessionKey !== key));
});
