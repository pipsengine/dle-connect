import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureVisitorSchemaSql } from '@/lib/security/visitor-sql-schema';
import type { VisitorAccess } from '@/lib/security/visitor-access';
import { notifyVisitorRequester } from '@/lib/security/visitor-notify';
import { visitorStageAction } from '@/lib/security/visitor-views';
import {
  VISITOR_STATUSES,
  type DirectoryEmployee,
  type VisitorArtifact,
  type VisitorAttachment,
  type VisitorDirectories,
  type VisitorPriority,
  type VisitorStatus,
  type VisitorTimelineEvent,
  type VisitorVisit,
  type VisitorVisitInput,
  type VisitorWorkspace,
} from '@/lib/security/visitor-types';

const dbReady = { value: false };

const clean = (value: unknown, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const idFor = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
};

const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${value.getUTCFullYear()}-${month}-${day}`;
  }
  const text = clean(value, 40);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
};

const iso = (value: unknown) => {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const sqlDate = (value: string) => (value ? new Date(`${value.slice(0, 10)}T12:00:00.000Z`) : null);
const sqlDateTime = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const asStatus = (value: unknown, fallback: VisitorStatus): VisitorStatus => {
  const text = clean(value, 40);
  return (VISITOR_STATUSES as readonly string[]).includes(text) ? text as VisitorStatus : fallback;
};

const asPriority = (value: unknown): VisitorPriority => {
  const text = clean(value, 20);
  return text === 'High' || text === 'Low' ? text : 'Medium';
};

const clockLabel = () => new Date().toLocaleTimeString('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
});

const uniqueLabels = (values: string[]) => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const label = clean(value, 180);
    const key = label.toLowerCase();
    if (!label || key === 'unassigned location' || key === 'unassigned department' || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels.sort((left, right) => left.localeCompare(right));
};

const DEFAULT_BADGE_TEMPLATES = [
  { name: 'Standard Guest', visitorType: 'Guest', accent: 'from-blue-500 to-indigo-600' },
  { name: 'Vendor Access', visitorType: 'Vendor', accent: 'from-emerald-500 to-teal-600' },
  { name: 'Contractor Pass', visitorType: 'Contractor', accent: 'from-amber-500 to-orange-500' },
  { name: 'VIP Executive', visitorType: 'VIP', accent: 'from-indigo-500 to-purple-600' },
  { name: 'Interview Candidate', visitorType: 'Interview Candidate', accent: 'from-slate-500 to-slate-600' },
  { name: 'Delivery / Courier', visitorType: 'Delivery', accent: 'from-cyan-500 to-blue-500' },
];

export const ensureVisitorDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Visitor management requires SQL persistence.');
  if (!dbReady.value) {
    await pool.request().query(ensureVisitorSchemaSql);
    const existing = await pool.request().query(`
      SELECT COUNT(*) AS total FROM [security].[VisitorArtifacts] WHERE [Kind] = N'badge-template'
    `);
    if (Number(existing.recordset[0]?.total || 0) === 0) {
      for (const template of DEFAULT_BADGE_TEMPLATES) {
        await pool.request()
          .input('id', sql.NVarChar(40), idFor('tpl'))
          .input('name', sql.NVarChar(200), template.name)
          .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(template))
          .query(`
            INSERT INTO [security].[VisitorArtifacts] ([ArtifactId], [Kind], [Name], [PayloadJson])
            VALUES (@id, N'badge-template', @name, @payload)
          `);
      }
    }
    dbReady.value = true;
  }
  return pool;
};

const mapVisit = (row: Record<string, unknown>): VisitorVisit => ({
  id: clean(row.VisitId, 40),
  visitorName: clean(row.VisitorName, 180),
  phone: clean(row.Phone, 40),
  email: clean(row.Email, 180),
  company: clean(row.Company, 180),
  visitorType: clean(row.VisitorType, 80),
  nationality: clean(row.Nationality, 80),
  visitDate: dateOnly(row.VisitDate),
  visitTime: clean(row.VisitTime, 20),
  duration: clean(row.DurationLabel, 40),
  purpose: clean(row.Purpose, 500),
  hostName: clean(row.HostName, 180),
  hostEmployeeCode: clean(row.HostEmployeeCode, 40),
  department: clean(row.Department, 180),
  location: clean(row.LocationName, 180),
  meetingRoom: clean(row.MeetingRoom, 180),
  floor: clean(row.FloorLabel, 80),
  hostPhone: clean(row.HostPhone, 40),
  idType: clean(row.IdType, 80),
  idNumber: clean(row.IdNumber, 80),
  itemsCarried: clean(row.ItemsCarried, 500),
  vehicleRegistered: clean(row.VehicleRegistered, 180) || null,
  notes: clean(row.Notes, 2000),
  priority: asPriority(row.Priority),
  status: asStatus(row.Status, 'Pending Approval'),
  approvalNote: clean(row.ApprovalNote, 1000),
  idVerified: Boolean(row.IdVerified),
  badgeNumber: clean(row.BadgeNumber, 40) || null,
  badgeStatus: clean(row.BadgeStatus, 40),
  badgeTemplate: clean(row.BadgeTemplate, 120),
  checkInAt: iso(row.CheckInAt) || null,
  checkOutAt: iso(row.CheckOutAt) || null,
  isVip: Boolean(row.IsVip),
  blacklisted: Boolean(row.Blacklisted),
  attachments: parseJson<VisitorAttachment[]>(row.AttachmentsJson, []),
  timeline: parseJson<VisitorTimelineEvent[]>(row.TimelineJson, []),
  createdAt: iso(row.CreatedAt),
  updatedAt: iso(row.UpdatedAt),
  createdBy: clean(row.CreatedBy, 180),
  requesterEmail: clean(row.RequesterEmail, 180),
  requesterEmployeeCode: clean(row.RequesterEmployeeCode, 40),
});

const mapArtifact = (row: Record<string, unknown>): VisitorArtifact => ({
  id: clean(row.ArtifactId, 40),
  kind: clean(row.Kind, 40),
  name: clean(row.Name, 200),
  payload: parseJson<Record<string, unknown>>(row.PayloadJson, {}),
  updatedAt: iso(row.UpdatedAt),
});

export const listVisits = async () => {
  const pool = await ensureVisitorDb();
  const result = await pool.request().query(`
    SELECT TOP 2000 *
    FROM [security].[VisitorVisits]
    ORDER BY [UpdatedAt] DESC, [CreatedAt] DESC
  `);
  return (result.recordset as Record<string, unknown>[]).map(mapVisit);
};

const readVisit = async (pool: sql.ConnectionPool, id: string) => {
  const result = await pool.request()
    .input('id', sql.NVarChar(40), id)
    .query(`SELECT TOP 1 * FROM [security].[VisitorVisits] WHERE [VisitId] = @id`);
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  return row ? mapVisit(row) : null;
};

const nextBadgeNumber = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
    SELECT ISNULL(MAX(TRY_CAST(REPLACE(REPLACE(ISNULL([BadgeNumber], N''), N'V-', N''), N'#', N'') AS INT)), 2000) + 1 AS nextNo
    FROM [security].[VisitorVisits]
  `);
  const next = Number(result.recordset[0]?.nextNo || 2001);
  return `V-${String(next).padStart(4, '0')}`;
};

