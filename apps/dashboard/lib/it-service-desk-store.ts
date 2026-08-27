import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureItServiceDeskSchemaSql } from '@/lib/it-service-desk-sql-schema';

const dbReady = { value: false };

export const nowItsmIso = () => new Date().toISOString();
export const newItsmId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
const cleanNullable = (value: unknown, max = 200) => {
  const text = clean(value, max);
  return text || null;
};
const toIso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const toBool = (value: unknown) => Boolean(value === true || value === 1 || value === '1' || value === 'true');

export type ItsmTicket = {
  ticketId: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  category: string | null;
  queue: string | null;
  requesterId: string | null;
  requesterName: string | null;
  department: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  impact: string | null;
  urgency: string | null;
  slaDueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  isArchived: boolean;
  isReopened: boolean;
  attachmentMetaJson: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type ItsmIncident = {
  incidentId: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  impact: string | null;
  assignedTeam: string | null;
  service: string | null;
  isMajor: boolean;
  warRoomJson: string | null;
  slaDueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type ItsmServiceRequest = {
  requestId: string;
  serviceId: string | null;
  serviceName: string;
  title: string;
  description: string | null;
  stage: string;
  priority: string | null;
  requesterId: string | null;
  requesterName: string | null;
  assigneeName: string | null;
  department: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

const mapTicket = (row: Record<string, unknown>): ItsmTicket => ({
  ticketId: String(row.TicketId),
  subject: String(row.Subject),
  description: row.Description == null ? null : String(row.Description),
  status: String(row.Status),
  priority: String(row.Priority),
  category: row.Category == null ? null : String(row.Category),
  queue: row.Queue == null ? null : String(row.Queue),
  requesterId: row.RequesterId == null ? null : String(row.RequesterId),
  requesterName: row.RequesterName == null ? null : String(row.RequesterName),
  department: row.Department == null ? null : String(row.Department),
  assigneeId: row.AssigneeId == null ? null : String(row.AssigneeId),
  assigneeName: row.AssigneeName == null ? null : String(row.AssigneeName),
  impact: row.Impact == null ? null : String(row.Impact),
  urgency: row.Urgency == null ? null : String(row.Urgency),
  slaDueAt: toIso(row.SlaDueAt),
  resolvedAt: toIso(row.ResolvedAt),
  closedAt: toIso(row.ClosedAt),
  isArchived: toBool(row.IsArchived),
  isReopened: toBool(row.IsReopened),
  attachmentMetaJson: row.AttachmentMetaJson == null ? null : String(row.AttachmentMetaJson),
  createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const mapIncident = (row: Record<string, unknown>): ItsmIncident => ({
  incidentId: String(row.IncidentId),
  title: String(row.Title),
  description: row.Description == null ? null : String(row.Description),
  priority: String(row.Priority),
  status: String(row.Status),
  impact: row.Impact == null ? null : String(row.Impact),
  assignedTeam: row.AssignedTeam == null ? null : String(row.AssignedTeam),
  service: row.Service == null ? null : String(row.Service),
  isMajor: toBool(row.IsMajor),
  warRoomJson: row.WarRoomJson == null ? null : String(row.WarRoomJson),
  slaDueAt: toIso(row.SlaDueAt),
  resolvedAt: toIso(row.ResolvedAt),
  createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const mapRequest = (row: Record<string, unknown>): ItsmServiceRequest => ({
  requestId: String(row.RequestId),
  serviceId: row.ServiceId == null ? null : String(row.ServiceId),
  serviceName: String(row.ServiceName),
  title: String(row.Title),
  description: row.Description == null ? null : String(row.Description),
  stage: String(row.Stage),
  priority: row.Priority == null ? null : String(row.Priority),
  requesterId: row.RequesterId == null ? null : String(row.RequesterId),
  requesterName: row.RequesterName == null ? null : String(row.RequesterName),
  assigneeName: row.AssigneeName == null ? null : String(row.AssigneeName),
  department: row.Department == null ? null : String(row.Department),
  createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
  createdBy: row.CreatedBy == null ? null : String(row.CreatedBy),
  updatedBy: row.UpdatedBy == null ? null : String(row.UpdatedBy),
});

const nextSequentialId = async (pool: sql.ConnectionPool, table: string, column: string, prefix: string) => {
  const result = await pool
    .request()
    .query(`SELECT MAX(${column}) AS MaxId FROM [it].[${table}] WHERE ${column} LIKE N'${prefix}-%'`);
  const maxId = String(result.recordset[0]?.MaxId || '');
  const match = maxId.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
  const next = match ? Number(match[1]) + 1 : 1001;
  return `${prefix}-${String(next).padStart(4, '0')}`;
};

const addActivity = async (pool: sql.ConnectionPool, ticketId: string, action: string, actorName: string) => {
  await pool
    .request()
    .input('ActivityId', sql.NVarChar(40), newItsmId('ACT'))
    .input('TicketId', sql.NVarChar(40), ticketId)
    .input('Action', sql.NVarChar(300), clean(action, 300))
    .input('ActorName', sql.NVarChar(220), cleanNullable(actorName, 220))
    .query(`
      INSERT INTO [it].[ItsmTicketActivity] ([ActivityId], [TicketId], [Action], [ActorName])
      VALUES (@ActivityId, @TicketId, @Action, @ActorName)
    `);
};

const resolveSlaDueAt = async (pool: sql.ConnectionPool, priority: string) => {
  const result = await pool
    .request()
    .input('Priority', sql.NVarChar(20), priority)
    .query(`
      SELECT TOP 1 [ResolveMinutes]
      FROM [it].[ItsmSlaPolicies]
      WHERE [IsActive] = 1 AND [Priority] = @Priority
      ORDER BY [UpdatedAt] DESC
    `);
  const minutes = Number(result.recordset[0]?.ResolveMinutes || 0);
  if (!minutes) return null;
  return new Date(Date.now() + minutes * 60_000);
};

export const ensureItServiceDeskDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!dbReady.value) {
    await pool.request().query(ensureItServiceDeskSchemaSql);
    await seedDefaults(pool);
    dbReady.value = true;
  }
  return pool;
};

const seedDefaults = async (pool: sql.ConnectionPool) => {
  const settingsCount = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM [it].[ItsmSettings]`);
  if (Number(settingsCount.recordset[0]?.Cnt || 0) === 0) {
    const settings: Array<[string, string, string, string | null, number]> = [
      ['category', 'Email', 'Email', null, 1],
      ['category', 'Network', 'Network', null, 2],
      ['category', 'Hardware', 'Hardware', null, 3],
      ['category', 'Software', 'Software', null, 4],
      ['category', 'Infrastructure', 'Infrastructure', null, 5],
      ['category', 'HR', 'HR', null, 6],
      ['priority', 'Critical', 'Critical', null, 1],
      ['priority', 'High', 'High', null, 2],
      ['priority', 'Medium', 'Medium', null, 3],
      ['priority', 'Low', 'Low', null, 4],
      ['status', 'Open', 'Open', null, 1],
      ['status', 'In Progress', 'In Progress', null, 2],
      ['status', 'Pending', 'Pending', null, 3],
      ['status', 'Resolved', 'Resolved', null, 4],
      ['status', 'Closed', 'Closed', null, 5],
      ['queue', 'Service Desk', 'Service Desk', null, 1],
      ['queue', 'Infrastructure', 'Infrastructure', null, 2],
      ['queue', 'Applications', 'Applications', null, 3],
      ['business-hours', 'Weekday Hours', '08:00-17:00', JSON.stringify({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '08:00', end: '17:00' }), 1],
      ['holiday', 'New Year', '01-01', null, 1],
      ['email-template', 'Ticket Created', 'Ticket Created', JSON.stringify({ subject: 'Ticket {{id}} created', body: 'Your ticket has been logged.' }), 1],
    ];
    for (const [type, name, value, payload, sort] of settings) {
      await pool
        .request()
        .input('SettingId', sql.NVarChar(40), newItsmId('SET'))
        .input('SettingType', sql.NVarChar(60), type)
        .input('Name', sql.NVarChar(200), name)
        .input('Value', sql.NVarChar(200), value)
        .input('PayloadJson', sql.NVarChar(sql.MAX), payload)
        .input('SortOrder', sql.Int, sort)
        .query(`
          INSERT INTO [it].[ItsmSettings] ([SettingId], [SettingType], [Name], [Value], [PayloadJson], [SortOrder])
          VALUES (@SettingId, @SettingType, @Name, @Value, @PayloadJson, @SortOrder)
        `);
    }
  }

  const slaCount = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM [it].[ItsmSlaPolicies]`);
  if (Number(slaCount.recordset[0]?.Cnt || 0) === 0) {
    const policies = [
      ['Critical Response', 'Critical', 15, 60],
      ['High Response', 'High', 30, 240],
      ['Medium Response', 'Medium', 120, 480],
      ['Low Response', 'Low', 480, 1440],
    ] as const;
    for (const [name, priority, response, resolve] of policies) {
      await pool
        .request()
        .input('PolicyId', sql.NVarChar(40), newItsmId('SLA'))
        .input('Name', sql.NVarChar(200), name)
        .input('Priority', sql.NVarChar(20), priority)
        .input('ResponseMinutes', sql.Int, response)
        .input('ResolveMinutes', sql.Int, resolve)
        .query(`
          INSERT INTO [it].[ItsmSlaPolicies] ([PolicyId], [Name], [Priority], [ResponseMinutes], [ResolveMinutes])
          VALUES (@PolicyId, @Name, @Priority, @ResponseMinutes, @ResolveMinutes)
        `);
    }
  }

  const catalogCount = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM [it].[ItsmServiceCatalog]`);
  if (Number(catalogCount.recordset[0]?.Cnt || 0) === 0) {
    const catalog = [
      ['Laptop Request', 'Request a new laptop for yourself or a new employee.', 'Hardware', '2-3 business days', 1, 1, 1],
      ['VPN Access', 'Request access to corporate VPN for secure remote work.', 'Network', '1 hour', 0, 1, 1],
      ['Mobile Device Request', 'Request a company smartphone or tablet.', 'Hardware', '1 week', 1, 1, 1],
      ['Email Distribution List', 'Create or modify an email distribution list.', 'Email', '1 business day', 0, 0, 0],
      ['Software License', 'Request a software license for approved applications.', 'Software', '2 business days', 1, 1, 0],
      ['New User Account', 'Provision accounts for a new employee.', 'HR', '1 business day', 1, 1, 1],
    ] as const;
    let sort = 1;
    for (const [name, description, category, eta, approval, popular, featured] of catalog) {
      await pool
        .request()
        .input('ServiceId', sql.NVarChar(40), newItsmId('SRV'))
        .input('Name', sql.NVarChar(200), name)
        .input('Description', sql.NVarChar(sql.MAX), description)
        .input('Category', sql.NVarChar(80), category)
        .input('EstimatedCompletion', sql.NVarChar(80), eta)
        .input('ApprovalRequired', sql.Bit, approval)
        .input('IsPopular', sql.Bit, popular)
        .input('IsFeatured', sql.Bit, featured)
        .input('SortOrder', sql.Int, sort++)
        .query(`
          INSERT INTO [it].[ItsmServiceCatalog]
            ([ServiceId], [Name], [Description], [Category], [EstimatedCompletion], [ApprovalRequired], [IsPopular], [IsFeatured], [SortOrder])
          VALUES
            (@ServiceId, @Name, @Description, @Category, @EstimatedCompletion, @ApprovalRequired, @IsPopular, @IsFeatured, @SortOrder)
        `);
    }
  }

  const kbCount = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM [it].[ItsmKbArticles]`);
  if (Number(kbCount.recordset[0]?.Cnt || 0) === 0) {
    const articles = [
      ['Reset Outlook sync', 'Steps to repair Outlook sync issues.', 'email,outlook,sync'],
      ['VPN reconnect checklist', 'Common VPN drop troubleshooting.', 'vpn,network,remote'],
      ['Printer offline recovery', 'Restart print spooler and check IP.', 'printer,hardware'],
    ] as const;
    for (const [title, body, keywords] of articles) {
      await pool
        .request()
        .input('ArticleId', sql.NVarChar(40), newItsmId('KB'))
        .input('Title', sql.NVarChar(300), title)
        .input('Body', sql.NVarChar(sql.MAX), body)
        .input('Keywords', sql.NVarChar(500), keywords)
        .query(`
          INSERT INTO [it].[ItsmKbArticles] ([ArticleId], [Title], [Body], [Keywords])
          VALUES (@ArticleId, @Title, @Body, @Keywords)
        `);
    }
  }
};

export type TicketListFilter = {
  status?: string;
  statuses?: string[];
  assigneeName?: string;
  assigneeId?: string;
  mineFor?: string;
  priority?: string;
  category?: string;
  queue?: string;
  search?: string;
  overdueOnly?: boolean;
  archived?: boolean;
  reopened?: boolean;
};

export const listTickets = async (filter: TicketListFilter = {}) => {
  const pool = await ensureItServiceDeskDb();
  const req = pool.request();
  const where: string[] = ['1=1'];

  if (filter.archived === true) {
    where.push('[IsArchived] = 1');
  } else if (filter.archived === false) {
    where.push('[IsArchived] = 0');
  }
  if (filter.reopened) where.push('[IsReopened] = 1');
  if (filter.status) {
    req.input('Status', sql.NVarChar(40), filter.status);
    where.push('[Status] = @Status');
  }
  if (filter.statuses?.length) {
    const parts = filter.statuses.map((s, i) => {
      const key = `St${i}`;
      req.input(key, sql.NVarChar(40), s);
      return `[Status] = @${key}`;
    });
    where.push(`(${parts.join(' OR ')})`);
  }
  if (filter.priority) {
    req.input('Priority', sql.NVarChar(20), filter.priority);
    where.push('[Priority] = @Priority');
  }
  if (filter.category) {
    req.input('Category', sql.NVarChar(80), filter.category);
    where.push('[Category] = @Category');
  }
  if (filter.queue) {
    req.input('Queue', sql.NVarChar(80), filter.queue);
    where.push('[Queue] = @Queue');
  }
  if (filter.assigneeName) {
    req.input('AssigneeName', sql.NVarChar(220), filter.assigneeName);
    where.push('[AssigneeName] = @AssigneeName');
  }
  if (filter.assigneeId) {
    req.input('AssigneeId', sql.NVarChar(80), filter.assigneeId);
    where.push('[AssigneeId] = @AssigneeId');
  }
  if (filter.mineFor) {
    req.input('MineFor', sql.NVarChar(220), filter.mineFor);
    where.push('([AssigneeName] = @MineFor OR [RequesterName] = @MineFor OR [CreatedBy] = @MineFor)');
  }
  if (filter.search) {
    req.input('Search', sql.NVarChar(200), `%${clean(filter.search, 100)}%`);
    where.push('([Subject] LIKE @Search OR [TicketId] LIKE @Search OR [RequesterName] LIKE @Search)');
  }
  if (filter.overdueOnly) {
    where.push('[SlaDueAt] IS NOT NULL AND [SlaDueAt] < SYSUTCDATETIME() AND [Status] NOT IN (N\'Resolved\', N\'Closed\')');
  }

  const result = await req.query(`
    SELECT * FROM [it].[ItsmTickets]
    WHERE ${where.join(' AND ')}
    ORDER BY [UpdatedAt] DESC
  `);
  return result.recordset.map((row) => mapTicket(row as Record<string, unknown>));
};

export const getTicket = async (ticketId: string) => {
  const pool = await ensureItServiceDeskDb();
  const result = await pool
    .request()
    .input('TicketId', sql.NVarChar(40), ticketId)
    .query(`SELECT * FROM [it].[ItsmTickets] WHERE [TicketId] = @TicketId`);
  const row = result.recordset[0];
  return row ? mapTicket(row as Record<string, unknown>) : null;
};

export const createTicket = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const ticketId = await nextSequentialId(pool, 'ItsmTickets', 'TicketId', 'TK');
  const priority = clean(input.priority || 'Medium', 20) || 'Medium';
  const status = clean(input.status || 'Open', 40) || 'Open';
  const slaDueAt = await resolveSlaDueAt(pool, priority);

  await pool
    .request()
    .input('TicketId', sql.NVarChar(40), ticketId)
    .input('Subject', sql.NVarChar(300), clean(input.subject, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
    .input('Status', sql.NVarChar(40), status)
    .input('Priority', sql.NVarChar(20), priority)
    .input('Category', sql.NVarChar(80), cleanNullable(input.category, 80))
    .input('Queue', sql.NVarChar(80), cleanNullable(input.queue, 80) || 'Service Desk')
    .input('RequesterId', sql.NVarChar(80), cleanNullable(input.requesterId, 80))
    .input('RequesterName', sql.NVarChar(220), cleanNullable(input.requesterName, 220) || actor)
    .input('Department', sql.NVarChar(180), cleanNullable(input.department, 180))
    .input('AssigneeId', sql.NVarChar(80), cleanNullable(input.assigneeId, 80))
    .input('AssigneeName', sql.NVarChar(220), cleanNullable(input.assigneeName, 220))
    .input('Impact', sql.NVarChar(40), cleanNullable(input.impact, 40))
    .input('Urgency', sql.NVarChar(40), cleanNullable(input.urgency, 40))
    .input('SlaDueAt', sql.DateTime2, slaDueAt)
    .input('AttachmentMetaJson', sql.NVarChar(sql.MAX), cleanNullable(input.attachmentMetaJson, 8000))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [it].[ItsmTickets] (
        [TicketId], [Subject], [Description], [Status], [Priority], [Category], [Queue],
        [RequesterId], [RequesterName], [Department], [AssigneeId], [AssigneeName],
        [Impact], [Urgency], [SlaDueAt], [AttachmentMetaJson], [CreatedBy], [UpdatedBy]
      ) VALUES (
        @TicketId, @Subject, @Description, @Status, @Priority, @Category, @Queue,
        @RequesterId, @RequesterName, @Department, @AssigneeId, @AssigneeName,
        @Impact, @Urgency, @SlaDueAt, @AttachmentMetaJson, @CreatedBy, @UpdatedBy
      )
    `);

  await addActivity(pool, ticketId, `Created ticket ${ticketId}`, actor);
  if (cleanNullable(input.assigneeName, 220)) {
    await addActivity(pool, ticketId, `Assigned to ${clean(input.assigneeName, 220)}`, actor);
  }
  return getTicket(ticketId);
};

export const updateTicket = async (ticketId: string, input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const existing = await getTicket(ticketId);
  if (!existing) throw new Error('Ticket not found');

  const status = clean(input.status ?? existing.status, 40);
  const priority = clean(input.priority ?? existing.priority, 20);
  let slaDueAt = existing.slaDueAt ? new Date(existing.slaDueAt) : null;
  if (priority !== existing.priority) {
    slaDueAt = (await resolveSlaDueAt(pool, priority)) || slaDueAt;
  }

  const resolvedAt =
    status === 'Resolved' && existing.status !== 'Resolved'
      ? new Date()
      : existing.resolvedAt
        ? new Date(existing.resolvedAt)
        : null;
  const closedAt =
    status === 'Closed' && existing.status !== 'Closed'
      ? new Date()
      : existing.closedAt
        ? new Date(existing.closedAt)
        : null;
  const isReopened =
    Boolean(input.isReopened) ||
    (['Open', 'In Progress', 'Pending'].includes(status) && ['Resolved', 'Closed'].includes(existing.status));

  await pool
    .request()
    .input('TicketId', sql.NVarChar(40), ticketId)
    .input('Subject', sql.NVarChar(300), clean(input.subject ?? existing.subject, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description ?? existing.description, 8000))
    .input('Status', sql.NVarChar(40), status)
    .input('Priority', sql.NVarChar(20), priority)
    .input('Category', sql.NVarChar(80), cleanNullable(input.category ?? existing.category, 80))
    .input('Queue', sql.NVarChar(80), cleanNullable(input.queue ?? existing.queue, 80))
    .input('RequesterName', sql.NVarChar(220), cleanNullable(input.requesterName ?? existing.requesterName, 220))
    .input('Department', sql.NVarChar(180), cleanNullable(input.department ?? existing.department, 180))
    .input('AssigneeId', sql.NVarChar(80), cleanNullable(input.assigneeId ?? existing.assigneeId, 80))
    .input('AssigneeName', sql.NVarChar(220), cleanNullable(input.assigneeName ?? existing.assigneeName, 220))
    .input('Impact', sql.NVarChar(40), cleanNullable(input.impact ?? existing.impact, 40))
    .input('Urgency', sql.NVarChar(40), cleanNullable(input.urgency ?? existing.urgency, 40))
    .input('SlaDueAt', sql.DateTime2, slaDueAt)
    .input('ResolvedAt', sql.DateTime2, resolvedAt)
    .input('ClosedAt', sql.DateTime2, closedAt)
    .input('IsArchived', sql.Bit, input.isArchived != null ? toBool(input.isArchived) : existing.isArchived)
    .input('IsReopened', sql.Bit, isReopened)
    .input('AttachmentMetaJson', sql.NVarChar(sql.MAX), cleanNullable(input.attachmentMetaJson ?? existing.attachmentMetaJson, 8000))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      UPDATE [it].[ItsmTickets] SET
        [Subject]=@Subject, [Description]=@Description, [Status]=@Status, [Priority]=@Priority,
        [Category]=@Category, [Queue]=@Queue, [RequesterName]=@RequesterName, [Department]=@Department,
        [AssigneeId]=@AssigneeId, [AssigneeName]=@AssigneeName, [Impact]=@Impact, [Urgency]=@Urgency,
        [SlaDueAt]=@SlaDueAt, [ResolvedAt]=@ResolvedAt, [ClosedAt]=@ClosedAt,
        [IsArchived]=@IsArchived, [IsReopened]=@IsReopened, [AttachmentMetaJson]=@AttachmentMetaJson,
        [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHERE [TicketId]=@TicketId
    `);

  if (status !== existing.status) await addActivity(pool, ticketId, `Status changed to ${status}`, actor);
  if ((input.assigneeName ?? existing.assigneeName) !== existing.assigneeName) {
    await addActivity(pool, ticketId, `Assigned to ${clean(input.assigneeName ?? '', 220) || 'Unassigned'}`, actor);
  }
  return getTicket(ticketId);
};

export const bulkAssignTickets = async (ticketIds: string[], assigneeName: string, actor: string) => {
  const results = [];
  for (const ticketId of ticketIds) {
    results.push(await updateTicket(ticketId, { assigneeName, status: 'In Progress' }, actor));
  }
  return results;
};

export const listTicketComments = async (ticketId: string) => {
  const pool = await ensureItServiceDeskDb();
  const result = await pool
    .request()
    .input('TicketId', sql.NVarChar(40), ticketId)
    .query(`
      SELECT * FROM [it].[ItsmTicketComments]
      WHERE [TicketId] = @TicketId
      ORDER BY [CreatedAt] DESC
    `);
  return result.recordset.map((row) => ({
    commentId: String(row.CommentId),
    ticketId: String(row.TicketId),
    body: String(row.Body),
    authorName: String(row.AuthorName),
    authorId: row.AuthorId == null ? null : String(row.AuthorId),
    createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  }));
};

export const addTicketComment = async (ticketId: string, body: string, actor: string, authorId?: string) => {
  const pool = await ensureItServiceDeskDb();
  const commentId = newItsmId('CMT');
  await pool
    .request()
    .input('CommentId', sql.NVarChar(40), commentId)
    .input('TicketId', sql.NVarChar(40), ticketId)
    .input('Body', sql.NVarChar(sql.MAX), clean(body, 8000))
    .input('AuthorName', sql.NVarChar(220), clean(actor, 220))
    .input('AuthorId', sql.NVarChar(80), cleanNullable(authorId, 80))
    .query(`
      INSERT INTO [it].[ItsmTicketComments] ([CommentId], [TicketId], [Body], [AuthorName], [AuthorId])
      VALUES (@CommentId, @TicketId, @Body, @AuthorName, @AuthorId)
    `);
  await addActivity(pool, ticketId, `Added comment`, actor);
  await pool
    .request()
    .input('TicketId', sql.NVarChar(40), ticketId)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`UPDATE [it].[ItsmTickets] SET [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy WHERE [TicketId]=@TicketId`);
  return { commentId, ticketId, body: clean(body, 8000), authorName: actor, authorId: authorId || null, createdAt: nowItsmIso() };
};

export const listTicketActivity = async (ticketId?: string) => {
  const pool = await ensureItServiceDeskDb();
  const req = pool.request();
  let where = '1=1';
  if (ticketId) {
    req.input('TicketId', sql.NVarChar(40), ticketId);
    where = '[TicketId] = @TicketId';
  }
  const result = await req.query(`
    SELECT TOP 100 * FROM [it].[ItsmTicketActivity]
    WHERE ${where}
    ORDER BY [CreatedAt] DESC
  `);
  return result.recordset.map((row) => ({
    activityId: String(row.ActivityId),
    ticketId: String(row.TicketId),
    action: String(row.Action),
    actorName: row.ActorName == null ? null : String(row.ActorName),
    createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  }));
};

export const listTemplates = async () => {
  const pool = await ensureItServiceDeskDb();
  const result = await pool.request().query(`
    SELECT * FROM [it].[ItsmTicketTemplates]
    WHERE [IsArchived] = 0
    ORDER BY [IsFavorite] DESC, [UpdatedAt] DESC
  `);
  return result.recordset.map((row) => ({
    templateId: String(row.TemplateId),
    name: String(row.Name),
    subject: String(row.Subject),
    description: row.Description == null ? null : String(row.Description),
    category: row.Category == null ? null : String(row.Category),
    priority: row.Priority == null ? null : String(row.Priority),
    isFavorite: toBool(row.IsFavorite),
    isArchived: toBool(row.IsArchived),
    createdAt: toIso(row.CreatedAt) || nowItsmIso(),
    updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
  }));
};

export const upsertTemplate = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const templateId = clean(input.templateId, 40) || newItsmId('TPL');
  const existing = await pool
    .request()
    .input('TemplateId', sql.NVarChar(40), templateId)
    .query(`SELECT 1 AS Ok FROM [it].[ItsmTicketTemplates] WHERE [TemplateId]=@TemplateId`);

  if (existing.recordset[0]) {
    await pool
      .request()
      .input('TemplateId', sql.NVarChar(40), templateId)
      .input('Name', sql.NVarChar(200), clean(input.name, 200))
      .input('Subject', sql.NVarChar(300), clean(input.subject, 300))
      .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
      .input('Category', sql.NVarChar(80), cleanNullable(input.category, 80))
      .input('Priority', sql.NVarChar(20), cleanNullable(input.priority, 20))
      .input('IsFavorite', sql.Bit, toBool(input.isFavorite))
      .input('IsArchived', sql.Bit, toBool(input.isArchived))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        UPDATE [it].[ItsmTicketTemplates] SET
          [Name]=@Name, [Subject]=@Subject, [Description]=@Description, [Category]=@Category,
          [Priority]=@Priority, [IsFavorite]=@IsFavorite, [IsArchived]=@IsArchived,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [TemplateId]=@TemplateId
      `);
  } else {
    await pool
      .request()
      .input('TemplateId', sql.NVarChar(40), templateId)
      .input('Name', sql.NVarChar(200), clean(input.name, 200))
      .input('Subject', sql.NVarChar(300), clean(input.subject, 300))
      .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
      .input('Category', sql.NVarChar(80), cleanNullable(input.category, 80))
      .input('Priority', sql.NVarChar(20), cleanNullable(input.priority, 20))
      .input('IsFavorite', sql.Bit, toBool(input.isFavorite))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        INSERT INTO [it].[ItsmTicketTemplates]
          ([TemplateId], [Name], [Subject], [Description], [Category], [Priority], [IsFavorite], [CreatedBy], [UpdatedBy])
        VALUES
          (@TemplateId, @Name, @Subject, @Description, @Category, @Priority, @IsFavorite, @CreatedBy, @UpdatedBy)
      `);
  }
  const all = await listTemplates();
  return all.find((t) => t.templateId === templateId) || null;
};

