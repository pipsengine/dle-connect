import { supervisorCodesMatch, timesheetLocationMatchKey, timesheetLocationsMatch } from '@/lib/timesheet-agege-blasting';

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

const employeeCodeKey = (value: string | null | undefined) => text(value).toUpperCase();

const YARD_SITE_KEY = /^(idioro|idiidioro|nnd|nigeriannavaldockyard|navaldockyard|agege|agegeagege)$/;

/** A mobilization saved against the home yard still belongs on the OFFSHORE sheet. */
export const mobilizationRosterSite = (site: string | null | undefined) => {
  const raw = text(site);
  const key = timesheetLocationMatchKey(raw);
  if (!raw || raw.toUpperCase() === 'OFFSHORE' || YARD_SITE_KEY.test(key)) return 'OFFSHORE';
  return raw;
};

/** Active offshore mobilization codes for this work date. */
export const mobilizedEmployeeCodes = (rows: Array<{ employeeCode?: string | null }>) => {
  const codes = new Set<string>();
  for (const row of rows) {
    const code = employeeCodeKey(row.employeeCode);
    if (code) codes.add(code);
  }
  return codes;
};

export const isMobilizedOffshoreEmployee = (
  employeeCode: string | null | undefined,
  mobilizedCodes: Set<string>,
) => {
  const code = employeeCodeKey(employeeCode);
  return Boolean(code && mobilizedCodes.has(code));
};

/**
 * Offshore location shows the host supervisor's mobilized crew only.
 * Another supervisor on the home roster does not pull that crew onto this sheet.
 */
export const offshoreMobilizationsForSheet = <T extends { site?: string | null; supervisor?: string | null }>(
  rows: T[],
  location: string,
  sheetSupervisor: string,
  sheetSupervisorCode = '',
) => {
  const site = text(location).toLowerCase();
  if (!site) return [];
  return rows.filter((row) =>
    mobilizationRosterSite(row.site).toLowerCase() === site
    && mobilizationBelongsOnSheet(text(row.supervisor), sheetSupervisor, sheetSupervisorCode),
  );
};

/**
 * People already booked on this supervisor's sheet at the offshore site stay visible.
 * Their mobilization may name a foreman on the same crew; that does not take them off this sheet.
 * Resolve must keep period-carried OFFSHORE lines too — otherwise a fresh day drops to
 * hosted mobilizations only (the Karonwi 5-of-13 case).
 */
export const bookedOffshoreLinesForSheet = <T extends { employeeCode?: string | null; location?: string | null }>(
  lines: T[],
  location: string,
) => {
  const site = text(location);
  if (!site) return [];
  return lines.filter((line) => employeeCodeKey(line.employeeCode) && timesheetLocationsMatch(line.location, site));
};

/** Keep a mobilized person on save when this sheet already books them at offshore. */
export const keepMobilizedLineOnSheet = (
  line: { employeeCode?: string | null; location?: string | null },
  mobilizedCodes: Set<string>,
  hostedBySheet: (employeeCode: string) => boolean,
) => !isMobilizedOffshoreEmployee(line.employeeCode, mobilizedCodes)
  || hostedBySheet(line.employeeCode || '')
  || timesheetLocationsMatch(line.location, 'OFFSHORE');
