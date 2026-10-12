import { createHash } from 'node:crypto';
import sql from 'mssql';
import { createProjectRecord, getProjectById } from '@/lib/projects-engineering/project-store';
import type { BlueprintViewer, TenderBlueprint } from '@/lib/commercial/tender-types';
import {
  ensureTenderDb,
  getOpportunity,
  listAwards,
  listItems,
  listLines,
  listSettings,
} from '@/lib/commercial/tender-store';

const COMPANY = 'DLE';
const RULESET = 'rules-1.0';

const clean = (value: unknown, max = 4000) => String(value ?? '').trim().slice(0, max);
const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const iso = (value: unknown) => {
  if (!value) return '';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};
const idFor = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const audit = async (pool: sql.ConnectionPool, opportunityId: string | null, actor: string, action: string, details: string) => {
  await pool.request()
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('ActorName', sql.NVarChar(120), clean(actor, 120) || 'Commercial User')
    .input('ActionName', sql.NVarChar(90), clean(action, 90))
    .input('Details', sql.NVarChar(sql.MAX), clean(details))
    .query(`INSERT INTO [commercial].[TenderAudit] ([OpportunityId],[ActorName],[ActionName],[Details]) VALUES (@OpportunityId,@ActorName,@ActionName,@Details)`);
};

export const assertTenderCompany = (company: unknown) => {
  const code = clean(company, 20).toUpperCase() || COMPANY;
  if (code !== COMPANY) throw new Error('Opportunity was not found.');
  return code;
};

const requireOpportunity = async (opportunityId: string) => {
  const row = await getOpportunity(opportunityId);
  if (!row) throw new Error('Opportunity was not found.');
  return row;
};

const commercialViewer = (viewer: BlueprintViewer) =>
  Boolean(viewer.isGlobalAdmin)
  || viewer.permissions.includes('*')
  || viewer.permissions.some((item) => /commercial|finance|enterprise/i.test(item))
  || viewer.roles.some((item) => /commercial|finance|admin|executive|cfo|legal|md/i.test(item));

const technicalOnly = (viewer: BlueprintViewer) =>
  viewer.roles.some((item) => /engineer|estimator|technical/i.test(item)) && !commercialViewer(viewer);

const settingNumber = async (key: string, fallback: number) => {
  const settings = await listSettings();
  const row = settings.find((item) => item.key.toLowerCase() === key.toLowerCase());
  const value = row ? Number(row.value) : NaN;
  return Number.isFinite(value) ? value : fallback;
};

export const netPresentValue = (annualRate: number, flows: number[]) =>
  flows.reduce((sum, flow, index) => sum + flow / (1 + annualRate) ** (index + 1), 0);

export const internalRate = (flows: number[]) => {
  if (flows.length < 2 || flows.every((flow) => flow === 0)) return null;
  let rate = 0.1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let value = 0;
    let slope = 0;
    flows.forEach((flow, index) => {
      const period = index + 1;
      const base = (1 + rate) ** period;
      value += flow / base;
      slope -= (period * flow) / ((1 + rate) ** (period + 1));
    });
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) return null;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.99) return null;
    if (Math.abs(next - rate) < 1e-6) return next;
    rate = next;
  }
  return null;
};

const assertActiveEmployee = async (pool: sql.ConnectionPool, name: string, code: string) => {
  if (!name && !code) return;
  try {
    const result = await pool.request()
      .input('Code', sql.NVarChar(80), code)
      .input('Name', sql.NVarChar(180), name)
      .query(`
        SELECT TOP 1 employment_status AS Status
        FROM [hris].[Employees]
        WHERE (@Code <> N'' AND employee_code = @Code) OR (@Name <> N'' AND full_name = @Name)
      `);
    const status = clean(result.recordset[0]?.Status, 80);
    if (status && /inactive|terminated|resigned|retired|deceased|disabled/i.test(status)) {
      throw new Error('An inactive employee cannot be assigned a new tender role.');
    }
  } catch (error) {
    if (error instanceof Error && /inactive employee/i.test(error.message)) throw error;
  }
};

const rows = async (query: string, bind: (request: sql.Request) => void) => {
  const pool = await ensureTenderDb();
  const request = pool.request();
  bind(request);
  const result = await request.query(query);
  return result.recordset as Array<Record<string, unknown>>;
};