const bindVisit = (request: sql.Request, visit: VisitorVisit) => {
  request.input('id', sql.NVarChar(40), visit.id);
  request.input('visitorName', sql.NVarChar(180), visit.visitorName);
  request.input('phone', sql.NVarChar(40), visit.phone || null);
  request.input('email', sql.NVarChar(180), visit.email || null);
  request.input('company', sql.NVarChar(180), visit.company || null);
  request.input('visitorType', sql.NVarChar(80), visit.visitorType || null);
  request.input('nationality', sql.NVarChar(80), visit.nationality || null);
  request.input('visitDate', sql.Date, sqlDate(visit.visitDate));
  request.input('visitTime', sql.NVarChar(20), visit.visitTime || null);
  request.input('duration', sql.NVarChar(40), visit.duration || null);
  request.input('purpose', sql.NVarChar(500), visit.purpose || null);
  request.input('hostName', sql.NVarChar(180), visit.hostName || null);
  request.input('hostCode', sql.NVarChar(40), visit.hostEmployeeCode || null);
  request.input('department', sql.NVarChar(180), visit.department || null);
  request.input('location', sql.NVarChar(180), visit.location || null);
  request.input('meetingRoom', sql.NVarChar(180), visit.meetingRoom || null);
  request.input('floor', sql.NVarChar(80), visit.floor || null);
  request.input('hostPhone', sql.NVarChar(40), visit.hostPhone || null);
  request.input('idType', sql.NVarChar(80), visit.idType || null);
  request.input('idNumber', sql.NVarChar(80), visit.idNumber || null);
  request.input('items', sql.NVarChar(500), visit.itemsCarried || null);
  request.input('vehicle', sql.NVarChar(180), visit.vehicleRegistered || null);
  request.input('notes', sql.NVarChar(2000), visit.notes || null);
  request.input('priority', sql.NVarChar(20), visit.priority);
  request.input('status', sql.NVarChar(40), visit.status);
  request.input('approvalNote', sql.NVarChar(1000), visit.approvalNote || null);
  request.input('idVerified', sql.Bit, visit.idVerified ? 1 : 0);
  request.input('badgeNumber', sql.NVarChar(40), visit.badgeNumber || null);
  request.input('badgeStatus', sql.NVarChar(40), visit.badgeStatus || null);
  request.input('badgeTemplate', sql.NVarChar(120), visit.badgeTemplate || null);
  request.input('checkInAt', sql.DateTime2, sqlDateTime(visit.checkInAt));
  request.input('checkOutAt', sql.DateTime2, sqlDateTime(visit.checkOutAt));
  request.input('isVip', sql.Bit, visit.isVip ? 1 : 0);
  request.input('blacklisted', sql.Bit, visit.blacklisted ? 1 : 0);
  request.input('attachments', sql.NVarChar(sql.MAX), JSON.stringify(visit.attachments || []));
  request.input('timeline', sql.NVarChar(sql.MAX), JSON.stringify(visit.timeline || []));
  request.input('actor', sql.NVarChar(180), visit.createdBy || null);
  request.input('requesterEmail', sql.NVarChar(180), visit.requesterEmail || null);
  request.input('requesterCode', sql.NVarChar(40), visit.requesterEmployeeCode || null);
};

