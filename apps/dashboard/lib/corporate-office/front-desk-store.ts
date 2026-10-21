import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { resolveRepoRoot } from '@/lib/finance-intelligence/payment-attachment-storage';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { nextOfficeReference, todayISO, unfinishedDepartmentRoutes } from '@/lib/corporate-office/front-desk-format';
import { ensureFrontDeskSchemaFollowupSql, ensureFrontDeskSchemaSql } from '@/lib/corporate-office/front-desk-sql-schema';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  CORRESPONDENCE_TYPES,
  ROUTE_STATUSES,
  SENDER_CATEGORIES,
  MAX_ATTACHMENT_BYTES,
  type Attachment,
  type Correspondence,
  type CorrespondenceDirection,
  type CorrespondenceEvent,
  type CorrespondenceInput,
  type CorrespondenceRecipient,
  type CorrespondenceType,
  type DepartmentRoute,
  type DepartmentRouteInput,
  type Priority,
  type RouteStatus,
  type SenderCategory,
  type WorkflowStatus,
} from '@/lib/corporate-office/front-desk-types';

const dbReady = { value: false };

const clean = (value: unknown, max = 4000) => String(value ?? '').trim().slice(0, max);
const idFor = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const sqlDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00.000Z`);

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

const asDepartment = (value: unknown) => clean(value, 120) || "MD's Office";

const asType = (value: unknown): CorrespondenceType => {
  const text = clean(value, 80);
  return (CORRESPONDENCE_TYPES as readonly string[]).includes(text) ? text as CorrespondenceType : 'Letter';
};

const asPriority = (value: unknown): Priority => {
  const text = clean(value, 20).toLowerCase();
  if (text === 'high' || text === 'urgent') return 'High';
  return text === 'low' ? 'Low' : 'Medium';
};

const asDirection = (value: unknown): CorrespondenceDirection => (clean(value, 20) === 'Outgoing' ? 'Outgoing' : 'Incoming');

const asWorkflow = (value: unknown, status: 'Open' | 'Closed'): WorkflowStatus => {
  const text = clean(value, 40);
  if (text === 'Assigned' || text === 'In Progress' || text === 'Archived') return text;
  if (status === 'Closed' || text === 'Closed') return 'Closed';
  return 'New';
};

const asSenderCategory = (value: unknown, fallback: SenderCategory | null = 'Others'): SenderCategory | null => {
  const text = clean(value, 80);
  if ((SENDER_CATEGORIES as readonly string[]).includes(text)) return text as SenderCategory;
  return fallback;
};

const storageRoot = () => path.join(resolveRepoRoot(), 'data', 'corporate-office', 'front-desk');

const safeFileName = (name: string) => clean(name, 180).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '') || 'document';

const absoluteFromKey = (storageKey: string) => {
  const root = path.resolve(storageRoot());
  const absolute = path.resolve(root, storageKey);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error('Attachment path is outside Front Desk storage.');
  }
  return absolute;
};

export type IncomingAttachment = {
  id?: string;
  name: string;
  type: string;
  bytes: Buffer;
};

export const ensureFrontDeskDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database is not configured. Front Desk requires SQL persistence.');
  if (!dbReady.value) {
    await pool.request().query(ensureFrontDeskSchemaSql);
    await pool.request().query(ensureFrontDeskSchemaFollowupSql);
    dbReady.value = true;
  }
  return pool;
};

const mapAttachment = (row: Record<string, unknown>): Attachment => ({
  id: clean(row.AttachmentId, 40),
  name: clean(row.FileName, 260),
  type: clean(row.ContentType, 120),
  size: Number(row.SizeBytes) || 0,
  addedAt: iso(row.AddedAt),
});

const asRouteStatus = (value: unknown): RouteStatus => {
  const text = clean(value, 40);
  return (ROUTE_STATUSES as readonly string[]).includes(text) ? text as RouteStatus : 'Pending';
};

const mapRoute = (row: Record<string, unknown>): DepartmentRoute => ({
  id: clean(row.RouteId, 40),
  department: clean(row.Department, 120),
  lead: row.IsLead === true || row.IsLead === 1,
  assigneeCode: clean(row.AssigneeEmployeeCode, 40) || undefined,
  assigneeName: clean(row.AssigneeEmployeeName, 180) || undefined,
  hodCode: clean(row.HodEmployeeCode, 40) || undefined,
  hodName: clean(row.HodEmployeeName, 180) || undefined,
  actionRequired: clean(row.ActionRequired, 500) || undefined,
  priority: asPriority(row.Priority),
  dueDate: dateOnly(row.DueDate) || undefined,
  status: asRouteStatus(row.Status),
  acknowledgedAt: iso(row.AcknowledgedAt) || undefined,
  acknowledgedBy: clean(row.AcknowledgedBy, 180) || undefined,
  progressNote: clean(row.ProgressNote, 1000) || undefined,
  completedAt: iso(row.CompletedAt) || undefined,
  completedBy: clean(row.CompletedBy, 180) || undefined,
  waivedAt: iso(row.WaivedAt) || undefined,
  waivedBy: clean(row.WaivedBy, 180) || undefined,
  waiveReason: clean(row.WaiveReason, 500) || undefined,
});

const mapCorrespondence = (
  row: Record<string, unknown>,
  attachments: Attachment[],
  recipients: CorrespondenceRecipient[] = [],
  history: CorrespondenceEvent[] = [],
  routes: DepartmentRoute[] = [],
): Correspondence => {
  const status = clean(row.Status, 20) === 'Closed' ? 'Closed' : 'Open';
  const description = clean(row.Description, 2000);
  return {
    id: clean(row.CorrespondenceId, 40),
    referenceNo: clean(row.ReferenceNo, 40),
    direction: asDirection(row.Direction),
    dateReceived: dateOnly(row.DateReceived),
    dateSent: dateOnly(row.DateSent) || undefined,
    subject: clean(row.Subject, 500) || description,
    description,
    senderCompany: clean(row.SenderCompany, 300),
    senderCategory: asSenderCategory(row.SenderCategory) || 'Others',
    addressedTo: clean(row.AddressedTo, 300),
    addressedEmployeeCode: clean(row.AddressedEmployeeCode, 40) || undefined,
    department: asDepartment(row.Department),
    location: clean(row.Location, 180) || undefined,
    type: asType(row.CorrespondenceType),
    copies: Math.max(1, Number(row.Copies) || 1),
    remarks: clean(row.Remarks, 2000) || undefined,
    priority: asPriority(row.Priority),
    dueDate: dateOnly(row.DueDate) || undefined,
    attachments,
    status,
    workflowStatus: asWorkflow(row.WorkflowStatus, status),
    assignedEmployeeCode: clean(row.AssignedEmployeeCode, 40) || undefined,
    assignedEmployeeName: clean(row.AssignedEmployeeName, 180) || undefined,
    acknowledgedAt: iso(row.AcknowledgedAt) || undefined,
    acknowledgedBy: clean(row.AcknowledgedBy, 180) || undefined,
    recipients,
    history,
    routes,
    closedBy: clean(row.ClosedBy, 180) || undefined,
    dateClosed: dateOnly(row.DateClosed) || undefined,
    createdAt: iso(row.CreatedAt),
  };
};

const listAttachmentRows = async (pool: sql.ConnectionPool, correspondenceId?: string) => {
  const request = pool.request();
  const where = correspondenceId ? 'WHERE [CorrespondenceId] = @CorrespondenceId' : '';
  if (correspondenceId) request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  const result = await request.query(`
    SELECT [AttachmentId], [CorrespondenceId], [FileName], [ContentType], [SizeBytes], [StorageKey], [AddedAt]
    FROM [corporate].[FrontDeskAttachments]
    ${where}
    ORDER BY [AddedAt]
  `);
  return result.recordset as Record<string, unknown>[];
};

const groupAttachments = (rows: Record<string, unknown>[]) => {
  const grouped = new Map<string, Attachment[]>();
  for (const row of rows) {
    const parent = clean(row.CorrespondenceId, 40);
    const list = grouped.get(parent) || [];
    list.push(mapAttachment(row));
    grouped.set(parent, list);
  }
  return grouped;
};

const listRouteRows = async (pool: sql.ConnectionPool, correspondenceId?: string) => {
  const request = pool.request();
  const where = correspondenceId ? 'WHERE [CorrespondenceId] = @CorrespondenceId' : '';
  if (correspondenceId) request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  const result = await request.query(`
    SELECT *
    FROM [corporate].[FrontDeskRoutes]
    ${where}
    ORDER BY [IsLead] DESC, [Department]
  `);
  return (result.recordset as Record<string, unknown>[]).map((row) => ({
    correspondenceId: clean(row.CorrespondenceId, 40),
    route: mapRoute(row),
  }));
};

export const listCorrespondence = async (): Promise<Correspondence[]> => {
  const pool = await ensureFrontDeskDb();
  const [items, attachments, routes] = await Promise.all([
    pool.request().query(`
      SELECT *
      FROM [corporate].[FrontDeskCorrespondence]
      ORDER BY [DateReceived] DESC, [ReferenceNo] DESC
    `),
    listAttachmentRows(pool),
    listRouteRows(pool),
  ]);
  const grouped = groupAttachments(attachments);
  const groupedRoutes = new Map<string, DepartmentRoute[]>();
  for (const row of routes) {
    groupedRoutes.set(row.correspondenceId, [...(groupedRoutes.get(row.correspondenceId) || []), row.route]);
  }
  return (items.recordset as Record<string, unknown>[]).map((row) => {
    const correspondenceId = clean(row.CorrespondenceId, 40);
    return mapCorrespondence(row, grouped.get(correspondenceId) || [], [], [], groupedRoutes.get(correspondenceId) || []);
  });
};

export const getCorrespondence = async (id: string): Promise<Correspondence | null> => {
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), clean(id, 40));
  const result = await request.query(`
    SELECT * FROM [corporate].[FrontDeskCorrespondence] WHERE [CorrespondenceId] = @CorrespondenceId
  `);
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const correspondenceId = clean(id, 40);
  const [attachments, recipients, history, routes] = await Promise.all([
    listAttachmentRows(pool, correspondenceId),
    listRecipientRows(pool, correspondenceId),
    listEventRows(pool, correspondenceId),
    listRouteRows(pool, correspondenceId),
  ]);
  return mapCorrespondence(
    row,
    groupAttachments(attachments).get(correspondenceId) || [],
    recipients,
    history,
    routes.map((item) => item.route),
  );
};

const listRecipientRows = async (pool: sql.ConnectionPool, correspondenceId: string) => {
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  const result = await request.query(`
    SELECT [RecipientId], [EmployeeCode], [DisplayName], [AcknowledgedAt]
    FROM [corporate].[FrontDeskRecipients]
    WHERE [CorrespondenceId] = @CorrespondenceId
    ORDER BY [DisplayName]
  `);
  return (result.recordset as Record<string, unknown>[]).map((row) => ({
    id: clean(row.RecipientId, 40),
    employeeCode: clean(row.EmployeeCode, 40) || undefined,
    name: clean(row.DisplayName, 180),
    acknowledgedAt: iso(row.AcknowledgedAt) || undefined,
  }));
};

const listEventRows = async (pool: sql.ConnectionPool, correspondenceId: string) => {
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  const result = await request.query(`
    SELECT [EventId], [Action], [Actor], [Detail], [CreatedAt]
    FROM [corporate].[FrontDeskEvents]
    WHERE [CorrespondenceId] = @CorrespondenceId
    ORDER BY [CreatedAt]
  `);
  return (result.recordset as Record<string, unknown>[]).map((row) => ({
    id: clean(row.EventId, 40),
    action: clean(row.Action, 40),
    actor: clean(row.Actor, 180),
    detail: clean(row.Detail, 1000) || undefined,
    createdAt: iso(row.CreatedAt),
  }));
};

export const writeFrontDeskEvent = async (
  pool: sql.ConnectionPool,
  correspondenceId: string,
  action: string,
  actor: string,
  detail?: string,
) => {
  const request = pool.request();
  request.input('EventId', sql.NVarChar(40), idFor('evt'));
  request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  request.input('Action', sql.NVarChar(40), clean(action, 40));
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  request.input('Detail', sql.NVarChar(1000), clean(detail, 1000) || null);
  await request.query(`
    INSERT INTO [corporate].[FrontDeskEvents] ([EventId], [CorrespondenceId], [Action], [Actor], [Detail])
    VALUES (@EventId, @CorrespondenceId, @Action, @Actor, @Detail)
  `);
};

const replaceRecipients = async (
  pool: sql.ConnectionPool,
  correspondenceId: string,
  recipients: Array<{ employeeCode: string; name: string }>,
) => {
  const clear = pool.request();
  clear.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  await clear.query(`DELETE FROM [corporate].[FrontDeskRecipients] WHERE [CorrespondenceId] = @CorrespondenceId`);
  for (const recipient of recipients) {
    const request = pool.request();
    request.input('RecipientId', sql.NVarChar(40), idFor('rcp'));
    request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
    request.input('EmployeeCode', sql.NVarChar(40), recipient.employeeCode || null);
    request.input('DisplayName', sql.NVarChar(180), recipient.name);
    await request.query(`
      INSERT INTO [corporate].[FrontDeskRecipients] ([RecipientId], [CorrespondenceId], [EmployeeCode], [DisplayName])
      VALUES (@RecipientId, @CorrespondenceId, @EmployeeCode, @DisplayName)
    `);
  }
};

const normalizeRoutes = (input: CorrespondenceInput, dateReceived: string, dueDate: string, priority: Priority): DepartmentRouteInput[] | null => {
  if (input.routes === undefined) return null;
  const seen = new Set<string>();
  const routes: DepartmentRouteInput[] = [];
  for (const route of input.routes) {
    const department = clean(route?.department, 120);
    const key = department.toLowerCase();
    if (!department || seen.has(key)) continue;
    seen.add(key);
    const routeDue = dateOnly(route.dueDate) || dueDate;
    if (routeDue && routeDue < dateReceived) throw new Error(`Response deadline for ${department} cannot be before the date received.`);
    routes.push({
      department,
      lead: Boolean(route.lead),
      assigneeCode: clean(route.assigneeCode, 40) || undefined,
      assigneeName: clean(route.assigneeName, 180) || undefined,
      hodCode: clean(route.hodCode, 40) || undefined,
      hodName: clean(route.hodName, 180) || undefined,
      actionRequired: clean(route.actionRequired, 500) || undefined,
      priority: asPriority(route.priority || priority),
      dueDate: routeDue || undefined,
    });
  }
  if (!routes.length) throw new Error('At least one department is required.');
  if (!routes.some((route) => route.lead)) routes[0].lead = true;
  let leadKept = false;
  for (const route of routes) {
    if (!route.lead) continue;
    if (leadKept) route.lead = false;
    else leadKept = true;
  }
  return routes;
};

const validateInput = (input: CorrespondenceInput) => {
  const dateReceived = dateOnly(input.dateReceived);
  const description = clean(input.description, 2000);
  const senderCompany = clean(input.senderCompany, 300);
  const addressedTo = clean(input.addressedTo, 300);
  const dueDate = dateOnly(input.dueDate);
  if (!dateReceived) throw new Error('Date received is required.');
  if (dateReceived > todayISO()) throw new Error('Date received cannot be in the future.');
  if (!description) throw new Error('Describe the item received.');
  if (!senderCompany) throw new Error('Sender is required.');
  const senderCategory = asSenderCategory(input.senderCategory, null);
  if (!senderCategory) throw new Error('Choose a sender category: government/regulators, vendors, clients, or others.');
  if (!addressedTo || !clean(input.addressedEmployeeCode, 40)) throw new Error('An addressee from the employee directory is required.');
  if (!dueDate) throw new Error('Response due date is required.');
  if (dueDate < dateReceived) throw new Error('Response due date cannot be before the date received.');
  const priority = asPriority(input.priority);
  const routes = normalizeRoutes(input, dateReceived, dueDate, priority);
  const lead = routes?.find((route) => route.lead);
  const copies = Math.max(1, Math.min(999, Number(input.copies) || 1));
  const direction = asDirection(input.direction);
  const dateSent = dateOnly(input.dateSent);
  const subject = clean(input.subject, 500) || description;
  const recipients = (input.recipients || [])
    .map((recipient) => ({ employeeCode: clean(recipient.employeeCode, 40), name: clean(recipient.name, 180) }))
    .filter((recipient) => recipient.name)
    .slice(0, 20);
  return {
    dateReceived,
    dateSent,
    direction,
    subject,
    description,
    senderCompany,
    senderCategory,
    addressedTo,
    addressedEmployeeCode: clean(input.addressedEmployeeCode, 40),
    department: lead?.department || asDepartment(input.department),
    location: clean(input.location, 180),
    type: asType(input.type),
    copies,
    remarks: clean(input.remarks, 2000),
    priority,
    dueDate,
    assignedEmployeeCode: clean(input.assignedEmployeeCode, 40),
    assignedEmployeeName: clean(input.assignedEmployeeName, 180),
    recipients,
    routes,
  };
};

const fileMatchesType = (type: string, bytes: Buffer) => {
  if (type === 'application/pdf') return bytes.subarray(0, 4).toString('utf8') === '%PDF';
  if (type === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/webp') return bytes.subarray(0, 4).toString('utf8') === 'RIFF' && bytes.subarray(8, 12).toString('utf8') === 'WEBP';
  if (type === 'application/msword') return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return bytes[0] === 0x50 && bytes[1] === 0x4b;
  return false;
};

const assertFiles = (files: IncomingAttachment[]) => {
  for (const file of files) {
    if (/eicar|virus/i.test(file.name)) throw new Error(`${file.name || 'A file'} was blocked by the upload policy.`);
    if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type as (typeof ACCEPTED_ATTACHMENT_TYPES)[number])) {
      throw new Error(`${file.name || 'A file'} must be a PDF, Word document, or image.`);
    }
    if (file.bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${file.name || 'A file'} is larger than 10 MB.`);
    }
    if (!file.bytes.length) throw new Error(`${file.name || 'A file'} is empty.`);
    if (!fileMatchesType(file.type, file.bytes)) throw new Error(`${file.name || 'A file'} content does not match its file type.`);
  }
};

