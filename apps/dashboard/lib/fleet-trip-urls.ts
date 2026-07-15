import { resolveWorkflowLinkOrigin } from '@/lib/public-app-url';

const portalBaseUrl = (baseUrl?: string | null) => resolveWorkflowLinkOrigin(baseUrl);

export type FleetTripWorkspaceTab = 'requests' | 'supervisor' | 'dispatch' | 'active' | 'history';

export const fleetTripWorkspacePath = (tab: FleetTripWorkspaceTab, tripId?: string) => {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (tripId) params.set('tripId', tripId);
  return `/logistics-fleet/trips-dispatch?${params.toString()}`;
};

export const fleetTripWorkspaceUrl = (
  tab: FleetTripWorkspaceTab,
  tripId?: string,
  baseUrl?: string | null,
) => `${portalBaseUrl(baseUrl)}${fleetTripWorkspacePath(tab, tripId)}`;

export const fleetTripSupervisorUrl = (tripId?: string, baseUrl?: string | null) =>
  fleetTripWorkspaceUrl('supervisor', tripId, baseUrl);

export const fleetTripDispatchUrl = (tripId?: string, baseUrl?: string | null) =>
  fleetTripWorkspaceUrl('dispatch', tripId, baseUrl);

export const fleetTripActiveUrl = (tripId?: string, baseUrl?: string | null) =>
  fleetTripWorkspaceUrl('active', tripId, baseUrl);

export const fleetTripRequestsUrl = (tripId?: string, baseUrl?: string | null) =>
  fleetTripWorkspaceUrl('requests', tripId, baseUrl);
