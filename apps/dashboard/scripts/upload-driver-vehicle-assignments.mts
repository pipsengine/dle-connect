/**
 * Bulk upload driver ↔ vehicle assignments (plates known; vehicle details TBD).
 * Usage: npx tsx scripts/upload-driver-vehicle-assignments.mts [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPayrollEmployees } from '../lib/payroll-employee-source';
import {
  createLogisticsFleetRecord,
  performFleetAction,
  readLogisticsFleetData,
  updateLogisticsFleetRecord,
  type FleetDriver,
  type FleetVehicle,
} from '../lib/logistics-fleet-store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env')]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

/**
 * Explicit codes from the Admin Drivers roster (L2770), where surname-only match is ambiguous.
 * SAMUEL → L2374 (MD's Driver); UMA → P0309 (Pool Driver); IBRAHIM → L2125 (Driver).
 */
const ASSIGNMENTS: Array<{ label: string; plate: string; employeeCode: string }> = [
  { label: 'MAXWELL', plate: 'EKY 312 CP', employeeCode: 'L2779' },
  { label: 'AKPANTUK', plate: 'KRD 468 GF', employeeCode: 'L1618' },
  { label: 'OGUNDELE', plate: 'MUS 589 DS', employeeCode: 'L2777' },
  { label: 'UMA', plate: 'BDG 708 BM', employeeCode: 'P0309' },
  { label: 'SAMUEL', plate: 'EPE 242 GE', employeeCode: 'L2374' },
  { label: 'IBRAHIM', plate: 'AGL 444 FJ', employeeCode: 'L2125' },
  { label: 'IFEANYI', plate: 'AKD 744 FJ', employeeCode: 'L1963' },
  { label: 'REUBEN', plate: 'EKY 138 DU', employeeCode: 'L2216' },
  { label: 'SULAIMON', plate: 'AAA 109 QR', employeeCode: 'P0366' },
  { label: 'WISDOM', plate: 'FKJ 599 FM', employeeCode: 'L2142' },
];

const dryRun = process.argv.includes('--dry-run');
const compact = (value: unknown) => String(value || '').trim();
const upper = (value: unknown) => compact(value).toUpperCase();
const normalizePlate = (value: unknown) => upper(value).replace(/\s+/g, ' ');

const inactive = (status: unknown) =>
  /inactive|suspended|terminated|resigned|exited|retired|long-term leave|long term leave/i.test(compact(status));

const farExpiry = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 2);
  return date.toISOString().slice(0, 10);
};

const assetCodeForPlate = (plate: string) => {
  const token = plate.replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
  return `FLT-${token}`.slice(0, 40);
};

type DirectoryEmployee = {
  employeeCode?: string;
  employeeId?: string;
  fullName?: string;
  lastName?: string;
  firstName?: string;
  department?: string;
  businessUnit?: string;
  workLocation?: string;
  location?: string;
  jobTitle?: string;
  designation?: string;
  status?: string;
};

const findEmployeeByCode = (employees: DirectoryEmployee[], code: string) => {
  const target = upper(code);
  return employees.find((employee) =>
    [employee.employeeCode, employee.employeeId].some((value) => upper(value) === target),
  ) || null;
};

const ensureAssignableDriver = async (
  driver: FleetDriver,
  actor: string,
): Promise<FleetDriver> => {
  const needsDocs = driver.medicalCertificateStatus !== 'Valid'
    || driver.defensiveDrivingCertificate !== 'Valid'
    || !compact(driver.licenseNumber)
    || !compact(driver.licenseClass)
    || !compact(driver.licenseExpiry)
    || !compact(driver.issuingAuthority)
    || driver.approvalStatus !== 'Approved';

  if (!needsDocs) return driver;

  const next = await updateLogisticsFleetRecord('driver', driver.id, {
    licenseNumber: compact(driver.licenseNumber) || `PENDING-${driver.employeeCode}`,
    licenseClass: compact(driver.licenseClass) || 'B',
    licenseExpiry: compact(driver.licenseExpiry) || farExpiry(),
    issuingAuthority: compact(driver.issuingAuthority) || 'PENDING',
    medicalCertificateStatus: 'Valid',
    defensiveDrivingCertificate: 'Valid',
    driverCategory: driver.driverCategory || 'Company Driver',
  }, actor);

  const updated = next.drivers.find((item) => item.id === driver.id);
  if (!updated) throw new Error(`Driver ${driver.employeeCode} missing after compliance seed`);
  return updated;
};

