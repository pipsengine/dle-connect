import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPositionsData, type HealthStatus, type PositionRecord, type StructureInsight } from '@/lib/organization-data';

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const DATA_DIR = path.join(resolveDashboardRoot(), 'data', 'hris');
const FILE_PATH = path.join(DATA_DIR, 'positions.json');

const buildPayload = (positions: PositionRecord[]) => {
  const totalIncumbents = positions.filter((position) => position.incumbentEmployeeId).length;
  const totalVacant = positions.filter((position) => position.positionStatus === 'Vacant').length;
  const avgSuccessionCoverage = Math.round((positions.reduce((sum, position) => sum + position.successionCoveragePct, 0) / positions.length) * 10) / 10;
  const avgApprovalCoverage = Math.round((positions.reduce((sum, position) => sum + position.approvalCoveragePct, 0) / positions.length) * 10) / 10;

  const longestOpenPosition = [...positions].sort((a, b) => b.openDays - a.openDays)[0];
  const mostCriticalVacancy = [...positions].filter((position) => position.positionStatus === 'Vacant').sort((a, b) => b.openDays - a.openDays)[0];
  const reviewVariant = [...positions].filter((position) => !position.standardPosition).sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];

  const insights: StructureInsight[] = [
    {
      id: 'pos-ins-1',
      severity: longestOpenPosition && longestOpenPosition.openDays >= 45 ? 'high' : 'medium',
      title: `${longestOpenPosition?.title || 'A position'} has been open the longest`,
      recommendation: 'Escalate recruitment or redesign the position if the role remains difficult to fill.',
    },
    {
      id: 'pos-ins-2',
      severity: mostCriticalVacancy && mostCriticalVacancy.criticality === 'Critical' ? 'high' : 'medium',
      title: `${mostCriticalVacancy?.title || 'A role'} is the highest-priority vacancy`,
      recommendation: 'Prioritize immediate replacement planning and assign interim coverage until the position is filled.',
    },
    {
      id: 'pos-ins-3',
      severity: reviewVariant ? 'medium' : 'low',
      title: `${reviewVariant?.title || 'A position'} deviates from the standard architecture`,
      recommendation: 'Review title, grade, and position design alignment to reduce structural drift.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalPositions: positions.length,
      totalIncumbents,
      totalVacant,
      avgSuccessionCoverage,
      avgApprovalCoverage,
      criticalPositions: positions.filter((position) => position.criticality === 'Critical').length,
      nonStandardPositions: positions.filter((position) => !position.standardPosition).length,
    },
    filterOptions: {
      businessUnits: Array.from(new Set(positions.map((position) => position.businessUnit))).sort((a, b) => a.localeCompare(b)),
      grades: Array.from(new Set(positions.map((position) => position.gradeCode))).sort((a, b) => a.localeCompare(b)),
      positionTypes: ['Permanent', 'Contract', 'Project', 'Temporary'] as Array<'Permanent' | 'Contract' | 'Project' | 'Temporary'>,
      positionStatuses: ['Filled', 'Vacant', 'Frozen', 'Under Review'] as Array<'Filled' | 'Vacant' | 'Frozen' | 'Under Review'>,
      criticalities: ['Critical', 'Core', 'Support'] as Array<'Critical' | 'Core' | 'Support'>,
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    positions,
    insights,
  };
};

const ensureStore = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await access(FILE_PATH);
  } catch {
    await writeFile(FILE_PATH, JSON.stringify(getPositionsData().positions, null, 2), 'utf8');
  }
};

export const readPositions = async (): Promise<PositionRecord[]> => {
  await ensureStore();
  try {
    const raw = await readFile(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as PositionRecord[];
  } catch {
    // Fall back to seeded records if the file is missing or malformed.
  }

  const seeded = getPositionsData().positions;
  await writeFile(FILE_PATH, JSON.stringify(seeded, null, 2), 'utf8');
  return seeded;
};

export const writePositions = async (positions: PositionRecord[]) => {
  await ensureStore();
  await writeFile(FILE_PATH, JSON.stringify(positions, null, 2), 'utf8');
};

export const getPersistedPositionsData = async () => buildPayload(await readPositions());
