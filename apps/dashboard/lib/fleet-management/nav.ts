import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart4,
  Car,
  ClipboardCheck,
  Fuel,
  Gauge,
  LayoutDashboard,
  MapPinned,
  Route,
  Settings2,
  ShieldCheck,
  Truck,
  UserRoundCheck,
  Wrench,
  Building2,
  WalletCards,
} from 'lucide-react';

export type FleetWorkspaceId =
  | 'dashboard'
  | 'vehicles'
  | 'drivers'
  | 'allocations'
  | 'trips-dispatch'
  | 'fuel'
  | 'maintenance'
  | 'inspections-compliance'
  | 'incidents'
  | 'telematics'
  | 'vendors-contracts'
  | 'costs-budgets'
  | 'reports'
  | 'administration';

export type FleetNavItem = {
  id: FleetWorkspaceId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type FleetNavSection = {
  id: string;
  label: string;
  items: FleetNavItem[];
};

export type FleetTab = {
  id: string;
  label: string;
  sections: string[];
};

export const FLEET_NAV_SECTIONS: FleetNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Fleet Dashboard', href: '/logistics-fleet/dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'operations',
    label: 'Fleet Operations',
    items: [
      { id: 'vehicles', label: 'Vehicles', href: '/logistics-fleet/vehicles', icon: Truck },
      { id: 'drivers', label: 'Drivers', href: '/logistics-fleet/drivers', icon: UserRoundCheck },
      { id: 'allocations', label: 'Allocations & Reservations', href: '/logistics-fleet/allocations', icon: Car },
      { id: 'trips-dispatch', label: 'Trips & Dispatch', href: '/logistics-fleet/trips-dispatch', icon: Route },
    ],
  },
  {
    id: 'control',
    label: 'Operational Control',
    items: [
      { id: 'fuel', label: 'Fuel Management', href: '/logistics-fleet/fuel', icon: Fuel },
      { id: 'maintenance', label: 'Maintenance & Assets', href: '/logistics-fleet/maintenance', icon: Wrench },
      { id: 'inspections-compliance', label: 'Inspections & Compliance', href: '/logistics-fleet/inspections-compliance', icon: ShieldCheck },
      { id: 'incidents', label: 'Incidents & Claims', href: '/logistics-fleet/incidents', icon: AlertTriangle },
    ],
  },
  {
    id: 'commercial',
    label: 'Intelligence & Commercial',
    items: [
      { id: 'telematics', label: 'Telematics', href: '/logistics-fleet/telematics', icon: MapPinned },
      { id: 'vendors-contracts', label: 'Vendors & Contracts', href: '/logistics-fleet/vendors-contracts', icon: Building2 },
      { id: 'costs-budgets', label: 'Costs & Budgets', href: '/logistics-fleet/costs-budgets', icon: WalletCards },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [{ id: 'reports', label: 'Reports & Analytics', href: '/logistics-fleet/reports', icon: BarChart4 }],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    items: [{ id: 'administration', label: 'Fleet Administration', href: '/logistics-fleet/administration', icon: Settings2 }],
  },
];