const insertVisit = async (pool: sql.ConnectionPool, visit: VisitorVisit) => {
  const request = pool.request();
  bindVisit(request, visit);
  await request.query(`
    INSERT INTO [security].[VisitorVisits] (
      [VisitId], [VisitorName], [Phone], [Email], [Company], [VisitorType], [Nationality],
      [VisitDate], [VisitTime], [DurationLabel], [Purpose], [HostName], [HostEmployeeCode],
      [Department], [LocationName], [MeetingRoom], [FloorLabel], [HostPhone], [IdType], [IdNumber],
      [ItemsCarried], [VehicleRegistered], [Notes], [Priority], [Status], [ApprovalNote], [IdVerified],
      [BadgeNumber], [BadgeStatus], [BadgeTemplate], [CheckInAt], [CheckOutAt], [IsVip], [Blacklisted],
      [AttachmentsJson], [TimelineJson], [CreatedBy], [UpdatedBy], [RequesterEmail], [RequesterEmployeeCode]
    ) VALUES (
      @id, @visitorName, @phone, @email, @company, @visitorType, @nationality,
      @visitDate, @visitTime, @duration, @purpose, @hostName, @hostCode,
      @department, @location, @meetingRoom, @floor, @hostPhone, @idType, @idNumber,
      @items, @vehicle, @notes, @priority, @status, @approvalNote, @idVerified,
      @badgeNumber, @badgeStatus, @badgeTemplate, @checkInAt, @checkOutAt, @isVip, @blacklisted,
      @attachments, @timeline, @actor, @actor, @requesterEmail, @requesterCode
    )
  `);
};

