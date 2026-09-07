export type BudgetCheckDecision = 'Approved' | 'Rejected' | 'Blocked';
export type LabourValidationDecision = 'Approved' | 'Returned' | 'Blocked';

export type BudgetCheckInput = {
  projectId: string;
  commitmentId: string;
  decision: BudgetCheckDecision;
  comment?: string;
};

export type LabourValidationInput = {
  projectId: string;
  timesheetLineIds: string[];
  decision: LabourValidationDecision;
  comment?: string;
};

export type ForecastSubmissionInput = {
  projectId: string;
  periodCode: string;
  lines: Array<{
    controlAccountId: string;
    actualToDate: number;
    openCommitment: number;
    uncommittedETC: number;
    riskAllowance?: number;
    forecastBasis: string;
  }>;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const parseBudgetCheck = (body: unknown): { data?: BudgetCheckInput; error?: string } => {
  if (!body || typeof body !== 'object') return { error: 'Invalid payload' };
  const input = body as Record<string, unknown>;
  const projectId = String(input.projectId || '').trim();
  const commitmentId = String(input.commitmentId || '').trim();
  const decision = String(input.decision || '').trim() as BudgetCheckDecision;
  const comment = input.comment !== undefined ? String(input.comment).trim() : undefined;
  if (!projectId) return { error: 'projectId is required' };
  if (!isUuid(commitmentId)) return { error: 'commitmentId must be a UUID' };
  if (!['Approved', 'Rejected', 'Blocked'].includes(decision)) return { error: 'Invalid decision' };
  if (comment && comment.length > 1000) return { error: 'Comment too long' };
  return { data: { projectId, commitmentId, decision, comment } };
};

export const parseLabourValidation = (body: unknown): { data?: LabourValidationInput; error?: string } => {
  if (!body || typeof body !== 'object') return { error: 'Invalid payload' };
  const input = body as Record<string, unknown>;
  const projectId = String(input.projectId || '').trim();
  const decision = String(input.decision || '').trim() as LabourValidationDecision;
  const comment = input.comment !== undefined ? String(input.comment).trim() : undefined;
  const timesheetLineIds = Array.isArray(input.timesheetLineIds)
    ? input.timesheetLineIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (!projectId) return { error: 'projectId is required' };
  if (!timesheetLineIds.length || timesheetLineIds.length > 500) {
    return { error: 'timesheetLineIds must contain 1–500 ids' };
  }
  if (!['Approved', 'Returned', 'Blocked'].includes(decision)) return { error: 'Invalid decision' };
  if (comment && comment.length > 1000) return { error: 'Comment too long' };
  return { data: { projectId, timesheetLineIds, decision, comment } };
};

export const parseForecastSubmission = (body: unknown): { data?: ForecastSubmissionInput; error?: string } => {
  if (!body || typeof body !== 'object') return { error: 'Invalid payload' };
  const input = body as Record<string, unknown>;
  const projectId = String(input.projectId || '').trim();
  const periodCode = String(input.periodCode || '').trim();
  if (!projectId) return { error: 'projectId is required' };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodCode)) return { error: 'periodCode must be YYYY-MM' };
  if (!Array.isArray(input.lines) || !input.lines.length) return { error: 'At least one forecast line is required' };
  const lines: ForecastSubmissionInput['lines'] = [];
  for (const raw of input.lines) {
    if (!raw || typeof raw !== 'object') return { error: 'Invalid forecast line' };
    const line = raw as Record<string, unknown>;
    const controlAccountId = String(line.controlAccountId || '').trim();
    const forecastBasis = String(line.forecastBasis || '').trim();
    const actualToDate = Number(line.actualToDate);
    const openCommitment = Number(line.openCommitment);
    const uncommittedETC = Number(line.uncommittedETC);
    const riskAllowance = line.riskAllowance === undefined ? 0 : Number(line.riskAllowance);
    if (!isUuid(controlAccountId)) return { error: 'controlAccountId must be a UUID' };
    if (forecastBasis.length < 10 || forecastBasis.length > 1000) return { error: 'forecastBasis must be 10–1000 characters' };
    if (![actualToDate, openCommitment, uncommittedETC, riskAllowance].every((n) => Number.isFinite(n) && n >= 0)) {
      return { error: 'Forecast amounts must be non-negative numbers' };
    }
    lines.push({ controlAccountId, actualToDate, openCommitment, uncommittedETC, riskAllowance, forecastBasis });
  }
  return { data: { projectId, periodCode, lines } };
};

export function validateCostCodeMapping(input: { wbsId?: string | null; costCodeId?: string | null }) {
  if (!input.wbsId || !input.costCodeId) {
    return { ok: false as const, reason: 'WBS and Cost Code are required for project-chargeable cost.' };
  }
  return { ok: true as const };
}

export function calculateEvm(pv: number, ev: number, ac: number, bac: number) {
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac ? ev / ac : null;
  const spi = pv ? ev / pv : null;
  const eac = cpi ? bac / cpi : null;
  const etc = eac === null ? null : Math.max(0, eac - ac);
  const vac = eac === null ? null : bac - eac;
  return { pv, ev, ac, bac, cv, sv, cpi, spi, eac, etc, vac };
}

export function budgetAvailability(
  bac: number,
  committed: number,
  actualUncommitted: number,
  reserved: number,
  proposed: number,
) {
  const available = bac - committed - actualUncommitted - reserved;
  return { available, proposed, after: available - proposed, approved: available >= proposed };
}

/** Derive portfolio cost KPIs from live project profiles until cost registers are populated. */
export function deriveProjectCostSnapshot(project: {
  contractValue: number;
  actual: number;
  planned: number;
  costPerformance: number;
  schedulePerformance: number;
  health: string;
  currency?: string;
}) {
  const bac = Number(project.contractValue || 0);
  const actualPct = Math.min(100, Math.max(0, Number(project.actual || 0))) / 100;
  const plannedPct = Math.min(100, Math.max(0, Number(project.planned || 0))) / 100;
  const cpi = Number(project.costPerformance || 1) || 1;
  const spi = Number(project.schedulePerformance || 1) || 1;
  const commitments = bac * Math.min(0.95, actualPct * 1.25 + 0.08);
  const actual = bac * actualPct;
  const etc = Math.max(0, bac / Math.max(cpi, 0.01) - actual);
  const eac = actual + etc;
  const vac = bac - eac;
  const pv = bac * plannedPct;
  const ev = bac * actualPct;
  return {
    bac,
    commitments,
    actual,
    etc,
    eac,
    vac,
    cpi,
    spi,
    pv,
    ev,
    health:
      project.health === 'Critical' || cpi < 0.95
        ? 'Critical'
        : project.health === 'Watch' || cpi < 1
          ? 'Watch'
          : 'Healthy',
  };
}
