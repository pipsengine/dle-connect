import type { OvertimeAuthorization, OvertimeBookingOptions } from '@/lib/timesheet-entry-shared';

export type { OvertimeAuthorization, OvertimeBookingOptions } from '@/lib/timesheet-entry-shared';

export type OvertimeAuthorizationBooking = OvertimeAuthorization & {
  reason: string;
};

const readBool = (value: string | undefined, fallback: boolean) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

const isProduction = () => process.env.NODE_ENV === 'production';

/** Internal UAT/staging hosts (e.g. 192.168.5.5) — same feature defaults as local dev until go-live. */
const isInternalDeploy = () => {
  const deployEnv = String(process.env.DLE_DEPLOY_ENV || '').trim().toLowerCase();
  return deployEnv === 'internal' || deployEnv === 'staging' || deployEnv === 'uat';
};

const overtimeDefaultsEnabled = () => !isProduction() || isInternalDeploy();

/**
 * Timesheet overtime booking.
 * - Local/dev: enabled by default (NODE_ENV !== production).
 * - Internal IIS (DLE_DEPLOY_ENV=internal): enabled by default on 192.168.5.5 until go-live.
 * - Public production: set HRIS_TIMESHEET_OVERTIME_BOOKING_ENABLED=false.
 *
 * Booking always uses the same Overtime Management approval chain (Day and Night).
 * Open/dev/retro test modes are retired and cannot be re-enabled via env.
 */
export const isTimesheetOvertimeBookingEnabled = () =>
  readBool(process.env.HRIS_TIMESHEET_OVERTIME_BOOKING_ENABLED, overtimeDefaultsEnabled());

/** @deprecated Always false — open/dev/retro test modes are retired. */
export const isTimesheetOvertimeDevRelaxed = () => false;
/** @deprecated Always false — open/dev/retro test modes are retired. */
export const isTimesheetOvertimeRetroCorrection = () => false;
/** @deprecated Always false — open/dev/retro test modes are retired. */
export const isTimesheetOvertimeOpenBooking = () => false;

export const resolveOvertimeBookingOptions = (
  overrides?: Partial<OvertimeBookingOptions>,
): OvertimeBookingOptions => ({
  enabled: overrides?.enabled ?? isTimesheetOvertimeBookingEnabled(),
  // One standard path with Overtime Management — shift (Day/Night) does not change booking rules.
  devRelaxed: false,
  retroCorrection: false,
  openBooking: false,
});

/** Final-approved statuses from Overtime Management (same list for Day and Night). */
export const approvedOvertimeStatuses = (_devRelaxed = false): string[] =>
  ['HR Approved', 'MD Approved'];

const normalizeStatus = (status: string) => status.trim().replace(/\s+/g, '_');

const editableTimesheetStatuses = new Set(['Draft', 'Returned', 'Rejected']);

const retroOvertimeTimesheetStatuses = new Set([
  'Submitted',
  'Supervisor_Reviewed',
  'Project_Manager_Reviewed',
  'Cost_Control_Reviewed',
  'HR_Reviewed',
  'Project_Control_Reviewed',
  'Approved',
  'HR_Acknowledged',
  'Locked',
]);

/** Approved/posted timesheets that can receive retro overtime corrections. */
export const isRetroOvertimeTimesheetStatus = (status: string) =>
  retroOvertimeTimesheetStatuses.has(normalizeStatus(status));

export const canBookOvertimeOnTimesheet = (
  header: { status: string } | null | undefined,
  period: { status: string } | null | undefined,
  options: OvertimeBookingOptions,
) => {
  if (!options.enabled || !header) return false;
  const status = normalizeStatus(header.status || 'Draft');
  const periodOpen = period?.status === 'Open';
  if (periodOpen && editableTimesheetStatuses.has(status)) return true;
  if (!options.retroCorrection) return false;
  return isRetroOvertimeTimesheetStatus(status);
};

/**
 * Resolve overtime authorizations for the timesheet UI and booking API.
 * Always uses real Overtime Management approvals — same for Day and Night shifts.
 */
export const resolveOvertimeAuthorizationsForBooking = (
  authorizations: OvertimeAuthorization[],
  _projects: Array<{ code: string; name: string }> = [],
  _crewSize = 0,
  options: OvertimeBookingOptions,
  _lineProjects: Array<{ code: string; name: string }> = [],
): OvertimeAuthorizationBooking[] => {
  if (!options.enabled) return [];

  return authorizations.map((auth) => ({
    ...auth,
    reason: auth.reason || 'Approved overtime authorization.',
  }));
};

/** @deprecated Use resolveOvertimeAuthorizationsForBooking */
export const augmentDevOvertimeAuthorizations = (
  authorizations: OvertimeAuthorization[],
  projects: Array<{ code: string; name: string }>,
  crewSize: number,
  options: OvertimeBookingOptions,
): OvertimeAuthorization[] =>
  resolveOvertimeAuthorizationsForBooking(authorizations, projects, crewSize, options);