const updateVisit = async (pool: sql.ConnectionPool, visit: VisitorVisit, actor: string) => {
  const request = pool.request();
  bindVisit(request, { ...visit, createdBy: actor });
  await request.query(`
    UPDATE [security].[VisitorVisits] SET
      [VisitorName]=@visitorName, [Phone]=@phone, [Email]=@email, [Company]=@company,
      [VisitorType]=@visitorType, [Nationality]=@nationality, [VisitDate]=@visitDate, [VisitTime]=@visitTime,
      [DurationLabel]=@duration, [Purpose]=@purpose, [HostName]=@hostName, [HostEmployeeCode]=@hostCode,
      [Department]=@department, [LocationName]=@location, [MeetingRoom]=@meetingRoom, [FloorLabel]=@floor,
      [HostPhone]=@hostPhone, [IdType]=@idType, [IdNumber]=@idNumber, [ItemsCarried]=@items,
      [VehicleRegistered]=@vehicle, [Notes]=@notes, [Priority]=@priority, [Status]=@status,
      [ApprovalNote]=@approvalNote, [IdVerified]=@idVerified, [BadgeNumber]=@badgeNumber,
      [BadgeStatus]=@badgeStatus, [BadgeTemplate]=@badgeTemplate, [CheckInAt]=@checkInAt,
      [CheckOutAt]=@checkOutAt, [IsVip]=@isVip, [Blacklisted]=@blacklisted,
      [AttachmentsJson]=@attachments, [TimelineJson]=@timeline, [UpdatedBy]=@actor,
      [RequesterEmail]=@requesterEmail, [RequesterEmployeeCode]=@requesterCode,
      [UpdatedAt]=SYSUTCDATETIME()
    WHERE [VisitId]=@id
  `);
};

const writeEvent = async (pool: sql.ConnectionPool, visitId: string, event: VisitorTimelineEvent) => {
  await pool.request()
    .input('id', sql.NVarChar(40), idFor('evt'))
    .input('visitId', sql.NVarChar(40), visitId)
    .input('action', sql.NVarChar(80), clean(event.action, 80) || 'Updated')
    .input('actor', sql.NVarChar(180), clean(event.actor, 180) || 'Security')
    .input('detail', sql.NVarChar(1000), clean(event.note, 1000) || null)
    .query(`
      INSERT INTO [security].[VisitorEvents] ([EventId], [VisitId], [Action], [Actor], [Detail])
      VALUES (@id, @visitId, @action, @actor, @detail)
    `);
};