const writeAttachment = async (correspondenceId: string, file: IncomingAttachment, addedByPool: sql.ConnectionPool) => {
  const attachmentId = clean(file.id, 40) || idFor('att');
  const fileName = safeFileName(file.name);
  const storageKey = path.join(correspondenceId, `${attachmentId}-${fileName}`);
  const absolute = absoluteFromKey(storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, file.bytes);
  const request = addedByPool.request();
  request.input('AttachmentId', sql.NVarChar(40), attachmentId);
  request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  request.input('FileName', sql.NVarChar(260), clean(file.name, 260) || fileName);
  request.input('ContentType', sql.NVarChar(120), clean(file.type, 120));
  request.input('SizeBytes', sql.BigInt, file.bytes.length);
  request.input('StorageKey', sql.NVarChar(500), storageKey);
  await request.query(`
    INSERT INTO [corporate].[FrontDeskAttachments]
      ([AttachmentId], [CorrespondenceId], [FileName], [ContentType], [SizeBytes], [StorageKey])
    VALUES
      (@AttachmentId, @CorrespondenceId, @FileName, @ContentType, @SizeBytes, @StorageKey)
  `);
  return storageKey;
};

const removeAttachment = async (pool: sql.ConnectionPool, correspondenceId: string, attachmentId: string) => {
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  request.input('AttachmentId', sql.NVarChar(40), attachmentId);
  const existing = await request.query(`
    SELECT [StorageKey]
    FROM [corporate].[FrontDeskAttachments]
    WHERE [CorrespondenceId] = @CorrespondenceId AND [AttachmentId] = @AttachmentId
  `);
  const storageKey = clean((existing.recordset[0] as { StorageKey?: string } | undefined)?.StorageKey, 500);
  await request.query(`
    DELETE FROM [corporate].[FrontDeskAttachments]
    WHERE [CorrespondenceId] = @CorrespondenceId AND [AttachmentId] = @AttachmentId
  `);
  if (storageKey) {
    await rm(absoluteFromKey(storageKey), { force: true }).catch(() => undefined);
  }
};

