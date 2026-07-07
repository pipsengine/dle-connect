'use client';

type PayrollPeriodOption = {
  period: string;
  periodLabel: string;
  status: string;
  isActive?: boolean;
  runStatus?: string | null;
};

export type PayrollPeriodContext = {
  period?: string;
  periodLabel?: string;
  generatedAt?: string;
  dataMode?: 'live' | 'snapshot' | 'run-header' | 'pending';
  payrollComputed?: boolean;
  isViewingActivePeriod?: boolean;
  activePeriodLabel?: string;
  dataSource?: { source?: string; employeeCount?: number };
  summary?: { totalEmployees?: number; exceptionCount?: number };
  currentRun?: { status?: string } | null;
  workflow?: { currentStatus?: string };
  periodRecord?: { status?: string } | null;
  periods?: PayrollPeriodOption[];
};

const numberFmt = new Intl.NumberFormat('en-GB');

const fmtDateTime = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const runStatusFor = (payload: PayrollPeriodContext | null | undefined) =>
  payload?.currentRun?.status || payload?.workflow?.currentStatus || payload?.periodRecord?.status || 'Draft';

const dataModeLabel = (mode?: PayrollPeriodContext['dataMode'], computed?: boolean) => {
  if (mode === 'snapshot') return { label: 'Snapshot', tone: 'bg-violet-50 text-violet-800 ring-violet-100' };
  if (mode === 'pending' || !computed) return { label: 'Pending computation', tone: 'bg-amber-50 text-amber-800 ring-amber-100' };
  if (mode === 'run-header') return { label: 'Run header', tone: 'bg-slate-100 text-slate-700 ring-slate-200' };
  return { label: 'Live HRIS', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-100' };
};

const statusTone = (status: string) => {
  if (['Closed', 'Released', 'Posted', 'Published', 'Locked', 'Approved'].includes(status)) return 'bg-emerald-50 text-emerald-800 ring-emerald-100';
  if (['Blocked', 'Validation'].includes(status)) return 'bg-red-50 text-red-800 ring-red-100';
  if (['Open', 'Submitted', 'Under Review', 'Computed', 'Ready for Approval'].includes(status)) return 'bg-blue-50 text-blue-800 ring-blue-100';
  return 'bg-amber-50 text-amber-800 ring-amber-100';
};

export default function PayrollPeriodContextBar({
  payload,
  viewPeriod,
  onSelectPeriod,
  compact = false,
  showSelector = true,
  showMetaBadges = true,
  className = '',
}: {
  payload: PayrollPeriodContext | null | undefined;
  viewPeriod?: string | null;
  onSelectPeriod?: (period: string) => void;
  compact?: boolean;
  showSelector?: boolean;
  showMetaBadges?: boolean;
  className?: string;
}) {
  const runStatus = runStatusFor(payload);
  const dataMode = dataModeLabel(payload?.dataMode, payload?.payrollComputed);
  const employees = payload?.dataSource?.employeeCount ?? payload?.summary?.totalEmployees ?? 0;
  const viewingHistorical = payload?.isViewingActivePeriod === false;

  return (
    <div className={className}>
      {viewingHistorical ? (
        <div className={`${compact ? 'mb-2' : 'mb-3'} rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900`}>
          Viewing <span className="font-extrabold">{payload?.periodLabel || 'selected period'}</span> (historical).
          Active payroll period is <span className="font-extrabold">{payload?.activePeriodLabel || 'another period'}</span>.
          {onSelectPeriod && payload?.periods?.some((p) => p.isActive) ? (
            <button
              type="button"
              onClick={() => {
                const active = payload.periods?.find((p) => p.isActive);
                if (active) onSelectPeriod(active.period);
              }}
              className="ml-2 font-extrabold text-amber-950 underline"
            >
              Switch to active period
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {showMetaBadges ? (
          <span className={`rounded-full bg-blue-50 px-2.5 py-1 font-bold text-blue-800 ring-1 ring-blue-100 ${compact ? 'py-0.5' : 'py-1'}`}>
            Period: {payload?.periodLabel || 'Loading'}
          </span>
        ) : null}

        {showSelector && (payload?.periods?.length || 0) > 0 && onSelectPeriod ? (
          <label className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 font-bold text-slate-700 ${compact ? 'py-0.5' : 'py-1'}`}>
            <span className="text-slate-500">View</span>
            <select
              value={viewPeriod || payload?.period || ''}
              onChange={(e) => onSelectPeriod(e.target.value)}
              className="max-w-[220px] bg-transparent font-bold text-slate-900 focus:outline-none"
              aria-label="Select payroll period"
            >
              {(payload?.periods || []).map((item) => (
                <option key={item.period} value={item.period}>
                  {item.periodLabel} ({item.runStatus || item.status}
                  {item.isActive ? ' · active' : ''})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showMetaBadges ? (
          <>
            <span className={`rounded-full px-2.5 py-1 font-bold ring-1 ${statusTone(runStatus)} ${compact ? 'py-0.5' : 'py-1'}`}>
              Run: {runStatus}
            </span>

            <span className={`rounded-full px-2.5 py-1 font-bold ring-1 ${dataMode.tone} ${compact ? 'py-0.5' : 'py-1'}`}>
              Data: {dataMode.label}
            </span>

            {!compact ? (
              <>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-100">
                  Source: {payload?.dataSource?.source || 'DLE Enterprise HRIS'}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">
                  Employees: {numberFmt.format(employees)}
                </span>
                {typeof payload?.summary?.exceptionCount === 'number' ? (
                  <span className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${payload.summary.exceptionCount > 0 ? 'bg-red-50 text-red-800 ring-red-100' : 'bg-emerald-50 text-emerald-800 ring-emerald-100'}`}>
                    Issues: {numberFmt.format(payload.summary.exceptionCount)}
                  </span>
                ) : null}
              </>
            ) : null}

            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
              Loaded: {fmtDateTime(payload?.generatedAt)}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
