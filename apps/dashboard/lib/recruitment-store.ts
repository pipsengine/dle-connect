/**
 * Recruitment Management store — MSSQL [hris] tables.
 * Server-only. Client UIs import recruitment-shared.
 */
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import type {
  ApplicationRecord,
  ApprovalEventRecord,
  BackgroundCheckRecord,
  CandidateRecord,
  InterviewRecord,
  JobPostingRecord,
  JobRequisitionRecord,
  ManpowerRequestRecord,
  OfferRecord,
  RecruitmentBudgetStatus,
  RecruitmentKpis,
  RecruitmentPayload,
  RecruitmentWorkflowStatus,
  TalentPoolRecord,
} from '@/lib/recruitment-shared';

export type {
  ManpowerRequestRecord,
  RecruitmentPayload,
} from '@/lib/recruitment-shared';

const dbReady = { value: false };
const str = (value: unknown) => String(value || '').trim();
const compact = str;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const iso = (value: unknown) => {
  const raw = str(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw.slice(0, 19) : date.toISOString();
};
const isoDate = (value: unknown) => {
  const full = iso(value);
  return full ? full.slice(0, 10) : null;
};
const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return null;
  if (!dbReady.value) {
    await pool.request().query(`
IF SCHEMA_ID(N'hris') IS NULL EXEC(N'CREATE SCHEMA [hris]');

IF OBJECT_ID(N'[hris].[RecruitmentManpowerRequest]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentManpowerRequest] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentManpowerRequest] PRIMARY KEY,
  [RequestNo] NVARCHAR(40) NOT NULL,
  [RequestType] NVARCHAR(40) NOT NULL CONSTRAINT [DF_RecManpower_Type] DEFAULT N'New Position',
  [Department] NVARCHAR(180) NOT NULL,
  [PositionTitle] NVARCHAR(180) NOT NULL,
  [EmploymentType] NVARCHAR(40) NOT NULL,
  [Headcount] INT NOT NULL,
  [NeedDate] DATE NULL,
  [Priority] NVARCHAR(20) NOT NULL CONSTRAINT [DF_RecManpower_Priority] DEFAULT N'Medium',
  [WorkLocation] NVARCHAR(120) NULL,
  [Grade] NVARCHAR(40) NULL,
  [Project] NVARCHAR(180) NULL,
  [CostCentre] NVARCHAR(80) NULL,
  [Budgeted] BIT NOT NULL CONSTRAINT [DF_RecManpower_Budgeted] DEFAULT 0,
  [EstimatedAnnualCost] DECIMAL(19,2) NULL,
  [Currency] CHAR(3) NOT NULL CONSTRAINT [DF_RecManpower_Currency] DEFAULT 'NGN',
  [ReplacementEmployee] NVARCHAR(180) NULL,
  [BusinessJustification] NVARCHAR(MAX) NULL,
  [BudgetStatus] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecManpower_Budget] DEFAULT N'Pending',
  [WorkflowStatus] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecManpower_Workflow] DEFAULT N'Draft',
  [CreatedBy] NVARCHAR(180) NOT NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecManpower_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecManpower_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedBy] NVARCHAR(180) NULL,
  CONSTRAINT [UQ_RecruitmentManpowerRequest_No] UNIQUE ([RequestNo])
);
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'RequestType') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [RequestType] NVARCHAR(40) NOT NULL CONSTRAINT [DF_RecManpower_Type2] DEFAULT N'New Position';
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'Priority') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [Priority] NVARCHAR(20) NOT NULL CONSTRAINT [DF_RecManpower_Priority2] DEFAULT N'Medium';
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'WorkLocation') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [WorkLocation] NVARCHAR(120) NULL;
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'Grade') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [Grade] NVARCHAR(40) NULL;
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'Project') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [Project] NVARCHAR(180) NULL;
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'CostCentre') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [CostCentre] NVARCHAR(80) NULL;
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'Budgeted') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [Budgeted] BIT NOT NULL CONSTRAINT [DF_RecManpower_Budgeted2] DEFAULT 0;
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'EstimatedAnnualCost') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [EstimatedAnnualCost] DECIMAL(19,2) NULL;
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'Currency') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [Currency] CHAR(3) NOT NULL CONSTRAINT [DF_RecManpower_Currency2] DEFAULT 'NGN';
IF COL_LENGTH(N'[hris].[RecruitmentManpowerRequest]', N'ReplacementEmployee') IS NULL ALTER TABLE [hris].[RecruitmentManpowerRequest] ADD [ReplacementEmployee] NVARCHAR(180) NULL;

IF OBJECT_ID(N'[hris].[RecruitmentRequisition]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentRequisition] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentRequisition] PRIMARY KEY,
  [RequisitionNo] NVARCHAR(40) NOT NULL,
  [ManpowerRequestId] NVARCHAR(80) NULL,
  [JobTitle] NVARCHAR(180) NOT NULL,
  [Department] NVARCHAR(180) NOT NULL,
  [Openings] INT NOT NULL,
  [HiringManager] NVARCHAR(180) NULL,
  [Priority] NVARCHAR(20) NOT NULL CONSTRAINT [DF_RecReq_Priority] DEFAULT N'Medium',
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecReq_Status] DEFAULT N'Draft',
  [OpenDate] DATE NULL,
  [CloseDate] DATE NULL,
  [JobDescription] NVARCHAR(MAX) NULL,
  [Requirements] NVARCHAR(MAX) NULL,
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecReq_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecReq_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_RecruitmentRequisition_No] UNIQUE ([RequisitionNo])
);

IF OBJECT_ID(N'[hris].[RecruitmentJobPosting]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentJobPosting] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentJobPosting] PRIMARY KEY,
  [PostingNo] NVARCHAR(40) NOT NULL,
  [RequisitionId] NVARCHAR(80) NOT NULL,
  [JobTitle] NVARCHAR(180) NOT NULL,
  [Channels] NVARCHAR(300) NOT NULL,
  [PublishedAt] DATETIME2 NULL,
  [ClosingDate] DATE NULL,
  [Applicants] INT NOT NULL CONSTRAINT [DF_RecPost_Applicants] DEFAULT 0,
  [Views] INT NOT NULL CONSTRAINT [DF_RecPost_Views] DEFAULT 0,
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecPost_Status] DEFAULT N'Draft',
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecPost_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecPost_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_RecruitmentJobPosting_No] UNIQUE ([PostingNo])
);

IF OBJECT_ID(N'[hris].[RecruitmentCandidate]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentCandidate] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentCandidate] PRIMARY KEY,
  [CandidateNo] NVARCHAR(40) NOT NULL,
  [FirstName] NVARCHAR(80) NOT NULL,
  [LastName] NVARCHAR(80) NOT NULL,
  [Email] NVARCHAR(180) NULL,
  [Phone] NVARCHAR(50) NULL,
  [CurrentTitle] NVARCHAR(150) NULL,
  [YearsExperience] DECIMAL(5,1) NULL,
  [HighestQualification] NVARCHAR(100) NULL,
  [Source] NVARCHAR(80) NULL,
  [ConsentAt] DATETIME2 NULL,
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecCand_Status] DEFAULT N'Active',
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecCand_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecCand_UpdatedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_RecruitmentCandidate_No] UNIQUE ([CandidateNo])
);

IF OBJECT_ID(N'[hris].[RecruitmentApplication]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentApplication] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentApplication] PRIMARY KEY,
  [CandidateId] NVARCHAR(80) NOT NULL,
  [RequisitionId] NVARCHAR(80) NOT NULL,
  [Stage] NVARCHAR(40) NOT NULL CONSTRAINT [DF_RecApp_Stage] DEFAULT N'Applied',
  [ScreeningScore] DECIMAL(5,2) NULL,
  [RecruiterDecision] NVARCHAR(30) NULL,
  [AppliedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecApp_AppliedAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [UQ_RecruitmentApplication] UNIQUE ([CandidateId], [RequisitionId])
);

IF OBJECT_ID(N'[hris].[RecruitmentInterview]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentInterview] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentInterview] PRIMARY KEY,
  [ApplicationId] NVARCHAR(80) NOT NULL,
  [RoundNo] INT NOT NULL,
  [ScheduledAt] DATETIME2 NULL,
  [Mode] NVARCHAR(30) NULL,
  [VenueOrMeeting] NVARCHAR(300) NULL,
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecInt_Status] DEFAULT N'Scheduled'
);

IF OBJECT_ID(N'[hris].[RecruitmentInterviewEvaluation]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentInterviewEvaluation] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentInterviewEvaluation] PRIMARY KEY,
  [InterviewId] NVARCHAR(80) NOT NULL,
  [EvaluatorName] NVARCHAR(180) NOT NULL,
  [TechnicalScore] DECIMAL(5,2) NULL,
  [BehaviouralScore] DECIMAL(5,2) NULL,
  [ValuesScore] DECIMAL(5,2) NULL,
  [OverallScore] DECIMAL(5,2) NULL,
  [Recommendation] NVARCHAR(30) NULL,
  [Comments] NVARCHAR(MAX) NULL,
  [SubmittedAt] DATETIME2 NULL
);

IF OBJECT_ID(N'[hris].[RecruitmentOffer]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentOffer] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentOffer] PRIMARY KEY,
  [ApplicationId] NVARCHAR(80) NOT NULL,
  [OfferVersion] INT NOT NULL CONSTRAINT [DF_RecOffer_Version] DEFAULT 1,
  [Grade] NVARCHAR(40) NULL,
  [Currency] CHAR(3) NOT NULL CONSTRAINT [DF_RecOffer_Currency] DEFAULT 'NGN',
  [BasePay] DECIMAL(19,2) NULL,
  [TotalPackage] DECIMAL(19,2) NULL,
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecOffer_Status] DEFAULT N'Draft',
  [IssuedAt] DATETIME2 NULL,
  [ExpiresAt] DATETIME2 NULL,
  [AcceptedAt] DATETIME2 NULL
);

IF OBJECT_ID(N'[hris].[RecruitmentBackgroundCheck]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentBackgroundCheck] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentBackgroundCheck] PRIMARY KEY,
  [ApplicationId] NVARCHAR(80) NOT NULL,
  [CheckType] NVARCHAR(60) NOT NULL,
  [Provider] NVARCHAR(120) NULL,
  [Status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_RecBg_Status] DEFAULT N'Not Started',
  [RiskRating] NVARCHAR(20) NULL,
  [StartedAt] DATETIME2 NULL,
  [CompletedAt] DATETIME2 NULL,
  [Notes] NVARCHAR(MAX) NULL
);

IF OBJECT_ID(N'[hris].[RecruitmentApprovalEvent]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentApprovalEvent] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentApprovalEvent] PRIMARY KEY,
  [EntityType] NVARCHAR(50) NOT NULL,
  [EntityId] NVARCHAR(80) NOT NULL,
  [Stage] NVARCHAR(50) NOT NULL,
  [Action] NVARCHAR(30) NOT NULL,
  [Actor] NVARCHAR(180) NOT NULL,
  [Comment] NVARCHAR(1000) NULL,
  [ActionAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecAppr_ActionAt] DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'[hris].[RecruitmentTalentPool]', N'U') IS NULL
CREATE TABLE [hris].[RecruitmentTalentPool] (
  [Id] NVARCHAR(80) NOT NULL CONSTRAINT [PK_RecruitmentTalentPool] PRIMARY KEY,
  [CandidateId] NVARCHAR(80) NOT NULL,
  [PoolName] NVARCHAR(100) NOT NULL,
  [PrimarySkill] NVARCHAR(120) NULL,
  [Availability] NVARCHAR(40) NULL,
  [TalentScore] DECIMAL(5,2) NULL,
  [AddedAt] DATETIME2 NOT NULL CONSTRAINT [DF_RecTalent_AddedAt] DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RecruitmentApplication_Requisition' AND object_id = OBJECT_ID(N'[hris].[RecruitmentApplication]'))
  CREATE INDEX [IX_RecruitmentApplication_Requisition] ON [hris].[RecruitmentApplication]([RequisitionId], [Stage]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RecruitmentApprovalEvent_Entity' AND object_id = OBJECT_ID(N'[hris].[RecruitmentApprovalEvent]'))
  CREATE INDEX [IX_RecruitmentApprovalEvent_Entity] ON [hris].[RecruitmentApprovalEvent]([EntityType], [EntityId], [ActionAt] DESC);
`);
    dbReady.value = true;
  }
  return pool;
};