const routeSummary = (routes: DepartmentRouteInput[]) =>
  routes.map((route) => `${route.department}${route.lead ? ' (lead)' : ''}${route.assigneeName ? ` → ${route.assigneeName}` : ''}`).join('; ');

const saveRoutes = async (
  pool: sql.ConnectionPool,
  correspondenceId: string,
  routes: DepartmentRouteInput[],
  actor: string,
  created: boolean,
) => {
  const existing = await listRouteRows(pool, correspondenceId);
  const byDepartment = new Map(existing.map((row) => [row.route.department.toLowerCase(), row.route]));
  const kept = new Set<string>();
  for (const route of routes) {
    const prior = byDepartment.get(route.department.toLowerCase());
    if (prior && (prior.status === 'Completed' || prior.status === 'Waived')) {
      const leadOnly = pool.request();
      leadOnly.input('RouteId', sql.NVarChar(40), prior.id);
      leadOnly.input('IsLead', sql.Bit, route.lead);
      await leadOnly.query(`UPDATE [corporate].[FrontDeskRoutes] SET [IsLead] = @IsLead, [UpdatedAt] = SYSUTCDATETIME() WHERE [RouteId] = @RouteId`);
      kept.add(prior.id);
      continue;
    }
    if (prior) {
      const request = pool.request();
      request.input('RouteId', sql.NVarChar(40), prior.id);
      request.input('IsLead', sql.Bit, route.lead);
      request.input('AssigneeEmployeeCode', sql.NVarChar(40), route.assigneeCode || null);
      request.input('AssigneeEmployeeName', sql.NVarChar(180), route.assigneeName || null);
      request.input('HodEmployeeCode', sql.NVarChar(40), route.hodCode || null);
      request.input('HodEmployeeName', sql.NVarChar(180), route.hodName || null);
      request.input('ActionRequired', sql.NVarChar(500), route.actionRequired || null);
      request.input('Priority', sql.NVarChar(20), route.priority);
      request.input('DueDate', sql.Date, route.dueDate ? sqlDate(route.dueDate) : null);
      await request.query(`
        UPDATE [corporate].[FrontDeskRoutes]
        SET [IsLead] = @IsLead,
            [AssigneeEmployeeCode] = @AssigneeEmployeeCode,
            [AssigneeEmployeeName] = @AssigneeEmployeeName,
            [HodEmployeeCode] = @HodEmployeeCode,
            [HodEmployeeName] = @HodEmployeeName,
            [ActionRequired] = @ActionRequired,
            [Priority] = @Priority,
            [DueDate] = @DueDate,
            [UpdatedAt] = SYSUTCDATETIME()
        WHERE [RouteId] = @RouteId
      `);
      kept.add(prior.id);
      continue;
    }
    const routeId = idFor('rte');
    const request = pool.request();
    request.input('RouteId', sql.NVarChar(40), routeId);
    request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
    request.input('Department', sql.NVarChar(120), route.department);
    request.input('IsLead', sql.Bit, route.lead);
    request.input('AssigneeEmployeeCode', sql.NVarChar(40), route.assigneeCode || null);
    request.input('AssigneeEmployeeName', sql.NVarChar(180), route.assigneeName || null);
    request.input('HodEmployeeCode', sql.NVarChar(40), route.hodCode || null);
    request.input('HodEmployeeName', sql.NVarChar(180), route.hodName || null);
    request.input('ActionRequired', sql.NVarChar(500), route.actionRequired || null);
    request.input('Priority', sql.NVarChar(20), route.priority);
    request.input('DueDate', sql.Date, route.dueDate ? sqlDate(route.dueDate) : null);
    await request.query(`
      INSERT INTO [corporate].[FrontDeskRoutes] (
        [RouteId], [CorrespondenceId], [Department], [IsLead], [AssigneeEmployeeCode], [AssigneeEmployeeName],
        [HodEmployeeCode], [HodEmployeeName], [ActionRequired], [Priority], [DueDate]
      ) VALUES (
        @RouteId, @CorrespondenceId, @Department, @IsLead, @AssigneeEmployeeCode, @AssigneeEmployeeName,
        @HodEmployeeCode, @HodEmployeeName, @ActionRequired, @Priority, @DueDate
      )
    `);
    kept.add(routeId);
  }
  for (const row of existing) {
    if (kept.has(row.route.id) || row.route.status === 'Completed' || row.route.status === 'Waived') continue;
    const request = pool.request();
    request.input('RouteId', sql.NVarChar(40), row.route.id);
    await request.query(`DELETE FROM [corporate].[FrontDeskRoutes] WHERE [RouteId] = @RouteId`);
  }
  const before = existing.map((row) => `${row.route.department}|${row.route.lead}|${row.route.assigneeCode || ''}|${row.route.hodCode || ''}|${row.route.dueDate || ''}`).sort().join('||');
  const after = routes.map((route) => `${route.department}|${route.lead}|${route.assigneeCode || ''}|${route.hodCode || ''}|${route.dueDate || ''}`).sort().join('||');
  if (created || before !== after) {
    await writeFrontDeskEvent(pool, correspondenceId, created ? 'Routed' : 'Routing updated', actor, routeSummary(routes));
  }
};

