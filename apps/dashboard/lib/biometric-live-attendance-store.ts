import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { AttendanceStatus, BiometricSource, Shift } from '@/lib/attendance-data';

export type LiveAttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  businessUnit: string;
  department: string;
  jobTitle: string;
  location: string;
  site: string;
  shift: Shift;
  status: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  minutesLate: number;
  overtimeHours: number;
  biometricSource: BiometricSource;
  supervisor: string;
};

export type LiveAttendancePunch = {
  id: string;
  employeeId: string;
  employeeName: string;
  punchDate: string;
  punchTime: string;
  terminalId: number | null;
  terminalName: string;
  mode: number | null;
  matchingType: number | null;
  result: number | null;
};

export type LiveClockingActivityRecord = LiveAttendanceRecord & {
  punchCount: number;
};

type RawAttendanceRow = RowDataPacket & {
  uid: number;
  uniqueCode: string | null;
  employeeName: string | null;
  officeCode: string | null;
  officeName: string | null;
  postCode: string | null;
  postName: string | null;
  staffName: string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  punchCount: number;
  terminalId: number | null;
  terminalName: string | null;
};

type RawPunchRow = RowDataPacket & {
  punchId: number | string;
  uid: number;
  uniqueCode: string | null;
  employeeName: string | null;
  punchDate: string;
  punchTime: string;
  terminalId: number | null;
  terminalName: string | null;
  mode: number | null;
  matchingType: number | null;
  result: number | null;
};

const MYSQL_DATE_RE = /^\d{8}$/;
const DEFAULT_SCHEDULE_START = '08:00';
const DEFAULT_SCHEDULE_END = '17:00';
const LATE_GRACE_MINUTES = 24;
const DAILY_ATTENDANCE_EXCLUDED_CODE_PREFIXES = new Set(['', '-', 'F', 'O', 'V']);
const LIVE_ATTENDANCE_CACHE_MS = Number(process.env.LIVE_ATTENDANCE_CACHE_MS || 10000);
const LIVE_ATTENDANCE_STALE_MS = Number(process.env.LIVE_ATTENDANCE_STALE_MS || 300000);
const LIVE_ATTENDANCE_DISK_STALE_MS = Number(process.env.LIVE_ATTENDANCE_DISK_STALE_MS || 43200000);

const resolveDashboardRoot = () => {
  const cwd = process.cwd();
  const dashboardSuffix = path.join('apps', 'dashboard');
  return cwd.endsWith(dashboardSuffix) ? cwd : path.join(cwd, dashboardSuffix);
};

const LIVE_CACHE_DIR = path.join(resolveDashboardRoot(), 'data', 'hris', '.live-cache');

type LiveCacheEntry<T> = {
  value?: T;
  expiresAt: number;
  staleUntil: number;
  pending?: Promise<T>;
};

const liveCache = new Map<string, LiveCacheEntry<unknown>>();

const cacheFileForKey = (key: string) => path.join(LIVE_CACHE_DIR, `${key.replace(/[^a-z0-9_-]+/gi, '_')}.json`);

const readDiskCache = async <T>(key: string): Promise<LiveCacheEntry<T> | null> => {
  try {
    const raw = await readFile(cacheFileForKey(key), 'utf8');
    const parsed = JSON.parse(raw) as LiveCacheEntry<T>;
    return parsed?.value ? parsed : null;
  } catch {
    return null;
  }
};

const writeDiskCache = async <T>(key: string, value: T) => {
  try {
    await mkdir(LIVE_CACHE_DIR, { recursive: true });
    const now = Date.now();
    await writeFile(
      cacheFileForKey(key),
      JSON.stringify({
        value,
        expiresAt: now + LIVE_ATTENDANCE_CACHE_MS,
        staleUntil: now + LIVE_ATTENDANCE_DISK_STALE_MS,
      }),
      'utf8',
    );
  } catch {
    // Disk cache is an optimization only; live reads should not fail because it is unavailable.
  }
};