const requireDb = async () => {
  const pool = await ensureDb();
  if (!pool) {
    throw new Error('DLE_Enterprise database is not configured. Recruitment write operations require HRIS database persistence.');
  }
  return pool;
};

const mapManpower = (row: Record<string, unknown>): ManpowerRequestRecord => ({
  id: str(row.Id),
  requestNo: str(row.RequestNo),
  requestType: str(row.RequestType) || 'New Position',
  department: str(row.Department),
  positionTitle: str(row.PositionTitle),
  employmentType: str(row.EmploymentType),
  headcount: num(row.Headcount, 1),
  needDate: isoDate(row.NeedDate),
  priority: (str(row.Priority) || 'Medium') as ManpowerRequestRecord['priority'],
  workLocation: str(row.WorkLocation) || null,
  grade: str(row.Grade) || null,
  project: str(row.Project) || null,
  costCentre: str(row.CostCentre) || null,
  budgeted: Boolean(row.Budgeted),
  estimatedAnnualCost: row.EstimatedAnnualCost == null ? null : num(row.EstimatedAnnualCost),
  currency: str(row.Currency) || 'NGN',
  replacementEmployee: str(row.ReplacementEmployee) || null,
  businessJustification: str(row.BusinessJustification) || null,
  budgetStatus: (str(row.BudgetStatus) || 'Pending') as RecruitmentBudgetStatus,
  workflowStatus: (str(row.WorkflowStatus) || 'Draft') as RecruitmentWorkflowStatus,
  createdBy: str(row.CreatedBy),
  createdAt: iso(row.CreatedAt) || new Date().toISOString(),
  updatedAt: iso(row.UpdatedAt) || new Date().toISOString(),
  updatedBy: str(row.UpdatedBy) || null,
});

const emptyKpis = (): RecruitmentKpis => ({
  activeManpower: 0,
  pendingAction: 0,
  awaitingHr: 0,
  financeReview: 0,
  approvedManpower: 0,
  requestedHeadcount: 0,
  budgetExceptions: 0,
  openRequisitions: 0,
  totalApplicants: 0,
  shortlisted: 0,
  activeCandidates: 0,
  applicationsInScreening: 0,
  interviewsScheduled: 0,
  openOffers: 0,
  checksInProgress: 0,
  talentPoolSize: 0,
  avgTimeToHireDays: null,
});

const emptyPayload = (dbConnected: boolean): RecruitmentPayload => ({
  source: dbConnected ? 'DLE_Enterprise HRIS' : 'Database not configured',
  dbConnected,
  kpis: emptyKpis(),
  pipeline: [
    { stage: 'Manpower', count: 0 },
    { stage: 'Requisition', count: 0 },
    { stage: 'Posted', count: 0 },
    { stage: 'Screening', count: 0 },
    { stage: 'Interview', count: 0 },
    { stage: 'Offer', count: 0 },
    { stage: 'Checks', count: 0 },
    { stage: 'Approved', count: 0 },
  ],
  manpowerRequests: [],
  requisitions: [],
  postings: [],
  candidates: [],
  applications: [],
  interviews: [],
  offers: [],
  backgroundChecks: [],
  talentPool: [],
  approvalEvents: [],
});

const writeApprovalEvent = async (
  pool: sql.ConnectionPool,
  input: { entityType: string; entityId: string; stage: string; action: string; actor: string; comment?: string | null },
) => {
  const id = nextId('RAE');
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('EntityType', sql.NVarChar(50), compact(input.entityType))
    .input('EntityId', sql.NVarChar(80), compact(input.entityId))
    .input('Stage', sql.NVarChar(50), compact(input.stage))
    .input('Action', sql.NVarChar(30), compact(input.action))
    .input('Actor', sql.NVarChar(180), compact(input.actor) || 'System')
    .input('Comment', sql.NVarChar(1000), compact(input.comment) || null)
    .query(`
INSERT INTO [hris].[RecruitmentApprovalEvent]
  ([Id], [EntityType], [EntityId], [Stage], [Action], [Actor], [Comment])
VALUES
  (@Id, @EntityType, @EntityId, @Stage, @Action, @Actor, @Comment);`);
  return id;
};

