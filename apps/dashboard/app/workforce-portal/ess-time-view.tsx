'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  ClipboardList,
  Clock,
  Fingerprint,
  Loader2,
  MapPin,
  Smartphone,
} from 'lucide-react';
import type { EssMobileClockSession } from '@/lib/ess-mobile-clock-store';
import { EssCard, EssEmptyState, EssKpiCard, EssSectionHeader } from './ess-portal-ui';

type AttendanceRecord = {
  date: string;
  clockIn: string;
  clockOut: string;
  status: string;
  source: string;
  locationLabel?: string;
  siteName?: string;
  geofenceResult?: string;
};

type ShiftRow = { id: string; name: string; start: string; end: string; location: string };
type TimeRequest = { id: string; title: string; category: string; status: string; submittedAt: string; updatedAt?: string };
type TimesheetRow = { week: string; hours: string | number; overtime: string | number };

export type EssTimePayload = {
  generatedAt?: string;
  widgets?: {
    attendance: {
      monthRate: number;
      lateArrivals: number;
      overtimeHours: number;
      remoteDays: number;
    };
  };
  attendance?: {
    records?: AttendanceRecord[];
    shifts?: ShiftRow[];
    timesheets?: TimesheetRow[];
    todaySession?: EssMobileClockSession | null;
    clockingState?: 'ready' | 'clocked-in' | 'clocked-out';
    mobileClockEnabled?: boolean;
    timeRequests?: TimeRequest[];
  };
  employee?: {
    fullName?: string;
    workLocation?: string;
    location?: string;
  };
};

const statusBadge = (status: string) => {
  const value = status.toLowerCase();
  if (value.includes('late')) return 'bg-[#FEF3C7] text-[#B45309]';
  if (value.includes('clocked in')) return 'bg-[#DBEAFE] text-[#1D4ED8]';
  if (value.includes('present')) return 'bg-[#F1F5F9] text-[#475569]';
  if (value.includes('absent')) return 'bg-[#FEF2F2] text-[#DC2626]';
  return 'bg-[#ECFDF5] text-[#047857]';
};

const formatSubtitle = (record: AttendanceRecord) => {
  const times = record.clockOut && record.clockOut !== '—'
    ? `${record.clockIn} – ${record.clockOut}`
    : record.clockIn && record.clockIn !== '—'
      ? record.clockIn
      : '—';
  const source = record.source || 'Biometric';
  return `${times} · ${source}`;
};

const resolveGps = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });

const reverseGeocodeLabel = async (latitude: number, longitude: number) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.display_name === 'string' ? json.display_name : null;
  } catch {
    return null;
  }
};