const normalizeInput = (input: VisitorVisitInput, actor: string, existing?: VisitorVisit | null): VisitorVisit => {
  const now = new Date().toISOString();
  const name = clean(input.visitorName ?? existing?.visitorName, 180);
  if (!name) throw new Error('Visitor name is required.');
  const status = asStatus(input.status ?? existing?.status, existing ? existing.status : 'Pending Approval');
  const timeline = input.timeline ?? existing?.timeline ?? [];
  return {
    id: existing?.id || clean(input.id, 40) || idFor('VIS'),
    visitorName: name,
    phone: clean(input.phone ?? existing?.phone, 40),
    email: clean(input.email ?? existing?.email, 180),
    company: clean(input.company ?? existing?.company, 180),
    visitorType: clean(input.visitorType ?? existing?.visitorType, 80),
    nationality: clean(input.nationality ?? existing?.nationality, 80),
    visitDate: dateOnly(input.visitDate ?? existing?.visitDate),
    visitTime: clean(input.visitTime ?? existing?.visitTime, 20),
    duration: clean(input.duration ?? existing?.duration, 40) || '1 hour',
    purpose: clean(input.purpose ?? existing?.purpose, 500),
    hostName: clean(input.hostName ?? existing?.hostName, 180),
    hostEmployeeCode: clean(input.hostEmployeeCode ?? existing?.hostEmployeeCode, 40),
    department: clean(input.department ?? existing?.department, 180),
    location: clean(input.location ?? existing?.location, 180),
    meetingRoom: clean(input.meetingRoom ?? existing?.meetingRoom, 180),
    floor: clean(input.floor ?? existing?.floor, 80),
    hostPhone: clean(input.hostPhone ?? existing?.hostPhone, 40),
    idType: clean(input.idType ?? existing?.idType, 80),
    idNumber: clean(input.idNumber ?? existing?.idNumber, 80),
    itemsCarried: clean(input.itemsCarried ?? existing?.itemsCarried, 500),
    vehicleRegistered: input.vehicleRegistered === undefined
      ? existing?.vehicleRegistered ?? null
      : clean(input.vehicleRegistered, 180) || null,
    notes: clean(input.notes ?? existing?.notes, 2000),
    priority: asPriority(input.priority ?? existing?.priority),
    status: input.blacklisted || existing?.blacklisted ? (status === 'Checked In' ? status : (input.blacklisted ? 'Blacklisted' : status)) : status,
    approvalNote: clean(input.approvalNote ?? existing?.approvalNote, 1000),
    idVerified: input.idVerified ?? existing?.idVerified ?? false,
    badgeNumber: input.badgeNumber === undefined ? existing?.badgeNumber ?? null : clean(input.badgeNumber, 40) || null,
    badgeStatus: clean(input.badgeStatus ?? existing?.badgeStatus, 40),
    badgeTemplate: clean(input.badgeTemplate ?? existing?.badgeTemplate, 120),
    checkInAt: input.checkInAt === undefined ? existing?.checkInAt ?? null : input.checkInAt,
    checkOutAt: input.checkOutAt === undefined ? existing?.checkOutAt ?? null : input.checkOutAt,
    isVip: input.isVip ?? existing?.isVip ?? /vip/i.test(clean(input.visitorType ?? existing?.visitorType, 80)),
    blacklisted: input.blacklisted ?? existing?.blacklisted ?? false,
    attachments: input.attachments ?? existing?.attachments ?? [],
    timeline,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || actor,
    requesterEmail: clean(input.requesterEmail ?? existing?.requesterEmail, 180),
    requesterEmployeeCode: clean(input.requesterEmployeeCode ?? existing?.requesterEmployeeCode, 40),
  };
};

const ownsVisit = (visit: VisitorVisit, access?: VisitorAccess | null) => {
  if (!access) return false;
  const code = access.employeeCode.trim().toLowerCase();
  const name = access.name.trim().toLowerCase();
  if (code && visit.requesterEmployeeCode.trim().toLowerCase() === code) return true;
  if (!visit.requesterEmployeeCode && name && visit.createdBy.trim().toLowerCase() === name) return true;
  return false;
};

const lookupEmployeeEmail = async (pool: sql.ConnectionPool, employeeCode: string) => {
  const code = clean(employeeCode, 40);
  if (!code) return '';
  try {
    const result = await pool.request()
      .input('code', sql.NVarChar(40), code)
      .query(`
        SELECT TOP 1 COALESCE(NULLIF([official_email], N''), NULLIF([personal_email], N''), N'') AS [Email]
        FROM [hris].[EmployeeMasterView]
        WHERE [employee_code] = @code
      `);
    return clean(result.recordset[0]?.Email, 180);
  } catch (error) {
    console.warn('[visitor] requester email lookup failed:', error instanceof Error ? error.message : error);
    return '';
  }
};

const lookupEmployeeEmailByName = async (pool: sql.ConnectionPool, fullName: string) => {
  const name = clean(fullName, 180);
  if (name.length < 3) return '';
  try {
    const result = await pool.request()
      .input('name', sql.NVarChar(180), name)
      .query(`
        SELECT TOP 1 COALESCE(NULLIF([official_email], N''), NULLIF([personal_email], N''), N'') AS [Email]
        FROM [hris].[EmployeeMasterView]
        WHERE [full_name] = @name
      `);
    return clean(result.recordset[0]?.Email, 180);
  } catch {
    return '';
  }
};

const canSeeVisit = (visit: VisitorVisit, access?: VisitorAccess | null) => !access || access.seesAll || ownsVisit(visit, access);