export const readRecruitmentPayload = async (): Promise<RecruitmentPayload> => {
  const pool = await ensureDb();
  if (!pool) return emptyPayload(false);

  const [
    manpowerRs,
    reqRs,
    postRs,
    candRs,
    appRs,
    intRs,
    offerRs,
    bgRs,
    talentRs,
    apprRs,
  ] = await Promise.all([
    pool.request().query(`
SELECT TOP (200) *
FROM [hris].[RecruitmentManpowerRequest]
ORDER BY [UpdatedAt] DESC;`),
    pool.request().query(`
SELECT TOP (200) *
FROM [hris].[RecruitmentRequisition]
ORDER BY [UpdatedAt] DESC;`),
    pool.request().query(`
SELECT TOP (200) p.*, r.[JobTitle] AS ReqTitle
FROM [hris].[RecruitmentJobPosting] p
LEFT JOIN [hris].[RecruitmentRequisition] r ON r.[Id] = p.[RequisitionId]
ORDER BY p.[UpdatedAt] DESC;`),
    pool.request().query(`
SELECT TOP (300) *
FROM [hris].[RecruitmentCandidate]
ORDER BY [UpdatedAt] DESC;`),
    pool.request().query(`
SELECT TOP (300)
  a.*,
  LTRIM(RTRIM(CONCAT(c.[FirstName], N' ', c.[LastName]))) AS CandidateName,
  r.[JobTitle] AS RequisitionTitle
FROM [hris].[RecruitmentApplication] a
LEFT JOIN [hris].[RecruitmentCandidate] c ON c.[Id] = a.[CandidateId]
LEFT JOIN [hris].[RecruitmentRequisition] r ON r.[Id] = a.[RequisitionId]
ORDER BY a.[AppliedAt] DESC;`),
    pool.request().query(`
SELECT TOP (200)
  i.*,
  LTRIM(RTRIM(CONCAT(c.[FirstName], N' ', c.[LastName]))) AS CandidateName,
  r.[JobTitle] AS RequisitionTitle
FROM [hris].[RecruitmentInterview] i
LEFT JOIN [hris].[RecruitmentApplication] a ON a.[Id] = i.[ApplicationId]
LEFT JOIN [hris].[RecruitmentCandidate] c ON c.[Id] = a.[CandidateId]
LEFT JOIN [hris].[RecruitmentRequisition] r ON r.[Id] = a.[RequisitionId]
ORDER BY i.[ScheduledAt] DESC;`),
    pool.request().query(`
SELECT TOP (200)
  o.*,
  LTRIM(RTRIM(CONCAT(c.[FirstName], N' ', c.[LastName]))) AS CandidateName,
  r.[JobTitle] AS PositionTitle
FROM [hris].[RecruitmentOffer] o
LEFT JOIN [hris].[RecruitmentApplication] a ON a.[Id] = o.[ApplicationId]
LEFT JOIN [hris].[RecruitmentCandidate] c ON c.[Id] = a.[CandidateId]
LEFT JOIN [hris].[RecruitmentRequisition] r ON r.[Id] = a.[RequisitionId]
ORDER BY ISNULL(o.[IssuedAt], o.[AcceptedAt]) DESC;`),
    pool.request().query(`
SELECT TOP (200)
  b.*,
  LTRIM(RTRIM(CONCAT(c.[FirstName], N' ', c.[LastName]))) AS CandidateName
FROM [hris].[RecruitmentBackgroundCheck] b
LEFT JOIN [hris].[RecruitmentApplication] a ON a.[Id] = b.[ApplicationId]
LEFT JOIN [hris].[RecruitmentCandidate] c ON c.[Id] = a.[CandidateId]
ORDER BY ISNULL(b.[StartedAt], b.[CompletedAt]) DESC;`),
    pool.request().query(`
SELECT TOP (200)
  t.*,
  LTRIM(RTRIM(CONCAT(c.[FirstName], N' ', c.[LastName]))) AS CandidateName
FROM [hris].[RecruitmentTalentPool] t
LEFT JOIN [hris].[RecruitmentCandidate] c ON c.[Id] = t.[CandidateId]
ORDER BY t.[AddedAt] DESC;`),
    pool.request().query(`
SELECT TOP (100) *
FROM [hris].[RecruitmentApprovalEvent]
ORDER BY [ActionAt] DESC;`),
  ]);

  const manpowerRequests = (manpowerRs.recordset || []).map(mapManpower);
  const requisitions: JobRequisitionRecord[] = (reqRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    requisitionNo: str(row.RequisitionNo),
    manpowerRequestId: str(row.ManpowerRequestId) || null,
    jobTitle: str(row.JobTitle),
    department: str(row.Department),
    openings: num(row.Openings, 1),
    hiringManager: str(row.HiringManager) || null,
    priority: (str(row.Priority) || 'Medium') as JobRequisitionRecord['priority'],
    status: (str(row.Status) || 'Draft') as JobRequisitionRecord['status'],
    openDate: isoDate(row.OpenDate),
    closeDate: isoDate(row.CloseDate),
    jobDescription: str(row.JobDescription) || null,
    requirements: str(row.Requirements) || null,
    createdAt: iso(row.CreatedAt) || '',
    updatedAt: iso(row.UpdatedAt) || '',
  }));

  const postings: JobPostingRecord[] = (postRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    postingNo: str(row.PostingNo),
    requisitionId: str(row.RequisitionId),
    jobTitle: str(row.JobTitle || row.ReqTitle),
    channels: str(row.Channels),
    publishedAt: iso(row.PublishedAt),
    closingDate: isoDate(row.ClosingDate),
    applicants: num(row.Applicants),
    views: num(row.Views),
    status: str(row.Status) || 'Draft',
  }));

  const candidates: CandidateRecord[] = (candRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    candidateNo: str(row.CandidateNo),
    firstName: str(row.FirstName),
    lastName: str(row.LastName),
    email: str(row.Email) || null,
    phone: str(row.Phone) || null,
    currentTitle: str(row.CurrentTitle) || null,
    yearsExperience: row.YearsExperience == null ? null : num(row.YearsExperience),
    highestQualification: str(row.HighestQualification) || null,
    source: str(row.Source) || null,
    consentAt: iso(row.ConsentAt),
    status: (str(row.Status) || 'Active') as CandidateRecord['status'],
    createdAt: iso(row.CreatedAt) || '',
    updatedAt: iso(row.UpdatedAt) || '',
  }));

  const applications: ApplicationRecord[] = (appRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    candidateId: str(row.CandidateId),
    candidateName: str(row.CandidateName) || '—',
    requisitionId: str(row.RequisitionId),
    requisitionTitle: str(row.RequisitionTitle) || '—',
    stage: str(row.Stage) || 'Applied',
    screeningScore: row.ScreeningScore == null ? null : num(row.ScreeningScore),
    recruiterDecision: str(row.RecruiterDecision) || null,
    appliedAt: iso(row.AppliedAt) || '',
  }));

  const interviews: InterviewRecord[] = (intRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    applicationId: str(row.ApplicationId),
    candidateName: str(row.CandidateName) || '—',
    requisitionTitle: str(row.RequisitionTitle) || '—',
    roundNo: num(row.RoundNo, 1),
    scheduledAt: iso(row.ScheduledAt),
    mode: str(row.Mode) || null,
    venueOrMeeting: str(row.VenueOrMeeting) || null,
    status: str(row.Status) || 'Scheduled',
  }));

  const offers: OfferRecord[] = (offerRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    applicationId: str(row.ApplicationId),
    candidateName: str(row.CandidateName) || '—',
    positionTitle: str(row.PositionTitle) || '—',
    offerVersion: num(row.OfferVersion, 1),
    grade: str(row.Grade) || null,
    currency: str(row.Currency) || 'NGN',
    basePay: row.BasePay == null ? null : num(row.BasePay),
    totalPackage: row.TotalPackage == null ? null : num(row.TotalPackage),
    status: str(row.Status) || 'Draft',
    issuedAt: iso(row.IssuedAt),
    expiresAt: iso(row.ExpiresAt),
    acceptedAt: iso(row.AcceptedAt),
  }));

  const backgroundChecks: BackgroundCheckRecord[] = (bgRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    applicationId: str(row.ApplicationId),
    candidateName: str(row.CandidateName) || '—',
    checkType: str(row.CheckType),
    provider: str(row.Provider) || null,
    status: str(row.Status) || 'Not Started',
    riskRating: str(row.RiskRating) || null,
    startedAt: iso(row.StartedAt),
    completedAt: iso(row.CompletedAt),
    notes: str(row.Notes) || null,
  }));

  const talentPool: TalentPoolRecord[] = (talentRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    candidateId: str(row.CandidateId),
    candidateName: str(row.CandidateName) || '—',
    poolName: str(row.PoolName),
    primarySkill: str(row.PrimarySkill) || null,
    availability: str(row.Availability) || null,
    talentScore: row.TalentScore == null ? null : num(row.TalentScore),
    addedAt: iso(row.AddedAt) || '',
  }));

  const approvalEvents: ApprovalEventRecord[] = (apprRs.recordset || []).map((row: Record<string, unknown>) => ({
    id: str(row.Id),
    entityType: str(row.EntityType),
    entityId: str(row.EntityId),
    stage: str(row.Stage),
    action: str(row.Action),
    actor: str(row.Actor),
    comment: str(row.Comment) || null,
    actionAt: iso(row.ActionAt) || '',
  }));

  const kpis: RecruitmentKpis = {
    activeManpower: manpowerRequests.filter((r) => !['Rejected', 'Withdrawn', 'Closed', 'Returned'].includes(r.workflowStatus)).length,
    pendingAction: manpowerRequests.filter((r) => ['Submitted', 'HR Review', 'Finance Review', 'CFO Review', 'MD/CEO Review', 'Under Review'].includes(r.workflowStatus)).length,
    awaitingHr: manpowerRequests.filter((r) => ['Submitted', 'HR Review'].includes(r.workflowStatus)).length,
    financeReview: manpowerRequests.filter((r) => r.workflowStatus === 'Finance Review').length,
    approvedManpower: manpowerRequests.filter((r) => r.workflowStatus === 'Approved').length,
    requestedHeadcount: manpowerRequests.reduce((sum, r) => sum + r.headcount, 0),
    budgetExceptions: manpowerRequests.filter((r) => ['Blocked', 'Pending'].includes(r.budgetStatus) && r.workflowStatus !== 'Draft').length,
    openRequisitions: requisitions.filter((r) => ['Open', 'Approved', 'Submitted', 'Under Review', 'Draft'].includes(r.status)).length,
    totalApplicants: applications.length || postings.reduce((sum, p) => sum + p.applicants, 0),
    shortlisted: applications.filter((a) => /shortlist|interview|offer/i.test(`${a.stage} ${a.recruiterDecision || ''}`)).length,
    activeCandidates: candidates.filter((c) => c.status === 'Active').length,
    applicationsInScreening: applications.filter((a) => /screen|applied|review/i.test(a.stage)).length,
    interviewsScheduled: interviews.filter((i) => /schedul|confirm/i.test(i.status)).length,
    openOffers: offers.filter((o) => !/accepted|declined|withdrawn|expired/i.test(o.status)).length,
    checksInProgress: backgroundChecks.filter((b) => /progress|started|pending/i.test(b.status)).length,
    talentPoolSize: talentPool.length,
    avgTimeToHireDays: null,
  };

  return {
    source: 'DLE_Enterprise HRIS',
    dbConnected: true,
    kpis,
    pipeline: [
      { stage: 'Manpower', count: kpis.activeManpower },
      { stage: 'Requisition', count: kpis.openRequisitions },
      { stage: 'Posted', count: postings.filter((p) => /live|published|open/i.test(p.status)).length },
      { stage: 'Screening', count: kpis.applicationsInScreening },
      { stage: 'Interview', count: kpis.interviewsScheduled },
      { stage: 'Offer', count: kpis.openOffers },
      { stage: 'Checks', count: kpis.checksInProgress },
      { stage: 'Approved', count: kpis.approvedManpower },
    ],
    manpowerRequests,
    requisitions,
    postings,
    candidates,
    applications,
    interviews,
    offers,
    backgroundChecks,
    talentPool,
    approvalEvents,
  };
};

