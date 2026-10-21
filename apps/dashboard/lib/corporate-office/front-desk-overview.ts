import sql from 'mssql';
import { SENDER_CATEGORIES, CORRESPONDENCE_TYPES } from '@/lib/corporate-office/front-desk-types';
import { percentChange, todayISO } from '@/lib/corporate-office/front-desk-format';
import { ensureFrontDeskDb } from '@/lib/corporate-office/front-desk-store';

export type OverviewTab = 'all' | 'incoming' | 'outgoing' | 'assigned' | 'pending' | 'overdue' | 'closed';

export type OverviewFilters = {
  tab: OverviewTab;
  q: string;
  category: string;
  department: string;
  type: string;
  status: string;
  from: string;
  to: string;
  year: number;
  departmentRange: 'month' | 'year';
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
  employeeCode: string;
  participantOnly: boolean;
};

const TABS: OverviewTab[] = ['all', 'incoming', 'outgoing', 'assigned', 'pending', 'overdue', 'closed'];
const SORTS: Record<string, string> = {
  reference: '[ReferenceNo]',
  date: '[ActivityDate]',
  sender: '[SenderCompany]',
  subject: '[Subject]',
  department: '[Department]',
  status: '[DisplayStatus]',
};

const clean = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

const monthBounds = (today: string) => {
  const [year, month] = today.slice(0, 7).split('-').map(Number);
  const start = `${today.slice(0, 7)}-01`;
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const pad = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { start, previous: pad(previous), next: pad(next) };
};

const displaySql = `
  CASE
    WHEN [Status] = N'Closed' OR [WorkflowStatus] IN (N'Closed', N'Archived') THEN N'Closed'
    WHEN [DueDate] IS NOT NULL AND [DueDate] < @Today AND [Status] <> N'Closed' THEN N'Overdue'
    WHEN [WorkflowStatus] = N'In Progress' THEN N'In Progress'
    WHEN [WorkflowStatus] = N'Assigned' OR NULLIF([AssignedEmployeeCode], N'') IS NOT NULL THEN N'Assigned'
    ELSE N'New'
  END
`;

const baseCte = `
  WITH [office] AS (
    SELECT
      [CorrespondenceId], [ReferenceNo], [Direction], [DateReceived], [DateSent], [Subject], [Description],
      [SenderCompany], [SenderCategory], [AddressedTo], [Department], [CorrespondenceType], [Priority],
      [DueDate], [Status], [WorkflowStatus], [AssignedEmployeeCode], [AssignedEmployeeName], [CreatedAt], [DateClosed],
      COALESCE([Subject], [Description]) AS [SubjectLabel],
      COALESCE(CASE WHEN [Direction] = N'Outgoing' THEN [DateSent] END, [DateReceived]) AS [ActivityDate],
      ${displaySql} AS [DisplayStatus],
      CASE WHEN EXISTS (
        SELECT 1
        FROM [corporate].[FrontDeskRoutes] AS route
        WHERE route.[CorrespondenceId] = [corporate].[FrontDeskCorrespondence].[CorrespondenceId]
          AND route.[Status] NOT IN (N'Completed', N'Waived')
          AND (
            UPPER(route.[AssigneeEmployeeCode]) = UPPER(@EmployeeCode)
            OR UPPER(route.[HodEmployeeCode]) = UPPER(@EmployeeCode)
          )
      ) THEN 1 ELSE 0 END AS [RouteAssigned],
      CASE WHEN
        UPPER(ISNULL([AddressedEmployeeCode], N'')) = UPPER(@EmployeeCode)
        OR UPPER(ISNULL([AssignedEmployeeCode], N'')) = UPPER(@EmployeeCode)
        OR EXISTS (
          SELECT 1 FROM [corporate].[FrontDeskRoutes] AS member
          WHERE member.[CorrespondenceId] = [corporate].[FrontDeskCorrespondence].[CorrespondenceId]
            AND (
              UPPER(ISNULL(member.[AssigneeEmployeeCode], N'')) = UPPER(@EmployeeCode)
              OR UPPER(ISNULL(member.[HodEmployeeCode], N'')) = UPPER(@EmployeeCode)
            )
        )
        OR EXISTS (
          SELECT 1 FROM [corporate].[FrontDeskRecipients] AS recipient
          WHERE recipient.[CorrespondenceId] = [corporate].[FrontDeskCorrespondence].[CorrespondenceId]
            AND UPPER(ISNULL(recipient.[EmployeeCode], N'')) = UPPER(@EmployeeCode)
        )
      THEN 1 ELSE 0 END AS [Participant]
    FROM [corporate].[FrontDeskCorrespondence]
  )
`;

