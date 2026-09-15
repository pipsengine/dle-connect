import type { Health, Project } from '@/lib/projects-engineering/types';

export type HealthDimensionValue = number | 'N/A';

export type ProjectHealthDimension = {
  label: string;
  value: HealthDimensionValue;
};

export type ProjectHealthSnapshot = {
  score: number;
  health: Health;
  dimensions: ProjectHealthDimension[];
};

const clampScore = (value: number) => Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));

const indexToScore = (index: number) => clampScore(Number(index || 0) * 100);

export const manHourHealthScore = (budgetedHours: number, utilizationPct: number): HealthDimensionValue => {
  if (!(Number(budgetedHours) > 0)) return 'N/A';
  const util = Number(utilizationPct || 0);
  if (util <= 100) return 100;
  return clampScore(100 - (util - 100));
};

export const commercialHealthScore = (bac: number, eac: number): HealthDimensionValue => {
  if (!(Number(bac) > 0)) return 'N/A';
  if (Number(eac) <= Number(bac)) return 100;
  return clampScore((Number(bac) / Math.max(Number(eac), 0.01)) * 100);
};

export const scheduleHealthScore = (project: Pick<Project, 'planned' | 'actual' | 'schedulePerformance' | 'start' | 'finish'>) => {
  const planned = Number(project.planned || 0);
  const actual = Number(project.actual || 0);
  let spi = Number(project.schedulePerformance || 0) || 1;
  if (planned > 0) spi = actual / planned;
  const start = Date.parse(project.start);
  const finish = Date.parse(project.finish);
  if (Number.isFinite(start) && Number.isFinite(finish) && finish > start) {
    const elapsed = Math.min(1, Math.max(0, (Date.now() - start) / (finish - start)));
    if (elapsed >= 0.05) spi = Math.min(spi, (actual / 100) / elapsed);
  }
  return indexToScore(spi);
};

export const costHealthScore = (contractValue: number, costPerformance: number): HealthDimensionValue => {
  if (!(Number(contractValue) > 0)) return 'N/A';
  return indexToScore(Number(costPerformance || 0) || 1);
};

export const overallHealthScore = (dimensions: ProjectHealthDimension[]) => {
  const nums = dimensions.map((row) => row.value).filter((value): value is number => typeof value === 'number');
  if (!nums.length) return 0;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
};

export const healthFromScore = (score: number): Health => {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Watch';
  return 'Critical';
};

export const deriveProjectHealth = (input: {
  project: Pick<Project, 'planned' | 'actual' | 'schedulePerformance' | 'costPerformance' | 'start' | 'finish' | 'contractValue'>;
  budgetedHours?: number;
  utilizationPct?: number;
  eac?: number;
  qualityScore?: HealthDimensionValue;
  hseScore?: HealthDimensionValue;
  riskScore?: HealthDimensionValue;
}): ProjectHealthSnapshot => {
  const bac = Number(input.project.contractValue || 0);
  const dimensions: ProjectHealthDimension[] = [
    { label: 'Schedule', value: scheduleHealthScore(input.project) },
    { label: 'Cost', value: costHealthScore(bac, Number(input.project.costPerformance || 0)) },
    { label: 'Man-Hours', value: manHourHealthScore(Number(input.budgetedHours || 0), Number(input.utilizationPct || 0)) },
    { label: 'Quality', value: input.qualityScore ?? 100 },
    { label: 'HSE', value: input.hseScore ?? 100 },
    { label: 'Commercial', value: commercialHealthScore(bac, Number(input.eac ?? bac)) },
    { label: 'Risks', value: input.riskScore ?? 100 },
  ];
  const score = overallHealthScore(dimensions);
  return { score, health: healthFromScore(score), dimensions };
};