export function EssTimeView({
  payload,
  locale = 'en-NG',
  onRefresh,
  onNavigate,
}: {
  payload: EssTimePayload | null;
  locale?: string;
  onRefresh: () => void;
  onNavigate?: (tab: string, options?: { leaveSection?: string }) => void;
}) {
  const widgets = payload?.widgets?.attendance;
  const records = payload?.attendance?.records || [];
  const shifts = payload?.attendance?.shifts || [];
  const timesheets = payload?.attendance?.timesheets || [];
  const timeRequests = payload?.attendance?.timeRequests || [];
  const todaySession = payload?.attendance?.todaySession || null;
  const clockingState = payload?.attendance?.clockingState || 'ready';
  const [busy, setBusy] = useState<'clock-in' | 'clock-out' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [locationPreview, setLocationPreview] = useState('');

  const canClockIn = clockingState === 'ready';
  const canClockOut = clockingState === 'clocked-in';

  const locationLine = useMemo(() => {
    if (todaySession?.locationLabel) return todaySession.locationLabel;
    return payload?.employee?.workLocation || payload?.employee?.location || 'Location will be detected automatically';
  }, [payload?.employee, todaySession]);

  const runClockAction = useCallback(async (action: 'clock-in' | 'clock-out') => {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const position = await resolveGps();
      const { latitude, longitude, accuracy } = position.coords;
      const addressLabel = await reverseGeocodeLabel(latitude, longitude);
      setLocationPreview(addressLabel || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      const res = await fetch('/api/workforce-portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ess-locale': locale },
        body: JSON.stringify({
          action,
          latitude,
          longitude,
          accuracyMeters: accuracy,
          addressLabel,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || `Unable to ${action.replace('-', ' ')}.`);
      setNotice(json.data?.message || `Successfully completed ${action.replace('-', ' ')}.`);
      onRefresh();
    } catch (event) {
      setError(event instanceof Error ? event.message : `Unable to ${action.replace('-', ' ')}.`);
    } finally {
      setBusy('');
    }
  }, [locale, onRefresh]);

  if (!payload) {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <EssCard key={index} className="p-6">
            <div className="h-6 w-56 animate-pulse rounded-lg bg-[#E2E8F0]" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-[14px] bg-[#F1F5F9]" />
              ))}
            </div>
          </EssCard>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#B91C1C]">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-[14px] border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-sm font-semibold text-[#047857]">{notice}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader title="Attendance Records & Analytics" />
          </div>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EssKpiCard
                label="Attendance Rate"
                value={`${widgets?.monthRate ?? 0}%`}
                subtitle={`${widgets?.lateArrivals ?? 0} late arrivals`}
                icon={Activity}
                accent="#2563EB"
                iconBg="#DBEAFE"
              />
              <EssKpiCard
                label="Overtime"
                value={`${widgets?.overtimeHours ?? 0}h`}
                subtitle={`${widgets?.remoteDays ?? 0} remote work days`}
                icon={Clock}
                accent="#F59E0B"
                iconBg="#FFFBEB"
              />
            </div>

            <div className="space-y-2">
              {records.length ? (
                records.map((record) => (
                  <div
                    key={`${record.date}-${record.source}-${record.clockIn}`}
                    className="flex items-center justify-between gap-3 rounded-[14px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#0F172A]">{record.date}</p>
                      <p className="mt-1 truncate text-[12px] font-medium text-[#64748B]">{formatSubtitle(record)}</p>
                      {record.locationLabel ? (
                        <p className="mt-1 truncate text-[11px] font-semibold text-[#94A3B8]">{record.locationLabel}</p>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${statusBadge(record.status)}`}>
                      {record.status}
                    </span>
                  </div>
                ))
              ) : (
                <EssEmptyState
                  icon={Activity}
                  title="No attendance records yet"
                  description="Biometric and mobile clock events for this month will appear here."
                />
              )}
            </div>
          </div>
        </EssCard>

        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader title="Clock-In, Shifts, Timesheets & Time Requests" />
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-[14px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
                <div className="min-w-0">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-[#1D4ED8]">Auto-detected location</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#0F172A]">{locationPreview || locationLine}</p>
                  {todaySession?.geofenceResult ? (
                    <p className="mt-1 text-[11px] font-medium text-[#64748B]">Geofence: {todaySession.geofenceResult}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!canClockIn || busy !== ''}
                onClick={() => void runClockAction('clock-in')}
                className="flex min-h-[108px] flex-col justify-between rounded-[16px] border border-[#BBF7D0] bg-[#ECFDF5] p-4 text-left transition hover:border-[#86EFAC] hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#16A34A] shadow-sm">
                  {busy === 'clock-in' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-[14px] font-bold text-[#0F172A]">Clock-in / clock-out</p>
                  <p className="mt-1 text-[12px] font-semibold text-[#16A34A]">
                    {canClockIn ? 'Tap to clock in with GPS' : canClockOut ? 'Clocked in — use clock-out below' : 'Completed for today'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={!canClockOut || busy !== ''}
                onClick={() => void runClockAction('clock-out')}
                className="flex min-h-[108px] flex-col justify-between rounded-[16px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-left transition hover:border-[#FCA5A5] hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#DC2626] shadow-sm">
                  {busy === 'clock-out' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-[14px] font-bold text-[#0F172A]">Clock out</p>
                  <p className="mt-1 text-[12px] font-semibold text-[#DC2626]">Biometric / mobile with GPS</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate?.('services')}
                className="flex min-h-[108px] flex-col justify-between rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-left transition hover:bg-white"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#2563EB] shadow-sm">
                  <Clock className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[14px] font-bold text-[#0F172A]">Overtime request</p>
                  <p className="mt-1 text-[12px] font-semibold text-[#64748B]">Routes to manager</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate?.('services')}
                className="flex min-h-[108px] flex-col justify-between rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-left transition hover:bg-white"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#7C3AED] shadow-sm">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[14px] font-bold text-[#0F172A]">Attendance regularization</p>
                  <p className="mt-1 text-[12px] font-semibold text-[#64748B]">Exception approval</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => void runClockAction(canClockOut ? 'clock-out' : 'clock-in')}
                disabled={busy !== '' || (!canClockIn && !canClockOut)}
                className="flex min-h-[108px] flex-col justify-between rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-left transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#06B6D4] shadow-sm">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[14px] font-bold text-[#0F172A]">Remote work tracking</p>
                  <p className="mt-1 text-[12px] font-semibold text-[#64748B]">Location-aware mobile clock for remote sites</p>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                <p className="text-[12px] font-bold uppercase tracking-wide text-[#64748B]">Shifts</p>
                <div className="mt-3 space-y-2">
                  {shifts.length ? (
                    shifts.map((shift) => (
                      <div key={shift.id} className="rounded-[12px] bg-[#F8FAFC] px-3 py-2">
                        <p className="text-[13px] font-bold text-[#0F172A]">{shift.name}</p>
                        <p className="text-[11px] font-medium text-[#64748B]">{shift.start} – {shift.end} · {shift.location}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[12px] font-medium text-[#94A3B8]">No shift assignment on file.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
                <p className="text-[12px] font-bold uppercase tracking-wide text-[#64748B]">Timesheets</p>
                <div className="mt-3 space-y-2">
                  {timesheets.length ? (
                    timesheets.map((sheet, index) => (
                      <div key={`${sheet.week}-${index}`} className="rounded-[12px] bg-[#F8FAFC] px-3 py-2">
                        <p className="text-[13px] font-bold text-[#0F172A]">{sheet.week}</p>
                        <p className="text-[11px] font-medium text-[#64748B]">{sheet.hours}h · OT {sheet.overtime}h</p>
                      </div>
                    ))
                  ) : timeRequests.length ? (
                    timeRequests.slice(0, 4).map((request) => (
                      <div key={request.id} className="rounded-[12px] bg-[#F8FAFC] px-3 py-2">
                        <p className="text-[13px] font-bold text-[#0F172A]">{request.title}</p>
                        <p className="text-[11px] font-medium text-[#64748B]">{request.status} · {request.category}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[12px] font-medium text-[#94A3B8]">No records found</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </EssCard>
      </div>
    </div>
  );
}
