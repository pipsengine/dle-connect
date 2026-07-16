import { promises as fs } from 'fs';
import path from 'path';
import sql from 'mssql';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { ensureFleetSchemaSql } from '@/lib/fleet-sql-schema';
import { isActiveOperationalTrip, isOpenTripStatus, isPendingDriverSupervisor, migrateLegacyTripStatus, type TripStatus } from '@/lib/fleet-management/trip-workflow';
import { payrollDataSourceInfo, readPayrollEmployees } from '@/lib/payroll-employee-source';

export type VehicleStatus = 'Available' | 'Assigned' | 'In Maintenance' | 'Grounded' | 'Retired';
export type WorkflowStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Closed';

export type FleetVehicle = {
  id: string;
  assetCode: string;
  plateNumber: string;
  vehicleType: string;
  makeModel: string;
  year: number;
  department: string;
  location: string;
  custodian: string;
  status: VehicleStatus;
  odometerKm: number;
  nextServiceKm: number;
  insuranceExpiry: string;
  roadWorthinessExpiry: string;
  ownershipType: string;
  acquisitionCost: number;
  supplier: string;
  purchaseDate: string;
  warrantyExpiry: string;
  financingNotes: string;
  depreciationMethod: string;
  disposalDate: string;
  chassisNumber: string;
  engineNumber: string;
  fuelType: string;
  costCenter: string;
  projectCode: string;
};

export type FleetDriver = {
  id: string;
  employeeCode: string;
  licenseNumber: string;
  licenseClass: string;
  licenseExpiry: string;
  issuingAuthority: string;
  medicalCertificateStatus: 'Missing' | 'Valid' | 'Expired' | 'Rejected';
  defensiveDrivingCertificate: 'Missing' | 'Valid' | 'Expired' | 'Rejected';
  driverCategory: 'Company Driver' | 'Pool Driver' | 'Executive Driver' | 'Project Driver' | 'Relief Driver';
  availabilityStatus: 'Available' | 'Assigned' | 'On Trip' | 'Off Duty' | 'On Leave' | 'Suspended' | 'Inactive';
  assignedVehicleId: string;
  status: 'Draft' | 'Active' | 'Available' | 'Assigned' | 'On Trip' | 'Off Duty' | 'On Leave' | 'Suspended' | 'License Expired' | 'Compliance Blocked' | 'Inactive';
  complianceStatus: 'Compliant' | 'Expiring Soon' | 'Expired' | 'Missing Documents' | 'Blocked';
  safetyScore: number;
  registeredAt: string;
  approvalStatus: WorkflowStatus;
};

export type FleetTrip = {
  id: string;
  requestNo: string;
  vehicleId: string;
  driverId: string;
  requester: string;
  requesterEmployeeCode: string;
  requesterDepartment: string;
  requesterLocation: string;
  lineManagerEmployeeCode: string;
  lineManagerName: string;
  origin: string;
  destination: string;
  purpose: string;
  startDate: string;
  endDate: string;
  projectCode: string;
  costCenter: string;
  status: TripStatus;
  approvedBy?: string;
  lineApprovedBy?: string;
  lineApprovedAt?: string;
  lineRejectReason?: string;
  allocatedBy?: string;
  allocatedAt?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  completedBy?: string;
  completedAt?: string;
  cancelReason?: string;
  returnReason?: string;
};

export type MaintenanceRecord = {
  id: string;
  vehicleId: string;
  maintenanceType: string;
  vendor: string;
  scheduledDate: string;
  completedDate?: string;
  cost: number;
  status: WorkflowStatus | 'Scheduled' | 'Completed';
  notes: string;
};

export type FuelRecord = {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string;
  litres: number;
  amount: number;
  odometerKm: number;
  station: string;
  projectCode: string;
};

export type ComplianceRecord = {
  id: string;
  vehicleId: string;
  driverId?: string;
  documentType: string;
  reference: string;
  issueDate: string;
  expiryDate: string;
  status: 'Valid' | 'Expiring Soon' | 'Expired';
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
};

export type VehicleAssignmentRecord = {
  id: string;
  driverId: string;
  vehicleId: string;
  action: 'Assigned' | 'Reassigned' | 'Unassigned' | 'Ended';
  effectiveDate: string;
  endedAt?: string;
  reason: string;
  performedBy: string;
};

export type FleetRequest = {
  id: string;
  requestType: string;
  requester: string;
  department: string;
  details: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  status: WorkflowStatus;
  createdAt: string;
};

export type FleetAudit = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  details: string;
};

export type FleetIncident = {
  id: string;
  reference: string;
  vehicleId: string;
  driverId: string;
  incidentType: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  occurredAt: string;
  location: string;
  description: string;
  claimStatus: 'Open' | 'Filed' | 'Under Review' | 'Settled' | 'Closed';
  status: WorkflowStatus | 'Investigating' | 'Closed';
};

export type FleetVendor = {
  id: string;
  name: string;
  category: string;
  contactName: string;
  email: string;
  phone: string;
  location: string;
  status: 'Active' | 'Inactive' | 'Under Review';
  rating: number;
};

export type FleetContract = {
  id: string;
  vendorId: string;
  title: string;
  contractType: string;
  startDate: string;
  endDate: string;
  value: number;
  status: 'Draft' | 'Active' | 'Expired' | 'Terminated';
  notes: string;
};

export type FleetTelematicsEvent = {
  id: string;
  vehicleId: string;
  eventType: string;
  severity: 'Info' | 'Warning' | 'Critical';
  occurredAt: string;
  latitude?: number;
  longitude?: number;
  speedKph?: number;
  details: string;
};

export type FleetCostEntry = {
  id: string;
  vehicleId: string;
  category: string;
  costDate: string;
  amount: number;
  costCenter: string;
  projectCode: string;
  notes: string;
  createdBy: string;
};

export type LogisticsFleetData = {
  generatedAt: string;
  vehicles: FleetVehicle[];
  drivers: FleetDriver[];
  trips: FleetTrip[];
  maintenance: MaintenanceRecord[];
  fuel: FuelRecord[];
  compliance: ComplianceRecord[];
  assignmentHistory: VehicleAssignmentRecord[];
  requests: FleetRequest[];
  auditTrail: FleetAudit[];
  incidents: FleetIncident[];
  vendors: FleetVendor[];
  contracts: FleetContract[];
  telematics: FleetTelematicsEvent[];
  costs: FleetCostEntry[];
  source: 'DLE_Enterprise';
};

export type LogisticsEntity =
  | 'vehicle'
  | 'driver'
  | 'trip'
  | 'maintenance'
  | 'fuel'
  | 'compliance'
  | 'request'
  | 'incident'
  | 'vendor'
  | 'contract'
  | 'telematics'
  | 'cost';

export type LogisticsEmployeeOption = {
  employeeCode: string;
  employeeId: string;
  fullName: string;
  jobTitle: string;
  department: string;
  location: string;
  phone: string;
  status: string;
  managerName: string;
  isDirectoryDriver?: boolean;
};

const dbReady = { value: false };
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const emptyData = (): LogisticsFleetData => ({
  generatedAt: new Date().toISOString(),
  vehicles: [],
  drivers: [],
  trips: [],
  maintenance: [],
  fuel: [],
  compliance: [],
  assignmentHistory: [],
  requests: [],
  auditTrail: [],
  incidents: [],
  vendors: [],
  contracts: [],
  telematics: [],
  costs: [],
  source: 'DLE_Enterprise',
});

const asIso = (value: unknown) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const toDate = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const str = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

export const ensureFleetDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE_Enterprise database is not configured. Logistics & Fleet requires SQL persistence.');
  // Always re-run idempotent DDL so additive trip workflow columns are applied after deploys.
  await pool.request().query(ensureFleetSchemaSql);
  dbReady.value = true;
  return pool;
};

const candidateSeedPaths = () => {
  const cwd = process.cwd();
  return [
    path.join(cwd, 'data', 'enterprise', 'logistics-fleet.json'),
    path.join(cwd, '..', 'data', 'enterprise', 'logistics-fleet.json'),
    path.join(cwd, '..', '..', 'data', 'enterprise', 'logistics-fleet.json'),
    path.resolve(cwd, '../../data/enterprise/logistics-fleet.json'),
  ];
};

const readJsonSeed = async (): Promise<LogisticsFleetData | null> => {
  for (const file of candidateSeedPaths()) {
    try {
      const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<LogisticsFleetData>;
      return normalizeData(raw as LogisticsFleetData);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') continue;
    }
  }
  return null;
};

const mapVehicle = (row: Record<string, unknown>): FleetVehicle => ({
  id: str(row.VehicleId || row.id),
  assetCode: str(row.AssetCode || row.assetCode),
  plateNumber: str(row.PlateNumber || row.plateNumber),
  vehicleType: str(row.VehicleType || row.vehicleType),
  makeModel: str(row.MakeModel || row.makeModel),
  year: Number(row.Year || row.year || new Date().getFullYear()),
  department: str(row.Department || row.department),
  location: str(row.Location || row.location),
  custodian: str(row.Custodian || row.custodian),
  status: (str(row.Status || row.status) || 'Available') as VehicleStatus,
  odometerKm: Number(row.OdometerKm || row.odometerKm || 0),
  nextServiceKm: Number(row.NextServiceKm || row.nextServiceKm || 0),
  insuranceExpiry: asIso(row.InsuranceExpiry || row.insuranceExpiry),
  roadWorthinessExpiry: asIso(row.RoadWorthinessExpiry || row.roadWorthinessExpiry),
  ownershipType: str(row.OwnershipType || row.ownershipType),
  acquisitionCost: Number(row.AcquisitionCost || row.acquisitionCost || 0),
  supplier: str(row.Supplier || row.supplier),
  purchaseDate: asIso(row.PurchaseDate || row.purchaseDate),
  warrantyExpiry: asIso(row.WarrantyExpiry || row.warrantyExpiry),
  financingNotes: str(row.FinancingNotes || row.financingNotes, 4000),
  depreciationMethod: str(row.DepreciationMethod || row.depreciationMethod),
  disposalDate: asIso(row.DisposalDate || row.disposalDate),
  chassisNumber: str(row.ChassisNumber || row.chassisNumber),
  engineNumber: str(row.EngineNumber || row.engineNumber),
  fuelType: str(row.FuelType || row.fuelType),
  costCenter: str(row.CostCenter || row.costCenter),
  projectCode: str(row.ProjectCode || row.projectCode),
});

const mapDriver = (row: Record<string, unknown>): FleetDriver => ({
  id: str(row.DriverId || row.id),
  employeeCode: str(row.EmployeeCode || row.employeeCode),
  licenseNumber: str(row.LicenseNumber || row.licenseNumber),
  licenseClass: str(row.LicenseClass || row.licenseClass),
  licenseExpiry: asIso(row.LicenseExpiry || row.licenseExpiry),
  issuingAuthority: str(row.IssuingAuthority || row.issuingAuthority),
  medicalCertificateStatus: (str(row.MedicalCertificateStatus || row.medicalCertificateStatus) || 'Missing') as FleetDriver['medicalCertificateStatus'],
  defensiveDrivingCertificate: (str(row.DefensiveDrivingCertificate || row.defensiveDrivingCertificate) || 'Missing') as FleetDriver['defensiveDrivingCertificate'],
  driverCategory: (str(row.DriverCategory || row.driverCategory) || 'Company Driver') as FleetDriver['driverCategory'],
  availabilityStatus: (str(row.AvailabilityStatus || row.availabilityStatus) || 'Available') as FleetDriver['availabilityStatus'],
  assignedVehicleId: str(row.AssignedVehicleId || row.assignedVehicleId),
  status: (str(row.Status || row.status) || 'Draft') as FleetDriver['status'],
  complianceStatus: (str(row.ComplianceStatus || row.complianceStatus) || 'Missing Documents') as FleetDriver['complianceStatus'],
  safetyScore: Number(row.SafetyScore || row.safetyScore || 90),
  registeredAt: asIso(row.RegisteredAt || row.registeredAt) || new Date().toISOString(),
  approvalStatus: (str(row.ApprovalStatus || row.approvalStatus) || 'Submitted') as WorkflowStatus,
});

