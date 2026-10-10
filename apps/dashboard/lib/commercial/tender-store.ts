import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { resolveRepoRoot } from '@/lib/finance-intelligence/payment-attachment-storage';
import { readSystemDepartmentsFromOrganizationDb } from '@/lib/organization-departments-store';
import { ensureTenderSchemaSql } from '@/lib/commercial/tender-sql-schema';
import type {
  TenderApproval,
  TenderAuditEvent,
  TenderAward,
  TenderDashboard,
  TenderDocument,
  TenderItem,
  TenderLine,
  TenderLookups,
  TenderOpportunity,
  TenderOpportunityInput,
  TenderSubmission,
} from '@/lib/commercial/tender-types';

const dbReady = { value: false };

const clean = (value: unknown, max = 4000) => String(value ?? '').trim().slice(0, max);
const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const bit = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true' || value === 'Yes';
const dateOrNull = (value: unknown) => {
  const text = clean(value, 40);
  if (!text) return null;
  const parsed = new Date(text.includes('T') ? text : `${text.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const iso = (value: unknown) => {
  if (!value) return '';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
};

const idFor = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const sqlErrorNumber = (error: unknown) => {
  if (!error || typeof error !== 'object') return 0;
  const value = (error as { number?: unknown }).number;
  return typeof value === 'number' ? value : 0;
};

const applySchema = async (pool: sql.ConnectionPool) => {
  try {
    await pool.request().query(ensureTenderSchemaSql);
  } catch (error) {
    if (sqlErrorNumber(error) !== 2714) throw error;
    await pool.request().query(ensureTenderSchemaSql);
  }
};

export const ensureTenderDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not configured. Tender Management requires SQL persistence.');
  if (!dbReady.value) {
    await applySchema(pool);
    dbReady.value = true;
  }
  return pool;
};

const mapOpportunity = (row: Record<string, unknown>): TenderOpportunity => ({
  id: clean(row.OpportunityId, 40),
  referenceNo: clean(row.ReferenceNo, 80),
  enquiryRef: clean(row.EnquiryRef, 80),
  title: clean(row.Title, 300),
  description: clean(row.Description),
  opportunityType: clean(row.OpportunityType, 40),
  source: clean(row.SourceName, 80),
  tenderType: clean(row.TenderType, 40),
  category: clean(row.Category, 80),
  subCategory: clean(row.SubCategory, 80),
  businessUnit: clean(row.BusinessUnit, 160),
  status: clean(row.Status, 40),
  stage: clean(row.Stage, 40),
  priority: clean(row.Priority, 20) || 'Medium',
  bidDecision: clean(row.BidDecision, 20),
  clientName: clean(row.ClientName, 220),
  clientAddress: clean(row.ClientAddress, 500),
  contactPerson: clean(row.ContactPerson, 180),
  designation: clean(row.Designation, 120),
  email: clean(row.Email, 200),
  phone: clean(row.Phone, 80),
  department: clean(row.Department, 180),
  location: clean(row.LocationName, 180),
  site: clean(row.SiteName, 180),
  estimatedValue: num(row.EstimatedValue),
  currency: clean(row.Currency, 10) || 'NGN',
  contractType: clean(row.ContractType, 80),
  projectLocation: clean(row.ProjectLocation, 220),
  contractDuration: row.ContractDuration == null || row.ContractDuration === '' ? null : num(row.ContractDuration),
  durationUnit: clean(row.DurationUnit, 20) || 'Months',
  allowJv: bit(row.AllowJv),
  retentions: bit(row.Retentions),
  scopeSummary: clean(row.ScopeSummary),
  submissionDeadline: row.SubmissionDeadline ? String(row.SubmissionDeadline).slice(0, 10) : '',
  closingDate: row.ClosingDate ? String(row.ClosingDate).slice(0, 10) : '',
  invitationDate: row.InvitationDate ? String(row.InvitationDate).slice(0, 10) : '',
  siteVisitDate: row.SiteVisitDate ? String(row.SiteVisitDate).slice(0, 10) : '',
  clarificationDeadline: row.ClarificationDeadline ? String(row.ClarificationDeadline).slice(0, 10) : '',
  ownerName: clean(row.OwnerName, 180),
  teamNotes: clean(row.TeamNotes),
  approvalNotes: clean(row.ApprovalNotes),
  watchlisted: bit(row.Watchlisted),
  createdAt: iso(row.CreatedAt),
  updatedAt: iso(row.UpdatedAt),
  createdBy: clean(row.CreatedBy, 120),
  updatedBy: clean(row.UpdatedBy, 120),
});

const nextCode = async (pool: sql.ConnectionPool, column: string, prefix: string) => {
  const year = new Date().getFullYear();
  const stem = `${prefix}-${year}-`;
  const result = await pool
    .request()
    .input('Stem', sql.NVarChar(40), `${stem}%`)
    .query(`SELECT [${column}] AS Code FROM [commercial].[TenderOpportunities] WHERE [${column}] LIKE @Stem`);
  let max = 0;
  for (const row of result.recordset) {
    const match = String(row.Code || '').match(/-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${stem}${String(max + 1).padStart(3, '0')}`;
};

const audit = async (pool: sql.ConnectionPool, opportunityId: string | null, actor: string, action: string, details: string) => {
  await pool
    .request()
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('ActorName', sql.NVarChar(120), clean(actor, 120) || 'Commercial User')
    .input('ActionName', sql.NVarChar(90), clean(action, 90))
    .input('Details', sql.NVarChar(sql.MAX), clean(details))
    .query(`
      INSERT INTO [commercial].[TenderAudit] ([OpportunityId], [ActorName], [ActionName], [Details])
      VALUES (@OpportunityId, @ActorName, @ActionName, @Details)
    `);
};

const stageFor = (input: TenderOpportunityInput, status: string) => {
  const explicit = clean(input.stage, 40);
  if (explicit) return explicit;
  if (status === 'Prequalification') return 'Prequalification';
  if (status === 'Awarded') return 'Awarded';
  if (status === 'Under Review') return 'Under Review';
  if (status === 'Closed' || status === 'Lost' || status === 'No-Bid') return 'Submitted';
  if (clean(input.opportunityType, 40) === 'Enquiry' || clean(input.tenderType, 40) === 'Enquiry') return 'Enquiry';
  if (status === 'Draft') return 'Enquiry';
  return 'Open';
};

const bindOpportunity = (request: sql.Request, input: TenderOpportunityInput, status: string, stage: string, actor: string) => {
  request
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('Description', sql.NVarChar(sql.MAX), clean(input.description))
    .input('OpportunityType', sql.NVarChar(40), clean(input.opportunityType, 40) || 'Client Tender')
    .input('SourceName', sql.NVarChar(80), clean(input.source, 80) || 'Client Direct')
    .input('TenderType', sql.NVarChar(40), clean(input.tenderType, 40) || 'Client Bid')
    .input('Category', sql.NVarChar(80), clean(input.category, 80))
    .input('SubCategory', sql.NVarChar(80), clean(input.subCategory, 80))
    .input('BusinessUnit', sql.NVarChar(160), clean(input.businessUnit, 160))
    .input('Status', sql.NVarChar(40), status)
    .input('Stage', sql.NVarChar(40), stage)
    .input('Priority', sql.NVarChar(20), clean(input.priority, 20) || 'Medium')
    .input('BidDecision', sql.NVarChar(20), clean(input.bidDecision, 20))
    .input('ClientName', sql.NVarChar(220), clean(input.clientName, 220))
    .input('ClientAddress', sql.NVarChar(500), clean(input.clientAddress, 500))
    .input('ContactPerson', sql.NVarChar(180), clean(input.contactPerson, 180))
    .input('Designation', sql.NVarChar(120), clean(input.designation, 120))
    .input('Email', sql.NVarChar(200), clean(input.email, 200))
    .input('Phone', sql.NVarChar(80), clean(input.phone, 80))
    .input('Department', sql.NVarChar(180), clean(input.department, 180))
    .input('LocationName', sql.NVarChar(180), clean(input.location, 180))
    .input('SiteName', sql.NVarChar(180), clean(input.site, 180))
    .input('EstimatedValue', sql.Decimal(19, 2), num(input.estimatedValue))
    .input('Currency', sql.NVarChar(10), clean(input.currency, 10) || 'NGN')
    .input('ContractType', sql.NVarChar(80), clean(input.contractType, 80))
    .input('ProjectLocation', sql.NVarChar(220), clean(input.projectLocation, 220))
    .input('ContractDuration', sql.Int, input.contractDuration == null || String(input.contractDuration).trim() === '' ? null : num(input.contractDuration))
    .input('DurationUnit', sql.NVarChar(20), clean(input.durationUnit, 20) || 'Months')
    .input('AllowJv', sql.Bit, bit(input.allowJv))
    .input('Retentions', sql.Bit, bit(input.retentions))
    .input('ScopeSummary', sql.NVarChar(sql.MAX), clean(input.scopeSummary))
    .input('SubmissionDeadline', sql.Date, dateOrNull(input.submissionDeadline))
    .input('ClosingDate', sql.Date, dateOrNull(input.closingDate))
    .input('InvitationDate', sql.Date, dateOrNull(input.invitationDate))
    .input('SiteVisitDate', sql.Date, dateOrNull(input.siteVisitDate))
    .input('ClarificationDeadline', sql.Date, dateOrNull(input.clarificationDeadline))
    .input('OwnerName', sql.NVarChar(180), clean(input.ownerName, 180) || clean(actor, 180))
    .input('TeamNotes', sql.NVarChar(sql.MAX), clean(input.teamNotes))
    .input('ApprovalNotes', sql.NVarChar(sql.MAX), clean(input.approvalNotes))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120));
};