export const deleteTemplate = async (templateId: string) => {
  const pool = await ensureItServiceDeskDb();
  await pool
    .request()
    .input('TemplateId', sql.NVarChar(40), templateId)
    .query(`UPDATE [it].[ItsmTicketTemplates] SET [IsArchived]=1, [UpdatedAt]=SYSUTCDATETIME() WHERE [TemplateId]=@TemplateId`);
  return { ok: true };
};

export const listIncidents = async (filter: { status?: string; isMajor?: boolean; search?: string } = {}) => {
  const pool = await ensureItServiceDeskDb();
  const req = pool.request();
  const where: string[] = ['1=1'];
  if (filter.status) {
    req.input('Status', sql.NVarChar(40), filter.status);
    where.push('[Status]=@Status');
  }
  if (filter.isMajor != null) {
    req.input('IsMajor', sql.Bit, filter.isMajor ? 1 : 0);
    where.push('[IsMajor]=@IsMajor');
  }
  if (filter.search) {
    req.input('Search', sql.NVarChar(200), `%${clean(filter.search, 100)}%`);
    where.push('([Title] LIKE @Search OR [IncidentId] LIKE @Search)');
  }
  const result = await req.query(`
    SELECT * FROM [it].[ItsmIncidents]
    WHERE ${where.join(' AND ')}
    ORDER BY [UpdatedAt] DESC
  `);
  return result.recordset.map((row) => mapIncident(row as Record<string, unknown>));
};

