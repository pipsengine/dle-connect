import { NextRequest, NextResponse } from 'next/server';
import {
  canAllocateFleetTrip,
  canDispatchFleetTrip,
  canManageFleet,
  canSubmitFleetTrip,
  canViewFleet,
} from '@/lib/access/fleet-access';
import { effectivePermissionsForUser } from '@/lib/auth/access-control-store';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { TRIP_WORKFLOW_ACTIONS, isPendingDriverSupervisor, type TripWorkflowAction } from '@/lib/fleet-management/trip-workflow';
import { safeNotifyFleetTripWorkflow } from '@/lib/fleet-trip-notification-service';
import {
  createLogisticsFleetRecord,
  performFleetAction,
  performTripWorkflow,
  readLogisticsFleetData,
  updateFleetWorkflow,
  updateLogisticsFleetRecord,
  type LogisticsEntity,
} from '@/lib/logistics-fleet-store';
import { resolveWorkflowLinkOriginFromRequest } from '@/lib/public-app-url';

const entities = new Set<LogisticsEntity>([
  'vehicle', 'driver', 'trip', 'maintenance', 'fuel', 'compliance', 'request',
  'incident', 'vendor', 'contract', 'telematics', 'cost',
]);
const workflowEntities = new Set(['driver', 'trip', 'maintenance', 'request', 'incident']);
const workflowActions = new Set(['approve', 'reject', 'close', 'dispatch', 'complete', 'request-correction', 'escalate']);
const operationalActions = new Set([
  'assign-vehicle', 'reassign-vehicle', 'unassign-vehicle', 'suspend-driver',
  'reactivate-driver', 'verify-document', 'reject-document', 'assign-trip-driver',
]);

const ok = (data: unknown, status = 200) => NextResponse.json({ status: 'success', data }, { status });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const sessionFrom = async (request: NextRequest) => verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

const permissionsFrom = async (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) => {
  if (session.isGlobalAdmin || session.sub === 'global-admin') return ['*'];
  return effectivePermissionsForUser(session.sub, session.roles);
};

const guardView = async (request: NextRequest) => {
  const session = await sessionFrom(request);
  if (!session) return { error: err(401, 'Unauthenticated.') } as const;
  const permissions = await permissionsFrom(session);
  if (!canViewFleet(permissions, session.isGlobalAdmin)) return { error: err(403, 'Forbidden.') } as const;
  return { session, permissions } as const;
};

const actorFrom = (session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>) =>
  session.fullName || session.username || 'System';

const tripContextFrom = (base: { session: NonNullable<Awaited<ReturnType<typeof sessionFrom>>>; permissions: string[] }) => ({
  actorEmployeeCode: base.session.employeeCode || base.session.username || '',
  permissions: base.permissions,
  isGlobalAdmin: Boolean(base.session.isGlobalAdmin),
});

const tripFromPayload = (data: Awaited<ReturnType<typeof readLogisticsFleetData>>, tripId?: string) => {
  if (tripId) return data.trips.find((item) => item.id === tripId) || null;
  return data.trips[0] || null;
};

const fireTripNotifications = async (input: {
  request: NextRequest;
  action: TripWorkflowAction | 'create-trip';
  data: Awaited<ReturnType<typeof readLogisticsFleetData>>;
  tripId?: string;
  actor: string;
  reason?: string;
}) => {
  const trip = tripFromPayload(input.data, input.tripId);
  if (!trip) return;
  await safeNotifyFleetTripWorkflow({
    action: input.action,
    trip,
    vehicles: input.data.vehicles,
    actor: input.actor,
    reason: input.reason,
    baseUrl: resolveWorkflowLinkOriginFromRequest(input.request),
  });
};