const OPPORTUNITY_COLUMNS = `
  [OpportunityId],[ReferenceNo],[EnquiryRef],[Title],[Description],[OpportunityType],[SourceName],[TenderType],
  [Category],[SubCategory],[BusinessUnit],[Status],[Stage],[Priority],[BidDecision],[ClientName],[ClientAddress],
  [ContactPerson],[Designation],[Email],[Phone],[Department],[LocationName],[SiteName],[EstimatedValue],[Currency],
  [ContractType],[ProjectLocation],[ContractDuration],[DurationUnit],[AllowJv],[Retentions],[ScopeSummary],
  [SubmissionDeadline],[ClosingDate],[InvitationDate],[SiteVisitDate],[ClarificationDeadline],[OwnerName],
  [TeamNotes],[ApprovalNotes],[Watchlisted],[CreatedAt],[UpdatedAt],[CreatedBy],[UpdatedBy]
`;

export const listOpportunities = async (): Promise<TenderOpportunity[]> => {
  const pool = await ensureTenderDb();
  const result = await pool.request().query(`
    SELECT ${OPPORTUNITY_COLUMNS}
    FROM [commercial].[TenderOpportunities]
    ORDER BY [UpdatedAt] DESC, [CreatedAt] DESC
  `);
  return result.recordset.map((row) => mapOpportunity(row));
};

export const getOpportunity = async (id: string): Promise<TenderOpportunity | null> => {
  const pool = await ensureTenderDb();
  const result = await pool
    .request()
    .input('Id', sql.NVarChar(40), clean(id, 40))
    .query(`SELECT ${OPPORTUNITY_COLUMNS} FROM [commercial].[TenderOpportunities] WHERE [OpportunityId]=@Id`);
  const row = result.recordset[0];
  return row ? mapOpportunity(row) : null;
};

const validate = (input: TenderOpportunityInput, mode: 'draft' | 'submit') => {
  if (!clean(input.title, 300)) throw new Error('Tender title is required.');
  if (!clean(input.clientName, 220)) throw new Error('Client name is required.');
  if (!clean(input.source, 80)) throw new Error('Source is required.');
  if (mode === 'submit') {
    if (!clean(input.department, 180)) throw new Error('Select a department.');
    if (!clean(input.location, 180)) throw new Error('Select a location.');
    if (!clean(input.site, 180)) throw new Error('Select a site.');
    if (!(num(input.estimatedValue) > 0)) throw new Error('Estimated value is required.');
  }
};

export const saveOpportunity = async (input: TenderOpportunityInput, actor: string) => {
  const mode = input.saveMode === 'submit' ? 'submit' : 'draft';
  validate(input, mode);
  const pool = await ensureTenderDb();
  const status = mode === 'draft' ? 'Draft' : (clean(input.status, 40) && clean(input.status, 40) !== 'Draft' ? clean(input.status, 40) : 'Under Review');
  const stage = stageFor(input, status);
  const existingId = clean(input.id, 40);

  if (existingId) {
    const current = await getOpportunity(existingId);
    if (!current) throw new Error('Opportunity was not found.');
    const referenceNo = clean(input.referenceNo, 80) || current.referenceNo;
    const request = pool.request().input('Id', sql.NVarChar(40), existingId).input('ReferenceNo', sql.NVarChar(80), referenceNo);
    bindOpportunity(request, input, status, stage, actor);
    await request.query(`
      UPDATE [commercial].[TenderOpportunities] SET
        [ReferenceNo]=@ReferenceNo,[Title]=@Title,[Description]=@Description,[OpportunityType]=@OpportunityType,
        [SourceName]=@SourceName,[TenderType]=@TenderType,[Category]=@Category,[SubCategory]=@SubCategory,
        [BusinessUnit]=@BusinessUnit,[Status]=@Status,[Stage]=@Stage,[Priority]=@Priority,[BidDecision]=@BidDecision,
        [ClientName]=@ClientName,[ClientAddress]=@ClientAddress,[ContactPerson]=@ContactPerson,[Designation]=@Designation,
        [Email]=@Email,[Phone]=@Phone,[Department]=@Department,[LocationName]=@LocationName,[SiteName]=@SiteName,
        [EstimatedValue]=@EstimatedValue,[Currency]=@Currency,[ContractType]=@ContractType,[ProjectLocation]=@ProjectLocation,
        [ContractDuration]=@ContractDuration,[DurationUnit]=@DurationUnit,[AllowJv]=@AllowJv,[Retentions]=@Retentions,
        [ScopeSummary]=@ScopeSummary,[SubmissionDeadline]=@SubmissionDeadline,[ClosingDate]=@ClosingDate,
        [InvitationDate]=@InvitationDate,[SiteVisitDate]=@SiteVisitDate,[ClarificationDeadline]=@ClarificationDeadline,
        [OwnerName]=@OwnerName,[TeamNotes]=@TeamNotes,[ApprovalNotes]=@ApprovalNotes,
        [UpdatedAt]=SYSUTCDATETIME(),[UpdatedBy]=@UpdatedBy
      WHERE [OpportunityId]=@Id
    `);
    await audit(pool, existingId, actor, mode === 'submit' ? 'SUBMITTED_FOR_REVIEW' : 'UPDATED', referenceNo);
    return getOpportunity(existingId);
  }

  const id = idFor('TOP');
  const referenceNo = clean(input.referenceNo, 80) || (await nextCode(pool, 'ReferenceNo', 'DLE-T'));
  const enquiryRef = clean(input.enquiryRef, 80) || (await nextCode(pool, 'EnquiryRef', 'ENQ'));
  const request = pool
    .request()
    .input('Id', sql.NVarChar(40), id)
    .input('ReferenceNo', sql.NVarChar(80), referenceNo)
    .input('EnquiryRef', sql.NVarChar(80), enquiryRef)
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120));
  bindOpportunity(request, input, status, stage, actor);
  await request.query(`
    INSERT INTO [commercial].[TenderOpportunities] (
      [OpportunityId],[ReferenceNo],[EnquiryRef],[Title],[Description],[OpportunityType],[SourceName],[TenderType],
      [Category],[SubCategory],[BusinessUnit],[Status],[Stage],[Priority],[BidDecision],[ClientName],[ClientAddress],
      [ContactPerson],[Designation],[Email],[Phone],[Department],[LocationName],[SiteName],[EstimatedValue],[Currency],
      [ContractType],[ProjectLocation],[ContractDuration],[DurationUnit],[AllowJv],[Retentions],[ScopeSummary],
      [SubmissionDeadline],[ClosingDate],[InvitationDate],[SiteVisitDate],[ClarificationDeadline],[OwnerName],
      [TeamNotes],[ApprovalNotes],[CreatedBy],[UpdatedBy]
    ) VALUES (
      @Id,@ReferenceNo,@EnquiryRef,@Title,@Description,@OpportunityType,@SourceName,@TenderType,
      @Category,@SubCategory,@BusinessUnit,@Status,@Stage,@Priority,@BidDecision,@ClientName,@ClientAddress,
      @ContactPerson,@Designation,@Email,@Phone,@Department,@LocationName,@SiteName,@EstimatedValue,@Currency,
      @ContractType,@ProjectLocation,@ContractDuration,@DurationUnit,@AllowJv,@Retentions,@ScopeSummary,
      @SubmissionDeadline,@ClosingDate,@InvitationDate,@SiteVisitDate,@ClarificationDeadline,@OwnerName,
      @TeamNotes,@ApprovalNotes,@CreatedBy,@UpdatedBy
    )
  `);
  await audit(pool, id, actor, mode === 'submit' ? 'SUBMITTED_FOR_REVIEW' : 'CREATED', referenceNo);
  return getOpportunity(id);
};