const storeLiveCache = async <T>(key: string, value: T) => {
  liveCache.set(key, {
    value,
    expiresAt: Date.now() + LIVE_ATTENDANCE_CACHE_MS,
    staleUntil: Date.now() + LIVE_ATTENDANCE_STALE_MS,
  });
  await writeDiskCache(key, value);
};

const cachedLiveRead = async <T>(key: string, loader: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  const entry = liveCache.get(key) as LiveCacheEntry<T> | undefined;

  if (entry?.value && entry.expiresAt > now) return entry.value;

  if (entry?.value && entry.staleUntil > now) {
    if (!entry.pending) {
      entry.pending = loader()
        .then((value) => {
          void storeLiveCache(key, value);
          return value;
        })
        .catch((error) => {
          liveCache.set(key, {
            value: entry.value,
            expiresAt: Date.now() + LIVE_ATTENDANCE_CACHE_MS,
            staleUntil: Date.now() + LIVE_ATTENDANCE_STALE_MS,
          });
          throw error;
        });
      entry.pending.catch(() => undefined);
      liveCache.set(key, entry);
    }
    return entry.value;
  }

  if (entry?.pending) return entry.pending;

  const diskEntry = await readDiskCache<T>(key);
  if (diskEntry?.value && diskEntry.staleUntil > now) {
    const pending = loader()
      .then((value) => {
        void storeLiveCache(key, value);
        return value;
      })
      .catch(() => diskEntry.value as T);
    const diskBackedEntry: LiveCacheEntry<T> = {
      value: diskEntry.value,
      expiresAt: now + LIVE_ATTENDANCE_CACHE_MS,
      staleUntil: now + LIVE_ATTENDANCE_STALE_MS,
      pending,
    };
    pending.catch(() => undefined);
    liveCache.set(key, diskBackedEntry);
    return diskEntry.value;
  }

  const pending = loader().then((value) => {
    void storeLiveCache(key, value);
    return value;
  });
  liveCache.set(key, {
    pending,
    expiresAt: 0,
    staleUntil: 0,
  });
  return pending;
};

const getPool = () =>
  mysql.createPool({
    host: process.env.BIOMETRIC_DB_HOST || '192.168.5.5',
    port: Number(process.env.BIOMETRIC_DB_PORT || 3306),
    user: process.env.BIOMETRIC_DB_USER || 'root',
    password: process.env.BIOMETRIC_DB_PASSWORD,
    database: process.env.BIOMETRIC_DB_NAME || 'unis',
    waitForConnections: true,
    connectionLimit: 4,
    connectTimeout: Number(process.env.BIOMETRIC_DB_CONNECT_TIMEOUT || 20000),
  });

const formatMysqlDate = (date = new Date()) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

const displayDate = (mysqlDate: string) => `${mysqlDate.slice(0, 4)}-${mysqlDate.slice(4, 6)}-${mysqlDate.slice(6, 8)}`;
const displayTime = (mysqlTime: string | null) => mysqlTime ? `${mysqlTime.slice(0, 2)}:${mysqlTime.slice(2, 4)}` : null;
const displayDateTime = (mysqlDate: string, mysqlTime: string) => `${displayDate(mysqlDate)}T${displayTime(mysqlTime)}:00+01:00`;

const minutesFromTime = (time: string | null) => {
  if (!time) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(2, 4));
};

const resolveShift = (firstPunch: string | null): Shift => {
  const minutes = minutesFromTime(firstPunch);
  if (minutes === null) return 'Day';
  return minutes < 360 || minutes >= 1080 ? 'Night' : 'Day';
};

const scheduleForShift = (shift: Shift) => {
  if (shift === 'Night') return { start: '18:00', end: '06:00' };
  return { start: DEFAULT_SCHEDULE_START, end: DEFAULT_SCHEDULE_END };
};

const isDailyAttendanceEmployeeCode = (code: string | null) => {
  const prefix = (code || '').trim().slice(0, 1).toUpperCase();
  return !DAILY_ATTENDANCE_EXCLUDED_CODE_PREFIXES.has(prefix);
};

const resolveStatus = (firstPunch: string | null, minutesLate: number): AttendanceStatus => {
  if (!firstPunch) return 'Absent';
  return minutesLate >= LATE_GRACE_MINUTES ? 'Late' : 'Present';
};

