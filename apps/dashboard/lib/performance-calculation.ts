/** Shared performance scoring — single source for UI, reports, and APIs (PRD §11). */

export type ScoreItem = { weight: number; achievement: number; notApplicable?: boolean };

export type ScoreSection = {
  contribution: number;
  items: ScoreItem[];
};

export const DEFAULT_SECTION_WEIGHTS = {
  companyObjectives: 30,
  individualOkrs: 40,
  behavioural: 30,
} as const;

export const DEFAULT_RATING_BANDS: Array<{ min: number; max: number; label: string }> = [
  { min: 90, max: 100, label: 'Outstanding' },
  { min: 80, max: 89.99, label: 'Exceeds Expectations' },
  { min: 70, max: 79.99, label: 'Meets Expectations' },
  { min: 60, max: 69.99, label: 'Needs Improvement' },
  { min: 0, max: 59.99, label: 'Unsatisfactory' },
];

export const DEFAULT_BEHAVIOUR_SCALE = [
  { value: 5, label: 'Outstanding', anchor: 'Consistently demonstrates exemplary behaviour; positively influences others.' },
  { value: 4, label: 'Exceeds Expectations', anchor: 'Frequently exceeds the expected standard with clear examples.' },
  { value: 3, label: 'Meets Expectations', anchor: 'Consistently demonstrates the expected behaviour for the role.' },
  { value: 2, label: 'Needs Improvement', anchor: 'Inconsistently demonstrates the standard; targeted improvement is required.' },
  { value: 1, label: 'Unsatisfactory', anchor: 'Frequently fails to demonstrate the required standard.' },
] as const;

const roundHalfUp = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/** Store at least 4 decimal places internally. */
export const storeScore = (value: number) => roundHalfUp(value, 4);

/** Display two decimal places; round half up only at final display. */
export const displayScore = (value: number) => roundHalfUp(value, 2);

export const normalizeWeights = (items: ScoreItem[]) => {
  const applicable = items.filter((item) => !item.notApplicable);
  const total = applicable.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
  if (total <= 0) return applicable.map((item) => ({ ...item, weight: 0 }));
  return applicable.map((item) => ({
    ...item,
    weight: (Math.max(0, Number(item.weight) || 0) / total) * 100,
  }));
};

export const sectionScore = (items: ScoreItem[], achievementCap = 100) => {
  const normalized = normalizeWeights(items);
  const raw = normalized.reduce((sum, item) => {
    const achievement = Math.min(Math.max(0, Number(item.achievement) || 0), achievementCap);
    return sum + (item.weight / 100) * achievement;
  }, 0);
  return storeScore(raw);
};

export const finalScore = (sections: ScoreSection[], achievementCap = 100) => {
  const contributionTotal = sections.reduce((sum, section) => sum + Math.max(0, Number(section.contribution) || 0), 0);
  if (Math.abs(contributionTotal - 100) > 0.01) {
    throw new Error(`Section contributions must total 100% (got ${contributionTotal}).`);
  }
  const raw = sections.reduce((sum, section) => {
    const score = sectionScore(section.items, achievementCap);
    return sum + score * (Number(section.contribution) / 100);
  }, 0);
  return storeScore(raw);
};

export const ratingBandForScore = (
  score: number,
  bands: Array<{ min: number; max: number; label: string }> = DEFAULT_RATING_BANDS,
) => {
  const displayed = displayScore(score);
  const match = bands.find((band) => displayed >= band.min && displayed <= band.max);
  return match?.label || 'Unrated';
};

export const weightsTotalOk = (weights: number[], tolerance = 0.01) =>
  Math.abs(weights.reduce((sum, value) => sum + Number(value || 0), 0) - 100) <= tolerance;

export const bandsContinuousNonOverlapping = (bands: Array<{ min: number; max: number }>) => {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  for (let index = 0; index < sorted.length; index += 1) {
    const band = sorted[index];
    if (band.max < band.min) return false;
    if (index > 0 && band.min < sorted[index - 1].max) return false;
  }
  return true;
};
