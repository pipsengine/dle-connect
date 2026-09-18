/**
 * Read-only: C-code timesheet Absent vs UNIS punches for 16 Aug–15 Sep 2026.
 *
 *   npx tsx --tsconfig apps/dashboard/tsconfig.json scripts/diagnose-c-code-absent-vs-biometric.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import sql from 'mssql';

import { getDleEnterpriseDbPool, loadWorkspaceEnv } from '../apps/dashboard/lib/dle-enterprise-db';
import { pairBiometricPunchesIntoShifts } from '../apps/dashboard/lib/timesheet-entry-shared';
import { timesheetAttendanceMatchKeys } from '../apps/dashboard/lib/timesheet-attendance-match';

const START = '2026-08-16';
const END = '2026-09-15';

const loadEnvFiles = () => {
  for (const file of [path.resolve('.env'), path.resolve('apps/dashboard/.env'), path.resolve('apps/dashboard/.env.local')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  }
  loadWorkspaceEnv();
};

const mysqlDate = (iso: string) => iso.replace(/-/g, '');
const isoDate = (mysql: string) => `${mysql.slice(0, 4)}-${mysql.slice(4, 6)}-${mysql.slice(6, 8)}`;
const hhmm = (time: string | null) => (time ? `${String(time).slice(0, 2)}:${String(time).slice(2, 4)}` : null);

const main = async () => {
  loadEnvFiles();
  const dle = await getDleEnterpriseDbPool();
  if (!dle) throw new Error('No DLE Enterprise database.');
  if (!process.env.BIOMETRIC_DB_PASSWORD) throw new Error('BIOMETRIC_DB_PASSWORD is not set.');

  const sheet = await dle.request()
    .input('start', sql.VarChar(10), START)
    .input('end', sql.VarChar(10), END)
    .query(`
SELECT
  CONVERT(varchar(10), h.TimesheetDate, 23) AS TimesheetDate,
  h.SupervisorId,
  h.WorkCenterName,
  h.LocationName,
  h.ShiftLabel,
  h.Status,
  l.EmployeeNo,
  l.EmployeeName,
  l.ClockIn,
  l.ClockOut,
  l.AttendanceMode,
  l.BiometricId
FROM [hris].[TimesheetHeaders] h
INNER JOIN [hris].[TimesheetLines] l ON l.HeaderId = h.Id
WHERE CONVERT(varchar(10), h.TimesheetDate, 23) BETWEEN @start AND @end
  AND (l.EmployeeNo LIKE N'C%' OR l.EmployeeId LIKE N'C%')
`);

  const rows = sheet.recordset as Array<{
    TimesheetDate: string;
    SupervisorId: string;
    WorkCenterName: string;
    LocationName: string | null;
    ShiftLabel: string | null;
    Status: string;
    EmployeeNo: string;
    EmployeeName: string;
    ClockIn: string | null;
    ClockOut: string | null;
    AttendanceMode: string | null;
    BiometricId: string | null;
  }>;

  const absent = rows.filter((row) => !String(row.ClockIn || '').trim());
  const present = rows.filter((row) => String(row.ClockIn || '').trim());
  const codes = [...new Set(rows.map((row) => String(row.EmployeeNo || '').trim().toUpperCase()).filter((code) => /^C\d+/i.test(code)))];

  const unis = mysql.createPool({
    host: process.env.BIOMETRIC_DB_HOST || '192.168.5.5',
    port: Number(process.env.BIOMETRIC_DB_PORT || 3306),
    user: process.env.BIOMETRIC_DB_USER || 'root',
    password: process.env.BIOMETRIC_DB_PASSWORD,
    database: process.env.BIOMETRIC_DB_NAME || 'unis',
    waitForConnections: true,
    connectionLimit: 2,
  });

  const [users] = await unis.query<Array<{ uid: number; uniqueCode: string | null; userName: string | null }>>(
    `SELECT L_ID AS uid, C_Unique AS uniqueCode, C_Name AS userName FROM tuser`,
  );

  const matchKeys = timesheetAttendanceMatchKeys;
  const userByCode = new Map<string, { uid: number; uniqueCode: string | null; userName: string | null }>();
  for (const user of users) {
    for (const key of matchKeys(user.uniqueCode, user.userName, user.uid)) {
      if (!userByCode.has(key)) userByCode.set(key, user);
    }
  }

  const [punches] = await unis.query<Array<{ uid: number; punchDate: string; punchTime: string; uniqueCode: string | null; punchName: string | null }>>(
    `
    SELECT
      e.L_UID AS uid,
      e.C_Date AS punchDate,
      e.C_Time AS punchTime,
      COALESCE(NULLIF(u.C_Unique, ''), NULLIF(e.C_Unique, ''), CAST(e.L_UID AS CHAR)) AS uniqueCode,
      COALESCE(NULLIF(e.C_Name, ''), NULLIF(u.C_Name, ''), CONCAT('Employee ', e.L_UID)) AS punchName
    FROM tenter e
    LEFT JOIN tuser u ON u.L_ID = e.L_UID
    WHERE e.C_Date BETWEEN ? AND ?
    ORDER BY e.L_UID, e.C_Date, e.C_Time
    `,
    [mysqlDate(START), mysqlDate(END)],
  );

  const punchesByUidDate = new Map<string, Array<{ time: string }>>();
  const punchesByUid = new Map<number, Array<{ date: string; time: string }>>();
  const identityByUid = new Map<number, { uniqueCode: string | null; punchName: string | null }>();
  for (const punch of punches) {
    const date = isoDate(String(punch.punchDate));
    const time = hhmm(punch.punchTime) || '00:00';
    const key = `${punch.uid}|${date}`;
    const list = punchesByUidDate.get(key) || [];
    list.push({ time });
    punchesByUidDate.set(key, list);
    const all = punchesByUid.get(punch.uid) || [];
    all.push({ date, time });
    punchesByUid.set(punch.uid, all);
    if (!identityByUid.has(punch.uid)) identityByUid.set(punch.uid, { uniqueCode: punch.uniqueCode, punchName: punch.punchName });
  }

  const buckets = {
    absentNoUnisUser: 0,
    absentNoPunches: 0,
    absentPunchesButNoDayPair: 0,
    absentPunchesAndDayPair: 0,
    present: present.length,
  };
  const samples = {
    absentPunchesAndDayPair: [] as Array<Record<string, unknown>>,
    absentPunchesButNoDayPair: [] as Array<Record<string, unknown>>,
    absentNoUnisUser: [] as Array<Record<string, unknown>>,
    uniqueCodeNotCCode: [] as Array<Record<string, unknown>>,
  };

  const uniqueCodesNotC = new Set<string>();
  for (const row of absent) {
    const code = String(row.EmployeeNo || '').trim().toUpperCase();
    const user = matchKeys(code, row.EmployeeName).map((key) => userByCode.get(key)).find(Boolean);
    if (!user) {
      buckets.absentNoUnisUser += 1;
      if (samples.absentNoUnisUser.length < 8) samples.absentNoUnisUser.push({ date: row.TimesheetDate, code, name: row.EmployeeName, wc: row.WorkCenterName, supervisor: row.SupervisorId });
      continue;
    }
    const identity = identityByUid.get(user.uid);
    const uniqueCode = String(identity?.uniqueCode || user.uniqueCode || '').trim();
    if (uniqueCode && !/^C\d+/i.test(uniqueCode) && !uniqueCodesNotC.has(`${code}:${uniqueCode}`)) {
      uniqueCodesNotC.add(`${code}:${uniqueCode}`);
      if (samples.uniqueCodeNotCCode.length < 12) {
        samples.uniqueCodeNotCCode.push({ code, name: row.EmployeeName, uid: user.uid, uniqueCode, unisName: identity?.punchName || user.userName });
      }
    }
    const dayPunches = punchesByUidDate.get(`${user.uid}|${row.TimesheetDate}`) || [];
    const windowPunches = (punchesByUid.get(user.uid) || []).filter((item) => {
      const prev = new Date(`${row.TimesheetDate}T12:00:00`);
      prev.setDate(prev.getDate() - 1);
      const next = new Date(`${row.TimesheetDate}T12:00:00`);
      next.setDate(next.getDate() + 1);
      const prevIso = prev.toISOString().slice(0, 10);
      const nextIso = next.toISOString().slice(0, 10);
      return item.date === prevIso || item.date === row.TimesheetDate || item.date === nextIso;
    });
    if (!dayPunches.length && !windowPunches.length) {
      buckets.absentNoPunches += 1;
      continue;
    }
    const paired = pairBiometricPunchesIntoShifts(windowPunches);
    const day = paired.find((session) => session.workDate === row.TimesheetDate && session.kind === 'Day' && session.clockIn);
    const night = paired.find((session) => session.workDate === row.TimesheetDate && session.kind === 'Night' && session.clockIn);
    const sample = {
      date: row.TimesheetDate,
      code,
      name: row.EmployeeName,
      wc: row.WorkCenterName,
      supervisor: row.SupervisorId,
      uid: user.uid,
      uniqueCode,
      unisName: identity?.punchName || user.userName,
      calendarPunches: dayPunches.map((item) => item.time),
      dayPair: day ? `${day.clockIn}-${day.clockOut || ''}` : null,
      nightPair: night ? `${night.clockIn}-${night.clockOut || ''}` : null,
      biometricId: row.BiometricId,
    };
    if (day) {
      buckets.absentPunchesAndDayPair += 1;
      if (samples.absentPunchesAndDayPair.length < 10) samples.absentPunchesAndDayPair.push(sample);
    } else {
      buckets.absentPunchesButNoDayPair += 1;
      if (samples.absentPunchesButNoDayPair.length < 10) samples.absentPunchesButNoDayPair.push(sample);
    }
  }

  const codesWithUnis = codes.filter((code) => matchKeys(code).some((key) => userByCode.has(key))).length;

  console.log(JSON.stringify({
    period: { START, END },
    timesheetCCodeLines: rows.length,
    distinctCCodesOnTimesheets: codes.length,
    cCodesMatchedToUnisUser: codesWithUnis,
    cCodesUnmatchedToUnisUser: codes.length - codesWithUnis,
    presentLines: buckets.present,
    absentLines: absent.length,
    absentBreakdown: {
      noUnisUser: buckets.absentNoUnisUser,
      noPunchesOnDate: buckets.absentNoPunches,
      punchesButPairingDroppedDay: buckets.absentPunchesButNoDayPair,
      punchesAndDayPairButTimesheetStillAbsent: buckets.absentPunchesAndDayPair,
    },
    samples,
  }, null, 2));

  await unis.end();
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
