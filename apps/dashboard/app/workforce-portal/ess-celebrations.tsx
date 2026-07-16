'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cake, CalendarDays, Gift, Sparkles, Trophy, X } from 'lucide-react';
import EmployeeAvatar from '@/components/hris/EmployeeAvatar';
import { EssCard, EssSectionHeader } from './ess-portal-ui';
import type { EssTab } from './ess-portal-shell';

export type EssCelebrationPerson = {
  id: string;
  fullName: string;
  department?: string;
  date: string;
  years?: number;
  employeeId?: string;
  employeeCode?: string;
  hasPhoto?: boolean;
};

export type EssCelebrationMoment = EssCelebrationPerson & {
  kind: 'birthday' | 'anniversary';
};

const todayIsoLocal = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dateParts = (value?: string) => {
  if (!value) return { month: '—', day: '—' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { month: '—', day: '—' };
  return {
    month: date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    day: date.toLocaleDateString('en-GB', { day: '2-digit' }),
  };
};

const daysUntil = (value?: string) => {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  target.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export const untilLabel = (value?: string) => {
  const days = daysUntil(value);
  if (days == null) return 'Upcoming';
  if (days < 0) return 'Past';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
};

const eventTone = (index: number) => ['bg-[#1E6AF5]', 'bg-[#9461EF]', 'bg-[#19A66A]', 'bg-[#FB8424]'][index % 4];

const storageKeyFor = (date: string, ids: string[]) => `dle-ess-celebration-flyer:${date}:${ids.sort().join('|')}`;

export function buildTodaysCelebrations(
  birthdays: EssCelebrationPerson[] = [],
  anniversaries: EssCelebrationPerson[] = [],
  today = todayIsoLocal(),
): EssCelebrationMoment[] {
  return [
    ...birthdays.filter((item) => item.date === today).map((item) => ({ ...item, kind: 'birthday' as const })),
    ...anniversaries.filter((item) => item.date === today).map((item) => ({ ...item, kind: 'anniversary' as const })),
  ];
}

export function isSameEmployee(
  person: Pick<EssCelebrationPerson, 'employeeId' | 'employeeCode' | 'fullName'>,
  viewer?: { employeeId?: string; employeeCode?: string; fullName?: string } | null,
) {
  if (!viewer) return false;
  const viewerCode = String(viewer.employeeCode || viewer.employeeId || '').trim().toLowerCase();
  const personCode = String(person.employeeCode || person.employeeId || '').trim().toLowerCase();
  if (viewerCode && personCode && viewerCode === personCode) return true;
  const viewerName = String(viewer.fullName || '').trim().toLowerCase();
  const personName = String(person.fullName || '').trim().toLowerCase();
  return Boolean(viewerName && personName && viewerName === personName);
}

function CelebrationRow({
  item,
  tone,
  index,
}: {
  item: EssCelebrationPerson & { until: string; month: string; day: string; years?: number };
  tone: 'birthday' | 'anniversary';
  index: number;
}) {
  return (
    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-[#FBFCFE] px-2 py-2">
      <div className={`grid h-10 w-[34px] place-items-center rounded-[8px] text-white ${tone === 'birthday' ? 'bg-gradient-to-br from-[#F472B6] to-[#DB2777]' : eventTone(index)}`}>
        <span className="text-[7px] leading-none">{item.month}</span>
        <strong className="-mt-0.5 text-[13px] font-bold leading-none">{item.day}</strong>
      </div>
      <EmployeeAvatar
        fullName={item.fullName}
        employeeCode={item.employeeCode}
        employeeId={item.employeeId}
        hasPhoto={item.hasPhoto}
        tryPhoto
        size="sm"
        className="ring-1 ring-[#E2E8F0]"
      />
      <div className="min-w-0">
        <p className="truncate text-[12px] font-bold text-[#0F172A]">{item.fullName}</p>
        <p className="truncate text-[10px] text-[#64748B]">
          {tone === 'anniversary' && item.years ? `${item.years} year${item.years === 1 ? '' : 's'} · ` : ''}
          {item.department || 'Dorman Long'}
        </p>
      </div>
      <em className={`rounded-full px-1.5 py-0.5 text-[8px] not-italic ${item.until === 'Today' ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#EEF3FF] text-[#3864B2]'}`}>
        {item.until}
      </em>
    </div>
  );
}

export function EssCelebrationsCard({
  birthdays = [],
  anniversaries = [],
  onNavigate,
  onOpenToday,
}: {
  birthdays?: EssCelebrationPerson[];
  anniversaries?: EssCelebrationPerson[];
  onNavigate: (tab: EssTab) => void;
  onOpenToday?: () => void;
}) {
  const birthdayRows = useMemo(
    () =>
      birthdays
        .map((item) => ({ ...item, until: untilLabel(item.date), ...dateParts(item.date) }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
    [birthdays],
  );
  const anniversaryRows = useMemo(
    () =>
      anniversaries
        .map((item) => ({ ...item, until: untilLabel(item.date), ...dateParts(item.date) }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
    [anniversaries],
  );
  const todayCount = [...birthdayRows, ...anniversaryRows].filter((item) => item.until === 'Today').length;

  return (
    <EssCard className="p-3">
      <EssSectionHeader
        title="Birthdays & Anniversaries"
        action={
          <button type="button" onClick={() => onNavigate('communication')} className="text-[12px] font-semibold text-[#2563EB] hover:underline">
            View all →
          </button>
        }
      />

      {todayCount > 0 ? (
        <button
          type="button"
          onClick={() => onOpenToday?.()}
          className="mb-2 flex w-full items-center gap-2 rounded-[12px] border border-[#F9A8D4] bg-gradient-to-r from-[#FDF2F8] to-[#EEF2FF] px-3 py-2 text-left"
        >
          <Gift className="h-4 w-4 shrink-0 text-[#DB2777]" />
          <span className="text-[11px] font-bold text-[#9D174D]">
            {todayCount} celebration{todayCount === 1 ? '' : 's'} today — view flyer
          </span>
        </button>
      ) : null}

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[#BE185D]">
            <Cake className="h-3.5 w-3.5" />
            <p className="text-[10px] font-bold uppercase tracking-wide">Upcoming Birthdays</p>
          </div>
          {birthdayRows.length ? (
            <div className="space-y-1.5">
              {birthdayRows.map((item, index) => (
                <CelebrationRow key={item.id} item={item} tone="birthday" index={index} />
              ))}
            </div>
          ) : (
            <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-4 text-center text-[11px] text-[#94A3B8]">No upcoming birthdays.</p>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[#4338CA]">
            <Trophy className="h-3.5 w-3.5" />
            <p className="text-[10px] font-bold uppercase tracking-wide">Work Anniversaries</p>
          </div>
          {anniversaryRows.length ? (
            <div className="space-y-1.5">
              {anniversaryRows.map((item, index) => (
                <CelebrationRow key={item.id} item={item} tone="anniversary" index={index} />
              ))}
            </div>
          ) : (
            <p className="rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3 py-4 text-center text-[11px] text-[#94A3B8]">No upcoming anniversaries.</p>
          )}
        </div>
      </div>
    </EssCard>
  );
}

export function EssCelebrationFlyerModal({
  moments,
  viewer,
  forceOpen = false,
  onForceOpenHandled,
}: {
  moments: EssCelebrationMoment[];
  viewer?: { employeeId?: string; employeeCode?: string; fullName?: string } | null;
  forceOpen?: boolean;
  onForceOpenHandled?: () => void;
}) {
  const today = todayIsoLocal();
  const ids = useMemo(() => moments.map((item) => item.id), [moments]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!moments.length) {
      setOpen(false);
      return;
    }
    try {
      const key = storageKeyFor(today, ids);
      if (window.localStorage.getItem(key) === 'seen') return;
      setOpen(true);
      setIndex(0);
    } catch {
      setOpen(true);
    }
  }, [ids, moments.length, today]);

  useEffect(() => {
    if (!forceOpen || !moments.length) return;
    setOpen(true);
    setIndex(0);
    onForceOpenHandled?.();
  }, [forceOpen, moments.length, onForceOpenHandled]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKeyFor(today, ids), 'seen');
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open || !moments.length) return null;

  const current = moments[Math.min(index, moments.length - 1)];
  const self = isSameEmployee(current, viewer);
  const isBirthday = current.kind === 'birthday';
  const headline = self
    ? isBirthday
      ? 'Happy Birthday!'
      : 'Happy Work Anniversary!'
    : isBirthday
      ? 'Birthday Celebration'
      : 'Work Anniversary';
  const body = self
    ? isBirthday
      ? 'Wishing you a wonderful day filled with joy. The Dorman Long family celebrates you today.'
      : `Thank you for ${current.years || 1} year${(current.years || 1) === 1 ? '' : 's'} of dedication. We’re proud to celebrate your journey with us.`
    : isBirthday
      ? `Join us in wishing ${current.fullName} a fantastic birthday today.`
      : `Celebrate ${current.fullName} for ${current.years || 1} year${(current.years || 1) === 1 ? '' : 's'} of service with Dorman Long.`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0F172A]/55 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={headline}>
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[#475569] shadow-sm hover:bg-white"
          aria-label="Close celebration"
        >
          <X className="h-4 w-4" />
        </button>

        <div className={`relative overflow-hidden px-6 pb-8 pt-10 text-white ${isBirthday ? 'bg-gradient-to-br from-[#DB2777] via-[#EC4899] to-[#F97316]' : 'bg-gradient-to-br from-[#4338CA] via-[#6366F1] to-[#2563EB]'}`}>
          <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/15" />
          <div className="pointer-events-none absolute -bottom-10 left-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute right-16 top-14 h-3 w-3 rounded-full bg-white/70" />
          <div className="pointer-events-none absolute left-10 top-8 h-2 w-2 rounded-full bg-white/50" />

          <div className="relative flex flex-col items-center text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm">
              {isBirthday ? <Cake className="h-3.5 w-3.5" /> : <Trophy className="h-3.5 w-3.5" />}
              {self ? 'It’s your day' : 'Celebrating today'}
            </div>
            <div className="rounded-full bg-white p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.25)]">
              <EmployeeAvatar
                fullName={current.fullName}
                employeeCode={current.employeeCode}
                employeeId={current.employeeId}
                hasPhoto={current.hasPhoto}
                tryPhoto
                size="xl"
                className="h-24 w-24 ring-0"
              />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-white/90" />
              <h2 className="text-[22px] font-black tracking-tight">{headline}</h2>
              <Sparkles className="h-4 w-4 text-white/90" />
            </div>
            <p className="mt-2 text-[18px] font-bold leading-snug">{current.fullName}</p>
            <p className="mt-1 text-[12px] font-semibold text-white/85">
              {current.department || 'Dorman Long'}
              {!isBirthday && current.years ? ` · ${current.years} year${current.years === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-center text-[13px] font-semibold leading-relaxed text-[#475569]">{body}</p>

          {moments.length > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setIndex((value) => (value - 1 + moments.length) % moments.length)}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[11px] font-bold text-[#334155]"
              >
                Previous
              </button>
              <span className="text-[11px] font-bold text-[#64748B]">
                {index + 1} / {moments.length}
              </span>
              <button
                type="button"
                onClick={() => setIndex((value) => (value + 1) % moments.length)}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[11px] font-bold text-[#334155]"
              >
                Next
              </button>
            </div>
          ) : null}

          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-[#94A3B8]">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(`${today}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>

          <button
            type="button"
            onClick={dismiss}
            className={`flex h-11 w-full items-center justify-center rounded-[12px] text-sm font-bold text-white shadow-sm ${isBirthday ? 'bg-[#DB2777] hover:bg-[#BE185D]' : 'bg-[#4338CA] hover:bg-[#3730A3]'}`}
          >
            Continue to portal
          </button>
        </div>
      </div>
    </div>
  );
}
