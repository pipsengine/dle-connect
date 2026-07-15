'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronRight, Plus } from 'lucide-react';
import { FleetPortalShell } from './fleet-portal-shell';
import {
  FLEET_WORKSPACE_META,
  fleetTabFromQuery,
  resolveFleetWorkspace,
} from '@/lib/fleet-management/nav';

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
};
type Driver = {
  id: string;
  employeeCode: string;
  licenseNumber: string;
  licenseClass: string;
  licenseExpiry: string;
  availabilityStatus: string;
  assignedVehicleId: string;
  status: string;
  complianceStatus: string;
  safetyScore: number;
};
type Trip = {
  id: string;
  requestNo: string;
  vehicleId: string;
  driverId: string;
  requester: string;
  origin: string;
  destination: string;
  purpose: string;
  status: string;
};
type Maintenance = { id: string; vehicleId: string; maintenanceType: string; vendor: string; scheduledDate: string; cost: number; status: string; notes: string };
type FuelRecord = { id: string; vehicleId: string; date: string; litres: number; amount: number; odometerKm: number; station: string };
type Compliance = { id: string; vehicleId: string; documentType: string; reference: string; expiryDate: string; status: string };
type FleetRequest = { id: string; requestType: string; requester: string; details: string; priority: string; status: string; createdAt: string };
type EmployeeOption = { employeeCode: string; fullName: string; department: string };
type Payload = {
  generatedAt: string;
  employees: EmployeeOption[];
  vehicles: Vehicle[];
  drivers: Driver[];
  trips: Trip[];
  maintenance: Maintenance[];
  fuel: FuelRecord[];
  compliance: Compliance[];
  requests: FleetRequest[];
  summary: {
    activeVehicles: number;
    availableVehicles: number;
    openTrips: number;
    pendingApprovals: number;
    expiringDocs: number;
    fuelSpend: number;
    maintenanceCost: number;
  };
};