export const patchOpportunity = async (id: string, patch: Partial<TenderOpportunity>, actor: string) => {
  const current = await getOpportunity(id);
  if (!current) throw new Error('Opportunity was not found.');
  return saveOpportunity({ ...current, ...patch, id, saveMode: 'submit' }, actor);
};

export const duplicateOpportunity = async (id: string, actor: string) => {
  const current = await getOpportunity(id);
  if (!current) throw new Error('Opportunity was not found.');
  const copy: TenderOpportunityInput = {
    ...current,
    id: '',
    referenceNo: '',
    enquiryRef: '',
    title: `${current.title} (copy)`,
    status: 'Draft',
    stage: 'Enquiry',
    saveMode: 'draft',
  };
  return saveOpportunity(copy, actor);
};

export const setWatchlisted = async (id: string, watchlisted: boolean, actor: string) => {
  const pool = await ensureTenderDb();
  const result = await pool
    .request()
    .input('Id', sql.NVarChar(40), clean(id, 40))
    .input('Watchlisted', sql.Bit, watchlisted)
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      UPDATE [commercial].[TenderOpportunities]
      SET [Watchlisted]=@Watchlisted, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHERE [OpportunityId]=@Id
    `);
  if (!result.rowsAffected[0]) throw new Error('Opportunity was not found.');
  await audit(pool, id, actor, watchlisted ? 'WATCHLISTED' : 'UNWATCHLISTED', '');
  return getOpportunity(id);
};

const percentDelta = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
};

const PIPELINE_STAGE_LABELS = ['Qualification', 'Bid Preparation', 'Awaiting Approval', 'Submitted', 'Under Negotiation', 'Awarded'] as const;
const TERMINAL_STATUSES = new Set(['Lost', 'Closed', 'Cancelled', 'No-Bid', 'Withdrawn']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const designStageOf = (row: TenderOpportunity) => {
  const stage = row.stage;
  const status = row.status;
  if (status === 'Awarded' || stage === 'Awarded') return 'Awarded';
  if (stage === 'Negotiation' || status === 'Negotiation') return 'Under Negotiation';
  if (stage === 'Submitted' || status === 'Submitted') return 'Submitted';
  if (stage === 'Under Review' || status === 'Under Review') return 'Awaiting Approval';
  if (stage === 'Bid Preparation' || status === 'Bid Preparation' || status === 'Open') return 'Bid Preparation';
  return 'Qualification';
};

const dayStamp = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
};

const deadlineStatus = (row: TenderOpportunity): 'In Progress' | 'Review' | 'Drafting' => {
  if (row.status === 'Draft') return 'Drafting';
  if (row.status === 'Under Review' || row.stage === 'Under Review') return 'Review';
  return 'In Progress';
};

export const buildTenderDashboard = async (): Promise<TenderDashboard> => {
  const rows = await listOpportunities();
  const now = new Date();
  const startThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startLast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const inRange = (value: string, from: Date, to: Date) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed >= from && parsed < to;
  };
  const thisMonth = rows.filter((row) => inRange(row.createdAt, startThis, now));
  const lastMonth = rows.filter((row) => inRange(row.createdAt, startLast, startThis));
  const countWhere = (list: TenderOpportunity[], predicate: (row: TenderOpportunity) => boolean) => list.filter(predicate).length;
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const openStatuses = new Set(['Open', 'Under Review', 'Prequalification', 'Invited', 'Bid Preparation']);
  const closingSoon = rows.filter((row) => {
    if (!row.submissionDeadline && !row.closingDate) return false;
    const deadline = new Date(row.submissionDeadline || row.closingDate);
    return !Number.isNaN(deadline.getTime()) && deadline >= now && deadline <= soon && !['Awarded', 'Closed', 'Lost', 'Cancelled', 'No-Bid'].includes(row.status);
  }).length;

  const typeLabels = ['Client Bid', 'Supplier Tender', 'Enquiry', 'Framework Agreement', 'Other'];
  const stageLabels = ['Enquiry', 'Prequalification', 'Bid Preparation', 'Under Review', 'Submitted', 'Negotiation', 'Awarded'];
  const bucket = (label: string, list: string[]) => (list.includes(label) ? label : 'Other');
  const byType = typeLabels.map((label) => {
    const matched = rows.filter((row) => bucket(row.tenderType, typeLabels) === label);
    return { label, count: matched.length, value: matched.reduce((sum, row) => sum + row.estimatedValue, 0) };
  });
  const byStage = stageLabels.map((label) => {
    const matched = rows.filter((row) => row.stage === label);
    return { label, count: matched.length, value: matched.reduce((sum, row) => sum + row.estimatedValue, 0) };
  });
  const statusLabels = ['Open', 'Under Review', 'Prequalification', 'Closed', 'Awarded', 'Draft'];
  const byStatus = statusLabels.map((label) => ({ label, count: rows.filter((row) => row.status === label).length }));
  const decided = rows.filter((row) => ['Awarded', 'Lost', 'Closed', 'No-Bid'].includes(row.status));
  const awarded = rows.filter((row) => row.status === 'Awarded' || row.stage === 'Awarded');
  const isEnquiry = (row: TenderOpportunity) => row.stage === 'Enquiry' || row.tenderType === 'Enquiry' || row.opportunityType === 'Enquiry';
  const isActive = (row: TenderOpportunity) => !TERMINAL_STATUSES.has(row.status) && row.status !== 'Draft';
  const activeRows = rows.filter(isActive);
  const pipelineRows = rows.filter((row) => !TERMINAL_STATUSES.has(row.status));
  const pipelineStages = PIPELINE_STAGE_LABELS.map((label) => {
    const matched = pipelineRows.filter((row) => designStageOf(row) === label);
    return { label, count: matched.length, value: matched.reduce((sum, row) => sum + row.estimatedValue, 0) };
  });
  const awaitingRows = pipelineRows.filter((row) => designStageOf(row) === 'Awaiting Approval');
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const last12Start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const outcomeOf = (row: TenderOpportunity) => {
    if (row.status === 'Awarded' || row.stage === 'Awarded') return 'won' as const;
    if (row.status === 'Lost') return 'lost' as const;
    if (['Cancelled', 'No-Bid', 'Withdrawn'].includes(row.status)) return 'withdrawn' as const;
    return null;
  };
  const winLossFor = (from: Date, to: Date) => {
    const tally = { won: 0, lost: 0, withdrawn: 0 };
    for (const row of rows) {
      const outcome = outcomeOf(row);
      if (!outcome || !inRange(row.updatedAt || row.createdAt, from, to)) continue;
      tally[outcome] += 1;
    }
    return tally;
  };
  const rateOf = (tally: { won: number; lost: number; withdrawn: number }) => {
    const total = tally.won + tally.lost + tally.withdrawn;
    return total ? Math.round((tally.won / total) * 100) : null;
  };
  const thisYearLoss = winLossFor(yearStart, now);
  const lastYearLoss = winLossFor(lastYearStart, yearStart);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const deadlines = pipelineRows
    .map((row) => {
      const submissionDate = row.submissionDeadline || row.closingDate;
      const stamp = dayStamp(submissionDate);
      if (stamp == null) return null;
      const daysLeft = Math.round((stamp - todayUtc) / 86400000);
      return {
        id: row.id,
        referenceNo: row.referenceNo,
        title: row.title,
        clientName: row.clientName,
        submissionDate,
        daysLeft,
        statusLabel: deadlineStatus(row),
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row && row.daysLeft >= -3)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  const pool = await ensureTenderDb();
  const extra = await pool.request().query(`
    SELECT [SubmittedAt] AS [At] FROM [commercial].[TenderSubmissions];
    SELECT COALESCE(CONVERT(varchar(10), [AwardDate], 23), CONVERT(varchar(33), [CreatedAt], 126)) AS [At] FROM [commercial].[TenderAwards];
    SELECT i.[ItemId], i.[OpportunityId], i.[Title], i.[Details], i.[Status], i.[DueAt], i.[Kind],
           o.[ReferenceNo], o.[Title] AS [OpportunityTitle]
    FROM [commercial].[TenderItems] i
    LEFT JOIN [commercial].[TenderOpportunities] o ON o.[OpportunityId] = i.[OpportunityId]
    WHERE UPPER(ISNULL(i.[Status], N'')) NOT IN (N'DONE', N'CLOSED', N'CANCELLED', N'COMPLETE', N'COMPLETED')
    ORDER BY CASE WHEN i.[DueAt] IS NULL THEN 1 ELSE 0 END, i.[DueAt];
  `);
  const recordsets = Array.isArray(extra.recordsets) ? extra.recordsets : Object.values(extra.recordsets || {});
  const submissionDates = ((recordsets[0] || []) as Array<{ At?: unknown }>).map((row) => iso(row.At));
  const awardDates = ((recordsets[1] || []) as Array<{ At?: unknown }>).map((row) => iso(row.At));
  const activity = MONTHS.map((month, index) => {
    const from = new Date(Date.UTC(now.getUTCFullYear(), index, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), index + 1, 1));
    return {
      month,
      opportunities: rows.filter((row) => inRange(row.createdAt, from, to)).length,
      submissions: submissionDates.filter((value) => inRange(value, from, to)).length,
      awards: awardDates.filter((value) => inRange(value, from, to)).length,
    };
  });

  const dueBadge = (daysLeft: number | null) => {
    if (daysLeft == null) return 'Open';
    if (daysLeft < 0) return 'Overdue';
    if (daysLeft === 0) return 'Due today';
    if (daysLeft === 1) return 'Due in 1 day';
    return `Due in ${daysLeft} days`;
  };
  const itemActions = ((recordsets[2] || []) as Array<Record<string, unknown>>).slice(0, 5).map((row) => {
    const due = iso(row.DueAt);
    const stamp = dayStamp(due);
    const daysLeft = stamp == null ? null : Math.round((stamp - todayUtc) / 86400000);
    const tone = daysLeft != null && daysLeft <= 2 ? 'urgent' as const : daysLeft != null && daysLeft <= 7 ? 'due' as const : clean(row.Kind, 40).toUpperCase() === 'TASK' ? 'open' as const : 'pending' as const;
    return {
      id: clean(row.ItemId, 40),
      opportunityId: clean(row.OpportunityId, 40),
      referenceNo: clean(row.ReferenceNo, 80),
      title: clean(row.Title, 300),
      detail: [clean(row.ReferenceNo, 80), clean(row.OpportunityTitle, 300) || clean(row.Details, 180)].filter(Boolean).join(' · '),
      tone,
      badge: daysLeft != null && daysLeft <= 2 ? 'Urgent' : daysLeft != null ? dueBadge(daysLeft) : 'Pending',
    };
  });
  const seen = new Set(itemActions.map((item) => item.opportunityId));
  const derived: TenderDashboard['actions'] = [];
  for (const row of pipelineRows) {
    if (derived.length + itemActions.length >= 5 || seen.has(row.id)) continue;
    const deadline = row.submissionDeadline || row.closingDate;
    const stamp = dayStamp(deadline);
    const daysLeft = stamp == null ? null : Math.round((stamp - todayUtc) / 86400000);
    const clarification = dayStamp(row.clarificationDeadline);
    const clarificationDays = clarification == null ? null : Math.round((clarification - todayUtc) / 86400000);
    if (daysLeft != null && daysLeft <= 7) {
      derived.push({ id: `due-${row.id}`, opportunityId: row.id, referenceNo: row.referenceNo, title: 'Complete technical proposal', detail: `${row.referenceNo} · ${row.title}`, tone: 'urgent', badge: 'Urgent' });
    } else if (designStageOf(row) === 'Awaiting Approval') {
      derived.push({ id: `approval-${row.id}`, opportunityId: row.id, referenceNo: row.referenceNo, title: 'Commercial bid approval pending', detail: `${row.referenceNo} · ${row.title}`, tone: 'pending', badge: 'Pending' });
    } else if (clarificationDays != null && clarificationDays >= 0 && clarificationDays <= 14) {
      derived.push({ id: `clarify-${row.id}`, opportunityId: row.id, referenceNo: row.referenceNo, title: 'Respond to client clarification', detail: `${row.referenceNo} · ${row.title}`, tone: 'due', badge: dueBadge(clarificationDays) });
    } else if (!row.ownerName) {
      derived.push({ id: `team-${row.id}`, opportunityId: row.id, referenceNo: row.referenceNo, title: 'Assign team members', detail: `${row.referenceNo} · ${row.title}`, tone: 'open', badge: 'Open' });
    } else if (daysLeft != null && daysLeft <= 14) {
      derived.push({ id: `submit-${row.id}`, opportunityId: row.id, referenceNo: row.referenceNo, title: 'Submit final documents', detail: `${row.referenceNo} · ${row.title}`, tone: 'ready', badge: dueBadge(daysLeft) });
    }
  }

  const closedOut = new Set(['Lost', 'Cancelled', 'No-Bid', 'Withdrawn']);
  const stageRank = (row: TenderOpportunity) => {
    const text = `${row.stage} ${row.status}`.toLowerCase();
    if (text.includes('award')) return 5;
    if (text.includes('negot')) return 4;
    if (text.includes('submit') || text.includes('under review')) return 3;
    if (text.includes('bid') || text.includes('tender') || row.status === 'Open') return 2;
    if (text.includes('prequal') || text.includes('qualif') || text.includes('invit')) return 1;
    return 0;
  };
  const funnelRows = rows.filter((row) => !closedOut.has(row.status));
  const funnelLabels = ['Enquiries', 'Qualification', 'Tender/Bid', 'Submission', 'Negotiation', 'Awarded'];
  const funnelCounts = funnelLabels.map((_, index) => funnelRows.filter((row) => stageRank(row) >= index).length);
  const funnelBase = funnelCounts[0] || 0;
  const reached = (index: number, list: TenderOpportunity[]) => list.filter((row) => !closedOut.has(row.status) && stageRank(row) >= index).length;
  const sumValue = (list: TenderOpportunity[]) => list.reduce((sum, row) => sum + row.estimatedValue, 0);
  const valueBuckets = (from: Date, to: Date) => {
    const scoped = rows.filter((row) => inRange(row.updatedAt || row.createdAt, from, to));
    return {
      won: sumValue(scoped.filter((row) => row.status === 'Awarded' || row.stage === 'Awarded')),
      lost: sumValue(scoped.filter((row) => row.status === 'Lost')),
      withdrawn: sumValue(scoped.filter((row) => closedOut.has(row.status) && row.status !== 'Lost')),
      pending: sumValue(scoped.filter((row) => !closedOut.has(row.status) && row.status !== 'Awarded' && row.stage !== 'Awarded')),
    };
  };
  const valueRate = (bucket: { won: number; lost: number }) => {
    const base = bucket.won + bucket.lost;
    return base ? Math.round((bucket.won / base) * 100) : null;
  };
  const thisYearValue = valueBuckets(yearStart, now);
  const lastYearValue = valueBuckets(lastYearStart, yearStart);
  const categoryOf = (row: TenderOpportunity) => {
    const text = `${row.category} ${row.subCategory} ${row.tenderType} ${row.title}`.toLowerCase();
    if (/oil|gas|lng|petroleum|upstream/.test(text)) return 'Oil & Gas';
    if (/construct/.test(text)) return 'Construction';
    if (/fabricat/.test(text)) return 'Fabrication';
    if (/maintain/.test(text)) return 'Maintenance';
    if (/infra|power|road|bridge/.test(text)) return 'Infrastructure';
    return 'Other';
  };
  const categoryLabels = ['Oil & Gas', 'Construction', 'Fabrication', 'Maintenance', 'Infrastructure', 'Other'];
  const nigeriaStates = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];
  const regionOf = (row: TenderOpportunity) => {
    const text = `${row.location} ${row.site} ${row.projectLocation}`;
    return nigeriaStates.find((state) => new RegExp(`\\b${state}\\b`, 'i').test(text)) || '';
  };
  const regionTotals = new Map<string, number>();
  const clientTotals = new Map<string, number>();
  for (const row of funnelRows) {
    const client = row.clientName || 'Unassigned';
    clientTotals.set(client, (clientTotals.get(client) || 0) + row.estimatedValue);
    const region = regionOf(row);
    if (region) regionTotals.set(region === 'Abuja' ? 'FCT' : region, (regionTotals.get(region === 'Abuja' ? 'FCT' : region) || 0) + row.estimatedValue);
  }
  const recentStatus = (row: TenderOpportunity) => {
    if (row.status === 'Under Review' || row.stage === 'Under Review') return 'Under Review';
    if (stageRank(row) >= 1) return 'Qualified';
    return 'New';
  };
  const valueStage = (label: string, rank: number) => ({
    label,
    value: sumValue(funnelRows.filter((row) => stageRank(row) === rank)),
  });
  const oilGasDecided = rows.filter((row) => categoryOf(row) === 'Oil & Gas' && (row.status === 'Awarded' || row.stage === 'Awarded' || row.status === 'Lost'));
  const oilGasWon = oilGasDecided.filter((row) => row.status === 'Awarded' || row.stage === 'Awarded').length;
  const board: TenderDashboard['board'] = {
    enquiries: funnelCounts[0] || 0,
    enquiriesDeltaPct: percentDelta(thisMonth.length, lastMonth.length),
    qualified: funnelCounts[1] || 0,
    qualifiedDeltaPct: percentDelta(reached(1, thisMonth), reached(1, lastMonth)),
    activeTenders: funnelCounts[2] || 0,
    activeDeltaPct: percentDelta(reached(2, thisMonth), reached(2, lastMonth)),
    potentialValue: sumValue(funnelRows),
    potentialDeltaPct: percentDelta(sumValue(thisMonth), sumValue(lastMonth)),
    contractsWon: funnelCounts[5] || 0,
    contractsWonDeltaPct: percentDelta(
      rows.filter((row) => (row.status === 'Awarded' || row.stage === 'Awarded') && inRange(row.updatedAt || row.createdAt, yearStart, now)).length,
      rows.filter((row) => (row.status === 'Awarded' || row.stage === 'Awarded') && inRange(row.updatedAt || row.createdAt, lastYearStart, yearStart)).length,
    ),
    winRateValuePct: valueRate(thisYearValue),
    winRateValueDeltaPct: (() => {
      const current = valueRate(thisYearValue);
      const previous = valueRate(lastYearValue);
      if (current == null || previous == null) return current == null ? null : current;
      return current - previous;
    })(),
    funnel: funnelLabels.map((label, index) => ({
      label,
      count: funnelCounts[index] || 0,
      pct: funnelBase ? Math.round(((funnelCounts[index] || 0) / funnelBase) * 100) : 0,
    })),
    valueByStage: [valueStage('Enquiries', 0), valueStage('Qualified', 1), valueStage('Tender', 2), valueStage('Negotiation', 4), valueStage('Awarded', 5)],
    categories: categoryLabels.map((label) => ({ label, count: funnelRows.filter((row) => categoryOf(row) === label).length })),
    clients: Array.from(clientTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value })),
    regions: Array.from(regionTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value })),
    deadlines: funnelRows
      .map((row) => {
        const date = row.submissionDeadline || row.closingDate;
        const stamp = dayStamp(date);
        if (!date || stamp == null) return null;
        return { id: row.id, date, title: row.title, client: row.clientName, stage: funnelLabels[stageRank(row)] || row.stage, daysLeft: Math.round((stamp - todayUtc) / 86400000) };
      })
      .filter((row): row is NonNullable<typeof row> => !!row && row.daysLeft >= -3)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5),
    approvals: awaitingRows.slice(0, 5).map((row) => ({
      id: row.id,
      title: row.title,
      value: row.estimatedValue,
      stage: row.department || 'Commercial',
      priority: row.priority || 'Medium',
    })),
    recent: [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5).map((row) => ({
      id: row.id,
      date: row.createdAt,
      title: row.title,
      client: row.clientName,
      status: recentStatus(row),
    })),
    winLossValue: { thisYear: thisYearValue, last12: valueBuckets(last12Start, now) },
    activityRolling: Array.from({ length: 12 }, (_, index) => {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
      const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
      return {
        month: MONTHS[from.getUTCMonth()] || '',
        enquiries: rows.filter((row) => inRange(row.createdAt, from, to)).length,
        submissions: submissionDates.filter((value) => inRange(value, from, to)).length,
        awards: awardDates.filter((value) => inRange(value, from, to)).length,
      };
    }),
    insights: {
      oilGasWinPct: oilGasDecided.length ? Math.round((oilGasWon / oilGasDecided.length) * 100) : null,
      qualifiedValue: sumValue(funnelRows.filter((row) => stageRank(row) === 1)),
      highRisk: funnelRows.filter((row) => /high|urgent|critical/i.test(row.priority) || (dayStamp(row.submissionDeadline || row.closingDate) != null && Math.round(((dayStamp(row.submissionDeadline || row.closingDate) || 0) - todayUtc) / 86400000) <= 14 && stageRank(row) < 5)).length,
    },
    actionCount: itemActions.length + derived.length,
  };

  return {
    total: rows.length,
    enquiries: countWhere(rows, isEnquiry),
    openTenders: countWhere(rows, (row) => row.status === 'Open' || openStatuses.has(row.stage)),
    invitations: countWhere(rows, (row) => row.stage === 'Invited' || row.status === 'Invited'),
    prequalification: countWhere(rows, (row) => row.stage === 'Prequalification' || row.status === 'Prequalification'),
    closingSoon,
    pipelineValue: pipelineRows.reduce((sum, row) => sum + row.estimatedValue, 0),
    awardedValue: awarded.reduce((sum, row) => sum + row.estimatedValue, 0),
    winRatePct: rateOf(winLossFor(last12Start, now)) ?? (decided.length ? Math.round((awarded.length / decided.length) * 100) : null),
    activeTenders: activeRows.length,
    activeDeltaPct: percentDelta(countWhere(thisMonth, isActive), countWhere(lastMonth, isActive)),
    pipelineDeltaPct: percentDelta(
      thisMonth.reduce((sum, row) => sum + row.estimatedValue, 0),
      lastMonth.reduce((sum, row) => sum + row.estimatedValue, 0),
    ),
    winRateDeltaPct: (() => {
      const current = rateOf(thisYearLoss);
      const previous = rateOf(lastYearLoss);
      if (current == null || previous == null) return current == null ? null : current;
      return current - previous;
    })(),
    awaitingApproval: awaitingRows.length,
    awaitingNewThisWeek: awaitingRows.filter((row) => inRange(row.createdAt, weekAgo, now)).length,
    pipelineStages,
    activity,
    winLoss: { last12: winLossFor(last12Start, now), thisYear: thisYearLoss },
    deadlines,
    actions: [...itemActions, ...derived].slice(0, 5),
    board,
    monthDelta: {
      total: percentDelta(thisMonth.length, lastMonth.length),
      enquiries: percentDelta(countWhere(thisMonth, isEnquiry), countWhere(lastMonth, isEnquiry)),
      openTenders: percentDelta(
        countWhere(thisMonth, (row) => row.status === 'Open'),
        countWhere(lastMonth, (row) => row.status === 'Open'),
      ),
      invitations: percentDelta(
        countWhere(thisMonth, (row) => row.stage === 'Invited'),
        countWhere(lastMonth, (row) => row.stage === 'Invited'),
      ),
      prequalification: percentDelta(
        countWhere(thisMonth, (row) => row.stage === 'Prequalification'),
        countWhere(lastMonth, (row) => row.stage === 'Prequalification'),
      ),
    },
    byType,
    byStage,
    byStatus,
    latest: rows.slice(0, 6),
  };
};

export const listTenderLookups = async (): Promise<TenderLookups> => {
  const payload = await readSystemDepartmentsFromOrganizationDb();
  const departments = (payload.departments || [])
    .map((department) => ({
      id: department.id,
      name: department.name,
      code: department.code || '',
    }))
    .filter((department) => department.name);
  const businessUnits = Array.from(
    new Set(
      (payload.departments || [])
        .flatMap((department) => [department.parentName || '', ...(department.parentChain || [])])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const locations: TenderLookups['locations'] = [];
  const sites: TenderLookups['sites'] = [];
  try {
    const pool = await getDleEnterpriseDbPool();
    if (pool) {
      const result = await pool.request().query(`
        SELECT [Id], [Name], [CostCenter], [Region], [RecordType], [Location]
        FROM [hris].[OrganizationLocationsSites]
        WHERE [RecordType] IN (N'Location', N'Site')
        ORDER BY [Name]
      `);
      for (const row of result.recordset) {
        const name = clean(row.Name || row.Location, 180);
        if (!name) continue;
        const option = {
          id: clean(row.Id, 80),
          name,
          code: clean(row.CostCenter, 80),
          region: clean(row.Region, 80),
        };
        if (clean(row.RecordType, 20) === 'Site') sites.push(option);
        else locations.push(option);
      }
    }
  } catch {
    // Location register is optional until organization sites have been published.
  }
  return { departments, locations, sites, businessUnits };
};

export const documentsRoot = () => path.join(resolveRepoRoot(), 'data', 'commercial', 'tender-documents');

export const listDocuments = async (opportunityId: string): Promise<TenderDocument[]> => {
  const pool = await ensureTenderDb();
  const result = await pool
    .request()
    .input('Id', sql.NVarChar(40), clean(opportunityId, 40))
    .query(`
      SELECT [DocumentId],[OpportunityId],[FileName],[Category],[ContentType],[SizeBytes],[UploadedBy],[UploadedAt]
      FROM [commercial].[TenderDocuments]
      WHERE [OpportunityId]=@Id
      ORDER BY [UploadedAt] DESC
    `);
  return result.recordset.map((row) => ({
    id: clean(row.DocumentId, 40),
    opportunityId: clean(row.OpportunityId, 40),
    fileName: clean(row.FileName, 260),
    category: clean(row.Category, 80),
    contentType: clean(row.ContentType, 120),
    sizeBytes: num(row.SizeBytes),
    uploadedBy: clean(row.UploadedBy, 120),
    uploadedAt: iso(row.UploadedAt),
  }));
};

export const saveDocument = async (
  opportunityId: string,
  file: { name: string; type: string; bytes: Buffer },
  category: string,
  actor: string,
) => {
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) throw new Error('Opportunity was not found.');
  const safeName = clean(file.name, 180).replace(/[^\w.\- ()]+/g, '_') || 'document';
  const id = idFor('TDOC');
  const storageKey = path.join(opportunityId, `${id}-${safeName}`);
  const absolute = path.join(documentsRoot(), storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, file.bytes);
  const pool = await ensureTenderDb();
  await pool
    .request()
    .input('Id', sql.NVarChar(40), id)
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('FileName', sql.NVarChar(260), safeName)
    .input('Category', sql.NVarChar(80), clean(category, 80) || 'General')
    .input('ContentType', sql.NVarChar(120), clean(file.type, 120) || 'application/octet-stream')
    .input('SizeBytes', sql.BigInt, file.bytes.length)
    .input('StorageKey', sql.NVarChar(500), storageKey)
    .input('UploadedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [commercial].[TenderDocuments]
        ([DocumentId],[OpportunityId],[FileName],[Category],[ContentType],[SizeBytes],[StorageKey],[UploadedBy])
      VALUES (@Id,@OpportunityId,@FileName,@Category,@ContentType,@SizeBytes,@StorageKey,@UploadedBy)
    `);
  await audit(pool, opportunityId, actor, 'DOCUMENT_UPLOADED', safeName);
  return listDocuments(opportunityId);
};