export const createIncident = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const incidentId = await nextSequentialId(pool, 'ItsmIncidents', 'IncidentId', 'INC');
  const priority = clean(input.priority || 'High', 20) || 'High';
  const slaDueAt = await resolveSlaDueAt(pool, priority);
  await pool
    .request()
    .input('IncidentId', sql.NVarChar(40), incidentId)
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
    .input('Priority', sql.NVarChar(20), priority)
    .input('Status', sql.NVarChar(40), clean(input.status || 'Investigating', 40))
    .input('Impact', sql.NVarChar(200), cleanNullable(input.impact, 200))
    .input('AssignedTeam', sql.NVarChar(120), cleanNullable(input.assignedTeam, 120))
    .input('Service', sql.NVarChar(180), cleanNullable(input.service, 180))
    .input('IsMajor', sql.Bit, toBool(input.isMajor))
    .input('WarRoomJson', sql.NVarChar(sql.MAX), cleanNullable(input.warRoomJson, 8000))
    .input('SlaDueAt', sql.DateTime2, slaDueAt)
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [it].[ItsmIncidents] (
        [IncidentId], [Title], [Description], [Priority], [Status], [Impact], [AssignedTeam],
        [Service], [IsMajor], [WarRoomJson], [SlaDueAt], [CreatedBy], [UpdatedBy]
      ) VALUES (
        @IncidentId, @Title, @Description, @Priority, @Status, @Impact, @AssignedTeam,
        @Service, @IsMajor, @WarRoomJson, @SlaDueAt, @CreatedBy, @UpdatedBy
      )
    `);
  await addIncidentEvent(incidentId, `Incident reported: ${clean(input.title, 200)}`, actor);
  return (await listIncidents()).find((i) => i.incidentId === incidentId) || null;
};

export const updateIncident = async (incidentId: string, input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const existing = (await listIncidents()).find((i) => i.incidentId === incidentId);
  if (!existing) throw new Error('Incident not found');
  const status = clean(input.status ?? existing.status, 40);
  const resolvedAt =
    status === 'Resolved' && existing.status !== 'Resolved'
      ? new Date()
      : existing.resolvedAt
        ? new Date(existing.resolvedAt)
        : null;

  await pool
    .request()
    .input('IncidentId', sql.NVarChar(40), incidentId)
    .input('Title', sql.NVarChar(300), clean(input.title ?? existing.title, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description ?? existing.description, 8000))
    .input('Priority', sql.NVarChar(20), clean(input.priority ?? existing.priority, 20))
    .input('Status', sql.NVarChar(40), status)
    .input('Impact', sql.NVarChar(200), cleanNullable(input.impact ?? existing.impact, 200))
    .input('AssignedTeam', sql.NVarChar(120), cleanNullable(input.assignedTeam ?? existing.assignedTeam, 120))
    .input('Service', sql.NVarChar(180), cleanNullable(input.service ?? existing.service, 180))
    .input('IsMajor', sql.Bit, input.isMajor != null ? toBool(input.isMajor) : existing.isMajor)
    .input('WarRoomJson', sql.NVarChar(sql.MAX), cleanNullable(input.warRoomJson ?? existing.warRoomJson, 8000))
    .input('ResolvedAt', sql.DateTime2, resolvedAt)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      UPDATE [it].[ItsmIncidents] SET
        [Title]=@Title, [Description]=@Description, [Priority]=@Priority, [Status]=@Status,
        [Impact]=@Impact, [AssignedTeam]=@AssignedTeam, [Service]=@Service, [IsMajor]=@IsMajor,
        [WarRoomJson]=@WarRoomJson, [ResolvedAt]=@ResolvedAt, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHERE [IncidentId]=@IncidentId
    `);
  if (status !== existing.status) await addIncidentEvent(incidentId, `Status changed to ${status}`, actor);
  return (await listIncidents()).find((i) => i.incidentId === incidentId) || null;
};