export const createCorrespondence = async (
  input: CorrespondenceInput,
  files: IncomingAttachment[],
  actor: string,
) => {
  assertFiles(files);
  const value = validateInput(input);
  const pool = await ensureFrontDeskDb();
  const id = idFor('cor');
  let referenceNo = '';
  let inserted = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await pool.request().query(`SELECT [ReferenceNo] FROM [corporate].[FrontDeskCorrespondence]`);
    referenceNo = nextOfficeReference(
      (existing.recordset as { ReferenceNo?: string }[]).map((row) => clean(row.ReferenceNo, 40)),
      value.direction,
      value.dateReceived,
    );
    const workflow = value.assignedEmployeeCode ? 'Assigned' : 'New';
    const request = pool.request();
    request.input('CorrespondenceId', sql.NVarChar(40), id);
    request.input('ReferenceNo', sql.NVarChar(40), referenceNo);
    request.input('Direction', sql.NVarChar(20), value.direction);
    request.input('DateReceived', sql.Date, sqlDate(value.dateReceived));
    request.input('DateSent', sql.Date, value.dateSent ? sqlDate(value.dateSent) : null);
    request.input('Subject', sql.NVarChar(500), value.subject);
    request.input('Description', sql.NVarChar(2000), value.description);
    request.input('SenderCompany', sql.NVarChar(300), value.senderCompany);
    request.input('SenderCategory', sql.NVarChar(80), value.senderCategory);
    request.input('AddressedTo', sql.NVarChar(300), value.addressedTo);
    request.input('AddressedEmployeeCode', sql.NVarChar(40), value.addressedEmployeeCode || null);
    request.input('Department', sql.NVarChar(120), value.department);
    request.input('Location', sql.NVarChar(180), value.location || null);
    request.input('CorrespondenceType', sql.NVarChar(80), value.type);
    request.input('Copies', sql.Int, value.copies);
    request.input('Remarks', sql.NVarChar(2000), value.remarks || null);
    request.input('Priority', sql.NVarChar(20), value.priority);
    request.input('DueDate', sql.Date, value.dueDate ? sqlDate(value.dueDate) : null);
    request.input('WorkflowStatus', sql.NVarChar(40), workflow);
    request.input('AssignedEmployeeCode', sql.NVarChar(40), value.assignedEmployeeCode || null);
    request.input('AssignedEmployeeName', sql.NVarChar(180), value.assignedEmployeeName || null);
    request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
    try {
      await request.query(`
        INSERT INTO [corporate].[FrontDeskCorrespondence] (
          [CorrespondenceId], [ReferenceNo], [Direction], [DateReceived], [DateSent], [Subject], [Description],
          [SenderCompany], [SenderCategory], [AddressedTo], [AddressedEmployeeCode], [Department], [Location], [CorrespondenceType], [Copies], [Remarks],
          [Priority], [DueDate], [Status], [WorkflowStatus], [AssignedEmployeeCode], [AssignedEmployeeName],
          [CreatedBy], [UpdatedBy]
        ) VALUES (
          @CorrespondenceId, @ReferenceNo, @Direction, @DateReceived, @DateSent, @Subject, @Description,
          @SenderCompany, @SenderCategory, @AddressedTo, @AddressedEmployeeCode, @Department, @Location, @CorrespondenceType, @Copies, @Remarks,
          @Priority, @DueDate, N'Open', @WorkflowStatus, @AssignedEmployeeCode, @AssignedEmployeeName,
          @Actor, @Actor
        )
      `);
      inserted = true;
      break;
    } catch (error) {
      const number = (error as { number?: number })?.number;
      if (number === 2601 || number === 2627) continue;
      throw error;
    }
  }
  if (!inserted) throw new Error('Could not allocate a correspondence reference.');
  await replaceRecipients(pool, id, value.recipients);
  const routes = value.routes ?? [{
    department: value.department,
    lead: true,
    assigneeCode: value.assignedEmployeeCode || undefined,
    assigneeName: value.assignedEmployeeName || undefined,
    priority: value.priority,
    dueDate: value.dueDate || undefined,
  }];
  await saveRoutes(pool, id, routes, actor, true);
  await writeFrontDeskEvent(pool, id, 'Registered', actor, `${value.direction} · ${value.subject}`);
  if (value.assignedEmployeeCode) {
    await writeFrontDeskEvent(pool, id, 'Assigned', actor, value.assignedEmployeeName || value.assignedEmployeeCode);
  }
  for (const file of files) {
    await writeAttachment(id, file, pool);
  }
  const created = await getCorrespondence(id);
  if (!created) throw new Error('Correspondence was saved but could not be read back.');
  return created;
};