export const FLEET_WORKSPACE_META: Record<FleetWorkspaceId, {
  title: string;
  description: string;
  primaryAction?: string;
  tabs: FleetTab[];
}> = {
  dashboard: {
    title: 'Fleet Dashboard',
    description: 'Executive dashboard for fleet performance, operational status, risks, costs, compliance, and pending actions.',
    tabs: [
      { id: 'overview', label: 'Overview', sections: ['Total vehicles', 'Active vehicles', 'Available vehicles', 'Assigned vehicles', 'Vehicles on trips', 'Under maintenance', 'Grounded vehicles', 'Retired vehicles'] },
      { id: 'operations', label: 'Operations', sections: ['Active trips', 'Pending trip requests', 'Vehicle availability', 'Driver availability', 'Pool reservations', 'Dispatch performance', 'Fleet utilization'] },
      { id: 'maintenance', label: 'Maintenance', sections: ['Services due', 'Overdue services', 'Open work orders', 'Vehicles off road', 'Repeat defects', 'Downtime', 'Maintenance cost'] },
      { id: 'fuel', label: 'Fuel', sections: ['Fuel consumption', 'Fuel cost', 'Average fuel economy', 'Fuel variances', 'Suspected anomalies', 'Fuel requests awaiting approval'] },
      { id: 'safety', label: 'Safety & Compliance', sections: ['Expiring documents', 'Non-compliant vehicles', 'Non-compliant drivers', 'Open accidents', 'Open breakdowns', 'Critical inspection defects'] },
      { id: 'financial', label: 'Financial', sections: ['Total fleet cost', 'Cost per vehicle', 'Cost per kilometre', 'Department and project costs', 'Budget utilization', 'Highest-cost vehicles'] },
      { id: 'approvals', label: 'Approvals & Alerts', sections: ['Pending approvals', 'Overdue approvals', 'Critical alerts', 'Operational exceptions', 'Escalated matters', 'Recently resolved alerts'] },
    ],
  },
  vehicles: {
    title: 'Vehicles',
    description: 'Manage vehicle records, lifecycle, allocation, documents, history, and operational status.',
    primaryAction: 'Add Vehicle',
    tabs: [
      { id: 'register', label: 'Vehicle Register', sections: ['All vehicles', 'Active', 'Available', 'Assigned', 'Grounded', 'Under maintenance', 'Retired and disposed'] },
      { id: 'profile', label: 'Vehicle Profile', sections: ['Registration', 'Make/model/year', 'Chassis and engine', 'Category', 'Ownership', 'Fuel type', 'Odometer', 'Operational status'] },
      { id: 'ownership', label: 'Ownership & Acquisition', sections: ['Purchase', 'Lease', 'Acquisition cost', 'Supplier', 'Warranty', 'Financing', 'Depreciation', 'Disposal'] },
      { id: 'assignment', label: 'Organizational Assignment', sections: ['Department', 'Project', 'Site', 'Location', 'Cost centre', 'Responsible manager', 'Effective dates'] },
      { id: 'documents', label: 'Vehicle Documents', sections: ['Licence', 'Insurance', 'Roadworthiness', 'Ownership', 'Lease', 'Permits', 'Safety certificates', 'Photographs'] },
      { id: 'history', label: 'Vehicle History', sections: ['Driver history', 'Trip history', 'Fuel history', 'Inspection', 'Maintenance', 'Accident', 'Cost', 'Status changes'] },
      { id: 'lifecycle', label: 'Vehicle Lifecycle', sections: ['Acquisition', 'Commissioning', 'Active service', 'Transfer', 'Grounding', 'Withdrawal', 'Disposal'] },
    ],
  },
  drivers: {
    title: 'Drivers',
    description: 'Drivers linked to the Employee Directory with licence, fitness, assignment, and safety controls.',
    primaryAction: 'Link Employee as Driver',
    tabs: [
      { id: 'register', label: 'Driver Register', sections: ['All drivers', 'Available', 'Assigned', 'On trips', 'Restricted', 'Suspended', 'Non-compliant'] },
      { id: 'profile', label: 'Driver Profile', sections: ['Employee details', 'Department', 'Supervisor', 'Contact', 'Employment status', 'Assigned vehicle', 'Emergency contact'] },
      { id: 'licence', label: 'Licence & Authorization', sections: ['Licence number', 'Class', 'Issue/expiry', 'Permitted categories', 'Route restrictions', 'Authorization status'] },
      { id: 'fitness', label: 'Fitness & Training', sections: ['Medical fitness', 'Defensive driving', 'HSE training', 'Special vehicle training', 'Certification expiry'] },
      { id: 'assignments', label: 'Assignments', sections: ['Permanent vehicle', 'Temporary vehicle', 'Department', 'Project', 'Site', 'Assignment history'] },
      { id: 'performance', label: 'Performance & Safety', sections: ['Trips', 'Mileage', 'Fuel efficiency', 'Speeding', 'Accidents', 'Safety score'] },
      { id: 'restrictions', label: 'Restrictions & Discipline', sections: ['Active restrictions', 'Suspension history', 'Corrective actions', 'Reinstatement'] },
    ],
  },
  allocations: {
    title: 'Allocations & Reservations',
    description: 'Vehicle assignments, transfers, returns, and pool-vehicle reservations with conflict controls.',
    primaryAction: 'New Allocation',
    tabs: [
      { id: 'current', label: 'Current Allocations', sections: ['Driver', 'Department', 'Project', 'Site', 'Cost centre'] },
      { id: 'permanent', label: 'Permanent Assignments', sections: ['New', 'Active', 'Pending acceptance', 'Amendments', 'Termination'] },
      { id: 'temporary', label: 'Temporary Allocations', sections: ['Temporary driver', 'Project', 'Relief', 'Replacement', 'Expiry dates'] },
      { id: 'pool', label: 'Pool Reservations', sections: ['Calendar', 'Available pool', 'Pending', 'Approved', 'Conflicts', 'No-show'] },
      { id: 'handover', label: 'Handover & Return', sections: ['Condition', 'Odometer', 'Fuel level', 'Damage', 'Photos', 'Return inspection'] },
      { id: 'transfers', label: 'Transfers', sections: ['Driver', 'Department', 'Project', 'Site', 'Approvals'] },
      { id: 'history', label: 'Allocation History', sections: ['Previous drivers', 'Departments', 'Projects', 'Reservations', 'Audit trail'] },
    ],
  },
  'trips-dispatch': {
    title: 'Trips & Dispatch',
    description: 'Requests, approvals, scheduling, dispatch, journey monitoring, gate control, and trip closure.',
    primaryAction: 'Request Trip',
    tabs: [
      { id: 'requests', label: 'Trip Requests', sections: ['My requests', 'Department', 'Pending', 'Approved', 'Rejected', 'Cancelled'] },
      { id: 'planning', label: 'Trip Planning', sections: ['Origin/destination', 'Multi-stop', 'Route', 'Purpose', 'Passengers', 'Cargo', 'Schedule'] },
      { id: 'approvals', label: 'Approvals', sections: ['Supervisor', 'Department Head', 'Fleet Officer', 'Emergency', 'Escalated'] },
      { id: 'scheduling', label: 'Scheduling', sections: ['Calendar', 'Driver availability', 'Vehicle availability', 'Conflicts', 'Dispatch queue'] },
      { id: 'dispatch', label: 'Dispatch Centre', sections: ['Ready for dispatch', 'Allocation', 'Pre-trip inspection', 'Gate clearance', 'Departure'] },
      { id: 'active', label: 'Active Trips', sections: ['In progress', 'Locations', 'Delayed', 'Deviations', 'Alerts'] },
      { id: 'emergency', label: 'Emergency Trips', sections: ['Emergency request', 'Rapid authorization', 'Retrospective approval'] },
      { id: 'closure', label: 'Trip Closure', sections: ['Arrival', 'Closing odometer', 'Fuel usage', 'Expenses', 'Post-trip inspection'] },
      { id: 'history', label: 'Trip History', sections: ['Completed', 'Cancelled', 'Incomplete', 'Audit trail'] },
    ],
  },
  fuel: {
    title: 'Fuel Management',
    description: 'Fuel requests, transactions, cards, vouchers, storage, consumption, reconciliation, and anomalies.',
    primaryAction: 'New Fuel Request',
    tabs: [
      { id: 'overview', label: 'Overview', sections: ['Litres consumed', 'Fuel cost', 'Average price', 'Fuel economy', 'Pending requests', 'Anomalies'] },
      { id: 'requests', label: 'Fuel Requests', sections: ['New', 'Pending', 'Approved', 'Issued', 'Rejected', 'Emergency'] },
      { id: 'transactions', label: 'Fuel Transactions', sections: ['Internal issues', 'External purchases', 'Cards', 'Vouchers', 'Receipts'] },
      { id: 'cards', label: 'Cards & Vouchers', sections: ['Card register', 'Assignments', 'Limits', 'Voucher batches', 'Blocked cards'] },
      { id: 'stations', label: 'Stations & Storage', sections: ['Internal tanks', 'External stations', 'Dip readings', 'Transfers'] },
      { id: 'analysis', label: 'Consumption Analysis', sections: ['By vehicle', 'By driver', 'By route', 'Expected vs actual'] },
      { id: 'reconciliation', label: 'Reconciliation', sections: ['Tank', 'Supplier', 'Card', 'Voucher', 'Monthly closing'] },
      { id: 'anomalies', label: 'Exceptions & Anomalies', sections: ['Duplicates', 'Excessive issues', 'Out-of-sequence odometer', 'Suspected theft'] },
      { id: 'allocation', label: 'Cost Allocation', sections: ['Department', 'Project', 'Site', 'Cost centre', 'Finance status'] },
    ],
  },
  maintenance: {
    title: 'Maintenance & Assets',
    description: 'Maintenance, workshop operations, tyres, batteries, spare parts, warranties, and downtime.',
    primaryAction: 'Create Work Order',
    tabs: [
      { id: 'overview', label: 'Overview', sections: ['Services due', 'Overdue', 'Open defects', 'Work orders', 'Off road', 'Cost'] },
      { id: 'schedule', label: 'Service Schedule', sections: ['Date-based', 'Mileage-based', 'Engine-hour', 'Forecasting', 'Overdue'] },
      { id: 'defects', label: 'Defect Reports', sections: ['Driver-reported', 'Inspection', 'Critical', 'Deferred', 'Repeat'] },
      { id: 'workorders', label: 'Work Orders', sections: ['Draft', 'Awaiting approval', 'In progress', 'Awaiting parts', 'Completed'] },
      { id: 'workshop', label: 'Workshop Jobs', sections: ['Internal', 'External', 'Technicians', 'Parts', 'Vendor jobs'] },
      { id: 'quality', label: 'Quality & Release', sections: ['Post-maintenance inspection', 'Road testing', 'Release authorization'] },
      { id: 'tyres', label: 'Tyres', sections: ['Register', 'Installation', 'Rotation', 'Retreading', 'Lifecycle cost'] },
      { id: 'batteries', label: 'Batteries', sections: ['Register', 'Assignment', 'Warranty', 'Replacement'] },
      { id: 'parts', label: 'Spare Parts', sections: ['Catalogue', 'Stock', 'Reorder', 'Issues to work orders'] },
      { id: 'warranty', label: 'Warranty', sections: ['Vehicle', 'Parts', 'Claims', 'Recoveries'] },
      { id: 'downtime', label: 'Downtime & Reliability', sections: ['VOR register', 'MTBF', 'MTTR', 'Replacement recommendations'] },
      { id: 'history', label: 'Service History', sections: ['By vehicle', 'Workshop', 'Vendor', 'Cost history'] },
    ],
  },
  'inspections-compliance': {
    title: 'Inspections & Compliance',
    description: 'Inspections, checklists, compliance documents, expiry control, defects, and corrective actions.',
    primaryAction: 'Start Inspection',
    tabs: [
      { id: 'overview', label: 'Overview', sections: ['Due', 'Overdue', 'Failed', 'Critical defects', 'Grounded', 'Compliance rate'] },
      { id: 'pretrip', label: 'Pre-Trip', sections: ['Scheduled', 'Completed', 'Failed', 'Defects', 'Dispatch eligibility'] },
      { id: 'posttrip', label: 'Post-Trip', sections: ['Condition', 'Damage', 'Fuel level', 'Accessories', 'Follow-up'] },
      { id: 'periodic', label: 'Periodic', sections: ['Daily', 'Weekly', 'Monthly', 'Roadworthiness', 'HSE'] },
      { id: 'handover', label: 'Handover & Return', sections: ['Assignment handover', 'Transfer', 'Return', 'Acceptance'] },
      { id: 'templates', label: 'Checklist Templates', sections: ['Builder', 'Categories', 'Pass/fail rules', 'Photos', 'Signatures'] },
      { id: 'defects', label: 'Defects & CAPA', sections: ['Register', 'Severity', 'Responsible officer', 'Verification', 'Overdue'] },
      { id: 'vehicle-compliance', label: 'Vehicle Compliance', sections: ['Licence', 'Insurance', 'Roadworthiness', 'Permits', 'Emissions'] },
      { id: 'driver-compliance', label: 'Driver Compliance', sections: ['Licence', 'Medical', 'Defensive driving', 'HSE training'] },
      { id: 'expiry', label: 'Expiry Calendar', sections: ['90-day', '60-day', '30-day', '7-day', 'Expired'] },
      { id: 'grounding', label: 'Grounding & Restrictions', sections: ['Auto grounded', 'Manual', 'Restricted drivers', 'Release approval'] },
      { id: 'repository', label: 'Document Repository', sections: ['Vehicle docs', 'Driver docs', 'Evidence', 'Policies'] },
    ],
  },
  incidents: {
    title: 'Incidents & Claims',
    description: 'Accidents, breakdowns, recovery, investigations, insurance claims, and disciplinary outcomes.',
    primaryAction: 'Report Incident',
    tabs: [
      { id: 'overview', label: 'Overview', sections: ['Open accidents', 'Breakdowns', 'Critical', 'Investigations', 'Claims', 'Costs'] },
      { id: 'accidents', label: 'Accidents', sections: ['Register', 'Initial report', 'Third party', 'Photos', 'Police/HSE'] },
      { id: 'breakdowns', label: 'Breakdowns', sections: ['Register', 'Location', 'Assistance', 'Repair decision', 'Closure'] },
      { id: 'recovery', label: 'Recovery & Towing', sections: ['Requests', 'Vendors', 'Destination', 'Cost', 'Evidence'] },
      { id: 'damage', label: 'Damage Assessment', sections: ['Vehicle damage', 'Estimates', 'Total-loss recommendation'] },
      { id: 'investigation', label: 'Investigation', sections: ['Team', 'Root cause', 'Telematics evidence', 'Findings'] },
      { id: 'capa', label: 'Corrective Actions', sections: ['Immediate', 'Preventive', 'Verification', 'Closure'] },
      { id: 'claims', label: 'Insurance Claims', sections: ['Notification', 'Insurer', 'Settlement', 'Status'] },
      { id: 'discipline', label: 'Responsibility & Discipline', sections: ['Driver responsibility', 'Decisions', 'Training', 'Suspension'] },
      { id: 'costs', label: 'Incident Costs', sections: ['Recovery', 'Repair', 'Excess', 'Liability', 'Net cost'] },
    ],
  },
  telematics: {
    title: 'Telematics',
    description: 'Live GPS intelligence for tracked vehicles; untracked vehicles remain supported by manual trip and odometer records.',
    tabs: [
      { id: 'map', label: 'Live Map', sections: ['Locations', 'Status', 'Speed', 'Ignition', 'Alerts'] },
      { id: 'playback', label: 'Trip Playback', sections: ['Route history', 'Stops', 'Idle', 'Speed profile', 'Deviations'] },
      { id: 'geofences', label: 'Geofences', sections: ['Register', 'Site boundaries', 'Restricted zones', 'Entry/exit alerts'] },
      { id: 'events', label: 'Driving Events', sections: ['Speeding', 'Harsh braking', 'Acceleration', 'Idling', 'Unauthorized movement'] },
      { id: 'routes', label: 'Route Compliance', sections: ['Planned vs actual', 'Unscheduled stops', 'Unauthorized destinations'] },
      { id: 'behaviour', label: 'Driver Behaviour', sections: ['Safety score', 'Trends', 'Coaching', 'High-risk drivers'] },
      { id: 'health', label: 'Vehicle Health', sections: ['Odometer sync', 'Diagnostics', 'Battery', 'Maintenance forecast'] },
      { id: 'fuel-monitor', label: 'Fuel Monitoring', sections: ['Fuel level', 'Sudden drops', 'Refuel detection', 'Siphoning'] },
      { id: 'devices', label: 'Devices & Integration', sections: ['Device register', 'Assignment', 'SIM', 'API sync'] },
      { id: 'alerts', label: 'Telematics Alerts', sections: ['Active', 'Critical', 'Escalated', 'Alert rules'] },
    ],
  },
  'vendors-contracts': {
    title: 'Vendors & Contracts',
    description: 'Fleet suppliers, contracts, SLAs, rate cards, purchase transactions, invoices, and performance.',
    primaryAction: 'Add Vendor',
    tabs: [
      { id: 'register', label: 'Vendor Register', sections: ['Workshops', 'Fuel', 'Tyres', 'Insurance', 'Leasing', 'Telematics', 'Towing'] },
      { id: 'profile', label: 'Vendor Profile', sections: ['Company', 'Contacts', 'Categories', 'Bank', 'Documents'] },
      { id: 'contracts', label: 'Contracts', sections: ['Active', 'Draft', 'Expiring', 'Suspended', 'Renewals'] },
      { id: 'rates', label: 'Rate Cards', sections: ['Fuel', 'Labour', 'Parts', 'Towing', 'Lease', 'Effective dates'] },
      { id: 'sla', label: 'SLAs', sections: ['Turnaround', 'Quality', 'Response', 'Penalties', 'Breaches'] },
      { id: 'purchase', label: 'POs & Invoices', sections: ['Purchase orders', 'Invoices', 'Matching', 'Payment status'] },
      { id: 'performance', label: 'Vendor Performance', sections: ['Turnaround', 'Quality', 'SLA', 'Rating'] },
    ],
  },
  'costs-budgets': {
    title: 'Costs & Budgets',
    description: 'Budgets, operating costs, allocation, depreciation, TCO, and replacement planning.',
    tabs: [
      { id: 'overview', label: 'Financial Overview', sections: ['Total expenditure', 'Budget vs actual', 'Cost per vehicle', 'Cost per km'] },
      { id: 'operating', label: 'Operating Costs', sections: ['Fuel', 'Maintenance', 'Parts', 'Insurance', 'Tolls', 'Telematics'] },
      { id: 'capital', label: 'Capital & Lease', sections: ['Acquisition', 'Lease', 'Financing', 'Disposal proceeds'] },
      { id: 'driver-costs', label: 'Driver-Related Costs', sections: ['Allowances', 'Overtime', 'Training', 'Recoveries'] },
      { id: 'incident-costs', label: 'Incident Costs', sections: ['Repair', 'Recovery', 'Excess', 'Liability'] },
      { id: 'budgets', label: 'Budgets', sections: ['Annual', 'Department', 'Project', 'Fuel', 'Replacement'] },
      { id: 'allocation', label: 'Cost Allocation', sections: ['Vehicle', 'Department', 'Project', 'Cost centre', 'Journals'] },
      { id: 'depreciation', label: 'Depreciation', sections: ['Method', 'Useful life', 'NBV', 'Finance sync'] },
      { id: 'tco', label: 'Total Cost of Ownership', sections: ['Lifecycle cost', 'Cost per km', 'Disposal proceeds'] },
      { id: 'replacement', label: 'Replacement Planning', sections: ['Age', 'Mileage', 'Downtime', 'Replacement score'] },
      { id: 'integration', label: 'Finance Integration', sections: ['AP', 'GL journals', 'Sage sync', 'Reconciliation'] },
    ],
  },
  reports: {
    title: 'Reports & Analytics',
    description: 'Operational, financial, safety, compliance, and management reports in one workspace.',
    primaryAction: 'Generate Report',
    tabs: [
      { id: 'executive', label: 'Executive', sections: ['KPI scorecard', 'Availability', 'Utilization', 'Risk summary'] },
      { id: 'vehicle', label: 'Vehicle', sections: ['Register', 'Status', 'Utilization', 'Replacement'] },
      { id: 'driver', label: 'Driver', sections: ['Register', 'Licence expiry', 'Performance', 'Safety'] },
      { id: 'trip', label: 'Trip', sections: ['Register', 'Dispatch', 'Mileage', 'Emergency trips'] },
      { id: 'fuel', label: 'Fuel', sections: ['Consumption', 'Economy', 'Variance', 'Anomalies'] },
      { id: 'maintenance', label: 'Maintenance', sections: ['History', 'Cost', 'Overdue', 'Downtime'] },
      { id: 'compliance', label: 'Inspection & Compliance', sections: ['Completion', 'Defects', 'Expiries', 'Grounding'] },
      { id: 'incidents', label: 'Incidents', sections: ['Accident analysis', 'Claims', 'Corrective actions'] },
      { id: 'telematics', label: 'Telematics', sections: ['Speeding', 'Harsh events', 'Idling', 'Behaviour'] },
      { id: 'financial', label: 'Financial', sections: ['Cost per km', 'Budget vs actual', 'TCO', 'Depreciation'] },
      { id: 'vendor', label: 'Vendor', sections: ['Expenditure', 'SLA', 'Quality', 'Rating'] },
      { id: 'centre', label: 'Report Centre', sections: ['Saved', 'Scheduled', 'Subscriptions', 'Exports'] },
    ],
  },
  administration: {
    title: 'Fleet Administration',
    description: 'Configuration workspace for Fleet Administrators and authorized system administrators.',
    tabs: [
      { id: 'general', label: 'General Settings', sections: ['Numbering', 'Units', 'Currency', 'Time zone', 'Default locations'] },
      { id: 'vehicle-config', label: 'Vehicle Configuration', sections: ['Categories', 'Types', 'Makes/models', 'Statuses', 'Disposal reasons'] },
      { id: 'driver-config', label: 'Driver Configuration', sections: ['Licence classes', 'Statuses', 'Training types', 'Restrictions'] },
      { id: 'trip-config', label: 'Trip Configuration', sections: ['Trip types', 'Purposes', 'Emergency rules', 'Dispatch rules'] },
      { id: 'fuel-config', label: 'Fuel Configuration', sections: ['Fuel types', 'Benchmarks', 'Thresholds', 'Anomaly rules'] },
      { id: 'maintenance-config', label: 'Maintenance Configuration', sections: ['Service types', 'Intervals', 'Defect severity', 'VOR reasons'] },
      { id: 'inspection-config', label: 'Inspection Configuration', sections: ['Types', 'Templates', 'Grounding rules'] },
      { id: 'compliance-config', label: 'Compliance Configuration', sections: ['Document types', 'Required docs', 'Expiry alerts'] },
      { id: 'incident-config', label: 'Incident Configuration', sections: ['Types', 'Severity', 'Claim statuses', 'Discipline'] },
      { id: 'alerts', label: 'Alerts & Notifications', sections: ['Expiry', 'Maintenance', 'Fuel', 'Trip', 'Escalation'] },
      { id: 'workflows', label: 'Workflow Configuration', sections: ['Trip', 'Fuel', 'Maintenance', 'Assignment', 'Incident'] },
      { id: 'integrations', label: 'Integrations', sections: ['Employee Directory', 'Projects', 'Finance', 'Sage', 'GPS providers'] },
      { id: 'permissions', label: 'Permissions', sections: ['Fleet roles', 'Approvers', 'Executive viewers'] },
      { id: 'audit', label: 'Audit & Data Control', sections: ['Activity log', 'Imports', 'Exports', 'Failed jobs'] },
    ],
  },
};

export const ALL_FLEET_NAV_ITEMS = FLEET_NAV_SECTIONS.flatMap((section) => section.items);

export const resolveFleetWorkspace = (slug?: string): FleetWorkspaceId => {
  const value = String(slug || 'dashboard').trim().toLowerCase();
  const match = ALL_FLEET_NAV_ITEMS.find((item) => item.id === value || item.href.endsWith(`/${value}`));
  return match?.id || 'dashboard';
};

export const fleetTabFromQuery = (workspace: FleetWorkspaceId, tab?: string | null) => {
  const meta = FLEET_WORKSPACE_META[workspace];
  const requested = String(tab || '').trim().toLowerCase();
  if (requested && meta.tabs.some((item) => item.id === requested)) return requested;
  return meta.tabs[0]?.id || 'overview';
};