const calculateMinutesLate = (firstPunch: string | null, scheduledStart: string) => {
  const first = minutesFromTime(firstPunch);
  if (first === null) return 0;
  const [hour, minute] = scheduledStart.split(':').map(Number);
  const start = hour * 60 + minute;
  return Math.max(0, first - start);
};

const calculateOvertime = (firstPunch: string | null, lastPunch: string | null) => {
  const first = minutesFromTime(firstPunch);
  const last = minutesFromTime(lastPunch);
  if (first === null || last === null || first === last) return 0;
  const span = last >= first ? last - first : last + 1440 - first;
  return Math.round(Math.max(0, span / 60 - 9) * 10) / 10;
};

const resolveLiveAttendanceDateRaw = async (requestedDate?: string) => {
  const target = requestedDate?.replace(/-/g, '') || formatMysqlDate();
  if (!MYSQL_DATE_RE.test(target)) throw new Error('Attendance date must be in YYYY-MM-DD format.');

  const pool = getPool();
  try {
    const [exactRows] = await pool.query<Array<RowDataPacket & { punchDate: string | null }>>(
      'SELECT MAX(C_Date) AS punchDate FROM tenter WHERE C_Date = ?',
      [target],
    );
    if (exactRows[0]?.punchDate) return exactRows[0].punchDate;

    const [latestRows] = await pool.query<Array<RowDataPacket & { punchDate: string | null }>>(
      'SELECT MAX(C_Date) AS punchDate FROM tenter WHERE C_Date <= ?',
      [target],
    );
    if (latestRows[0]?.punchDate) return latestRows[0].punchDate;

    throw new Error('No biometric attendance punches were found.');
  } finally {
    await pool.end();
  }
};

export const resolveLiveAttendanceDate = async (requestedDate?: string) =>
  cachedLiveRead(`attendance-date:${requestedDate || 'today'}`, () => resolveLiveAttendanceDateRaw(requestedDate));

const readLiveDailyAttendanceRaw = async (requestedDate?: string): Promise<{ attendanceDate: string; records: LiveAttendanceRecord[] }> => {
  const attendanceDate = await resolveLiveAttendanceDate(requestedDate);
  const pool = getPool();

  try {
    const [rows] = await pool.query<RawAttendanceRow[]>(
      `
      SELECT
        u.L_ID AS uid,
        u.C_Unique AS uniqueCode,
        u.C_Name AS employeeName,
        emp.C_Office AS officeCode,
        COALESCE(NULLIF(o.C_Name, ''), emp.C_Office, 'Unassigned') AS officeName,
        emp.C_Post AS postCode,
        COALESCE(NULLIF(p.C_Name, ''), emp.C_Post, 'Unassigned') AS postName,
        COALESCE(NULLIF(s.C_Name, ''), 'Employee') AS staffName,
        punches.firstPunch,
        punches.lastPunch,
        COALESCE(punches.punchCount, 0) AS punchCount,
        punches.terminalId,
        COALESCE(NULLIF(t.C_Name, ''), NULLIF(o.C_Name, ''), 'Biometric Terminal') AS terminalName
      FROM tuser u
      LEFT JOIN temploye emp ON emp.L_UID = u.L_ID
      LEFT JOIN coffice o ON o.C_Code = emp.C_Office
      LEFT JOIN cpost p ON p.C_Code = emp.C_Post
      LEFT JOIN cstaff s ON s.C_Code = emp.C_Staff
      LEFT JOIN (
        SELECT
          L_UID,
          MIN(C_Time) AS firstPunch,
          MAX(C_Time) AS lastPunch,
          COUNT(*) AS punchCount,
          MIN(L_TID) AS terminalId
        FROM tenter
        WHERE C_Date = ?
        GROUP BY L_UID
      ) punches ON punches.L_UID = u.L_ID
      LEFT JOIN tterminal t ON t.L_ID = punches.terminalId
      ORDER BY u.C_Name
      `,
      [attendanceDate],
    );

    const attendanceEmployees = rows.filter((row) => isDailyAttendanceEmployeeCode(row.uniqueCode));

    return {
      attendanceDate: displayDate(attendanceDate),
      records: attendanceEmployees.map((row) => {
        const shift = resolveShift(row.firstPunch);
        const schedule = scheduleForShift(shift);
        const minutesLate = calculateMinutesLate(row.firstPunch, schedule.start);
        const status = resolveStatus(row.firstPunch, minutesLate);
        const employeeCode = (row.uniqueCode || String(row.uid)).trim();
        const officeName = row.officeName || 'Unassigned';
        const postName = row.postName || 'Unassigned';

        return {
          id: `live-att-${attendanceDate}-${row.uid}`,
          employeeId: employeeCode,
          employeeName: String(row.employeeName || `Employee ${row.uid}`),
          businessUnit: officeName,
          department: postName,
          jobTitle: row.staffName || postName,
          location: officeName,
          site: row.terminalName || officeName,
          shift,
          status,
          checkInTime: displayTime(row.firstPunch),
          checkOutTime: row.punchCount > 1 ? displayTime(row.lastPunch) : null,
          scheduledStart: schedule.start,
          scheduledEnd: schedule.end,
          minutesLate,
          overtimeHours: calculateOvertime(row.firstPunch, row.lastPunch),
          biometricSource: row.punchCount > 0 ? 'Biometric Device' : 'Supervisor Override',
          supervisor: officeName,
        };
      }),
    };
  } finally {
    await pool.end();
  }
};

