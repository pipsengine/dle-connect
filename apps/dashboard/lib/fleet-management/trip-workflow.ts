/** Trip request workflow statuses for Logistics & Fleet. */
export type TripStatus =
  | 'Draft'
  | 'PendingDriverSupervisor'
  | 'ReadyToDispatch'
  | 'Dispatched'
  | 'InProgress'
  | 'Completed'
  | 'Returned'
  | 'Rejected'
  | 'Cancelled'
  /** @deprecated Legacy — migrated on read */
  | 'PendingLineApproval'
  /** @deprecated Legacy — migrated on read */
  | 'PendingFleetAllocation';

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

/** Request → Driver Supervisor (approve + allocate) → Dispatch → Complete */
export const TRIP_STATUS_STEPS: Array<{ id: string; label: string }> = [
  { id: 'request', label: 'Request' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'complete', label: 'Complete' },
];

export const isPendingDriverSupervisor = (status: string) => {
  const raw = String(status || '').trim();
  if (['PendingDriverSupervisor', 'PendingLineApproval', 'PendingFleetAllocation', 'Submitted'].includes(raw)) return true;
  return migrateLegacyTripStatus(raw) === 'PendingDriverSupervisor';
};

export const migrateLegacyTripStatus = (raw: string): TripStatus => {
  const status = String(raw || '').trim();
  if (!status || status === 'Submitted' || status === 'PendingLineApproval' || status === 'PendingFleetAllocation') {
    return 'PendingDriverSupervisor';
  }
  if (status === 'Approved') return 'ReadyToDispatch';
  if (status === 'Closed') return 'Completed';
  const known: TripStatus[] = [
    'Draft',
    'PendingDriverSupervisor',
    'ReadyToDispatch',
    'Dispatched',
    'InProgress',
    'Completed',
    'Returned',
    'Rejected',
    'Cancelled',
  ];
  return (known.includes(status as TripStatus) ? status : 'PendingDriverSupervisor') as TripStatus;
};

export const tripStepperIndex = (status: string) => {
  const migrated = migrateLegacyTripStatus(status);
  if (migrated === 'Rejected' || migrated === 'Cancelled') return -1;
  if (migrated === 'Draft' || migrated === 'Returned') return 0;
  if (migrated === 'PendingDriverSupervisor') return 1;
  if (migrated === 'ReadyToDispatch' || migrated === 'Dispatched' || migrated === 'InProgress') return 2;
  if (migrated === 'Completed') return 3;
  return 0;
};

export const isOpenTripStatus = (status: string) => {
  const migrated = migrateLegacyTripStatus(status);
  return !['Completed', 'Rejected', 'Cancelled'].includes(migrated);
};

export const isActiveOperationalTrip = (status: string) => {
  const migrated = migrateLegacyTripStatus(status);
  return ['ReadyToDispatch', 'Dispatched', 'InProgress'].includes(migrated);
};
