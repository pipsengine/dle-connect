import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { readMobileAttendancePolicies } from '@/lib/mobile-attendance-store';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';

export type EssGpsCoordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  addressLabel?: string | null;
};

export type EssMobileClockSession = {
  id: string;
  employeeCode: string;
  employeeName: string;
  workDate: string;
  clockInAt: string;
  clockOutAt: string | null;
  clockInLatitude: number;
  clockInLongitude: number;
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
  locationLabel: string;
  siteName: string;
  gpsAccuracyMeters: number | null;
  geofenceResult: 'Inside Fence' | 'Near Edge' | 'Outside Fence';
  source: string;
};

export type EssMobileAttendanceRecord = {
  date: string;
  clockIn: string;
  clockOut: string;
  status: string;
  source: string;
  locationLabel?: string;
  siteName?: string;
  geofenceResult?: string;
};

const dbReady = { value: false };
const clean = (value: unknown) => String(value || '').trim();

const SITE_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  'Head Office': { latitude: 6.5244, longitude: 3.3792 },
  'Onne Yard': { latitude: 4.7167, longitude: 7.0833 },
  'Fabrication Yard': { latitude: 5.5167, longitude: 5.75 },
  'Marine Base': { latitude: 4.4333, longitude: 7.1667 },
  'Liaison Office': { latitude: 9.0765, longitude: 7.3986 },
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatClockTime = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const ensureDb = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) throw new Error('DLE Enterprise database connection is not available.');
  if (!dbReady.value) {
    await pool.request().query(`
IF OBJECT_ID(N'[hris].[EssMobileClockSessions]', N'U') IS NULL
CREATE TABLE [hris].[EssMobileClockSessions] (
  [Id] NVARCHAR(120) NOT NULL CONSTRAINT [PK_EssMobileClockSessions] PRIMARY KEY,
  [EmployeeCode] NVARCHAR(80) NOT NULL,
  [EmployeeName] NVARCHAR(180) NOT NULL,
  [WorkDate] DATE NOT NULL,
  [ClockInAt] DATETIME2 NOT NULL,
  [ClockOutAt] DATETIME2 NULL,
  [ClockInLatitude] DECIMAL(10,7) NOT NULL,
  [ClockInLongitude] DECIMAL(10,7) NOT NULL,
  [ClockOutLatitude] DECIMAL(10,7) NULL,
  [ClockOutLongitude] DECIMAL(10,7) NULL,
  [LocationLabel] NVARCHAR(220) NOT NULL,
  [SiteName] NVARCHAR(120) NOT NULL,
  [GpsAccuracyMeters] DECIMAL(8,2) NULL,
  [GeofenceResult] NVARCHAR(40) NOT NULL,
  [Source] NVARCHAR(60) NOT NULL CONSTRAINT [DF_EssMobileClockSessions_Source] DEFAULT ('ESS Mobile'),
  [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_EssMobileClockSessions_CreatedAt] DEFAULT SYSUTCDATETIME(),
  [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_EssMobileClockSessions_UpdatedAt] DEFAULT SYSUTCDATETIME()
);
CREATE INDEX [IX_EssMobileClockSessions_EmployeeDate] ON [hris].[EssMobileClockSessions]([EmployeeCode],[WorkDate]);
`);
    dbReady.value = true;
  }
  return pool;
};

export const resolveEssLocationFromGps = async (
  gps: EssGpsCoordinates,
  employee: Pick<DleEmployeeDirectoryRow, 'workLocation' | 'location' | 'officeLocation' | 'projectSite'>,
) => {
  const policies = await readMobileAttendancePolicies().catch(() => []);
  const assignedLocation = clean(employee.workLocation || employee.location || employee.officeLocation || employee.projectSite);
  let nearestSite = assignedLocation || 'Remote Site';
  let nearestLocation = assignedLocation || 'Detected location';
  let nearestDistance = Number.POSITIVE_INFINITY;
  let allowedRadius = 500;

  for (const policy of policies) {
    const coords = SITE_COORDINATES[policy.site];
    if (!coords) continue;
    const distance = haversineMeters(gps.latitude, gps.longitude, coords.latitude, coords.longitude);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSite = policy.site;
      nearestLocation = policy.location;
      allowedRadius = policy.allowedRadiusMeters;
    }
  }

  if (assignedLocation) {
    const matchedPolicy = policies.find(
      (policy) =>
        assignedLocation.toLowerCase().includes(policy.location.toLowerCase()) ||
        assignedLocation.toLowerCase().includes(policy.site.toLowerCase()),
    );
    if (matchedPolicy) {
      nearestSite = matchedPolicy.site;
      nearestLocation = matchedPolicy.location;
      allowedRadius = matchedPolicy.allowedRadiusMeters;
    }
  }

  const geofenceResult: EssMobileClockSession['geofenceResult'] =
    nearestDistance <= allowedRadius
      ? 'Inside Fence'
      : nearestDistance <= allowedRadius * 1.5
        ? 'Near Edge'
        : 'Outside Fence';

  const addressLabel = clean(gps.addressLabel);
  const locationLabel = addressLabel || `${nearestLocation} · ${nearestSite}`;

  return {
    locationLabel,
    siteName: nearestSite,
    geofenceResult,
    distanceMeters: Number.isFinite(nearestDistance) ? Math.round(nearestDistance) : null,
  };
};

