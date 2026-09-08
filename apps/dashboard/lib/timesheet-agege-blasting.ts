/**
 * Fixed timesheet context for Agege blaster supervisor C1001 and crew.
 * Location = AGEGE, work center = Blasting (not Painting / trade-as-location).
 */

export const AGEGE_BLASTING_SUPERVISOR_CODE = 'C1001';
export const AGEGE_TIMESHEET_LOCATION = 'AGEGE';
export const AGEGE_BLASTING_WORK_CENTER = 'Blasting';
/** Legacy / conflicting work center that must not be used for this supervisor. */
export const AGEGE_BLASTING_CONFLICTING_WORK_CENTER = 'Painting';

const clean = (value: unknown) => String(value || '').trim();

/** Extract employee code from `C1001 - Name` or `Name [C1001]`. */
export const extractSupervisorEmployeeCode = (value: string | null | undefined) => {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.includes(' - ')) {
    const head = raw.split(' - ')[0]?.trim() || '';
    if (/^[A-Za-z]?\d+[A-Za-z0-9]*$/.test(head)) return head.toUpperCase();
  }
  const bracket = raw.match(/\[([A-Za-z]?\d+[A-Za-z0-9]*)\]/);
  if (bracket?.[1]) return bracket[1].toUpperCase();
  if (/^[A-Za-z]?\d+[A-Za-z0-9]*$/.test(raw)) return raw.toUpperCase();
  return '';
};

export const isAgegeBlastingSupervisor = (supervisorValue: string | null | undefined) =>
  extractSupervisorEmployeeCode(supervisorValue) === AGEGE_BLASTING_SUPERVISOR_CODE;

/**
 * Collapse duplicated site labels such as "AGEGE - AGEGE" → "AGEGE".
 * Keeps distinct compound sites like "Lagos - Idi Oro" unchanged.
 */
export const normalizeTimesheetLocationLabel = (value: string | null | undefined) => {
  const raw = clean(value);
  if (!raw) return '';
  if (/^agege(\s*-\s*agege)*$/i.test(raw) || /^agege$/i.test(raw)) return AGEGE_TIMESHEET_LOCATION;

  const parts = raw.split(/\s*-\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].toLowerCase();
    if (parts.every((part) => part.toLowerCase() === first)) {
      return parts[0];
    }
  }
  return raw;
};

export const isAgegeTimesheetLocation = (value: string | null | undefined) =>
  /\bagege\b/i.test(normalizeTimesheetLocationLabel(value) || clean(value));

/** True when a "location" is really a trade / work-center label (e.g. Painting). */
export const isTimesheetTradeLabelLocation = (
  locationName: string | null | undefined,
  workCenterNames: Iterable<string>,
) => {
  const selected = normalizeTimesheetLocationLabel(locationName).toLowerCase() || clean(locationName).toLowerCase();
  if (!selected) return false;
  for (const name of workCenterNames) {
    const workCenter = clean(name).toLowerCase();
    if (workCenter && (selected === workCenter || selected.includes(workCenter) || workCenter.includes(selected))) {
      return true;
    }
  }
  return false;
};

/** Always prefer the canonical AGEGE label when any Agege variant is present. */
export const resolveAgegeLocationLabel = (_locationNames: string[] = []) => AGEGE_TIMESHEET_LOCATION;

/**
 * Deduplicate location pick-list values after normalizing AGEGE - AGEGE → AGEGE
 * and other repeated "Site - Site" labels.
 */
export const dedupeTimesheetLocationLabels = (values: Array<string | null | undefined>) => {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeTimesheetLocationLabel(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, normalized);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

/**
 * Force C1001 sheets onto AGEGE + Blasting and drop Painting / trade-as-location defaults.
 * Explicit user location is kept only when it is a real Agege site (not a trade label).
 */
export const applyAgegeBlastingSupervisorContext = (input: {
  supervisorValue: string | null | undefined;
  locationName?: string | null;
  workCenterName?: string | null;
  locationNames?: string[];
  workCenterNames?: string[];
}) => {
  if (!isAgegeBlastingSupervisor(input.supervisorValue)) {
    return {
      locationName: normalizeTimesheetLocationLabel(input.locationName) || clean(input.locationName),
      workCenterName: clean(input.workCenterName),
      forced: false as const,
    };
  }

  const workCenterNames = input.workCenterNames || [];
  const requestedLocation = normalizeTimesheetLocationLabel(input.locationName) || clean(input.locationName);
  const requestedWorkCenter = clean(input.workCenterName);

  const locationLooksTrade =
    !requestedLocation
    || isTimesheetTradeLabelLocation(requestedLocation, workCenterNames)
    || /^painting|blasting$/i.test(requestedLocation);

  const workCenterConflicts =
    !requestedWorkCenter
    || requestedWorkCenter.toLowerCase() === AGEGE_BLASTING_CONFLICTING_WORK_CENTER.toLowerCase();

  const locationMatchesAgege = isAgegeTimesheetLocation(requestedLocation);

  return {
    locationName: locationLooksTrade || !locationMatchesAgege ? AGEGE_TIMESHEET_LOCATION : requestedLocation,
    workCenterName: workCenterConflicts ? AGEGE_BLASTING_WORK_CENTER : requestedWorkCenter,
    forced: true as const,
  };
};
