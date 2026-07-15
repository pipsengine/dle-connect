import { configuredFleetDriverSupervisorCodes } from '@/lib/access/fleet-access';
import { readUsers, type UserAccount } from '@/lib/auth/auth-store';
import type { SessionPayload } from '@/lib/auth/session';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import type { TripWorkflowAction } from '@/lib/fleet-management/trip-workflow';
import {
  fleetTripActiveUrl,
  fleetTripDispatchUrl,
  fleetTripRequestsUrl,
  fleetTripSupervisorUrl,
  fleetTripWorkspacePath,
  fleetTripWorkspaceUrl,
  type FleetTripWorkspaceTab,
} from '@/lib/fleet-trip-urls';
import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';
import type { FleetTrip, FleetVehicle } from '@/lib/logistics-fleet-store';
import {
  resolveEmployeeMailbox,
  sendFleetTripAllocationEmail,
  sendFleetTripStatusEmail,
  sendFleetTripSupervisorRequestEmail,
} from '@/lib/mail-service';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';

const compact = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => compact(value).toLowerCase();

type FleetRecipient = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  roles: string[];
  employeeCode?: string;
};

const DISPATCHER_ROLE_PATTERNS = [
  /fleet manager/i,
  /fleet administrator/i,
  /fleet dispatcher/i,
  /driver supervisor/i,
];

const SUPERVISOR_ROLE_PATTERNS = [
  /driver supervisor/i,
  /fleet manager/i,
  /fleet administrator/i,
  /fleet dispatcher/i,
];

const hasFleetPermission = (user: UserAccount, keys: string[]) => {
  const permissions = user.permissions || [];
  if (permissions.includes('*') || permissions.includes('fleet.*')) return true;
  return keys.some((key) => permissions.includes(key));
};