export const readLiveDailyAttendance = async (requestedDate?: string): Promise<{ attendanceDate: string; records: LiveAttendanceRecord[] }> =>
  cachedLiveRead(`daily-attendance:${requestedDate || 'today'}`, () => readLiveDailyAttendanceRaw(requestedDate));

const readLiveClockingActivityRaw = async (requestedDate?: string): Promise<{ attendanceDate: string; records: LiveClockingActivityRecord[] }> => {
  const attendanceDate = await resolveLiveAttendanceDate(requestedDate);
  const pool = getPool();

  try {
    const [rows] = await pool.query<RawAttendanceRow[]>(
      `
      SELECT
        punches.L_UID AS uid,
        COALESCE(NULLIF(u.C_Unique, ''), CAST(punches.L_UID AS CHAR)) AS uniqueCode,
        COALESCE(NULLIF(u.C_Name, ''), CONCAT('Employee ', punches.L_UID)) AS employeeName,
        emp.C_Office AS officeCode,
        COALESCE(NULLIF(o.C_Name, ''), emp.C_Office, 'Unassigned') AS officeName,
        emp.C_Post AS postCode,
        COALESCE(NULLIF(p.C_Name, ''), emp.C_Post, 'Unassigned') AS postName,
        COALESCE(NULLIF(s.C_Name, ''), 'Employee') AS staffName,
        punches.firstPunch,
        punches.lastPunch,
        punches.punchCount,
        punches.terminalId,
        COALESCE(NULLIF(t.C_Name, ''), NULLIF(o.C_Name, ''), 'Biometric Terminal') AS terminalName
      FROM (
        SELECT
          L_UID,
          MIN(C_Time) AS firstPunch,
          MAX(C_Time) AS lastPunch,
          COUNT(*) AS punchCount,
          MIN(L_TID) AS terminalId
        FROM tenter
        WHERE C_Date = ?
        GROUP BY L_UID
      ) punches
      LEFT JOIN tuser u ON u.L_ID = punches.L_UID
      LEFT JOIN temploye emp ON emp.L_UID = punches.L_UID
      LEFT JOIN coffice o ON o.C_Code = emp.C_Office
      LEFT JOIN cpost p ON p.C_Code = emp.C_Post
      LEFT JOIN cstaff s ON s.C_Code = emp.C_Staff
      LEFT JOIN tterminal t ON t.L_ID = punches.terminalId
      ORDER BY u.C_Name
      `,
      [attendanceDate],
    );

    return {
      attendanceDate: displayDate(attendanceDate),
      records: rows.map((row) => {
        const shift = resolveShift(row.firstPunch);
        const schedule = scheduleForShift(shift);
        const minutesLate = calculateMinutesLate(row.firstPunch, schedule.start);
        const status = resolveStatus(row.firstPunch, minutesLate);
        const employeeCode = (row.uniqueCode || String(row.uid)).trim();
        const officeName = row.officeName || 'Unassigned';
        const postName = row.postName || 'Unassigned';

        return {
          id: `live-clock-${attendanceDate}-${row.uid}`,
          employeeId: employeeCode,
          employeeName: String(row.employeeName || `Employee ${row.uid}`),
          businessUnit: officeName,
          department: postName,
          jobTitle: row.staffName || postName,
          location: officeName,
          site: row.terminalName || officeName,
          shift,
          status,
          checkInTime: displayTime(row.firstPunch),
          checkOutTime: row.punchCount > 1 ? displayTime(row.lastPunch) : null,
          scheduledStart: schedule.start,
          scheduledEnd: schedule.end,
          minutesLate,
          overtimeHours: calculateOvertime(row.firstPunch, row.lastPunch),
          biometricSource: 'Biometric Device',
          supervisor: officeName,
          punchCount: row.punchCount,
        };
      }),
    };
  } finally {
    await pool.end();
  }
};