const mapTrip = (row: Record<string, unknown>): FleetTrip => {
  const vehicleId = str(row.VehicleId || row.vehicleId);
  const driverId = str(row.DriverId || row.driverId);
  let status = migrateLegacyTripStatus(str(row.Status || row.status));
  // Legacy Approved without allocation should wait for driver supervisor allocation.
  if (str(row.Status || row.status) === 'Approved' && (!vehicleId || !driverId)) {
    status = 'PendingDriverSupervisor';
  }
  return {
    id: str(row.TripId || row.id),
    requestNo: str(row.RequestNo || row.requestNo),
    vehicleId,
    driverId,
    requester: str(row.Requester || row.requester),
    requesterEmployeeCode: str(row.RequesterEmployeeCode || row.requesterEmployeeCode),
    requesterDepartment: str(row.RequesterDepartment || row.requesterDepartment),
    requesterLocation: str(row.RequesterLocation || row.requesterLocation),
    lineManagerEmployeeCode: str(row.LineManagerEmployeeCode || row.lineManagerEmployeeCode),
    lineManagerName: str(row.LineManagerName || row.lineManagerName),
    origin: str(row.Origin || row.origin),
    destination: str(row.Destination || row.destination),
    purpose: str(row.Purpose || row.purpose),
    startDate: asIso(row.StartDate || row.startDate),
    endDate: asIso(row.EndDate || row.endDate),
    projectCode: str(row.ProjectCode || row.projectCode),
    costCenter: str(row.CostCenter || row.costCenter),
    status,
    approvedBy: str(row.ApprovedBy || row.approvedBy) || undefined,
    lineApprovedBy: str(row.LineApprovedBy || row.lineApprovedBy) || undefined,
    lineApprovedAt: asIso(row.LineApprovedAt || row.lineApprovedAt) || undefined,
    lineRejectReason: str(row.LineRejectReason || row.lineRejectReason) || undefined,
    allocatedBy: str(row.AllocatedBy || row.allocatedBy) || undefined,
    allocatedAt: asIso(row.AllocatedAt || row.allocatedAt) || undefined,
    dispatchedBy: str(row.DispatchedBy || row.dispatchedBy) || undefined,
    dispatchedAt: asIso(row.DispatchedAt || row.dispatchedAt) || undefined,
    completedBy: str(row.CompletedBy || row.completedBy) || undefined,
    completedAt: asIso(row.CompletedAt || row.completedAt) || undefined,
    cancelReason: str(row.CancelReason || row.cancelReason) || undefined,
    returnReason: str(row.ReturnReason || row.returnReason) || undefined,
  };
};

const mapMaintenance = (row: Record<string, unknown>): MaintenanceRecord => ({
  id: str(row.MaintenanceId || row.id),
  vehicleId: str(row.VehicleId || row.vehicleId),
  maintenanceType: str(row.MaintenanceType || row.maintenanceType),
  vendor: str(row.Vendor || row.vendor),
  scheduledDate: asIso(row.ScheduledDate || row.scheduledDate),
  completedDate: asIso(row.CompletedDate || row.completedDate) || undefined,
  cost: Number(row.Cost || row.cost || 0),
  status: (str(row.Status || row.status) || 'Submitted') as MaintenanceRecord['status'],
  notes: str(row.Notes || row.notes, 4000),
});

const mapFuel = (row: Record<string, unknown>): FuelRecord => ({
  id: str(row.FuelId || row.id),
  vehicleId: str(row.VehicleId || row.vehicleId),
  driverId: str(row.DriverId || row.driverId),
  date: asIso(row.FuelDate || row.date),
  litres: Number(row.Litres || row.litres || 0),
  amount: Number(row.Amount || row.amount || 0),
  odometerKm: Number(row.OdometerKm || row.odometerKm || 0),
  station: str(row.Station || row.station),
  projectCode: str(row.ProjectCode || row.projectCode),
});

const mapCompliance = (row: Record<string, unknown>): ComplianceRecord => ({
  id: str(row.ComplianceId || row.id),
  vehicleId: str(row.VehicleId || row.vehicleId),
  driverId: str(row.DriverId || row.driverId) || undefined,
  documentType: str(row.DocumentType || row.documentType),
  reference: str(row.Reference || row.reference),
  issueDate: asIso(row.IssueDate || row.issueDate),
  expiryDate: asIso(row.ExpiryDate || row.expiryDate),
  status: (str(row.Status || row.status) || 'Valid') as ComplianceRecord['status'],
  verifiedBy: str(row.VerifiedBy || row.verifiedBy) || undefined,
  verifiedAt: asIso(row.VerifiedAt || row.verifiedAt) || undefined,
  rejectionReason: str(row.RejectionReason || row.rejectionReason) || undefined,
});

const mapAssignment = (row: Record<string, unknown>): VehicleAssignmentRecord => ({
  id: str(row.AssignmentId || row.id),
  driverId: str(row.DriverId || row.driverId),
  vehicleId: str(row.VehicleId || row.vehicleId),
  action: (str(row.Action || row.action) || 'Assigned') as VehicleAssignmentRecord['action'],
  effectiveDate: asIso(row.EffectiveDate || row.effectiveDate),
  endedAt: asIso(row.EndedAt || row.endedAt) || undefined,
  reason: str(row.Reason || row.reason),
  performedBy: str(row.PerformedBy || row.performedBy),
});

const mapRequest = (row: Record<string, unknown>): FleetRequest => ({
  id: str(row.RequestId || row.id),
  requestType: str(row.RequestType || row.requestType),
  requester: str(row.Requester || row.requester),
  department: str(row.Department || row.department),
  details: str(row.Details || row.details, 4000),
  priority: (str(row.Priority || row.priority) || 'Normal') as FleetRequest['priority'],
  status: (str(row.Status || row.status) || 'Submitted') as WorkflowStatus,
  createdAt: asIso(row.CreatedAt || row.createdAt) || new Date().toISOString(),
});

const mapAudit = (row: Record<string, unknown>): FleetAudit => ({
  id: str(row.AuditId || row.id),
  at: asIso(row.At || row.at) || new Date().toISOString(),
  actor: str(row.Actor || row.actor),
  action: str(row.Action || row.action),
  entity: str(row.Entity || row.entity),
  details: str(row.Details || row.details, 4000),
});

const mapIncident = (row: Record<string, unknown>): FleetIncident => ({
  id: str(row.IncidentId || row.id),
  reference: str(row.Reference || row.reference),
  vehicleId: str(row.VehicleId || row.vehicleId),
  driverId: str(row.DriverId || row.driverId),
  incidentType: str(row.IncidentType || row.incidentType),
  severity: (str(row.Severity || row.severity) || 'Medium') as FleetIncident['severity'],
  occurredAt: asIso(row.OccurredAt || row.occurredAt),
  location: str(row.Location || row.location),
  description: str(row.Description || row.description, 4000),
  claimStatus: (str(row.ClaimStatus || row.claimStatus) || 'Open') as FleetIncident['claimStatus'],
  status: (str(row.Status || row.status) || 'Submitted') as FleetIncident['status'],
});

const mapVendor = (row: Record<string, unknown>): FleetVendor => ({
  id: str(row.VendorId || row.id),
  name: str(row.Name || row.name),
  category: str(row.Category || row.category),
  contactName: str(row.ContactName || row.contactName),
  email: str(row.Email || row.email),
  phone: str(row.Phone || row.phone),
  location: str(row.Location || row.location),
  status: (str(row.Status || row.status) || 'Active') as FleetVendor['status'],
  rating: Number(row.Rating || row.rating || 0),
});

const mapContract = (row: Record<string, unknown>): FleetContract => ({
  id: str(row.ContractId || row.id),
  vendorId: str(row.VendorId || row.vendorId),
  title: str(row.Title || row.title),
  contractType: str(row.ContractType || row.contractType),
  startDate: asIso(row.StartDate || row.startDate),
  endDate: asIso(row.EndDate || row.endDate),
  value: Number(row.Value || row.value || 0),
  status: (str(row.Status || row.status) || 'Draft') as FleetContract['status'],
  notes: str(row.Notes || row.notes, 4000),
});

const mapTelematics = (row: Record<string, unknown>): FleetTelematicsEvent => ({
  id: str(row.EventId || row.id),
  vehicleId: str(row.VehicleId || row.vehicleId),
  eventType: str(row.EventType || row.eventType),
  severity: (str(row.Severity || row.severity) || 'Info') as FleetTelematicsEvent['severity'],
  occurredAt: asIso(row.OccurredAt || row.occurredAt),
  latitude: row.Latitude != null || row.latitude != null ? Number(row.Latitude ?? row.latitude) : undefined,
  longitude: row.Longitude != null || row.longitude != null ? Number(row.Longitude ?? row.longitude) : undefined,
  speedKph: row.SpeedKph != null || row.speedKph != null ? Number(row.SpeedKph ?? row.speedKph) : undefined,
  details: str(row.Details || row.details, 4000),
});

const mapCost = (row: Record<string, unknown>): FleetCostEntry => ({
  id: str(row.CostId || row.id),
  vehicleId: str(row.VehicleId || row.vehicleId),
  category: str(row.Category || row.category),
  costDate: asIso(row.CostDate || row.costDate),
  amount: Number(row.Amount || row.amount || 0),
  costCenter: str(row.CostCenter || row.costCenter),
  projectCode: str(row.ProjectCode || row.projectCode),
  notes: str(row.Notes || row.notes, 4000),
  createdBy: str(row.CreatedBy || row.createdBy),
});

const normalizeData = (data: Partial<LogisticsFleetData>): LogisticsFleetData => ({
  ...emptyData(),
  ...data,
  vehicles: Array.isArray(data.vehicles) ? data.vehicles.map((row) => mapVehicle(row as unknown as Record<string, unknown>)) : [],
  drivers: Array.isArray(data.drivers) ? data.drivers.map((row) => mapDriver(row as unknown as Record<string, unknown>)) : [],
  trips: Array.isArray(data.trips) ? data.trips.map((row) => mapTrip(row as unknown as Record<string, unknown>)) : [],
  maintenance: Array.isArray(data.maintenance) ? data.maintenance.map((row) => mapMaintenance(row as unknown as Record<string, unknown>)) : [],
  fuel: Array.isArray(data.fuel) ? data.fuel.map((row) => mapFuel(row as unknown as Record<string, unknown>)) : [],
  compliance: Array.isArray(data.compliance) ? data.compliance.map((row) => mapCompliance(row as unknown as Record<string, unknown>)) : [],
  assignmentHistory: Array.isArray(data.assignmentHistory) ? data.assignmentHistory.map((row) => mapAssignment(row as unknown as Record<string, unknown>)) : [],
  requests: Array.isArray(data.requests) ? data.requests.map((row) => mapRequest(row as unknown as Record<string, unknown>)) : [],
  auditTrail: Array.isArray(data.auditTrail) ? data.auditTrail.map((row) => mapAudit(row as unknown as Record<string, unknown>)) : [],
  incidents: Array.isArray(data.incidents) ? data.incidents.map((row) => mapIncident(row as unknown as Record<string, unknown>)) : [],
  vendors: Array.isArray(data.vendors) ? data.vendors.map((row) => mapVendor(row as unknown as Record<string, unknown>)) : [],
  contracts: Array.isArray(data.contracts) ? data.contracts.map((row) => mapContract(row as unknown as Record<string, unknown>)) : [],
  telematics: Array.isArray(data.telematics) ? data.telematics.map((row) => mapTelematics(row as unknown as Record<string, unknown>)) : [],
  costs: Array.isArray(data.costs) ? data.costs.map((row) => mapCost(row as unknown as Record<string, unknown>)) : [],
  source: 'DLE_Enterprise',
});

