'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Database, Plus } from 'lucide-react';
import { FleetPortalShell } from './fleet-portal-shell';
import {
  ActionChip,
  EmployeePicker,
  Field,
  FormPanel,
  TextInput,
  TextSelect,
  TextTextArea,
  type EmployeeOption,
} from './fleet-form-panel';
import {
  FLEET_WORKSPACE_META,
  fleetTabFromQuery,
  resolveFleetWorkspace,
  type FleetWorkspaceId,
} from '@/lib/fleet-management/nav';
import { TRIP_STATUS_STEPS, tripStepperIndex } from '@/lib/fleet-management/trip-workflow';

type Vehicle = {
  id: string;
  assetCode: string;
  plateNumber: string;
  vehicleType: string;
  makeModel: string;
  department: string;
  location: string;
  status: string;
  odometerKm: number;
  nextServiceKm: number;
  insuranceExpiry: string;
  roadWorthinessExpiry: string;
  custodian?: string;
  ownershipType?: string;
  acquisitionCost?: number;
  supplier?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  financingNotes?: string;
  depreciationMethod?: string;
  disposalDate?: string;
  chassisNumber?: string;
  engineNumber?: string;
  fuelType?: string;
  costCenter?: string;
  projectCode?: string;
  year?: number;
};
type Driver = {
  id: string;
  employeeCode: string;
  licenseNumber: string;
  licenseClass: string;
  licenseExpiry: string;
  issuingAuthority?: string;
  medicalCertificateStatus?: string;
  defensiveDrivingCertificate?: string;
  availabilityStatus: string;
  assignedVehicleId: string;
  status: string;
  complianceStatus: string;
  safetyScore: number;
  approvalStatus?: string;
  driverCategory?: string;
  registeredAt?: string;
};
type Trip = {
  id: string;
  requestNo: string;
  vehicleId: string;
  driverId: string;
  requester: string;
  requesterEmployeeCode?: string;
  lineManagerEmployeeCode?: string;
  lineManagerName?: string;
  origin: string;
  destination: string;
  purpose: string;
  status: string;
  startDate?: string;
  endDate?: string;
  lineApprovedBy?: string;
  allocatedBy?: string;
  dispatchedBy?: string;
  returnReason?: string;
  lineRejectReason?: string;
  cancelReason?: string;
};
type Maintenance = { id: string; vehicleId: string; maintenanceType: string; vendor: string; scheduledDate: string; cost: number; status: string; notes: string };
type FuelRecord = { id: string; vehicleId: string; date: string; litres: number; amount: number; odometerKm: number; station: string; driverId?: string };
type Compliance = { id: string; vehicleId: string; documentType: string; reference: string; expiryDate: string; status: string; driverId?: string };
type FleetRequest = { id: string; requestType: string; requester: string; details: string; priority: string; status: string; createdAt: string };
type Incident = { id: string; reference: string; vehicleId: string; incidentType: string; severity: string; occurredAt: string; location: string; status: string; claimStatus: string; description: string };
type Vendor = { id: string; name: string; category: string; contactName: string; phone: string; status: string; rating: number; location: string };
type Contract = { id: string; vendorId: string; title: string; contractType: string; startDate: string; endDate: string; value: number; status: string };
type Telematics = { id: string; vehicleId: string; eventType: string; severity: string; occurredAt: string; details: string; speedKph?: number };
type CostEntry = { id: string; vehicleId: string; category: string; costDate: string; amount: number; costCenter: string; projectCode: string; notes: string };
type Assignment = { id: string; driverId: string; vehicleId: string; action: string; effectiveDate: string; reason: string; performedBy: string };
type Audit = { id: string; at: string; actor: string; action: string; entity: string; details: string };

type Payload = {
  generatedAt: string;
  source?: string;
  employees: EmployeeOption[];
  driverEmployees?: EmployeeOption[];
  locations?: string[];
  departments?: string[];
  vehicles: Vehicle[];
  drivers: Driver[];
  trips: Trip[];
  maintenance: Maintenance[];
  fuel: FuelRecord[];
  compliance: Compliance[];
  requests: FleetRequest[];
  incidents?: Incident[];
  vendors?: Vendor[];
  contracts?: Contract[];
  telematics?: Telematics[];
  costs?: CostEntry[];
  assignmentHistory?: Assignment[];
  auditTrail?: Audit[];
  summary: {
    activeVehicles: number;
    availableVehicles: number;
    openTrips: number;
    pendingApprovals: number;
    expiringDocs: number;
    fuelSpend: number;
    maintenanceCost: number;
    incidentOpen?: number;
    costTotal?: number;
    vendorCount?: number;
  };
};

const money = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value || 0);
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const tone = (value: string) => {
  const status = value.toLowerCase();
  if (status.includes('approved') || status.includes('available') || status.includes('valid') || status.includes('completed') || status.includes('active') || status.includes('settled') || status.includes('readytodispatch') || status === 'ready to dispatch') return 'bg-emerald-100 text-emerald-800';
  if (status.includes('reject') || status.includes('expired') || status.includes('ground') || status.includes('suspend') || status.includes('critical') || status.includes('cancel')) return 'bg-red-100 text-red-800';
  if (status.includes('submitted') || status.includes('soon') || status.includes('maintenance') || status.includes('pending') || status.includes('investigat') || status.includes('returned') || status.includes('draft') || status.includes('dispatch')) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
};