export const saveVisit = async (input: VisitorVisitInput, actor: string, event?: VisitorTimelineEvent, access?: VisitorAccess | null) => {
  const pool = await ensureVisitorDb();
  const existing = input.id ? await readVisit(pool, clean(input.id, 40)) : null;
  if (existing && !canSeeVisit(existing, access)) throw new Error('You can only update visits you registered.');
  const visit = normalizeInput(input, actor, existing);
  if (!existing) {
    visit.requesterEmployeeCode = visit.requesterEmployeeCode || access?.employeeCode || '';
    visit.requesterEmail = visit.requesterEmail || access?.email || '';
    if (!visit.requesterEmail && visit.requesterEmployeeCode) {
      visit.requesterEmail = await lookupEmployeeEmail(pool, visit.requesterEmployeeCode);
    }
    if (visit.status !== 'Draft') visit.status = 'Pending Security Check-in';
  } else if (visit.status !== existing.status) {
    const step = visitorStageAction(existing.status);
    if (!step || step.status !== visit.status) throw new Error('That stage is not the next step for this visit.');
    if (step.role === 'security' && !access?.canSecurity) throw new Error('Security completes this stage.');
    if (step.role === 'reception' && !access?.canReception) throw new Error('Reception completes this stage.');
    if (visit.status === 'Checked In' && !visit.checkInAt) visit.checkInAt = new Date().toISOString();
    if (visit.status === 'Checked Out' && !visit.checkOutAt) visit.checkOutAt = new Date().toISOString();
    if (visit.status === 'Checked In' && !visit.badgeStatus) visit.badgeStatus = 'Active';
  }
  if ((visit.badgeStatus === 'Active' || visit.badgeStatus === 'Due for Return') && !visit.badgeNumber) {
    visit.badgeNumber = await nextBadgeNumber(pool);
  }
  if (visit.blacklisted) visit.status = visit.status === 'Checked In' ? visit.status : 'Blacklisted';
  const stamp = event || {
    time: clockLabel(),
    action: existing ? 'Visit updated' : (visit.status === 'Draft' ? 'Draft saved' : 'Visitor registered'),
    actor,
  };
  visit.timeline = [...visit.timeline, { ...stamp, time: stamp.time || clockLabel(), actor: stamp.actor || actor }];
  if (existing) await updateVisit(pool, visit, actor);
  else await insertVisit(pool, visit);
  await writeEvent(pool, visit.id, visit.timeline[visit.timeline.length - 1]);
  const saved = (await readVisit(pool, visit.id)) || visit;
  if (saved.status !== existing?.status && saved.status !== 'Draft') {
    const email = saved.requesterEmail
      || await lookupEmployeeEmail(pool, saved.requesterEmployeeCode)
      || await lookupEmployeeEmailByName(pool, saved.createdBy);
    void notifyVisitorRequester(saved, email, saved.createdBy).catch((error) => {
      console.warn('[visitor] stage email failed:', error instanceof Error ? error.message : error);
    });
  }
  return saved;
};

export const patchVisit = async (
  id: string,
  patch: VisitorVisitInput,
  actor: string,
  event?: VisitorTimelineEvent,
  access?: VisitorAccess | null,
) => {
  const pool = await ensureVisitorDb();
  const existing = await readVisit(pool, clean(id, 40));
  if (!existing) throw new Error('Visit was not found.');
  return saveVisit({ ...patch, id: existing.id }, actor, event, access);
};

export const deleteVisit = async (id: string) => {
  const pool = await ensureVisitorDb();
  const result = await pool.request()
    .input('id', sql.NVarChar(40), clean(id, 40))
    .query(`DELETE FROM [security].[VisitorVisits] WHERE [VisitId] = @id`);
  return (result.rowsAffected[0] || 0) > 0;
};

