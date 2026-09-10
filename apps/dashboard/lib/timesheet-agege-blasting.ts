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
const compactEmployeeCode = (value: string) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

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

/**
 * Treat Sage `P0013` and legacy `0013` as the same supervisor.
 * Contract codes such as C1001 stay distinct from numeric `1001`.
 */
export const normalizeSupervisorMatchKey = (value: string | null | undefined) => {
  const code = extractSupervisorEmployeeCode(value) || compactEmployeeCode(String(value || ''));
  if (!code) return '';
  const compact = compactEmployeeCode(code);
  const permanent = compact.match(/^P0*(\d+)$/);
  if (permanent) return permanent[1].replace(/^0+/, '') || permanent[1];
  if (/^\d+$/.test(compact)) return compact.replace(/^0+/, '') || compact;
  return compact;
};

export const supervisorCodesMatch = (left?: string | null, right?: string | null) => {
  const a = normalizeSupervisorMatchKey(left);
  const b = normalizeSupervisorMatchKey(right);
  return Boolean(a && b && a === b);
};

const compactPersonName = (value: string | null | undefined) =>
  clean(value).toLowerCase().replace(/[^a-z]/g, '');

/**
 * Same-day booking clash identity.
 * P0013 matches 0013. C1001 does not match 1001 or P1001.
 */
export const timesheetEmployeeRecordsMatch = (
  left: { employeeNo?: string | null; employeeId?: string | null; employeeName?: string | null },
  right: { employeeNo?: string | null; employeeId?: string | null; employeeName?: string | null },
) => {
  const leftCodes = [left.employeeNo, left.employeeId].map(clean).filter(Boolean);
  const rightCodes = [right.employeeNo, right.employeeId].map(clean).filter(Boolean);
  for (const a of leftCodes) {
    for (const b of rightCodes) {
      if (supervisorCodesMatch(a, b)) return true;
    }
  }
  const leftName = compactPersonName(left.employeeName);
  const rightName = compactPersonName(right.employeeName);
  return Boolean(leftName && rightName && leftName === rightName);
};

/** SQL / lookup variants so `P0013` also finds rows stored as `0013`. */
export const supervisorCodeLookupVariants = (value: string | null | undefined) => {
  const code = extractSupervisorEmployeeCode(value) || compactEmployeeCode(String(value || ''));
  if (!code) return [];
  const variants = new Set<string>([code]);
  const compact = compactEmployeeCode(code);
  const digits = compact.match(/^P?0*(\d+)$/)?.[1];
  if (digits) {
    const stripped = digits.replace(/^0+/, '') || digits;
    const padded = stripped.padStart(4, '0');
    variants.add(digits);
    variants.add(stripped);
    variants.add(padded);
    variants.add(`P${stripped}`);
    variants.add(`P${padded}`);
    variants.add(`P${digits}`);
  }
  return [...variants];
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