const loadFromDb = async (pool: sql.ConnectionPool): Promise<LogisticsFleetData> => {
  const [
    vehicles,
    drivers,
    trips,
    maintenance,
    fuel,
    compliance,
    assignments,
    requests,
    audit,
    incidents,
    vendors,
    contracts,
    telematics,
    costs,
  ] = await Promise.all([
    pool.request().query('SELECT * FROM [fleet].[Vehicles] WHERE [IsActive] = 1 ORDER BY [UpdatedAt] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Drivers] WHERE [IsActive] = 1 ORDER BY [UpdatedAt] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Trips] ORDER BY [UpdatedAt] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Maintenance] ORDER BY [UpdatedAt] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Fuel] ORDER BY [FuelDate] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Compliance] ORDER BY [UpdatedAt] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Assignments] ORDER BY [EffectiveDate] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Requests] ORDER BY [CreatedAt] DESC'),
    pool.request().query('SELECT TOP (200) * FROM [fleet].[AuditTrail] ORDER BY [At] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Incidents] ORDER BY [OccurredAt] DESC'),
    pool.request().query('SELECT * FROM [fleet].[Vendors] ORDER BY [Name] ASC'),
    pool.request().query('SELECT * FROM [fleet].[Contracts] ORDER BY [UpdatedAt] DESC'),
    pool.request().query('SELECT TOP (200) * FROM [fleet].[TelematicsEvents] ORDER BY [OccurredAt] DESC'),
    pool.request().query('SELECT * FROM [fleet].[CostEntries] ORDER BY [CostDate] DESC'),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    vehicles: vehicles.recordset.map((row) => mapVehicle(row)),
    drivers: drivers.recordset.map((row) => mapDriver(row)),
    trips: trips.recordset.map((row) => mapTrip(row)),
    maintenance: maintenance.recordset.map((row) => mapMaintenance(row)),
    fuel: fuel.recordset.map((row) => mapFuel(row)),
    compliance: compliance.recordset.map((row) => mapCompliance(row)),
    assignmentHistory: assignments.recordset.map((row) => mapAssignment(row)),
    requests: requests.recordset.map((row) => mapRequest(row)),
    auditTrail: audit.recordset.map((row) => mapAudit(row)),
    incidents: incidents.recordset.map((row) => mapIncident(row)),
    vendors: vendors.recordset.map((row) => mapVendor(row)),
    contracts: contracts.recordset.map((row) => mapContract(row)),
    telematics: telematics.recordset.map((row) => mapTelematics(row)),
    costs: costs.recordset.map((row) => mapCost(row)),
    source: 'DLE_Enterprise',
  };
};

const clearAndInsert = async (tx: sql.Transaction, table: string, rows: Record<string, unknown>[], columns: string[], valuesSql: (row: Record<string, unknown>, req: sql.Request, index: number) => void) => {
  await new sql.Request(tx).query(`DELETE FROM ${table}`);
  for (let index = 0; index < rows.length; index += 1) {
    const req = new sql.Request(tx);
    valuesSql(rows[index], req, index);
    const placeholders = columns.map((column) => `@${column}_${index}`).join(', ');
    await req.query(`INSERT INTO ${table} (${columns.map((column) => `[${column}]`).join(', ')}) VALUES (${placeholders})`);
  }
};

export const writeLogisticsFleetData = async (data: LogisticsFleetData) => {
  const pool = await ensureFleetDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await clearAndInsert(
      tx,
      '[fleet].[Vehicles]',
      data.vehicles as unknown as Record<string, unknown>[],
      [
        'VehicleId', 'AssetCode', 'PlateNumber', 'VehicleType', 'MakeModel', 'Year', 'Department', 'Location', 'Custodian', 'Status',
        'OdometerKm', 'NextServiceKm', 'InsuranceExpiry', 'RoadWorthinessExpiry', 'OwnershipType', 'AcquisitionCost', 'Supplier',
        'PurchaseDate', 'WarrantyExpiry', 'FinancingNotes', 'DepreciationMethod', 'DisposalDate', 'ChassisNumber', 'EngineNumber',
        'FuelType', 'CostCenter', 'ProjectCode', 'UpdatedAt', 'IsActive',
      ],
      (row, req, index) => {
        const vehicle = mapVehicle(row);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), vehicle.id);
        req.input(`AssetCode_${index}`, sql.NVarChar(60), vehicle.assetCode);
        req.input(`PlateNumber_${index}`, sql.NVarChar(40), vehicle.plateNumber);
        req.input(`VehicleType_${index}`, sql.NVarChar(80), vehicle.vehicleType);
        req.input(`MakeModel_${index}`, sql.NVarChar(160), vehicle.makeModel);
        req.input(`Year_${index}`, sql.Int, vehicle.year);
        req.input(`Department_${index}`, sql.NVarChar(180), vehicle.department || null);
        req.input(`Location_${index}`, sql.NVarChar(180), vehicle.location || null);
        req.input(`Custodian_${index}`, sql.NVarChar(220), vehicle.custodian || null);
        req.input(`Status_${index}`, sql.NVarChar(40), vehicle.status);
        req.input(`OdometerKm_${index}`, sql.Int, vehicle.odometerKm);
        req.input(`NextServiceKm_${index}`, sql.Int, vehicle.nextServiceKm);
        req.input(`InsuranceExpiry_${index}`, sql.DateTime2, toDate(vehicle.insuranceExpiry));
        req.input(`RoadWorthinessExpiry_${index}`, sql.DateTime2, toDate(vehicle.roadWorthinessExpiry));
        req.input(`OwnershipType_${index}`, sql.NVarChar(40), vehicle.ownershipType || null);
        req.input(`AcquisitionCost_${index}`, sql.Decimal(19, 2), vehicle.acquisitionCost || null);
        req.input(`Supplier_${index}`, sql.NVarChar(180), vehicle.supplier || null);
        req.input(`PurchaseDate_${index}`, sql.DateTime2, toDate(vehicle.purchaseDate));
        req.input(`WarrantyExpiry_${index}`, sql.DateTime2, toDate(vehicle.warrantyExpiry));
        req.input(`FinancingNotes_${index}`, sql.NVarChar(sql.MAX), vehicle.financingNotes || null);
        req.input(`DepreciationMethod_${index}`, sql.NVarChar(80), vehicle.depreciationMethod || null);
        req.input(`DisposalDate_${index}`, sql.DateTime2, toDate(vehicle.disposalDate));
        req.input(`ChassisNumber_${index}`, sql.NVarChar(80), vehicle.chassisNumber || null);
        req.input(`EngineNumber_${index}`, sql.NVarChar(80), vehicle.engineNumber || null);
        req.input(`FuelType_${index}`, sql.NVarChar(40), vehicle.fuelType || null);
        req.input(`CostCenter_${index}`, sql.NVarChar(80), vehicle.costCenter || null);
        req.input(`ProjectCode_${index}`, sql.NVarChar(80), vehicle.projectCode || null);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
        req.input(`IsActive_${index}`, sql.Bit, 1);
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Drivers]',
      data.drivers as unknown as Record<string, unknown>[],
      ['DriverId', 'EmployeeCode', 'LicenseNumber', 'LicenseClass', 'LicenseExpiry', 'IssuingAuthority', 'MedicalCertificateStatus', 'DefensiveDrivingCertificate', 'DriverCategory', 'AvailabilityStatus', 'AssignedVehicleId', 'Status', 'ComplianceStatus', 'SafetyScore', 'RegisteredAt', 'ApprovalStatus', 'UpdatedAt', 'IsActive'],
      (row, req, index) => {
        const driver = mapDriver(row);
        req.input(`DriverId_${index}`, sql.NVarChar(60), driver.id);
        req.input(`EmployeeCode_${index}`, sql.NVarChar(40), driver.employeeCode);
        req.input(`LicenseNumber_${index}`, sql.NVarChar(80), driver.licenseNumber);
        req.input(`LicenseClass_${index}`, sql.NVarChar(40), driver.licenseClass || null);
        req.input(`LicenseExpiry_${index}`, sql.DateTime2, toDate(driver.licenseExpiry));
        req.input(`IssuingAuthority_${index}`, sql.NVarChar(160), driver.issuingAuthority || null);
        req.input(`MedicalCertificateStatus_${index}`, sql.NVarChar(40), driver.medicalCertificateStatus);
        req.input(`DefensiveDrivingCertificate_${index}`, sql.NVarChar(40), driver.defensiveDrivingCertificate);
        req.input(`DriverCategory_${index}`, sql.NVarChar(60), driver.driverCategory);
        req.input(`AvailabilityStatus_${index}`, sql.NVarChar(40), driver.availabilityStatus);
        req.input(`AssignedVehicleId_${index}`, sql.NVarChar(60), driver.assignedVehicleId || null);
        req.input(`Status_${index}`, sql.NVarChar(60), driver.status);
        req.input(`ComplianceStatus_${index}`, sql.NVarChar(60), driver.complianceStatus);
        req.input(`SafetyScore_${index}`, sql.Int, driver.safetyScore);
        req.input(`RegisteredAt_${index}`, sql.DateTime2, toDate(driver.registeredAt) || new Date());
        req.input(`ApprovalStatus_${index}`, sql.NVarChar(40), driver.approvalStatus);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
        req.input(`IsActive_${index}`, sql.Bit, 1);
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Trips]',
      data.trips as unknown as Record<string, unknown>[],
      [
        'TripId', 'RequestNo', 'VehicleId', 'DriverId', 'Requester', 'RequesterEmployeeCode', 'RequesterDepartment', 'RequesterLocation',
        'LineManagerEmployeeCode', 'LineManagerName', 'Origin', 'Destination', 'Purpose', 'StartDate', 'EndDate', 'ProjectCode', 'CostCenter',
        'Status', 'ApprovedBy', 'LineApprovedBy', 'LineApprovedAt', 'LineRejectReason', 'AllocatedBy', 'AllocatedAt',
        'DispatchedBy', 'DispatchedAt', 'CompletedBy', 'CompletedAt', 'CancelReason', 'ReturnReason', 'UpdatedAt',
      ],
      (row, req, index) => {
        const trip = mapTrip(row);
        req.input(`TripId_${index}`, sql.NVarChar(60), trip.id);
        req.input(`RequestNo_${index}`, sql.NVarChar(60), trip.requestNo);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), trip.vehicleId || null);
        req.input(`DriverId_${index}`, sql.NVarChar(80), trip.driverId || null);
        req.input(`Requester_${index}`, sql.NVarChar(220), trip.requester);
        req.input(`RequesterEmployeeCode_${index}`, sql.NVarChar(40), trip.requesterEmployeeCode || null);
        req.input(`RequesterDepartment_${index}`, sql.NVarChar(180), trip.requesterDepartment || null);
        req.input(`RequesterLocation_${index}`, sql.NVarChar(180), trip.requesterLocation || null);
        req.input(`LineManagerEmployeeCode_${index}`, sql.NVarChar(40), trip.lineManagerEmployeeCode || null);
        req.input(`LineManagerName_${index}`, sql.NVarChar(220), trip.lineManagerName || null);
        req.input(`Origin_${index}`, sql.NVarChar(200), trip.origin);
        req.input(`Destination_${index}`, sql.NVarChar(200), trip.destination);
        req.input(`Purpose_${index}`, sql.NVarChar(500), trip.purpose || null);
        req.input(`StartDate_${index}`, sql.DateTime2, toDate(trip.startDate));
        req.input(`EndDate_${index}`, sql.DateTime2, toDate(trip.endDate));
        req.input(`ProjectCode_${index}`, sql.NVarChar(80), trip.projectCode || null);
        req.input(`CostCenter_${index}`, sql.NVarChar(80), trip.costCenter || null);
        req.input(`Status_${index}`, sql.NVarChar(40), trip.status);
        req.input(`ApprovedBy_${index}`, sql.NVarChar(160), trip.approvedBy || trip.lineApprovedBy || null);
        req.input(`LineApprovedBy_${index}`, sql.NVarChar(160), trip.lineApprovedBy || null);
        req.input(`LineApprovedAt_${index}`, sql.DateTime2, toDate(trip.lineApprovedAt));
        req.input(`LineRejectReason_${index}`, sql.NVarChar(500), trip.lineRejectReason || null);
        req.input(`AllocatedBy_${index}`, sql.NVarChar(160), trip.allocatedBy || null);
        req.input(`AllocatedAt_${index}`, sql.DateTime2, toDate(trip.allocatedAt));
        req.input(`DispatchedBy_${index}`, sql.NVarChar(160), trip.dispatchedBy || null);
        req.input(`DispatchedAt_${index}`, sql.DateTime2, toDate(trip.dispatchedAt));
        req.input(`CompletedBy_${index}`, sql.NVarChar(160), trip.completedBy || null);
        req.input(`CompletedAt_${index}`, sql.DateTime2, toDate(trip.completedAt));
        req.input(`CancelReason_${index}`, sql.NVarChar(500), trip.cancelReason || null);
        req.input(`ReturnReason_${index}`, sql.NVarChar(500), trip.returnReason || null);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Maintenance]',
      data.maintenance as unknown as Record<string, unknown>[],
      ['MaintenanceId', 'VehicleId', 'MaintenanceType', 'Vendor', 'ScheduledDate', 'CompletedDate', 'Cost', 'Status', 'Notes', 'UpdatedAt'],
      (row, req, index) => {
        const item = mapMaintenance(row);
        req.input(`MaintenanceId_${index}`, sql.NVarChar(60), item.id);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), item.vehicleId);
        req.input(`MaintenanceType_${index}`, sql.NVarChar(120), item.maintenanceType);
        req.input(`Vendor_${index}`, sql.NVarChar(180), item.vendor || null);
        req.input(`ScheduledDate_${index}`, sql.DateTime2, toDate(item.scheduledDate));
        req.input(`CompletedDate_${index}`, sql.DateTime2, toDate(item.completedDate));
        req.input(`Cost_${index}`, sql.Decimal(19, 2), item.cost);
        req.input(`Status_${index}`, sql.NVarChar(40), item.status);
        req.input(`Notes_${index}`, sql.NVarChar(sql.MAX), item.notes || null);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Fuel]',
      data.fuel as unknown as Record<string, unknown>[],
      ['FuelId', 'VehicleId', 'DriverId', 'FuelDate', 'Litres', 'Amount', 'OdometerKm', 'Station', 'ProjectCode'],
      (row, req, index) => {
        const item = mapFuel(row);
        req.input(`FuelId_${index}`, sql.NVarChar(60), item.id);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), item.vehicleId);
        req.input(`DriverId_${index}`, sql.NVarChar(80), item.driverId || null);
        req.input(`FuelDate_${index}`, sql.DateTime2, toDate(item.date) || new Date());
        req.input(`Litres_${index}`, sql.Decimal(12, 2), item.litres);
        req.input(`Amount_${index}`, sql.Decimal(19, 2), item.amount);
        req.input(`OdometerKm_${index}`, sql.Int, item.odometerKm);
        req.input(`Station_${index}`, sql.NVarChar(180), item.station || null);
        req.input(`ProjectCode_${index}`, sql.NVarChar(80), item.projectCode || null);
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Compliance]',
      data.compliance as unknown as Record<string, unknown>[],
      ['ComplianceId', 'VehicleId', 'DriverId', 'DocumentType', 'Reference', 'IssueDate', 'ExpiryDate', 'Status', 'VerifiedBy', 'VerifiedAt', 'RejectionReason', 'UpdatedAt'],
      (row, req, index) => {
        const item = mapCompliance(row);
        req.input(`ComplianceId_${index}`, sql.NVarChar(60), item.id);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), item.vehicleId || null);
        req.input(`DriverId_${index}`, sql.NVarChar(80), item.driverId || null);
        req.input(`DocumentType_${index}`, sql.NVarChar(120), item.documentType);
        req.input(`Reference_${index}`, sql.NVarChar(120), item.reference);
        req.input(`IssueDate_${index}`, sql.DateTime2, toDate(item.issueDate));
        req.input(`ExpiryDate_${index}`, sql.DateTime2, toDate(item.expiryDate));
        req.input(`Status_${index}`, sql.NVarChar(40), item.status);
        req.input(`VerifiedBy_${index}`, sql.NVarChar(160), item.verifiedBy || null);
        req.input(`VerifiedAt_${index}`, sql.DateTime2, toDate(item.verifiedAt));
        req.input(`RejectionReason_${index}`, sql.NVarChar(500), item.rejectionReason || null);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Assignments]',
      data.assignmentHistory as unknown as Record<string, unknown>[],
      ['AssignmentId', 'DriverId', 'VehicleId', 'Action', 'EffectiveDate', 'EndedAt', 'Reason', 'PerformedBy'],
      (row, req, index) => {
        const item = mapAssignment(row);
        req.input(`AssignmentId_${index}`, sql.NVarChar(60), item.id);
        req.input(`DriverId_${index}`, sql.NVarChar(60), item.driverId);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), item.vehicleId);
        req.input(`Action_${index}`, sql.NVarChar(40), item.action);
        req.input(`EffectiveDate_${index}`, sql.DateTime2, toDate(item.effectiveDate) || new Date());
        req.input(`EndedAt_${index}`, sql.DateTime2, toDate(item.endedAt));
        req.input(`Reason_${index}`, sql.NVarChar(500), item.reason || null);
        req.input(`PerformedBy_${index}`, sql.NVarChar(160), item.performedBy || null);
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Requests]',
      data.requests as unknown as Record<string, unknown>[],
      ['RequestId', 'RequestType', 'Requester', 'Department', 'Details', 'Priority', 'Status', 'CreatedAt', 'UpdatedAt'],
      (row, req, index) => {
        const item = mapRequest(row);
        req.input(`RequestId_${index}`, sql.NVarChar(60), item.id);
        req.input(`RequestType_${index}`, sql.NVarChar(120), item.requestType);
        req.input(`Requester_${index}`, sql.NVarChar(220), item.requester);
        req.input(`Department_${index}`, sql.NVarChar(180), item.department || null);
        req.input(`Details_${index}`, sql.NVarChar(sql.MAX), item.details || null);
        req.input(`Priority_${index}`, sql.NVarChar(20), item.priority);
        req.input(`Status_${index}`, sql.NVarChar(40), item.status);
        req.input(`CreatedAt_${index}`, sql.DateTime2, toDate(item.createdAt) || new Date());
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[AuditTrail]',
      data.auditTrail.slice(0, 500) as unknown as Record<string, unknown>[],
      ['AuditId', 'At', 'Actor', 'Action', 'Entity', 'Details'],
      (row, req, index) => {
        const item = mapAudit(row);
        req.input(`AuditId_${index}`, sql.NVarChar(60), item.id);
        req.input(`At_${index}`, sql.DateTime2, toDate(item.at) || new Date());
        req.input(`Actor_${index}`, sql.NVarChar(160), item.actor || null);
        req.input(`Action_${index}`, sql.NVarChar(160), item.action);
        req.input(`Entity_${index}`, sql.NVarChar(120), item.entity);
        req.input(`Details_${index}`, sql.NVarChar(sql.MAX), item.details || null);
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Incidents]',
      data.incidents as unknown as Record<string, unknown>[],
      ['IncidentId', 'Reference', 'VehicleId', 'DriverId', 'IncidentType', 'Severity', 'OccurredAt', 'Location', 'Description', 'ClaimStatus', 'Status', 'UpdatedAt'],
      (row, req, index) => {
        const item = mapIncident(row);
        req.input(`IncidentId_${index}`, sql.NVarChar(60), item.id);
        req.input(`Reference_${index}`, sql.NVarChar(80), item.reference);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), item.vehicleId || null);
        req.input(`DriverId_${index}`, sql.NVarChar(80), item.driverId || null);
        req.input(`IncidentType_${index}`, sql.NVarChar(120), item.incidentType);
        req.input(`Severity_${index}`, sql.NVarChar(40), item.severity);
        req.input(`OccurredAt_${index}`, sql.DateTime2, toDate(item.occurredAt) || new Date());
        req.input(`Location_${index}`, sql.NVarChar(200), item.location || null);
        req.input(`Description_${index}`, sql.NVarChar(sql.MAX), item.description || null);
        req.input(`ClaimStatus_${index}`, sql.NVarChar(40), item.claimStatus);
        req.input(`Status_${index}`, sql.NVarChar(40), item.status);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Vendors]',
      data.vendors as unknown as Record<string, unknown>[],
      ['VendorId', 'Name', 'Category', 'ContactName', 'Email', 'Phone', 'Location', 'Status', 'Rating', 'UpdatedAt'],
      (row, req, index) => {
        const item = mapVendor(row);
        req.input(`VendorId_${index}`, sql.NVarChar(60), item.id);
        req.input(`Name_${index}`, sql.NVarChar(200), item.name);
        req.input(`Category_${index}`, sql.NVarChar(80), item.category || null);
        req.input(`ContactName_${index}`, sql.NVarChar(180), item.contactName || null);
        req.input(`Email_${index}`, sql.NVarChar(180), item.email || null);
        req.input(`Phone_${index}`, sql.NVarChar(60), item.phone || null);
        req.input(`Location_${index}`, sql.NVarChar(180), item.location || null);
        req.input(`Status_${index}`, sql.NVarChar(40), item.status);
        req.input(`Rating_${index}`, sql.Decimal(4, 2), item.rating || null);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[Contracts]',
      data.contracts as unknown as Record<string, unknown>[],
      ['ContractId', 'VendorId', 'Title', 'ContractType', 'StartDate', 'EndDate', 'Value', 'Status', 'Notes', 'UpdatedAt'],
      (row, req, index) => {
        const item = mapContract(row);
        req.input(`ContractId_${index}`, sql.NVarChar(60), item.id);
        req.input(`VendorId_${index}`, sql.NVarChar(60), item.vendorId || null);
        req.input(`Title_${index}`, sql.NVarChar(200), item.title);
        req.input(`ContractType_${index}`, sql.NVarChar(80), item.contractType || null);
        req.input(`StartDate_${index}`, sql.DateTime2, toDate(item.startDate));
        req.input(`EndDate_${index}`, sql.DateTime2, toDate(item.endDate));
        req.input(`Value_${index}`, sql.Decimal(19, 2), item.value);
        req.input(`Status_${index}`, sql.NVarChar(40), item.status);
        req.input(`Notes_${index}`, sql.NVarChar(sql.MAX), item.notes || null);
        req.input(`UpdatedAt_${index}`, sql.DateTime2, new Date());
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[TelematicsEvents]',
      data.telematics.slice(0, 500) as unknown as Record<string, unknown>[],
      ['EventId', 'VehicleId', 'EventType', 'Severity', 'OccurredAt', 'Latitude', 'Longitude', 'SpeedKph', 'Details'],
      (row, req, index) => {
        const item = mapTelematics(row);
        req.input(`EventId_${index}`, sql.NVarChar(60), item.id);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), item.vehicleId);
        req.input(`EventType_${index}`, sql.NVarChar(80), item.eventType);
        req.input(`Severity_${index}`, sql.NVarChar(40), item.severity);
        req.input(`OccurredAt_${index}`, sql.DateTime2, toDate(item.occurredAt) || new Date());
        req.input(`Latitude_${index}`, sql.Decimal(10, 6), item.latitude ?? null);
        req.input(`Longitude_${index}`, sql.Decimal(10, 6), item.longitude ?? null);
        req.input(`SpeedKph_${index}`, sql.Decimal(8, 2), item.speedKph ?? null);
        req.input(`Details_${index}`, sql.NVarChar(sql.MAX), item.details || null);
      },
    );

    await clearAndInsert(
      tx,
      '[fleet].[CostEntries]',
      data.costs as unknown as Record<string, unknown>[],
      ['CostId', 'VehicleId', 'Category', 'CostDate', 'Amount', 'CostCenter', 'ProjectCode', 'Notes', 'CreatedBy'],
      (row, req, index) => {
        const item = mapCost(row);
        req.input(`CostId_${index}`, sql.NVarChar(60), item.id);
        req.input(`VehicleId_${index}`, sql.NVarChar(60), item.vehicleId || null);
        req.input(`Category_${index}`, sql.NVarChar(80), item.category);
        req.input(`CostDate_${index}`, sql.DateTime2, toDate(item.costDate) || new Date());
        req.input(`Amount_${index}`, sql.Decimal(19, 2), item.amount);
        req.input(`CostCenter_${index}`, sql.NVarChar(80), item.costCenter || null);
        req.input(`ProjectCode_${index}`, sql.NVarChar(80), item.projectCode || null);
        req.input(`Notes_${index}`, sql.NVarChar(sql.MAX), item.notes || null);
        req.input(`CreatedBy_${index}`, sql.NVarChar(160), item.createdBy || null);
      },
    );

    await tx.commit();
  } catch (error) {
    try { await tx.rollback(); } catch { /* ignore */ }
    throw error;
  }
};

