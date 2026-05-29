import { NextResponse } from 'next/server';
import type { HealthStatus, PositionRecord } from '@/lib/organization-data';
import { getPersistedPositionsData, readPositions, writePositions } from '@/lib/positions-store';

export async function GET() {
  return NextResponse.json({ status: 'success', data: await getPersistedPositionsData() });
}

type CreatePositionPayload = {
  code?: string;
  title?: string;
  department?: string;
  businessUnit?: string;
  location?: string;
  gradeCode?: string;
  family?: PositionRecord['family'];
  level?: PositionRecord['level'];
  reportingTo?: string;
  positionType?: PositionRecord['positionType'];
  positionStatus?: PositionRecord['positionStatus'];
  incumbentName?: string | null;
  incumbentEmployeeId?: string | null;
  benchmarkSalaryUsd?: number;
  fte?: number;
  criticality?: PositionRecord['criticality'];
  successionCoveragePct?: number;
  attritionRiskPct?: number;
  approvalCoveragePct?: number;
  healthStatus?: HealthStatus;
  replacementPriority?: PositionRecord['replacementPriority'];
  standardPosition?: boolean;
  openDays?: number;
  jobTitleCode?: string;
  responsibilityScope?: string;
  requiredCapabilities?: string[];
};

const ok = <T,>(data: T, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const isNonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN);
const normalizeCode = (value: string) => value.trim().toUpperCase();

const validate = (payload: CreatePositionPayload, existing: PositionRecord[]) => {
  const families: PositionRecord['family'][] = ['Executive', 'Management', 'Professional', 'Technical', 'Operations Support'];
  const levels: PositionRecord['level'][] = ['Strategic', 'Senior', 'Mid', 'Entry'];
  const types: PositionRecord['positionType'][] = ['Permanent', 'Contract', 'Project', 'Temporary'];
  const statuses: PositionRecord['positionStatus'][] = ['Filled', 'Vacant', 'Frozen', 'Under Review'];
  const criticalities: PositionRecord['criticality'][] = ['Critical', 'Core', 'Support'];
  const healthStatuses: HealthStatus[] = ['Healthy', 'Needs Attention', 'Critical'];
  const priorities: PositionRecord['replacementPriority'][] = ['Immediate', 'Planned', 'Monitor'];

  if (!isNonEmpty(payload.code)) return 'Position code is required.';
  if (!isNonEmpty(payload.title)) return 'Position title is required.';
  if (!isNonEmpty(payload.department)) return 'Department is required.';
  if (!isNonEmpty(payload.businessUnit)) return 'Business unit is required.';
  if (!isNonEmpty(payload.location)) return 'Location is required.';
  if (!isNonEmpty(payload.gradeCode)) return 'Grade code is required.';
  if (!payload.family || !families.includes(payload.family)) return 'A valid family is required.';
  if (!payload.level || !levels.includes(payload.level)) return 'A valid level is required.';
  if (!isNonEmpty(payload.reportingTo)) return 'Reporting line is required.';
  if (!payload.positionType || !types.includes(payload.positionType)) return 'A valid position type is required.';
  if (!payload.positionStatus || !statuses.includes(payload.positionStatus)) return 'A valid position status is required.';
  if (!payload.criticality || !criticalities.includes(payload.criticality)) return 'A valid criticality is required.';
  if (!payload.healthStatus || !healthStatuses.includes(payload.healthStatus)) return 'A valid health status is required.';
  if (!payload.replacementPriority || !priorities.includes(payload.replacementPriority)) return 'A valid replacement priority is required.';
  if (typeof payload.standardPosition !== 'boolean') return 'Standard position flag is required.';
  if (!isNonEmpty(payload.jobTitleCode)) return 'Job title code is required.';
  if (!isNonEmpty(payload.responsibilityScope)) return 'Responsibility scope is required.';

  const benchmarkSalaryUsd = asNumber(payload.benchmarkSalaryUsd);
  const fte = asNumber(payload.fte);
  const successionCoveragePct = asNumber(payload.successionCoveragePct);
  const attritionRiskPct = asNumber(payload.attritionRiskPct);
  const approvalCoveragePct = asNumber(payload.approvalCoveragePct);
  const openDays = asNumber(payload.openDays);

  if ([benchmarkSalaryUsd, fte, successionCoveragePct, attritionRiskPct, approvalCoveragePct, openDays].some(Number.isNaN)) {
    return 'Numeric position fields must contain valid numbers.';
  }
  if (benchmarkSalaryUsd < 0) return 'Benchmark salary cannot be negative.';
  if (fte <= 0) return 'FTE must be greater than zero.';
  if (!Number.isInteger(openDays) || openDays < 0) return 'Open days must be a non-negative whole number.';

  for (const pct of [successionCoveragePct, attritionRiskPct, approvalCoveragePct]) {
    if (pct < 0 || pct > 100) return 'Percentage fields must be between 0 and 100.';
  }

  if (!Array.isArray(payload.requiredCapabilities) || payload.requiredCapabilities.length === 0 || payload.requiredCapabilities.some((item) => !isNonEmpty(item))) {
    return 'At least one required capability is required.';
  }

  const code = normalizeCode(payload.code);
  if (existing.some((position) => normalizeCode(position.code) === code)) return `Position code ${code} already exists.`;

  if (payload.positionStatus === 'Filled') {
    if (!isNonEmpty(payload.incumbentName) || !isNonEmpty(payload.incumbentEmployeeId)) return 'Filled positions require both incumbent name and employee ID.';
    if (openDays !== 0) return 'Filled positions must have open days set to 0.';
  }

  if (payload.positionStatus === 'Vacant' || payload.positionStatus === 'Frozen') {
    if (payload.incumbentName || payload.incumbentEmployeeId) return 'Vacant or frozen positions cannot have an incumbent assigned.';
  }

  return null;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as CreatePositionPayload;
  const existing = await readPositions();
  const validationError = validate(payload, existing);
  if (validationError) return err(400, validationError);

  const code = normalizeCode(payload.code!);
  const position: PositionRecord = {
    id: `pos-${code.toLowerCase()}`,
    code,
    title: payload.title!.trim(),
    department: payload.department!.trim(),
    businessUnit: payload.businessUnit!.trim(),
    location: payload.location!.trim(),
    gradeCode: normalizeCode(payload.gradeCode!),
    family: payload.family!,
    level: payload.level!,
    reportingTo: payload.reportingTo!.trim(),
    positionType: payload.positionType!,
    positionStatus: payload.positionStatus!,
    incumbentName: payload.incumbentName?.trim() || null,
    incumbentEmployeeId: payload.incumbentEmployeeId?.trim() || null,
    benchmarkSalaryUsd: Number(payload.benchmarkSalaryUsd),
    fte: Number(payload.fte),
    criticality: payload.criticality!,
    successionCoveragePct: Number(payload.successionCoveragePct),
    attritionRiskPct: Number(payload.attritionRiskPct),
    approvalCoveragePct: Number(payload.approvalCoveragePct),
    healthStatus: payload.healthStatus!,
    replacementPriority: payload.replacementPriority!,
    standardPosition: payload.standardPosition!,
    openDays: Number(payload.openDays),
    jobTitleCode: normalizeCode(payload.jobTitleCode!),
    responsibilityScope: payload.responsibilityScope!.trim(),
    requiredCapabilities: payload.requiredCapabilities!.map((item) => item.trim()).filter(Boolean),
  };

  const next = [...existing, position].sort((a, b) => a.code.localeCompare(b.code));
  await writePositions(next);
  return ok(position, 201);
}