export const getTenderBlueprint = async (opportunityId: string, viewer: BlueprintViewer): Promise<TenderBlueprint> => {
  const id = clean(opportunityId, 40);
  if (id) await requireOpportunity(id);
  const where = id ? 'WHERE [OpportunityId]=@Id AND [CompanyCode]=@Company' : 'WHERE 1=0';
  const bindId = (request: sql.Request) => {
    request.input('Id', sql.NVarChar(40), id);
    request.input('Company', sql.NVarChar(20), COMPANY);
  };
  const [lots, parties, qualifications, scores, roles, rates, estimates, quotes, scenarios, periods, clauses, manifest, baselines, reviews] = await Promise.all([
    rows(`SELECT * FROM [commercial].[TenderLots] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderParties] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderQualifications] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderBidScores] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderRoles] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderRates] WHERE [CompanyCode]=@Company ORDER BY [RateCode]`, (request) => request.input('Company', sql.NVarChar(20), COMPANY)),
    rows(`SELECT * FROM [commercial].[TenderEstimates] ${where} ORDER BY [VersionNo] DESC`, bindId),
    rows(`SELECT * FROM [commercial].[TenderQuotes] ${where} ORDER BY [CreatedAt] DESC`, bindId),
    rows(`SELECT * FROM [commercial].[TenderScenarios] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderCashFlows] ${where} ORDER BY [PeriodMonth]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderClauses] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderManifest] ${where} ORDER BY [CreatedAt]`, bindId),
    rows(`SELECT * FROM [commercial].[TenderBaselines] ${where} ORDER BY [CreatedAt] DESC`, bindId),
    rows(`SELECT * FROM [commercial].[TenderAiReviews] ${where} ORDER BY [CreatedAt] DESC`, bindId),
  ]);
  const hideCommercial = technicalOnly(viewer);
  const weight = scores.reduce((sum, row) => sum + num(row.WeightPct), 0);
  const weighted = weight ? scores.reduce((sum, row) => sum + num(row.WeightPct) * num(row.Score), 0) / weight : null;
  const discountRate = await settingNumber('finance.discountRate', 0.12);
  const nets = periods.map((row) => num(row.Inflow) + num(row.Mobilization) - num(row.Outflow) - num(row.Retention) - num(row.Guarantee));
  let cumulative = 0;
  let peak = 0;
  nets.forEach((flow) => {
    cumulative += flow;
    peak = Math.min(peak, cumulative);
  });
  const settings = await listSettings();
  const limits = settings
    .filter((item) => item.key.toLowerCase().startsWith('approval.limit.'))
    .map((item) => ({ stage: item.key.slice('approval.limit.'.length), amount: num(item.value) }));
  return {
    lots: lots.map((row) => ({ id: clean(row.LotId, 40), lotCode: clean(row.LotCode, 40), title: clean(row.Title, 300), estimatedValue: num(row.EstimatedValue), currency: clean(row.Currency, 10), status: clean(row.Status, 30) })),
    parties: parties.map((row) => ({ id: clean(row.PartyId, 40), role: clean(row.RoleName, 40), name: clean(row.PartyName, 220), worksharePct: num(row.WorksharePct), liability: clean(row.Liability, 300), accessScope: clean(row.AccessScope, 300) })),
    qualifications: qualifications.map((row) => ({ id: clean(row.QualificationId, 40), certificate: clean(row.CertificateName, 220), referenceNo: clean(row.ReferenceNo, 120), expiresOn: row.ExpiresOn ? String(row.ExpiresOn).slice(0, 10) : '', eligibility: clean(row.Eligibility, 20), evidence: clean(row.Evidence) })),
    scores: scores.map((row) => ({ id: clean(row.ScoreId, 40), criterion: clean(row.Criterion, 180), weightPct: num(row.WeightPct), score: num(row.Score), overrideReason: clean(row.OverrideReason), authority: clean(row.AuthorityName, 120) })),
    weightedScore: weighted,
    bidThreshold: await settingNumber('bid.threshold', 60),
    roles: roles.map((row) => ({ id: clean(row.RoleId, 40), role: clean(row.RoleName, 80), person: clean(row.PersonName, 180), employeeCode: clean(row.EmployeeCode, 80) })),
    rates: rates.map((row) => ({ id: clean(row.RateId, 40), code: clean(row.RateCode, 40), description: clean(row.Description, 300), unit: clean(row.Unit, 25), rate: num(row.Rate), currency: clean(row.Currency, 10), locationFactor: num(row.LocationFactor, 1), effectiveFrom: row.EffectiveFrom ? String(row.EffectiveFrom).slice(0, 10) : '', approvedBy: clean(row.ApprovedBy, 120) })),
    estimates: estimates.map((row) => ({ id: clean(row.EstimateId, 40), version: num(row.VersionNo), label: clean(row.Label, 180), locked: Boolean(row.Locked), currency: clean(row.Currency, 10), fxRate: num(row.FxRate, 1), totalCost: num(row.TotalCost), totalSell: num(row.TotalSell), explanation: clean(row.Explanation), createdAt: iso(row.CreatedAt) })),
    quotes: quotes.map((row) => {
      const released = Boolean(row.ReleasedAt);
      const sealed = !released && hideCommercial;
      return {
        id: clean(row.QuoteId, 40),
        supplier: clean(row.SupplierName, 220),
        lotCode: clean(row.LotCode, 40),
        technicalNotes: clean(row.TechnicalNotes),
        commercialAmount: sealed ? null : num(row.CommercialAmount),
        currency: sealed ? '' : clean(row.Currency, 10),
        sealed: !released,
        releasedAt: iso(row.ReleasedAt),
      };
    }),
    scenarios: scenarios.map((row) => ({ id: clean(row.ScenarioId, 40), name: clean(row.ScenarioName, 40), fxRate: num(row.FxRate, 1), escalationPct: num(row.EscalationPct), productivityPct: num(row.ProductivityPct), delayDays: num(row.DelayDays), overrunPct: num(row.OverrunPct), cost: num(row.Cost), sell: num(row.Sell), margin: num(row.Margin), assumptions: clean(row.Assumptions) })),
    cashFlow: {
      periods: periods.map((row, index) => ({ id: clean(row.PeriodId, 40), month: clean(row.PeriodMonth, 7), inflow: num(row.Inflow), outflow: num(row.Outflow), retention: num(row.Retention), mobilization: num(row.Mobilization), guarantee: num(row.Guarantee), net: nets[index] || 0 })),
      npv: nets.length ? netPresentValue(discountRate, nets) : null,
      irr: internalRate(nets),
      peakFunding: peak,
      discountRate,
    },
    clauses: clauses.map((row) => ({ id: clean(row.ClauseId, 40), clauseType: clean(row.ClauseType, 80), text: clean(row.ClauseText), deviation: clean(row.Deviation), residualRisk: clean(row.ResidualRisk, 300), owner: clean(row.OwnerName, 120), acceptance: clean(row.Acceptance, 40) })),
    manifest: manifest.map((row) => ({ id: clean(row.ManifestId, 40), submissionId: clean(row.SubmissionId, 40), fileName: clean(row.FileName, 260), contentHash: clean(row.ContentHash, 64), sizeBytes: num(row.SizeBytes), createdAt: iso(row.CreatedAt) })),
    baselines: baselines.map((row) => ({ id: clean(row.BaselineId, 40), awardId: clean(row.AwardId, 40), lotCode: clean(row.LotCode, 40), projectCode: clean(row.ProjectCode, 30), acceptedBy: clean(row.AcceptedBy, 180), status: clean(row.Status, 30), createdAt: iso(row.CreatedAt) })),
    reviews: reviews.map((row) => ({ id: clean(row.ReviewId, 40), ruleset: clean(row.Ruleset, 40), finding: clean(row.Finding, 300), evidence: clean(row.Evidence), confidence: num(row.Confidence), humanDecision: clean(row.HumanDecision, 20), outcome: clean(row.Outcome) })),
    limits,
  };
};