function TripStepper({ status }: { status: string }) {
  const active = tripStepperIndex(status);
  if (active < 0) {
    return <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(status)}`}>{status}</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {TRIP_STATUS_STEPS.map((step, index) => (
        <span
          key={step.label}
          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
            index < active ? 'bg-emerald-100 text-emerald-800' : index === active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {step.label}
        </span>
      ))}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p> : null}
    </div>
  );
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) {
    return <p className="text-sm font-semibold text-slate-500">No records in this view yet. Use the primary action to create the first record in DLE_Enterprise.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-black uppercase text-slate-500">
            {columns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-50 align-top">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 font-semibold text-slate-700">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const entityForWorkspace = (workspace: FleetWorkspaceId): string | null => {
  const map: Partial<Record<FleetWorkspaceId, string>> = {
    vehicles: 'vehicle',
    drivers: 'driver',
    'trips-dispatch': 'trip',
    fuel: 'fuel',
    maintenance: 'maintenance',
    'inspections-compliance': 'compliance',
    allocations: 'request',
    incidents: 'incident',
    'vendors-contracts': 'vendor',
    telematics: 'telematics',
    'costs-budgets': 'cost',
    administration: 'request',
  };
  return map[workspace] || null;
};

export function FleetWorkspaceClient({ workspaceSlug }: { workspaceSlug?: string }) {
  const workspace = resolveFleetWorkspace(workspaceSlug);
  const meta = FLEET_WORKSPACE_META[workspace];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = fleetTabFromQuery(workspace, searchParams.get('tab'));
  const focusTripId = String(searchParams.get('tripId') || '').trim();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formErrorSummary, setFormErrorSummary] = useState('');
  const [employee, setEmployee] = useState<{ fullName?: string; jobTitle?: string; employeeCode?: string; department?: string }>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [assignState, setAssignState] = useState<Record<string, { vehicleId: string; driverEmployeeCode: string }>>({});
  const [editingVehicleId, setEditingVehicleId] = useState('');
  const [editingDriverId, setEditingDriverId] = useState('');

  const applyPayload = (data: Payload) => {
    setPayload(data);
    setNotice(`Synced with ${data.source || 'DLE_Enterprise'} · ${new Date(data.generatedAt).toLocaleString('en-GB')}`);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [fleetRes, userRes] = await Promise.all([
        fetch('/api/logistics-fleet', { cache: 'no-store' }),
        fetch('/api/current-user?context=enterprise', { cache: 'no-store' }),
      ]);
      const fleetJson = await fleetRes.json();
      if (!fleetRes.ok || fleetJson.status !== 'success') throw new Error(fleetJson.error || 'Unable to load fleet data');
      applyPayload(fleetJson.data);
      const userJson = userRes.ok ? await userRes.json() : null;
      setEmployee({
        fullName: userJson?.data?.name,
        jobTitle: userJson?.data?.jobTitle || userJson?.data?.role,
        employeeCode: userJson?.data?.employeeCode,
        department: userJson?.data?.department,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load fleet data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setTab = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);
    router.replace(`${pathname}?${params.toString()}`);
    setMoreOpen(false);
  };

  const setField = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormErrorSummary('');
  };

  const validateTripForm = (record: Record<string, string>) => {
    const errors: Record<string, string> = {};
    const required: Array<[string, string]> = [
      ['requesterEmployeeCode', 'Select the requester'],
      ['requesterDepartment', 'Select a department'],
      ['requesterLocation', 'Select a location'],
      ['origin', 'Enter the trip origin'],
      ['destination', 'Enter the destination'],
      ['startDate', 'Select a start date'],
      ['endDate', 'Select an end date'],
      ['projectCode', 'Enter a project code'],
      ['costCenter', 'Enter a cost centre'],
      ['purpose', 'Enter the trip purpose'],
    ];
    for (const [key, message] of required) {
      if (!String(record[key] || '').trim()) errors[key] = message;
    }
    const start = String(record.startDate || '').trim();
    const end = String(record.endDate || '').trim();
    if (start && end && end < start) {
      errors.endDate = 'End date must be on or after the start date';
    }
    if (String(record.origin || '').trim() && String(record.destination || '').trim()
      && String(record.origin).trim().toLowerCase() === String(record.destination).trim().toLowerCase()) {
      errors.destination = 'Destination must be different from origin';
    }
    return errors;
  };

  const postJson = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/logistics-fleet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok || json.status !== 'success') throw new Error(json.error || 'Save failed');
      applyPayload(json.data);
      setFormOpen(false);
      setForm({});
      setFormErrors({});
      setFormErrorSummary('');
      setEditingVehicleId('');
      setEditingDriverId('');
      return json.data as Payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save to DLE_Enterprise');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditingVehicleId('');
    setEditingDriverId('');
    setFormErrors({});
    setFormErrorSummary('');
    const defaults: Record<string, string> = {};
    if (employee.employeeCode) {
      if (workspace === 'trips-dispatch') {
        defaults.requesterEmployeeCode = employee.employeeCode;
        defaults.requesterDepartment = employee.department || '';
        const match = (payload?.employees || []).find((item) => item.employeeCode === employee.employeeCode);
        defaults.requesterLocation = match?.location || '';
      }
      if (workspace === 'fuel' || workspace === 'inspections-compliance') defaults.driverEmployeeCode = employee.employeeCode;
      if (workspace === 'allocations' || workspace === 'administration') defaults.requesterEmployeeCode = employee.employeeCode;
    }
    defaults.date = new Date().toISOString().slice(0, 10);
    defaults.costDate = defaults.date;
    defaults.occurredAt = new Date().toISOString().slice(0, 16);
    defaults.startDate = defaults.date;
    defaults.endDate = defaults.date;
    defaults.scheduledDate = defaults.date;
    defaults.issueDate = defaults.date;
    defaults.insuranceExpiry = defaults.date;
    defaults.licenseExpiry = defaults.date;
    defaults.priority = 'Normal';
    defaults.severity = 'Medium';
    defaults.status = 'Active';
    defaults.medicalCertificateStatus = 'Valid';
    defaults.defensiveDrivingCertificate = 'Valid';
    defaults.driverCategory = 'Company Driver';
    defaults.year = String(new Date().getFullYear());
    setForm(defaults);
    setFormOpen(true);
  };

  const saveCreate = async () => {
    if (workspace === 'trips-dispatch' && !editingVehicleId && !editingDriverId) {
      const errors = validateTripForm(form);
      if (Object.keys(errors).length) {
        setFormErrors(errors);
        setFormErrorSummary(`Complete the required trip fields before saving (${Object.keys(errors).length} remaining).`);
        setError('');
        return;
      }
    }
    if (editingVehicleId) {
      await postJson({ action: 'update-record', entity: 'vehicle', id: editingVehicleId, record: form });
      setEditingVehicleId('');
      return;
    }
    if (editingDriverId) {
      await postJson({ action: 'update-record', entity: 'driver', id: editingDriverId, record: form });
      setEditingDriverId('');
      return;
    }
    const entity = entityForWorkspace(workspace);
    if (!entity) return;
    if (workspace === 'vendors-contracts' && activeTab === 'contracts') {
      await postJson({ entity: 'contract', record: form });
      return;
    }
    await postJson({ entity, record: form });
  };

  const openOwnershipEdit = (vehicle: Vehicle) => {
    setEditingDriverId('');
    setEditingVehicleId(vehicle.id);
    setForm({
      location: vehicle.location || '',
      department: vehicle.department || '',
      ownershipType: vehicle.ownershipType || 'Purchase',
      acquisitionCost: String(vehicle.acquisitionCost || ''),
      supplier: vehicle.supplier || '',
      purchaseDate: (vehicle.purchaseDate || '').slice(0, 10),
      warrantyExpiry: (vehicle.warrantyExpiry || '').slice(0, 10),
      financingNotes: vehicle.financingNotes || '',
      depreciationMethod: vehicle.depreciationMethod || '',
      disposalDate: (vehicle.disposalDate || '').slice(0, 10),
      chassisNumber: vehicle.chassisNumber || '',
      engineNumber: vehicle.engineNumber || '',
      fuelType: vehicle.fuelType || '',
      costCenter: vehicle.costCenter || '',
      projectCode: vehicle.projectCode || '',
      status: vehicle.status || 'Available',
      odometerKm: String(vehicle.odometerKm || ''),
      nextServiceKm: String(vehicle.nextServiceKm || ''),
    });
    setFormOpen(true);
  };

  const openDriverEdit = (driver: Driver) => {
    setEditingVehicleId('');
    setEditingDriverId(driver.id);
    setForm({
      employeeCode: driver.employeeCode || '',
      licenseNumber: driver.licenseNumber || '',
      licenseClass: driver.licenseClass || '',
      licenseExpiry: (driver.licenseExpiry || '').slice(0, 10),
      issuingAuthority: driver.issuingAuthority || '',
      driverCategory: driver.driverCategory || 'Company Driver',
      medicalCertificateStatus: driver.medicalCertificateStatus || 'Missing',
      defensiveDrivingCertificate: driver.defensiveDrivingCertificate || 'Missing',
      availabilityStatus: driver.availabilityStatus || 'Available',
      safetyScore: String(driver.safetyScore || 90),
    });
    setFormOpen(true);
  };

  const workflow = async (entity: string, id: string, action: string) => {
    await postJson({ entity, id, action });
  };

  const visibleTabs = meta.tabs.slice(0, 7);
  const overflowTabs = meta.tabs.slice(7);
  const currentTab = meta.tabs.find((item) => item.id === activeTab) || meta.tabs[0];

  const vehicleLabel = (id: string) => {
    const vehicle = payload?.vehicles.find((item) => item.id === id);
    return vehicle ? `${vehicle.assetCode} · ${vehicle.plateNumber}` : id || '—';
  };
  const driverLabel = (idOrCode: string) => {
    const driver = payload?.drivers.find((item) => item.id === idOrCode || item.employeeCode === idOrCode);
    const employeeMatch = payload?.employees.find((item) => item.employeeCode === driver?.employeeCode || item.employeeCode === idOrCode);
    return employeeMatch ? `${employeeMatch.fullName} (${employeeMatch.employeeCode})` : driver?.employeeCode || idOrCode || '—';
  };
  const vendorLabel = (id: string) => payload?.vendors?.find((item) => item.id === id)?.name || id || '—';

  const createForm = () => {
    if (editingVehicleId) {
      return (
        <>
          <Field label="Location (DLE_Enterprise)">
            <TextSelect value={form.location || ''} onChange={(e) => setField('location', e.target.value)}>
              <option value="">Select location</option>
              {(payload?.locations || []).map((location) => <option key={location} value={location}>{location}</option>)}
            </TextSelect>
          </Field>
          <Field label="Department">
            <TextSelect value={form.department || ''} onChange={(e) => setField('department', e.target.value)}>
              <option value="">Select department</option>
              {(payload?.departments || []).map((department) => <option key={department} value={department}>{department}</option>)}
            </TextSelect>
          </Field>
          <Field label="Ownership type">
            <TextSelect value={form.ownershipType || 'Purchase'} onChange={(e) => setField('ownershipType', e.target.value)}>
              {['Purchase', 'Lease', 'Hired', 'Project-owned'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <Field label="Acquisition cost (NGN)"><TextInput type="number" value={form.acquisitionCost || ''} onChange={(e) => setField('acquisitionCost', e.target.value)} /></Field>
          <Field label="Supplier"><TextInput value={form.supplier || ''} onChange={(e) => setField('supplier', e.target.value)} /></Field>
          <Field label="Purchase date"><TextInput type="date" value={(form.purchaseDate || '').slice(0, 10)} onChange={(e) => setField('purchaseDate', e.target.value)} /></Field>
          <Field label="Warranty expiry"><TextInput type="date" value={(form.warrantyExpiry || '').slice(0, 10)} onChange={(e) => setField('warrantyExpiry', e.target.value)} /></Field>
          <Field label="Depreciation method"><TextInput value={form.depreciationMethod || ''} onChange={(e) => setField('depreciationMethod', e.target.value)} /></Field>
          <Field label="Disposal date"><TextInput type="date" value={(form.disposalDate || '').slice(0, 10)} onChange={(e) => setField('disposalDate', e.target.value)} /></Field>
          <Field label="Chassis number"><TextInput value={form.chassisNumber || ''} onChange={(e) => setField('chassisNumber', e.target.value)} /></Field>
          <Field label="Engine number"><TextInput value={form.engineNumber || ''} onChange={(e) => setField('engineNumber', e.target.value)} /></Field>
          <Field label="Fuel type"><TextInput value={form.fuelType || ''} onChange={(e) => setField('fuelType', e.target.value)} /></Field>
          <Field label="Cost centre"><TextInput value={form.costCenter || ''} onChange={(e) => setField('costCenter', e.target.value)} /></Field>
          <Field label="Project code"><TextInput value={form.projectCode || ''} onChange={(e) => setField('projectCode', e.target.value)} /></Field>
          <Field label="Status">
            <TextSelect value={form.status || 'Available'} onChange={(e) => setField('status', e.target.value)}>
              {['Available', 'Assigned', 'In Maintenance', 'Grounded', 'Retired'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <div className="sm:col-span-2"><Field label="Financing notes"><TextTextArea value={form.financingNotes || ''} onChange={(e) => setField('financingNotes', e.target.value)} /></Field></div>
        </>
      );
    }
    if (workspace === 'vehicles') {
      return (
        <>
          <Field label="Asset code"><TextInput value={form.assetCode || ''} onChange={(e) => setField('assetCode', e.target.value.toUpperCase())} placeholder="FLT-LAG-001" /></Field>
          <Field label="Plate number"><TextInput value={form.plateNumber || ''} onChange={(e) => setField('plateNumber', e.target.value.toUpperCase())} /></Field>
          <Field label="Vehicle type">
            <TextSelect value={form.vehicleType || ''} onChange={(e) => setField('vehicleType', e.target.value)}>
              <option value="">Select type</option>
              {['Pickup', 'SUV', 'Sedan', 'Bus', 'Flatbed Truck', 'Trailer', 'Crane Truck'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <Field label="Make / model"><TextInput value={form.makeModel || ''} onChange={(e) => setField('makeModel', e.target.value)} /></Field>
          <Field label="Year"><TextInput type="number" value={form.year || ''} onChange={(e) => setField('year', e.target.value)} /></Field>
          <Field label="Location (DLE_Enterprise)">
            <TextSelect value={form.location || ''} onChange={(e) => setField('location', e.target.value)}>
              <option value="">Select location</option>
              {(payload?.locations || []).map((location) => <option key={location} value={location}>{location}</option>)}
            </TextSelect>
          </Field>
          <Field label="Department">
            <TextSelect value={form.department || ''} onChange={(e) => setField('department', e.target.value)}>
              <option value="">Select department</option>
              {(payload?.departments || []).map((department) => <option key={department} value={department}>{department}</option>)}
            </TextSelect>
          </Field>
          <Field label="Fuel type"><TextInput value={form.fuelType || ''} onChange={(e) => setField('fuelType', e.target.value)} /></Field>
          <Field label="Odometer (km)"><TextInput type="number" value={form.odometerKm || ''} onChange={(e) => setField('odometerKm', e.target.value)} /></Field>
          <Field label="Next service (km)"><TextInput type="number" value={form.nextServiceKm || ''} onChange={(e) => setField('nextServiceKm', e.target.value)} /></Field>
          <Field label="Insurance expiry"><TextInput type="date" value={(form.insuranceExpiry || '').slice(0, 10)} onChange={(e) => setField('insuranceExpiry', e.target.value)} /></Field>
          <Field label="Roadworthiness expiry"><TextInput type="date" value={(form.roadWorthinessExpiry || '').slice(0, 10)} onChange={(e) => setField('roadWorthinessExpiry', e.target.value)} /></Field>
          <Field label="Ownership type">
            <TextSelect value={form.ownershipType || 'Purchase'} onChange={(e) => setField('ownershipType', e.target.value)}>
              {['Purchase', 'Lease', 'Hired', 'Project-owned'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <Field label="Acquisition cost (NGN)"><TextInput type="number" value={form.acquisitionCost || ''} onChange={(e) => setField('acquisitionCost', e.target.value)} /></Field>
          <Field label="Supplier"><TextInput value={form.supplier || ''} onChange={(e) => setField('supplier', e.target.value)} /></Field>
          <Field label="Purchase date"><TextInput type="date" value={(form.purchaseDate || '').slice(0, 10)} onChange={(e) => setField('purchaseDate', e.target.value)} /></Field>
          <div className="sm:col-span-2">
            <EmployeePicker label="Vehicle custodian" value={form.custodianEmployeeCode || ''} onChange={(value) => setField('custodianEmployeeCode', value)} employees={payload?.employees || []} />
          </div>
        </>
      );
    }
    if (workspace === 'drivers' || editingDriverId) {
      const linkedCodes = new Set((payload?.drivers || []).map((driver) => driver.employeeCode.toLowerCase()));
      const linkCandidates = (payload?.employees || []).filter((item) => {
        if (editingDriverId) return item.employeeCode === form.employeeCode;
        return !linkedCodes.has(item.employeeCode.toLowerCase());
      });
      const preferred = linkCandidates.filter((item) => item.isDirectoryDriver);
      const others = linkCandidates.filter((item) => !item.isDirectoryDriver);
      const pickerEmployees = editingDriverId ? linkCandidates : [...preferred, ...others];
      return (
        <>
          <div className="sm:col-span-2">
            <EmployeePicker
              label="Employee"
              value={form.employeeCode || ''}
              onChange={(value) => setField('employeeCode', value)}
              employees={pickerEmployees}
              hint={editingDriverId ? 'Employee linked from the directory' : 'Directory roles marked Driver/Chauffeur are listed first'}
            />
          </div>
          <Field label="Licence number"><TextInput value={form.licenseNumber || ''} onChange={(e) => setField('licenseNumber', e.target.value)} /></Field>
          <Field label="Licence class"><TextInput value={form.licenseClass || ''} onChange={(e) => setField('licenseClass', e.target.value)} placeholder="B, C, E…" /></Field>
          <Field label="Licence expiry"><TextInput type="date" value={(form.licenseExpiry || '').slice(0, 10)} onChange={(e) => setField('licenseExpiry', e.target.value)} /></Field>
          <Field label="Issuing authority"><TextInput value={form.issuingAuthority || ''} onChange={(e) => setField('issuingAuthority', e.target.value)} /></Field>
          <Field label="Driver category">
            <TextSelect value={form.driverCategory || 'Company Driver'} onChange={(e) => setField('driverCategory', e.target.value)}>
              {['Company Driver', 'Pool Driver', 'Executive Driver', 'Project Driver', 'Relief Driver'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <Field label="Medical certificate">
            <TextSelect value={form.medicalCertificateStatus || 'Valid'} onChange={(e) => setField('medicalCertificateStatus', e.target.value)}>
              {['Valid', 'Missing', 'Expired', 'Rejected'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <Field label="Defensive driving">
            <TextSelect value={form.defensiveDrivingCertificate || 'Valid'} onChange={(e) => setField('defensiveDrivingCertificate', e.target.value)}>
              {['Valid', 'Missing', 'Expired', 'Rejected'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          {editingDriverId ? (
            <>
              <Field label="Availability">
                <TextSelect value={form.availabilityStatus || 'Available'} onChange={(e) => setField('availabilityStatus', e.target.value)}>
                  {['Available', 'Assigned', 'On Trip', 'Off Duty', 'On Leave', 'Suspended', 'Inactive'].map((item) => <option key={item} value={item}>{item}</option>)}
                </TextSelect>
              </Field>
              <Field label="Safety score"><TextInput type="number" value={form.safetyScore || ''} onChange={(e) => setField('safetyScore', e.target.value)} /></Field>
            </>
          ) : null}
        </>
      );
    }
    if (workspace === 'trips-dispatch') {
      const onRequesterChange = (code: string) => {
        const match = (payload?.employees || []).find((item) => item.employeeCode === code);
        setForm((current) => ({
          ...current,
          requesterEmployeeCode: code,
          requesterDepartment: match?.department || current.requesterDepartment || '',
          requesterLocation: match?.location || current.requesterLocation || '',
        }));
        setFormErrors((current) => {
          const next = { ...current };
          delete next.requesterEmployeeCode;
          if (match?.department) delete next.requesterDepartment;
          if (match?.location) delete next.requesterLocation;
          return next;
        });
        setFormErrorSummary('');
      };
      return (
        <>
          <div className="sm:col-span-2">
            <EmployeePicker
              label="Requester"
              required
              error={formErrors.requesterEmployeeCode}
              value={form.requesterEmployeeCode || ''}
              onChange={onRequesterChange}
              employees={payload?.employees || []}
            />
          </div>
          <Field label="Department" required error={formErrors.requesterDepartment}>
            <TextSelect invalid={Boolean(formErrors.requesterDepartment)} value={form.requesterDepartment || ''} onChange={(e) => setField('requesterDepartment', e.target.value)}>
              <option value="">Select department</option>
              {(payload?.departments || []).map((department) => <option key={department} value={department}>{department}</option>)}
            </TextSelect>
          </Field>
          <Field label="Location (DLE_Enterprise)" required error={formErrors.requesterLocation}>
            <TextSelect invalid={Boolean(formErrors.requesterLocation)} value={form.requesterLocation || ''} onChange={(e) => setField('requesterLocation', e.target.value)}>
              <option value="">Select location</option>
              {(payload?.locations || []).map((location) => <option key={location} value={location}>{location}</option>)}
            </TextSelect>
          </Field>
          <Field label="Origin" required error={formErrors.origin}>
            <TextInput invalid={Boolean(formErrors.origin)} value={form.origin || ''} onChange={(e) => setField('origin', e.target.value)} placeholder="Pickup / departure point" />
          </Field>
          <Field label="Destination" required error={formErrors.destination}>
            <TextInput invalid={Boolean(formErrors.destination)} value={form.destination || ''} onChange={(e) => setField('destination', e.target.value)} placeholder="Trip destination" />
          </Field>
          <Field label="Start date" required error={formErrors.startDate}>
            <TextInput invalid={Boolean(formErrors.startDate)} type="date" value={(form.startDate || '').slice(0, 10)} onChange={(e) => setField('startDate', e.target.value)} />
          </Field>
          <Field label="End date" required error={formErrors.endDate}>
            <TextInput invalid={Boolean(formErrors.endDate)} type="date" value={(form.endDate || '').slice(0, 10)} onChange={(e) => setField('endDate', e.target.value)} />
          </Field>
          <Field label="Project code" required error={formErrors.projectCode} hint="Required for cost allocation and trip charging">
            <TextInput invalid={Boolean(formErrors.projectCode)} value={form.projectCode || ''} onChange={(e) => setField('projectCode', e.target.value)} placeholder="e.g. PJT-2026-001" />
          </Field>
          <Field label="Cost centre" required error={formErrors.costCenter} hint="Required for finance posting">
            <TextInput invalid={Boolean(formErrors.costCenter)} value={form.costCenter || ''} onChange={(e) => setField('costCenter', e.target.value)} placeholder="e.g. LOGISTICS" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Purpose" required error={formErrors.purpose}>
              <TextTextArea invalid={Boolean(formErrors.purpose)} value={form.purpose || ''} onChange={(e) => setField('purpose', e.target.value)} placeholder="Why is this trip required?" />
            </Field>
          </div>
        </>
      );
    }
    if (workspace === 'fuel') {
      return (
        <>
          <Field label="Vehicle">
            <TextSelect value={form.vehicleId || ''} onChange={(e) => setField('vehicleId', e.target.value)}>
              <option value="">Select vehicle</option>
              {(payload?.vehicles || []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode} · {vehicle.plateNumber}</option>)}
            </TextSelect>
          </Field>
          <div className="sm:col-span-1">
            <EmployeePicker label="Driver" value={form.driverEmployeeCode || ''} onChange={(value) => setField('driverEmployeeCode', value)} employees={payload?.employees || []} />
          </div>
          <Field label="Date"><TextInput type="date" value={(form.date || '').slice(0, 10)} onChange={(e) => setField('date', e.target.value)} /></Field>
          <Field label="Station"><TextInput value={form.station || ''} onChange={(e) => setField('station', e.target.value)} /></Field>
          <Field label="Litres"><TextInput type="number" value={form.litres || ''} onChange={(e) => setField('litres', e.target.value)} /></Field>
          <Field label="Amount (NGN)"><TextInput type="number" value={form.amount || ''} onChange={(e) => setField('amount', e.target.value)} /></Field>
          <Field label="Odometer (km)"><TextInput type="number" value={form.odometerKm || ''} onChange={(e) => setField('odometerKm', e.target.value)} /></Field>
          <Field label="Project code"><TextInput value={form.projectCode || ''} onChange={(e) => setField('projectCode', e.target.value)} /></Field>
        </>
      );
    }
    if (workspace === 'maintenance') {
      return (
        <>
          <Field label="Vehicle">
            <TextSelect value={form.vehicleId || ''} onChange={(e) => setField('vehicleId', e.target.value)}>
              <option value="">Select vehicle</option>
              {(payload?.vehicles || []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode} · {vehicle.plateNumber}</option>)}
            </TextSelect>
          </Field>
          <Field label="Maintenance type"><TextInput value={form.maintenanceType || ''} onChange={(e) => setField('maintenanceType', e.target.value)} placeholder="Service / Repair / Inspection" /></Field>
          <Field label="Vendor"><TextInput value={form.vendor || ''} onChange={(e) => setField('vendor', e.target.value)} /></Field>
          <Field label="Scheduled date"><TextInput type="date" value={(form.scheduledDate || '').slice(0, 10)} onChange={(e) => setField('scheduledDate', e.target.value)} /></Field>
          <Field label="Estimated cost"><TextInput type="number" value={form.cost || ''} onChange={(e) => setField('cost', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><TextTextArea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} /></Field></div>
        </>
      );
    }
    if (workspace === 'inspections-compliance') {
      return (
        <>
          <Field label="Document type"><TextInput value={form.documentType || ''} onChange={(e) => setField('documentType', e.target.value)} placeholder="Insurance / Roadworthiness / Licence" /></Field>
          <Field label="Reference"><TextInput value={form.reference || ''} onChange={(e) => setField('reference', e.target.value)} /></Field>
          <Field label="Vehicle">
            <TextSelect value={form.vehicleId || ''} onChange={(e) => setField('vehicleId', e.target.value)}>
              <option value="">Optional vehicle</option>
              {(payload?.vehicles || []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode} · {vehicle.plateNumber}</option>)}
            </TextSelect>
          </Field>
          <EmployeePicker label="Driver (optional)" value={form.driverEmployeeCode || ''} onChange={(value) => setField('driverEmployeeCode', value)} employees={payload?.employees || []} />
          <Field label="Issue date"><TextInput type="date" value={(form.issueDate || '').slice(0, 10)} onChange={(e) => setField('issueDate', e.target.value)} /></Field>
          <Field label="Expiry date"><TextInput type="date" value={(form.expiryDate || '').slice(0, 10)} onChange={(e) => setField('expiryDate', e.target.value)} /></Field>
        </>
      );
    }
    if (workspace === 'incidents') {
      return (
        <>
          <Field label="Incident type"><TextInput value={form.incidentType || ''} onChange={(e) => setField('incidentType', e.target.value)} placeholder="Accident / Breakdown / Theft" /></Field>
          <Field label="Severity">
            <TextSelect value={form.severity || 'Medium'} onChange={(e) => setField('severity', e.target.value)}>
              {['Low', 'Medium', 'High', 'Critical'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <Field label="Vehicle">
            <TextSelect value={form.vehicleId || ''} onChange={(e) => setField('vehicleId', e.target.value)}>
              <option value="">Select vehicle</option>
              {(payload?.vehicles || []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode}</option>)}
            </TextSelect>
          </Field>
          <EmployeePicker label="Driver" value={form.driverEmployeeCode || ''} onChange={(value) => setField('driverEmployeeCode', value)} employees={payload?.employees || []} />
          <Field label="Occurred at"><TextInput type="datetime-local" value={form.occurredAt || ''} onChange={(e) => setField('occurredAt', e.target.value)} /></Field>
          <Field label="Location"><TextInput value={form.location || ''} onChange={(e) => setField('location', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Description"><TextTextArea value={form.description || ''} onChange={(e) => setField('description', e.target.value)} /></Field></div>
        </>
      );
    }
    if (workspace === 'vendors-contracts' && activeTab === 'contracts') {
      return (
        <>
          <Field label="Vendor">
            <TextSelect value={form.vendorId || ''} onChange={(e) => setField('vendorId', e.target.value)}>
              <option value="">Select vendor</option>
              {(payload?.vendors || []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </TextSelect>
          </Field>
          <Field label="Title"><TextInput value={form.title || ''} onChange={(e) => setField('title', e.target.value)} /></Field>
          <Field label="Contract type"><TextInput value={form.contractType || ''} onChange={(e) => setField('contractType', e.target.value)} /></Field>
          <Field label="Value (NGN)"><TextInput type="number" value={form.value || ''} onChange={(e) => setField('value', e.target.value)} /></Field>
          <Field label="Start date"><TextInput type="date" value={(form.startDate || '').slice(0, 10)} onChange={(e) => setField('startDate', e.target.value)} /></Field>
          <Field label="End date"><TextInput type="date" value={(form.endDate || '').slice(0, 10)} onChange={(e) => setField('endDate', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><TextTextArea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} /></Field></div>
        </>
      );
    }
    if (workspace === 'vendors-contracts') {
      return (
        <>
          <Field label="Vendor name"><TextInput value={form.name || ''} onChange={(e) => setField('name', e.target.value)} /></Field>
          <Field label="Category"><TextInput value={form.category || ''} onChange={(e) => setField('category', e.target.value)} placeholder="Workshop / Fuel / Insurance" /></Field>
          <Field label="Contact name"><TextInput value={form.contactName || ''} onChange={(e) => setField('contactName', e.target.value)} /></Field>
          <Field label="Phone"><TextInput value={form.phone || ''} onChange={(e) => setField('phone', e.target.value)} /></Field>
          <Field label="Email"><TextInput value={form.email || ''} onChange={(e) => setField('email', e.target.value)} /></Field>
          <Field label="Location"><TextInput value={form.location || ''} onChange={(e) => setField('location', e.target.value)} /></Field>
          <Field label="Rating"><TextInput type="number" step="0.1" value={form.rating || ''} onChange={(e) => setField('rating', e.target.value)} /></Field>
        </>
      );
    }
    if (workspace === 'telematics') {
      return (
        <>
          <Field label="Vehicle">
            <TextSelect value={form.vehicleId || ''} onChange={(e) => setField('vehicleId', e.target.value)}>
              <option value="">Select vehicle</option>
              {(payload?.vehicles || []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode}</option>)}
            </TextSelect>
          </Field>
          <Field label="Event type"><TextInput value={form.eventType || ''} onChange={(e) => setField('eventType', e.target.value)} placeholder="Speeding / Idle / Geofence" /></Field>
          <Field label="Severity">
            <TextSelect value={form.severity || 'Info'} onChange={(e) => setField('severity', e.target.value)}>
              {['Info', 'Warning', 'Critical'].map((item) => <option key={item} value={item}>{item}</option>)}
            </TextSelect>
          </Field>
          <Field label="Occurred at"><TextInput type="datetime-local" value={form.occurredAt || ''} onChange={(e) => setField('occurredAt', e.target.value)} /></Field>
          <Field label="Speed (kph)"><TextInput type="number" value={form.speedKph || ''} onChange={(e) => setField('speedKph', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Details"><TextTextArea value={form.details || ''} onChange={(e) => setField('details', e.target.value)} /></Field></div>
        </>
      );
    }
    if (workspace === 'costs-budgets') {
      return (
        <>
          <Field label="Category"><TextInput value={form.category || ''} onChange={(e) => setField('category', e.target.value)} placeholder="Fuel / Maintenance / Insurance" /></Field>
          <Field label="Amount (NGN)"><TextInput type="number" value={form.amount || ''} onChange={(e) => setField('amount', e.target.value)} /></Field>
          <Field label="Cost date"><TextInput type="date" value={(form.costDate || '').slice(0, 10)} onChange={(e) => setField('costDate', e.target.value)} /></Field>
          <Field label="Vehicle">
            <TextSelect value={form.vehicleId || ''} onChange={(e) => setField('vehicleId', e.target.value)}>
              <option value="">Optional vehicle</option>
              {(payload?.vehicles || []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode}</option>)}
            </TextSelect>
          </Field>
          <Field label="Cost centre"><TextInput value={form.costCenter || ''} onChange={(e) => setField('costCenter', e.target.value)} /></Field>
          <Field label="Project code"><TextInput value={form.projectCode || ''} onChange={(e) => setField('projectCode', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><TextTextArea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} /></Field></div>
        </>
      );
    }
    return (
      <>
        <Field label="Request type"><TextInput value={form.requestType || ''} onChange={(e) => setField('requestType', e.target.value)} placeholder="Allocation / Reservation / General" /></Field>
        <Field label="Priority">
          <TextSelect value={form.priority || 'Normal'} onChange={(e) => setField('priority', e.target.value)}>
            {['Low', 'Normal', 'High', 'Critical'].map((item) => <option key={item} value={item}>{item}</option>)}
          </TextSelect>
        </Field>
        <div className="sm:col-span-2">
          <EmployeePicker label="Requester" value={form.requesterEmployeeCode || ''} onChange={(value) => setField('requesterEmployeeCode', value)} employees={payload?.employees || []} />
        </div>
        <Field label="Department"><TextInput value={form.department || ''} onChange={(e) => setField('department', e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Details"><TextTextArea value={form.details || ''} onChange={(e) => setField('details', e.target.value)} /></Field></div>
      </>
    );
  };

  const formTitle = () => {
    if (editingVehicleId) return 'Update Vehicle Ownership & Assignment';
    if (editingDriverId) return 'Update Driver Licence & Fitness';
    if (workspace === 'vendors-contracts' && activeTab === 'contracts') return 'Add Contract';
    return meta.primaryAction || 'Create record';
  };

  const renderLivePanel = () => {
    if (!payload) return null;
    const incidents = payload.incidents || [];
    const vendors = payload.vendors || [];
    const contracts = payload.contracts || [];
    const telematics = payload.telematics || [];
    const costs = payload.costs || [];
    const assignments = payload.assignmentHistory || [];
    const audits = payload.auditTrail || [];

    if (workspace === 'dashboard') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric label="Active vehicles" value={String(payload.summary.activeVehicles)} />
            <Metric label="Available" value={String(payload.summary.availableVehicles)} />
            <Metric label="Open trips" value={String(payload.summary.openTrips)} />
            <Metric label="Pending approvals" value={String(payload.summary.pendingApprovals)} />
            <Metric label="Expiring docs" value={String(payload.summary.expiringDocs)} />
            <Metric label="Fuel spend" value={money(payload.summary.fuelSpend)} />
            <Metric label="Maintenance cost" value={money(payload.summary.maintenanceCost)} />
            <Metric label="Open incidents" value={String(payload.summary.incidentOpen || incidents.length)} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Recent trips">
              <DataTable
                columns={['Request', 'Route', 'Status']}
                rows={payload.trips.slice(0, 6).map((trip) => [
                  trip.requestNo,
                  `${trip.origin} → ${trip.destination}`,
                  <span key={trip.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(trip.status)}`}>{trip.status}</span>,
                ])}
              />
            </Panel>
            <Panel title="Compliance watchlist">
              <DataTable
                columns={['Document', 'Vehicle', 'Expiry', 'Status']}
                rows={payload.compliance.slice(0, 6).map((item) => [
                  item.documentType,
                  vehicleLabel(item.vehicleId),
                  dateText(item.expiryDate),
                  <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
                ])}
              />
            </Panel>
          </div>
          <Panel title="Pending approvals">
            <DataTable
              columns={['Item', 'Detail', 'Status', 'Actions']}
              rows={[
                ...payload.drivers.filter((item) => item.approvalStatus === 'Submitted').map((item) => [
                  'Driver registration',
                  driverLabel(item.id),
                  item.approvalStatus || 'Submitted',
                  <div key={item.id} className="flex flex-wrap gap-1">
                    <ActionChip label="Approve" tone="emerald" disabled={saving} onClick={() => void workflow('driver', item.id, 'approve')} />
                    <ActionChip label="Reject" tone="red" disabled={saving} onClick={() => void workflow('driver', item.id, 'reject')} />
                  </div>,
                ]),
                ...payload.trips.filter((item) => ['PendingDriverSupervisor', 'PendingLineApproval', 'Submitted', 'PendingFleetAllocation'].includes(item.status)).map((item) => [
                  item.requestNo,
                  `${item.origin} → ${item.destination}`,
                  'Awaiting Driver Supervisor',
                  <Link key={item.id} href="/logistics-fleet/trips-dispatch?tab=supervisor" className="text-xs font-black text-blue-700">Open Driver Supervisor queue</Link>,
                ]),
                ...payload.maintenance.filter((item) => item.status === 'Submitted').map((item) => [
                  item.maintenanceType,
                  vehicleLabel(item.vehicleId),
                  item.status,
                  <div key={item.id} className="flex flex-wrap gap-1">
                    <ActionChip label="Approve" tone="emerald" disabled={saving} onClick={() => void workflow('maintenance', item.id, 'approve')} />
                    <ActionChip label="Reject" tone="red" disabled={saving} onClick={() => void workflow('maintenance', item.id, 'reject')} />
                  </div>,
                ]),
              ]}
            />
          </Panel>
        </div>
      );
    }

    if (workspace === 'vehicles') {
      if (activeTab === 'ownership') {
        return (
          <Panel title="Ownership & Acquisition">
            <DataTable
              columns={['Asset', 'Ownership', 'Supplier', 'Purchase', 'Cost', 'Warranty', 'Depreciation', 'Actions']}
              rows={payload.vehicles.map((vehicle) => [
                `${vehicle.assetCode} · ${vehicle.plateNumber}`,
                vehicle.ownershipType || '—',
                vehicle.supplier || '—',
                dateText(vehicle.purchaseDate || ''),
                money(vehicle.acquisitionCost || 0),
                dateText(vehicle.warrantyExpiry || ''),
                vehicle.depreciationMethod || '—',
                <ActionChip key={vehicle.id} label="Edit ownership" tone="blue" disabled={saving} onClick={() => openOwnershipEdit(vehicle)} />,
              ])}
            />
          </Panel>
        );
      }
      if (activeTab === 'assignment') {
        return (
          <Panel title="Organizational Assignment">
            <DataTable
              columns={['Asset', 'Department', 'Location', 'Cost centre', 'Project', 'Custodian', 'Status', 'Actions']}
              rows={payload.vehicles.map((vehicle) => [
                `${vehicle.assetCode} · ${vehicle.plateNumber}`,
                vehicle.department || '—',
                vehicle.location || '—',
                vehicle.costCenter || '—',
                vehicle.projectCode || '—',
                vehicle.custodian || '—',
                <span key={vehicle.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(vehicle.status)}`}>{vehicle.status}</span>,
                <ActionChip key={`${vehicle.id}-a`} label="Update assignment" tone="blue" disabled={saving} onClick={() => openOwnershipEdit(vehicle)} />,
              ])}
            />
          </Panel>
        );
      }
      if (activeTab === 'documents') {
        return (
          <Panel title="Vehicle Documents">
            <DataTable
              columns={['Document', 'Vehicle', 'Reference', 'Expiry', 'Status']}
              rows={payload.compliance.filter((item) => item.vehicleId).map((item) => [
                item.documentType,
                vehicleLabel(item.vehicleId),
                item.reference,
                dateText(item.expiryDate),
                <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
              ])}
            />
          </Panel>
        );
      }
      if (activeTab === 'history') {
        return (
          <div className="space-y-4">
            <Panel title="Assignment history">
              <DataTable
                columns={['When', 'Action', 'Driver', 'Vehicle', 'By']}
                rows={(payload.assignmentHistory || []).slice(0, 30).map((item) => [
                  dateText(item.effectiveDate),
                  item.action,
                  driverLabel(item.driverId),
                  vehicleLabel(item.vehicleId),
                  item.performedBy,
                ])}
              />
            </Panel>
            <Panel title="Maintenance history">
              <DataTable
                columns={['Vehicle', 'Type', 'Vendor', 'Date', 'Cost', 'Status']}
                rows={payload.maintenance.map((item) => [
                  vehicleLabel(item.vehicleId),
                  item.maintenanceType,
                  item.vendor,
                  dateText(item.scheduledDate),
                  money(item.cost),
                  item.status,
                ])}
              />
            </Panel>
          </div>
        );
      }
      if (activeTab === 'lifecycle') {
        return (
          <Panel title="Vehicle Lifecycle">
            <DataTable
              columns={['Asset', 'Status', 'Purchase', 'Disposal', 'Odometer', 'Ownership', 'Actions']}
              rows={payload.vehicles.map((vehicle) => [
                `${vehicle.assetCode} · ${vehicle.plateNumber}`,
                <span key={vehicle.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(vehicle.status)}`}>{vehicle.status}</span>,
                dateText(vehicle.purchaseDate || ''),
                dateText(vehicle.disposalDate || ''),
                `${vehicle.odometerKm.toLocaleString()} km`,
                vehicle.ownershipType || '—',
                <ActionChip key={`${vehicle.id}-l`} label="Update lifecycle" tone="blue" disabled={saving} onClick={() => openOwnershipEdit(vehicle)} />,
              ])}
            />
          </Panel>
        );
      }
      return (
        <Panel title={currentTab?.label || 'Vehicles'}>
          <DataTable
            columns={['Asset', 'Plate', 'Type', 'Department', 'Location', 'Custodian', 'Status', 'Odometer']}
            rows={payload.vehicles.map((vehicle) => [
              vehicle.assetCode,
              vehicle.plateNumber,
              `${vehicle.vehicleType} · ${vehicle.makeModel}`,
              vehicle.department || '—',
              vehicle.location || '—',
              vehicle.custodian || '—',
              <span key={vehicle.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(vehicle.status)}`}>{vehicle.status}</span>,
              `${vehicle.odometerKm.toLocaleString()} km`,
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'drivers') {
      const drivers = payload.drivers;
      const available = drivers.filter((d) => d.status === 'Available' || d.availabilityStatus === 'Available');
      const assigned = drivers.filter((d) => d.assignedVehicleId || d.status === 'Assigned');
      const onTrip = drivers.filter((d) => d.status === 'On Trip' || d.availabilityStatus === 'On Trip');
      const suspended = drivers.filter((d) => d.status === 'Suspended' || d.availabilityStatus === 'Suspended');
      const nonCompliant = drivers.filter((d) => ['Missing Documents', 'Expired', 'Expiring Soon', 'Blocked'].includes(d.complianceStatus) || d.status === 'Compliance Blocked' || d.status === 'License Expired');

      if (activeTab === 'profile') {
        return (
          <Panel title="Driver Profile">
            <DataTable
              columns={['Employee', 'Job title', 'Department', 'Location', 'Supervisor', 'Contact', 'Employment', 'Assigned vehicle', 'Category']}
              rows={drivers.map((driver) => {
                const person = payload.employees.find((item) => item.employeeCode === driver.employeeCode);
                return [
                  driverLabel(driver.id),
                  person?.jobTitle || '—',
                  person?.department || '—',
                  person?.location || '—',
                  person?.managerName || '—',
                  person?.phone || '—',
                  person?.status || '—',
                  vehicleLabel(driver.assignedVehicleId),
                  driver.driverCategory || '—',
                ];
              })}
            />
          </Panel>
        );
      }

      if (activeTab === 'licence') {
        return (
          <Panel title="Licence & Authorization">
            <DataTable
              columns={['Driver', 'Licence', 'Class', 'Expiry', 'Authority', 'Category', 'Compliance', 'Actions']}
              rows={drivers.map((driver) => [
                driverLabel(driver.id),
                driver.licenseNumber || '—',
                driver.licenseClass || '—',
                dateText(driver.licenseExpiry),
                driver.issuingAuthority || '—',
                driver.driverCategory || '—',
                <span key={`${driver.id}-c`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.complianceStatus)}`}>{driver.complianceStatus}</span>,
                <ActionChip key={`${driver.id}-e`} label="Update licence" tone="blue" disabled={saving} onClick={() => openDriverEdit(driver)} />,
              ])}
            />
          </Panel>
        );
      }

      if (activeTab === 'fitness') {
        return (
          <Panel title="Fitness & Training">
            <DataTable
              columns={['Driver', 'Medical', 'Defensive driving', 'Compliance', 'Status', 'Actions']}
              rows={drivers.map((driver) => [
                driverLabel(driver.id),
                <span key={`${driver.id}-m`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.medicalCertificateStatus || 'Missing')}`}>{driver.medicalCertificateStatus || 'Missing'}</span>,
                <span key={`${driver.id}-d`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.defensiveDrivingCertificate || 'Missing')}`}>{driver.defensiveDrivingCertificate || 'Missing'}</span>,
                <span key={`${driver.id}-c`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.complianceStatus)}`}>{driver.complianceStatus}</span>,
                driver.status,
                <ActionChip key={`${driver.id}-e`} label="Update fitness" tone="blue" disabled={saving} onClick={() => openDriverEdit(driver)} />,
              ])}
            />
          </Panel>
        );
      }

      if (activeTab === 'assignments') {
        return (
          <div className="space-y-4">
            <Panel title="Current assignments">
              <DataTable
                columns={['Driver', 'Status', 'Vehicle', 'Department', 'Actions']}
                rows={drivers.map((driver) => {
                  const person = payload.employees.find((item) => item.employeeCode === driver.employeeCode);
                  return [
                    driverLabel(driver.id),
                    <span key={`${driver.id}-s`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.status)}`}>{driver.status}</span>,
                    vehicleLabel(driver.assignedVehicleId),
                    person?.department || '—',
                    <div key={`${driver.id}-a`} className="min-w-[180px] space-y-2">
                      {driver.assignedVehicleId ? (
                        <ActionChip label="Unassign" tone="amber" disabled={saving} onClick={() => void postJson({ action: 'unassign-vehicle', driverId: driver.id, reason: 'Driver assignment ended' })} />
                      ) : (
                        <TextSelect
                          disabled={saving || driver.status === 'Suspended' || driver.status === 'Compliance Blocked'}
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            void postJson({ action: 'assign-vehicle', driverId: driver.id, vehicleId: e.target.value, reason: 'Driver register assignment' });
                          }}
                        >
                          <option value="">Assign vehicle…</option>
                          {payload.vehicles.filter((item) => ['Available', 'Assigned'].includes(item.status) && !payload.drivers.some((d) => d.assignedVehicleId === item.id)).map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode} · {vehicle.plateNumber}</option>
                          ))}
                        </TextSelect>
                      )}
                    </div>,
                  ];
                })}
              />
            </Panel>
            <Panel title="Assignment history">
              <DataTable
                columns={['When', 'Driver', 'Vehicle', 'Action', 'Reason', 'By']}
                rows={(payload.assignmentHistory || []).map((item) => [
                  dateText(item.effectiveDate),
                  driverLabel(item.driverId),
                  vehicleLabel(item.vehicleId),
                  item.action,
                  item.reason,
                  item.performedBy,
                ])}
              />
            </Panel>
          </div>
        );
      }

      if (activeTab === 'performance') {
        return (
          <Panel title="Performance & Safety">
            <DataTable
              columns={['Driver', 'Safety score', 'Trips', 'Completed', 'Open incidents', 'Fuel txns', 'Status']}
              rows={drivers.map((driver) => {
                const tripCount = payload.trips.filter((trip) => [driver.id, driver.employeeCode].includes(trip.driverId)).length;
                const completed = payload.trips.filter((trip) => [driver.id, driver.employeeCode].includes(trip.driverId) && trip.status === 'Completed').length;
                const openIncidents = (payload.incidents || []).filter((item) => item.status !== 'Closed' && [driver.id, driver.employeeCode].some((code) => item.description?.includes(code) || item.vehicleId === driver.assignedVehicleId)).length;
                const fuelTxns = payload.fuel.filter((item) => [driver.id, driver.employeeCode].includes(item.driverId || '')).length;
                return [
                  driverLabel(driver.id),
                  String(driver.safetyScore),
                  String(tripCount),
                  String(completed),
                  String(openIncidents),
                  String(fuelTxns),
                  <span key={`${driver.id}-s`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.status)}`}>{driver.status}</span>,
                ];
              })}
            />
          </Panel>
        );
      }

      if (activeTab === 'restrictions') {
        return (
          <Panel title="Restrictions & Discipline">
            <DataTable
              columns={['Driver', 'Status', 'Availability', 'Compliance', 'Actions']}
              rows={drivers.filter((driver) => ['Suspended', 'Compliance Blocked', 'License Expired', 'Inactive'].includes(driver.status) || driver.availabilityStatus === 'Suspended' || nonCompliant.includes(driver)).map((driver) => [
                driverLabel(driver.id),
                <span key={`${driver.id}-s`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.status)}`}>{driver.status}</span>,
                driver.availabilityStatus,
                driver.complianceStatus,
                <div key={`${driver.id}-x`} className="flex flex-wrap gap-1">
                  {driver.status !== 'Suspended' ? (
                    <ActionChip label="Suspend" tone="amber" disabled={saving} onClick={() => void postJson({ action: 'suspend-driver', driverId: driver.id, reason: 'Operational suspension' })} />
                  ) : (
                    <ActionChip label="Reinstate" tone="emerald" disabled={saving} onClick={() => void postJson({ action: 'reactivate-driver', driverId: driver.id, reason: 'Cleared for duty' })} />
                  )}
                  <ActionChip label="Update docs" tone="blue" disabled={saving} onClick={() => openDriverEdit(driver)} />
                </div>,
              ])}
            />
          </Panel>
        );
      }

      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
            Driver Register is synced from Employee Directory roles (Driver / Chauffeur). Complete licence &amp; fitness before vehicle assignment.
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="All drivers" value={String(drivers.length)} detail="From directory + fleet" />
            <Metric label="Available" value={String(available.length)} />
            <Metric label="Assigned" value={String(assigned.length)} />
            <Metric label="On trips" value={String(onTrip.length)} />
            <Metric label="Suspended" value={String(suspended.length)} />
            <Metric label="Non-compliant" value={String(nonCompliant.length)} />
          </div>
          <Panel title="Driver Register">
            <DataTable
              columns={['Employee', 'Title', 'Category', 'Licence', 'Expiry', 'Status', 'Compliance', 'Vehicle', 'Actions']}
              rows={drivers.map((driver) => {
                const person = payload.employees.find((item) => item.employeeCode === driver.employeeCode);
                return [
                  driverLabel(driver.id),
                  person?.jobTitle || '—',
                  driver.driverCategory || '—',
                  driver.licenseNumber || '—',
                  dateText(driver.licenseExpiry),
                  <span key={`${driver.id}-s`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.status)}`}>{driver.status}</span>,
                  <span key={`${driver.id}-c`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.complianceStatus)}`}>{driver.complianceStatus}</span>,
                  vehicleLabel(driver.assignedVehicleId),
                  <div key={`${driver.id}-x`} className="flex flex-wrap gap-1">
                    <ActionChip label="Update docs" tone="blue" disabled={saving} onClick={() => openDriverEdit(driver)} />
                    {driver.approvalStatus === 'Submitted' ? (
                      <>
                        <ActionChip label="Approve" tone="emerald" disabled={saving} onClick={() => void workflow('driver', driver.id, 'approve')} />
                        <ActionChip label="Reject" tone="red" disabled={saving} onClick={() => void workflow('driver', driver.id, 'reject')} />
                      </>
                    ) : null}
                    {driver.status !== 'Suspended' ? (
                      <ActionChip label="Suspend" tone="amber" disabled={saving} onClick={() => void postJson({ action: 'suspend-driver', driverId: driver.id, reason: 'Operational suspension' })} />
                    ) : (
                      <ActionChip label="Reactivate" tone="blue" disabled={saving} onClick={() => void postJson({ action: 'reactivate-driver', driverId: driver.id, reason: 'Cleared for duty' })} />
                    )}
                  </div>,
                ];
              })}
            />
          </Panel>
        </div>
      );
    }

    if (workspace === 'trips-dispatch') {
      const myCode = (employee.employeeCode || '').toLowerCase();
      const pendingSupervisor = (status: string) =>
        ['PendingDriverSupervisor', 'PendingLineApproval', 'PendingFleetAllocation', 'Submitted'].includes(status);
      const filtered = payload.trips.filter((trip) => {
        if (activeTab === 'supervisor' || activeTab === 'approvals' || activeTab === 'allocation') return pendingSupervisor(trip.status);
        if (activeTab === 'dispatch') return trip.status === 'ReadyToDispatch' || trip.status === 'Approved';
        if (activeTab === 'active') return ['Dispatched', 'InProgress'].includes(trip.status);
        if (activeTab === 'history') return ['Completed', 'Rejected', 'Cancelled'].includes(trip.status);
        if (myCode) return (trip.requesterEmployeeCode || '').toLowerCase() === myCode || trip.requester.toLowerCase().includes(myCode);
        return true;
      }).sort((a, b) => {
        if (!focusTripId) return 0;
        if (a.id === focusTripId) return -1;
        if (b.id === focusTripId) return 1;
        return 0;
      });

      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
            Workflow: Requester → Driver Supervisor (approve &amp; allocate vehicle + driver) → Dispatch → Complete. Portal + email notifications are sent at each stage with deep links.
          </div>
          {focusTripId ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              Opened from notification — focused on trip <span className="font-black">{filtered.find((item) => item.id === focusTripId)?.requestNo || focusTripId}</span>.
            </div>
          ) : null}
          <Panel title={currentTab?.label || 'Trips'}>
            <DataTable
              columns={['Request', 'Requester', 'Driver Supervisor', 'Route', 'Progress', 'Vehicle / Driver', 'Actions']}
              rows={filtered.map((trip) => {
                const selection = assignState[trip.id] || { vehicleId: trip.vehicleId || '', driverEmployeeCode: trip.driverId || '' };
                const focused = focusTripId && trip.id === focusTripId;
                return [
                  <div key={`${trip.id}-req`} className={focused ? 'rounded-xl bg-amber-50 p-2 ring-1 ring-amber-200' : undefined}>
                    <p className="font-black text-slate-900">{trip.requestNo}</p>
                    <p className="text-[11px] font-semibold text-slate-500">{dateText(trip.startDate || '')} → {dateText(trip.endDate || '')}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{trip.purpose}</p>
                  </div>,
                  trip.requester,
                  trip.lineManagerName || trip.lineManagerEmployeeCode || '—',
                  `${trip.origin} → ${trip.destination}`,
                  <TripStepper key={`${trip.id}-step`} status={trip.status} />,
                  <div key={`${trip.id}-assets`} className="text-xs font-semibold text-slate-600">
                    <p><span className="text-slate-500">Destination:</span> {trip.destination || '—'}</p>
                    <p><span className="text-slate-500">Vehicle:</span> {vehicleLabel(trip.vehicleId)}</p>
                    <p><span className="text-slate-500">Driver:</span> {driverLabel(trip.driverId)}</p>
                    {trip.allocatedBy ? <p className="mt-1 text-emerald-700">Allocated by {trip.allocatedBy}</p> : null}
                    {trip.returnReason ? <p className="mt-1 text-amber-700">Return: {trip.returnReason}</p> : null}
                    {trip.lineRejectReason ? <p className="mt-1 text-red-700">Reject: {trip.lineRejectReason}</p> : null}
                  </div>,
                  <div key={`${trip.id}-actions`} className="min-w-[220px] space-y-2">
                    {['Draft', 'Returned'].includes(trip.status) ? (
                      <ActionChip label="Submit to Driver Supervisor" tone="blue" disabled={saving} onClick={() => void postJson({ action: 'submit-trip', tripId: trip.id })} />
                    ) : null}
                    {pendingSupervisor(trip.status) ? (
                      <div className="space-y-2">
                        <TextSelect
                          value={selection.vehicleId}
                          onChange={(e) => setAssignState((current) => ({ ...current, [trip.id]: { ...selection, vehicleId: e.target.value } }))}
                        >
                          <option value="">Select vehicle</option>
                          {payload.vehicles.filter((item) => ['Available', 'Assigned'].includes(item.status)).map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>{vehicle.assetCode} · {vehicle.plateNumber}</option>
                          ))}
                        </TextSelect>
                        <TextSelect
                          value={selection.driverEmployeeCode}
                          onChange={(e) => setAssignState((current) => ({ ...current, [trip.id]: { ...selection, driverEmployeeCode: e.target.value } }))}
                        >
                          <option value="">Select driver</option>
                          {payload.drivers.filter((item) => item.approvalStatus === 'Approved' || item.status === 'Available' || item.status === 'Assigned').map((driver) => (
                            <option key={driver.id} value={driver.employeeCode}>{driverLabel(driver.id)}</option>
                          ))}
                        </TextSelect>
                        <div className="flex flex-wrap gap-1">
                          <ActionChip
                            label="Approve & allocate"
                            tone="emerald"
                            disabled={saving || !selection.vehicleId || !selection.driverEmployeeCode}
                            onClick={() => void postJson({
                              action: 'allocate-trip',
                              tripId: trip.id,
                              vehicleId: selection.vehicleId,
                              driverEmployeeCode: selection.driverEmployeeCode,
                            })}
                          />
                          <ActionChip label="Return" tone="amber" disabled={saving} onClick={() => void postJson({ action: 'return-trip', tripId: trip.id, reason: 'Please update trip details' })} />
                          <ActionChip label="Reject" tone="red" disabled={saving} onClick={() => void postJson({ action: 'reject-line', tripId: trip.id, reason: 'Not approved by Driver Supervisor' })} />
                        </div>
                      </div>
                    ) : null}
                    {trip.status === 'ReadyToDispatch' || trip.status === 'Approved' ? (
                      <ActionChip label="Dispatch" tone="blue" disabled={saving} onClick={() => void postJson({ action: 'dispatch-trip', tripId: trip.id })} />
                    ) : null}
                    {trip.status === 'Dispatched' ? (
                      <div className="flex flex-wrap gap-1">
                        <ActionChip label="Mark in progress" tone="amber" disabled={saving} onClick={() => void postJson({ action: 'start-trip', tripId: trip.id })} />
                        <ActionChip label="Complete" tone="emerald" disabled={saving} onClick={() => void postJson({ action: 'complete-trip', tripId: trip.id })} />
                      </div>
                    ) : null}
                    {trip.status === 'InProgress' ? (
                      <ActionChip label="Complete trip" tone="emerald" disabled={saving} onClick={() => void postJson({ action: 'complete-trip', tripId: trip.id })} />
                    ) : null}
                    {!['Dispatched', 'InProgress', 'Completed', 'Cancelled', 'Rejected'].includes(trip.status) ? (
                      <ActionChip label="Cancel" tone="red" disabled={saving} onClick={() => void postJson({ action: 'cancel-trip', tripId: trip.id, reason: 'Cancelled by fleet user' })} />
                    ) : null}
                  </div>,
                ];
              })}
            />
          </Panel>
        </div>
      );
    }

    if (workspace === 'fuel') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Fuel spend" value={money(payload.summary.fuelSpend)} />
            <Metric label="Transactions" value={String(payload.fuel.length)} />
            <Metric label="Total litres" value={payload.fuel.reduce((sum, item) => sum + item.litres, 0).toLocaleString()} />
            <Metric label="Cost entries" value={money(payload.summary.costTotal || 0)} />
          </div>
          <Panel title={currentTab?.label || 'Fuel transactions'}>
            <DataTable
              columns={['Date', 'Vehicle', 'Driver', 'Station', 'Litres', 'Amount', 'Odometer']}
              rows={payload.fuel.map((item) => [
                dateText(item.date),
                vehicleLabel(item.vehicleId),
                driverLabel(item.driverId || ''),
                item.station,
                item.litres.toLocaleString(),
                money(item.amount),
                `${item.odometerKm.toLocaleString()} km`,
              ])}
            />
          </Panel>
        </div>
      );
    }

    if (workspace === 'maintenance') {
      return (
        <Panel title={currentTab?.label || 'Maintenance'}>
          <DataTable
            columns={['Vehicle', 'Type', 'Vendor', 'Scheduled', 'Cost', 'Status', 'Actions']}
            rows={payload.maintenance.map((item) => [
              vehicleLabel(item.vehicleId),
              item.maintenanceType,
              item.vendor,
              dateText(item.scheduledDate),
              money(item.cost),
              <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
              <div key={`${item.id}-a`} className="flex flex-wrap gap-1">
                {item.status === 'Submitted' ? (
                  <>
                    <ActionChip label="Approve" tone="emerald" disabled={saving} onClick={() => void workflow('maintenance', item.id, 'approve')} />
                    <ActionChip label="Reject" tone="red" disabled={saving} onClick={() => void workflow('maintenance', item.id, 'reject')} />
                  </>
                ) : null}
                {item.status === 'Approved' ? <ActionChip label="Complete" tone="blue" disabled={saving} onClick={() => void workflow('maintenance', item.id, 'complete')} /> : null}
              </div>,
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'inspections-compliance') {
      return (
        <Panel title={currentTab?.label || 'Compliance'}>
          <DataTable
            columns={['Document', 'Vehicle', 'Driver', 'Reference', 'Expiry', 'Status', 'Actions']}
            rows={payload.compliance.map((item) => [
              item.documentType,
              vehicleLabel(item.vehicleId),
              driverLabel(item.driverId || ''),
              item.reference,
              dateText(item.expiryDate),
              <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
              <div key={`${item.id}-a`} className="flex flex-wrap gap-1">
                <ActionChip label="Verify" tone="emerald" disabled={saving} onClick={() => void postJson({ action: 'verify-document', documentId: item.id })} />
                <ActionChip label="Reject" tone="red" disabled={saving} onClick={() => void postJson({ action: 'reject-document', documentId: item.id, reason: 'Failed compliance review' })} />
              </div>,
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'allocations') {
      return (
        <div className="space-y-4">
          <Panel title="Current vehicle allocations">
            <DataTable
              columns={['Vehicle', 'Status', 'Department', 'Location', 'Assigned driver', 'Actions']}
              rows={payload.vehicles.map((vehicle) => {
                const driver = payload.drivers.find((item) => item.assignedVehicleId === vehicle.id);
                return [
                  `${vehicle.assetCode} · ${vehicle.plateNumber}`,
                  <span key={vehicle.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(vehicle.status)}`}>{vehicle.status}</span>,
                  vehicle.department || '—',
                  vehicle.location || '—',
                  driver ? driverLabel(driver.id) : 'Unassigned',
                  driver ? (
                    <ActionChip label="Unassign" tone="amber" disabled={saving} onClick={() => void postJson({ action: 'unassign-vehicle', driverId: driver.id, reason: 'Allocation ended' })} />
                  ) : (
                    <TextSelect
                      disabled={saving}
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        void postJson({ action: 'assign-vehicle', driverId: e.target.value, vehicleId: vehicle.id, reason: 'Portal allocation' });
                      }}
                    >
                      <option value="">Assign driver…</option>
                      {payload.drivers.filter((item) => !item.assignedVehicleId && (item.approvalStatus === 'Approved' || item.status === 'Available')).map((item) => (
                        <option key={item.id} value={item.id}>{driverLabel(item.id)}</option>
                      ))}
                    </TextSelect>
                  ),
                ];
              })}
            />
          </Panel>
          <Panel title="Allocation history">
            <DataTable
              columns={['When', 'Action', 'Driver', 'Vehicle', 'By', 'Reason']}
              rows={assignments.slice(0, 20).map((item) => [
                dateText(item.effectiveDate),
                item.action,
                driverLabel(item.driverId),
                vehicleLabel(item.vehicleId),
                item.performedBy,
                item.reason,
              ])}
            />
          </Panel>
        </div>
      );
    }

    if (workspace === 'incidents') {
      return (
        <Panel title={currentTab?.label || 'Incidents'}>
          <DataTable
            columns={['Reference', 'Type', 'Severity', 'Vehicle', 'Occurred', 'Claim', 'Status', 'Actions']}
            rows={incidents.map((item) => [
              item.reference,
              item.incidentType,
              item.severity,
              vehicleLabel(item.vehicleId),
              dateText(item.occurredAt),
              item.claimStatus,
              <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
              <div key={`${item.id}-a`} className="flex flex-wrap gap-1">
                <ActionChip label="Investigate" tone="amber" disabled={saving} onClick={() => void workflow('incident', item.id, 'dispatch')} />
                <ActionChip label="Close" tone="emerald" disabled={saving} onClick={() => void workflow('incident', item.id, 'close')} />
              </div>,
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'telematics') {
      return (
        <Panel title={currentTab?.label || 'Telematics events'}>
          <DataTable
            columns={['When', 'Vehicle', 'Event', 'Severity', 'Speed', 'Details']}
            rows={telematics.map((item) => [
              dateText(item.occurredAt),
              vehicleLabel(item.vehicleId),
              item.eventType,
              <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.severity)}`}>{item.severity}</span>,
              item.speedKph != null ? `${item.speedKph} kph` : '—',
              item.details || '—',
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'vendors-contracts') {
      return (
        <div className="space-y-4">
          <Panel title="Vendors" actions={<ActionChip label="Add contract form" tone="blue" onClick={() => { setTab('contracts'); openCreate(); }} />}>
            <DataTable
              columns={['Name', 'Category', 'Contact', 'Phone', 'Location', 'Rating', 'Status']}
              rows={vendors.map((item) => [
                item.name,
                item.category,
                item.contactName || '—',
                item.phone || '—',
                item.location || '—',
                item.rating ? item.rating.toFixed(1) : '—',
                <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
              ])}
            />
          </Panel>
          <Panel title="Contracts">
            <DataTable
              columns={['Title', 'Vendor', 'Type', 'Value', 'Start', 'End', 'Status']}
              rows={contracts.map((item) => [
                item.title,
                vendorLabel(item.vendorId),
                item.contractType,
                money(item.value),
                dateText(item.startDate),
                dateText(item.endDate),
                <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
              ])}
            />
          </Panel>
        </div>
      );
    }

    if (workspace === 'costs-budgets') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Posted costs" value={money(payload.summary.costTotal || costs.reduce((sum, item) => sum + item.amount, 0))} />
            <Metric label="Fuel spend" value={money(payload.summary.fuelSpend)} />
            <Metric label="Maintenance" value={money(payload.summary.maintenanceCost)} />
            <Metric label="Entries" value={String(costs.length)} />
          </div>
          <Panel title={currentTab?.label || 'Cost ledger'}>
            <DataTable
              columns={['Date', 'Category', 'Vehicle', 'Amount', 'Cost centre', 'Project', 'Notes']}
              rows={costs.map((item) => [
                dateText(item.costDate),
                item.category,
                vehicleLabel(item.vehicleId),
                money(item.amount),
                item.costCenter || '—',
                item.projectCode || '—',
                item.notes || '—',
              ])}
            />
          </Panel>
        </div>
      );
    }

    if (workspace === 'reports') {
      return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Vehicles" value={String(payload.vehicles.length)} detail="From [fleet].[Vehicles]" />
          <Metric label="Drivers" value={String(payload.drivers.length)} detail="From [fleet].[Drivers]" />
          <Metric label="Open trips" value={String(payload.summary.openTrips)} detail="Live trip workflow" />
          <Metric label="Fuel spend" value={money(payload.summary.fuelSpend)} detail="From [fleet].[Fuel]" />
          <Metric label="Maintenance" value={money(payload.summary.maintenanceCost)} />
          <Metric label="Incidents open" value={String(payload.summary.incidentOpen || incidents.length)} />
          <Metric label="Vendors" value={String(payload.summary.vendorCount || vendors.length)} />
          <Metric label="Posted costs" value={money(payload.summary.costTotal || 0)} />
        </div>
      );
    }

    if (workspace === 'administration') {
      return (
        <div className="space-y-4">
          <Panel title="Data control">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Source" value="SQL" detail="DLE_Enterprise.fleet" />
              <Metric label="Vehicles" value={String(payload.vehicles.length)} />
              <Metric label="Drivers" value={String(payload.drivers.length)} />
              <Metric label="Audit rows" value={String(audits.length)} />
            </div>
          </Panel>
          <Panel title="Activity log">
            <DataTable
              columns={['When', 'Actor', 'Action', 'Entity', 'Details']}
              rows={audits.slice(0, 30).map((item) => [
                dateText(item.at),
                item.actor,
                item.action,
                item.entity,
                item.details,
              ])}
            />
          </Panel>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <Panel title={`${meta.title} · ${currentTab?.label || 'Records'}`}>
          {payload.requests.length ? (
            <DataTable
              columns={['Type', 'Requester', 'Priority', 'Status', 'Created', 'Actions']}
              rows={payload.requests.slice(0, 20).map((item) => [
                item.requestType,
                item.requester,
                item.priority,
                <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
                dateText(item.createdAt),
                <div key={`${item.id}-a`} className="flex flex-wrap gap-1">
                  {item.status === 'Submitted' ? (
                    <>
                      <ActionChip label="Approve" tone="emerald" disabled={saving} onClick={() => void workflow('request', item.id, 'approve')} />
                      <ActionChip label="Reject" tone="red" disabled={saving} onClick={() => void workflow('request', item.id, 'reject')} />
                    </>
                  ) : null}
                </div>,
              ])}
            />
          ) : (
            <p className="text-sm font-semibold text-slate-500">No live records for this workspace yet. Use the primary action to create the first DLE_Enterprise record.</p>
          )}
        </Panel>
      </div>
    );
  };

  return (
    <FleetPortalShell workspace={workspace} loading={loading} onRefresh={() => void load()} employee={employee}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-700">
                <Database className="h-3.5 w-3.5" /> Logistics & Fleet · DLE_Enterprise
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{meta.title}</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">{meta.description}</p>
              {notice ? <p className="mt-2 text-xs font-bold text-emerald-700">{notice}</p> : null}
            </div>
            {meta.primaryAction || entityForWorkspace(workspace) ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
              >
                <Plus className="h-4 w-4" /> {meta.primaryAction || 'Create record'}
              </button>
            ) : null}
          </div>

          <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
            {visibleTabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-black transition ${
                    active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
            {overflowTabs.length ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMoreOpen((value) => !value)}
                  className={`rounded-full px-3.5 py-2 text-xs font-black ${overflowTabs.some((tab) => tab.id === activeTab) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  More
                </button>
                {moreOpen ? (
                  <div className="absolute right-0 z-10 mt-2 min-w-[220px] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    {overflowTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTab(tab.id)}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-bold ${tab.id === activeTab ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
          </div>
        ) : null}

        {loading && !payload ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500 shadow-sm">Connecting to DLE_Enterprise fleet tables…</div>
        ) : renderLivePanel()}

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
          Workspace route: <Link href={`/logistics-fleet/${workspace}`} className="font-black text-blue-700">/logistics-fleet/{workspace}</Link>
          {activeTab ? <> · tab=<span className="font-black text-slate-800">{activeTab}</span></> : null}
          {' · '}Reads/writes <span className="font-black text-slate-800">[fleet].*</span> in DLE_Enterprise
        </div>
      </div>

      <FormPanel
        title={formTitle()}
        description={workspace === 'trips-dispatch'
          ? 'Required fields are marked *. Project code and cost centre are mandatory for trip charging.'
          : 'Validated against HR employee directory and Organization Locations where required, then saved to SQL Server.'}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingVehicleId('');
          setEditingDriverId('');
          setFormErrors({});
          setFormErrorSummary('');
        }}
        onSave={() => void saveCreate()}
        saving={saving}
        formError={formErrorSummary}
        saveLabel={workspace === 'trips-dispatch' && !editingVehicleId && !editingDriverId ? 'Submit' : 'Save'}
      >
        {createForm()}
      </FormPanel>
    </FleetPortalShell>
  );
}