const mapSession = (row: Record<string, unknown>): EssMobileClockSession => ({
  id: clean(row.Id),
  employeeCode: clean(row.EmployeeCode),
  employeeName: clean(row.EmployeeName),
  workDate: row.WorkDate instanceof Date ? row.WorkDate.toISOString().slice(0, 10) : clean(row.WorkDate),
  clockInAt: row.ClockInAt instanceof Date ? row.ClockInAt.toISOString() : clean(row.ClockInAt),
  clockOutAt: row.ClockOutAt instanceof Date ? row.ClockOutAt.toISOString() : row.ClockOutAt ? clean(row.ClockOutAt) : null,
  clockInLatitude: Number(row.ClockInLatitude || 0),
  clockInLongitude: Number(row.ClockInLongitude || 0),
  clockOutLatitude: row.ClockOutLatitude === null || row.ClockOutLatitude === undefined ? null : Number(row.ClockOutLatitude),
  clockOutLongitude: row.ClockOutLongitude === null || row.ClockOutLongitude === undefined ? null : Number(row.ClockOutLongitude),
  locationLabel: clean(row.LocationLabel),
  siteName: clean(row.SiteName),
  gpsAccuracyMeters: row.GpsAccuracyMeters === null || row.GpsAccuracyMeters === undefined ? null : Number(row.GpsAccuracyMeters),
  geofenceResult: (clean(row.GeofenceResult) || 'Outside Fence') as EssMobileClockSession['geofenceResult'],
  source: clean(row.Source) || 'ESS Mobile',
});

export const getEssMobileTodaySession = async (employeeCode: string) => {
  const pool = await ensureDb();
  const result = await pool.request()
    .input('EmployeeCode', sql.NVarChar(80), clean(employeeCode))
    .input('WorkDate', sql.Date, todayIso())
    .query(`
      SELECT TOP 1 * FROM [hris].[EssMobileClockSessions]
      WHERE [EmployeeCode]=@EmployeeCode AND [WorkDate]=@WorkDate
      ORDER BY [ClockInAt] DESC;
    `);
  const row = result.recordset[0];
  return row ? mapSession(row) : null;
};

export const listEssMobileAttendanceRecords = async (employeeCodes: string[], limit = 10): Promise<EssMobileAttendanceRecord[]> => {
  const codes = [...new Set(employeeCodes.map((code) => clean(code)).filter(Boolean))];
  if (!codes.length) return [];
  const pool = await ensureDb();
  const request = pool.request();
  codes.forEach((code, index) => request.input(`Code${index}`, sql.NVarChar(80), code));
  const placeholders = codes.map((_, index) => `@Code${index}`).join(',');
  const result = await request.query(`
    SELECT TOP (${Math.max(1, limit)})
      [WorkDate],[ClockInAt],[ClockOutAt],[LocationLabel],[SiteName],[GeofenceResult],[Source]
    FROM [hris].[EssMobileClockSessions]
    WHERE [EmployeeCode] IN (${placeholders})
    ORDER BY [WorkDate] DESC, [ClockInAt] DESC;
  `);
  return (result.recordset || []).map((row) => ({
    date: row.WorkDate instanceof Date ? row.WorkDate.toISOString().slice(0, 10) : clean(row.WorkDate),
    clockIn: formatClockTime(row.ClockInAt),
    clockOut: row.ClockOutAt ? formatClockTime(row.ClockOutAt) : '—',
    status: row.ClockOutAt ? 'Present' : 'Clocked In',
    source: 'ESS Mobile',
    locationLabel: clean(row.LocationLabel),
    siteName: clean(row.SiteName),
    geofenceResult: clean(row.GeofenceResult),
  }));
};