export const listIncidentEvents = async (incidentId?: string) => {
  const pool = await ensureItServiceDeskDb();
  const req = pool.request();
  let where = '1=1';
  if (incidentId) {
    req.input('IncidentId', sql.NVarChar(40), incidentId);
    where = '[IncidentId]=@IncidentId';
  }
  const result = await req.query(`
    SELECT * FROM [it].[ItsmIncidentEvents]
    WHERE ${where}
    ORDER BY [EventAt] ASC
  `);
  return result.recordset.map((row) => ({
    eventId: String(row.EventId),
    incidentId: String(row.IncidentId),
    description: String(row.Description),
    eventAt: toIso(row.EventAt) || nowItsmIso(),
    actorName: row.ActorName == null ? null : String(row.ActorName),
    createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  }));
};

export const addIncidentEvent = async (incidentId: string, description: string, actor: string, eventAt?: string) => {
  const pool = await ensureItServiceDeskDb();
  const eventId = newItsmId('EVT');
  await pool
    .request()
    .input('EventId', sql.NVarChar(40), eventId)
    .input('IncidentId', sql.NVarChar(40), incidentId)
    .input('Description', sql.NVarChar(sql.MAX), clean(description, 8000))
    .input('EventAt', sql.DateTime2, eventAt ? new Date(eventAt) : new Date())
    .input('ActorName', sql.NVarChar(220), clean(actor, 220))
    .query(`
      INSERT INTO [it].[ItsmIncidentEvents] ([EventId], [IncidentId], [Description], [EventAt], [ActorName])
      VALUES (@EventId, @IncidentId, @Description, @EventAt, @ActorName)
    `);
  return { eventId, incidentId, description: clean(description, 8000), eventAt: eventAt || nowItsmIso(), actorName: actor };
};

