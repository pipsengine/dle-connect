import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Construction } from 'lucide-react';
import { ItSupportBreadcrumbs } from '../it-support-portal-shell';

type Props = {
  title: string;
  description: string;
  crumbs: string[];
  icon: LucideIcon;
  highlights?: string[];
};

export function ItSupportComingSoon({ title, description, crumbs, icon: Icon, highlights = [] }: Props) {
  return (
    <div className="space-y-5">
      <ItSupportBreadcrumbs items={crumbs} />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/40 px-6 py-8 sm:px-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <Icon className="h-6 w-6" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
              Coming soon
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
        </div>
        <div className="grid gap-4 px-6 py-6 sm:grid-cols-[1.2fr_0.8fr] sm:px-8">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Construction className="h-3.5 w-3.5" />
              Delivery readiness
            </div>
            <ul className="mt-3 space-y-2">
              {(highlights.length
                ? highlights
                : [
                    'Permission-aware portal entry is already wired.',
                    'Navigation and deep-links are reserved in the IT sidebar.',
                    'Operational workflows will land here without relocating the portal.',
                  ]
              ).map((item) => (
                <li key={item} className="flex gap-2 text-sm text-slate-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meanwhile</p>
            <p className="mt-2 text-sm text-slate-600">
              Use live IT workspaces for account recovery and asset lifecycle operations.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/it-support/account-recovery"
                className="inline-flex rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Account Recovery
              </Link>
              <Link
                href="/it-support/asset-management"
                className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Asset Management
              </Link>
              <Link
                href="/it-support"
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Command Centre
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
