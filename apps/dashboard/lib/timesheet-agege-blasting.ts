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

/** True when a "location" is really a trade / work-center label (e.g. Painting). */
export const isTimesheetTradeLabelLocation = (
  locationName: string | null | undefined,
  workCenterNames: Iterable<string>,
) => {
  const selected = clean(locationName).toLowerCase();
  if (!selected) return false;
  for (const name of workCenterNames) {
    const workCenter = clean(name).toLowerCase();
    if (workCenter && (selected === workCenter || selected.includes(workCenter) || workCenter.includes(selected))) {
      return true;
    }
  }
  return false;
};

export const resolveAgegeLocationLabel = (locationNames: string[]) => {
  const agege = locationNames.find((name) => /^agege(\s*-\s*agege)?$/i.test(clean(name)));
  if (agege) return agege;
  const contains = locationNames.find((name) => /\bagege\b/i.test(clean(name)));
  return contains || AGEGE_TIMESHEET_LOCATION;
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
      locationName: clean(input.locationName),
      workCenterName: clean(input.workCenterName),
      forced: false as const,
    };
  }

  const workCenterNames = input.workCenterNames || [];
  const locationNames = input.locationNames || [];
  const agegeLocation = resolveAgegeLocationLabel(locationNames);
  const requestedLocation = clean(input.locationName);
  const requestedWorkCenter = clean(input.workCenterName);

  const locationLooksTrade =
    !requestedLocation
    || isTimesheetTradeLabelLocation(requestedLocation, workCenterNames)
    || /^painting|blasting$/i.test(requestedLocation);

  const workCenterConflicts =
    !requestedWorkCenter
    || requestedWorkCenter.toLowerCase() === AGEGE_BLASTING_CONFLICTING_WORK_CENTER.toLowerCase();

  const locationMatchesAgege = requestedLocation && /\bagege\b/i.test(requestedLocation);

  return {
    locationName: locationLooksTrade || !locationMatchesAgege ? agegeLocation : requestedLocation,
    workCenterName: workCenterConflicts ? AGEGE_BLASTING_WORK_CENTER : requestedWorkCenter,
    forced: true as const,
  };
};
