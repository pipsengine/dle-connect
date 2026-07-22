'use client';

import { useMemo } from 'react';
import {
  CheckCircle2,
  X,
} from 'lucide-react';
import LeaveReportsAnalyticsView from './LeaveReportsAnalyticsView';

type AppRecord = {
  id: string;
  employeeId: string;
  fullName: string;
  department: string;
  managerName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  stage: string;
  approvalStatus: string;
  policyComplianceStatus: string;
  balanceImpact: number;
  availableBalance: number;
  actingOfficer: string;
  exceptions: string[];
  allowanceStatus?: string;
};

type BalanceRecord = {
  employeeId: string;
  fullName: string;
  department: string;
  leaveType: string;
  currentBalance: number;
  accruedBalance: number;
  usedBalance: number;
  pendingBalance: number;
  forfeitedBalance: number;
  carryForwardBalance: number;
  liabilityValue: number;
  status: string;
  exceptions: string[];
};

type LeaveTypeRule = {
  id: string;
  name: string;
  active: boolean;
  entitlementDays: number;
  durationBasis: string;
  eligibility: string;
  accrualRule: string;
  carryForwardRule: string;
  encashmentRule: string;
  allowanceRule: string;
  approvalLevels: string[];
};

type HolidayRecord = { id: string; label: string; date: string; source?: string };

type SectionPayload = {
  applications?: AppRecord[];
  balances?: BalanceRecord[];
  leaveTypes?: LeaveTypeRule[];
  holidays?: HolidayRecord[];
  calendar?: Array<Record<string, string | number>>;
  blockedPeriods?: Array<Record<string, string>>;
  allowanceExceptions?: Array<Record<string, unknown>>;
  operationalSections?: Array<{ id: string; label: string; description: string; controls?: string[]; reports?: string[] }>;
  summary?: {
    pendingApprovals?: number;
    employeesOnLeave?: number;
    leaveUtilizationPct?: number;
    leaveLiability?: number;
  };
};

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value || 0));

const Chip = ({ value }: { value: string }) => (
  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{value}</span>
);