const seedIfEmpty = async (pool: sql.ConnectionPool) => {
  // Retire original demo seed rows so the register is live operational data only.
  try {
    await pool.request().query(`
UPDATE [fleet].[Vehicles]
SET [IsActive] = 0, [UpdatedAt] = SYSUTCDATETIME()
WHERE [IsActive] = 1
  AND [AssetCode] IN (N'FLT-LAG-001', N'FLT-YRD-014', N'FLT-MAR-006');

UPDATE [fleet].[Drivers]
SET [IsActive] = 0, [UpdatedAt] = SYSUTCDATETIME()
WHERE [IsActive] = 1
  AND [DriverId] IN (N'drv-001', N'drv-002', N'drv-003');
`);
  } catch {
    /* schema may still be applying */
  }

  const seeded = await pool.request()
    .input('BootstrapKey', sql.NVarChar(80), 'initial-seed')
    .query('SELECT 1 AS ok FROM [fleet].[Bootstrap] WHERE [BootstrapKey] = @BootstrapKey');
  if (seeded.recordset.length) return;
  try {
    await pool.request()
      .input('BootstrapKey', sql.NVarChar(80), 'initial-seed')
      .input('Details', sql.NVarChar(500), 'Live DLE_Enterprise fleet mode — no demo JSON seed.')
      .query('INSERT INTO [fleet].[Bootstrap] ([BootstrapKey], [Details]) VALUES (@BootstrapKey, @Details)');
  } catch {
    /* concurrent bootstrap */
  }
};

const listEnterpriseLocations = async (pool: sql.ConnectionPool) => {
  try {
    const result = await pool.request().query(`
SELECT LocationName FROM (
  SELECT DISTINCT LTRIM(RTRIM([Name])) AS LocationName
  FROM [hris].[OrganizationLocationsSites]
  WHERE NULLIF(LTRIM(RTRIM([Name])), N'') IS NOT NULL
  UNION
  SELECT DISTINCT LTRIM(RTRIM([Location])) AS LocationName
  FROM [hris].[OrganizationLocationsSites]
  WHERE NULLIF(LTRIM(RTRIM([Location])), N'') IS NOT NULL
) AS locs
ORDER BY LocationName
`);
    return result.recordset.map((row) => str(row.LocationName)).filter(Boolean);
  } catch {
    return [];
  }
};