export type CreateManpowerInput = {
  department: string;
  positionTitle: string;
  employmentType: string;
  headcount: number;
  needDate?: string | null;
  requestType?: string;
  priority?: ManpowerRequestRecord['priority'];
  workLocation?: string | null;
  grade?: string | null;
  project?: string | null;
  costCentre?: string | null;
  budgeted?: boolean;
  estimatedAnnualCost?: number | null;
  currency?: string;
  replacementEmployee?: string | null;
  businessJustification?: string | null;
  budgetStatus?: RecruitmentBudgetStatus;
  workflowStatus?: RecruitmentWorkflowStatus;
  actor: string;
};

export const createManpowerRequest = async (input: CreateManpowerInput): Promise<ManpowerRequestRecord> => {
  const pool = await requireDb();
  const department = compact(input.department);
  const positionTitle = compact(input.positionTitle);
  const employmentType = compact(input.employmentType) || 'Permanent';
  const headcount = Math.max(1, Math.floor(num(input.headcount, 1)));
  if (!department) throw new Error('Department is required.');
  if (!positionTitle) throw new Error('Position title is required.');

  const id = nextId('MPR');
  const year = new Date().getFullYear();
  const requestNo = `MPR-${year}-${String(Date.now()).slice(-5)}`;
  const actor = compact(input.actor) || 'System';
  const workflowStatus = (compact(input.workflowStatus) || 'Draft') as RecruitmentWorkflowStatus;
  const budgetStatus = (compact(input.budgetStatus) || 'Pending') as RecruitmentBudgetStatus;

  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('RequestNo', sql.NVarChar(40), requestNo)
    .input('RequestType', sql.NVarChar(40), compact(input.requestType) || 'New Position')
    .input('Department', sql.NVarChar(180), department)
    .input('PositionTitle', sql.NVarChar(180), positionTitle)
    .input('EmploymentType', sql.NVarChar(40), employmentType)
    .input('Headcount', sql.Int, headcount)
    .input('NeedDate', sql.Date, isoDate(input.needDate))
    .input('Priority', sql.NVarChar(20), compact(input.priority) || 'Medium')
    .input('WorkLocation', sql.NVarChar(120), compact(input.workLocation) || null)
    .input('Grade', sql.NVarChar(40), compact(input.grade) || null)
    .input('Project', sql.NVarChar(180), compact(input.project) || null)
    .input('CostCentre', sql.NVarChar(80), compact(input.costCentre) || null)
    .input('Budgeted', sql.Bit, input.budgeted ? 1 : 0)
    .input('EstimatedAnnualCost', sql.Decimal(19, 2), input.estimatedAnnualCost == null ? null : num(input.estimatedAnnualCost))
    .input('Currency', sql.Char(3), compact(input.currency) || 'NGN')
    .input('ReplacementEmployee', sql.NVarChar(180), compact(input.replacementEmployee) || null)
    .input('BusinessJustification', sql.NVarChar(sql.MAX), compact(input.businessJustification) || null)
    .input('BudgetStatus', sql.NVarChar(30), budgetStatus)
    .input('WorkflowStatus', sql.NVarChar(30), workflowStatus)
    .input('CreatedBy', sql.NVarChar(180), actor)
    .input('UpdatedBy', sql.NVarChar(180), actor)
    .query(`
INSERT INTO [hris].[RecruitmentManpowerRequest] (
  [Id], [RequestNo], [RequestType], [Department], [PositionTitle], [EmploymentType], [Headcount],
  [NeedDate], [Priority], [WorkLocation], [Grade], [Project], [CostCentre], [Budgeted],
  [EstimatedAnnualCost], [Currency], [ReplacementEmployee], [BusinessJustification],
  [BudgetStatus], [WorkflowStatus], [CreatedBy], [UpdatedBy]
) VALUES (
  @Id, @RequestNo, @RequestType, @Department, @PositionTitle, @EmploymentType, @Headcount,
  @NeedDate, @Priority, @WorkLocation, @Grade, @Project, @CostCentre, @Budgeted,
  @EstimatedAnnualCost, @Currency, @ReplacementEmployee, @BusinessJustification,
  @BudgetStatus, @WorkflowStatus, @CreatedBy, @UpdatedBy
);`);

  await writeApprovalEvent(pool, {
    entityType: 'ManpowerRequest',
    entityId: id,
    stage: 'Create',
    action: workflowStatus === 'Draft' ? 'Save Draft' : 'Submit',
    actor,
    comment: `Created manpower request ${requestNo}`,
  });

  const rs = await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .query(`SELECT * FROM [hris].[RecruitmentManpowerRequest] WHERE [Id] = @Id;`);
  return mapManpower(rs.recordset[0]);
};