export const getDocumentFile = async (documentId: string) => {
  const pool = await ensureTenderDb();
  const result = await pool
    .request()
    .input('Id', sql.NVarChar(40), clean(documentId, 40))
    .query(`
      SELECT [DocumentId],[FileName],[ContentType],[StorageKey]
      FROM [commercial].[TenderDocuments]
      WHERE [DocumentId]=@Id
    `);
  const row = result.recordset[0];
  if (!row) return null;
  const storageKey = clean(row.StorageKey, 500);
  if (storageKey.includes('..')) return null;
  return {
    fileName: clean(row.FileName, 260),
    contentType: clean(row.ContentType, 120) || 'application/octet-stream',
    absolutePath: path.join(documentsRoot(), storageKey),
  };
};

export const listLines = async (opportunityId: string): Promise<TenderLine[]> => {
  const pool = await ensureTenderDb();
  const result = await pool
    .request()
    .input('Id', sql.NVarChar(40), clean(opportunityId, 40))
    .query(`
      SELECT [LineId],[OpportunityId],[SectionName],[Description],[Quantity],[Unit],[UnitCost],[MarkupPct],[CreatedAt],[CreatedBy]
      FROM [commercial].[TenderLines] WHERE [OpportunityId]=@Id ORDER BY [CreatedAt]
    `);
  return result.recordset.map((row) => {
    const quantity = num(row.Quantity);
    const unitCost = num(row.UnitCost);
    const markupPct = num(row.MarkupPct);
    return {
      id: clean(row.LineId, 40),
      opportunityId: clean(row.OpportunityId, 40),
      section: clean(row.SectionName, 120),
      description: clean(row.Description, 300),
      quantity,
      unit: clean(row.Unit, 25) || 'ea',
      unitCost,
      markupPct,
      sell: quantity * unitCost * (1 + markupPct / 100),
      createdAt: iso(row.CreatedAt),
      createdBy: clean(row.CreatedBy, 120),
    };
  });
};

