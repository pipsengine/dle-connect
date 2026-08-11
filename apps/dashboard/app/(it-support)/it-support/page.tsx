'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ElementType } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Clock3,
  Grid2X2,
  KeyRound,
  List,
  Monitor,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { filterItSupportModuleCards } from '@/lib/access/it-support-access';
import { IT_SUPPORT_MODULE, type ItSupportModuleCard } from '@/lib/it-support/nav';
import { ItSupportBreadcrumbs } from './it-support-portal-shell';

type CatalogueFilter = 'all' | 'live' | 'ready';
type CatalogueView = 'grid' | 'list';

const IconTile = ({
  icon: Icon,
  tone = 'teal',
}: {
  icon: ElementType;
  tone?: 'teal' | 'amber' | 'blue';
}) => {
  const toneClass = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  } as const;

  return (
    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass[tone]}`}>
      <Icon size={22} strokeWidth={1.8} />
    </div>
  );
};

const StatusBadge = ({ status }: { status: 'live' | 'ready' }) => {
  const live = status === 'live';
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide',
        live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
      ].join(' ')}
    >
      {live ? 'LIVE' : 'COMING SOON'}
    </span>
  );
};

function MetricCard({
  value,
  label,
  icon,
  tone = 'teal',
}: {
  value: string;
  label: string;
  icon: ElementType;
  tone?: 'teal' | 'amber' | 'blue';
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <IconTile icon={icon} tone={tone} />
      <div className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="absolute bottom-5 right-4 flex items-end gap-1 opacity-70">
        <span className="h-1 w-2 rounded-full bg-teal-300" />
        <span className="h-2 w-2 rounded-full bg-teal-400" />
        <span className="h-1.5 w-2 rounded-full bg-teal-300" />
        <span className="h-3 w-2 rounded-full bg-teal-500" />
        <span className="h-2 w-2 rounded-full bg-teal-300" />
      </div>
    </div>
  );
}

function InfoCard({
  title,
  label,
  icon,
  tone = 'teal',
}: {
  title: string;
  label: string;
  icon: ElementType;
  tone?: 'teal' | 'blue';
}) {
  return (
    <div className="relative min-h-[133px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <IconTile icon={icon} tone={tone} />
      <div className="mt-4 text-xl font-bold text-slate-950">{title}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function HeroIllustration() {
  return (
    <div className="relative hidden h-full min-h-[240px] items-center justify-center xl:flex">
      <div className="absolute h-52 w-52 rounded-full bg-teal-100/50 blur-3xl" />
      <div className="relative">
        <div className="flex h-32 w-40 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-xl">
          <Monitor size={70} strokeWidth={1.25} className="text-slate-400" />
        </div>
        <div className="absolute -bottom-10 left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-3xl bg-teal-700 text-white shadow-xl">
          <ShieldCheck size={42} />
        </div>
        <div className="absolute -left-16 bottom-1 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-md">
          <Server size={30} className="text-slate-500" />
        </div>
        <div className="absolute -right-16 bottom-1 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-md">
          <KeyRound size={28} className="text-teal-600" />
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ item, view }: { item: ItSupportModuleCard; view: CatalogueView }) {
  const Icon = item.icon;
  const live = item.status === 'live';
  const action = live ? 'Open workspace' : 'Preview readiness';

  if (view === 'list') {
    return (
      <Link
        href={item.href}
        className="group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_14px_35px_rgba(15,118,110,0.08)] sm:flex-row sm:items-center"
      >
        <IconTile icon={Icon} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold text-slate-950">{item.title}</h3>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-2 max-w-3xl text-[13px] leading-5 text-slate-500">{item.description}</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-bold text-teal-700">
          {action}
          <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_14px_35px_rgba(15,118,110,0.08)]"
    >
      <div className="flex items-start gap-4">
        <IconTile icon={Icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-bold text-slate-950">{item.title}</h3>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-3 max-w-md text-[13px] leading-5 text-slate-500">{item.description}</p>
        </div>
      </div>
      <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-teal-700">
        {action}
        <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

export default function ItSupportCommandCentrePage() {
  const [session, setSession] = useState({
    permissions: [] as string[],
    isGlobalAdmin: false,
    ready: false,
  });
  const [filter, setFilter] = useState<CatalogueFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<CatalogueView>('grid');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        setSession({
          permissions: Array.isArray(json?.data?.permissions) ? json.data.permissions : [],
          isGlobalAdmin: Boolean(json?.data?.isGlobalAdmin),
          ready: true,
        });
      })
      .catch(() => {
        if (active) setSession((current) => ({ ...current, ready: true }));
      });
    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo(
    () => filterItSupportModuleCards(session.permissions, session.isGlobalAdmin),
    [session.isGlobalAdmin, session.permissions],
  );

  const visibleCards = useMemo(() => {
    if (filter === 'all') return cards;
    return cards.filter((card) => card.status === filter);
  }, [cards, filter]);

  const liveCount = cards.filter((card) => card.status === 'live').length;
  const readyCount = cards.filter((card) => card.status === 'ready').length;

  const filterLabel =
    filter === 'all' ? 'All Modules' : filter === 'live' ? 'Live Modules' : 'Coming Soon';

  return (
    <div className="mx-auto max-w-[1640px]">
      <ItSupportBreadcrumbs items={['Command Centre']} />

      <section className="overflow-hidden rounded-[24px] border border-teal-100 bg-gradient-to-r from-teal-50/90 via-white to-white shadow-[0_12px_40px_rgba(15,118,110,0.06)]">
        <div className="grid gap-6 p-7 lg:grid-cols-[1.25fr_.75fr] 2xl:grid-cols-[1.15fr_.75fr_.8fr]">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-4 py-2 text-xs font-bold tracking-[0.16em] text-teal-800">
              <Sparkles size={15} />
              ENTERPRISE IT WORKSPACE
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 xl:text-[42px] xl:leading-[1.08]">
              {IT_SUPPORT_MODULE.name}
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              {IT_SUPPORT_MODULE.description}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/it-support/account-recovery"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
              >
                <KeyRound size={18} />
                Open Account Recovery
              </Link>
              <Link
                href="/it-support/asset-management"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <Boxes size={18} />
                Asset Management
              </Link>
            </div>
          </div>

          <HeroIllustration />

          <div className="grid grid-cols-2 gap-3 lg:col-span-1">
            <MetricCard
              value={session.ready ? String(liveCount) : '—'}
              label="Live Modules"
              icon={Monitor}
              tone="teal"
            />
            <MetricCard
              value={session.ready ? String(readyCount) : '—'}
              label="Coming Online"
              icon={Clock3}
              tone="amber"
            />
            <InfoCard title="ACL" label="Access Model" icon={ShieldCheck} tone="teal" />
            <InfoCard title="Portal" label="Shell" icon={TerminalSquare} tone="blue" />
          </div>
        </div>
      </section>

      <section className="mt-7">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Service Catalogue</h2>
            <p className="mt-1 text-sm text-slate-500">Modules available from your published IT access.</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen((open) => !open)}
                className="flex min-w-[160px] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
              >
                {filterLabel}
                <ChevronDown size={16} />
              </button>
              {filterOpen ? (
                <div className="absolute right-0 z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  {(
                    [
                      { id: 'all', label: 'All Modules' },
                      { id: 'live', label: 'Live Modules' },
                      { id: 'ready', label: 'Coming Soon' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setFilter(option.id);
                        setFilterOpen(false);
                      }}
                      className={`flex w-full px-4 py-2.5 text-left text-sm ${
                        filter === option.id ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                aria-label="Grid view"
                onClick={() => setView('grid')}
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  view === 'grid' ? 'bg-teal-50 text-teal-700' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                <Grid2X2 size={17} />
              </button>
              <button
                type="button"
                aria-label="List view"
                onClick={() => setView('list')}
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  view === 'list' ? 'bg-teal-50 text-teal-700' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                <List size={17} />
              </button>
            </div>
          </div>
        </div>

        <div className={view === 'grid' ? 'grid gap-4 md:grid-cols-2 2xl:grid-cols-3' : 'grid gap-3'}>
          {visibleCards.map((item) => (
            <ServiceCard key={item.id} item={item} view={view} />
          ))}
          {!session.ready ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500 md:col-span-2 2xl:col-span-3">
              Loading your IT workspace access…
            </div>
          ) : null}
          {session.ready && visibleCards.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 md:col-span-2 2xl:col-span-3">
              {cards.length === 0
                ? 'No IT modules are published for this account. Contact an administrator to grant IT & Support access.'
                : 'No modules match this catalogue filter.'}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