export type UpdateManpowerInput = {
  id: string;
  department?: string;
  positionTitle?: string;
  employmentType?: string;
  headcount?: number;
  needDate?: string | null;
  requestType?: string;
  priority?: ManpowerRequestRecord['priority'];
  workLocation?: string | null;
  grade?: string | null;
  project?: string | null;
  costCentre?: string | null;
  budgeted?: boolean;
  estimatedAnnualCost?: number | null;
  currency?: string;
  replacementEmployee?: string | null;
  businessJustification?: string | null;
  budgetStatus?: RecruitmentBudgetStatus;
  workflowStatus?: RecruitmentWorkflowStatus;
  actor: string;
  comment?: string | null;
};

export const updateManpowerRequest = async (input: UpdateManpowerInput): Promise<ManpowerRequestRecord> => {
  const pool = await requireDb();
  const id = compact(input.id);
  if (!id) throw new Error('Manpower request id is required.');

  const existingRs = await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .query(`SELECT * FROM [hris].[RecruitmentManpowerRequest] WHERE [Id] = @Id;`);
  const existing = existingRs.recordset?.[0];
  if (!existing) throw new Error('Manpower request not found.');

  const department = compact(input.department) || str(existing.Department);
  const positionTitle = compact(input.positionTitle) || str(existing.PositionTitle);
  const employmentType = compact(input.employmentType) || str(existing.EmploymentType);
  const headcount = input.headcount != null ? Math.max(1, Math.floor(num(input.headcount, 1))) : num(existing.Headcount, 1);
  const needDate = input.needDate !== undefined ? isoDate(input.needDate) : isoDate(existing.NeedDate);
  const businessJustification = input.businessJustification !== undefined
    ? (compact(input.businessJustification) || null)
    : (str(existing.BusinessJustification) || null);
  const budgetStatus = (compact(input.budgetStatus) || str(existing.BudgetStatus) || 'Pending') as RecruitmentBudgetStatus;
  const workflowStatus = (compact(input.workflowStatus) || str(existing.WorkflowStatus) || 'Draft') as RecruitmentWorkflowStatus;
  const actor = compact(input.actor) || 'System';

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const req = new sql.Request(transaction);
    await req
      .input('Id', sql.NVarChar(80), id)
      .input('RequestType', sql.NVarChar(40), compact(input.requestType) || str(existing.RequestType) || 'New Position')
      .input('Department', sql.NVarChar(180), department)
      .input('PositionTitle', sql.NVarChar(180), positionTitle)
      .input('EmploymentType', sql.NVarChar(40), employmentType)
      .input('Headcount', sql.Int, headcount)
      .input('NeedDate', sql.Date, needDate)
      .input('Priority', sql.NVarChar(20), compact(input.priority) || str(existing.Priority) || 'Medium')
      .input('WorkLocation', sql.NVarChar(120), input.workLocation !== undefined ? (compact(input.workLocation) || null) : (str(existing.WorkLocation) || null))
      .input('Grade', sql.NVarChar(40), input.grade !== undefined ? (compact(input.grade) || null) : (str(existing.Grade) || null))
      .input('Project', sql.NVarChar(180), input.project !== undefined ? (compact(input.project) || null) : (str(existing.Project) || null))
      .input('CostCentre', sql.NVarChar(80), input.costCentre !== undefined ? (compact(input.costCentre) || null) : (str(existing.CostCentre) || null))
      .input('Budgeted', sql.Bit, input.budgeted != null ? (input.budgeted ? 1 : 0) : (existing.Budgeted ? 1 : 0))
      .input('EstimatedAnnualCost', sql.Decimal(19, 2), input.estimatedAnnualCost !== undefined
        ? (input.estimatedAnnualCost == null ? null : num(input.estimatedAnnualCost))
        : (existing.EstimatedAnnualCost == null ? null : num(existing.EstimatedAnnualCost)))
      .input('Currency', sql.Char(3), compact(input.currency) || str(existing.Currency) || 'NGN')
      .input('ReplacementEmployee', sql.NVarChar(180), input.replacementEmployee !== undefined
        ? (compact(input.replacementEmployee) || null)
        : (str(existing.ReplacementEmployee) || null))
      .input('BusinessJustification', sql.NVarChar(sql.MAX), businessJustification)
      .input('BudgetStatus', sql.NVarChar(30), budgetStatus)
      .input('WorkflowStatus', sql.NVarChar(30), workflowStatus)
      .input('UpdatedBy', sql.NVarChar(180), actor)
      .query(`
UPDATE [hris].[RecruitmentManpowerRequest]
SET [RequestType] = @RequestType,
    [Department] = @Department,
    [PositionTitle] = @PositionTitle,
    [EmploymentType] = @EmploymentType,
    [Headcount] = @Headcount,
    [NeedDate] = @NeedDate,
    [Priority] = @Priority,
    [WorkLocation] = @WorkLocation,
    [Grade] = @Grade,
    [Project] = @Project,
    [CostCentre] = @CostCentre,
    [Budgeted] = @Budgeted,
    [EstimatedAnnualCost] = @EstimatedAnnualCost,
    [Currency] = @Currency,
    [ReplacementEmployee] = @ReplacementEmployee,
    [BusinessJustification] = @BusinessJustification,
    [BudgetStatus] = @BudgetStatus,
    [WorkflowStatus] = @WorkflowStatus,
    [UpdatedBy] = @UpdatedBy,
    [UpdatedAt] = SYSUTCDATETIME()
WHERE [Id] = @Id;`);

    const statusChanged = workflowStatus !== str(existing.WorkflowStatus);
    const eventReq = new sql.Request(transaction);
    const eventId = nextId('RAE');
    await eventReq
      .input('Id', sql.NVarChar(80), eventId)
      .input('EntityType', sql.NVarChar(50), 'ManpowerRequest')
      .input('EntityId', sql.NVarChar(80), id)
      .input('Stage', sql.NVarChar(50), statusChanged ? 'Workflow' : 'Update')
      .input('Action', sql.NVarChar(30), statusChanged ? workflowStatus : 'Update')
      .input('Actor', sql.NVarChar(180), actor)
      .input('Comment', sql.NVarChar(1000), compact(input.comment) || (statusChanged
        ? `Status ${str(existing.WorkflowStatus)} → ${workflowStatus}`
        : 'Manpower request updated'))
      .query(`
INSERT INTO [hris].[RecruitmentApprovalEvent]
  ([Id], [EntityType], [EntityId], [Stage], [Action], [Actor], [Comment])
VALUES
  (@Id, @EntityType, @EntityId, @Stage, @Action, @Actor, @Comment);`);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const rs = await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .query(`SELECT * FROM [hris].[RecruitmentManpowerRequest] WHERE [Id] = @Id;`);
  return mapManpower(rs.recordset[0]);
};

export type CreateCandidateInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  currentTitle?: string | null;
  yearsExperience?: number | null;
  highestQualification?: string | null;
  source?: string | null;
  actor: string;
};

