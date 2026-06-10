import { NextResponse } from 'next/server';
import {
  readLiveClockingActivity,
  type LiveAttendanceRecord,
} from '@/lib/biometric-live-attendance-store';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import type { AttendanceStatus, BiometricSource, Shift } from '@/lib/attendance-data';
import type { StructureInsight } from '@/lib/organization-data';

type ClockingMode = 'Ready To Clock In' | 'Clocked In' | 'Clocked Out' | 'Exception';

type ClockingEvent = {
  id: string;
  employeeId: string;
  action: 'CLOCK_IN' | 'CLOCK_OUT' | 'PUNCH';
  timestamp: string;
  source: BiometricSource;
  actor: string;
  note: string | null;
  terminalName: string;
};

type ClockingRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  businessUnit: string;
  jobTitle: string;
  location: string;
  site: string;
  shift: Shift;
  attendanceStatus: AttendanceStatus;
  scheduledStart: string;
  scheduledEnd: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  punchCount: number;
  minutesLate: number;
  overtimeHours: number;
  source: BiometricSource;
  supervisor: string;
  clockingMode: ClockingMode;
  deviceName: string;
  lastActionAt: string | null;
  exceptionNote: string | null;
  events: ClockingEvent[];
};

type ClockingPayload = {
  generatedAt: string;
  attendanceDate: string;
  source: 'Live Biometric Database';
  permissions: {
    actor: string;
    role: string;
    canEdit: boolean;
    canExport: boolean;
    canViewAudit: boolean;
  };
  summary: {
    totalEmployees: number;
    readyToClockIn: number;
    clockedIn: number;
    clockedOut: number;
    exceptions: number;
    latePunches: number;
    averageLateMinutes: number;
    activeSites: number;
    totalPunches: number;
  };
  filterOptions: {
    businessUnits: string[];
    locations: string[];
    sites: string[];
    shifts: Shift[];
    statuses: AttendanceStatus[];
    modes: ClockingMode[];
  };
  records: ClockingRecord[];
  insights: StructureInsight[];
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const average = (values: number[]) => {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
};

const resolveClockingMode = (record: LiveAttendanceRecord): ClockingMode => {
  if (!record.checkInTime) return 'Exception';
  if (record.checkInTime && !record.checkOutTime) return 'Clocked In';
  return 'Clocked Out';
};

const resolveExceptionNote = (record: LiveAttendanceRecord, mode: ClockingMode) => {
  if (mode === 'Exception') return 'No biometric punch was found for this employee on the resolved attendance date.';
  if (mode === 'Clocked In') return 'Clock-in exists but no matching clock-out has been captured yet.';
  if (record.minutesLate > 0) return `Clock-in was ${record.minutesLate} minute(s) after scheduled start.`;
  return null;
};

const buildInsights = (records: ClockingRecord[], totalPunches: number): StructureInsight[] => {
  const missingPunch = records.filter((item) => item.clockingMode === 'Exception').sort((a, b) => a.employeeName.localeCompare(b.employeeName))[0];
  const longestLate = records.filter((item) => item.minutesLate > 0).sort((a, b) => b.minutesLate - a.minutesLate)[0];
  const unclosedShift = records.filter((item) => item.clockingMode === 'Clocked In').sort((a, b) => a.employeeName.localeCompare(b.employeeName))[0];

  return [
    {
      id: 'clk-live-ins-1',
      severity: missingPunch ? 'high' : 'low',
      title: missingPunch ? `${missingPunch.employeeName} has no biometric punch` : 'No missing biometric punches found',
      recommendation: 'Use the attendance register review flow to clear exceptions with supervisor evidence before payroll processing.',
    },
    {
      id: 'clk-live-ins-2',
      severity: longestLate && longestLate.minutesLate >= 20 ? 'medium' : 'low',
      title: longestLate ? `${longestLate.employeeName} has the highest lateness exposure` : 'No late punch pressure detected',
      recommendation: 'Review repeat lateness by site and confirm device availability at shift start.',
    },
    {
      id: 'clk-live-ins-3',
      severity: unclosedShift ? 'medium' : 'low',
      title: unclosedShift ? `${unclosedShift.employeeName} has an open clocking session` : `${totalPunches} biometric punch event(s) reconciled`,
      recommendation: 'For open sessions, confirm whether the employee is still on shift or whether a device punch failed to sync.',
    },
  ];
};

const uniqueSorted = <T extends string>(values: T[]) => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const buildPayload = async (request: Request): Promise<ClockingPayload> => {
  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get('date') || undefined;
  const access = resolveAccessContext(request);
  const uiPermissions = getUiPermissions(access);
  const dailyAttendance = await readLiveClockingActivity(requestedDate);

  const records: ClockingRecord[] = dailyAttendance.records.map((record) => {
    const mode = resolveClockingMode(record);
    const deviceName = record.checkInTime ? record.site : 'No biometric punch';
    const eventCandidates: Array<ClockingEvent | null> = [
      record.checkInTime
        ? {
            id: `live-clock-in-${record.employeeId}`,
            employeeId: record.employeeId,
            action: 'CLOCK_IN',
            timestamp: `${dailyAttendance.attendanceDate}T${record.checkInTime}:00+01:00`,
            source: 'Biometric Device',
            actor: deviceName,
            terminalName: deviceName,
            note: 'First biometric punch reconciled for the attendance day.',
          } satisfies ClockingEvent
        : null,
      record.checkOutTime
        ? {
            id: `live-clock-out-${record.employeeId}`,
            employeeId: record.employeeId,
            action: 'CLOCK_OUT',
            timestamp: `${dailyAttendance.attendanceDate}T${record.checkOutTime}:00+01:00`,
            source: 'Biometric Device',
            actor: deviceName,
            terminalName: deviceName,
            note: 'Last biometric punch reconciled for the attendance day.',
          } satisfies ClockingEvent
        : null,
    ];
    const events: ClockingEvent[] = eventCandidates.filter((event): event is ClockingEvent => Boolean(event)).reverse();
    const punchCount = record.punchCount;

    return {
      id: `clk-live-${record.employeeId.toLowerCase().trim()}`,
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      department: record.department,
      businessUnit: record.businessUnit,
      jobTitle: record.jobTitle,
      location: record.location,
      site: record.site,
      shift: record.shift,
      attendanceStatus: record.status,
      scheduledStart: record.scheduledStart,
      scheduledEnd: record.scheduledEnd,
      clockInTime: record.checkInTime,
      clockOutTime: record.checkOutTime,
      punchCount,
      minutesLate: record.minutesLate,
      overtimeHours: record.overtimeHours,
      source: record.biometricSource,
      supervisor: record.supervisor,
      clockingMode: mode,
      deviceName,
      lastActionAt: record.checkOutTime || record.checkInTime,
      exceptionNote: resolveExceptionNote(record, mode),
      events,
    };
  }).sort((a, b) => {
    const modeOrder: ClockingMode[] = ['Exception', 'Clocked In', 'Ready To Clock In', 'Clocked Out'];
    const modeCompare = modeOrder.indexOf(a.clockingMode) - modeOrder.indexOf(b.clockingMode);
    if (modeCompare !== 0) return modeCompare;
    return a.employeeName.localeCompare(b.employeeName);
  });

  const lateRecords = records.filter((item) => item.minutesLate > 0);
  const totalPunches = records.reduce((sum, item) => sum + item.punchCount, 0);

  return {
    generatedAt: new Date().toISOString(),
    attendanceDate: dailyAttendance.attendanceDate,
    source: 'Live Biometric Database',
    permissions: {
      actor: uiPermissions.actor,
      role: uiPermissions.role,
      canEdit: false,
      canExport: true,
      canViewAudit: uiPermissions.canViewAudit,
    },
    summary: {
      totalEmployees: records.length,
      readyToClockIn: records.filter((item) => item.clockingMode === 'Ready To Clock In').length,
      clockedIn: records.filter((item) => item.clockingMode === 'Clocked In').length,
      clockedOut: records.filter((item) => item.clockingMode === 'Clocked Out').length,
      exceptions: records.filter((item) => item.clockingMode === 'Exception').length,
      latePunches: lateRecords.length,
      averageLateMinutes: average(lateRecords.map((item) => item.minutesLate)),
      activeSites: new Set(records.map((item) => `${item.location}||${item.site}`)).size,
      totalPunches,
    },
    filterOptions: {
      businessUnits: uniqueSorted(records.map((item) => item.businessUnit)),
      locations: uniqueSorted(records.map((item) => item.location)),
      sites: uniqueSorted(records.map((item) => item.site)),
      shifts: uniqueSorted(records.map((item) => item.shift)),
      statuses: uniqueSorted(records.map((item) => item.attendanceStatus)),
      modes: ['Exception', 'Clocked In', 'Clocked Out', 'Ready To Clock In'],
    },
    records,
    insights: buildInsights(records, totalPunches),
  };
};

export async function GET(request: Request) {
  try {
    return ok(await buildPayload(request));
  } catch (error) {
    console.error('Clock In / Clock Out API Error:', error);
    return err(500, error instanceof Error ? error.message : 'Unable to load live clock-in and clock-out data');
  }
}

export async function PATCH() {
  return err(
    409,
    'Clock-in and clock-out actions are read from the live biometric database. Use the biometric terminal to create punches, then refresh this page.',
  );
}