const Panel = ({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 p-4">
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const MetricStrip = ({ items }: { items: Array<{ label: string; value: string | number; hint?: string }> }) => (
  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {items.map((item) => (
      <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{item.label}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{item.value}</p>
        {item.hint ? <p className="mt-1 text-xs font-semibold text-slate-500">{item.hint}</p> : null}
      </div>
    ))}
  </div>
);

const ApplicationTable = ({ rows, empty }: { rows: AppRecord[]; empty: string }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200">
    <table className="min-w-full divide-y divide-slate-100">
      <thead className="bg-slate-50">
        <tr>
          {['Employee', 'Type', 'Period', 'Days', 'Status', 'Stage', 'Reliever'].map((header) => (
            <th key={header} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{header}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {rows.length ? rows.map((item) => (
          <tr key={item.id} className="hover:bg-slate-50">
            <td className="px-4 py-3">
              <div className="font-black text-slate-950">{item.fullName}</div>
              <div className="text-xs font-semibold text-slate-500">{item.employeeId} · {item.department}</div>
            </td>
            <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.leaveType}</td>
            <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.startDate} → {item.endDate}</td>
            <td className="px-4 py-3 text-sm font-black text-slate-900">{item.days}</td>
            <td className="px-4 py-3"><Chip value={item.status} /></td>
            <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.stage}</td>
            <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.actingOfficer || '—'}</td>
          </tr>
        )) : (
          <tr><td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">{empty}</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

export function LeaveOperationalSection({
  section,
  payload,
  applications,
  balances,
}: {
  section: string;
  payload: SectionPayload | null;
  applications: AppRecord[];
  balances: BalanceRecord[];
}) {
  const config = payload?.operationalSections?.find((item) => item.id === section);
  const holidays = payload?.holidays || [];
  const leaveTypes = payload?.leaveTypes || [];

  const recalled = useMemo(
    () => applications.filter((item) => /recall/i.test(item.status) || /recall/i.test(item.stage) || item.exceptions.some((ex) => /recall/i.test(ex))),
    [applications],
  );
  const cancelled = useMemo(
    () => applications.filter((item) => /cancel|withdrawn|terminated/i.test(item.status)),
    [applications],
  );
  const encashmentCandidates = useMemo(
    () => balances.filter((item) => /annual/i.test(item.leaveType) && item.currentBalance > 0).slice(0, 100),
    [balances],
  );
  const carryForwardRows = useMemo(
    () => balances.filter((item) => Number(item.carryForwardBalance || 0) > 0),
    [balances],
  );

  const deptCoverage = useMemo(() => {
    const map = new Map<string, { department: string; onLeave: number; pending: number; employees: Set<string> }>();
    for (const item of applications) {
      const key = item.department || 'Unassigned';
      const row = map.get(key) || { department: key, onLeave: 0, pending: 0, employees: new Set<string>() };
      row.employees.add(item.employeeId);
      if (['Approved', 'Completed'].includes(item.status)) row.onLeave += 1;
      else if (!['Cancelled', 'Rejected', 'Terminated'].includes(item.status)) row.pending += 1;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.onLeave - a.onLeave);
  }, [applications]);

  if (section === 'leave-reports' || section === 'leave-utilization' || section === 'leave-liability' || section === 'leave-trends' || section === 'approval-reports') {
    return <LeaveReportsAnalyticsView section={section} payload={payload as never} />;
  }

  if (section === 'recalls') {
    return (
      <Panel title="Leave Recalls" detail="Approved leave that has been recalled or marked for return-to-work adjustment.">
        <MetricStrip items={[
          { label: 'Recall cases', value: recalled.length },
          { label: 'Active applications', value: applications.length },
          { label: 'On leave today', value: payload?.summary?.employeesOnLeave || 0 },
        ]} />
        <ApplicationTable rows={recalled} empty="No leave recall cases in the current dataset. Recalls appear here when an approved leave is reversed." />
      </Panel>
    );
  }

  if (section === 'cancellations') {
    return (
      <Panel title="Leave Cancellations & Withdrawals" detail="Cancelled, withdrawn, and terminated leave requests with audit-ready status.">
        <MetricStrip items={[
          { label: 'Cancelled / withdrawn', value: cancelled.length },
          { label: 'Total applications', value: applications.length },
        ]} />
        <ApplicationTable rows={cancelled} empty="No cancellations or withdrawals found." />
      </Panel>
    );
  }

  if (section === 'encashments') {
    return (
      <Panel title="Leave Encashment Queue" detail="Annual leave balances eligible for encashment review (policy-controlled).">
        <MetricStrip items={[
          { label: 'Encashment candidates', value: encashmentCandidates.length },
          { label: 'Total balance days', value: encashmentCandidates.reduce((sum, item) => sum + Number(item.currentBalance || 0), 0) },
        ]} />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>{['Employee', 'Department', 'Balance', 'Used', 'Carry Forward', 'Liability', 'Status'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {encashmentCandidates.map((item) => (
                <tr key={`${item.employeeId}-encash`} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="font-black text-slate-950">{item.fullName}</div><div className="text-xs font-semibold text-slate-500">{item.employeeId}</div></td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.department}</td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{item.currentBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.usedBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.carryForwardBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{money(item.liabilityValue)}</td>
                  <td className="px-4 py-3"><Chip value={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  if (section === 'team-leave-planner') {
    return (
      <Panel title="Team Leave Planner" detail="Department coverage, overlapping absences, and upcoming approved leave for workforce planning.">
        <MetricStrip items={[
          { label: 'Departments tracked', value: deptCoverage.length },
          { label: 'Approved leave blocks', value: applications.filter((item) => ['Approved', 'Completed'].includes(item.status)).length },
          { label: 'Pending coverage risk', value: applications.filter((item) => !['Approved', 'Completed', 'Cancelled', 'Rejected', 'Terminated'].includes(item.status)).length },
        ]} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50"><tr>{['Department', 'People on leave records', 'Approved', 'Pending'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {deptCoverage.slice(0, 40).map((row) => (
                  <tr key={row.department} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-black text-slate-950">{row.department}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-700">{row.employees.size}</td>
                    <td className="px-4 py-3 text-sm font-black text-emerald-700">{row.onLeave}</td>
                    <td className="px-4 py-3 text-sm font-black text-amber-700">{row.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ApplicationTable
            rows={applications.filter((item) => ['Approved', 'Completed', 'Line Manager Review', 'HR Review', 'Submitted', 'Under Review'].includes(item.status)).slice(0, 40)}
            empty="No team leave plans available."
          />
        </div>
      </Panel>
    );
  }

  if (section === 'holiday-calendar') {
    return (
      <Panel title="Holiday Calendar" detail="Nigeria public holidays (Google Calendar feed + HR overrides) used for leave day regularization.">
        <MetricStrip items={[
          { label: 'Public holidays', value: holidays.length },
          { label: 'Blocked periods', value: payload?.blockedPeriods?.length || 0 },
          { label: 'Feed', value: holidays[0]?.source || 'Synced' },
        ]} />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr>{['Date', 'Holiday', 'Source', 'Leave impact'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {holidays.length ? holidays.map((item) => (
                <tr key={item.id || item.date} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{item.date}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-800">{item.label}</td>
                  <td className="px-4 py-3"><Chip value={item.source || 'public'} /></td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">Excluded from leave balance deduction</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No holidays loaded yet. Refresh Leave Management to sync Nigeria public holidays.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  if (section === 'leave-policies') {
    return (
      <Panel title="Leave Policies" detail="Policy rules bound to configured leave types — entitlement, accrual, carry-forward, approvals, and allowance.">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr>{['Policy / Type', 'Entitlement', 'Accrual', 'Carry Forward', 'Encashment', 'Allowance', 'Approvals', 'Status'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {leaveTypes.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-black text-slate-950">{item.name}<div className="text-xs font-semibold text-slate-500">{item.eligibility}</div></td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.entitlementDays} {String(item.durationBasis || '').toLowerCase()}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.accrualRule}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.carryForwardRule}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.encashmentRule}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.allowanceRule}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{(item.approvalLevels || []).join(' → ')}</td>
                  <td className="px-4 py-3"><Chip value={item.active ? 'Active' : 'Inactive'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  if (section === 'leave-accruals') {
    const annual = balances.filter((item) => /annual/i.test(item.leaveType));
    return (
      <Panel title="Leave Accruals" detail="Accrued entitlement versus used and available annual leave balances.">
        <MetricStrip items={[
          { label: 'Employees', value: annual.length },
          { label: 'Total accrued', value: annual.reduce((s, i) => s + Number(i.accruedBalance || 0), 0) },
          { label: 'Total used', value: annual.reduce((s, i) => s + Number(i.usedBalance || 0), 0) },
          { label: 'Total available', value: annual.reduce((s, i) => s + Number(i.currentBalance || 0), 0) },
        ]} />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr>{['Employee', 'Department', 'Accrued', 'Used', 'Pending', 'Available'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {annual.slice(0, 100).map((item) => (
                <tr key={`${item.employeeId}-accrual`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-black text-slate-950">{item.fullName}<div className="text-xs font-semibold text-slate-500">{item.employeeId}</div></td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.department}</td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{item.accruedBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.usedBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.pendingBalance}</td>
                  <td className="px-4 py-3 text-sm font-black text-emerald-700">{item.currentBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  if (section === 'carry-forward-processing') {
    return (
      <Panel title="Carry Forward Processing" detail="Employees with carry-forward balances requiring consumption or forfeiture review before year-end cut-off.">
        <MetricStrip items={[
          { label: 'CF balances', value: carryForwardRows.length },
          { label: 'CF days', value: carryForwardRows.reduce((s, i) => s + Number(i.carryForwardBalance || 0), 0) },
        ]} />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr>{['Employee', 'Department', 'Carry Forward', 'Available', 'Used', 'Status'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {carryForwardRows.length ? carryForwardRows.map((item) => (
                <tr key={`${item.employeeId}-cf`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-black text-slate-950">{item.fullName}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.department}</td>
                  <td className="px-4 py-3 text-sm font-black text-amber-700">{item.carryForwardBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.currentBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.usedBalance}</td>
                  <td className="px-4 py-3"><Chip value={item.status} /></td>
                </tr>
              )) : <tr><td colSpan={6} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No carry-forward balances pending processing.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  if (section === 'balance-adjustments') {
    const attention = balances.filter((item) => item.exceptions?.length || /attention|blocked|risk/i.test(item.status));
    return (
      <Panel title="Balance Adjustments" detail="Balances requiring manual adjustment, exception clearance, or recalculation attention.">
        <MetricStrip items={[
          { label: 'Attention rows', value: attention.length || balances.length },
          { label: 'Forfeited days', value: balances.reduce((s, i) => s + Number(i.forfeitedBalance || 0), 0) },
        ]} />
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr>{['Employee', 'Type', 'Available', 'Pending', 'Forfeited', 'Exceptions', 'Status'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {(attention.length ? attention : balances).slice(0, 80).map((item) => (
                <tr key={`${item.employeeId}-${item.leaveType}-adj`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-black text-slate-950">{item.fullName}<div className="text-xs font-semibold text-slate-500">{item.employeeId}</div></td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.leaveType}</td>
                  <td className="px-4 py-3 text-sm font-black text-slate-900">{item.currentBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.pendingBalance}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{item.forfeitedBalance}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.exceptions?.length ? item.exceptions.join('; ') : 'None'}</td>
                  <td className="px-4 py-3"><Chip value={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  if (section === 'leave-year-end-processing') {
    const annual = balances.filter((item) => /annual/i.test(item.leaveType));
    return (
      <Panel title="Leave Year-End Processing" detail="Year-end readiness: carry-forward caps, forfeiture candidates, and remaining annual balances.">
        <MetricStrip items={[
          { label: 'Annual balances', value: annual.length },
          { label: 'CF to process', value: carryForwardRows.length },
          { label: 'Remaining days', value: annual.reduce((s, i) => s + Number(i.currentBalance || 0), 0) },
          { label: 'Liability', value: money(annual.reduce((s, i) => s + Number(i.liabilityValue || 0), 0)) },
        ]} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { title: '1. Freeze period', body: 'Lock new leave applications for the closing leave year once HR confirms cut-off.' },
            { title: '2. Process carry-forward', body: 'Apply policy caps and move eligible unused days into carry-forward balances.' },
            { title: '3. Forfeit / open new year', body: 'Forfeit expired days, post liability, and open the new leave year entitlement.' },
          ].map((step) => (
            <div key={step.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">{step.title}</p>
              <p className="mt-2 text-xs font-semibold text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={config?.label || 'Leave Operations'} detail={config?.description || 'Operational leave workspace.'}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Section ready. Use related Planning, Transactions, or Reports tabs for detailed actions.
      </div>
      {config?.controls?.length ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {config.controls.map((control) => (
            <div key={control} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-black text-slate-950">{control}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Configured</p>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

export function LeaveBalanceDetailModal({
  row,
  onClose,
}: {
  row: BalanceRecord;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">{row.fullName}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{row.employeeId} · {row.department} · {row.leaveType}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              ['Leave entitled', row.accruedBalance],
              ['Used', row.usedBalance],
              ['Balance', row.currentBalance],
              ['Pending', row.pendingBalance],
              ['Forfeited', row.forfeitedBalance],
              ['Carry forward', row.carryForwardBalance],
              ['Liability', money(row.liabilityValue)],
              ['Status', row.status],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-black uppercase text-slate-500">Exceptions</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">{row.exceptions?.length ? row.exceptions.join('; ') : 'No exceptions recorded.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