const money = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value || 0);
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const tone = (value: string) => {
  const status = value.toLowerCase();
  if (status.includes('approved') || status.includes('available') || status.includes('valid') || status.includes('completed') || status.includes('active')) return 'bg-emerald-100 text-emerald-800';
  if (status.includes('reject') || status.includes('expired') || status.includes('ground') || status.includes('suspend')) return 'bg-red-100 text-red-800';
  if (status.includes('submitted') || status.includes('soon') || status.includes('maintenance') || status.includes('pending')) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
};

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) {
    return <p className="text-sm font-semibold text-slate-500">No records in this view yet.</p>;
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

export function FleetWorkspaceClient({ workspaceSlug }: { workspaceSlug?: string }) {
  const workspace = resolveFleetWorkspace(workspaceSlug);
  const meta = FLEET_WORKSPACE_META[workspace];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = fleetTabFromQuery(workspace, searchParams.get('tab'));
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employee, setEmployee] = useState<{ fullName?: string; jobTitle?: string; employeeCode?: string; department?: string }>({});
  const [moreOpen, setMoreOpen] = useState(false);

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
      setPayload(fleetJson.data);
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

  const visibleTabs = meta.tabs.slice(0, 7);
  const overflowTabs = meta.tabs.slice(7);
  const currentTab = meta.tabs.find((item) => item.id === activeTab) || meta.tabs[0];

  const vehicleLabel = (id: string) => {
    const vehicle = payload?.vehicles.find((item) => item.id === id);
    return vehicle ? `${vehicle.assetCode} · ${vehicle.plateNumber}` : id || '—';
  };
  const driverLabel = (id: string) => {
    const driver = payload?.drivers.find((item) => item.id === id);
    const employeeMatch = payload?.employees.find((item) => item.employeeCode === driver?.employeeCode);
    return employeeMatch ? `${employeeMatch.fullName} (${employeeMatch.employeeCode})` : driver?.employeeCode || id || '—';
  };

  const livePanel = useMemo(() => {
    if (!payload) return null;
    if (workspace === 'dashboard') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric label="Active vehicles" value={String(payload.summary.activeVehicles)} />
            <Metric label="Available" value={String(payload.summary.availableVehicles)} />
            <Metric label="Open trips" value={String(payload.summary.openTrips)} />
            <Metric label="Pending approvals" value={String(payload.summary.pendingApprovals)} />
            <Metric label="Expiring docs" value={String(payload.summary.expiringDocs)} detail="Within compliance window" />
            <Metric label="Fuel spend" value={money(payload.summary.fuelSpend)} />
            <Metric label="Maintenance cost" value={money(payload.summary.maintenanceCost)} />
            <Metric label="Drivers" value={String(payload.drivers.length)} detail={`${payload.drivers.filter((item) => item.availabilityStatus === 'Available').length} available`} />
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
        </div>
      );
    }

    if (workspace === 'vehicles') {
      const filtered = payload.vehicles.filter((vehicle) => {
        if (activeTab === 'register' || activeTab === 'profile') return true;
        if (activeTab === 'documents') return true;
        return true;
      });
      return (
        <Panel title={currentTab?.label || 'Vehicles'}>
          <DataTable
            columns={['Asset', 'Plate', 'Type', 'Department', 'Location', 'Status', 'Odometer', 'Next service']}
            rows={filtered.map((vehicle) => [
              vehicle.assetCode,
              vehicle.plateNumber,
              `${vehicle.vehicleType} · ${vehicle.makeModel}`,
              vehicle.department || '—',
              vehicle.location || '—',
              <span key={vehicle.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(vehicle.status)}`}>{vehicle.status}</span>,
              `${vehicle.odometerKm.toLocaleString()} km`,
              `${vehicle.nextServiceKm.toLocaleString()} km`,
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'drivers') {
      return (
        <Panel title={currentTab?.label || 'Drivers'}>
          <DataTable
            columns={['Employee', 'Licence', 'Class', 'Expiry', 'Availability', 'Compliance', 'Safety']}
            rows={payload.drivers.map((driver) => [
              driverLabel(driver.id),
              driver.licenseNumber,
              driver.licenseClass,
              dateText(driver.licenseExpiry),
              <span key={`${driver.id}-a`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.availabilityStatus)}`}>{driver.availabilityStatus}</span>,
              <span key={`${driver.id}-c`} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(driver.complianceStatus)}`}>{driver.complianceStatus}</span>,
              String(driver.safetyScore),
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'trips-dispatch') {
      return (
        <Panel title={currentTab?.label || 'Trips'}>
          <DataTable
            columns={['Request', 'Requester', 'Vehicle', 'Driver', 'Route', 'Status']}
            rows={payload.trips.map((trip) => [
              trip.requestNo,
              trip.requester,
              vehicleLabel(trip.vehicleId),
              driverLabel(trip.driverId),
              `${trip.origin} → ${trip.destination}`,
              <span key={trip.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(trip.status)}`}>{trip.status}</span>,
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'fuel') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Fuel spend" value={money(payload.summary.fuelSpend)} />
            <Metric label="Transactions" value={String(payload.fuel.length)} />
            <Metric label="Total litres" value={payload.fuel.reduce((sum, item) => sum + item.litres, 0).toLocaleString()} />
            <Metric label="Pending requests" value={String(payload.requests.filter((item) => /fuel/i.test(item.requestType) && /pending|submitted/i.test(item.status)).length)} />
          </div>
          <Panel title={currentTab?.label || 'Fuel transactions'}>
            <DataTable
              columns={['Date', 'Vehicle', 'Station', 'Litres', 'Amount', 'Odometer']}
              rows={payload.fuel.map((item) => [
                dateText(item.date),
                vehicleLabel(item.vehicleId),
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
            columns={['Vehicle', 'Type', 'Vendor', 'Scheduled', 'Cost', 'Status']}
            rows={payload.maintenance.map((item) => [
              vehicleLabel(item.vehicleId),
              item.maintenanceType,
              item.vendor,
              dateText(item.scheduledDate),
              money(item.cost),
              <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
            ])}
          />
        </Panel>
      );
    }

    if (workspace === 'inspections-compliance') {
      return (
        <Panel title={currentTab?.label || 'Compliance'}>
          <DataTable
            columns={['Document', 'Vehicle', 'Reference', 'Expiry', 'Status']}
            rows={payload.compliance.map((item) => [
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

    if (workspace === 'allocations') {
      return (
        <Panel title={currentTab?.label || 'Allocations'}>
          <DataTable
            columns={['Vehicle', 'Status', 'Department', 'Location', 'Assigned driver']}
            rows={payload.vehicles.map((vehicle) => {
              const driver = payload.drivers.find((item) => item.assignedVehicleId === vehicle.id);
              return [
                `${vehicle.assetCode} · ${vehicle.plateNumber}`,
                <span key={vehicle.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(vehicle.status)}`}>{vehicle.status}</span>,
                vehicle.department || '—',
                vehicle.location || '—',
                driver ? driverLabel(driver.id) : 'Unassigned',
              ];
            })}
          />
        </Panel>
      );
    }

    if (workspace === 'reports') {
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {currentTab?.sections.map((section) => (
            <div key={section} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-slate-950">{section}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">Ready for export from live fleet records.</p>
              <button type="button" className="mt-4 inline-flex items-center gap-1 text-xs font-black text-blue-700">
                Open report <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
          {meta.title} workspace is live in the portal. This tab organises {currentTab?.label.toLowerCase()} functions. Operational records already available from Logistics & Fleet continue to feed dashboards, vehicles, drivers, trips, fuel, maintenance, and compliance.
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(currentTab?.sections || []).map((section) => (
            <div key={section} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">{section}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Configured capability under {currentTab?.label}.</p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          ))}
        </div>
        {payload.requests.length ? (
          <Panel title="Related requests & approvals">
            <DataTable
              columns={['Type', 'Requester', 'Priority', 'Status', 'Created']}
              rows={payload.requests.slice(0, 8).map((item) => [
                item.requestType,
                item.requester,
                item.priority,
                <span key={item.id} className={`rounded-full px-2 py-0.5 text-[11px] font-black ${tone(item.status)}`}>{item.status}</span>,
                dateText(item.createdAt),
              ])}
            />
          </Panel>
        ) : null}
      </div>
    );
  }, [payload, workspace, activeTab, currentTab, meta.title]);

  return (
    <FleetPortalShell workspace={workspace} loading={loading} onRefresh={() => void load()} employee={employee}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">Logistics & Fleet</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{meta.title}</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-600">{meta.description}</p>
            </div>
            {meta.primaryAction ? (
              <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white">
                <Plus className="h-4 w-4" /> {meta.primaryAction}
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
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500 shadow-sm">Loading fleet workspace…</div>
        ) : livePanel}

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
          Workspace route: <Link href={`/logistics-fleet/${workspace}`} className="font-black text-blue-700">/logistics-fleet/{workspace}</Link>
          {activeTab ? <> · tab=<span className="font-black text-slate-800">{activeTab}</span></> : null}
        </div>
      </div>
    </FleetPortalShell>
  );
}