export const recordEssMobileClockIn = async (
  employee: DleEmployeeDirectoryRow,
  gps: EssGpsCoordinates,
) => {
  const employeeCode = clean(employee.employeeCode || employee.employeeId);
  if (!employeeCode) throw new Error('Employee code is required for mobile clock-in.');
  if (!Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
    throw new Error('GPS coordinates are required for remote clock-in.');
  }

  const existing = await getEssMobileTodaySession(employeeCode);
  if (existing && !existing.clockOutAt) throw new Error('You are already clocked in. Clock out before starting a new session.');

  const resolved = await resolveEssLocationFromGps(gps, employee);
  const id = `ess-mob-${employeeCode.toLowerCase()}-${todayIso()}-${Date.now()}`;
  const pool = await ensureDb();
  const now = new Date();
  await pool.request()
    .input('Id', sql.NVarChar(120), id)
    .input('EmployeeCode', sql.NVarChar(80), employeeCode)
    .input('EmployeeName', sql.NVarChar(180), clean(employee.fullName) || employeeCode)
    .input('WorkDate', sql.Date, todayIso())
    .input('ClockInAt', sql.DateTime2, now)
    .input('ClockInLatitude', sql.Decimal(10, 7), gps.latitude)
    .input('ClockInLongitude', sql.Decimal(10, 7), gps.longitude)
    .input('LocationLabel', sql.NVarChar(220), resolved.locationLabel)
    .input('SiteName', sql.NVarChar(120), resolved.siteName)
    .input('GpsAccuracyMeters', sql.Decimal(8, 2), gps.accuracyMeters ?? null)
    .input('GeofenceResult', sql.NVarChar(40), resolved.geofenceResult)
  .query(`
    INSERT INTO [hris].[EssMobileClockSessions]
      ([Id],[EmployeeCode],[EmployeeName],[WorkDate],[ClockInAt],[ClockInLatitude],[ClockInLongitude],[LocationLabel],[SiteName],[GpsAccuracyMeters],[GeofenceResult])
    VALUES
      (@Id,@EmployeeCode,@EmployeeName,@WorkDate,@ClockInAt,@ClockInLatitude,@ClockInLongitude,@LocationLabel,@SiteName,@GpsAccuracyMeters,@GeofenceResult);
  `);

  return {
    session: await getEssMobileTodaySession(employeeCode),
    location: resolved,
    message: `Clocked in at ${formatClockTime(now)} from ${resolved.locationLabel}.`,
  };
};

export const recordEssMobileClockOut = async (
  employee: DleEmployeeDirectoryRow,
  gps: EssGpsCoordinates,
) => {
  const employeeCode = clean(employee.employeeCode || employee.employeeId);
  if (!employeeCode) throw new Error('Employee code is required for mobile clock-out.');
  if (!Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
    throw new Error('GPS coordinates are required for remote clock-out.');
  }

  const existing = await getEssMobileTodaySession(employeeCode);
  if (!existing) throw new Error('No active clock-in session was found for today.');
  if (existing.clockOutAt) throw new Error('You have already clocked out for today.');

  const resolved = await resolveEssLocationFromGps(gps, employee);
  const pool = await ensureDb();
  const now = new Date();
  await pool.request()
    .input('Id', sql.NVarChar(120), existing.id)
    .input('ClockOutAt', sql.DateTime2, now)
    .input('ClockOutLatitude', sql.Decimal(10, 7), gps.latitude)
    .input('ClockOutLongitude', sql.Decimal(10, 7), gps.longitude)
    .input('LocationLabel', sql.NVarChar(220), resolved.locationLabel)
    .input('SiteName', sql.NVarChar(120), resolved.siteName)
    .input('GpsAccuracyMeters', sql.Decimal(8, 2), gps.accuracyMeters ?? null)
    .input('GeofenceResult', sql.NVarChar(40), resolved.geofenceResult)
    .query(`
      UPDATE [hris].[EssMobileClockSessions]
      SET [ClockOutAt]=@ClockOutAt,
          [ClockOutLatitude]=@ClockOutLatitude,
          [ClockOutLongitude]=@ClockOutLongitude,
          [LocationLabel]=@LocationLabel,
          [SiteName]=@SiteName,
          [GpsAccuracyMeters]=@GpsAccuracyMeters,
          [GeofenceResult]=@GeofenceResult,
          [UpdatedAt]=SYSUTCDATETIME()
      WHERE [Id]=@Id;
    `);

  return {
    session: await getEssMobileTodaySession(employeeCode),
    location: resolved,
    message: `Clocked out at ${formatClockTime(now)} from ${resolved.locationLabel}.`,
  };
};

export const mergeEssAttendanceRecords = (
  biometricRecords: EssMobileAttendanceRecord[],
  mobileRecords: EssMobileAttendanceRecord[],
) => {
  const byDate = new Map<string, EssMobileAttendanceRecord>();
  for (const record of biometricRecords) byDate.set(record.date, record);
  for (const record of mobileRecords) {
    const existing = byDate.get(record.date);
    if (!existing || existing.source === 'ESS Mobile') {
      byDate.set(record.date, record);
      continue;
    }
    if (record.date === todayIso() && (!existing.clockIn || existing.clockIn === '—')) {
      byDate.set(record.date, { ...existing, ...record, source: 'ESS Mobile' });
    }
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
};
