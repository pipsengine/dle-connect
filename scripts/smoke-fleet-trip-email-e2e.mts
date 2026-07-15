import fs from 'node:fs';
import path from 'node:path';
import { createSessionToken } from '../apps/dashboard/lib/auth/session';

const BASE_URL = process.env.FLEET_SMOKE_BASE_URL || 'http://127.0.0.1:3020';
const EMPLOYEE_CODE = process.env.FLEET_SMOKE_EMPLOYEE || 'P0146';
const AUTH_COOKIE = 'dle_session';

const loadEnv = () => {
  for (const file of [
    path.join(process.cwd(), 'apps', 'dashboard', '.env.local'),
    path.join(process.cwd(), 'apps', 'dashboard', '.env'),
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
};

loadEnv();

const compact = (value: unknown) => String(value || '').trim();
const assertStep = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const apiFetch = async (cookie: string, method: string, urlPath: string, body?: Record<string, unknown>) => {
  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      cookie: `${AUTH_COOKIE}=${cookie}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
};

type FleetPayload = {
  vehicles?: Array<{ id: string; assetCode: string; plateNumber: string; status: string }>;
  drivers?: Array<{ id: string; employeeCode: string; status: string; approvalStatus?: string; assignedVehicleId?: string }>;
  employees?: Array<{ employeeCode: string; fullName: string; department?: string; location?: string }>;
  trips?: Array<{
    id: string;
    requestNo: string;
    status: string;
    requesterEmployeeCode?: string;
    vehicleId?: string;
    driverId?: string;
    destination?: string;
    origin?: string;
  }>;
  locations?: string[];
  departments?: string[];
};

const run = async () => {
  console.log(`[fleet-smoke] Base URL: ${BASE_URL}`);
  console.log(`[fleet-smoke] Employee / mail target: ${EMPLOYEE_CODE}`);

  const token = await createSessionToken({
    userId: `usr-${EMPLOYEE_CODE}`,
    username: EMPLOYEE_CODE,
    employeeId: EMPLOYEE_CODE,
    employeeCode: EMPLOYEE_CODE,
    fullName: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI',
    email: 'chrisogbaisi@dormanlongeng.com',
    department: 'INFORMATION TECHNOLOGY',
    unit: 'DLE',
    roles: ['Super Administrator', 'Driver Supervisor', 'Fleet Manager'],
    permissions: ['*'],
    status: 'Active',
    firstLoginRequired: false,
    passwordResetRequired: false,
  });

  const load = await apiFetch(token, 'GET', '/api/logistics-fleet');
  assertStep(load.response.ok, `GET /api/logistics-fleet failed (${load.response.status}): ${compact((load.json as { error?: string }).error)}`);
  let data = (load.json as { data?: FleetPayload }).data;
  assertStep(data, 'Fleet payload missing');

  const employee = (data.employees || []).find((item) => compact(item.employeeCode).toUpperCase() === EMPLOYEE_CODE)
    || { employeeCode: EMPLOYEE_CODE, fullName: 'Mr CHRISTIAN ONUWABHAGBE OGBAISI', department: 'INFORMATION TECHNOLOGY', location: (data.locations || [])[0] || 'Head Office' };

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const stamp = Date.now().toString().slice(-6);
  const custodianCode = employee.employeeCode;

  let vehicle = (data.vehicles || []).find((item) => ['Available', 'Assigned'].includes(item.status))
    || (data.vehicles || [])[0];
  if (!vehicle?.id) {
    console.log('[fleet-smoke] No vehicles found — creating smoke vehicle');
    const createVehicle = await apiFetch(token, 'POST', '/api/logistics-fleet', {
      entity: 'vehicle',
      record: {
        assetCode: `FLT-E2E-${stamp}`,
        plateNumber: `E2E-${stamp}`,
        vehicleType: 'SUV',
        makeModel: 'Toyota Land Cruiser',
        year: String(new Date().getFullYear()),
        location: employee.location || (data.locations || [])[0] || 'Head Office',
        department: employee.department || 'INFORMATION TECHNOLOGY',
        custodianEmployeeCode: custodianCode,
        insuranceExpiry: new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10),
        roadWorthinessExpiry: new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10),
        ownershipType: 'Purchase',
        status: 'Available',
        odometerKm: '12000',
        nextServiceKm: '15000',
      },
    });
    assertStep(createVehicle.response.ok, `Create vehicle failed (${createVehicle.response.status}): ${compact((createVehicle.json as { error?: string }).error)}`);
    data = (createVehicle.json as { data?: FleetPayload }).data;
    vehicle = (data?.vehicles || []).find((item) => item.assetCode === `FLT-E2E-${stamp}`) || (data?.vehicles || [])[0];
  }
  assertStep(vehicle?.id, 'No fleet vehicle available for allocation smoke test');

  let driver = (data?.drivers || []).find((item) =>
    (item.approvalStatus === 'Approved' || item.status === 'Available' || item.status === 'Assigned' || item.status === 'Compliance Blocked')
    && compact(item.employeeCode),
  ) || (data?.drivers || [])[0];

  if (!driver?.id) {
    console.log('[fleet-smoke] No drivers found — linking employee as driver');
    const createDriver = await apiFetch(token, 'POST', '/api/logistics-fleet', {
      entity: 'driver',
      record: {
        employeeCode: custodianCode,
        licenseNumber: `LIC-E2E-${stamp}`,
        licenseClass: 'B',
        licenseExpiry: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
        issuingAuthority: 'FRSC',
        medicalCertificateStatus: 'Valid',
        defensiveDrivingCertificate: 'Valid',
        driverCategory: 'Company Driver',
      },
    });
    assertStep(createDriver.response.ok, `Create driver failed (${createDriver.response.status}): ${compact((createDriver.json as { error?: string }).error)}`);
    data = (createDriver.json as { data?: FleetPayload }).data;
    driver = (data?.drivers || []).find((item) => compact(item.employeeCode).toUpperCase() === EMPLOYEE_CODE)
      || (data?.drivers || [])[0];
    if (driver?.id && driver.approvalStatus === 'Submitted') {
      const approveDriver = await apiFetch(token, 'POST', '/api/logistics-fleet', {
        entity: 'driver',
        id: driver.id,
        action: 'approve',
      });
      assertStep(approveDriver.response.ok, `Approve driver failed (${approveDriver.response.status}): ${compact((approveDriver.json as { error?: string }).error)}`);
      data = (approveDriver.json as { data?: FleetPayload }).data;
      driver = (data?.drivers || []).find((item) => item.id === driver!.id) || driver;
    }
  }
  assertStep(driver?.employeeCode, 'No fleet driver available for allocation smoke test.');

  console.log(`[fleet-smoke] Using vehicle ${vehicle.assetCode} / driver ${driver.employeeCode}`);

  // Ensure selected driver can operate (licence/fitness) before allocation.
  const prepareDriver = await apiFetch(token, 'POST', '/api/logistics-fleet', {
    action: 'update-record',
    entity: 'driver',
    id: driver.id,
    record: {
      licenseNumber: `SMOKE-${stamp}`,
      licenseClass: 'B',
      licenseExpiry: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      issuingAuthority: 'FRSC',
      medicalCertificateStatus: 'Valid',
      defensiveDrivingCertificate: 'Valid',
      driverCategory: 'Company Driver',
      availabilityStatus: 'Available',
      safetyScore: '95',
    },
  });
  assertStep(prepareDriver.response.ok, `Prepare driver failed (${prepareDriver.response.status}): ${compact((prepareDriver.json as { error?: string }).error)}`);
  console.log(`[fleet-smoke] Driver ${driver.employeeCode} prepared as compliant for allocation`);

  // Ensure vehicle is available for assignment.
  if (vehicle.status !== 'Available' && vehicle.status !== 'Assigned') {
    const prepareVehicle = await apiFetch(token, 'POST', '/api/logistics-fleet', {
      action: 'update-record',
      entity: 'vehicle',
      id: vehicle.id,
      record: { status: 'Available' },
    });
    assertStep(prepareVehicle.response.ok, `Prepare vehicle failed (${prepareVehicle.response.status}): ${compact((prepareVehicle.json as { error?: string }).error)}`);
  }

  // 1) Create & submit trip (PendingDriverSupervisor) -> supervisor emails
  const create = await apiFetch(token, 'POST', '/api/logistics-fleet', {
    entity: 'trip',
    record: {
      requesterEmployeeCode: employee.employeeCode,
      requesterDepartment: employee.department || (data?.departments || [])[0] || 'INFORMATION TECHNOLOGY',
      requesterLocation: employee.location || (data?.locations || [])[0] || 'Head Office',
      origin: 'DLE Head Office',
      destination: `E2E Smoke Site ${stamp}`,
      purpose: `End-to-end Logistics & Fleet email notification smoke test (${stamp})`,
      startDate: today,
      endDate: tomorrow,
      projectCode: `FLEET-E2E-${stamp}`,
      costCenter: 'LOGISTICS',
    },
  });
  assertStep(create.response.ok, `Create trip failed (${create.response.status}): ${compact((create.json as { error?: string }).error)}`);
  data = (create.json as { data?: FleetPayload }).data;
  const trip = (data?.trips || []).find((item) => String(item.destination || '').includes(stamp))
    || (data?.trips || []).find((item) => compact(item.requesterEmployeeCode).toUpperCase() === EMPLOYEE_CODE)
    || (data?.trips || [])[0];
  assertStep(trip?.id, 'Created trip not found in response');
  assertStep(
    ['PendingDriverSupervisor', 'PendingLineApproval', 'PendingFleetAllocation', 'Submitted'].includes(String(trip.status)),
    `Expected pending supervisor status, got ${trip.status}`,
  );
  console.log(`[fleet-smoke] 1/4 Submitted ${trip.requestNo} (${trip.id}) -> ${trip.status} [emails: supervisor queue]`);
  await sleep(1500);

  // 2) Approve & allocate -> requester / driver / dispatcher emails
  const allocate = await apiFetch(token, 'POST', '/api/logistics-fleet', {
    action: 'allocate-trip',
    tripId: trip.id,
    vehicleId: vehicle.id,
    driverEmployeeCode: driver.employeeCode,
  });
  assertStep(allocate.response.ok, `Allocate failed (${allocate.response.status}): ${compact((allocate.json as { error?: string }).error)}`);
  data = (allocate.json as { data?: FleetPayload }).data;
  const afterAllocate = (data?.trips || []).find((item) => item.id === trip.id);
  assertStep(afterAllocate?.status === 'ReadyToDispatch', `Expected ReadyToDispatch, got ${afterAllocate?.status}`);
  assertStep(afterAllocate?.vehicleId === vehicle.id, 'Allocation did not persist vehicleId');
  assertStep(compact(afterAllocate?.driverId).toUpperCase() === compact(driver.employeeCode).toUpperCase(), 'Allocation did not persist driverId');
  console.log(`[fleet-smoke] 2/4 Allocated ${trip.requestNo} -> ${afterAllocate?.status} vehicle=${vehicle.assetCode} driver=${driver.employeeCode} destination=${afterAllocate?.destination} [emails: requester allocation]`);
  await sleep(1500);

  // 3) Dispatch -> requester / driver emails
  const dispatch = await apiFetch(token, 'POST', '/api/logistics-fleet', {
    action: 'dispatch-trip',
    tripId: trip.id,
  });
  assertStep(dispatch.response.ok, `Dispatch failed (${dispatch.response.status}): ${compact((dispatch.json as { error?: string }).error)}`);
  data = (dispatch.json as { data?: FleetPayload }).data;
  const afterDispatch = (data?.trips || []).find((item) => item.id === trip.id);
  assertStep(afterDispatch?.status === 'Dispatched', `Expected Dispatched, got ${afterDispatch?.status}`);
  console.log(`[fleet-smoke] 3/4 Dispatched ${trip.requestNo} -> ${afterDispatch?.status} [emails: dispatch]`);
  await sleep(1500);

  // 4) Complete -> requester / supervisor emails
  const complete = await apiFetch(token, 'POST', '/api/logistics-fleet', {
    action: 'complete-trip',
    tripId: trip.id,
  });
  assertStep(complete.response.ok, `Complete failed (${complete.response.status}): ${compact((complete.json as { error?: string }).error)}`);
  data = (complete.json as { data?: FleetPayload }).data;
  const afterComplete = (data?.trips || []).find((item) => item.id === trip.id);
  assertStep(afterComplete?.status === 'Completed', `Expected Completed, got ${afterComplete?.status}`);
  console.log(`[fleet-smoke] 4/4 Completed ${trip.requestNo} -> ${afterComplete?.status} [emails: completion]`);

  // Allow async notification fire-and-forget to finish.
  await sleep(4000);

  console.log(JSON.stringify({
    ok: true,
    employeeCode: EMPLOYEE_CODE,
    tripId: trip.id,
    requestNo: trip.requestNo,
    destination: afterAllocate?.destination || trip.destination,
    vehicle: `${vehicle.assetCode} · ${vehicle.plateNumber}`,
    driverEmployeeCode: driver.employeeCode,
    stages: ['PendingDriverSupervisor', 'ReadyToDispatch', 'Dispatched', 'Completed'],
    emailStages: [
      'submit → Driver Supervisor approval request',
      'allocate → requester allocation status + vehicle/driver/destination',
      'dispatch → requester/driver dispatch notice',
      'complete → requester completion notice',
    ],
    note: `Check inbox for ${EMPLOYEE_CODE}. Portal notifications also created for Logistics & Fleet.`,
  }, null, 2));
};

run()
  .catch((error) => {
    console.error('[fleet-smoke] FAILED:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    // Avoid hanging open SQL handles from imported auth/session helpers.
    setTimeout(() => process.exit(process.exitCode || 0), 250);
  });