export const updateCorrespondence = async (
  id: string,
  input: CorrespondenceInput,
  files: IncomingAttachment[],
  removedAttachmentIds: string[],
  actor: string,
) => {
  assertFiles(files);
  const current = await getCorrespondence(id);
  if (!current) throw new Error('Correspondence was not found.');
  if (current.status === 'Closed') throw new Error('Closed records are read-only.');
  const value = validateInput(input);
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  const workflow = value.assignedEmployeeCode ? (current.workflowStatus === 'In Progress' ? 'In Progress' : 'Assigned') : 'New';
  request.input('Direction', sql.NVarChar(20), value.direction);
  request.input('DateReceived', sql.Date, sqlDate(value.dateReceived));
  request.input('DateSent', sql.Date, value.dateSent ? sqlDate(value.dateSent) : null);
  request.input('Subject', sql.NVarChar(500), value.subject);
  request.input('Description', sql.NVarChar(2000), value.description);
  request.input('SenderCompany', sql.NVarChar(300), value.senderCompany);
  request.input('SenderCategory', sql.NVarChar(80), value.senderCategory);
  request.input('AddressedTo', sql.NVarChar(300), value.addressedTo);
  request.input('AddressedEmployeeCode', sql.NVarChar(40), value.addressedEmployeeCode || null);
  request.input('Department', sql.NVarChar(120), value.department);
  request.input('Location', sql.NVarChar(180), value.location || null);
  request.input('CorrespondenceType', sql.NVarChar(80), value.type);
  request.input('Copies', sql.Int, value.copies);
  request.input('Remarks', sql.NVarChar(2000), value.remarks || null);
  request.input('Priority', sql.NVarChar(20), value.priority);
  request.input('DueDate', sql.Date, value.dueDate ? sqlDate(value.dueDate) : null);
  request.input('WorkflowStatus', sql.NVarChar(40), workflow);
  request.input('AssignedEmployeeCode', sql.NVarChar(40), value.assignedEmployeeCode || null);
  request.input('AssignedEmployeeName', sql.NVarChar(180), value.assignedEmployeeName || null);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  const updated = await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [Direction] = @Direction,
        [DateReceived] = @DateReceived,
        [DateSent] = @DateSent,
        [Subject] = @Subject,
        [Description] = @Description,
        [SenderCompany] = @SenderCompany,
        [SenderCategory] = @SenderCategory,
        [AddressedTo] = @AddressedTo,
        [AddressedEmployeeCode] = @AddressedEmployeeCode,
        [Department] = @Department,
        [Location] = @Location,
        [CorrespondenceType] = @CorrespondenceType,
        [Copies] = @Copies,
        [Remarks] = @Remarks,
        [Priority] = @Priority,
        [DueDate] = @DueDate,
        [WorkflowStatus] = @WorkflowStatus,
        [AssignedEmployeeCode] = @AssignedEmployeeCode,
        [AssignedEmployeeName] = @AssignedEmployeeName,
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open'
  `);
  if (!updated.rowsAffected[0]) throw new Error('Closed records are read-only.');
  await replaceRecipients(pool, current.id, value.recipients);
  if (value.routes) await saveRoutes(pool, current.id, value.routes, actor, false);
  await writeFrontDeskEvent(pool, current.id, 'Updated', actor, value.subject);
  const known = new Set(current.attachments.map((attachment) => attachment.id));
  for (const attachmentId of removedAttachmentIds) {
    if (known.has(attachmentId)) await removeAttachment(pool, current.id, attachmentId);
  }
  for (const file of files) {
    await writeAttachment(current.id, file, pool);
  }
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence was updated but could not be read back.');
  return saved;
};

export const closeCorrespondence = async (id: string, actor: string) => {
  const current = await getCorrespondence(id);
  if (!current) throw new Error('Correspondence was not found.');
  if (current.status === 'Closed') return current;
  const blocking = unfinishedDepartmentRoutes(current.routes || []);
  if (blocking.length) {
    throw new Error(`Cannot close until every department is completed or waived: ${blocking.map((route) => route.department).join(', ')}.`);
  }
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  request.input('ClosedBy', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  request.input('DateClosed', sql.Date, sqlDate(todayISO()));
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [Status] = N'Closed',
        [WorkflowStatus] = N'Closed',
        [ClosedBy] = @ClosedBy,
        [DateClosed] = @DateClosed,
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @ClosedBy
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open'
  `);
  await writeFrontDeskEvent(pool, current.id, 'Closed', actor);
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence was closed but could not be read back.');
  return saved;
};