export const createCandidate = async (input: CreateCandidateInput): Promise<CandidateRecord> => {
  const pool = await requireDb();
  const firstName = compact(input.firstName);
  const lastName = compact(input.lastName);
  if (!firstName || !lastName) throw new Error('First name and last name are required.');

  const id = nextId('CAN');
  const candidateNo = `CAN-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  const actor = compact(input.actor) || 'System';

  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('CandidateNo', sql.NVarChar(40), candidateNo)
    .input('FirstName', sql.NVarChar(80), firstName)
    .input('LastName', sql.NVarChar(80), lastName)
    .input('Email', sql.NVarChar(180), compact(input.email) || null)
    .input('Phone', sql.NVarChar(50), compact(input.phone) || null)
    .input('CurrentTitle', sql.NVarChar(150), compact(input.currentTitle) || null)
    .input('YearsExperience', sql.Decimal(5, 1), input.yearsExperience == null ? null : num(input.yearsExperience))
    .input('HighestQualification', sql.NVarChar(100), compact(input.highestQualification) || null)
    .input('Source', sql.NVarChar(80), compact(input.source) || null)
    .query(`
INSERT INTO [hris].[RecruitmentCandidate] (
  [Id], [CandidateNo], [FirstName], [LastName], [Email], [Phone], [CurrentTitle],
  [YearsExperience], [HighestQualification], [Source], [ConsentAt], [Status]
) VALUES (
  @Id, @CandidateNo, @FirstName, @LastName, @Email, @Phone, @CurrentTitle,
  @YearsExperience, @HighestQualification, @Source, SYSUTCDATETIME(), N'Active'
);`);

  await writeApprovalEvent(pool, {
    entityType: 'Candidate',
    entityId: id,
    stage: 'Create',
    action: 'Create',
    actor,
    comment: `Created candidate ${candidateNo}`,
  });

  const payload = await readRecruitmentPayload();
  const created = payload.candidates.find((c) => c.id === id);
  if (!created) throw new Error('Candidate created but could not be reloaded.');
  return created;
};

export type CreateRequisitionInput = {
  jobTitle: string;
  department: string;
  openings: number;
  hiringManager?: string | null;
  priority?: JobRequisitionRecord['priority'];
  manpowerRequestId?: string | null;
  jobDescription?: string | null;
  requirements?: string | null;
  actor: string;
};

export const createRequisition = async (input: CreateRequisitionInput): Promise<JobRequisitionRecord> => {
  const pool = await requireDb();
  const jobTitle = compact(input.jobTitle);
  const department = compact(input.department);
  if (!jobTitle || !department) throw new Error('Job title and department are required.');

  const id = nextId('REQ');
  const requisitionNo = `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  const actor = compact(input.actor) || 'System';

  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('RequisitionNo', sql.NVarChar(40), requisitionNo)
    .input('ManpowerRequestId', sql.NVarChar(80), compact(input.manpowerRequestId) || null)
    .input('JobTitle', sql.NVarChar(180), jobTitle)
    .input('Department', sql.NVarChar(180), department)
    .input('Openings', sql.Int, Math.max(1, Math.floor(num(input.openings, 1))))
    .input('HiringManager', sql.NVarChar(180), compact(input.hiringManager) || null)
    .input('Priority', sql.NVarChar(20), compact(input.priority) || 'Medium')
    .input('Status', sql.NVarChar(30), 'Draft')
    .input('JobDescription', sql.NVarChar(sql.MAX), compact(input.jobDescription) || null)
    .input('Requirements', sql.NVarChar(sql.MAX), compact(input.requirements) || null)
    .query(`
INSERT INTO [hris].[RecruitmentRequisition] (
  [Id], [RequisitionNo], [ManpowerRequestId], [JobTitle], [Department], [Openings],
  [HiringManager], [Priority], [Status], [JobDescription], [Requirements]
) VALUES (
  @Id, @RequisitionNo, @ManpowerRequestId, @JobTitle, @Department, @Openings,
  @HiringManager, @Priority, @Status, @JobDescription, @Requirements
);`);

  await writeApprovalEvent(pool, {
    entityType: 'Requisition',
    entityId: id,
    stage: 'Create',
    action: 'Create',
    actor,
    comment: `Created requisition ${requisitionNo}`,
  });

  const payload = await readRecruitmentPayload();
  const created = payload.requisitions.find((r) => r.id === id);
  if (!created) throw new Error('Requisition created but could not be reloaded.');
  return created;
};