export const addLine = async (
  opportunityId: string,
  input: { section?: string; description: string; quantity: number; unit?: string; unitCost: number; markupPct?: number },
  actor: string,
) => {
  if (!(await getOpportunity(opportunityId))) throw new Error('Opportunity was not found.');
  if (!clean(input.description, 300)) throw new Error('Line description is required.');
  const pool = await ensureTenderDb();
  await pool
    .request()
    .input('Id', sql.NVarChar(40), idFor('TLN'))
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('SectionName', sql.NVarChar(120), clean(input.section, 120) || 'General')
    .input('Description', sql.NVarChar(300), clean(input.description, 300))
    .input('Quantity', sql.Decimal(19, 4), num(input.quantity, 1))
    .input('Unit', sql.NVarChar(25), clean(input.unit, 25) || 'ea')
    .input('UnitCost', sql.Decimal(19, 2), num(input.unitCost))
    .input('MarkupPct', sql.Decimal(9, 2), num(input.markupPct))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [commercial].[TenderLines]
        ([LineId],[OpportunityId],[SectionName],[Description],[Quantity],[Unit],[UnitCost],[MarkupPct],[CreatedBy])
      VALUES (@Id,@OpportunityId,@SectionName,@Description,@Quantity,@Unit,@UnitCost,@MarkupPct,@CreatedBy)
    `);
  await audit(pool, opportunityId, actor, 'LINE_ADDED', clean(input.description, 300));
  return listLines(opportunityId);
};

export const listApprovals = async (opportunityId?: string): Promise<TenderApproval[]> => {
  const pool = await ensureTenderDb();
  const request = pool.request();
  const where = opportunityId ? 'WHERE [OpportunityId]=@Id' : '';
  if (opportunityId) request.input('Id', sql.NVarChar(40), clean(opportunityId, 40));
  const result = await request.query(`
    SELECT [ApprovalId],[OpportunityId],[StageName],[Decision],[ActorName],[Comments],[CreatedAt]
    FROM [commercial].[TenderApprovals] ${where}
    ORDER BY [CreatedAt] DESC
  `);
  return result.recordset.map((row) => ({
    id: clean(row.ApprovalId, 40),
    opportunityId: clean(row.OpportunityId, 40),
    stage: clean(row.StageName, 40),
    decision: clean(row.Decision, 20),
    actor: clean(row.ActorName, 120),
    comments: clean(row.Comments),
    createdAt: iso(row.CreatedAt),
  }));
};

export const addApproval = async (
  opportunityId: string,
  input: { stage: string; decision: string; comments?: string },
  actor: string,
) => {
  if (!(await getOpportunity(opportunityId))) throw new Error('Opportunity was not found.');
  const decision = clean(input.decision, 20) || 'APPROVE';
  const pool = await ensureTenderDb();
  await pool
    .request()
    .input('Id', sql.NVarChar(40), idFor('TAP'))
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('StageName', sql.NVarChar(40), clean(input.stage, 40) || 'COMMERCIAL')
    .input('Decision', sql.NVarChar(20), decision)
    .input('ActorName', sql.NVarChar(120), clean(actor, 120))
    .input('Comments', sql.NVarChar(sql.MAX), clean(input.comments))
    .query(`
      INSERT INTO [commercial].[TenderApprovals] ([ApprovalId],[OpportunityId],[StageName],[Decision],[ActorName],[Comments])
      VALUES (@Id,@OpportunityId,@StageName,@Decision,@ActorName,@Comments)
    `);
  if (decision === 'APPROVE') {
    await pool.request().input('Id', sql.NVarChar(40), opportunityId).query(`
      UPDATE [commercial].[TenderOpportunities]
      SET [Status]=N'Open', [Stage]=N'Bid Preparation', [UpdatedAt]=SYSUTCDATETIME()
      WHERE [OpportunityId]=@Id AND [Status]=N'Under Review'
    `);
  }
  if (decision === 'REJECT') {
    await pool.request().input('Id', sql.NVarChar(40), opportunityId).query(`
      UPDATE [commercial].[TenderOpportunities]
      SET [Status]=N'Closed', [UpdatedAt]=SYSUTCDATETIME()
      WHERE [OpportunityId]=@Id
    `);
  }
  await audit(pool, opportunityId, actor, `APPROVAL_${decision}`, clean(input.stage, 40));
  return listApprovals(opportunityId);
};

export const listSubmissions = async (opportunityId?: string): Promise<TenderSubmission[]> => {
  const pool = await ensureTenderDb();
  const request = pool.request();
  const where = opportunityId ? 'WHERE [OpportunityId]=@Id' : '';
  if (opportunityId) request.input('Id', sql.NVarChar(40), clean(opportunityId, 40));
  const result = await request.query(`
    SELECT [SubmissionId],[OpportunityId],[Channel],[ReceiptReference],[SubmittedBy],[SubmittedAt],[Notes]
    FROM [commercial].[TenderSubmissions] ${where} ORDER BY [SubmittedAt] DESC
  `);
  return result.recordset.map((row) => ({
    id: clean(row.SubmissionId, 40),
    opportunityId: clean(row.OpportunityId, 40),
    channel: clean(row.Channel, 80),
    receiptReference: clean(row.ReceiptReference, 150),
    submittedBy: clean(row.SubmittedBy, 120),
    submittedAt: iso(row.SubmittedAt),
    notes: clean(row.Notes),
  }));
};

export const addSubmission = async (
  opportunityId: string,
  input: { channel: string; receiptReference: string; notes?: string },
  actor: string,
) => {
  if (!clean(input.channel, 80) || !clean(input.receiptReference, 150)) {
    throw new Error('Submission channel and receipt reference are required.');
  }
  if (!(await getOpportunity(opportunityId))) throw new Error('Opportunity was not found.');
  const pool = await ensureTenderDb();
  await pool
    .request()
    .input('Id', sql.NVarChar(40), idFor('TSUB'))
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('Channel', sql.NVarChar(80), clean(input.channel, 80))
    .input('ReceiptReference', sql.NVarChar(150), clean(input.receiptReference, 150))
    .input('SubmittedBy', sql.NVarChar(120), clean(actor, 120))
    .input('Notes', sql.NVarChar(sql.MAX), clean(input.notes))
    .query(`
      INSERT INTO [commercial].[TenderSubmissions]
        ([SubmissionId],[OpportunityId],[Channel],[ReceiptReference],[SubmittedBy],[Notes])
      VALUES (@Id,@OpportunityId,@Channel,@ReceiptReference,@SubmittedBy,@Notes)
    `);
  await pool.request().input('Id', sql.NVarChar(40), opportunityId).query(`
    UPDATE [commercial].[TenderOpportunities]
    SET [Status]=N'Submitted', [Stage]=N'Submitted', [UpdatedAt]=SYSUTCDATETIME()
    WHERE [OpportunityId]=@Id
  `);
  await audit(pool, opportunityId, actor, 'SUBMITTED', clean(input.receiptReference, 150));
  return listSubmissions(opportunityId);
};

export const listAwards = async (opportunityId?: string): Promise<TenderAward[]> => {
  const pool = await ensureTenderDb();
  const request = pool.request();
  const where = opportunityId ? 'WHERE [OpportunityId]=@Id' : '';
  if (opportunityId) request.input('Id', sql.NVarChar(40), clean(opportunityId, 40));
  const result = await request.query(`
    SELECT [AwardId],[OpportunityId],[ContractRef],[AwardedValue],[AwardDate],[HandoverOwner],[HandoverNotes],[CreatedAt],[CreatedBy]
    FROM [commercial].[TenderAwards] ${where} ORDER BY [CreatedAt] DESC
  `);
  return result.recordset.map((row) => ({
    id: clean(row.AwardId, 40),
    opportunityId: clean(row.OpportunityId, 40),
    contractRef: clean(row.ContractRef, 100),
    awardedValue: num(row.AwardedValue),
    awardDate: row.AwardDate ? String(row.AwardDate).slice(0, 10) : '',
    handoverOwner: clean(row.HandoverOwner, 120),
    handoverNotes: clean(row.HandoverNotes),
    createdAt: iso(row.CreatedAt),
    createdBy: clean(row.CreatedBy, 120),
  }));
};

export const addAward = async (
  opportunityId: string,
  input: { contractRef: string; awardedValue: number; awardDate?: string; handoverOwner?: string; handoverNotes?: string },
  actor: string,
) => {
  if (!clean(input.contractRef, 100)) throw new Error('Contract reference is required.');
  if (!(await getOpportunity(opportunityId))) throw new Error('Opportunity was not found.');
  const pool = await ensureTenderDb();
  await pool
    .request()
    .input('Id', sql.NVarChar(40), idFor('TAW'))
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('ContractRef', sql.NVarChar(100), clean(input.contractRef, 100))
    .input('AwardedValue', sql.Decimal(19, 2), num(input.awardedValue))
    .input('AwardDate', sql.Date, dateOrNull(input.awardDate) || new Date())
    .input('HandoverOwner', sql.NVarChar(120), clean(input.handoverOwner, 120) || clean(actor, 120))
    .input('HandoverNotes', sql.NVarChar(sql.MAX), clean(input.handoverNotes))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [commercial].[TenderAwards]
        ([AwardId],[OpportunityId],[ContractRef],[AwardedValue],[AwardDate],[HandoverOwner],[HandoverNotes],[CreatedBy])
      VALUES (@Id,@OpportunityId,@ContractRef,@AwardedValue,@AwardDate,@HandoverOwner,@HandoverNotes,@CreatedBy)
    `);
  await pool.request().input('Id', sql.NVarChar(40), opportunityId).query(`
    UPDATE [commercial].[TenderOpportunities]
    SET [Status]=N'Awarded', [Stage]=N'Awarded', [UpdatedAt]=SYSUTCDATETIME()
    WHERE [OpportunityId]=@Id
  `);
  await audit(pool, opportunityId, actor, 'AWARDED', clean(input.contractRef, 100));
  return listAwards(opportunityId);
};