export const getIncidentRca = async (incidentId: string) => {
  const pool = await ensureItServiceDeskDb();
  const result = await pool
    .request()
    .input('IncidentId', sql.NVarChar(40), incidentId)
    .query(`SELECT TOP 1 * FROM [it].[ItsmIncidentRca] WHERE [IncidentId]=@IncidentId ORDER BY [UpdatedAt] DESC`);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    rcaId: String(row.RcaId),
    incidentId: String(row.IncidentId),
    payloadJson: String(row.PayloadJson),
    status: String(row.Status),
    updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
  };
};

export const saveIncidentRca = async (incidentId: string, payloadJson: string, status: string, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const existing = await getIncidentRca(incidentId);
  const rcaId = existing?.rcaId || newItsmId('RCA');
  if (existing) {
    await pool
      .request()
      .input('RcaId', sql.NVarChar(40), rcaId)
      .input('PayloadJson', sql.NVarChar(sql.MAX), payloadJson)
      .input('Status', sql.NVarChar(40), clean(status || 'Draft', 40))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        UPDATE [it].[ItsmIncidentRca]
        SET [PayloadJson]=@PayloadJson, [Status]=@Status, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [RcaId]=@RcaId
      `);
  } else {
    await pool
      .request()
      .input('RcaId', sql.NVarChar(40), rcaId)
      .input('IncidentId', sql.NVarChar(40), incidentId)
      .input('PayloadJson', sql.NVarChar(sql.MAX), payloadJson)
      .input('Status', sql.NVarChar(40), clean(status || 'Draft', 40))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        INSERT INTO [it].[ItsmIncidentRca] ([RcaId], [IncidentId], [PayloadJson], [Status], [UpdatedBy])
        VALUES (@RcaId, @IncidentId, @PayloadJson, @Status, @UpdatedBy)
      `);
  }
  return getIncidentRca(incidentId);
};

export const listServiceCatalog = async () => {
  const pool = await ensureItServiceDeskDb();
  const result = await pool.request().query(`
    SELECT * FROM [it].[ItsmServiceCatalog]
    WHERE [IsActive]=1
    ORDER BY [SortOrder], [Name]
  `);
  return result.recordset.map((row) => ({
    serviceId: String(row.ServiceId),
    name: String(row.Name),
    description: row.Description == null ? null : String(row.Description),
    category: row.Category == null ? null : String(row.Category),
    estimatedCompletion: row.EstimatedCompletion == null ? null : String(row.EstimatedCompletion),
    approvalRequired: toBool(row.ApprovalRequired),
    isPopular: toBool(row.IsPopular),
    isFeatured: toBool(row.IsFeatured),
  }));
};

export const listServiceRequests = async (filter: { stage?: string; search?: string } = {}) => {
  const pool = await ensureItServiceDeskDb();
  const req = pool.request();
  const where: string[] = ['1=1'];
  if (filter.stage) {
    req.input('Stage', sql.NVarChar(40), filter.stage);
    where.push('[Stage]=@Stage');
  }
  if (filter.search) {
    req.input('Search', sql.NVarChar(200), `%${clean(filter.search, 100)}%`);
    where.push('([Title] LIKE @Search OR [RequestId] LIKE @Search OR [ServiceName] LIKE @Search)');
  }
  const result = await req.query(`
    SELECT * FROM [it].[ItsmServiceRequests]
    WHERE ${where.join(' AND ')}
    ORDER BY [UpdatedAt] DESC
  `);
  return result.recordset.map((row) => mapRequest(row as Record<string, unknown>));
};

export const createServiceRequest = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const requestId = await nextSequentialId(pool, 'ItsmServiceRequests', 'RequestId', 'SR');
  await pool
    .request()
    .input('RequestId', sql.NVarChar(40), requestId)
    .input('ServiceId', sql.NVarChar(40), cleanNullable(input.serviceId, 40))
    .input('ServiceName', sql.NVarChar(200), clean(input.serviceName || input.title, 200))
    .input('Title', sql.NVarChar(300), clean(input.title || input.serviceName, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
    .input('Stage', sql.NVarChar(40), clean(input.stage || 'New', 40))
    .input('Priority', sql.NVarChar(20), cleanNullable(input.priority, 20) || 'Medium')
    .input('RequesterId', sql.NVarChar(80), cleanNullable(input.requesterId, 80))
    .input('RequesterName', sql.NVarChar(220), cleanNullable(input.requesterName, 220) || actor)
    .input('AssigneeName', sql.NVarChar(220), cleanNullable(input.assigneeName, 220))
    .input('Department', sql.NVarChar(180), cleanNullable(input.department, 180))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [it].[ItsmServiceRequests] (
        [RequestId], [ServiceId], [ServiceName], [Title], [Description], [Stage], [Priority],
        [RequesterId], [RequesterName], [AssigneeName], [Department], [CreatedBy], [UpdatedBy]
      ) VALUES (
        @RequestId, @ServiceId, @ServiceName, @Title, @Description, @Stage, @Priority,
        @RequesterId, @RequesterName, @AssigneeName, @Department, @CreatedBy, @UpdatedBy
      )
    `);
  return (await listServiceRequests()).find((r) => r.requestId === requestId) || null;
};

export const updateServiceRequest = async (requestId: string, input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const existing = (await listServiceRequests()).find((r) => r.requestId === requestId);
  if (!existing) throw new Error('Service request not found');
  await pool
    .request()
    .input('RequestId', sql.NVarChar(40), requestId)
    .input('Title', sql.NVarChar(300), clean(input.title ?? existing.title, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description ?? existing.description, 8000))
    .input('Stage', sql.NVarChar(40), clean(input.stage ?? existing.stage, 40))
    .input('Priority', sql.NVarChar(20), cleanNullable(input.priority ?? existing.priority, 20))
    .input('AssigneeName', sql.NVarChar(220), cleanNullable(input.assigneeName ?? existing.assigneeName, 220))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      UPDATE [it].[ItsmServiceRequests] SET
        [Title]=@Title, [Description]=@Description, [Stage]=@Stage, [Priority]=@Priority,
        [AssigneeName]=@AssigneeName, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHERE [RequestId]=@RequestId
    `);
  return (await listServiceRequests()).find((r) => r.requestId === requestId) || null;
};