export const readLiveClockingActivity = async (requestedDate?: string): Promise<{ attendanceDate: string; records: LiveClockingActivityRecord[] }> =>
  cachedLiveRead(`clocking-activity:${requestedDate || 'today'}`, () => readLiveClockingActivityRaw(requestedDate));

const readLiveAttendancePunchesRaw = async (requestedDate?: string): Promise<{ attendanceDate: string; punches: LiveAttendancePunch[] }> => {
  const attendanceDate = await resolveLiveAttendanceDate(requestedDate);
  const pool = getPool();

  try {
    const [rows] = await pool.query<RawPunchRow[]>(
      `
      SELECT
        CONCAT(e.L_UID, '-', e.C_Date, '-', e.C_Time, '-', e.L_TID, '-', e.L_Mode, '-', e.L_MatchingType) AS punchId,
        e.L_UID AS uid,
        COALESCE(NULLIF(e.C_Unique, ''), NULLIF(u.C_Unique, ''), CAST(e.L_UID AS CHAR)) AS uniqueCode,
        COALESCE(NULLIF(e.C_Name, ''), NULLIF(u.C_Name, ''), CONCAT('Employee ', e.L_UID)) AS employeeName,
        e.C_Date AS punchDate,
        e.C_Time AS punchTime,
        e.L_TID AS terminalId,
        COALESCE(NULLIF(t.C_Name, ''), 'Biometric Terminal') AS terminalName,
        e.L_Mode AS mode,
        e.L_MatchingType AS matchingType,
        e.L_Result AS result
      FROM tenter e
      LEFT JOIN tuser u ON u.L_ID = e.L_UID
      LEFT JOIN tterminal t ON t.L_ID = e.L_TID
      WHERE e.C_Date = ?
      ORDER BY e.L_UID, e.C_Time
      `,
      [attendanceDate],
    );

    return {
      attendanceDate: displayDate(attendanceDate),
      punches: rows.map((row, index) => {
        const employeeId = (row.uniqueCode || String(row.uid)).trim();
        return {
          id: `live-punch-${attendanceDate}-${row.uid}-${index}`,
          employeeId,
          employeeName: String(row.employeeName || `Employee ${row.uid}`),
          punchDate: displayDate(row.punchDate),
          punchTime: displayTime(row.punchTime) || '00:00',
          terminalId: row.terminalId,
          terminalName: row.terminalName || 'Biometric Terminal',
          mode: row.mode,
          matchingType: row.matchingType,
          result: row.result,
        };
      }),
    };
  } finally {
    await pool.end();
  }
};

export const readLiveAttendancePunches = async (requestedDate?: string): Promise<{ attendanceDate: string; punches: LiveAttendancePunch[] }> =>
  cachedLiveRead(`attendance-punches:${requestedDate || 'today'}`, () => readLiveAttendancePunchesRaw(requestedDate));

export const toLivePunchTimestamp = (date: string, time: string) => displayDateTime(date.replace(/-/g, ''), time.replace(':', '').padEnd(6, '0'));