export const listItems = async (opportunityId?: string, kind?: string): Promise<TenderItem[]> => {
  const pool = await ensureTenderDb();
  const request = pool.request();
  const filters = [];
  if (opportunityId) {
    request.input('Id', sql.NVarChar(40), clean(opportunityId, 40));
    filters.push('[OpportunityId]=@Id');
  }
  if (kind) {
    request.input('Kind', sql.NVarChar(40), clean(kind, 40));
    filters.push('[Kind]=@Kind');
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await request.query(`
    SELECT [ItemId],[OpportunityId],[Kind],[Title],[Details],[Status],[Assignee],[DueAt],[CreatedAt],[CreatedBy]
    FROM [commercial].[TenderItems] ${where} ORDER BY [CreatedAt] DESC
  `);
  return result.recordset.map((row) => ({
    id: clean(row.ItemId, 40),
    opportunityId: clean(row.OpportunityId, 40),
    kind: clean(row.Kind, 40),
    title: clean(row.Title, 300),
    details: clean(row.Details),
    status: clean(row.Status, 30),
    assignee: clean(row.Assignee, 120),
    dueAt: row.DueAt ? String(row.DueAt).slice(0, 10) : '',
    createdAt: iso(row.CreatedAt),
    createdBy: clean(row.CreatedBy, 120),
  }));
};

export const addItem = async (
  opportunityId: string,
  input: { kind: string; title: string; details?: string; assignee?: string; dueAt?: string },
  actor: string,
) => {
  if (!clean(input.title, 300)) throw new Error('Title is required.');
  if (!(await getOpportunity(opportunityId))) throw new Error('Opportunity was not found.');
  const pool = await ensureTenderDb();
  await pool
    .request()
    .input('Id', sql.NVarChar(40), idFor('TIT'))
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('Kind', sql.NVarChar(40), clean(input.kind, 40) || 'TASK')
    .input('Title', sql.NVarChar(300), clean(input.title, 300))
    .input('Details', sql.NVarChar(sql.MAX), clean(input.details))
    .input('Assignee', sql.NVarChar(120), clean(input.assignee, 120))
    .input('DueAt', sql.Date, dateOrNull(input.dueAt))
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      INSERT INTO [commercial].[TenderItems]
        ([ItemId],[OpportunityId],[Kind],[Title],[Details],[Assignee],[DueAt],[CreatedBy])
      VALUES (@Id,@OpportunityId,@Kind,@Title,@Details,@Assignee,@DueAt,@CreatedBy)
    `);
  await audit(pool, opportunityId, actor, 'ITEM_ADDED', `${clean(input.kind, 40)} ${clean(input.title, 300)}`);
  return listItems(opportunityId);
};

export const updateItemStatus = async (itemId: string, status: string, actor: string) => {
  const pool = await ensureTenderDb();
  const result = await pool
    .request()
    .input('Id', sql.NVarChar(40), clean(itemId, 40))
    .input('Status', sql.NVarChar(30), clean(status, 30) || 'DONE')
    .query(`UPDATE [commercial].[TenderItems] SET [Status]=@Status WHERE [ItemId]=@Id`);
  if (!result.rowsAffected[0]) throw new Error('Record was not found.');
  await audit(pool, null, actor, 'ITEM_STATUS', `${itemId} ${status}`);
};

export const listAudit = async (opportunityId?: string): Promise<TenderAuditEvent[]> => {
  const pool = await ensureTenderDb();
  const request = pool.request();
  const where = opportunityId ? 'WHERE [OpportunityId]=@Id' : '';
  if (opportunityId) request.input('Id', sql.NVarChar(40), clean(opportunityId, 40));
  const result = await request.query(`
    SELECT TOP 200 [AuditId],[OpportunityId],[ActorName],[ActionName],[Details],[CreatedAt]
    FROM [commercial].[TenderAudit] ${where}
    ORDER BY [AuditId] DESC
  `);
  return result.recordset.map((row) => ({
    id: num(row.AuditId),
    opportunityId: clean(row.OpportunityId, 40),
    actor: clean(row.ActorName, 120),
    action: clean(row.ActionName, 90),
    details: clean(row.Details),
    createdAt: iso(row.CreatedAt),
  }));
};

export const listSettings = async () => {
  const pool = await ensureTenderDb();
  const result = await pool.request().query(`
    SELECT [SettingKey],[SettingValue],[UpdatedAt],[UpdatedBy]
    FROM [commercial].[TenderSettings]
    ORDER BY [SettingKey]
  `);
  return result.recordset.map((row) => ({
    key: clean(row.SettingKey, 90),
    value: clean(row.SettingValue),
    updatedAt: iso(row.UpdatedAt),
    updatedBy: clean(row.UpdatedBy, 120),
  }));
};

export const upsertSetting = async (key: string, value: string, actor: string) => {
  const settingKey = clean(key, 90);
  if (!settingKey) throw new Error('Setting key is required.');
  const pool = await ensureTenderDb();
  await pool
    .request()
    .input('SettingKey', sql.NVarChar(90), settingKey)
    .input('SettingValue', sql.NVarChar(sql.MAX), clean(value))
    .input('UpdatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`
      MERGE [commercial].[TenderSettings] AS target
      USING (SELECT @SettingKey AS [SettingKey]) AS source
      ON target.[SettingKey] = source.[SettingKey]
      WHEN MATCHED THEN UPDATE SET [SettingValue]=@SettingValue, [UpdatedAt]=SYSUTCDATETIME(), [UpdatedBy]=@UpdatedBy
      WHEN NOT MATCHED THEN INSERT ([SettingKey],[SettingValue],[UpdatedBy]) VALUES (@SettingKey,@SettingValue,@UpdatedBy);
    `);
  await audit(pool, null, actor, 'SETTING_SAVED', settingKey);
  return listSettings();
};