const genericList = async (table: string, orderBy = '[UpdatedAt] DESC') => {
  const pool = await ensureItServiceDeskDb();
  const result = await pool.request().query(`SELECT * FROM [it].[${table}] ORDER BY ${orderBy}`);
  return result.recordset as Record<string, unknown>[];
};

export const listProblems = async (kind?: string) => {
  const rows = await genericList('ItsmProblems');
  return rows
    .filter((row) => !kind || String(row.Kind) === kind)
    .map((row) => ({
      problemId: String(row.ProblemId),
      title: String(row.Title),
      description: row.Description == null ? null : String(row.Description),
      status: String(row.Status),
      priority: row.Priority == null ? null : String(row.Priority),
      kind: String(row.Kind),
      workaround: row.Workaround == null ? null : String(row.Workaround),
      rootCause: row.RootCause == null ? null : String(row.RootCause),
      linkedIncidentId: row.LinkedIncidentId == null ? null : String(row.LinkedIncidentId),
      ownerName: row.OwnerName == null ? null : String(row.OwnerName),
      createdAt: toIso(row.CreatedAt) || nowItsmIso(),
      updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
    }));
};

export const upsertProblem = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const problemId = clean(input.problemId, 40) || (await nextSequentialId(pool, 'ItsmProblems', 'ProblemId', 'PRB'));
  const existing = await pool
    .request()
    .input('ProblemId', sql.NVarChar(40), problemId)
    .query(`SELECT 1 AS Ok FROM [it].[ItsmProblems] WHERE [ProblemId]=@ProblemId`);
  if (existing.recordset[0]) {
    await pool
      .request()
      .input('ProblemId', sql.NVarChar(40), problemId)
      .input('Title', sql.NVarChar(300), clean(input.title, 300))
      .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
      .input('Status', sql.NVarChar(40), clean(input.status || 'Active', 40))
      .input('Priority', sql.NVarChar(20), cleanNullable(input.priority, 20))
      .input('Kind', sql.NVarChar(40), clean(input.kind || 'Problem', 40))
      .input('Workaround', sql.NVarChar(sql.MAX), cleanNullable(input.workaround, 8000))
      .input('RootCause', sql.NVarChar(sql.MAX), cleanNullable(input.rootCause, 8000))
      .input('LinkedIncidentId', sql.NVarChar(40), cleanNullable(input.linkedIncidentId, 40))
      .input('OwnerName', sql.NVarChar(220), cleanNullable(input.ownerName, 220))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        UPDATE [it].[ItsmProblems] SET
          [Title]=@Title, [Description]=@Description, [Status]=@Status, [Priority]=@Priority, [Kind]=@Kind,
          [Workaround]=@Workaround, [RootCause]=@RootCause, [LinkedIncidentId]=@LinkedIncidentId,
          [OwnerName]=@OwnerName, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [ProblemId]=@ProblemId
      `);
  } else {
    await pool
      .request()
      .input('ProblemId', sql.NVarChar(40), problemId)
      .input('Title', sql.NVarChar(300), clean(input.title, 300))
      .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
      .input('Status', sql.NVarChar(40), clean(input.status || 'Active', 40))
      .input('Priority', sql.NVarChar(20), cleanNullable(input.priority, 20))
      .input('Kind', sql.NVarChar(40), clean(input.kind || 'Problem', 40))
      .input('Workaround', sql.NVarChar(sql.MAX), cleanNullable(input.workaround, 8000))
      .input('RootCause', sql.NVarChar(sql.MAX), cleanNullable(input.rootCause, 8000))
      .input('LinkedIncidentId', sql.NVarChar(40), cleanNullable(input.linkedIncidentId, 40))
      .input('OwnerName', sql.NVarChar(220), cleanNullable(input.ownerName, 220))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        INSERT INTO [it].[ItsmProblems] (
          [ProblemId], [Title], [Description], [Status], [Priority], [Kind], [Workaround], [RootCause],
          [LinkedIncidentId], [OwnerName], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ProblemId, @Title, @Description, @Status, @Priority, @Kind, @Workaround, @RootCause,
          @LinkedIncidentId, @OwnerName, @CreatedBy, @UpdatedBy
        )
      `);
  }
  return (await listProblems()).find((p) => p.problemId === problemId) || null;
};

export const listSlaPolicies = async () => {
  const rows = await genericList('ItsmSlaPolicies');
  return rows.map((row) => ({
    policyId: String(row.PolicyId),
    name: String(row.Name),
    priority: String(row.Priority),
    responseMinutes: Number(row.ResponseMinutes || 0),
    resolveMinutes: Number(row.ResolveMinutes || 0),
    isActive: toBool(row.IsActive),
    updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
  }));
};

export const upsertSlaPolicy = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const policyId = clean(input.policyId, 40) || newItsmId('SLA');
  const existing = await pool
    .request()
    .input('PolicyId', sql.NVarChar(40), policyId)
    .query(`SELECT 1 AS Ok FROM [it].[ItsmSlaPolicies] WHERE [PolicyId]=@PolicyId`);
  if (existing.recordset[0]) {
    await pool
      .request()
      .input('PolicyId', sql.NVarChar(40), policyId)
      .input('Name', sql.NVarChar(200), clean(input.name, 200))
      .input('Priority', sql.NVarChar(20), clean(input.priority, 20))
      .input('ResponseMinutes', sql.Int, Number(input.responseMinutes || 0))
      .input('ResolveMinutes', sql.Int, Number(input.resolveMinutes || 0))
      .input('IsActive', sql.Bit, input.isActive == null ? 1 : toBool(input.isActive) ? 1 : 0)
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        UPDATE [it].[ItsmSlaPolicies] SET
          [Name]=@Name, [Priority]=@Priority, [ResponseMinutes]=@ResponseMinutes,
          [ResolveMinutes]=@ResolveMinutes, [IsActive]=@IsActive, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [PolicyId]=@PolicyId
      `);
  } else {
    await pool
      .request()
      .input('PolicyId', sql.NVarChar(40), policyId)
      .input('Name', sql.NVarChar(200), clean(input.name, 200))
      .input('Priority', sql.NVarChar(20), clean(input.priority, 20))
      .input('ResponseMinutes', sql.Int, Number(input.responseMinutes || 0))
      .input('ResolveMinutes', sql.Int, Number(input.resolveMinutes || 0))
      .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`
        INSERT INTO [it].[ItsmSlaPolicies] ([PolicyId], [Name], [Priority], [ResponseMinutes], [ResolveMinutes], [UpdatedBy])
        VALUES (@PolicyId, @Name, @Priority, @ResponseMinutes, @ResolveMinutes, @UpdatedBy)
      `);
  }
  return (await listSlaPolicies()).find((p) => p.policyId === policyId) || null;
};

export const listEscalations = async () => {
  const rows = await genericList('ItsmEscalations', '[CreatedAt] DESC');
  return rows.map((row) => ({
    escalationId: String(row.EscalationId),
    name: String(row.Name),
    triggerType: String(row.TriggerType),
    target: row.Target == null ? null : String(row.Target),
    linkedTicketId: row.LinkedTicketId == null ? null : String(row.LinkedTicketId),
    status: String(row.Status),
    notes: row.Notes == null ? null : String(row.Notes),
    createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  }));
};

export const upsertEscalation = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const escalationId = clean(input.escalationId, 40) || newItsmId('ESC');
  await pool
    .request()
    .input('EscalationId', sql.NVarChar(40), escalationId)
    .input('Name', sql.NVarChar(200), clean(input.name, 200))
    .input('TriggerType', sql.NVarChar(80), clean(input.triggerType || 'SLA Breach', 80))
    .input('Target', sql.NVarChar(200), cleanNullable(input.target, 200))
    .input('LinkedTicketId', sql.NVarChar(40), cleanNullable(input.linkedTicketId, 40))
    .input('Status', sql.NVarChar(40), clean(input.status || 'Active', 40))
    .input('Notes', sql.NVarChar(sql.MAX), cleanNullable(input.notes, 8000))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[ItsmEscalations] WHERE [EscalationId]=@EscalationId)
        UPDATE [it].[ItsmEscalations] SET
          [Name]=@Name, [TriggerType]=@TriggerType, [Target]=@Target, [LinkedTicketId]=@LinkedTicketId,
          [Status]=@Status, [Notes]=@Notes, [UpdatedAt]=SYSUTCDATETIME()
        WHERE [EscalationId]=@EscalationId
      ELSE
        INSERT INTO [it].[ItsmEscalations]
          ([EscalationId], [Name], [TriggerType], [Target], [LinkedTicketId], [Status], [Notes], [CreatedBy])
        VALUES
          (@EscalationId, @Name, @TriggerType, @Target, @LinkedTicketId, @Status, @Notes, @CreatedBy)
    `);
  return (await listEscalations()).find((e) => e.escalationId === escalationId) || null;
};