const participantOnTable = `
  (
    UPPER(ISNULL([AddressedEmployeeCode], N'')) = UPPER(@EmployeeCode)
    OR UPPER(ISNULL([AssignedEmployeeCode], N'')) = UPPER(@EmployeeCode)
    OR EXISTS (
      SELECT 1 FROM [corporate].[FrontDeskRoutes] AS member
      WHERE member.[CorrespondenceId] = [corporate].[FrontDeskCorrespondence].[CorrespondenceId]
        AND (
          UPPER(ISNULL(member.[AssigneeEmployeeCode], N'')) = UPPER(@EmployeeCode)
          OR UPPER(ISNULL(member.[HodEmployeeCode], N'')) = UPPER(@EmployeeCode)
        )
    )
    OR EXISTS (
      SELECT 1 FROM [corporate].[FrontDeskRecipients] AS recipient
      WHERE recipient.[CorrespondenceId] = [corporate].[FrontDeskCorrespondence].[CorrespondenceId]
        AND UPPER(ISNULL(recipient.[EmployeeCode], N'')) = UPPER(@EmployeeCode)
    )
  )
`;

const bind = (request: sql.Request, filters: OverviewFilters, today: string) => {
  request.input('Today', sql.Date, new Date(`${today}T12:00:00.000Z`));
  request.input('Like', sql.NVarChar(220), `%${filters.q.replace(/[%_[\]]/g, '')}%`);
  request.input('Category', sql.NVarChar(80), filters.category);
  request.input('Department', sql.NVarChar(120), filters.department);
  request.input('Type', sql.NVarChar(80), filters.type);
  request.input('Status', sql.NVarChar(40), filters.status);
  request.input('FromDate', sql.Date, filters.from ? new Date(`${filters.from}T12:00:00.000Z`) : null);
  request.input('ToDate', sql.Date, filters.to ? new Date(`${filters.to}T12:00:00.000Z`) : null);
  request.input('EmployeeCode', sql.NVarChar(40), filters.employeeCode);
};

const whereSql = (filters: OverviewFilters, includeTab: boolean) => {
  const parts = ['1 = 1'];
  if (filters.q) parts.push(`(UPPER([ReferenceNo]) LIKE UPPER(@Like) OR UPPER([SubjectLabel]) LIKE UPPER(@Like) OR UPPER([Description]) LIKE UPPER(@Like) OR UPPER([SenderCompany]) LIKE UPPER(@Like) OR UPPER([AddressedTo]) LIKE UPPER(@Like) OR UPPER([Department]) LIKE UPPER(@Like))`);
  if (filters.category) parts.push(`[SenderCategory] = @Category`);
  if (filters.department) parts.push(`UPPER([Department]) = UPPER(@Department)`);
  if (filters.type) parts.push(`[CorrespondenceType] = @Type`);
  if (filters.status) parts.push(`[DisplayStatus] = @Status`);
  if (filters.from) parts.push(`[ActivityDate] >= @FromDate`);
  if (filters.to) parts.push(`[ActivityDate] <= @ToDate`);
  if (filters.participantOnly) parts.push('[Participant] = 1');
  if (includeTab) {
    if (filters.tab === 'incoming') parts.push(`[Direction] = N'Incoming'`);
    if (filters.tab === 'outgoing') parts.push(`[Direction] = N'Outgoing'`);
    if (filters.tab === 'assigned') parts.push(`(UPPER([AssignedEmployeeCode]) = UPPER(@EmployeeCode) OR [RouteAssigned] = 1)`);
    if (filters.tab === 'pending') parts.push(`[Status] = N'Open'`);
    if (filters.tab === 'overdue') parts.push(`[DisplayStatus] = N'Overdue'`);
    if (filters.tab === 'closed') parts.push(`[Status] = N'Closed'`);
  }
  return parts.join(' AND ');
};