export const deleteCorrespondence = async (id: string) => {
  const current = await getCorrespondence(id);
  if (!current) return;
  if (current.status === 'Closed') throw new Error('Closed records cannot be deleted.');
  const pool = await ensureFrontDeskDb();
  const attachments = await listAttachmentRows(pool, current.id);
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  const removed = await request.query(`
    DELETE FROM [corporate].[FrontDeskCorrespondence]
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open'
  `);
  if (!removed.rowsAffected[0]) throw new Error('Closed records cannot be deleted.');
  for (const row of attachments) {
    const storageKey = clean(row.StorageKey, 500);
    if (storageKey) await rm(absoluteFromKey(storageKey), { force: true }).catch(() => undefined);
  }
  await rm(path.join(storageRoot(), current.id), { recursive: true, force: true }).catch(() => undefined);
};

export const readAttachmentFile = async (attachmentId: string, actor = '') => {
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('AttachmentId', sql.NVarChar(40), clean(attachmentId, 40));
  const result = await request.query(`
    SELECT [CorrespondenceId], [FileName], [ContentType], [StorageKey]
    FROM [corporate].[FrontDeskAttachments]
    WHERE [AttachmentId] = @AttachmentId
  `);
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const storageKey = clean(row.StorageKey, 500);
  const bytes = await readFile(absoluteFromKey(storageKey));
  const correspondenceId = clean(row.CorrespondenceId, 40);
  if (actor && correspondenceId) {
    await writeFrontDeskEvent(pool, correspondenceId, 'Document', actor, clean(row.FileName, 260));
  }
  return {
    correspondenceId,
    fileName: clean(row.FileName, 260) || 'document',
    contentType: clean(row.ContentType, 120) || 'application/octet-stream',
    bytes,
  };
};

const requireOpen = async (id: string) => {
  const current = await getCorrespondence(id);
  if (!current) throw new Error('Correspondence was not found.');
  if (current.status === 'Closed') throw new Error('Closed records are read-only.');
  return current;
};

export const assignCorrespondence = async (id: string, employeeCode: string, employeeName: string, actor: string) => {
  const current = await requireOpen(id);
  const code = clean(employeeCode, 40);
  const name = clean(employeeName, 180);
  if (!code || !name) throw new Error('Choose an employee from the directory.');
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  request.input('AssignedEmployeeCode', sql.NVarChar(40), code);
  request.input('AssignedEmployeeName', sql.NVarChar(180), name);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [AssignedEmployeeCode] = @AssignedEmployeeCode,
        [AssignedEmployeeName] = @AssignedEmployeeName,
        [WorkflowStatus] = CASE WHEN [WorkflowStatus] = N'In Progress' THEN N'In Progress' ELSE N'Assigned' END,
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open'
  `);
  const recipient = pool.request();
  recipient.input('RecipientId', sql.NVarChar(40), idFor('rcp'));
  recipient.input('CorrespondenceId', sql.NVarChar(40), current.id);
  recipient.input('EmployeeCode', sql.NVarChar(40), code);
  recipient.input('DisplayName', sql.NVarChar(180), name);
  await recipient.query(`
    IF NOT EXISTS (
      SELECT 1 FROM [corporate].[FrontDeskRecipients]
      WHERE [CorrespondenceId] = @CorrespondenceId AND [EmployeeCode] = @EmployeeCode
    )
    INSERT INTO [corporate].[FrontDeskRecipients] ([RecipientId], [CorrespondenceId], [EmployeeCode], [DisplayName])
    VALUES (@RecipientId, @CorrespondenceId, @EmployeeCode, @DisplayName)
  `);
  await writeFrontDeskEvent(pool, current.id, 'Assigned', actor, `${name} (${code})`);
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence was assigned but could not be read back.');
  return saved;
};

export const acknowledgeCorrespondence = async (id: string, actor: string) => {
  const current = await requireOpen(id);
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [AcknowledgedAt] = SYSUTCDATETIME(),
        [AcknowledgedBy] = @Actor,
        [WorkflowStatus] = N'In Progress',
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open'
  `);
  await writeFrontDeskEvent(pool, current.id, 'Acknowledged', actor);
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence was acknowledged but could not be read back.');
  return saved;
};

export const progressCorrespondence = async (id: string, actor: string) => {
  const current = await requireOpen(id);
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [WorkflowStatus] = N'In Progress',
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open'
  `);
  await writeFrontDeskEvent(pool, current.id, 'In Progress', actor);
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence could not be read back.');
  return saved;
};

export const respondCorrespondence = async (id: string, note: string, actor: string) => {
  const current = await requireOpen(id);
  const detail = clean(note, 1000);
  if (!detail) throw new Error('Add the response note.');
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [WorkflowStatus] = N'In Progress',
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open'
  `);
  await writeFrontDeskEvent(pool, current.id, 'Responded', actor, detail);
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence could not be read back.');
  return saved;
};

export const reopenCorrespondence = async (id: string, reason: string, actor: string) => {
  const current = await getCorrespondence(id);
  if (!current) throw new Error('Correspondence was not found.');
  if (current.status !== 'Closed') return current;
  const detail = clean(reason, 1000);
  if (!detail) throw new Error('A reason is required to reopen a closed record.');
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [Status] = N'Open',
        [WorkflowStatus] = N'In Progress',
        [ClosedBy] = NULL,
        [DateClosed] = NULL,
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Closed'
  `);
  await writeFrontDeskEvent(pool, current.id, 'Reopened', actor, detail);
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence was reopened but could not be read back.');
  return saved;
};

export const archiveCorrespondence = async (id: string, actor: string) => {
  const current = await getCorrespondence(id);
  if (!current) throw new Error('Correspondence was not found.');
  if (current.status !== 'Closed') throw new Error('Only closed correspondence can be archived.');
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), current.id);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [WorkflowStatus] = N'Archived',
        [UpdatedAt] = SYSUTCDATETIME(),
        [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Closed'
  `);
  await writeFrontDeskEvent(pool, current.id, 'Archived', actor);
  const saved = await getCorrespondence(current.id);
  if (!saved) throw new Error('Correspondence was archived but could not be read back.');
  return saved;
};