const listEnterpriseDepartments = async (pool: sql.ConnectionPool, employees: DleEmployeeDirectoryRow[]) => {
  try {
    const result = await pool.request().query(`
SELECT DISTINCT LTRIM(RTRIM([Name])) AS DepartmentName
FROM [hris].[OrganizationDepartments]
WHERE NULLIF(LTRIM(RTRIM([Name])), N'') IS NOT NULL
ORDER BY DepartmentName
`);
    const fromDb = result.recordset.map((row) => str(row.DepartmentName)).filter(Boolean);
    if (fromDb.length) return fromDb;
  } catch {
    /* fall through to employee directory */
  }
  return Array.from(new Set(employees.map((employee) => str(employee.department || employee.businessUnit)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const readRaw = async () => {
  const pool = await ensureFleetDb();
  await seedIfEmpty(pool);
  return loadFromDb(pool);
};

export const readLogisticsFleetData = async () => {
  const pool = await ensureFleetDb();
  await seedIfEmpty(pool);
  const employeeSource = await readPayrollEmployees();
  let data = normalizeData(await loadFromDb(pool));
  await ensureDirectoryDriversSynced(data, employeeSource.employees, 'HRIS Sync');
  data = hydrateDriverLifecycle(normalizeData(await loadFromDb(pool)), employeeSource.employees);
  const [locations, departments] = await Promise.all([
    listEnterpriseLocations(pool),
    listEnterpriseDepartments(pool, employeeSource.employees),
  ]);
  const locationOptions = locations.length
    ? locations
    : Array.from(new Set(employeeSource.employees.map((employee) => str(employee.workLocation || employee.location || employee.officeLocation)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const employees = employeeSource.employees.map(toEmployeeOption);
  return {
    ...data,
    generatedAt: new Date().toISOString(),
    source: 'DLE_Enterprise' as const,
    employees,
    driverEmployees: employees.filter((employee) => employee.isDirectoryDriver),
    employeeSource: payrollDataSourceInfo(employeeSource),
    locations: locationOptions,
    departments,
    summary: buildSummary(data),
  };
};

const toEmployeeOption = (employee: DleEmployeeDirectoryRow): LogisticsEmployeeOption => ({
  employeeCode: employee.employeeCode || employee.employeeId,
  employeeId: employee.employeeId,
  fullName: employee.fullName,
  jobTitle: employee.jobTitle || employee.designation || '',
  department: employee.department || employee.businessUnit || '',
  location: employee.workLocation || employee.location || employee.officeLocation || '',
  phone: employee.primaryPhone || employee.phone || employee.alternatePhone || '',
  status: employee.status || '',
  managerName: employee.managerName || employee.functionalManager || '',
  isDirectoryDriver: isDirectoryDriverEmployee(employee),
});

export const isDirectoryDriverEmployee = (employee: Pick<DleEmployeeDirectoryRow, 'jobTitle' | 'designation' | 'employeeCategory' | 'staffCategory'>) => {
  const text = [employee.jobTitle, employee.designation, employee.employeeCategory, employee.staffCategory]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return /\bdrivers?\b|\bchauffeurs?\b|driver\s*mate|truck\s*driver|pool\s*driver|ambulance\s*driver|chairman'?s?\s*driver|md'?s?\s*driver/.test(text);
};

const driverCategoryFromTitle = (title: string): FleetDriver['driverCategory'] => {
  const text = String(title || '').toLowerCase();
  if (text.includes('pool')) return 'Pool Driver';
  if (text.includes('chairman') || text.includes("md's") || text.includes('mds ') || text.includes('executive')) return 'Executive Driver';
  if (text.includes('mate') || text.includes('relief')) return 'Relief Driver';
  if (text.includes('truck') || text.includes('ambulance') || text.includes('pjt') || text.includes('project')) return 'Project Driver';
  return 'Company Driver';
};

const ensureDirectoryDriversSynced = async (
  data: LogisticsFleetData,
  employees: DleEmployeeDirectoryRow[],
  actor = 'System',
) => {
  const directoryDrivers = employees.filter((employee) => assignableEmployee(employee) && isDirectoryDriverEmployee(employee));
  let changed = false;
  for (const employee of directoryDrivers) {
    const employeeCode = employee.employeeCode || employee.employeeId;
    const existing = data.drivers.find((driver) => driver.employeeCode.toLowerCase() === employeeCode.toLowerCase());
    if (existing) continue;
    const category = driverCategoryFromTitle(`${employee.jobTitle || ''} ${employee.designation || ''}`);
    const driver: FleetDriver = {
      id: id('drv'),
      employeeCode,
      licenseNumber: '',
      licenseClass: '',
      licenseExpiry: '',
      issuingAuthority: '',
      medicalCertificateStatus: 'Missing',
      defensiveDrivingCertificate: 'Missing',
      driverCategory: category,
      availabilityStatus: 'Available',
      assignedVehicleId: '',
      status: 'Available',
      complianceStatus: 'Missing Documents',
      safetyScore: 90,
      registeredAt: new Date().toISOString(),
      approvalStatus: 'Approved',
    };
    driver.complianceStatus = driverComplianceStatus(driver);
    data.drivers.unshift(driver);
    audit(data, actor, 'Synced driver from Employee Directory', 'Driver Management', `${employeeDisplay(employee)} · ${employee.jobTitle || employee.designation || category}`);
    changed = true;
  }
  if (changed) await writeLogisticsFleetData(data);
  return changed;
};

const assignableEmployee = (employee: DleEmployeeDirectoryRow) => !String(employee.status || '').toLowerCase().match(/inactive|suspended|terminated|resigned|exited|retired|long-term leave|long term leave/);

const findEmployee = (employees: DleEmployeeDirectoryRow[], code: string) => {
  const target = String(code || '').trim().toLowerCase();
  if (!target) return null;
  return employees.find((employee) => [employee.employeeCode, employee.employeeId, employee.sourceEmployeeId, employee.officialEmail, employee.email].some((value) => String(value || '').trim().toLowerCase() === target)) || null;
};

const configuredDriverSupervisorCodes = () =>
  String(process.env.FLEET_DRIVER_SUPERVISOR_CODES || 'L2770')
    .split(/[,;\s]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

/** Driver Supervisor for trip routing (not the requester's HR line manager). Defaults to L2770. */
const resolveDriverSupervisor = (employees: DleEmployeeDirectoryRow[]) => {
  for (const code of configuredDriverSupervisorCodes()) {
    const employee = findEmployee(employees, code);
    if (employee) return employee;
  }
  return null;
};

const resolveLineManager = (employees: DleEmployeeDirectoryRow[], requester: DleEmployeeDirectoryRow) => {
  const managerName = String(requester.managerName || requester.functionalManager || '').trim().toLowerCase();
  if (!managerName) return null;
  return employees.find((employee) => {
    const names = [employee.fullName, `${employee.firstName} ${employee.lastName}`.trim()].map((value) => value.toLowerCase());
    return names.some((name) => name && (name === managerName || managerName.includes(name) || name.includes(managerName)));
  }) || null;
};

const employeeDisplay = (employee: DleEmployeeDirectoryRow) => `${employee.fullName} (${employee.employeeCode || employee.employeeId})`;

const expiryState = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { expired: false, expiringSoon: false };
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  return { expired: days < 0, expiringSoon: days >= 0 && days <= 30 };
};

const driverComplianceStatus = (driver: FleetDriver): FleetDriver['complianceStatus'] => {
  const license = expiryState(driver.licenseExpiry);
  if (license.expired) return 'Expired';
  if (driver.medicalCertificateStatus !== 'Valid' || driver.defensiveDrivingCertificate !== 'Valid') return 'Missing Documents';
  if (license.expiringSoon) return 'Expiring Soon';
  return 'Compliant';
};

const deriveDriverStatus = (driver: FleetDriver, employee: DleEmployeeDirectoryRow | null, trips: FleetTrip[]): FleetDriver['status'] => {
  if (!employee || !assignableEmployee(employee)) return 'Inactive';
  if (driver.status === 'Suspended' || driver.availabilityStatus === 'Suspended') return 'Suspended';
  if (expiryState(driver.licenseExpiry).expired) return 'License Expired';
  const compliance = driverComplianceStatus(driver);
  if (compliance === 'Expired' || compliance === 'Missing Documents' || compliance === 'Blocked') return 'Compliance Blocked';
  if (trips.some((trip) => [driver.id, driver.employeeCode].includes(trip.driverId) && isActiveOperationalTrip(trip.status))) return 'On Trip';
  if (driver.assignedVehicleId) return 'Assigned';
  if (driver.approvalStatus !== 'Approved') return 'Draft';
  return driver.availabilityStatus === 'Off Duty' || driver.availabilityStatus === 'On Leave' ? driver.availabilityStatus : 'Available';
};

const hydrateDriverLifecycle = (data: LogisticsFleetData, employees: DleEmployeeDirectoryRow[]): LogisticsFleetData => ({
  ...data,
  drivers: data.drivers.map((driver) => {
    const normalized: FleetDriver = {
      ...driver,
      licenseClass: driver.licenseClass || '',
      issuingAuthority: driver.issuingAuthority || '',
      medicalCertificateStatus: driver.medicalCertificateStatus || 'Missing',
      defensiveDrivingCertificate: driver.defensiveDrivingCertificate || 'Missing',
      driverCategory: driver.driverCategory || 'Company Driver',
      availabilityStatus: driver.availabilityStatus || 'Available',
      complianceStatus: driver.complianceStatus || 'Missing Documents',
      registeredAt: driver.registeredAt || new Date().toISOString(),
      approvalStatus: driver.approvalStatus || 'Submitted',
    };
    const employee = findEmployee(employees, normalized.employeeCode);
    const compliance = driverComplianceStatus(normalized);
    return { ...normalized, complianceStatus: compliance, status: deriveDriverStatus({ ...normalized, complianceStatus: compliance }, employee, data.trips) };
  }),
});

const ensureNoActiveDriver = (data: LogisticsFleetData, employeeCode: string) => {
  const existing = data.drivers.find((driver) => driver.employeeCode.toLowerCase() === employeeCode.toLowerCase() && !['Inactive', 'Suspended'].includes(driver.status));
  if (existing) throw new Error('Employee is already assigned as an active driver');
};

const assertDriverCanOperate = (driver: FleetDriver) => {
  if (['Inactive', 'Suspended', 'License Expired', 'Compliance Blocked'].includes(driver.status)) throw new Error(`Driver cannot be assigned while status is ${driver.status}`);
  if (expiryState(driver.licenseExpiry).expired) throw new Error('Driver license is expired');
};

const assertVehicleAvailable = (data: LogisticsFleetData, vehicleId: string, currentDriverId?: string) => {
  const vehicle = data.vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) throw new Error('Vehicle not found');
  if (!['Available', 'Assigned'].includes(vehicle.status)) throw new Error(`Vehicle is unavailable while status is ${vehicle.status}`);
  const assigned = data.drivers.find((driver) => driver.assignedVehicleId === vehicleId && driver.id !== currentDriverId && !['Inactive', 'Suspended'].includes(driver.status));
  if (assigned) throw new Error('Vehicle already has an active driver assignment');
  return vehicle;
};

const buildSummary = (data: LogisticsFleetData) => {
  const activeVehicles = data.vehicles.filter((vehicle) => !['Retired', 'Grounded'].includes(vehicle.status)).length;
  const availableVehicles = data.vehicles.filter((vehicle) => vehicle.status === 'Available').length;
  const openTrips = data.trips.filter((trip) => isOpenTripStatus(trip.status)).length;
  const pendingApprovals = [
    ...data.trips.filter((trip) => ['PendingDriverSupervisor', 'PendingLineApproval', 'PendingFleetAllocation', 'Submitted'].includes(trip.status)),
    ...data.maintenance.filter((item) => item.status === 'Submitted'),
    ...data.requests.filter((item) => item.status === 'Submitted'),
  ].length + data.drivers.filter((driver) => driver.approvalStatus === 'Submitted').length;
  const expiringDocs = data.compliance.filter((item) => item.status !== 'Valid').length + data.drivers.filter((driver) => ['Expired', 'Missing Documents', 'Blocked'].includes(driver.complianceStatus)).length;
  const fuelSpend = data.fuel.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const maintenanceCost = data.maintenance.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const incidentOpen = data.incidents.filter((item) => !['Closed', 'Rejected'].includes(item.status)).length;
  const costTotal = data.costs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return { activeVehicles, availableVehicles, openTrips, pendingApprovals, expiringDocs, fuelSpend, maintenanceCost, incidentOpen, costTotal, vendorCount: data.vendors.length };
};

const audit = (data: LogisticsFleetData, actor: string, action: string, entity: string, details: string) => {
  data.auditTrail.unshift({ id: id('aud'), at: new Date().toISOString(), actor, action, entity, details });
};

const value = (record: Record<string, unknown>, key: string) => String(record[key] || '').trim();
const requireFields = (entity: LogisticsEntity, record: Record<string, unknown>, fields: string[]) => {
  const missing = fields.filter((field) => !value(record, field));
  if (missing.length) throw new Error(`${entity} requires ${missing.join(', ')}`);
};

const complianceStatus = (expiryDate: string): ComplianceRecord['status'] => {
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return 'Valid';
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Expiring Soon';
  return 'Valid';
};

export type TripActionContext = {
  actorEmployeeCode?: string;
  permissions?: string[];
  isGlobalAdmin?: boolean;
  reason?: string;
};

const actorMayDriverSupervisor = (context: TripActionContext) => {
  if (context.isGlobalAdmin) return true;
  const permissions = context.permissions || [];
  if (permissions.includes('*') || permissions.includes('fleet.*') || permissions.includes('fleet.approve') || permissions.includes('driver.approve')) {
    return true;
  }
  const code = String(context.actorEmployeeCode || '').trim().toUpperCase();
  if (code && String(process.env.FLEET_DRIVER_SUPERVISOR_CODES || 'L2770')
    .split(/[,;\s]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .includes(code)) {
    return true;
  }
  return false;
};

export type LogisticsFleetMutationResult = Awaited<ReturnType<typeof readLogisticsFleetData>> & {
  mutationMeta?: {
    createdTripId?: string;
  };
};

export const createLogisticsFleetRecord = async (entity: LogisticsEntity, record: Record<string, unknown>, actor = 'System'): Promise<LogisticsFleetMutationResult> => {
  const [rawData, employeeSource] = await Promise.all([readRaw(), readPayrollEmployees()]);
  const data = hydrateDriverLifecycle(normalizeData(rawData), employeeSource.employees);
  const employees = employeeSource.employees.filter(assignableEmployee);
  let createdTripId: string | undefined;
  if (entity === 'vehicle') {
    requireFields(entity, record, ['assetCode', 'plateNumber', 'vehicleType', 'makeModel', 'location', 'custodianEmployeeCode', 'insuranceExpiry']);
    const custodian = findEmployee(employees, value(record, 'custodianEmployeeCode'));
    if (!custodian) throw new Error('vehicle requires a valid custodian from the employee directory');
    const vehicle: FleetVehicle = {
      id: id('veh'),
      assetCode: value(record, 'assetCode'),
      plateNumber: value(record, 'plateNumber'),
      vehicleType: value(record, 'vehicleType'),
      makeModel: value(record, 'makeModel'),
      year: Number(record.year || new Date().getFullYear()),
      department: value(record, 'department') || custodian.department || custodian.businessUnit || 'Operations',
      location: value(record, 'location'),
      custodian: employeeDisplay(custodian),
      status: (record.status as VehicleStatus) || 'Available',
      odometerKm: Number(record.odometerKm || 0),
      nextServiceKm: Number(record.nextServiceKm || 5000),
      insuranceExpiry: value(record, 'insuranceExpiry'),
      roadWorthinessExpiry: value(record, 'roadWorthinessExpiry') || value(record, 'insuranceExpiry'),
      ownershipType: value(record, 'ownershipType') || 'Purchase',
      acquisitionCost: Number(record.acquisitionCost || 0),
      supplier: value(record, 'supplier'),
      purchaseDate: value(record, 'purchaseDate'),
      warrantyExpiry: value(record, 'warrantyExpiry'),
      financingNotes: value(record, 'financingNotes'),
      depreciationMethod: value(record, 'depreciationMethod'),
      disposalDate: value(record, 'disposalDate'),
      chassisNumber: value(record, 'chassisNumber'),
      engineNumber: value(record, 'engineNumber'),
      fuelType: value(record, 'fuelType'),
      costCenter: value(record, 'costCenter'),
      projectCode: value(record, 'projectCode'),
    };
    data.vehicles.unshift(vehicle);
    audit(data, actor, 'Created vehicle', 'Fleet Register', `${vehicle.assetCode} ${vehicle.plateNumber}`);
  }
  if (entity === 'driver') {
    requireFields(entity, record, ['employeeCode', 'licenseNumber', 'licenseClass', 'licenseExpiry', 'issuingAuthority', 'driverCategory']);
    const employee = findEmployee(employees, value(record, 'employeeCode'));
    if (!employee) throw new Error('driver requires a valid employee from the employee directory');
    const employeeCode = employee.employeeCode || employee.employeeId;
    const existing = data.drivers.find((driver) => driver.employeeCode.toLowerCase() === employeeCode.toLowerCase());
    if (existing) {
      existing.licenseNumber = value(record, 'licenseNumber');
      existing.licenseClass = value(record, 'licenseClass');
      existing.licenseExpiry = value(record, 'licenseExpiry');
      existing.issuingAuthority = value(record, 'issuingAuthority');
      existing.medicalCertificateStatus = (value(record, 'medicalCertificateStatus') as FleetDriver['medicalCertificateStatus']) || existing.medicalCertificateStatus || 'Missing';
      existing.defensiveDrivingCertificate = (value(record, 'defensiveDrivingCertificate') as FleetDriver['defensiveDrivingCertificate']) || existing.defensiveDrivingCertificate || 'Missing';
      existing.driverCategory = (value(record, 'driverCategory') as FleetDriver['driverCategory']) || existing.driverCategory || 'Company Driver';
      if (record.safetyScore != null && String(record.safetyScore) !== '') existing.safetyScore = Number(record.safetyScore);
      existing.complianceStatus = driverComplianceStatus(existing);
      existing.approvalStatus = existing.approvalStatus === 'Rejected' ? 'Submitted' : (existing.approvalStatus || 'Submitted');
      if (existing.approvalStatus === 'Approved') {
        existing.status = existing.assignedVehicleId ? 'Assigned' : 'Available';
      } else {
        existing.approvalStatus = 'Submitted';
        existing.status = 'Draft';
      }
      audit(data, actor, 'Updated driver registration', 'Driver Management', employeeDisplay(employee));
    } else {
      ensureNoActiveDriver(data, employeeCode);
      const driver: FleetDriver = {
        id: id('drv'),
        employeeCode,
        licenseNumber: value(record, 'licenseNumber'),
        licenseClass: value(record, 'licenseClass'),
        licenseExpiry: value(record, 'licenseExpiry'),
        issuingAuthority: value(record, 'issuingAuthority'),
        medicalCertificateStatus: (value(record, 'medicalCertificateStatus') as FleetDriver['medicalCertificateStatus']) || 'Missing',
        defensiveDrivingCertificate: (value(record, 'defensiveDrivingCertificate') as FleetDriver['defensiveDrivingCertificate']) || 'Missing',
        driverCategory: (value(record, 'driverCategory') as FleetDriver['driverCategory']) || 'Company Driver',
        availabilityStatus: 'Available',
        assignedVehicleId: '',
        status: 'Draft',
        complianceStatus: 'Missing Documents',
        safetyScore: Number(record.safetyScore || 90),
        registeredAt: new Date().toISOString(),
        approvalStatus: 'Submitted',
      };
      driver.complianceStatus = driverComplianceStatus(driver);
      data.drivers.unshift(driver);
      audit(data, actor, 'Submitted driver registration', 'Driver Management', employeeDisplay(employee));
    }
  }
  if (entity === 'trip') {
    requireFields(entity, record, ['requesterEmployeeCode', 'requesterDepartment', 'requesterLocation', 'origin', 'destination', 'purpose', 'startDate', 'endDate', 'projectCode', 'costCenter']);
    const requester = findEmployee(employees, value(record, 'requesterEmployeeCode'));
    if (!requester) throw new Error('trip requires a valid requester from the employee directory');
    const driverSupervisor = resolveDriverSupervisor(employeeSource.employees)
      || resolveLineManager(employeeSource.employees, requester);
    const asDraft = value(record, 'asDraft') === 'true' || value(record, 'status') === 'Draft';
    const trip: FleetTrip = {
      id: id('trp'),
      requestNo: `TRP-${new Date().getFullYear()}-${String(data.trips.length + 1).padStart(4, '0')}`,
      vehicleId: '',
      driverId: '',
      requester: employeeDisplay(requester),
      requesterEmployeeCode: requester.employeeCode || requester.employeeId,
      requesterDepartment: value(record, 'requesterDepartment') || requester.department || requester.businessUnit || '',
      requesterLocation: value(record, 'requesterLocation') || requester.workLocation || requester.location || '',
      lineManagerEmployeeCode: driverSupervisor?.employeeCode || driverSupervisor?.employeeId || '',
      lineManagerName: driverSupervisor
        ? employeeDisplay(driverSupervisor)
        : (requester.managerName || 'Driver Supervisor'),
      origin: value(record, 'origin'),
      destination: value(record, 'destination'),
      purpose: value(record, 'purpose'),
      startDate: value(record, 'startDate'),
      endDate: value(record, 'endDate'),
      projectCode: value(record, 'projectCode'),
      costCenter: value(record, 'costCenter'),
      status: asDraft ? 'Draft' : 'PendingDriverSupervisor',
    };
    data.trips.unshift(trip);
    createdTripId = trip.id;
    audit(data, actor, asDraft ? 'Saved trip draft' : 'Submitted trip request', 'Trip & Dispatch', `${trip.requestNo}: ${trip.origin} to ${trip.destination}`);
  }
  if (entity === 'maintenance') {
    requireFields(entity, record, ['vehicleId', 'maintenanceType', 'vendor', 'scheduledDate', 'cost']);
    const maintenance: MaintenanceRecord = {
      id: id('mnt'),
      vehicleId: value(record, 'vehicleId'),
      maintenanceType: value(record, 'maintenanceType'),
      vendor: value(record, 'vendor'),
      scheduledDate: value(record, 'scheduledDate'),
      completedDate: '',
      cost: Number(record.cost || 0),
      status: 'Submitted',
      notes: value(record, 'notes'),
    };
    data.maintenance.unshift(maintenance);
    audit(data, actor, 'Created maintenance request', 'Maintenance', maintenance.maintenanceType);
  }
  if (entity === 'fuel') {
    requireFields(entity, record, ['vehicleId', 'driverEmployeeCode', 'date', 'litres', 'amount', 'odometerKm', 'station', 'projectCode']);
    const driverEmployee = findEmployee(employees, value(record, 'driverEmployeeCode'));
    if (!driverEmployee) throw new Error('fuel record requires a valid driver from the employee directory');
    const driverCode = driverEmployee.employeeCode || driverEmployee.employeeId;
    const driverProfile = data.drivers.find((item) => item.employeeCode.toLowerCase() === driverCode.toLowerCase());
    if (driverProfile) assertDriverCanOperate(driverProfile);
    const fuel: FuelRecord = {
      id: id('ful'),
      vehicleId: value(record, 'vehicleId'),
      driverId: driverCode,
      date: value(record, 'date'),
      litres: Number(record.litres || 0),
      amount: Number(record.amount || 0),
      odometerKm: Number(record.odometerKm || 0),
      station: value(record, 'station'),
      projectCode: value(record, 'projectCode'),
    };
    data.fuel.unshift(fuel);
    audit(data, actor, 'Recorded fuel transaction', 'Fuel & Mileage', `${fuel.litres} litres, NGN ${fuel.amount}`);
  }
  if (entity === 'compliance') {
    requireFields(entity, record, ['documentType', 'reference', 'issueDate', 'expiryDate']);
    if (!value(record, 'vehicleId') && !value(record, 'driverEmployeeCode')) throw new Error('compliance requires a vehicle or driver reference');
    const driverEmployee = value(record, 'driverEmployeeCode') ? findEmployee(employees, value(record, 'driverEmployeeCode')) : null;
    if (value(record, 'driverEmployeeCode') && !driverEmployee) throw new Error('compliance requires a valid driver from the employee directory');
    const compliance: ComplianceRecord = {
      id: id('cmp'),
      vehicleId: value(record, 'vehicleId'),
      driverId: driverEmployee ? driverEmployee.employeeCode || driverEmployee.employeeId : undefined,
      documentType: value(record, 'documentType'),
      reference: value(record, 'reference'),
      issueDate: value(record, 'issueDate'),
      expiryDate: value(record, 'expiryDate'),
      status: complianceStatus(value(record, 'expiryDate')),
    };
    data.compliance.unshift(compliance);
    audit(data, actor, 'Added compliance document', 'Compliance & Documents', `${compliance.documentType} ${compliance.reference}`);
  }
  if (entity === 'request') {
    requireFields(entity, record, ['requestType', 'requesterEmployeeCode', 'details', 'priority']);
    const requester = findEmployee(employees, value(record, 'requesterEmployeeCode'));
    if (!requester) throw new Error('request requires a valid requester from the employee directory');
    const request: FleetRequest = {
      id: id('req'),
      requestType: value(record, 'requestType'),
      requester: employeeDisplay(requester),
      department: value(record, 'department') || requester.department || requester.businessUnit || '',
      details: value(record, 'details'),
      priority: (record.priority as FleetRequest['priority']) || 'Normal',
      status: 'Submitted',
      createdAt: new Date().toISOString(),
    };
    data.requests.unshift(request);
    audit(data, actor, 'Submitted fleet request', 'Requests & Approvals', request.requestType);
  }
  if (entity === 'incident') {
    requireFields(entity, record, ['incidentType', 'severity', 'occurredAt', 'description']);
    const incident: FleetIncident = {
      id: id('inc'),
      reference: `INC-${new Date().getFullYear()}-${String(data.incidents.length + 1).padStart(4, '0')}`,
      vehicleId: value(record, 'vehicleId'),
      driverId: value(record, 'driverEmployeeCode') || value(record, 'driverId'),
      incidentType: value(record, 'incidentType'),
      severity: (value(record, 'severity') as FleetIncident['severity']) || 'Medium',
      occurredAt: value(record, 'occurredAt'),
      location: value(record, 'location'),
      description: value(record, 'description'),
      claimStatus: (value(record, 'claimStatus') as FleetIncident['claimStatus']) || 'Open',
      status: 'Submitted',
    };
    data.incidents.unshift(incident);
    audit(data, actor, 'Logged incident', 'Incidents & Claims', `${incident.reference}: ${incident.incidentType}`);
  }
  if (entity === 'vendor') {
    requireFields(entity, record, ['name', 'category']);
    const vendor: FleetVendor = {
      id: id('vnd'),
      name: value(record, 'name'),
      category: value(record, 'category'),
      contactName: value(record, 'contactName'),
      email: value(record, 'email'),
      phone: value(record, 'phone'),
      location: value(record, 'location'),
      status: (value(record, 'status') as FleetVendor['status']) || 'Active',
      rating: Number(record.rating || 0),
    };
    data.vendors.unshift(vendor);
    audit(data, actor, 'Added vendor', 'Vendors & Contracts', vendor.name);
  }
  if (entity === 'contract') {
    requireFields(entity, record, ['title', 'contractType', 'startDate', 'endDate', 'value']);
    const contract: FleetContract = {
      id: id('ctr'),
      vendorId: value(record, 'vendorId'),
      title: value(record, 'title'),
      contractType: value(record, 'contractType'),
      startDate: value(record, 'startDate'),
      endDate: value(record, 'endDate'),
      value: Number(record.value || 0),
      status: (value(record, 'status') as FleetContract['status']) || 'Active',
      notes: value(record, 'notes'),
    };
    data.contracts.unshift(contract);
    audit(data, actor, 'Created contract', 'Vendors & Contracts', contract.title);
  }
  if (entity === 'telematics') {
    requireFields(entity, record, ['vehicleId', 'eventType', 'occurredAt']);
    const event: FleetTelematicsEvent = {
      id: id('tel'),
      vehicleId: value(record, 'vehicleId'),
      eventType: value(record, 'eventType'),
      severity: (value(record, 'severity') as FleetTelematicsEvent['severity']) || 'Info',
      occurredAt: value(record, 'occurredAt'),
      latitude: record.latitude != null ? Number(record.latitude) : undefined,
      longitude: record.longitude != null ? Number(record.longitude) : undefined,
      speedKph: record.speedKph != null ? Number(record.speedKph) : undefined,
      details: value(record, 'details'),
    };
    data.telematics.unshift(event);
    audit(data, actor, 'Recorded telematics event', 'Telematics', `${event.eventType} · ${event.vehicleId}`);
  }
  if (entity === 'cost') {
    requireFields(entity, record, ['category', 'costDate', 'amount']);
    const cost: FleetCostEntry = {
      id: id('cst'),
      vehicleId: value(record, 'vehicleId'),
      category: value(record, 'category'),
      costDate: value(record, 'costDate'),
      amount: Number(record.amount || 0),
      costCenter: value(record, 'costCenter'),
      projectCode: value(record, 'projectCode'),
      notes: value(record, 'notes'),
      createdBy: actor,
    };
    data.costs.unshift(cost);
    audit(data, actor, 'Posted cost entry', 'Costs & Budgets', `${cost.category} · NGN ${cost.amount}`);
  }
  await writeLogisticsFleetData(data);
  const refreshed = await readLogisticsFleetData();
  return createdTripId ? { ...refreshed, mutationMeta: { createdTripId } } : refreshed;
};

export const updateLogisticsFleetRecord = async (entity: 'vehicle' | 'driver', recordId: string, record: Record<string, unknown>, actor = 'System') => {
  const [rawData, employeeSource] = await Promise.all([readRaw(), readPayrollEmployees()]);
  const data = hydrateDriverLifecycle(normalizeData(rawData), employeeSource.employees);
  if (entity === 'driver') {
    const driver = data.drivers.find((item) => item.id === recordId);
    if (!driver) throw new Error('Driver not found');
    if (value(record, 'licenseNumber')) driver.licenseNumber = value(record, 'licenseNumber');
    if (value(record, 'licenseClass')) driver.licenseClass = value(record, 'licenseClass');
    if (value(record, 'licenseExpiry')) driver.licenseExpiry = value(record, 'licenseExpiry');
    if (value(record, 'issuingAuthority')) driver.issuingAuthority = value(record, 'issuingAuthority');
    if (value(record, 'driverCategory')) driver.driverCategory = value(record, 'driverCategory') as FleetDriver['driverCategory'];
    if (value(record, 'medicalCertificateStatus')) driver.medicalCertificateStatus = value(record, 'medicalCertificateStatus') as FleetDriver['medicalCertificateStatus'];
    if (value(record, 'defensiveDrivingCertificate')) driver.defensiveDrivingCertificate = value(record, 'defensiveDrivingCertificate') as FleetDriver['defensiveDrivingCertificate'];
    if (value(record, 'availabilityStatus')) driver.availabilityStatus = value(record, 'availabilityStatus') as FleetDriver['availabilityStatus'];
    if (record.safetyScore != null && String(record.safetyScore) !== '') driver.safetyScore = Number(record.safetyScore);
    driver.complianceStatus = driverComplianceStatus(driver);
    if (driver.approvalStatus === 'Approved' && !['Suspended', 'Inactive'].includes(driver.status)) {
      driver.status = deriveDriverStatus(driver, findEmployee(employeeSource.employees, driver.employeeCode), data.trips);
    }
    audit(data, actor, 'Updated driver profile', 'Driver Management', `${driver.employeeCode}: licence/fitness fields`);
    await writeLogisticsFleetData(data);
    return readLogisticsFleetData();
  }
  if (entity !== 'vehicle') throw new Error('Unsupported update entity');
  const vehicle = data.vehicles.find((item) => item.id === recordId);
  if (!vehicle) throw new Error('Vehicle not found');
  if (value(record, 'location')) vehicle.location = value(record, 'location');
  if (value(record, 'department')) vehicle.department = value(record, 'department');
  if (value(record, 'status')) vehicle.status = value(record, 'status') as VehicleStatus;
  if (value(record, 'ownershipType')) vehicle.ownershipType = value(record, 'ownershipType');
  if (record.acquisitionCost != null && String(record.acquisitionCost) !== '') vehicle.acquisitionCost = Number(record.acquisitionCost);
  if (value(record, 'supplier')) vehicle.supplier = value(record, 'supplier');
  if (value(record, 'purchaseDate')) vehicle.purchaseDate = value(record, 'purchaseDate');
  if (value(record, 'warrantyExpiry')) vehicle.warrantyExpiry = value(record, 'warrantyExpiry');
  if (record.financingNotes != null) vehicle.financingNotes = value(record, 'financingNotes');
  if (value(record, 'depreciationMethod')) vehicle.depreciationMethod = value(record, 'depreciationMethod');
  if (value(record, 'disposalDate')) vehicle.disposalDate = value(record, 'disposalDate');
  if (value(record, 'chassisNumber')) vehicle.chassisNumber = value(record, 'chassisNumber');
  if (value(record, 'engineNumber')) vehicle.engineNumber = value(record, 'engineNumber');
  if (value(record, 'fuelType')) vehicle.fuelType = value(record, 'fuelType');
  if (value(record, 'costCenter')) vehicle.costCenter = value(record, 'costCenter');
  if (value(record, 'projectCode')) vehicle.projectCode = value(record, 'projectCode');
  if (record.odometerKm != null && String(record.odometerKm) !== '') vehicle.odometerKm = Number(record.odometerKm);
  if (record.nextServiceKm != null && String(record.nextServiceKm) !== '') vehicle.nextServiceKm = Number(record.nextServiceKm);
  if (value(record, 'custodianEmployeeCode')) {
    const custodian = findEmployee(employeeSource.employees.filter(assignableEmployee), value(record, 'custodianEmployeeCode'));
    if (!custodian) throw new Error('vehicle requires a valid custodian from the employee directory');
    vehicle.custodian = employeeDisplay(custodian);
    if (!value(record, 'department')) vehicle.department = custodian.department || custodian.businessUnit || vehicle.department;
  }
  audit(data, actor, 'Updated vehicle', 'Fleet Register', `${vehicle.assetCode}: ownership/assignment fields`);
  await writeLogisticsFleetData(data);
  return readLogisticsFleetData();
};

export const updateFleetWorkflow = async (entity: 'driver' | 'trip' | 'maintenance' | 'request' | 'incident', recordId: string, action: 'approve' | 'reject' | 'close' | 'dispatch' | 'complete' | 'request-correction' | 'escalate', actor = 'System', context: TripActionContext = {}) => {
  if (entity === 'trip') {
    const mapped =
      action === 'approve' ? 'allocate-trip'
      : action === 'reject' ? 'reject-line'
      : action === 'request-correction' ? 'return-trip'
      : action === 'dispatch' ? 'dispatch-trip'
      : action === 'complete' ? 'complete-trip'
      : action === 'close' ? 'cancel-trip'
      : null;
    if (!mapped) throw new Error('Unsupported trip workflow action. Use trip workflow actions instead.');
    if (mapped === 'allocate-trip') {
      throw new Error('Driver Supervisor must select vehicle and driver, then use Approve & allocate.');
    }
    return performTripWorkflow(mapped, { tripId: recordId, reason: context.reason }, actor, context);
  }
  const rawData = await readRaw();
  const employeeSource = await readPayrollEmployees();
  const data = hydrateDriverLifecycle(normalizeData(rawData), employeeSource.employees);
  if (entity === 'driver') {
    const driver = data.drivers.find((item) => item.id === recordId);
    if (!driver) throw new Error('Record not found');
    if (action === 'approve') {
      assertDriverCanOperate(driver);
      driver.approvalStatus = 'Approved';
      driver.status = driver.assignedVehicleId ? 'Assigned' : 'Available';
    } else if (action === 'reject') {
      driver.approvalStatus = 'Rejected';
      driver.status = 'Inactive';
    } else if (action === 'request-correction') {
      driver.approvalStatus = 'Draft';
    } else if (action === 'escalate') {
      audit(data, actor, 'Escalated driver registration', 'Driver Management', recordId);
      await writeLogisticsFleetData(data);
      return readLogisticsFleetData();
    } else {
      throw new Error('Unsupported driver workflow action');
    }
    audit(data, actor, `${action} driver registration`, 'Driver Management', recordId);
    await writeLogisticsFleetData(data);
    return readLogisticsFleetData();
  }
  if (entity === 'incident') {
    const incident = data.incidents.find((item) => item.id === recordId);
    if (!incident) throw new Error('Record not found');
    const statusMap: Record<'approve' | 'reject' | 'close' | 'dispatch' | 'complete', string> = { approve: 'Approved', reject: 'Rejected', close: 'Closed', dispatch: 'Investigating', complete: 'Closed' };
    if (action === 'request-correction' || action === 'escalate') {
      audit(data, actor, `${action} incident`, 'Incidents & Claims', recordId);
    } else {
      incident.status = statusMap[action] as FleetIncident['status'];
      if (action === 'close' || action === 'complete') incident.claimStatus = 'Closed';
      audit(data, actor, `${action} incident`, 'Incidents & Claims', recordId);
    }
    await writeLogisticsFleetData(data);
    return readLogisticsFleetData();
  }
  const collection = entity === 'maintenance' ? data.maintenance : data.requests;
  const record = collection.find((item) => item.id === recordId);
  if (!record) throw new Error('Record not found');
  if (action === 'request-correction' || action === 'escalate') {
    audit(data, actor, `${action} workflow`, entity, recordId);
    await writeLogisticsFleetData(data);
    return readLogisticsFleetData();
  }
  const statusMap: Record<'approve' | 'reject' | 'close' | 'dispatch' | 'complete', string> = { approve: 'Approved', reject: 'Rejected', close: 'Closed', dispatch: 'Dispatched', complete: 'Completed' };
  record.status = statusMap[action] as never;
  audit(data, actor, `${action} workflow`, entity, recordId);
  await writeLogisticsFleetData(data);
  return readLogisticsFleetData();
};

export const performTripWorkflow = async (
  action: import('@/lib/fleet-management/trip-workflow').TripWorkflowAction,
  payload: Record<string, unknown>,
  actor = 'System',
  context: TripActionContext = {},
) => {
  const rawData = await readRaw();
  const employeeSource = await readPayrollEmployees();
  const data = hydrateDriverLifecycle(normalizeData(rawData), employeeSource.employees);
  const tripId = value(payload, 'tripId') || value(payload, 'id');
  const trip = data.trips.find((item) => item.id === tripId);
  if (!trip) throw new Error('Trip request not found');
  trip.status = migrateLegacyTripStatus(trip.status);
  const now = new Date().toISOString();
  const reason = value(payload, 'reason') || context.reason || '';

  if (action === 'submit-trip') {
    if (!['Draft', 'Returned'].includes(trip.status)) throw new Error('Only draft or returned trips can be submitted');
    trip.status = 'PendingDriverSupervisor';
    trip.returnReason = undefined;
    audit(data, actor, 'Submitted trip request for Driver Supervisor', 'Trip & Dispatch', trip.requestNo);
  } else if (action === 'approve-line') {
    throw new Error('Driver Supervisor must approve and allocate vehicle & driver together. Use Allocate & Approve.');
  } else if (action === 'reject-line') {
    if (!isPendingDriverSupervisor(trip.status)) throw new Error('Trip is not awaiting Driver Supervisor review');
    if (!actorMayDriverSupervisor(context)) throw new Error('Only a Driver Supervisor or fleet approver can reject this trip');
    trip.status = 'Rejected';
    trip.lineRejectReason = reason || 'Rejected by Driver Supervisor';
    trip.lineApprovedBy = actor;
    trip.lineApprovedAt = now;
    audit(data, actor, 'Driver Supervisor rejected trip', 'Trip & Dispatch', `${trip.requestNo}: ${trip.lineRejectReason}`);
  } else if (action === 'return-trip') {
    if (!isPendingDriverSupervisor(trip.status)) throw new Error('Trip cannot be returned at this stage');
    if (!actorMayDriverSupervisor(context)) throw new Error('Only a Driver Supervisor or fleet approver can return this trip');
    trip.status = 'Returned';
    trip.returnReason = reason || 'Returned for correction';
    audit(data, actor, 'Driver Supervisor returned trip for correction', 'Trip & Dispatch', `${trip.requestNo}: ${trip.returnReason}`);
  } else if (action === 'allocate-trip') {
    if (!isPendingDriverSupervisor(trip.status)) {
      throw new Error('Trip is not awaiting Driver Supervisor approval and allocation');
    }
    if (!actorMayDriverSupervisor(context)) throw new Error('Only a Driver Supervisor or fleet approver can approve and allocate this trip');
    const vehicle = data.vehicles.find((item) => item.id === value(payload, 'vehicleId'));
    if (!vehicle) throw new Error('Select a vehicle for allocation');
    const driverEmployee = findEmployee(employeeSource.employees.filter(assignableEmployee), value(payload, 'driverEmployeeCode'));
    if (!driverEmployee) throw new Error('Select a valid active employee as driver');
    const driverCode = driverEmployee.employeeCode || driverEmployee.employeeId;
    const driverProfile = data.drivers.find((item) => item.employeeCode.toLowerCase() === driverCode.toLowerCase());
    if (driverProfile) assertDriverCanOperate(driverProfile);
    if (data.trips.some((item) => item.id !== trip.id && [driverCode, driverProfile?.id].filter(Boolean).includes(item.driverId) && isActiveOperationalTrip(item.status))) {
      throw new Error('Driver already has an active trip');
    }
    assertVehicleAvailable(data, vehicle.id, driverProfile?.id || driverCode);

    // Bind operational assignment for the trip period.
    if (driverProfile) {
      const previousVehicleId = driverProfile.assignedVehicleId;
      if (previousVehicleId && previousVehicleId !== vehicle.id) {
        const oldVehicle = data.vehicles.find((item) => item.id === previousVehicleId);
        if (oldVehicle && !data.drivers.some((item) => item.id !== driverProfile.id && item.assignedVehicleId === oldVehicle.id)) {
          oldVehicle.status = 'Available';
        }
      }
      driverProfile.assignedVehicleId = vehicle.id;
      driverProfile.availabilityStatus = 'Assigned';
      driverProfile.status = 'Assigned';
      data.assignmentHistory.unshift({
        id: id('asg'),
        driverId: driverProfile.id,
        vehicleId: vehicle.id,
        action: previousVehicleId && previousVehicleId !== vehicle.id ? 'Reassigned' : 'Assigned',
        effectiveDate: now,
        reason: `Trip allocation ${trip.requestNo}`,
        performedBy: actor,
      });
    }
    vehicle.status = 'Assigned';

    trip.vehicleId = vehicle.id;
    trip.driverId = driverCode;
    trip.status = 'ReadyToDispatch';
    trip.lineApprovedBy = actor;
    trip.lineApprovedAt = now;
    trip.approvedBy = actor;
    trip.allocatedBy = actor;
    trip.allocatedAt = now;
    trip.lineRejectReason = undefined;
    trip.returnReason = undefined;
    audit(data, actor, 'Driver Supervisor approved and allocated trip', 'Trip & Dispatch', `${trip.requestNo}: ${vehicle.assetCode} / ${employeeDisplay(driverEmployee)} → ${trip.destination}`);
  } else if (action === 'dispatch-trip') {
    if (trip.status !== 'ReadyToDispatch') throw new Error('Trip must be allocated before dispatch');
    if (!trip.vehicleId || !trip.driverId) throw new Error('Allocate vehicle and driver before dispatch');
    trip.status = 'Dispatched';
    trip.dispatchedBy = actor;
    trip.dispatchedAt = now;
    audit(data, actor, 'Dispatched trip', 'Trip & Dispatch', trip.requestNo);
  } else if (action === 'start-trip') {
    if (trip.status !== 'Dispatched') throw new Error('Only dispatched trips can be marked in progress');
    trip.status = 'InProgress';
    audit(data, actor, 'Trip departed / in progress', 'Trip & Dispatch', trip.requestNo);
  } else if (action === 'complete-trip') {
    if (!['Dispatched', 'InProgress'].includes(trip.status)) throw new Error('Only dispatched or in-progress trips can be completed');
    trip.status = 'Completed';
    trip.completedBy = actor;
    trip.completedAt = now;
    audit(data, actor, 'Completed trip', 'Trip & Dispatch', trip.requestNo);
  } else if (action === 'cancel-trip') {
    if (['Dispatched', 'InProgress', 'Completed', 'Cancelled'].includes(trip.status)) throw new Error('Trip can no longer be cancelled');
    trip.status = 'Cancelled';
    trip.cancelReason = reason || 'Cancelled';
    audit(data, actor, 'Cancelled trip', 'Trip & Dispatch', `${trip.requestNo}: ${trip.cancelReason}`);
  } else {
    throw new Error('Unsupported trip workflow action');
  }

  await writeLogisticsFleetData(data);
  return readLogisticsFleetData();
};

export const performFleetAction = async (
  action: 'assign-vehicle' | 'reassign-vehicle' | 'unassign-vehicle' | 'suspend-driver' | 'reactivate-driver' | 'verify-document' | 'reject-document' | 'assign-trip-driver',
  payload: Record<string, unknown>,
  actor = 'System',
  context: TripActionContext = {},
) => {
  if (action === 'assign-trip-driver') {
    return performTripWorkflow('allocate-trip', {
      tripId: value(payload, 'tripId'),
      vehicleId: value(payload, 'vehicleId'),
      driverEmployeeCode: value(payload, 'driverEmployeeCode'),
    }, actor, context);
  }
  const rawData = await readRaw();
  const employeeSource = await readPayrollEmployees();
  const data = hydrateDriverLifecycle(normalizeData(rawData), employeeSource.employees);
  if (action === 'assign-vehicle' || action === 'reassign-vehicle') {
    const driver = data.drivers.find((item) => item.id === value(payload, 'driverId'));
    if (!driver) throw new Error('Driver not found');
    assertDriverCanOperate(driver);
    const vehicle = assertVehicleAvailable(data, value(payload, 'vehicleId'), driver.id);
    const previousVehicleId = driver.assignedVehicleId;
    driver.assignedVehicleId = vehicle.id;
    driver.availabilityStatus = 'Assigned';
    driver.status = 'Assigned';
    vehicle.status = 'Assigned';
    if (previousVehicleId && previousVehicleId !== vehicle.id) {
      const oldVehicle = data.vehicles.find((item) => item.id === previousVehicleId);
      if (oldVehicle && !data.drivers.some((item) => item.id !== driver.id && item.assignedVehicleId === oldVehicle.id)) oldVehicle.status = 'Available';
    }
    data.assignmentHistory.unshift({
      id: id('asg'),
      driverId: driver.id,
      vehicleId: vehicle.id,
      action: previousVehicleId ? 'Reassigned' : 'Assigned',
      effectiveDate: new Date().toISOString(),
      reason: value(payload, 'reason') || 'Operational assignment',
      performedBy: actor,
    });
    audit(data, actor, previousVehicleId ? 'Reassigned vehicle' : 'Assigned vehicle', 'Vehicle Assignment', `${driver.employeeCode} -> ${vehicle.assetCode}`);
  }
  if (action === 'unassign-vehicle') {
    const driver = data.drivers.find((item) => item.id === value(payload, 'driverId'));
    if (!driver) throw new Error('Driver not found');
    const previousVehicleId = driver.assignedVehicleId;
    if (!previousVehicleId) throw new Error('Driver has no active vehicle assignment');
    driver.assignedVehicleId = '';
    driver.availabilityStatus = 'Available';
    driver.status = driver.approvalStatus === 'Approved' ? 'Available' : 'Draft';
    const vehicle = data.vehicles.find((item) => item.id === previousVehicleId);
    if (vehicle && !data.drivers.some((item) => item.assignedVehicleId === vehicle.id)) vehicle.status = 'Available';
    data.assignmentHistory.unshift({ id: id('asg'), driverId: driver.id, vehicleId: previousVehicleId, action: 'Unassigned', effectiveDate: new Date().toISOString(), endedAt: new Date().toISOString(), reason: value(payload, 'reason') || 'Assignment ended', performedBy: actor });
    audit(data, actor, 'Unassigned vehicle', 'Vehicle Assignment', driver.employeeCode);
  }
  if (action === 'suspend-driver' || action === 'reactivate-driver') {
    const driver = data.drivers.find((item) => item.id === value(payload, 'driverId'));
    if (!driver) throw new Error('Driver not found');
    if (action === 'suspend-driver') {
      driver.status = 'Suspended';
      driver.availabilityStatus = 'Suspended';
    } else {
      driver.availabilityStatus = driver.assignedVehicleId ? 'Assigned' : 'Available';
      driver.status = driver.assignedVehicleId ? 'Assigned' : 'Available';
    }
    audit(data, actor, action === 'suspend-driver' ? 'Suspended driver' : 'Reactivated driver', 'Driver Management', `${driver.employeeCode}: ${value(payload, 'reason')}`);
  }
  if (action === 'verify-document' || action === 'reject-document') {
    const document = data.compliance.find((item) => item.id === value(payload, 'documentId'));
    if (!document) throw new Error('Compliance document not found');
    if (action === 'verify-document') {
      document.verifiedBy = actor;
      document.verifiedAt = new Date().toISOString();
      document.status = complianceStatus(document.expiryDate);
    } else {
      document.rejectionReason = value(payload, 'reason') || 'Rejected during compliance review';
      document.status = 'Expired';
    }
    audit(data, actor, action === 'verify-document' ? 'Verified compliance document' : 'Rejected compliance document', 'Compliance & Documents', document.reference);
  }
  await writeLogisticsFleetData(data);
  return readLogisticsFleetData();
};