const systemSessionFor = (recipient: FleetRecipient): SessionPayload => ({
  sub: recipient.id,
  username: recipient.username,
  fullName: recipient.fullName,
  employeeCode: recipient.employeeCode || recipient.username,
  roles: recipient.roles,
  permissions: [],
  status: 'Active',
  firstLoginRequired: false,
  passwordResetRequired: false,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const dedupeRecipients = (recipients: FleetRecipient[]) => {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = lower(recipient.email) || lower(recipient.employeeCode) || lower(recipient.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toUserRecipient = (user: UserAccount): FleetRecipient => ({
  id: user.id,
  username: user.username,
  fullName: user.fullName || user.username,
  email: compact(user.email),
  roles: user.roles || [],
  employeeCode: compact(user.employeeCode || user.employeeId || user.username),
});

const findDirectoryEmployee = (employees: DleEmployeeDirectoryRow[], code: string) => {
  const target = lower(code);
  if (!target) return null;
  return employees.find((employee) =>
    [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId, employee.officialEmail, employee.email]
      .some((value) => lower(value) === target),
  ) || null;
};

const recipientFromDirectory = async (
  employees: DleEmployeeDirectoryRow[],
  users: UserAccount[],
  code: string,
  displayNameFallback?: string,
): Promise<FleetRecipient | null> => {
  const employee = findDirectoryEmployee(employees, code);
  const email = compact(await resolveEmployeeMailbox(employee))
    || compact(users.find((user) =>
      [user.employeeCode, user.employeeId, user.username].some((value) => lower(value) === lower(code)),
    )?.email);
  const user = users.find((item) =>
    [item.employeeCode, item.employeeId, item.username].some((value) => lower(value) === lower(code))
    || (email && lower(item.email) === lower(email)),
  );
  if (!email && !user) return null;
  return {
    id: user?.id || code,
    username: user?.username || code,
    fullName: user?.fullName || employee?.fullName || displayNameFallback || code,
    email: email || compact(user?.email),
    roles: user?.roles || [],
    employeeCode: compact(employee?.employeeCode || employee?.employeeId || user?.employeeCode || code),
  };
};

export const resolveFleetDriverSupervisors = async (): Promise<FleetRecipient[]> => {
  const users = await readUsers();
  const configuredCodes = configuredFleetDriverSupervisorCodes();
  const configuredSet = new Set(configuredCodes);

  const isNamedSupervisorRole = (user: UserAccount) =>
    SUPERVISOR_ROLE_PATTERNS.some((pattern) => user.roles.some((role) => pattern.test(role)));

  const active = users.filter((user) => user.status === 'Active' || !user.status);
  const byConfiguredCode = active
    .filter((user) => configuredSet.has(compact(user.employeeCode || user.employeeId || user.username).toUpperCase()))
    .map(toUserRecipient)
    .filter((user) => user.email || user.employeeCode);
  const byNamedRole = active
    .filter(isNamedSupervisorRole)
    .map(toUserRecipient)
    .filter((user) => user.email || user.employeeCode);

  // Prefer explicit Driver Supervisor codes + named fleet/supervisor roles (not every * / fleet.approve admin).
  const primary = dedupeRecipients([...byConfiguredCode, ...byNamedRole]);
  if (primary.length) return primary;

  // Legacy: permission holders when no designated supervisor exists yet.
  const byPermission = active
    .filter((user) => hasFleetPermission(user, ['driver.approve', 'fleet.approve']))
    .map(toUserRecipient)
    .filter((user) => user.email || user.employeeCode);
  if (byPermission.length) return dedupeRecipients(byPermission);

  // Fall back to directory mailbox for configured codes even if portal account is missing.
  const employees = (await readPayrollEmployees()).employees;
  const directoryFallbacks: FleetRecipient[] = [];
  for (const code of configuredSet) {
    const recipient = await recipientFromDirectory(employees, users, code);
    if (recipient) directoryFallbacks.push({ ...recipient, roles: recipient.roles.length ? recipient.roles : ['Driver Supervisor'] });
  }
  if (directoryFallbacks.length) return dedupeRecipients(directoryFallbacks);

  const fallback = compact(process.env.FLEET_DRIVER_SUPERVISOR_EMAIL || process.env.FLEET_APPROVAL_FALLBACK_EMAIL);
  return fallback ? [{
    id: 'fleet-driver-supervisor-fallback',
    username: 'Driver Supervisor',
    fullName: 'Driver Supervisor',
    email: fallback,
    roles: ['Driver Supervisor'],
    employeeCode: 'Driver Supervisor',
  }] : [];
};

export const resolveFleetDispatchers = async (): Promise<FleetRecipient[]> => {
  const users = await readUsers();
  const matches = users
    .filter((user) => user.status === 'Active' || !user.status)
    .filter((user) =>
      DISPATCHER_ROLE_PATTERNS.some((pattern) => user.roles.some((role) => pattern.test(role)))
      || hasFleetPermission(user, ['fleet.approve', 'driver.approve']),
    )
    .map(toUserRecipient)
    .filter((user) => user.email || user.employeeCode);
  if (matches.length) return dedupeRecipients(matches);
  return resolveFleetDriverSupervisors();
};

const tripEmailPayload = (
  trip: FleetTrip,
  labels?: {
    vehicleLabel?: string;
    driverLabel?: string;
    vehicle?: FleetVehicle | null;
    driverName?: string;
    driverEmployeeCode?: string;
    driverPhone?: string;
    driverCategory?: string;
    allocationStatus?: string;
  },
) => ({
  requestNo: trip.requestNo,
  requester: trip.requester,
  origin: trip.origin,
  destination: trip.destination,
  purpose: trip.purpose,
  startDate: trip.startDate,
  endDate: trip.endDate,
  projectCode: trip.projectCode,
  costCenter: trip.costCenter,
  vehicleLabel: labels?.vehicleLabel,
  driverLabel: labels?.driverLabel,
  allocationStatus: labels?.allocationStatus,
  vehicleAssetCode: labels?.vehicle?.assetCode,
  vehiclePlate: labels?.vehicle?.plateNumber,
  vehicleType: labels?.vehicle?.vehicleType,
  vehicleMakeModel: labels?.vehicle?.makeModel,
  driverName: labels?.driverName,
  driverEmployeeCode: labels?.driverEmployeeCode,
  driverPhone: labels?.driverPhone,
  driverCategory: labels?.driverCategory,
  allocatedBy: trip.allocatedBy,
  allocatedAt: trip.allocatedAt,
});

const notifyRecipient = async (input: {
  recipient: FleetRecipient;
  kind: 'Approval' | 'Workflow';
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  href: string;
  actor: string;
  tripId: string;
  action: string;
  sendEmail: () => Promise<{ sent: boolean; reason?: string }>;
}) => {
  await createEnterpriseNotification(systemSessionFor(input.recipient), {
    kind: input.kind,
    module: 'Logistics & Fleet',
    title: input.title,
    body: input.body,
    severity: input.severity,
    href: input.href,
    actor: input.actor,
    channels: ['In-App', 'Email'],
    recipientRoles: input.recipient.roles,
    recipientEmployeeCode: input.recipient.employeeCode || input.recipient.username,
    metadata: {
      tripId: input.tripId,
      action: input.action,
      module: 'logistics-fleet',
    },
  });

  if (!input.recipient.email) return { notified: 1, emailed: 0 };
  try {
    const result = await input.sendEmail();
    if (!result.sent) {
      console.warn('[fleet-trip-notifications] Email not sent', {
        to: input.recipient.email,
        code: input.recipient.employeeCode,
        reason: result.reason || 'unknown',
        tripId: input.tripId,
        action: input.action,
      });
    }
    return { notified: 1, emailed: result.sent ? 1 : 0 };
  } catch (error) {
    console.warn('[fleet-trip-notifications] Email send failed.', error);
    return { notified: 1, emailed: 0 };
  }
};

export const notifyFleetTripWorkflow = async (input: {
  action: TripWorkflowAction | 'create-trip';
  trip: FleetTrip;
  vehicles?: FleetVehicle[];
  actor?: string;
  reason?: string;
  baseUrl?: string | null;
}) => {
  const actor = compact(input.actor) || 'Fleet Workflow';
  const trip = input.trip;
  const origin = resolveWorkflowLinkOrigin(input.baseUrl);
  const fleetHomeLink = `${origin}/logistics-fleet`;
  const tripsHomeLink = fleetTripWorkspaceUrl('requests', undefined, input.baseUrl);
  const vehicle = input.vehicles?.find((item) => item.id === trip.vehicleId) || null;
  const vehicleLabel = vehicle
    ? `${vehicle.assetCode} · ${vehicle.plateNumber}`
    : trip.vehicleId || '';
  const employeeSource = await readPayrollEmployees();
  const users = await readUsers();
  const driverEmployee = trip.driverId ? findDirectoryEmployee(employeeSource.employees, trip.driverId) : null;
  const driverRecipient = trip.driverId
    ? await recipientFromDirectory(employeeSource.employees, users, trip.driverId)
    : null;
  const requesterRecipient = await recipientFromDirectory(
    employeeSource.employees,
    users,
    trip.requesterEmployeeCode,
    trip.requester,
  );
  const driverPhone = compact(
    driverEmployee?.primaryPhone
    || driverEmployee?.phone
    || driverEmployee?.alternatePhone
    || '',
  );
  const tripMail = tripEmailPayload(trip, {
    vehicleLabel: vehicleLabel || undefined,
    driverLabel: driverRecipient?.fullName || driverEmployee?.fullName || trip.driverId || undefined,
    vehicle,
    driverName: driverRecipient?.fullName || driverEmployee?.fullName || undefined,
    driverEmployeeCode: trip.driverId || undefined,
    driverPhone: driverPhone || undefined,
    allocationStatus: trip.status === 'ReadyToDispatch' ? 'Approved & Allocated — Ready to Dispatch' : trip.status,
  });

  let notified = 0;
  let emailed = 0;

  const accumulate = async (promise: Promise<{ notified: number; emailed: number }>) => {
    const result = await promise;
    notified += result.notified;
    emailed += result.emailed;
  };

  if (input.action === 'submit-trip' || input.action === 'create-trip') {
    const supervisors = await resolveFleetDriverSupervisors();
    // Always include the trip's designated Driver Supervisor (stored on lineManager* fields).
    if (compact(trip.lineManagerEmployeeCode)) {
      const designated = await recipientFromDirectory(
        employeeSource.employees,
        users,
        trip.lineManagerEmployeeCode,
        trip.lineManagerName,
      );
      if (designated) supervisors.push(designated);
    }
    const recipients = dedupeRecipients(supervisors);
    const href = fleetTripWorkspacePath('supervisor', trip.id);
    const workspaceLink = fleetTripSupervisorUrl(trip.id, input.baseUrl);
    console.info('[fleet-trip-notifications] Supervisor recipients', {
      requestNo: trip.requestNo,
      action: input.action,
      recipients: recipients.map((item) => ({ code: item.employeeCode, email: item.email ? 'set' : '', name: item.fullName })),
    });
    for (const recipient of recipients) {
      await accumulate(notifyRecipient({
        recipient,
        kind: 'Approval',
        title: `Trip approval required — ${trip.requestNo}`,
        body: `${trip.requester} requested travel to ${trip.destination} (${trip.origin} → ${trip.destination}). Approve and allocate vehicle & driver in Logistics & Fleet.`,
        severity: 'warning',
        href,
        actor,
        tripId: trip.id,
        action: input.action,
        sendEmail: () => sendFleetTripSupervisorRequestEmail({
          recipientName: recipient.fullName,
          recipientEmail: recipient.email,
          trip: tripMail,
          actorName: actor,
          workspaceLink,
          tripsLink: tripsHomeLink,
          fleetHomeLink,
          baseUrl: input.baseUrl,
        }),
      }));
    }
    console.info('[fleet-trip-notifications] Supervisor notify complete', { requestNo: trip.requestNo, notified, emailed });
    return { notified, emailed };
  }

  if (input.action === 'allocate-trip') {
    const dispatchers = await resolveFleetDispatchers();
    const allocationSummary = [
      `Status: Approved & Allocated`,
      `Destination: ${trip.destination}`,
      vehicle ? `Vehicle: ${vehicle.assetCode} · ${vehicle.plateNumber} · ${vehicle.vehicleType} · ${vehicle.makeModel}` : null,
      `Driver: ${tripMail.driverName || trip.driverId}${driverPhone ? ` · Tel ${driverPhone}` : ''}`,
    ].filter(Boolean).join(' | ');

    if (requesterRecipient) {
      await accumulate(notifyRecipient({
        recipient: requesterRecipient,
        kind: 'Workflow',
        title: `Trip allocated — ${trip.requestNo}`,
        body: `Your trip to ${trip.destination} has been allocated. ${allocationSummary}.`,
        severity: 'success',
        href: fleetTripWorkspacePath('requests', trip.id),
        actor,
        tripId: trip.id,
        action: input.action,
        sendEmail: () => sendFleetTripAllocationEmail({
          recipientName: requesterRecipient.fullName,
          recipientEmail: requesterRecipient.email,
          trip: tripMail,
          actorName: actor,
          workspaceLink: fleetTripRequestsUrl(trip.id, input.baseUrl),
          fleetHomeLink,
          audience: 'requester',
          baseUrl: input.baseUrl,
        }),
      }));
    }

    if (driverRecipient) {
      await accumulate(notifyRecipient({
        recipient: driverRecipient,
        kind: 'Workflow',
        title: `Trip allocation assigned — ${trip.requestNo}`,
        body: `You are allocated to drive to ${trip.destination}. ${allocationSummary}.`,
        severity: 'success',
        href: fleetTripWorkspacePath('active', trip.id),
        actor,
        tripId: trip.id,
        action: input.action,
        sendEmail: () => sendFleetTripAllocationEmail({
          recipientName: driverRecipient.fullName,
          recipientEmail: driverRecipient.email,
          trip: tripMail,
          actorName: actor,
          workspaceLink: fleetTripActiveUrl(trip.id, input.baseUrl),
          fleetHomeLink,
          audience: 'driver',
          baseUrl: input.baseUrl,
        }),
      }));
    }

    const dispatcherOnly = dedupeRecipients(dispatchers).filter((recipient) => {
      const sameRequester = requesterRecipient && lower(recipient.employeeCode || recipient.email) === lower(requesterRecipient.employeeCode || requesterRecipient.email);
      const sameDriver = driverRecipient && lower(recipient.employeeCode || recipient.email) === lower(driverRecipient.employeeCode || driverRecipient.email);
      return !sameRequester && !sameDriver;
    });
    for (const recipient of dispatcherOnly) {
      await accumulate(notifyRecipient({
        recipient,
        kind: 'Workflow',
        title: `Trip ready to dispatch — ${trip.requestNo}`,
        body: `${trip.requestNo} to ${trip.destination} is allocated and ready for dispatch. ${allocationSummary}.`,
        severity: 'success',
        href: fleetTripWorkspacePath('dispatch', trip.id),
        actor,
        tripId: trip.id,
        action: input.action,
        sendEmail: () => sendFleetTripAllocationEmail({
          recipientName: recipient.fullName,
          recipientEmail: recipient.email,
          trip: tripMail,
          actorName: actor,
          workspaceLink: fleetTripDispatchUrl(trip.id, input.baseUrl),
          fleetHomeLink,
          audience: 'dispatcher',
          baseUrl: input.baseUrl,
        }),
      }));
    }
    return { notified, emailed };
  }

  if (input.action === 'reject-line' || input.action === 'return-trip' || input.action === 'cancel-trip') {
    if (!requesterRecipient) return { notified, emailed };
    const href = fleetTripWorkspacePath('requests', trip.id);
    const workspaceLink = fleetTripRequestsUrl(trip.id, input.baseUrl);
    const labels =
      input.action === 'reject-line'
        ? {
          title: `Trip rejected — ${trip.requestNo}`,
          headline: 'Trip request rejected',
          intro: 'Your trip request was rejected by the Driver Supervisor.',
          tone: 'danger' as const,
        }
        : input.action === 'return-trip'
          ? {
            title: `Trip returned — ${trip.requestNo}`,
            headline: 'Trip returned for correction',
            intro: 'Your trip request was returned. Update the details and resubmit to the Driver Supervisor.',
            tone: 'warning' as const,
          }
          : {
            title: `Trip cancelled — ${trip.requestNo}`,
            headline: 'Trip request cancelled',
            intro: 'A trip request was cancelled.',
            tone: 'warning' as const,
          };
    await accumulate(notifyRecipient({
      recipient: requesterRecipient,
      kind: 'Approval',
      title: labels.title,
      body: `${labels.intro}${input.reason ? ` Reason: ${input.reason}` : ''}`,
      severity: input.action === 'reject-line' ? 'critical' : 'warning',
      href,
      actor,
      tripId: trip.id,
      action: input.action,
      sendEmail: () => sendFleetTripStatusEmail({
        recipientName: requesterRecipient.fullName,
        recipientEmail: requesterRecipient.email,
        subject: labels.title,
        headline: labels.headline,
        intro: labels.intro,
        tone: labels.tone,
        trip: tripMail,
        actorName: actor,
        reason: input.reason,
        workspaceLink,
        actionLabel: 'Open trip request',
        secondaryLink: fleetHomeLink,
        secondaryLabel: 'Logistics & Fleet Home',
        baseUrl: input.baseUrl,
      }),
    }));
    return { notified, emailed };
  }

  if (input.action === 'dispatch-trip') {
    const recipients = dedupeRecipients([
      ...(driverRecipient ? [driverRecipient] : []),
      ...(requesterRecipient ? [requesterRecipient] : []),
    ]);
    for (const recipient of recipients) {
      const isDriver = driverRecipient && lower(recipient.id) === lower(driverRecipient.id);
      const tab: FleetTripWorkspaceTab = isDriver ? 'active' : 'requests';
      await accumulate(notifyRecipient({
        recipient,
        kind: 'Workflow',
        title: `Trip dispatched — ${trip.requestNo}`,
        body: `${trip.requestNo} (${trip.origin} → ${trip.destination}) has been dispatched.`,
        severity: 'info',
        href: fleetTripWorkspacePath(tab, trip.id),
        actor,
        tripId: trip.id,
        action: input.action,
        sendEmail: () => sendFleetTripStatusEmail({
          recipientName: recipient.fullName,
          recipientEmail: recipient.email,
          subject: `Trip dispatched — ${trip.requestNo}`,
          headline: 'Trip dispatched',
          intro: isDriver
            ? 'You have been dispatched for a trip. Review the route and vehicle details in Logistics & Fleet.'
            : 'Your trip has been dispatched.',
          tone: 'info',
          trip: tripMail,
          actorName: actor,
          workspaceLink: isDriver ? fleetTripActiveUrl(trip.id, input.baseUrl) : fleetTripRequestsUrl(trip.id, input.baseUrl),
          actionLabel: isDriver ? 'Open active trip' : 'Open trip request',
          secondaryLink: fleetHomeLink,
          secondaryLabel: 'Logistics & Fleet Home',
          baseUrl: input.baseUrl,
        }),
      }));
    }
    return { notified, emailed };
  }

  if (input.action === 'complete-trip') {
    const supervisors = await resolveFleetDriverSupervisors();
    const recipients = dedupeRecipients([
      ...(requesterRecipient ? [requesterRecipient] : []),
      ...supervisors,
    ]);
    for (const recipient of recipients) {
      await accumulate(notifyRecipient({
        recipient,
        kind: 'Workflow',
        title: `Trip completed — ${trip.requestNo}`,
        body: `${trip.requestNo} (${trip.origin} → ${trip.destination}) was marked complete.`,
        severity: 'success',
        href: fleetTripWorkspacePath('history', trip.id),
        actor,
        tripId: trip.id,
        action: input.action,
        sendEmail: () => sendFleetTripStatusEmail({
          recipientName: recipient.fullName,
          recipientEmail: recipient.email,
          subject: `Trip completed — ${trip.requestNo}`,
          headline: 'Trip completed',
          intro: 'The trip has been closed in Logistics & Fleet.',
          tone: 'success',
          trip: tripMail,
          actorName: actor,
          workspaceLink: fleetTripWorkspaceUrl('history', trip.id, input.baseUrl),
          actionLabel: 'Open trip history',
          secondaryLink: fleetHomeLink,
          secondaryLabel: 'Logistics & Fleet Home',
          baseUrl: input.baseUrl,
        }),
      }));
    }
    return { notified, emailed };
  }

  return { notified, emailed };
};

export const safeNotifyFleetTripWorkflow = async (
  ...args: Parameters<typeof notifyFleetTripWorkflow>
) => {
  try {
    return await notifyFleetTripWorkflow(...args);
  } catch (error) {
    console.warn('[fleet-trip-notifications] Notification orchestration failed.', error);
    return { notified: 0, emailed: 0 };
  }
};