const record = (body: Record<string, unknown>) => (body.record && typeof body.record === 'object' ? body.record as Record<string, unknown> : body);

export const saveBlueprintRecord = async (
  kind: string,
  opportunityId: string,
  body: Record<string, unknown>,
  actor: string,
  viewer: BlueprintViewer,
) => {
  const input = record(body);
  const pool = await ensureTenderDb();
  const id = clean(opportunityId, 40);

  if (kind === 'rate') {
    if (!clean(input.code, 40) || !clean(input.description, 300)) throw new Error('Rate code and description are required.');
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TRT'))
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('Code', sql.NVarChar(40), clean(input.code, 40))
      .input('Description', sql.NVarChar(300), clean(input.description, 300))
      .input('Unit', sql.NVarChar(25), clean(input.unit, 25) || 'ea')
      .input('Rate', sql.Decimal(19, 4), num(input.rate))
      .input('Currency', sql.NVarChar(10), clean(input.currency, 10) || 'NGN')
      .input('Factor', sql.Decimal(9, 4), num(input.locationFactor, 1) || 1)
      .input('EffectiveFrom', sql.Date, clean(input.effectiveFrom, 10) || null)
      .input('ApprovedBy', sql.NVarChar(120), clean(input.approvedBy, 120) || clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderRates] ([RateId],[CompanyCode],[RateCode],[Description],[Unit],[Rate],[Currency],[LocationFactor],[EffectiveFrom],[ApprovedBy]) VALUES (@Id,@Company,@Code,@Description,@Unit,@Rate,@Currency,@Factor,@EffectiveFrom,@ApprovedBy)`);
    await audit(pool, null, actor, 'RATE_SAVED', clean(input.code, 40));
    return getTenderBlueprint(id, viewer);
  }

  if (!id) throw new Error('Open an opportunity before saving this record.');
  await requireOpportunity(id);

  if (kind === 'lot') {
    if (!clean(input.title, 300)) throw new Error('Lot title is required.');
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TLOT'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('LotCode', sql.NVarChar(40), clean(input.lotCode, 40) || idFor('LOT').slice(0, 12))
      .input('Title', sql.NVarChar(300), clean(input.title, 300))
      .input('Value', sql.Decimal(19, 2), num(input.estimatedValue))
      .input('Currency', sql.NVarChar(10), clean(input.currency, 10) || 'NGN')
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderLots] ([LotId],[OpportunityId],[CompanyCode],[LotCode],[Title],[EstimatedValue],[Currency],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@LotCode,@Title,@Value,@Currency,@CreatedBy)`);
  } else if (kind === 'party') {
    if (!clean(input.name, 220)) throw new Error('Party name is required.');
    const share = num(input.worksharePct);
    const current = await pool.request().input('Id', sql.NVarChar(40), id).input('Company', sql.NVarChar(20), COMPANY)
      .query(`SELECT SUM([WorksharePct]) AS Total FROM [commercial].[TenderParties] WHERE [OpportunityId]=@Id AND [CompanyCode]=@Company AND [RoleName]=N'JV Partner'`);
    if (clean(input.role, 40) === 'JV Partner' && num(current.recordset[0]?.Total) + share > 100) {
      throw new Error('Joint-venture workshare cannot exceed 100 percent.');
    }
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TPTY'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('RoleName', sql.NVarChar(40), clean(input.role, 40) || 'JV Partner')
      .input('PartyName', sql.NVarChar(220), clean(input.name, 220))
      .input('Share', sql.Decimal(9, 2), share)
      .input('Liability', sql.NVarChar(300), clean(input.liability, 300))
      .input('AccessScope', sql.NVarChar(300), clean(input.accessScope, 300))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderParties] ([PartyId],[OpportunityId],[CompanyCode],[RoleName],[PartyName],[WorksharePct],[Liability],[AccessScope],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@RoleName,@PartyName,@Share,@Liability,@AccessScope,@CreatedBy)`);
  } else if (kind === 'qualification') {
    if (!clean(input.certificate, 220)) throw new Error('Certificate name is required.');
    const expires = clean(input.expiresOn, 10);
    const expired = expires && expires < new Date().toISOString().slice(0, 10);
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TQAL'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('Certificate', sql.NVarChar(220), clean(input.certificate, 220))
      .input('ReferenceNo', sql.NVarChar(120), clean(input.referenceNo, 120))
      .input('ExpiresOn', sql.Date, expires || null)
      .input('Eligibility', sql.NVarChar(20), expired ? 'EXPIRED' : (clean(input.eligibility, 20) || 'PENDING'))
      .input('Evidence', sql.NVarChar(sql.MAX), clean(input.evidence))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderQualifications] ([QualificationId],[OpportunityId],[CompanyCode],[CertificateName],[ReferenceNo],[ExpiresOn],[Eligibility],[Evidence],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@Certificate,@ReferenceNo,@ExpiresOn,@Eligibility,@Evidence,@CreatedBy)`);
  } else if (kind === 'score') {
    if (!clean(input.criterion, 180)) throw new Error('Score criterion is required.');
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TSCR'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('Criterion', sql.NVarChar(180), clean(input.criterion, 180))
      .input('Weight', sql.Decimal(9, 2), num(input.weightPct))
      .input('Score', sql.Decimal(9, 2), num(input.score))
      .input('Override', sql.NVarChar(sql.MAX), clean(input.overrideReason))
      .input('Authority', sql.NVarChar(120), clean(input.authority, 120) || clean(actor, 120))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderBidScores] ([ScoreId],[OpportunityId],[CompanyCode],[Criterion],[WeightPct],[Score],[OverrideReason],[AuthorityName],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@Criterion,@Weight,@Score,@Override,@Authority,@CreatedBy)`);
  } else if (kind === 'role') {
    if (!clean(input.person, 180)) throw new Error('Person name is required.');
    await assertActiveEmployee(pool, clean(input.person, 180), clean(input.employeeCode, 80));
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TROL'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('RoleName', sql.NVarChar(80), clean(input.role, 80) || 'Bid Manager')
      .input('Person', sql.NVarChar(180), clean(input.person, 180))
      .input('EmployeeCode', sql.NVarChar(80), clean(input.employeeCode, 80))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderRoles] ([RoleId],[OpportunityId],[CompanyCode],[RoleName],[PersonName],[EmployeeCode],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@RoleName,@Person,@EmployeeCode,@CreatedBy)`);
  } else if (kind === 'estimate') {
    const lines = await listLines(id);
    const opportunity = await requireOpportunity(id);
    const versionResult = await pool.request().input('Id', sql.NVarChar(40), id).query(`SELECT ISNULL(MAX([VersionNo]),0)+1 AS NextVersion FROM [commercial].[TenderEstimates] WHERE [OpportunityId]=@Id`);
    const version = num(versionResult.recordset[0]?.NextVersion, 1);
    const totalCost = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const totalSell = lines.reduce((sum, line) => sum + line.sell, 0) || opportunity.estimatedValue;
    const estimateId = idFor('TEST');
    await pool.request()
      .input('Id', sql.NVarChar(40), estimateId)
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('VersionNo', sql.Int, version)
      .input('Label', sql.NVarChar(180), clean(input.label, 180) || `Estimate v${version}`)
      .input('Currency', sql.NVarChar(10), opportunity.currency || 'NGN')
      .input('FxRate', sql.Decimal(19, 6), num(input.fxRate, 1) || 1)
      .input('TotalCost', sql.Decimal(19, 2), totalCost)
      .input('TotalSell', sql.Decimal(19, 2), totalSell)
      .input('Explanation', sql.NVarChar(sql.MAX), clean(input.explanation))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderEstimates] ([EstimateId],[OpportunityId],[CompanyCode],[VersionNo],[Label],[Currency],[FxRate],[TotalCost],[TotalSell],[Explanation],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@VersionNo,@Label,@Currency,@FxRate,@TotalCost,@TotalSell,@Explanation,@CreatedBy)`);
    for (const line of lines) {
      await pool.request()
        .input('Id', sql.NVarChar(40), idFor('TELN'))
        .input('EstimateId', sql.NVarChar(40), estimateId)
        .input('OpportunityId', sql.NVarChar(40), id)
        .input('Section', sql.NVarChar(120), line.section)
        .input('Description', sql.NVarChar(300), line.description)
        .input('Quantity', sql.Decimal(19, 4), line.quantity)
        .input('Unit', sql.NVarChar(25), line.unit)
        .input('UnitCost', sql.Decimal(19, 2), line.unitCost)
        .input('Markup', sql.Decimal(9, 2), line.markupPct)
        .input('Sell', sql.Decimal(19, 2), line.sell)
        .query(`INSERT INTO [commercial].[TenderEstimateLines] ([EstimateLineId],[EstimateId],[OpportunityId],[SectionName],[Description],[Quantity],[Unit],[UnitCost],[MarkupPct],[Sell]) VALUES (@Id,@EstimateId,@OpportunityId,@Section,@Description,@Quantity,@Unit,@UnitCost,@Markup,@Sell)`);
    }
  } else if (kind === 'quote') {
    if (!clean(input.supplier, 220)) throw new Error('Supplier name is required.');
    const amount = num(input.commercialAmount);
    const amountHash = createHash('sha256').update(amount.toFixed(2)).digest('hex');
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TQTE'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('Supplier', sql.NVarChar(220), clean(input.supplier, 220))
      .input('LotCode', sql.NVarChar(40), clean(input.lotCode, 40))
      .input('Technical', sql.NVarChar(sql.MAX), clean(input.technicalNotes))
      .input('Amount', sql.Decimal(19, 2), amount)
      .input('Currency', sql.NVarChar(10), clean(input.currency, 10) || 'NGN')
      .input('AmountHash', sql.NVarChar(64), amountHash)
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderQuotes] ([QuoteId],[OpportunityId],[CompanyCode],[SupplierName],[LotCode],[TechnicalNotes],[CommercialAmount],[Currency],[AmountHash],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@Supplier,@LotCode,@Technical,@Amount,@Currency,@AmountHash,@CreatedBy)`);
  } else if (kind === 'quote-release') {
    if (technicalOnly(viewer)) throw new Error('Technical evaluators cannot release commercial offers.');
    const quoteId = clean(input.quoteId, 40);
    const updated = await pool.request()
      .input('Id', sql.NVarChar(40), quoteId)
      .input('Actor', sql.NVarChar(120), clean(actor, 120))
      .query(`UPDATE [commercial].[TenderQuotes] SET [ReleasedAt]=SYSUTCDATETIME(), [ReleasedBy]=@Actor WHERE [QuoteId]=@Id AND [ReleasedAt] IS NULL`);
    if (!updated.rowsAffected[0]) throw new Error('The quotation was not found or is already released.');
  } else if (kind === 'scenario') {
    const lines = await listLines(id);
    const opportunity = await requireOpportunity(id);
    const baseCost = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    const baseSell = lines.reduce((sum, line) => sum + line.sell, 0) || opportunity.estimatedValue;
    const productivity = Math.max(0.01, num(input.productivityPct, 100) / 100);
    const cost = baseCost * (1 + num(input.escalationPct) / 100) * (1 + num(input.overrunPct) / 100) / productivity;
    const sell = baseSell * (num(input.fxRate, 1) || 1);
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TSCN'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('Name', sql.NVarChar(40), clean(input.name, 40) || 'Base')
      .input('Fx', sql.Decimal(19, 6), num(input.fxRate, 1) || 1)
      .input('Escalation', sql.Decimal(9, 2), num(input.escalationPct))
      .input('Productivity', sql.Decimal(9, 2), num(input.productivityPct, 100))
      .input('Delay', sql.Int, num(input.delayDays))
      .input('Overrun', sql.Decimal(9, 2), num(input.overrunPct))
      .input('Cost', sql.Decimal(19, 2), cost)
      .input('Sell', sql.Decimal(19, 2), sell)
      .input('Margin', sql.Decimal(19, 2), sell - cost)
      .input('Assumptions', sql.NVarChar(sql.MAX), clean(input.assumptions))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderScenarios] ([ScenarioId],[OpportunityId],[CompanyCode],[ScenarioName],[FxRate],[EscalationPct],[ProductivityPct],[DelayDays],[OverrunPct],[Cost],[Sell],[Margin],[Assumptions],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@Name,@Fx,@Escalation,@Productivity,@Delay,@Overrun,@Cost,@Sell,@Margin,@Assumptions,@CreatedBy)`);
  } else if (kind === 'cashflow') {
    if (!/^\d{4}-\d{2}$/.test(clean(input.month, 7))) throw new Error('Cash-flow month must be YYYY-MM.');
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TCFL'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('Month', sql.Char(7), clean(input.month, 7))
      .input('Inflow', sql.Decimal(19, 2), num(input.inflow))
      .input('Outflow', sql.Decimal(19, 2), num(input.outflow))
      .input('Retention', sql.Decimal(19, 2), num(input.retention))
      .input('Mobilization', sql.Decimal(19, 2), num(input.mobilization))
      .input('Guarantee', sql.Decimal(19, 2), num(input.guarantee))
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderCashFlows] ([PeriodId],[OpportunityId],[CompanyCode],[PeriodMonth],[Inflow],[Outflow],[Retention],[Mobilization],[Guarantee],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@Month,@Inflow,@Outflow,@Retention,@Mobilization,@Guarantee,@CreatedBy)`);
  } else if (kind === 'clause') {
    if (!clean(input.clauseType, 80)) throw new Error('Clause type is required.');
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TCLS'))
      .input('OpportunityId', sql.NVarChar(40), id)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('ClauseType', sql.NVarChar(80), clean(input.clauseType, 80))
      .input('ClauseText', sql.NVarChar(sql.MAX), clean(input.text))
      .input('Deviation', sql.NVarChar(sql.MAX), clean(input.deviation))
      .input('Risk', sql.NVarChar(300), clean(input.residualRisk, 300))
      .input('Owner', sql.NVarChar(120), clean(input.owner, 120))
      .input('Acceptance', sql.NVarChar(40), clean(input.acceptance, 40) || 'OPEN')
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderClauses] ([ClauseId],[OpportunityId],[CompanyCode],[ClauseType],[ClauseText],[Deviation],[ResidualRisk],[OwnerName],[Acceptance],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@ClauseType,@ClauseText,@Deviation,@Risk,@Owner,@Acceptance,@CreatedBy)`);
  } else if (kind === 'review') {
    await runRulesReview(id, actor);
  } else if (kind === 'review-decision') {
    const decision = clean(input.decision, 20).toUpperCase();
    if (!['ACCEPT', 'REJECT'].includes(decision)) throw new Error('Review decision must be ACCEPT or REJECT.');
    const updated = await pool.request()
      .input('Id', sql.NVarChar(40), clean(input.reviewId, 40))
      .input('Decision', sql.NVarChar(20), decision)
      .input('Outcome', sql.NVarChar(sql.MAX), clean(input.outcome))
      .input('Actor', sql.NVarChar(120), clean(actor, 120))
      .query(`UPDATE [commercial].[TenderAiReviews] SET [HumanDecision]=@Decision, [Outcome]=@Outcome, [DecidedBy]=@Actor, [DecidedAt]=SYSUTCDATETIME() WHERE [ReviewId]=@Id`);
    if (!updated.rowsAffected[0]) throw new Error('The review finding was not found.');
  } else if (kind === 'baseline') {
    await handoverBaseline(id, input, actor);
  } else {
    throw new Error('Unknown blueprint record.');
  }

  await audit(pool, id, actor, `BLUEPRINT_${kind.toUpperCase()}`, clean(input.title || input.name || input.supplier || input.clauseType || kind, 180));
  return getTenderBlueprint(id, viewer);
};

const runRulesReview = async (opportunityId: string, actor: string) => {
  const pool = await ensureTenderDb();
  const opportunity = await requireOpportunity(opportunityId);
  const [items, lines, clauses, rates] = await Promise.all([
    listItems(opportunityId),
    listLines(opportunityId),
    pool.request().input('Id', sql.NVarChar(40), opportunityId).query(`SELECT [ClauseType],[ClauseText],[Deviation] FROM [commercial].[TenderClauses] WHERE [OpportunityId]=@Id`),
    pool.request().input('Company', sql.NVarChar(20), COMPANY).query(`SELECT [Unit],[Rate] FROM [commercial].[TenderRates] WHERE [CompanyCode]=@Company`),
  ]);
  const findings: Array<{ finding: string; evidence: string; confidence: number }> = [];
  items.filter((item) => /require/i.test(item.kind) && !clean(item.details)).forEach((item) => {
    findings.push({ finding: `Requirement has no response: ${item.title}`, evidence: item.title, confidence: 0.9 });
  });
  items.filter((item) => /comply|compliance/i.test(item.kind) && !/done|complete|closed|uploaded|waived/i.test(item.status)).forEach((item) => {
    findings.push({ finding: `Compliance item is still open: ${item.title}`, evidence: `${item.kind} ${item.status}`, confidence: 0.95 });
  });
  const library = rates.recordset as Array<Record<string, unknown>>;
  lines.forEach((line) => {
    const peers = library.filter((rate) => clean(rate.Unit, 25).toLowerCase() === line.unit.toLowerCase()).map((rate) => num(rate.Rate));
    if (peers.length < 2) return;
    const mean = peers.reduce((sum, rate) => sum + rate, 0) / peers.length;
    const variance = peers.reduce((sum, rate) => sum + (rate - mean) ** 2, 0) / peers.length;
    const deviation = Math.sqrt(variance);
    if (deviation > 0 && Math.abs(line.unitCost - mean) > deviation * 2) {
      findings.push({ finding: `Rate is outside the library band: ${line.description}`, evidence: `Unit ${line.unit} cost ${line.unitCost.toFixed(2)}; library mean ${mean.toFixed(2)}`, confidence: 0.7 });
    }
  });
  (clauses.recordset as Array<Record<string, unknown>>).forEach((clause) => {
    const text = `${clause.ClauseType} ${clause.ClauseText} ${clause.Deviation}`;
    if (/liquidated damage|unlimited liability|termination for convenience/i.test(text)) {
      findings.push({ finding: `Risky clause: ${clean(clause.ClauseType, 80)}`, evidence: clean(text, 500), confidence: 0.8 });
    }
  });
  const deadline = opportunity.submissionDeadline || opportunity.closingDate;
  if (deadline) {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
    if (days >= 0 && days <= 7) findings.push({ finding: `Submission deadline is ${days} day(s) away`, evidence: deadline, confidence: 1 });
  }
  if (!findings.length) findings.push({ finding: 'No rule findings on the current record.', evidence: 'Requirements, compliance, rates, clauses and the deadline were checked.', confidence: 1 });
  for (const finding of findings) {
    await pool.request()
      .input('Id', sql.NVarChar(40), idFor('TAIR'))
      .input('OpportunityId', sql.NVarChar(40), opportunityId)
      .input('Company', sql.NVarChar(20), COMPANY)
      .input('Ruleset', sql.NVarChar(40), RULESET)
      .input('Finding', sql.NVarChar(300), finding.finding)
      .input('Evidence', sql.NVarChar(sql.MAX), finding.evidence)
      .input('Confidence', sql.Decimal(9, 2), finding.confidence)
      .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
      .query(`INSERT INTO [commercial].[TenderAiReviews] ([ReviewId],[OpportunityId],[CompanyCode],[Ruleset],[Finding],[Evidence],[Confidence],[CreatedBy]) VALUES (@Id,@OpportunityId,@Company,@Ruleset,@Finding,@Evidence,@Confidence,@CreatedBy)`);
  }
};

const handoverBaseline = async (opportunityId: string, input: Record<string, unknown>, actor: string) => {
  const acceptedBy = clean(input.acceptedBy, 180);
  if (!acceptedBy) throw new Error('Receiving project manager acceptance is required.');
  const awards = await listAwards(opportunityId);
  const award = awards.find((item) => item.id === clean(input.awardId, 40)) || awards[0];
  if (!award) throw new Error('Record an award before handover.');
  const lotCode = clean(input.lotCode, 40);
  const pool = await ensureTenderDb();
  const existing = await pool.request()
    .input('AwardId', sql.NVarChar(40), award.id)
    .input('LotCode', sql.NVarChar(40), lotCode)
    .query(`SELECT [BaselineId],[ProjectCode] FROM [commercial].[TenderBaselines] WHERE [AwardId]=@AwardId AND [LotCode]=@LotCode`);
  if (existing.recordset[0]) return;
  const opportunity = await requireOpportunity(opportunityId);
  const lines = (await listLines(opportunityId)).filter((line) => !lotCode || line.section.toLowerCase() === lotCode.toLowerCase());
  const items = await listItems(opportunityId);
  const projectCode = (`T${award.contractRef}`.replace(/[^A-Za-z0-9]/g, '') || `T${award.id.replace(/[^A-Za-z0-9]/g, '')}`).slice(0, 30);
  const start = award.awardDate || new Date().toISOString().slice(0, 10);
  const finish = new Date(start);
  const months = opportunity.durationUnit.toLowerCase().startsWith('year') ? (opportunity.contractDuration || 12) * 12 : (opportunity.contractDuration || 12);
  finish.setUTCMonth(finish.getUTCMonth() + months);
  const currency = (['NGN', 'USD', 'EUR', 'GBP'].includes(opportunity.currency) ? opportunity.currency : 'NGN') as 'NGN' | 'USD' | 'EUR' | 'GBP';
  const snapshot = JSON.stringify({
    lines,
    risks: items.filter((item) => /risk|issue/i.test(item.kind)),
    milestones: items.filter((item) => /milestone|deliver/i.test(item.kind)),
    awardedValue: award.awardedValue,
    lotCode,
  });
  let project = await getProjectById(projectCode);
  if (!project) {
    try {
      project = await createProjectRecord({
        code: projectCode,
        name: opportunity.title.slice(0, 200),
        clientName: opportunity.clientName,
        projectType: 'EPC',
        currency,
        contractValue: lotCode ? lines.reduce((sum, line) => sum + line.sell, 0) : award.awardedValue,
        plannedStart: start,
        plannedFinish: finish.toISOString().slice(0, 10),
        projectManagerId: clean(input.employeeCode, 80) || 'UNASSIGNED',
        projectManagerName: acceptedBy,
        businessUnit: opportunity.businessUnit || opportunity.department || 'Projects & Engineering',
        location: opportunity.projectLocation || opportunity.site || 'TBD',
        description: `Tender baseline ${award.contractRef}. ${snapshot.slice(0, 3500)}`,
        status: 'Initiation',
      }, { username: actor, fullName: actor, sub: actor });
    } catch (error) {
      project = await getProjectById(projectCode);
      if (!project) throw error;
    }
  }
  await pool.request()
    .input('Id', sql.NVarChar(40), idFor('TBASE'))
    .input('OpportunityId', sql.NVarChar(40), opportunityId)
    .input('AwardId', sql.NVarChar(40), award.id)
    .input('Company', sql.NVarChar(20), COMPANY)
    .input('LotCode', sql.NVarChar(40), lotCode)
    .input('ProjectCode', sql.NVarChar(30), project.code || projectCode)
    .input('AcceptedBy', sql.NVarChar(180), acceptedBy)
    .input('Snapshot', sql.NVarChar(sql.MAX), snapshot)
    .input('CreatedBy', sql.NVarChar(120), clean(actor, 120))
    .query(`INSERT INTO [commercial].[TenderBaselines] ([BaselineId],[OpportunityId],[AwardId],[CompanyCode],[LotCode],[ProjectCode],[AcceptedBy],[Snapshot],[CreatedBy]) VALUES (@Id,@OpportunityId,@AwardId,@Company,@LotCode,@ProjectCode,@AcceptedBy,@Snapshot,@CreatedBy)`);
};