const listArtifacts = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
    SELECT TOP 500 [ArtifactId], [Kind], [Name], [PayloadJson], [UpdatedAt]
    FROM [security].[VisitorArtifacts]
    ORDER BY [UpdatedAt] DESC
  `);
  return (result.recordset as Record<string, unknown>[]).map(mapArtifact);
};

export const saveArtifact = async (input: { id?: string; kind: string; name: string; payload?: Record<string, unknown> }) => {
  const pool = await ensureVisitorDb();
  const id = clean(input.id, 40) || idFor('art');
  const kind = clean(input.kind, 40);
  const name = clean(input.name, 200);
  if (!kind || !name) throw new Error('Artifact kind and name are required.');
  const payload = JSON.stringify(input.payload || {});
  const existing = await pool.request().input('id', sql.NVarChar(40), id).query(`
    SELECT [ArtifactId] FROM [security].[VisitorArtifacts] WHERE [ArtifactId] = @id
  `);
  const request = pool.request()
    .input('id', sql.NVarChar(40), id)
    .input('kind', sql.NVarChar(40), kind)
    .input('name', sql.NVarChar(200), name)
    .input('payload', sql.NVarChar(sql.MAX), payload);
  if (existing.recordset.length) {
    await request.query(`
      UPDATE [security].[VisitorArtifacts]
      SET [Kind]=@kind, [Name]=@name, [PayloadJson]=@payload, [UpdatedAt]=SYSUTCDATETIME()
      WHERE [ArtifactId]=@id
    `);
  } else {
    await request.query(`
      INSERT INTO [security].[VisitorArtifacts] ([ArtifactId], [Kind], [Name], [PayloadJson])
      VALUES (@id, @kind, @name, @payload)
    `);
  }
  const row = await pool.request().input('id', sql.NVarChar(40), id).query(`
    SELECT TOP 1 [ArtifactId], [Kind], [Name], [PayloadJson], [UpdatedAt]
    FROM [security].[VisitorArtifacts] WHERE [ArtifactId]=@id
  `);
  return mapArtifact(row.recordset[0] as Record<string, unknown>);
};

export const deleteArtifact = async (id: string) => {
  const pool = await ensureVisitorDb();
  const result = await pool.request()
    .input('id', sql.NVarChar(40), clean(id, 40))
    .query(`DELETE FROM [security].[VisitorArtifacts] WHERE [ArtifactId]=@id`);
  return (result.rowsAffected[0] || 0) > 0;
};

export const searchVisitorEmployees = async (query: string, department = ''): Promise<DirectoryEmployee[]> => {
  const pool = await ensureVisitorDb();
  const q = clean(query, 80);
  if (q.length < 2) return [];
  try {
    const request = pool.request();
    request.input('Like', sql.NVarChar(100), `%${q.replace(/[%_[\]]/g, '')}%`);
    request.input('Department', sql.NVarChar(180), clean(department, 180));
    const result = await request.query(`
      SELECT TOP 15
        v.[employee_code] AS [Code],
        v.[full_name] AS [Name],
        v.[department] AS [Department],
        v.[job_title] AS [Title],
        COALESCE(NULLIF(v.[work_location], N''), NULLIF(j.[office_location], N''), N'') AS [Location],
        COALESCE(NULLIF(v.[primary_phone], N''), N'') AS [Phone],
        COALESCE(NULLIF(contact.[office_extension], N''), N'') AS [Extension],
        COALESCE(NULLIF(v.[official_email], N''), NULLIF(v.[personal_email], N''), N'') AS [Email]
      FROM [hris].[EmployeeMasterView] v
      LEFT JOIN [hris].[EmployeeJobInfo] j ON j.[employee_id] = v.[employee_id]
      LEFT JOIN [hris].[EmployeeContactInfo] contact ON contact.[employee_id] = v.[employee_id]
      WHERE (
        UPPER(v.[full_name]) LIKE UPPER(@Like)
        OR UPPER(v.[employee_code]) LIKE UPPER(@Like)
        OR UPPER(ISNULL(v.[department], N'')) LIKE UPPER(@Like)
      )
      AND ISNULL(v.[employment_status], N'') NOT IN (N'Resigned', N'Terminated', N'Inactive', N'Dismissed')
      AND (@Department = N'' OR UPPER(LTRIM(RTRIM(ISNULL(v.[department], N'')))) = UPPER(@Department))
      ORDER BY CASE WHEN @Department <> N'' AND UPPER(LTRIM(RTRIM(ISNULL(v.[department], N'')))) = UPPER(@Department) THEN 0 ELSE 1 END, v.[full_name]
    `);
    return (result.recordset as Record<string, unknown>[]).map((row) => ({
      code: clean(row.Code, 40),
      name: clean(row.Name, 180),
      department: clean(row.Department, 180),
      title: clean(row.Title, 180),
      location: clean(row.Location, 180),
      phone: clean(row.Phone, 40),
      extension: clean(row.Extension, 40),
      email: clean(row.Email, 180),
    })).filter((row) => row.code && row.name);
  } catch (error) {
    console.warn('[visitor] employee search failed:', error instanceof Error ? error.message : error);
    return [];
  }
};

const listDirectories = async (pool: sql.ConnectionPool, visits: VisitorVisit[]): Promise<VisitorDirectories> => {
  let departments: string[] = [];
  let locations: string[] = [];
  let employeeCount = 0;
  try {
    const structure = await pool.request().query(`
      SELECT DISTINCT LTRIM(RTRIM([Name])) AS [Name]
      FROM [hris].[OrganizationDepartments]
      WHERE [Name] IS NOT NULL AND LTRIM(RTRIM([Name])) <> N'' AND LTRIM(RTRIM([Name])) <> N'Unassigned Department'
    `);
    departments = (structure.recordset as { Name?: string }[]).map((row) => clean(row.Name, 180));
  } catch {
    departments = [];
  }
  if (!departments.length) {
    try {
      const directory = await pool.request().query(`
        SELECT DISTINCT LTRIM(RTRIM([department])) AS [Name]
        FROM [hris].[EmployeeMasterView]
        WHERE [department] IS NOT NULL AND LTRIM(RTRIM([department])) <> N''
      `);
      departments = (directory.recordset as { Name?: string }[]).map((row) => clean(row.Name, 180));
    } catch {
      departments = [];
    }
  }
  try {
    const sites = await pool.request().query(`
      SELECT DISTINCT [Name] FROM (
        SELECT LTRIM(RTRIM([Name])) AS [Name] FROM [hris].[OrganizationLocationsSites]
        UNION
        SELECT LTRIM(RTRIM([work_location])) FROM [hris].[EmployeeMasterView]
        UNION
        SELECT LTRIM(RTRIM([office_location])) FROM [hris].[EmployeeJobInfo]
      ) sites
      WHERE [Name] IS NOT NULL AND [Name] <> N''
    `);
    locations = (sites.recordset as { Name?: string }[]).map((row) => clean(row.Name, 180));
  } catch {
    try {
      const sites = await pool.request().query(`
        SELECT DISTINCT [Name] FROM (
          SELECT LTRIM(RTRIM([work_location])) AS [Name] FROM [hris].[EmployeeMasterView]
          UNION
          SELECT LTRIM(RTRIM([office_location])) FROM [hris].[EmployeeJobInfo]
        ) sites
        WHERE [Name] IS NOT NULL AND [Name] <> N''
      `);
      locations = (sites.recordset as { Name?: string }[]).map((row) => clean(row.Name, 180));
    } catch {
      locations = [];
    }
  }
  try {
    const count = await pool.request().query(`
      SELECT COUNT(*) AS total
      FROM [hris].[EmployeeMasterView]
      WHERE ISNULL([employment_status], N'') NOT IN (N'Resigned', N'Terminated', N'Inactive', N'Dismissed')
    `);
    employeeCount = Number(count.recordset[0]?.total || 0);
  } catch {
    employeeCount = 0;
  }
  return {
    departments: uniqueLabels([...departments, ...visits.map((visit) => visit.department)]),
    locations: uniqueLabels([...locations, ...visits.map((visit) => visit.location)]),
    companies: uniqueLabels(visits.map((visit) => visit.company)),
    employeeCount,
  };
};

export const loadVisitorWorkspace = async (access?: VisitorAccess | null): Promise<VisitorWorkspace> => {
  const pool = await ensureVisitorDb();
  const visits = (await listVisits()).filter((visit) => canSeeVisit(visit, access));
  const [directories, artifacts] = await Promise.all([
    listDirectories(pool, visits),
    listArtifacts(pool),
  ]);
  return {
    visits,
    directories,
    artifacts,
    access: {
      seesAll: Boolean(access?.seesAll),
      canSecurity: Boolean(access?.canSecurity),
      canReception: Boolean(access?.canReception),
      employeeCode: access?.employeeCode || '',
      name: access?.name || '',
      department: access?.department || '',
    },
  };
};
