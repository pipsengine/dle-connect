import { supervisorCodesMatch } from '@/lib/timesheet-agege-blasting';

const text = (value: unknown) => String(value ?? '').trim();

const sameOffshoreSupervisor = (left: string, right: string) => {
  if (supervisorCodesMatch(left, right)) return true;
  const a = text(left).toLowerCase();
  const b = text(right).toLowerCase();
  if (!a || !b || a === '—' || b === '—' || a === 'unassigned' || b === 'unassigned') return false;
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  return shorter.length >= 8 && longer.includes(shorter);
};

/**
 * Mobilized crew stays on the offshore supervisor's own timesheet.
 * A higher supervisor does not inherit that crew just because the offshore supervisor is also listed on their roster.
 */
export const mobilizationBelongsOnSheet = (offshoreSupervisor: string, sheetSupervisor: string, sheetSupervisorCode = '') => {
  if (sameOffshoreSupervisor(offshoreSupervisor, sheetSupervisor)) return true;
  return Boolean(sheetSupervisorCode) && sameOffshoreSupervisor(offshoreSupervisor, sheetSupervisorCode);
};