const number = (value: unknown) => Number(value) || 0;

export const parseOverviewFilters = (params: URLSearchParams, employeeCode: string): OverviewFilters => {
  const tab = TABS.includes(params.get('tab') as OverviewTab) ? params.get('tab') as OverviewTab : 'all';
  const year = Number(params.get('year')) || new Date().getFullYear();
  const pageSize = Math.min(250, Math.max(5, Number(params.get('pageSize')) || 10));
  const sort = SORTS[params.get('sort') || ''] ? params.get('sort') || 'date' : 'date';
  return {
    tab,
    q: clean(params.get('q'), 120),
    category: SENDER_CATEGORIES.includes(params.get('category') as (typeof SENDER_CATEGORIES)[number]) ? String(params.get('category')) : '',
    department: clean(params.get('department'), 120),
    type: CORRESPONDENCE_TYPES.includes(params.get('type') as (typeof CORRESPONDENCE_TYPES)[number]) ? String(params.get('type')) : '',
    status: ['New', 'Assigned', 'In Progress', 'Overdue', 'Closed'].includes(String(params.get('status'))) ? String(params.get('status')) : '',
    from: /^\d{4}-\d{2}-\d{2}$/.test(String(params.get('from') || '')) ? String(params.get('from')) : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(String(params.get('to') || '')) ? String(params.get('to')) : '',
    year: year >= 2000 && year <= 2100 ? year : new Date().getFullYear(),
    departmentRange: params.get('departmentRange') === 'year' ? 'year' : 'month',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize,
    sort,
    direction: params.get('direction') === 'asc' ? 'asc' : 'desc',
    employeeCode: clean(employeeCode, 40),
    participantOnly: false,
  };
};