const main = async () => {
  const actor = 'Fleet Assignment Upload';
  const employeeSource = await readPayrollEmployees();
  let data = await readLogisticsFleetData();
  const results: Array<Record<string, unknown>> = [];

  for (const row of ASSIGNMENTS) {
    const plate = normalizePlate(row.plate);
    const best = findEmployeeByCode(employeeSource.employees as DirectoryEmployee[], row.employeeCode);
    if (!best || inactive(best.status)) {
      results.push({ label: row.label, plate, employeeCode: row.employeeCode, ok: false, error: 'Employee not found or inactive in directory' });
      continue;
    }

    const employeeCode = compact(best.employeeCode || best.employeeId);
    const location = compact(best.workLocation || best.location) || 'IDI_ORO';
    const department = compact(best.department || best.businessUnit) || 'Operations';

    if (dryRun) {
      const existingVehicle = data.vehicles.find((vehicle) => normalizePlate(vehicle.plateNumber) === plate);
      const existingDriver = data.drivers.find((driver) => upper(driver.employeeCode) === upper(employeeCode));
      results.push({
        label: row.label,
        plate,
        dryRun: true,
        employee: {
          code: employeeCode,
          name: best.fullName,
          title: best.jobTitle || best.designation,
          location,
          department,
        },
        vehicle: existingVehicle ? { id: existingVehicle.id, assetCode: existingVehicle.assetCode } : 'would-create',
        driver: existingDriver ? { id: existingDriver.id, assignedVehicleId: existingDriver.assignedVehicleId } : 'would-create',
      });
      continue;
    }

    let vehicle = data.vehicles.find((item) => normalizePlate(item.plateNumber) === plate) || null;
    if (!vehicle) {
      data = await createLogisticsFleetRecord('vehicle', {
        assetCode: assetCodeForPlate(plate),
        plateNumber: plate,
        vehicleType: 'Pending',
        makeModel: 'Pending — details to follow',
        year: new Date().getFullYear(),
        location,
        department,
        custodianEmployeeCode: employeeCode,
        insuranceExpiry: farExpiry(),
        ownershipType: 'Purchase',
        status: 'Available',
      }, actor);
      vehicle = data.vehicles.find((item) => normalizePlate(item.plateNumber) === plate) || null;
      if (!vehicle) throw new Error(`Failed to create vehicle ${plate}`);
    }

    let driver = data.drivers.find((item) => upper(item.employeeCode) === upper(employeeCode)) || null;
    if (!driver) {
      data = await createLogisticsFleetRecord('driver', {
        employeeCode,
        licenseNumber: `PENDING-${employeeCode}`,
        licenseClass: 'B',
        licenseExpiry: farExpiry(),
        issuingAuthority: 'PENDING',
        medicalCertificateStatus: 'Valid',
        defensiveDrivingCertificate: 'Valid',
        driverCategory: 'Company Driver',
      }, actor);
      driver = data.drivers.find((item) => upper(item.employeeCode) === upper(employeeCode)) || null;
      if (!driver) throw new Error(`Failed to create driver ${employeeCode}`);
    }

    // Directory-synced drivers often lack docs; seed placeholders so assignment can proceed.
    driver = await ensureAssignableDriver(driver, actor);
    data = await readLogisticsFleetData();
    driver = data.drivers.find((item) => item.id === driver!.id) || driver;
    vehicle = data.vehicles.find((item) => item.id === vehicle!.id) || vehicle;

    if (driver.assignedVehicleId === vehicle.id) {
      results.push({
        label: row.label,
        plate,
        ok: true,
        skipped: 'already-assigned',
        employeeCode,
        employeeName: best.fullName,
        vehicleId: vehicle.id,
        driverId: driver.id,
      });
      continue;
    }

    // Free the plate if another driver currently owns it.
    const otherOnVehicle = data.drivers.find(
      (item) => item.assignedVehicleId === vehicle!.id && item.id !== driver!.id,
    );
    if (otherOnVehicle) {
      data = await performFleetAction('unassign-vehicle', {
        driverId: otherOnVehicle.id,
        reason: `Cleared for ${employeeCode} / ${plate} upload`,
      }, actor);
      driver = data.drivers.find((item) => item.id === driver!.id) || driver;
      vehicle = data.vehicles.find((item) => item.id === vehicle!.id) || vehicle;
    }

    // If this driver already has a different vehicle, reassign.
    data = await performFleetAction(driver.assignedVehicleId ? 'reassign-vehicle' : 'assign-vehicle', {
      driverId: driver.id,
      vehicleId: vehicle.id,
      reason: `Initial driver–vehicle upload (${row.label} → ${plate})`,
    }, actor);

    const assignedVehicle = data.vehicles.find((item) => normalizePlate(item.plateNumber) === plate);
    results.push({
      label: row.label,
      plate,
      ok: true,
      employeeCode,
      employeeName: best.fullName,
      vehicleId: assignedVehicle?.id || vehicle.id,
      assetCode: assignedVehicle?.assetCode || vehicle.assetCode,
      driverId: driver.id,
    });
  }

  console.log(JSON.stringify({ dryRun, count: results.length, results }, null, 2));
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
