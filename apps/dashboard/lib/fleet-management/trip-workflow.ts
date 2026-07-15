/** Trip request workflow statuses for Logistics & Fleet. */
export type TripStatus =
  | 'Draft'
  | 'PendingLineApproval'
  | 'PendingFleetAllocation'
  | 'ReadyToDispatch'
  | 'Dispatched'
  | 'InProgress'
  | 'Completed'
  | 'Returned'
  | 'Rejected'
  | 'Cancelled';

export type TripWorkflowAction =
  | 'submit-trip'
  | 'approve-line'
  | 'reject-line'
  | 'return-trip'
  | 'allocate-trip'
  | 'dispatch-trip'
  | 'start-trip'
  | 'complete-trip'
  | 'cancel-trip';

export const TRIP_WORKFLOW_ACTIONS = new Set<TripWorkflowAction>([
  'submit-trip',
  'approve-line',
  'reject-line',
  'return-trip',
  'allocate-trip',
  'dispatch-trip',
  'start-trip',
  'complete-trip',
  'cancel-trip',
]);

export const TRIP_STATUS_STEPS: Array<{ id: string; label: string }> = [
  { id: 'request', label: 'Request' },
  { id: 'line', label: 'Line' },
  { id: 'allocate', label: 'Allocate' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'complete', label: 'Complete' },
];

export const migrateLegacyTripStatus = (raw: string): TripStatus => {
  const status = String(raw || '').trim();
  if (!status || status === 'Submitted') return 'PendingLineApproval';
  if (status === 'Approved') return 'ReadyToDispatch';
  if (status === 'Closed') return 'Completed';
  const known: TripStatus[] = [
    'Draft',
    'PendingLineApproval',
    'PendingFleetAllocation',
    'ReadyToDispatch',
    'Dispatched',
    'InProgress',
    'Completed',
    'Returned',
    'Rejected',
    'Cancelled',
  ];
  return (known.includes(status as TripStatus) ? status : 'PendingLineApproval') as TripStatus;
};

export const tripStepperIndex = (status: string) => {
  const migrated = migrateLegacyTripStatus(status);
  if (migrated === 'Rejected' || migrated === 'Cancelled') return -1;
  if (migrated === 'Draft' || migrated === 'Returned') return 0;
  if (migrated === 'PendingLineApproval') return 1;
  if (migrated === 'PendingFleetAllocation') return 2;
  if (migrated === 'ReadyToDispatch') return 3;
  if (migrated === 'Dispatched' || migrated === 'InProgress') return 3;
  if (migrated === 'Completed') return 4;
  return 0;
};

export const isOpenTripStatus = (status: string) => {
  const migrated = migrateLegacyTripStatus(status);
  return !['Completed', 'Rejected', 'Cancelled'].includes(migrated);
};

export const isActiveOperationalTrip = (status: string) => {
  const migrated = migrateLegacyTripStatus(status);
  return ['ReadyToDispatch', 'Dispatched', 'InProgress', 'Approved'].includes(migrated);
};
