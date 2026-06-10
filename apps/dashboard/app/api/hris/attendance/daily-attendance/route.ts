import { NextResponse } from 'next/server';
import { readLiveDailyAttendance, type LiveAttendanceRecord } from '@/lib/biometric-live-attendance-store';
import { getUiPermissions, resolveAccessContext } from '@/lib/hris-access';
import type { StructureInsight } from '@/lib/organization-data';

type AttendanceSegment = {
  id: string;
  label: string;
  location: string;
  site: string;
  headcount: number;
  present: number;
  late: number;
  absent: number;
  remote: number;
  onLeave: number;
  attendanceRatePct: number;
  punctualityPct: number;
  overtimeHours: number;
  shiftCoverage: Array<{ shift: 'Day' | 'Night' | 'Rotational'; planned: number; present: number }>;
  health: 'Healthy' | 'Needs Attention' | 'Critical';
  lead: string;
};

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

const buildSegments = (records: LiveAttendanceRecord[]): AttendanceSegment[] => {
  const grouped = new Map<string, LiveAttendanceRecord[]>();
  for (const record of records) {
    const key = `${record.location}||${record.site}`;
    grouped.set(key, [...(grouped.get(key) || []), record]);
  }

  return Array.from(grouped.entries())
    .map(([key, rows]) => {
      const [location, site] = key.split('||');
      const present = rows.filter((row) => row.status === 'Present' || row.status === 'Late').length;
      const late = rows.filter((row) => row.status === 'Late').length;
      const absent = rows.filter((row) => row.status === 'Absent').length;
      const remote = rows.filter((row) => row.status === 'Remote').length;
      const onLeave = rows.filter((row) => row.status === 'On Leave' || row.status === 'Excused').length;
      const attendanceRatePct = pct(present + remote + onLeave, rows.length);
      const punctualityPct = pct(present - late, Math.max(1, present));
      const shiftCoverage = (['Day', 'Night', 'Rotational'] as const).map((shift) => {
        const planned = rows.filter((row) => row.shift === shift).length;
        return {
          shift,
          planned,
          present: rows.filter((row) => row.shift === shift && row.checkInTime).length,
        };
      });
      const health: AttendanceSegment['health'] =
        attendanceRatePct < 70 || late >= 5
          ? 'Critical'
          : attendanceRatePct < 90 || late >= 2
            ? 'Needs Attention'
            : 'Healthy';

      return {
        id: `${location}-${site}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: site === location ? location : `${location} / ${site}`,
        location,
        site,
        headcount: rows.length,
        present,
        late,
        absent,
        remote,
        onLeave,
        attendanceRatePct,
        punctualityPct,
        overtimeHours: Math.round(rows.reduce((sum, row) => sum + row.overtimeHours, 0) * 10) / 10,
        shiftCoverage,
        health,
        lead: rows[0]?.supervisor || location,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
};

const buildInsights = (records: LiveAttendanceRecord[], segments: AttendanceSegment[]): StructureInsight[] => {
  const late = records.filter((record) => record.status === 'Late');
  const absent = records.filter((record) => record.status === 'Absent');
  const critical = segments.filter((segment) => segment.health === 'Critical');

  return [
    {
      id: 'daily-att-late',
      severity: late.length >= 10 ? 'high' : late.length >= 3 ? 'medium' : 'low',
      title: `${late.length} late clock-in${late.length === 1 ? '' : 's'} recorded`,
      recommendation: late.length > 0 ? 'Review late arrivals by site and confirm whether production start times need supervisor follow-up.' : 'No meaningful lateness pattern detected for this attendance date.',
    },
    {
      id: 'daily-att-absence',
      severity: absent.length >= 10 ? 'high' : absent.length >= 3 ? 'medium' : 'low',
      title: `${absent.length} absent employee${absent.length === 1 ? '' : 's'} in the live register`,
      recommendation: absent.length > 0 ? 'Validate absent lines against approved leave, sick notes, and supervisor overrides before payroll processing.' : 'No absence pressure detected in the current scope.',
    },
    {
      id: 'daily-att-site-health',
      severity: critical.length > 0 ? 'high' : 'low',
      title: `${critical.length} site segment${critical.length === 1 ? '' : 's'} need attention`,
      recommendation: critical.length > 0 ? 'Prioritize critical site segments with low attendance or high lateness before shift close.' : 'All site segments are within acceptable attendance thresholds.',
    },
  ];
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = resolveAccessContext(request);
    const uiPermissions = getUiPermissions(access);
    const liveAttendance = await readLiveDailyAttendance(searchParams.get('date') || undefined);
    const records = liveAttendance.records;
    const present = records.filter((record) => record.status === 'Present' || record.status === 'Late').length;
    const late = records.filter((record) => record.status === 'Late').length;
    const absent = records.filter((record) => record.status === 'Absent').length;
    const remote = records.filter((record) => record.status === 'Remote').length;
    const onLeave = records.filter((record) => record.status === 'On Leave' || record.status === 'Excused').length;
    const segments = buildSegments(records);

    return ok({
      generatedAt: new Date().toISOString(),
      attendanceDate: liveAttendance.attendanceDate,
      source: 'Live Biometric Database' as const,
      permissions: {
        actor: uiPermissions.actor,
        role: uiPermissions.role,
        canEdit: uiPermissions.canEditAttendance,
        canExport: true,
        canViewAudit: uiPermissions.canViewAudit,
      },
      summary: {
        totalEmployees: records.length,
        present,
        late,
        absent,
        remote,
        onLeave,
        attendanceRatePct: pct(present + remote + onLeave, records.length),
        punctualityPct: pct(present - late, present),
        overtimeHours: Math.round(records.reduce((sum, record) => sum + record.overtimeHours, 0) * 10) / 10,
        flaggedSites: segments.filter((segment) => segment.health !== 'Healthy').length,
      },
      filterOptions: {
        businessUnits: Array.from(new Set(records.map((record) => record.businessUnit))).sort(),
        locations: Array.from(new Set(records.map((record) => record.location))).sort(),
        sites: Array.from(new Set(records.map((record) => record.site))).sort(),
        shifts: Array.from(new Set(records.map((record) => record.shift))).sort(),
        statuses: Array.from(new Set(records.map((record) => record.status))).sort(),
      },
      segments,
      records,
      insights: buildInsights(records, segments),
    });
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load daily attendance');
  }
}
