'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { procurementGet, moneyNgn } from '../lib/procurement-api';
import { KpiCard, StatusBadge, formatWhen, primaryBtnClass, secondaryBtnClass } from './proc-ui';

type DashboardTask = {
  refId: string;
  title: string;
  stage: string;
  requester: string | null;
  status: string;
  dueAt: string | null;
  priority: string;
};

type SpendSlice = {
  name: string;
  value: number;
  count: number;
  color: string;
};

type RecentCbe = {
  cbeId: string;
  title: string;
  status: string;
  rfqNumber?: string | null;
  buyerName?: string | null;
};

type Dashboard = {
  openPrCount: number;
  openRfqCount: number;
  openCbeCount: number;
  openPoCount: number;
  supplierCount: number;
  pendingApprovalCount: number;
  yearSpend?: number;
  recentCbes?: RecentCbe[];
  tasks?: DashboardTask[];
  spendByDepartment?: SpendSlice[];
};

const CBE_STEPS = [
  'Overview',
  'Bid Comparison',
  'Technical Evaluation',
  'Commercial Evaluation',
  'Negotiation',
  'Recommendation & Approval',
] as const;

function stepIndexForStatus(status: string | undefined) {
  if (!status) return 0;
  const s = status.toLowerCase();
  if (s.includes('recommendation') || s.includes('approval') || s === 'approved' || s === 'awarded' || s === 'completed') return 5;
  if (s.includes('negotiation')) return 4;
  if (s.includes('commercial')) return 3;
  if (s.includes('technical') || s === 'in evaluation') return 2;
  if (s.includes('bid comparison')) return 1;
  return 0;
}

const QUICK_ACTIONS = [
  { label: 'New Purchase Requisition', href: '/procurement/purchase-requisitions', icon: FileText },
  { label: 'New RFQ', href: '/procurement/rfqs', icon: FileText },
  { label: 'New CBE', href: '/procurement/cbe', icon: Scale },
  { label: 'New Purchase Order', href: '/procurement/purchase-orders', icon: ShoppingCart },
  { label: 'Suppliers', href: '/procurement/suppliers', icon: Users },
  { label: 'Reports', href: '/procurement/reports', icon: ClipboardList },
];

export function ProcurementDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await procurementGet<Dashboard>('dashboard'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recentCbe = data?.recentCbes?.[0];
  const activeStep = stepIndexForStatus(recentCbe?.status);
  const spendData = useMemo(() => data?.spendByDepartment || [], [data?.spendByDepartment]);
  const yearSpend = data?.yearSpend || spendData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Procurement Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Live pipeline, spend, and approvals across the procurement lifecycle.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading || !data ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Open PRs" value={data.openPrCount} href="/procurement/purchase-requisitions" icon={<FileText className="h-4 w-4" />} />
            <KpiCard label="Open RFQs" value={data.openRfqCount} href="/procurement/rfqs" icon={<FileText className="h-4 w-4" />} tint="bg-indigo-50 text-indigo-700" />
            <KpiCard label="Active CBEs" value={data.openCbeCount} href="/procurement/cbe" icon={<Scale className="h-4 w-4" />} tint="bg-violet-50 text-violet-700" />
            <KpiCard label="Open POs" value={data.openPoCount} href="/procurement/purchase-orders" icon={<ShoppingCart className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-700" />
            <KpiCard label="Suppliers" value={data.supplierCount} href="/procurement/suppliers" icon={<Users className="h-4 w-4" />} tint="bg-sky-50 text-sky-700" />
            <KpiCard label="Pending Approvals" value={data.pendingApprovalCount} href="/procurement/cbe" icon={<CheckCircle2 className="h-4 w-4" />} tint="bg-amber-50 text-amber-700" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-slate-900">Recent Competitive Bid Evaluation</h2>
                  {recentCbe ? (
                    <p className="mt-1 text-sm text-slate-600">
                      <Link href={`/procurement/cbe/${encodeURIComponent(recentCbe.cbeId)}`} className="font-semibold text-blue-600 hover:underline">
                        {recentCbe.cbeId}
                      </Link>
                      {' · '}
                      {recentCbe.title}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">No CBEs yet.</p>
                  )}
                </div>
                {recentCbe ? <StatusBadge status={recentCbe.status} /> : null}
              </div>
              <ol className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {CBE_STEPS.map((step, idx) => {
                  const done = idx <= activeStep;
                  return (
                    <li
                      key={step}
                      className={`rounded-lg border px-2 py-3 text-center text-[11px] font-semibold leading-tight ${
                        done ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <div className="mb-1 text-[10px] opacity-80">Step {idx + 1}</div>
                      {step}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4">
                <Link href="/procurement/cbe" className="text-xs font-semibold text-blue-600 hover:underline">
                  View all CBEs →
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Spend Overview</h2>
              <p className="mt-1 text-xs text-slate-500">Year spend by department · {moneyNgn(yearSpend)}</p>
              <div className="mt-2 h-48">
                {spendData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={spendData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                        {spendData.map((slice) => (
                          <Cell key={slice.name} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => moneyNgn(Number(value) || 0)}
                        contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">No spend data yet.</div>
                )}
              </div>
              <ul className="mt-2 space-y-1.5">
                {spendData.slice(0, 4).map((slice) => (
                  <li key={slice.name} className="flex items-center justify-between text-xs text-slate-600">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: slice.color }} />
                      {slice.name}
                    </span>
                    <span className="font-semibold text-slate-800">{moneyNgn(slice.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">My Tasks / Approvals</h2>
                <Link href="/procurement/cbe" className="text-xs font-semibold text-blue-600">View all</Link>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {(data.tasks || []).length ? (
                  (data.tasks || []).map((task) => (
                    <Link
                      key={`${task.refId}-${task.stage}`}
                      href={`/procurement/cbe/${encodeURIComponent(task.refId)}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="text-xs font-mono text-slate-500">{task.refId}</div>
                        <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {task.stage}
                          {task.requester ? ` · ${task.requester}` : ''}
                          {task.dueAt ? ` · ${formatWhen(task.dueAt)}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                          {task.priority}
                        </span>
                        <StatusBadge status={task.status} />
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="py-10 text-center text-sm text-slate-500">No pending approvals right now.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Quick Actions</h2>
              <div className="mt-3 grid gap-2">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.href + action.label}
                      href={action.href}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <Icon className="h-4 w-4 text-blue-600" />
                      {action.label}
                    </Link>
                  );
                })}
              </div>
              <Link href="/procurement/cbe" className={`${primaryBtnClass} mt-4 w-full`}>
                <Plus className="h-4 w-4" /> Start New CBE
              </Link>
            </div>
          </div>

          <footer className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            © 2026 DLE Connect · v2.0.0 · System Status{' '}
            <span className="font-semibold text-emerald-600">Operational</span>
          </footer>
        </>
      )}
    </div>
  );
}