export const listChanges = async (changeType?: string) => {
  const rows = await genericList('ItsmChanges');
  return rows
    .filter((row) => !changeType || String(row.ChangeType) === changeType)
    .map((row) => ({
      changeId: String(row.ChangeId),
      title: String(row.Title),
      description: row.Description == null ? null : String(row.Description),
      changeType: String(row.ChangeType),
      status: String(row.Status),
      cabStatus: row.CabStatus == null ? null : String(row.CabStatus),
      scheduledStart: toIso(row.ScheduledStart),
      scheduledEnd: toIso(row.ScheduledEnd),
      rollbackPlan: row.RollbackPlan == null ? null : String(row.RollbackPlan),
      ownerName: row.OwnerName == null ? null : String(row.OwnerName),
      createdAt: toIso(row.CreatedAt) || nowItsmIso(),
      updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
    }));
};

export const upsertChange = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const changeId = clean(input.changeId, 40) || (await nextSequentialId(pool, 'ItsmChanges', 'ChangeId', 'CHG'));
  await pool
    .request()
    .input('ChangeId', sql.NVarChar(40), changeId)
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('Description', sql.NVarChar(sql.MAX), cleanNullable(input.description, 8000))
    .input('ChangeType', sql.NVarChar(40), clean(input.changeType || 'Normal', 40))
    .input('Status', sql.NVarChar(40), clean(input.status || 'Draft', 40))
    .input('CabStatus', sql.NVarChar(40), cleanNullable(input.cabStatus, 40))
    .input('ScheduledStart', sql.DateTime2, input.scheduledStart ? new Date(String(input.scheduledStart)) : null)
    .input('ScheduledEnd', sql.DateTime2, input.scheduledEnd ? new Date(String(input.scheduledEnd)) : null)
    .input('RollbackPlan', sql.NVarChar(sql.MAX), cleanNullable(input.rollbackPlan, 8000))
    .input('OwnerName', sql.NVarChar(220), cleanNullable(input.ownerName, 220) || actor)
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[ItsmChanges] WHERE [ChangeId]=@ChangeId)
        UPDATE [it].[ItsmChanges] SET
          [Title]=@Title, [Description]=@Description, [ChangeType]=@ChangeType, [Status]=@Status,
          [CabStatus]=@CabStatus, [ScheduledStart]=@ScheduledStart, [ScheduledEnd]=@ScheduledEnd,
          [RollbackPlan]=@RollbackPlan, [OwnerName]=@OwnerName, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [ChangeId]=@ChangeId
      ELSE
        INSERT INTO [it].[ItsmChanges] (
          [ChangeId], [Title], [Description], [ChangeType], [Status], [CabStatus], [ScheduledStart],
          [ScheduledEnd], [RollbackPlan], [OwnerName], [CreatedBy], [UpdatedBy]
        ) VALUES (
          @ChangeId, @Title, @Description, @ChangeType, @Status, @CabStatus, @ScheduledStart,
          @ScheduledEnd, @RollbackPlan, @OwnerName, @CreatedBy, @UpdatedBy
        )
    `);
  return (await listChanges()).find((c) => c.changeId === changeId) || null;
};

export const listAutomationRules = async (ruleType?: string) => {
  const rows = await genericList('ItsmAutomationRules');
  return rows
    .filter((row) => !ruleType || String(row.RuleType) === ruleType)
    .map((row) => ({
      ruleId: String(row.RuleId),
      name: String(row.Name),
      ruleType: String(row.RuleType),
      isEnabled: toBool(row.IsEnabled),
      configJson: row.ConfigJson == null ? null : String(row.ConfigJson),
      updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
    }));
};

export const upsertAutomationRule = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const ruleId = clean(input.ruleId, 40) || newItsmId('AUT');
  await pool
    .request()
    .input('RuleId', sql.NVarChar(40), ruleId)
    .input('Name', sql.NVarChar(200), clean(input.name, 200))
    .input('RuleType', sql.NVarChar(60), clean(input.ruleType || 'workflow', 60))
    .input('IsEnabled', sql.Bit, input.isEnabled == null ? 1 : toBool(input.isEnabled) ? 1 : 0)
    .input('ConfigJson', sql.NVarChar(sql.MAX), cleanNullable(input.configJson, 8000))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[ItsmAutomationRules] WHERE [RuleId]=@RuleId)
        UPDATE [it].[ItsmAutomationRules] SET
          [Name]=@Name, [RuleType]=@RuleType, [IsEnabled]=@IsEnabled, [ConfigJson]=@ConfigJson,
          [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [RuleId]=@RuleId
      ELSE
        INSERT INTO [it].[ItsmAutomationRules] ([RuleId], [Name], [RuleType], [IsEnabled], [ConfigJson], [UpdatedBy])
        VALUES (@RuleId, @Name, @RuleType, @IsEnabled, @ConfigJson, @UpdatedBy)
    `);
  return (await listAutomationRules()).find((r) => r.ruleId === ruleId) || null;
};

export const listSettings = async (settingType?: string) => {
  const pool = await ensureItServiceDeskDb();
  const req = pool.request();
  let where = '1=1';
  if (settingType) {
    req.input('SettingType', sql.NVarChar(60), settingType);
    where = '[SettingType]=@SettingType';
  }
  const result = await req.query(`
    SELECT * FROM [it].[ItsmSettings]
    WHERE ${where}
    ORDER BY [SortOrder], [Name]
  `);
  return result.recordset.map((row) => ({
    settingId: String(row.SettingId),
    settingType: String(row.SettingType),
    name: String(row.Name),
    value: row.Value == null ? null : String(row.Value),
    payloadJson: row.PayloadJson == null ? null : String(row.PayloadJson),
    sortOrder: Number(row.SortOrder || 0),
    isActive: toBool(row.IsActive),
    updatedAt: toIso(row.UpdatedAt) || nowItsmIso(),
  }));
};