export const loadCorporateOfficeOverview = async (filters: OverviewFilters) => {
  const pool = await ensureFrontDeskDb();
  const today = todayISO();
  const bounds = monthBounds(today);
  const kpiRequest = pool.request();
  kpiRequest.input('Today', sql.Date, new Date(`${today}T12:00:00.000Z`));
  kpiRequest.input('MonthStart', sql.Date, new Date(`${bounds.start}T12:00:00.000Z`));
  kpiRequest.input('LastMonthStart', sql.Date, new Date(`${bounds.previous}T12:00:00.000Z`));
  kpiRequest.input('NextMonth', sql.Date, new Date(`${bounds.next}T12:00:00.000Z`));
  kpiRequest.input('EmployeeCode', sql.NVarChar(40), filters.employeeCode);
  const participantWhere = filters.participantOnly ? `WHERE ${participantOnTable}` : '';
  const kpis = await kpiRequest.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN [Direction] = N'Incoming' THEN 1 ELSE 0 END) AS incoming,
      SUM(CASE WHEN [Direction] = N'Outgoing' THEN 1 ELSE 0 END) AS outgoing,
      SUM(CASE WHEN [Status] = N'Open' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN [Status] = N'Open' AND [DueDate] IS NOT NULL AND [DueDate] < @Today THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN [DateReceived] >= @MonthStart AND [DateReceived] < @NextMonth THEN 1 ELSE 0 END) AS totalThis,
      SUM(CASE WHEN [DateReceived] >= @LastMonthStart AND [DateReceived] < @MonthStart THEN 1 ELSE 0 END) AS totalPrev,
      SUM(CASE WHEN [Direction] = N'Incoming' AND [DateReceived] >= @MonthStart AND [DateReceived] < @NextMonth THEN 1 ELSE 0 END) AS incomingThis,
      SUM(CASE WHEN [Direction] = N'Incoming' AND [DateReceived] >= @LastMonthStart AND [DateReceived] < @MonthStart THEN 1 ELSE 0 END) AS incomingPrev,
      SUM(CASE WHEN [Direction] = N'Outgoing' AND COALESCE([DateSent], [DateReceived]) >= @MonthStart AND COALESCE([DateSent], [DateReceived]) < @NextMonth THEN 1 ELSE 0 END) AS outgoingThis,
      SUM(CASE WHEN [Direction] = N'Outgoing' AND COALESCE([DateSent], [DateReceived]) >= @LastMonthStart AND COALESCE([DateSent], [DateReceived]) < @MonthStart THEN 1 ELSE 0 END) AS outgoingPrev,
      SUM(CASE WHEN [CreatedAt] < @MonthStart AND ([Status] = N'Open' OR [DateClosed] >= @MonthStart) THEN 1 ELSE 0 END) AS pendingPrev,
      SUM(CASE WHEN [DueDate] IS NOT NULL AND [DueDate] < @LastMonthStart AND [CreatedAt] < @MonthStart AND ([Status] = N'Open' OR [DateClosed] >= @MonthStart) THEN 1 ELSE 0 END) AS overduePrev
    FROM [corporate].[FrontDeskCorrespondence]
    ${participantWhere}
  `);
  const kpi = (kpis.recordset[0] || {}) as Record<string, unknown>;

  const trendRequest = pool.request();
  trendRequest.input('Year', sql.Int, filters.year);
  trendRequest.input('EmployeeCode', sql.NVarChar(40), filters.employeeCode);
  const trendParticipant = filters.participantOnly ? `AND ${participantOnTable}` : '';
  const trend = await trendRequest.query(`
    SELECT MONTH(COALESCE(CASE WHEN [Direction] = N'Outgoing' THEN [DateSent] END, [DateReceived])) AS [MonthNo],
           [Direction],
           COUNT(*) AS [Total]
    FROM [corporate].[FrontDeskCorrespondence]
    WHERE YEAR(COALESCE(CASE WHEN [Direction] = N'Outgoing' THEN [DateSent] END, [DateReceived])) = @Year
      ${trendParticipant}
    GROUP BY MONTH(COALESCE(CASE WHEN [Direction] = N'Outgoing' THEN [DateSent] END, [DateReceived])), [Direction]
  `);

  const departmentFrom = filters.departmentRange === 'year' ? `${filters.year}-01-01` : bounds.start;
  const departmentTo = filters.departmentRange === 'year' ? `${filters.year + 1}-01-01` : bounds.next;
  const departmentRequest = pool.request();
  departmentRequest.input('FromDate', sql.Date, new Date(`${departmentFrom}T12:00:00.000Z`));
  departmentRequest.input('ToDate', sql.Date, new Date(`${departmentTo}T12:00:00.000Z`));
  departmentRequest.input('EmployeeCode', sql.NVarChar(40), filters.employeeCode);
  const departmentParticipant = filters.participantOnly ? `AND ${participantOnTable}` : '';
  const departments = await departmentRequest.query(`
    SELECT [Department] AS [Name], COUNT(*) AS [Total]
    FROM [corporate].[FrontDeskCorrespondence]
    WHERE [DateReceived] >= @FromDate AND [DateReceived] < @ToDate
      ${departmentParticipant}
    GROUP BY [Department]
    ORDER BY COUNT(*) DESC, [Department]
  `);

  const countRequest = pool.request();
  bind(countRequest, filters, today);
  const counts = await countRequest.query(`
    ${baseCte}
    SELECT
      COUNT(*) AS TotalAll,
      SUM(CASE WHEN [Direction] = N'Incoming' THEN 1 ELSE 0 END) AS IncomingCount,
      SUM(CASE WHEN [Direction] = N'Outgoing' THEN 1 ELSE 0 END) AS OutgoingCount,
      SUM(CASE WHEN UPPER([AssignedEmployeeCode]) = UPPER(@EmployeeCode) OR [RouteAssigned] = 1 THEN 1 ELSE 0 END) AS AssignedCount,
      SUM(CASE WHEN [Status] = N'Open' THEN 1 ELSE 0 END) AS PendingCount,
      SUM(CASE WHEN [DisplayStatus] = N'Overdue' THEN 1 ELSE 0 END) AS OverdueCount,
      SUM(CASE WHEN [Status] = N'Closed' THEN 1 ELSE 0 END) AS ClosedCount
    FROM [office]
    WHERE ${whereSql(filters, false)}
  `);
  const tabCounts = (counts.recordset[0] || {}) as Record<string, unknown>;

  const sortColumn = SORTS[filters.sort] || '[ActivityDate]';
  const sortDirection = filters.direction === 'asc' ? 'ASC' : 'DESC';
  const pageWhere = whereSql(filters, true);
  const totalForTab = pool.request();
  bind(totalForTab, filters, today);
  const filteredCount = await totalForTab.query(`${baseCte} SELECT COUNT(*) AS total FROM [office] WHERE ${pageWhere}`);
  const total = number((filteredCount.recordset[0] as { total?: number } | undefined)?.total);
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pages);
  const pageRequest = pool.request();
  bind(pageRequest, filters, today);
  pageRequest.input('Offset', sql.Int, (page - 1) * filters.pageSize);
  pageRequest.input('PageSize', sql.Int, filters.pageSize);
  const rows = await pageRequest.query(`
    ${baseCte}
    SELECT [CorrespondenceId], [ReferenceNo], [Direction], [ActivityDate], [SenderCompany], [SubjectLabel],
           [Department], [DisplayStatus], [Priority], [DueDate], [AssignedEmployeeName]
    FROM [office]
    WHERE ${pageWhere}
    ORDER BY ${sortColumn} ${sortDirection}, [ReferenceNo] DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
  `);

  const pendingRequest = pool.request();
  pendingRequest.input('EmployeeCode', sql.NVarChar(40), filters.employeeCode);
  pendingRequest.input('Today', sql.Date, new Date(`${today}T12:00:00.000Z`));
  const pending = filters.employeeCode
    ? await pendingRequest.query(`
        ${baseCte}
        SELECT TOP 8 [CorrespondenceId], [ReferenceNo], [SubjectLabel], [DueDate], [Priority], [DisplayStatus]
        FROM [office]
        WHERE [Status] = N'Open' AND (${filters.participantOnly ? '[Participant] = 1' : 'UPPER([AssignedEmployeeCode]) = UPPER(@EmployeeCode) OR [RouteAssigned] = 1'})
        ORDER BY CASE WHEN [DueDate] IS NULL THEN 1 ELSE 0 END, [DueDate], [ReferenceNo]
      `)
    : { recordset: [] };

  let directoryDepartments: string[] = [];
  try {
    const directory = await pool.request().query(`
      SELECT DISTINCT LTRIM(RTRIM([department])) AS [Name]
      FROM [hris].[EmployeeMasterView]
      WHERE [department] IS NOT NULL AND LTRIM(RTRIM([department])) <> N''
      ORDER BY [Name]
    `);
    directoryDepartments = (directory.recordset as { Name?: string }[]).map((row) => clean(row.Name, 120)).filter(Boolean);
  } catch {
    directoryDepartments = [];
  }
  let structureDepartments: string[] = [];
  try {
    const structure = await pool.request().query(`
      SELECT DISTINCT LTRIM(RTRIM([Name])) AS [Name]
      FROM [hris].[OrganizationDepartments]
      WHERE [Name] IS NOT NULL AND LTRIM(RTRIM([Name])) <> N'' AND LTRIM(RTRIM([Name])) <> N'Unassigned Department'
    `);
    structureDepartments = (structure.recordset as { Name?: string }[]).map((row) => clean(row.Name, 120)).filter(Boolean);
  } catch {
    structureDepartments = [];
  }
  const departmentOptions = uniqueLabels(structureDepartments.length ? structureDepartments : directoryDepartments);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lastMonth = filters.year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
  const trendRows = monthNames.slice(0, lastMonth).map((name, index) => ({ name, incoming: 0, outgoing: 0 }));
  for (const row of trend.recordset as { MonthNo?: number; Direction?: string; Total?: number }[]) {
    const bucket = trendRows[(Number(row.MonthNo) || 1) - 1];
    if (!bucket) continue;
    if (row.Direction === 'Outgoing') bucket.outgoing += number(row.Total);
    else bucket.incoming += number(row.Total);
  }
  const departmentTotal = (departments.recordset as { Total?: number }[]).reduce((sum, row) => sum + number(row.Total), 0);

  const card = (current: number, previous: number) => ({ total: current, change: percentChange(current, previous) });

  return {
    kpis: {
      total: { total: number(kpi.total), change: percentChange(number(kpi.totalThis), number(kpi.totalPrev)) },
      incoming: { total: number(kpi.incoming), change: percentChange(number(kpi.incomingThis), number(kpi.incomingPrev)) },
      outgoing: { total: number(kpi.outgoing), change: percentChange(number(kpi.outgoingThis), number(kpi.outgoingPrev)) },
      pending: card(number(kpi.pending), number(kpi.pendingPrev)),
      overdue: card(number(kpi.overdue), number(kpi.overduePrev)),
    },
    tabs: {
      all: number(tabCounts.TotalAll),
      incoming: number(tabCounts.IncomingCount),
      outgoing: number(tabCounts.OutgoingCount),
      assigned: number(tabCounts.AssignedCount),
      pending: number(tabCounts.PendingCount),
      overdue: number(tabCounts.OverdueCount),
      closed: number(tabCounts.ClosedCount),
    },
    trend: trendRows,
    departments: (departments.recordset as { Name?: string; Total?: number }[]).map((row) => ({
      name: clean(row.Name, 120) || 'Unassigned',
      count: number(row.Total),
      percent: departmentTotal ? Math.round((number(row.Total) / departmentTotal) * 100) : 0,
    })),
    departmentTotal,
    rows: (rows.recordset as Record<string, unknown>[]).map((row) => ({
      id: clean(row.CorrespondenceId, 40),
      referenceNo: clean(row.ReferenceNo, 40),
      direction: clean(row.Direction, 20),
      date: row.ActivityDate instanceof Date
        ? `${row.ActivityDate.getUTCFullYear()}-${String(row.ActivityDate.getUTCMonth() + 1).padStart(2, '0')}-${String(row.ActivityDate.getUTCDate()).padStart(2, '0')}`
        : clean(row.ActivityDate, 10),
      party: clean(row.SenderCompany, 300),
      subject: clean(row.SubjectLabel, 500),
      department: clean(row.Department, 120),
      status: clean(row.DisplayStatus, 40),
      priority: clean(row.Priority, 20),
      dueDate: row.DueDate ? clean(row.DueDate instanceof Date ? row.DueDate.toISOString() : row.DueDate, 10) : '',
      assignee: clean(row.AssignedEmployeeName, 180),
    })),
    page,
    pageSize: filters.pageSize,
    total,
    pages,
    pending: (pending.recordset as Record<string, unknown>[]).map((row) => ({
      id: clean(row.CorrespondenceId, 40),
      referenceNo: clean(row.ReferenceNo, 40),
      subject: clean(row.SubjectLabel, 500),
      dueDate: row.DueDate instanceof Date
        ? `${row.DueDate.getUTCFullYear()}-${String(row.DueDate.getUTCMonth() + 1).padStart(2, '0')}-${String(row.DueDate.getUTCDate()).padStart(2, '0')}`
        : clean(row.DueDate, 10),
      priority: clean(row.Priority, 20) || 'Medium',
      status: clean(row.DisplayStatus, 40),
    })),
    departmentsOptions: departmentOptions,
    access: filters.participantOnly ? 'participant' as const : 'full' as const,
  };
};

export const searchCorporateEmployees = async (query: string, department = '') => {
  const pool = await ensureFrontDeskDb();
  const q = clean(query, 80);
  if (q.length < 2) return [];
  try {
  const request = pool.request();
  request.input('Like', sql.NVarChar(100), `%${q.replace(/[%_[\]]/g, '')}%`);
  request.input('Department', sql.NVarChar(120), clean(department, 120));
  const result = await request.query(`
    SELECT TOP 12 [employee_code] AS [Code], [full_name] AS [Name], [department] AS [Department],
           [job_title] AS [Title], [work_location] AS [Location]
    FROM [hris].[EmployeeMasterView]
    WHERE UPPER([full_name]) LIKE UPPER(@Like) OR UPPER([employee_code]) LIKE UPPER(@Like)
    ORDER BY CASE WHEN @Department <> N'' AND UPPER(LTRIM(RTRIM([department]))) = UPPER(@Department) THEN 0 ELSE 1 END, [full_name]
  `);
  return (result.recordset as Record<string, unknown>[]).map((row) => ({
    code: clean(row.Code, 40),
    name: clean(row.Name, 180),
    department: clean(row.Department, 120),
    title: clean(row.Title, 180),
    location: clean(row.Location, 180),
  })).filter((row) => row.code && row.name);
  } catch {
    return [];
  }
};

export const resolveCorporateEmployee = async (employeeCode: string) => {
  const pool = await ensureFrontDeskDb();
  try {
  const request = pool.request();
  request.input('Code', sql.NVarChar(40), clean(employeeCode, 40));
  const result = await request.query(`
    SELECT TOP 1 [employee_code] AS [Code], [full_name] AS [Name], [department] AS [Department]
    FROM [hris].[EmployeeMasterView]
    WHERE UPPER([employee_code]) = UPPER(@Code)
  `);
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { code: clean(row.Code, 40), name: clean(row.Name, 180), department: clean(row.Department, 120) };
  } catch {
    return null;
  }
};

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

const personByName = async (pool: sql.ConnectionPool, name: string, department: string) => {
  const label = clean(name, 180);
  if (!label || /unassigned/i.test(label)) return null;
  const request = pool.request();
  request.input('Name', sql.NVarChar(180), label);
  request.input('Department', sql.NVarChar(120), clean(department, 120));
  const result = await request.query(`
    SELECT TOP 1 [employee_code] AS [Code], [full_name] AS [Name], [department] AS [Department]
    FROM [hris].[EmployeeMasterView]
    WHERE UPPER(LTRIM(RTRIM([full_name]))) = UPPER(@Name) OR UPPER(LTRIM(RTRIM([employee_code]))) = UPPER(@Name)
    ORDER BY CASE WHEN @Department <> N'' AND UPPER(LTRIM(RTRIM([department]))) = UPPER(@Department) THEN 0 ELSE 1 END, [full_name]
  `);
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return { code: clean(row.Code, 40), name: clean(row.Name, 180), department: clean(row.Department, 120) };
};

const resolveOrganizationLeader = async (pool: sql.ConnectionPool, leader: string, department: string) => {
  const raw = clean(leader, 220);
  if (!raw || /unassigned/i.test(raw)) return null;
  const [codePart, ...rest] = raw.split(' - ');
  const code = clean(codePart, 40);
  const candidates = [code];
  if (/^\d+$/.test(code)) {
    const trimmed = code.replace(/^0+/, '');
    candidates.push(`P${code}`, trimmed, `P${trimmed}`);
  }
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    const person = await resolveCorporateEmployee(candidate);
    if (person) return person;
  }
  const remainder = rest.join(' - ').replace(/^(mr|mrs|ms|miss|engr|dr)\.?\s+/i, '').trim();
  const named = await personByName(pool, remainder, department);
  if (named) return named;
  if (!remainder || remainder.includes(' ')) return null;
  const request = pool.request();
  request.input('Like', sql.NVarChar(180), `%${remainder.replace(/[%_[\]]/g, '')}%`);
  request.input('Department', sql.NVarChar(120), clean(department, 120));
  const result = await request.query(`
    SELECT TOP 5 [employee_code] AS [Code], [full_name] AS [Name], [department] AS [Department]
    FROM [hris].[EmployeeMasterView]
    WHERE UPPER([full_name]) LIKE UPPER(@Like)
    ORDER BY CASE WHEN @Department <> N'' AND UPPER(LTRIM(RTRIM([department]))) = UPPER(@Department) THEN 0 ELSE 1 END, [full_name]
  `);
  const rows = (result.recordset as Record<string, unknown>[]).map((row) => ({
    code: clean(row.Code, 40),
    name: clean(row.Name, 180),
    department: clean(row.Department, 120),
  })).filter((row) => row.code && row.name);
  const inDepartment = rows.filter((row) => row.department.toLowerCase() === department.toLowerCase());
  if (inDepartment.length === 1) return inDepartment[0];
  if (rows.length === 1) return rows[0];
  return null;
};

export const lookupDepartmentHead = async (department: string) => {
  const name = clean(department, 120);
  if (!name) return null;
  const pool = await ensureFrontDeskDb();
  try {
    const leaderRequest = pool.request();
    leaderRequest.input('Department', sql.NVarChar(180), name);
    const leader = await leaderRequest.query(`
      SELECT TOP 1 [Leader]
      FROM [hris].[OrganizationDepartments]
      WHERE UPPER(LTRIM(RTRIM([Name]))) = UPPER(@Department) AND LTRIM(RTRIM(ISNULL([Leader], N''))) <> N''
    `);
    const leaderName = clean((leader.recordset[0] as { Leader?: string } | undefined)?.Leader, 220);
    const fromStructure = await resolveOrganizationLeader(pool, leaderName, name);
    if (fromStructure) return fromStructure;
    const headRequest = pool.request();
    headRequest.input('Department', sql.NVarChar(120), name);
    const heads = await headRequest.query(`
      SELECT TOP 1 LTRIM(RTRIM(j.[department_head])) AS [HodName]
      FROM [hris].[EmployeeJobInfo] j
      INNER JOIN [hris].[EmployeeMasterView] v ON v.[employee_id] = j.[employee_id]
      WHERE UPPER(LTRIM(RTRIM(ISNULL(v.[department], N'')))) = UPPER(@Department)
        AND LTRIM(RTRIM(ISNULL(j.[department_head], N''))) <> N''
      GROUP BY LTRIM(RTRIM(j.[department_head]))
      ORDER BY COUNT(*) DESC
    `);
    return personByName(pool, clean((heads.recordset[0] as { HodName?: string } | undefined)?.HodName, 180), name);
  } catch {
    return null;
  }
};

export const listFrontDeskDirectories = async () => {
  const pool = await ensureFrontDeskDb();
  let departments: string[] = [];
  let locations: string[] = [];
  try {
    const structure = await pool.request().query(`
      SELECT DISTINCT LTRIM(RTRIM([Name])) AS [Name]
      FROM [hris].[OrganizationDepartments]
      WHERE [Name] IS NOT NULL AND LTRIM(RTRIM([Name])) <> N'' AND LTRIM(RTRIM([Name])) <> N'Unassigned Department'
    `);
    departments = (structure.recordset as { Name?: string }[]).map((row) => clean(row.Name, 120));
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
      departments = (directory.recordset as { Name?: string }[]).map((row) => clean(row.Name, 120));
    } catch {
      departments = [];
    }
  }
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
  return {
    departments: uniqueLabels(departments),
    locations: uniqueLabels(locations),
  };
};