const loadOpenRoute = async (correspondenceId: string, routeId: string) => {
  const current = await getCorrespondence(correspondenceId);
  if (!current) throw new Error('Correspondence was not found.');
  if (current.status === 'Closed') throw new Error('Closed records are read-only.');
  const route = (current.routes || []).find((item) => item.id === clean(routeId, 40));
  if (!route) throw new Error('Department route was not found.');
  if (route.status === 'Completed' || route.status === 'Waived') throw new Error('Completed departmental assignments cannot be changed.');
  return { current, route };
};

const markRouteInProgress = async (pool: sql.ConnectionPool, correspondenceId: string, actor: string) => {
  const request = pool.request();
  request.input('CorrespondenceId', sql.NVarChar(40), correspondenceId);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskCorrespondence]
    SET [WorkflowStatus] = N'In Progress', [UpdatedAt] = SYSUTCDATETIME(), [UpdatedBy] = @Actor
    WHERE [CorrespondenceId] = @CorrespondenceId AND [Status] = N'Open' AND [WorkflowStatus] NOT IN (N'Closed', N'Archived')
  `);
};

export const acknowledgeRoute = async (correspondenceId: string, routeId: string, actor: string) => {
  const { route } = await loadOpenRoute(correspondenceId, routeId);
  if (route.status === 'Pending') {
    const pool = await ensureFrontDeskDb();
    const request = pool.request();
    request.input('RouteId', sql.NVarChar(40), route.id);
    request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
    await request.query(`
      UPDATE [corporate].[FrontDeskRoutes]
      SET [Status] = N'Acknowledged', [AcknowledgedAt] = SYSUTCDATETIME(), [AcknowledgedBy] = @Actor, [UpdatedAt] = SYSUTCDATETIME()
      WHERE [RouteId] = @RouteId AND [Status] = N'Pending'
    `);
    await markRouteInProgress(pool, correspondenceId, actor);
    await writeFrontDeskEvent(pool, correspondenceId, 'Acknowledged', actor, route.department);
  }
  const saved = await getCorrespondence(correspondenceId);
  if (!saved) throw new Error('Correspondence was not found.');
  return saved;
};

export const progressRoute = async (correspondenceId: string, routeId: string, note: string, actor: string) => {
  const { route } = await loadOpenRoute(correspondenceId, routeId);
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('RouteId', sql.NVarChar(40), route.id);
  request.input('ProgressNote', sql.NVarChar(1000), clean(note, 1000) || route.progressNote || null);
  await request.query(`
    UPDATE [corporate].[FrontDeskRoutes]
    SET [Status] = N'In Progress', [ProgressNote] = @ProgressNote, [UpdatedAt] = SYSUTCDATETIME()
    WHERE [RouteId] = @RouteId
  `);
  await markRouteInProgress(pool, correspondenceId, actor);
  await writeFrontDeskEvent(pool, correspondenceId, 'Progress', actor, `${route.department}${note ? ` — ${clean(note, 300)}` : ''}`);
  const saved = await getCorrespondence(correspondenceId);
  if (!saved) throw new Error('Correspondence was not found.');
  return saved;
};

export const completeRoute = async (correspondenceId: string, routeId: string, actor: string) => {
  const { route } = await loadOpenRoute(correspondenceId, routeId);
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('RouteId', sql.NVarChar(40), route.id);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  await request.query(`
    UPDATE [corporate].[FrontDeskRoutes]
    SET [Status] = N'Completed', [CompletedAt] = SYSUTCDATETIME(), [CompletedBy] = @Actor, [UpdatedAt] = SYSUTCDATETIME()
    WHERE [RouteId] = @RouteId
  `);
  await writeFrontDeskEvent(pool, correspondenceId, 'Department completed', actor, route.department);
  const saved = await getCorrespondence(correspondenceId);
  if (!saved) throw new Error('Correspondence was not found.');
  return saved;
};

export const reassignRoute = async (
  correspondenceId: string,
  routeId: string,
  assigneeCode: string,
  assigneeName: string,
  actor: string,
) => {
  const { route } = await loadOpenRoute(correspondenceId, routeId);
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('RouteId', sql.NVarChar(40), route.id);
  request.input('AssigneeEmployeeCode', sql.NVarChar(40), clean(assigneeCode, 40) || null);
  request.input('AssigneeEmployeeName', sql.NVarChar(180), clean(assigneeName, 180) || null);
  await request.query(`
    UPDATE [corporate].[FrontDeskRoutes]
    SET [AssigneeEmployeeCode] = @AssigneeEmployeeCode, [AssigneeEmployeeName] = @AssigneeEmployeeName, [UpdatedAt] = SYSUTCDATETIME()
    WHERE [RouteId] = @RouteId
  `);
  await writeFrontDeskEvent(pool, correspondenceId, 'Reassigned', actor, `${route.department} → ${clean(assigneeName, 180) || clean(assigneeCode, 40)}`);
  const saved = await getCorrespondence(correspondenceId);
  if (!saved) throw new Error('Correspondence was not found.');
  return saved;
};

export const waiveRoute = async (correspondenceId: string, routeId: string, reason: string, actor: string) => {
  const note = clean(reason, 500);
  if (!note) throw new Error('A waive reason is required.');
  const { route } = await loadOpenRoute(correspondenceId, routeId);
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('RouteId', sql.NVarChar(40), route.id);
  request.input('Actor', sql.NVarChar(180), clean(actor, 180) || 'Corporate Office');
  request.input('WaiveReason', sql.NVarChar(500), note);
  await request.query(`
    UPDATE [corporate].[FrontDeskRoutes]
    SET [Status] = N'Waived', [WaivedAt] = SYSUTCDATETIME(), [WaivedBy] = @Actor, [WaiveReason] = @WaiveReason, [UpdatedAt] = SYSUTCDATETIME()
    WHERE [RouteId] = @RouteId
  `);
  await writeFrontDeskEvent(pool, correspondenceId, 'Waived', actor, `${route.department} — ${note}`);
  const saved = await getCorrespondence(correspondenceId);
  if (!saved) throw new Error('Correspondence was not found.');
  return saved;
};

export const listOpenDeadlineRows = async () => {
  const pool = await ensureFrontDeskDb();
  const [letters, routes] = await Promise.all([
    pool.request().query(`
      SELECT [CorrespondenceId], [ReferenceNo], [Subject], [Description], [DueDate], [AssignedEmployeeCode], [AssignedEmployeeName]
      FROM [corporate].[FrontDeskCorrespondence]
      WHERE [Status] = N'Open' AND [DueDate] IS NOT NULL AND [AssignedEmployeeCode] IS NOT NULL
    `),
    pool.request().query(`
      SELECT c.[CorrespondenceId], c.[ReferenceNo], c.[Subject], c.[Description], r.[DueDate],
             r.[RouteId], r.[Department], r.[AssigneeEmployeeCode], r.[AssigneeEmployeeName], r.[HodEmployeeCode], r.[HodEmployeeName]
      FROM [corporate].[FrontDeskRoutes] r
      INNER JOIN [corporate].[FrontDeskCorrespondence] c ON c.[CorrespondenceId] = r.[CorrespondenceId]
      WHERE c.[Status] = N'Open'
        AND r.[Status] NOT IN (N'Completed', N'Waived')
        AND r.[DueDate] IS NOT NULL
        AND (NULLIF(r.[AssigneeEmployeeCode], N'') IS NOT NULL OR NULLIF(r.[HodEmployeeCode], N'') IS NOT NULL)
    `),
  ]);
  const rows = (letters.recordset as Record<string, unknown>[]).map((row) => ({
    id: clean(row.CorrespondenceId, 40),
    referenceNo: clean(row.ReferenceNo, 40),
    subject: clean(row.Subject, 500) || clean(row.Description, 500),
    dueDate: dateOnly(row.DueDate),
    employeeCode: clean(row.AssignedEmployeeCode, 40),
    employeeName: clean(row.AssignedEmployeeName, 180),
    noticeScope: '',
  }));
  const seen = new Set(rows.map((row) => `${row.id}|${row.dueDate}|${row.employeeCode}`));
  for (const row of routes.recordset as Record<string, unknown>[]) {
    const id = clean(row.CorrespondenceId, 40);
    const dueDate = dateOnly(row.DueDate);
    const department = clean(row.Department, 120);
    const routeId = clean(row.RouteId, 40);
    const people = [
      { code: clean(row.AssigneeEmployeeCode, 40), name: clean(row.AssigneeEmployeeName, 180) },
      { code: clean(row.HodEmployeeCode, 40), name: clean(row.HodEmployeeName, 180) },
    ];
    for (const person of people) {
      if (!person.code) continue;
      const key = `${id}|${dueDate}|${person.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id,
        referenceNo: clean(row.ReferenceNo, 40),
        subject: `${clean(row.Subject, 500) || clean(row.Description, 500)} (${department})`,
        dueDate,
        employeeCode: person.code,
        employeeName: person.name,
        noticeScope: `:route:${routeId}:${person.code}`,
      });
    }
  }
  return rows;
};