export const createJobPosting = async (input: {
  requisitionId: string;
  jobTitle: string;
  channels: string;
  closingDate?: string | null;
  status?: string;
  actor: string;
}) => {
  const pool = await requireDb();
  const requisitionId = compact(input.requisitionId);
  const jobTitle = compact(input.jobTitle);
  const channels = compact(input.channels) || 'Career Portal';
  if (!requisitionId) throw new Error('Requisition is required.');
  if (!jobTitle) throw new Error('Job title is required.');
  const id = nextId('JOB');
  const postingNo = `JOB-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  const actor = compact(input.actor) || 'System';
  const status = compact(input.status) || 'Draft';
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('PostingNo', sql.NVarChar(40), postingNo)
    .input('RequisitionId', sql.NVarChar(80), requisitionId)
    .input('JobTitle', sql.NVarChar(180), jobTitle)
    .input('Channels', sql.NVarChar(300), channels)
    .input('PublishedAt', sql.DateTime2, status === 'Live' ? new Date() : null)
    .input('ClosingDate', sql.Date, isoDate(input.closingDate))
    .input('Status', sql.NVarChar(30), status)
    .query(`
INSERT INTO [hris].[RecruitmentJobPosting] (
  [Id], [PostingNo], [RequisitionId], [JobTitle], [Channels], [PublishedAt], [ClosingDate], [Status]
) VALUES (
  @Id, @PostingNo, @RequisitionId, @JobTitle, @Channels, @PublishedAt, @ClosingDate, @Status
);`);
  await writeApprovalEvent(pool, {
    entityType: 'JobPosting', entityId: id, stage: 'Create', action: 'Create', actor,
    comment: `Created posting ${postingNo}`,
  });
  const payload = await readRecruitmentPayload();
  const created = payload.postings.find((p) => p.id === id);
  if (!created) throw new Error('Job posting created but could not be reloaded.');
  return created;
};

export const createInterview = async (input: {
  applicationId: string;
  roundNo?: number;
  scheduledAt?: string | null;
  mode?: string | null;
  venueOrMeeting?: string | null;
  status?: string;
  actor: string;
}) => {
  const pool = await requireDb();
  const applicationId = compact(input.applicationId);
  if (!applicationId) throw new Error('Application is required.');
  const id = nextId('INT');
  const actor = compact(input.actor) || 'System';
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('ApplicationId', sql.NVarChar(80), applicationId)
    .input('RoundNo', sql.Int, Math.max(1, Math.floor(num(input.roundNo, 1))))
    .input('ScheduledAt', sql.DateTime2, input.scheduledAt ? new Date(String(input.scheduledAt)) : null)
    .input('Mode', sql.NVarChar(30), compact(input.mode) || null)
    .input('VenueOrMeeting', sql.NVarChar(300), compact(input.venueOrMeeting) || null)
    .input('Status', sql.NVarChar(30), compact(input.status) || 'Scheduled')
    .query(`
INSERT INTO [hris].[RecruitmentInterview] (
  [Id], [ApplicationId], [RoundNo], [ScheduledAt], [Mode], [VenueOrMeeting], [Status]
) VALUES (
  @Id, @ApplicationId, @RoundNo, @ScheduledAt, @Mode, @VenueOrMeeting, @Status
);`);
  await writeApprovalEvent(pool, {
    entityType: 'Interview', entityId: id, stage: 'Create', action: 'Schedule', actor,
    comment: 'Interview scheduled',
  });
  const payload = await readRecruitmentPayload();
  const created = payload.interviews.find((i) => i.id === id);
  if (!created) throw new Error('Interview created but could not be reloaded.');
  return created;
};

export const createOffer = async (input: {
  applicationId: string;
  grade?: string | null;
  currency?: string;
  basePay?: number | null;
  totalPackage?: number | null;
  status?: string;
  expiresAt?: string | null;
  actor: string;
}) => {
  const pool = await requireDb();
  const applicationId = compact(input.applicationId);
  if (!applicationId) throw new Error('Application is required.');
  const id = nextId('OFF');
  const actor = compact(input.actor) || 'System';
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('ApplicationId', sql.NVarChar(80), applicationId)
    .input('Grade', sql.NVarChar(40), compact(input.grade) || null)
    .input('Currency', sql.Char(3), compact(input.currency) || 'NGN')
    .input('BasePay', sql.Decimal(19, 2), input.basePay == null ? null : num(input.basePay))
    .input('TotalPackage', sql.Decimal(19, 2), input.totalPackage == null ? null : num(input.totalPackage))
    .input('Status', sql.NVarChar(30), compact(input.status) || 'Draft')
    .input('ExpiresAt', sql.DateTime2, input.expiresAt ? new Date(String(input.expiresAt)) : null)
    .query(`
INSERT INTO [hris].[RecruitmentOffer] (
  [Id], [ApplicationId], [OfferVersion], [Grade], [Currency], [BasePay], [TotalPackage], [Status], [ExpiresAt]
) VALUES (
  @Id, @ApplicationId, 1, @Grade, @Currency, @BasePay, @TotalPackage, @Status, @ExpiresAt
);`);
  await writeApprovalEvent(pool, {
    entityType: 'Offer', entityId: id, stage: 'Create', action: 'Create', actor,
    comment: 'Offer draft created',
  });
  const payload = await readRecruitmentPayload();
  const created = payload.offers.find((o) => o.id === id);
  if (!created) throw new Error('Offer created but could not be reloaded.');
  return created;
};

export const createBackgroundCheck = async (input: {
  applicationId: string;
  checkType: string;
  provider?: string | null;
  status?: string;
  notes?: string | null;
  actor: string;
}) => {
  const pool = await requireDb();
  const applicationId = compact(input.applicationId);
  const checkType = compact(input.checkType);
  if (!applicationId) throw new Error('Application is required.');
  if (!checkType) throw new Error('Check type is required.');
  const id = nextId('BGC');
  const actor = compact(input.actor) || 'System';
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('ApplicationId', sql.NVarChar(80), applicationId)
    .input('CheckType', sql.NVarChar(60), checkType)
    .input('Provider', sql.NVarChar(120), compact(input.provider) || null)
    .input('Status', sql.NVarChar(30), compact(input.status) || 'Not Started')
    .input('Notes', sql.NVarChar(sql.MAX), compact(input.notes) || null)
    .input('StartedAt', sql.DateTime2, new Date())
    .query(`
INSERT INTO [hris].[RecruitmentBackgroundCheck] (
  [Id], [ApplicationId], [CheckType], [Provider], [Status], [Notes], [StartedAt]
) VALUES (
  @Id, @ApplicationId, @CheckType, @Provider, @Status, @Notes, @StartedAt
);`);
  await writeApprovalEvent(pool, {
    entityType: 'BackgroundCheck', entityId: id, stage: 'Create', action: 'Start', actor,
    comment: `${checkType} check started`,
  });
  const payload = await readRecruitmentPayload();
  const created = payload.backgroundChecks.find((b) => b.id === id);
  if (!created) throw new Error('Background check created but could not be reloaded.');
  return created;
};

export const createTalentPoolEntry = async (input: {
  candidateId: string;
  poolName: string;
  primarySkill?: string | null;
  availability?: string | null;
  talentScore?: number | null;
  actor: string;
}) => {
  const pool = await requireDb();
  const candidateId = compact(input.candidateId);
  const poolName = compact(input.poolName);
  if (!candidateId) throw new Error('Candidate is required.');
  if (!poolName) throw new Error('Pool name is required.');
  const id = nextId('TAL');
  const actor = compact(input.actor) || 'System';
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('CandidateId', sql.NVarChar(80), candidateId)
    .input('PoolName', sql.NVarChar(100), poolName)
    .input('PrimarySkill', sql.NVarChar(120), compact(input.primarySkill) || null)
    .input('Availability', sql.NVarChar(40), compact(input.availability) || null)
    .input('TalentScore', sql.Decimal(5, 2), input.talentScore == null ? null : num(input.talentScore))
    .query(`
INSERT INTO [hris].[RecruitmentTalentPool] (
  [Id], [CandidateId], [PoolName], [PrimarySkill], [Availability], [TalentScore]
) VALUES (
  @Id, @CandidateId, @PoolName, @PrimarySkill, @Availability, @TalentScore
);`);
  await writeApprovalEvent(pool, {
    entityType: 'TalentPool', entityId: id, stage: 'Create', action: 'Add', actor,
    comment: `Added to pool ${poolName}`,
  });
  const payload = await readRecruitmentPayload();
  const created = payload.talentPool.find((t) => t.id === id);
  if (!created) throw new Error('Talent pool entry created but could not be reloaded.');
  return created;
};

export const createApplication = async (input: {
  candidateId: string;
  requisitionId: string;
  stage?: string;
  screeningScore?: number | null;
  recruiterDecision?: string | null;
  actor: string;
}) => {
  const pool = await requireDb();
  const candidateId = compact(input.candidateId);
  const requisitionId = compact(input.requisitionId);
  if (!candidateId || !requisitionId) throw new Error('Candidate and requisition are required.');
  const id = nextId('APP');
  const actor = compact(input.actor) || 'System';
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('CandidateId', sql.NVarChar(80), candidateId)
    .input('RequisitionId', sql.NVarChar(80), requisitionId)
    .input('Stage', sql.NVarChar(40), compact(input.stage) || 'Applied')
    .input('ScreeningScore', sql.Decimal(5, 2), input.screeningScore == null ? null : num(input.screeningScore))
    .input('RecruiterDecision', sql.NVarChar(30), compact(input.recruiterDecision) || null)
    .query(`
INSERT INTO [hris].[RecruitmentApplication] (
  [Id], [CandidateId], [RequisitionId], [Stage], [ScreeningScore], [RecruiterDecision]
) VALUES (
  @Id, @CandidateId, @RequisitionId, @Stage, @ScreeningScore, @RecruiterDecision
);`);
  await writeApprovalEvent(pool, {
    entityType: 'Application', entityId: id, stage: 'Create', action: 'Apply', actor,
    comment: 'Application recorded',
  });
  const payload = await readRecruitmentPayload();
  const created = payload.applications.find((a) => a.id === id);
  if (!created) throw new Error('Application created but could not be reloaded.');
  return created;
};

export const updateApplicationScreening = async (input: {
  id: string;
  stage?: string;
  screeningScore?: number | null;
  recruiterDecision?: string | null;
  actor: string;
}) => {
  const pool = await requireDb();
  const id = compact(input.id);
  if (!id) throw new Error('Application id is required.');
  const actor = compact(input.actor) || 'System';
  await pool.request()
    .input('Id', sql.NVarChar(80), id)
    .input('Stage', sql.NVarChar(40), compact(input.stage) || 'Screening')
    .input('ScreeningScore', sql.Decimal(5, 2), input.screeningScore == null ? null : num(input.screeningScore))
    .input('RecruiterDecision', sql.NVarChar(30), compact(input.recruiterDecision) || null)
    .query(`
UPDATE [hris].[RecruitmentApplication]
SET [Stage] = @Stage,
    [ScreeningScore] = @ScreeningScore,
    [RecruiterDecision] = @RecruiterDecision
WHERE [Id] = @Id;`);
  await writeApprovalEvent(pool, {
    entityType: 'Application', entityId: id, stage: 'Screening', action: 'Update', actor,
    comment: compact(input.recruiterDecision) || 'Screening updated',
  });
  return readRecruitmentPayload();
};

export type RecruitmentAction =
  | 'create_manpower'
  | 'update_manpower'
  | 'submit_manpower'
  | 'approve_manpower'
  | 'reject_manpower'
  | 'create_candidate'
  | 'create_requisition'
  | 'create_posting'
  | 'create_application'
  | 'update_screening'
  | 'create_interview'
  | 'create_offer'
  | 'create_background_check'
  | 'create_talent_pool';

export const applyRecruitmentAction = async (
  action: string,
  body: Record<string, unknown>,
  actor: string,
): Promise<{ message: string; payload: RecruitmentPayload }> => {
  const act = compact(action) as RecruitmentAction;

  if (act === 'create_manpower') {
    const row = await createManpowerRequest({
      department: str(body.department),
      positionTitle: str(body.positionTitle),
      employmentType: str(body.employmentType) || 'Permanent',
      headcount: num(body.headcount, 1),
      needDate: str(body.needDate) || null,
      requestType: str(body.requestType) || 'New Position',
      priority: (str(body.priority) as ManpowerRequestRecord['priority']) || 'Medium',
      workLocation: str(body.workLocation) || null,
      grade: str(body.grade) || null,
      project: str(body.project) || null,
      costCentre: str(body.costCentre) || null,
      budgeted: Boolean(body.budgeted),
      estimatedAnnualCost: body.estimatedAnnualCost == null || body.estimatedAnnualCost === ''
        ? null
        : num(body.estimatedAnnualCost),
      currency: str(body.currency) || 'NGN',
      replacementEmployee: str(body.replacementEmployee) || null,
      businessJustification: str(body.businessJustification) || null,
      budgetStatus: (str(body.budgetStatus) || 'Pending') as RecruitmentBudgetStatus,
      workflowStatus: (str(body.workflowStatus) || 'Draft') as RecruitmentWorkflowStatus,
      actor,
    });
    return { message: `Manpower request ${row.requestNo} saved.`, payload: await readRecruitmentPayload() };
  }

  if (act === 'update_manpower' || act === 'submit_manpower' || act === 'approve_manpower' || act === 'reject_manpower') {
    const workflowStatus: RecruitmentWorkflowStatus | undefined =
      act === 'submit_manpower' ? 'Submitted'
        : act === 'approve_manpower' ? 'Approved'
          : act === 'reject_manpower' ? 'Rejected'
            : (str(body.workflowStatus) as RecruitmentWorkflowStatus) || undefined;
    const row = await updateManpowerRequest({
      id: str(body.id),
      department: str(body.department) || undefined,
      positionTitle: str(body.positionTitle) || undefined,
      employmentType: str(body.employmentType) || undefined,
      headcount: body.headcount == null || body.headcount === '' ? undefined : num(body.headcount, 1),
      needDate: body.needDate === undefined ? undefined : (str(body.needDate) || null),
      requestType: str(body.requestType) || undefined,
      priority: (str(body.priority) as ManpowerRequestRecord['priority']) || undefined,
      workLocation: body.workLocation === undefined ? undefined : (str(body.workLocation) || null),
      grade: body.grade === undefined ? undefined : (str(body.grade) || null),
      project: body.project === undefined ? undefined : (str(body.project) || null),
      costCentre: body.costCentre === undefined ? undefined : (str(body.costCentre) || null),
      budgeted: body.budgeted == null ? undefined : Boolean(body.budgeted),
      estimatedAnnualCost: body.estimatedAnnualCost === undefined
        ? undefined
        : (body.estimatedAnnualCost === '' || body.estimatedAnnualCost == null ? null : num(body.estimatedAnnualCost)),
      currency: str(body.currency) || undefined,
      replacementEmployee: body.replacementEmployee === undefined ? undefined : (str(body.replacementEmployee) || null),
      businessJustification: body.businessJustification === undefined ? undefined : (str(body.businessJustification) || null),
      budgetStatus: (str(body.budgetStatus) as RecruitmentBudgetStatus) || undefined,
      workflowStatus,
      actor,
      comment: str(body.comment) || null,
    });
    return { message: `Manpower request ${row.requestNo} updated.`, payload: await readRecruitmentPayload() };
  }

  if (act === 'create_candidate') {
    const row = await createCandidate({
      firstName: str(body.firstName),
      lastName: str(body.lastName),
      email: str(body.email) || null,
      phone: str(body.phone) || null,
      currentTitle: str(body.currentTitle) || null,
      yearsExperience: body.yearsExperience == null ? null : num(body.yearsExperience),
      highestQualification: str(body.highestQualification) || null,
      source: str(body.source) || null,
      actor,
    });
    return { message: `Candidate ${row.candidateNo} saved.`, payload: await readRecruitmentPayload() };
  }

  if (act === 'create_requisition') {
    const row = await createRequisition({
      jobTitle: str(body.jobTitle),
      department: str(body.department),
      openings: num(body.openings, 1),
      hiringManager: str(body.hiringManager) || null,
      priority: (str(body.priority) as JobRequisitionRecord['priority']) || 'Medium',
      manpowerRequestId: str(body.manpowerRequestId) || null,
      jobDescription: str(body.jobDescription) || null,
      requirements: str(body.requirements) || null,
      actor,
    });
    return { message: `Requisition ${row.requisitionNo} saved.`, payload: await readRecruitmentPayload() };
  }

  if (act === 'create_posting') {
    const row = await createJobPosting({
      requisitionId: str(body.requisitionId),
      jobTitle: str(body.jobTitle),
      channels: str(body.channels) || 'Career Portal',
      closingDate: str(body.closingDate) || null,
      status: str(body.status) || 'Draft',
      actor,
    });
    return { message: `Job posting ${row.postingNo} saved.`, payload: await readRecruitmentPayload() };
  }

  if (act === 'create_application') {
    const row = await createApplication({
      candidateId: str(body.candidateId),
      requisitionId: str(body.requisitionId),
      stage: str(body.stage) || 'Applied',
      screeningScore: body.screeningScore == null ? null : num(body.screeningScore),
      recruiterDecision: str(body.recruiterDecision) || null,
      actor,
    });
    return { message: 'Application saved.', payload: await readRecruitmentPayload() };
  }

  if (act === 'update_screening') {
    const payload = await updateApplicationScreening({
      id: str(body.id),
      stage: str(body.stage) || 'Screening',
      screeningScore: body.screeningScore == null ? null : num(body.screeningScore),
      recruiterDecision: str(body.recruiterDecision) || null,
      actor,
    });
    return { message: 'Screening updated.', payload };
  }

  if (act === 'create_interview') {
    const row = await createInterview({
      applicationId: str(body.applicationId),
      roundNo: num(body.roundNo, 1),
      scheduledAt: str(body.scheduledAt) || null,
      mode: str(body.mode) || null,
      venueOrMeeting: str(body.venueOrMeeting) || null,
      status: str(body.status) || 'Scheduled',
      actor,
    });
    return { message: 'Interview scheduled.', payload: await readRecruitmentPayload() };
  }

  if (act === 'create_offer') {
    const row = await createOffer({
      applicationId: str(body.applicationId),
      grade: str(body.grade) || null,
      currency: str(body.currency) || 'NGN',
      basePay: body.basePay == null || body.basePay === '' ? null : num(body.basePay),
      totalPackage: body.totalPackage == null || body.totalPackage === '' ? null : num(body.totalPackage),
      status: str(body.status) || 'Draft',
      expiresAt: str(body.expiresAt) || null,
      actor,
    });
    return { message: 'Offer saved.', payload: await readRecruitmentPayload() };
  }

  if (act === 'create_background_check') {
    const row = await createBackgroundCheck({
      applicationId: str(body.applicationId),
      checkType: str(body.checkType),
      provider: str(body.provider) || null,
      status: str(body.status) || 'Not Started',
      notes: str(body.notes) || null,
      actor,
    });
    return { message: 'Background check started.', payload: await readRecruitmentPayload() };
  }

  if (act === 'create_talent_pool') {
    const row = await createTalentPoolEntry({
      candidateId: str(body.candidateId),
      poolName: str(body.poolName),
      primarySkill: str(body.primarySkill) || null,
      availability: str(body.availability) || null,
      talentScore: body.talentScore == null || body.talentScore === '' ? null : num(body.talentScore),
      actor,
    });
    return { message: 'Candidate added to talent pool.', payload: await readRecruitmentPayload() };
  }

  throw new Error(`Unsupported recruitment action: ${action || '(empty)'}`);
};