export async function GET(request: NextRequest) {
  try {
    const base = await guardView(request);
    if ('error' in base) return base.error;
    const data = await readLogisticsFleetData();
    return ok(data);
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load Logistics & Fleet from DLE_Enterprise.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const base = await guardView(request);
    if ('error' in base) return base.error;

    const body = (await request.json().catch(() => ({}))) as {
      entity?: LogisticsEntity;
      record?: Record<string, unknown>;
      action?: string;
      id?: string;
      tripId?: string;
      reason?: string;
      vehicleId?: string;
      driverEmployeeCode?: string;
    };
    const actor = actorFrom(base.session);
    const context = tripContextFrom(base);

    if (body.action === 'update-record') {
      if (!canManageFleet(base.permissions, base.session.isGlobalAdmin)) return err(403, 'Forbidden.');
      if ((body.entity !== 'vehicle' && body.entity !== 'driver') || !body.id) {
        return err(400, 'Vehicle or driver id is required for update.');
      }
      const data = await updateLogisticsFleetRecord(body.entity, body.id, body.record || {}, actor);
      return ok(data);
    }

    if (body.action && TRIP_WORKFLOW_ACTIONS.has(body.action as TripWorkflowAction)) {
      const action = body.action as TripWorkflowAction;
      if (action === 'submit-trip' && !canSubmitFleetTrip(base.permissions, base.session.isGlobalAdmin)) {
        return err(403, 'Forbidden.');
      }
      if ((action === 'approve-line' || action === 'reject-line' || action === 'return-trip' || action === 'allocate-trip') && !canAllocateFleetTrip(base.permissions, base.session.isGlobalAdmin)) {
        return err(403, 'Forbidden. Driver Supervisor or Fleet Approver required.');
      }
      if ((action === 'dispatch-trip' || action === 'start-trip' || action === 'complete-trip') && !canDispatchFleetTrip(base.permissions, base.session.isGlobalAdmin)) {
        return err(403, 'Forbidden. Fleet Dispatcher permission required.');
      }
      if ((action === 'cancel-trip') && !canManageFleet(base.permissions, base.session.isGlobalAdmin) && !canAllocateFleetTrip(base.permissions, base.session.isGlobalAdmin)) {
        return err(403, 'Forbidden.');
      }
      const data = await performTripWorkflow(action, body as Record<string, unknown>, actor, { ...context, reason: body.reason });
      const tripId = String(body.tripId || body.id || '');
      if (['submit-trip', 'allocate-trip', 'reject-line', 'return-trip', 'dispatch-trip', 'complete-trip', 'cancel-trip'].includes(action)) {
        void fireTripNotifications({
          request,
          action,
          data,
          tripId,
          actor,
          reason: body.reason,
        });
      }
      return ok(data);
    }

    if (body.action) {
      if (!canManageFleet(base.permissions, base.session.isGlobalAdmin)) return err(403, 'Forbidden.');
      if (operationalActions.has(body.action)) {
        if (body.action === 'assign-trip-driver' && !canAllocateFleetTrip(base.permissions, base.session.isGlobalAdmin)) {
          return err(403, 'Forbidden. Driver Supervisor or Fleet Approver required to allocate.');
        }
        const data = await performFleetAction(body.action as Parameters<typeof performFleetAction>[0], body as Record<string, unknown>, actor, context);
        return ok(data);
      }
      if (!body.entity || !workflowEntities.has(body.entity) || !body.id || !workflowActions.has(body.action)) {
        return err(400, 'Valid workflow entity, action, and id are required');
      }
      const data = await updateFleetWorkflow(
        body.entity as 'driver' | 'trip' | 'maintenance' | 'request' | 'incident',
        body.id,
        body.action as Parameters<typeof updateFleetWorkflow>[2],
        actor,
        { ...context, reason: body.reason },
      );
      return ok(data);
    }

    if (!body.entity || !entities.has(body.entity)) {
      return err(400, 'Valid logistics fleet entity is required');
    }
    if (body.entity === 'trip') {
      if (!canSubmitFleetTrip(base.permissions, base.session.isGlobalAdmin)) return err(403, 'Forbidden.');
    } else if (!canManageFleet(base.permissions, base.session.isGlobalAdmin)) {
      return err(403, 'Forbidden.');
    }
    const data = await createLogisticsFleetRecord(body.entity, body.record || {}, actor);
    if (body.entity === 'trip') {
      const trip = data.trips[0];
      if (trip && isPendingDriverSupervisor(trip.status)) {
        void fireTripNotifications({
          request,
          action: 'create-trip',
          data,
          tripId: trip.id,
          actor,
        });
      }
    }
    return ok(data, 201);
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to save fleet record to DLE_Enterprise.');
  }
}