export type DepartmentDeadlineTarget = {
  id: string;
  referenceNo: string;
  subject: string;
  correspondenceType: string;
  department: string;
  dueDate: string;
  priority: string;
  routeId: string;
  hodCode: string;
  hodName: string;
};

export const listDepartmentDeadlineTargets = async (): Promise<DepartmentDeadlineTarget[]> => {
  const pool = await ensureFrontDeskDb();
  const [routes, parents] = await Promise.all([
    pool.request().query(`
      SELECT c.[CorrespondenceId], c.[ReferenceNo], c.[Subject], c.[Description], c.[CorrespondenceType], c.[Priority],
             r.[DueDate], r.[RouteId], r.[Department], r.[HodEmployeeCode], r.[HodEmployeeName]
      FROM [corporate].[FrontDeskRoutes] r
      INNER JOIN [corporate].[FrontDeskCorrespondence] c ON c.[CorrespondenceId] = r.[CorrespondenceId]
      WHERE c.[Status] = N'Open'
        AND r.[Status] NOT IN (N'Completed', N'Waived')
        AND r.[DueDate] IS NOT NULL
    `),
    pool.request().query(`
      SELECT c.[CorrespondenceId], c.[ReferenceNo], c.[Subject], c.[Description], c.[CorrespondenceType], c.[Priority], c.[DueDate], c.[Department]
      FROM [corporate].[FrontDeskCorrespondence] c
      WHERE c.[Status] = N'Open'
        AND c.[DueDate] IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM [corporate].[FrontDeskRoutes] r WHERE r.[CorrespondenceId] = c.[CorrespondenceId]
        )
    `),
  ]);
  const fromRoute = (routes.recordset as Record<string, unknown>[]).map((row) => ({
    id: clean(row.CorrespondenceId, 40),
    referenceNo: clean(row.ReferenceNo, 40),
    subject: clean(row.Subject, 500) || clean(row.Description, 500),
    correspondenceType: clean(row.CorrespondenceType, 80),
    department: clean(row.Department, 120),
    dueDate: dateOnly(row.DueDate),
    priority: clean(row.Priority, 20) || 'Medium',
    routeId: clean(row.RouteId, 40),
    hodCode: clean(row.HodEmployeeCode, 40),
    hodName: clean(row.HodEmployeeName, 180),
  }));
  const fromParent = (parents.recordset as Record<string, unknown>[]).map((row) => ({
    id: clean(row.CorrespondenceId, 40),
    referenceNo: clean(row.ReferenceNo, 40),
    subject: clean(row.Subject, 500) || clean(row.Description, 500),
    correspondenceType: clean(row.CorrespondenceType, 80),
    department: clean(row.Department, 120),
    dueDate: dateOnly(row.DueDate),
    priority: clean(row.Priority, 20) || 'Medium',
    routeId: '',
    hodCode: '',
    hodName: '',
  }));
  return [...fromRoute, ...fromParent].filter((row) => row.id && row.dueDate && row.department);
};

export const claimFrontDeskNotice = async (noticeKey: string, correspondenceId: string) => {
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('NoticeKey', sql.NVarChar(200), clean(noticeKey, 200));
  request.input('CorrespondenceId', sql.NVarChar(40), clean(correspondenceId, 40));
  try {
    await request.query(`
      INSERT INTO [corporate].[FrontDeskNotices] ([NoticeKey], [CorrespondenceId])
      VALUES (@NoticeKey, @CorrespondenceId)
    `);
    return true;
  } catch (error) {
    const number = (error as { number?: number })?.number;
    if (number === 2601 || number === 2627) return false;
    throw error;
  }
};

export const releaseFrontDeskNotice = async (noticeKey: string) => {
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('NoticeKey', sql.NVarChar(200), clean(noticeKey, 200));
  await request.query(`DELETE FROM [corporate].[FrontDeskNotices] WHERE [NoticeKey] = @NoticeKey`);
};