export const upsertSetting = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const settingId = clean(input.settingId, 40) || newItsmId('SET');
  await pool
    .request()
    .input('SettingId', sql.NVarChar(40), settingId)
    .input('SettingType', sql.NVarChar(60), clean(input.settingType, 60))
    .input('Name', sql.NVarChar(200), clean(input.name, 200))
    .input('Value', sql.NVarChar(200), cleanNullable(input.value, 200))
    .input('PayloadJson', sql.NVarChar(sql.MAX), cleanNullable(input.payloadJson, 8000))
    .input('SortOrder', sql.Int, Number(input.sortOrder || 0))
    .input('IsActive', sql.Bit, input.isActive == null ? 1 : toBool(input.isActive) ? 1 : 0)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[ItsmSettings] WHERE [SettingId]=@SettingId)
        UPDATE [it].[ItsmSettings] SET
          [SettingType]=@SettingType, [Name]=@Name, [Value]=@Value, [PayloadJson]=@PayloadJson,
          [SortOrder]=@SortOrder, [IsActive]=@IsActive, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
        WHERE [SettingId]=@SettingId
      ELSE
        INSERT INTO [it].[ItsmSettings]
          ([SettingId], [SettingType], [Name], [Value], [PayloadJson], [SortOrder], [IsActive], [UpdatedBy])
        VALUES
          (@SettingId, @SettingType, @Name, @Value, @PayloadJson, @SortOrder, @IsActive, @UpdatedBy)
    `);
  return (await listSettings()).find((s) => s.settingId === settingId) || null;
};

export const listKbArticles = async () => {
  const pool = await ensureItServiceDeskDb();
  const result = await pool.request().query(`
    SELECT * FROM [it].[ItsmKbArticles] WHERE [IsActive]=1 ORDER BY [Title]
  `);
  return result.recordset.map((row) => ({
    articleId: String(row.ArticleId),
    title: String(row.Title),
    body: row.Body == null ? null : String(row.Body),
    keywords: row.Keywords == null ? null : String(row.Keywords),
  }));
};

export const listFeedback = async (feedbackType?: string) => {
  const pool = await ensureItServiceDeskDb();
  const req = pool.request();
  let where = '1=1';
  if (feedbackType) {
    req.input('FeedbackType', sql.NVarChar(40), feedbackType);
    where = '[FeedbackType]=@FeedbackType';
  }
  const result = await req.query(`
    SELECT * FROM [it].[ItsmFeedback]
    WHERE ${where}
    ORDER BY [CreatedAt] DESC
  `);
  return result.recordset.map((row) => ({
    feedbackId: String(row.FeedbackId),
    feedbackType: String(row.FeedbackType),
    title: row.Title == null ? null : String(row.Title),
    body: row.Body == null ? null : String(row.Body),
    rating: row.Rating == null ? null : Number(row.Rating),
    ticketId: row.TicketId == null ? null : String(row.TicketId),
    authorName: row.AuthorName == null ? null : String(row.AuthorName),
    createdAt: toIso(row.CreatedAt) || nowItsmIso(),
  }));
};

export const upsertFeedback = async (input: Record<string, unknown>, actor: string) => {
  const pool = await ensureItServiceDeskDb();
  const feedbackId = clean(input.feedbackId, 40) || newItsmId('FB');
  await pool
    .request()
    .input('FeedbackId', sql.NVarChar(40), feedbackId)
    .input('FeedbackType', sql.NVarChar(40), clean(input.feedbackType || 'comment', 40))
    .input('Title', sql.NVarChar(300), cleanNullable(input.title, 300))
    .input('Body', sql.NVarChar(sql.MAX), cleanNullable(input.body, 8000))
    .input('Rating', sql.Int, input.rating == null ? null : Number(input.rating))
    .input('TicketId', sql.NVarChar(40), cleanNullable(input.ticketId, 40))
    .input('AuthorName', sql.NVarChar(220), cleanNullable(input.authorName, 220) || actor)
    .query(`
      IF EXISTS (SELECT 1 FROM [it].[ItsmFeedback] WHERE [FeedbackId]=@FeedbackId)
        UPDATE [it].[ItsmFeedback] SET
          [FeedbackType]=@FeedbackType, [Title]=@Title, [Body]=@Body, [Rating]=@Rating,
          [TicketId]=@TicketId, [AuthorName]=@AuthorName, [UpdatedAt]=SYSUTCDATETIME()
        WHERE [FeedbackId]=@FeedbackId
      ELSE
        INSERT INTO [it].[ItsmFeedback]
          ([FeedbackId], [FeedbackType], [Title], [Body], [Rating], [TicketId], [AuthorName])
        VALUES
          (@FeedbackId, @FeedbackType, @Title, @Body, @Rating, @TicketId, @AuthorName)
    `);
  return (await listFeedback()).find((f) => f.feedbackId === feedbackId) || null;
};

export const buildServiceDeskDashboard = async () => {
  const [tickets, incidents, requests, breaches, policies] = await Promise.all([
    listTickets({ archived: false }),
    listIncidents(),
    listServiceRequests(),
    listTickets({ overdueOnly: true, archived: false }),
    listSlaPolicies(),
  ]);

  const openTickets = tickets.filter((t) => !['Resolved', 'Closed'].includes(t.status));
  const critical = tickets.filter((t) => t.priority === 'Critical' && !['Resolved', 'Closed'].includes(t.status));
  const byStatus = tickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  const byPriority = tickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.priority] = (acc[t.priority] || 0) + 1;
    return acc;
  }, {});

  return {
    kpis: {
      openTickets: openTickets.length,
      criticalTickets: critical.length,
      activeIncidents: incidents.filter((i) => i.status !== 'Resolved').length,
      majorIncidents: incidents.filter((i) => i.isMajor && i.status !== 'Resolved').length,
      openRequests: requests.filter((r) => !['Fulfilled', 'Cancelled', 'Rejected'].includes(r.stage)).length,
      slaBreaches: breaches.length,
      slaPolicies: policies.length,
    },
    byStatus,
    byPriority,
    recentTickets: tickets.slice(0, 8),
    criticalItems: critical.slice(0, 6),
    recentIncidents: incidents.slice(0, 6),
    recentRequests: requests.slice(0, 6),
    breaches: breaches.slice(0, 10),
  };
};

export const buildReports = async () => {
  const [tickets, incidents, requests, feedback, changes] = await Promise.all([
    listTickets({}),
    listIncidents(),
    listServiceRequests(),
    listFeedback(),
    listChanges(),
  ]);

  const agentMap = new Map<string, { assigned: number; resolved: number }>();
  for (const ticket of tickets) {
    const agent = ticket.assigneeName || 'Unassigned';
    const current = agentMap.get(agent) || { assigned: 0, resolved: 0 };
    current.assigned += 1;
    if (['Resolved', 'Closed'].includes(ticket.status)) current.resolved += 1;
    agentMap.set(agent, current);
  }

  return {
    ticketReports: {
      total: tickets.length,
      byStatus: tickets.reduce<Record<string, number>>((a, t) => ({ ...a, [t.status]: (a[t.status] || 0) + 1 }), {}),
      byPriority: tickets.reduce<Record<string, number>>((a, t) => ({ ...a, [t.priority]: (a[t.priority] || 0) + 1 }), {}),
    },
    incidentReports: {
      total: incidents.length,
      major: incidents.filter((i) => i.isMajor).length,
      byStatus: incidents.reduce<Record<string, number>>((a, i) => ({ ...a, [i.status]: (a[i.status] || 0) + 1 }), {}),
    },
    slaReports: {
      overdue: (await listTickets({ overdueOnly: true })).length,
      policies: await listSlaPolicies(),
    },
    agentPerformance: Array.from(agentMap.entries()).map(([agent, stats]) => ({ agent, ...stats })),
    executive: {
      tickets: tickets.length,
      incidents: incidents.length,
      requests: requests.length,
      changes: changes.length,
      avgRating:
        feedback.filter((f) => f.rating != null).reduce((sum, f) => sum + Number(f.rating || 0), 0) /
          Math.max(1, feedback.filter((f) => f.rating != null).length) || 0,
    },
  };
};

/** Apply simple assignment automation when a ticket is created without assignee. */
export const applyAssignmentAutomation = async (ticket: ItsmTicket, actor: string) => {
  if (ticket.assigneeName) return ticket;
  const rules = (await listAutomationRules('assignment')).filter((r) => r.isEnabled);
  for (const rule of rules) {
    try {
      const config = rule.configJson ? JSON.parse(rule.configJson) : {};
      const categoryMatch = !config.category || config.category === ticket.category;
      const priorityMatch = !config.priority || config.priority === ticket.priority;
      if (categoryMatch && priorityMatch && config.assigneeName) {
        return (await updateTicket(ticket.ticketId, { assigneeName: config.assigneeName, status: 'In Progress' }, actor)) || ticket;
      }
    } catch {
      /* ignore bad config */
    }
  }
  return ticket;
};
