'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTemplate } from '@/components/layout/page-template';
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  Download,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { HealthStatus, StructureInsight } from '@/lib/organization-data';

type WorkforcePlanningRole = {
  id: string;
  code: string;
  title: string;
  gradeCode: string;
  positionType: 'Permanent' | 'Contract' | 'Project' | 'Temporary';
  positionStatus: 'Filled' | 'Vacant' | 'Frozen' | 'Under Review';
  criticality: 'Critical' | 'Core' | 'Support';
  replacementPriority: 'Immediate' | 'Planned' | 'Monitor';
  incumbentName: string | null;
  openDays: number;
  fte: number;
  benchmarkSalaryUsd: number;
  healthStatus: HealthStatus;
};

type WorkforcePlanRecord = {
  id: string;
  businessUnit: string;
  department: string;
  location: string;
  approvedPositions: number;
  approvedFte: number;
  filledFte: number;
  openDemandFte: number;
  vacantFte: number;
  frozenFte: number;
  reviewFte: number;
  vacancyRatePct: number;
  criticalPositions: number;
  criticalGapRoles: number;
  immediateBackfills: number;
  averageOpenDays: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  approvalCoveragePct: number;
  payrollRunRateUsd: number;
  openBudgetUsd: number;
  standardizationPct: number;
  healthStatus: HealthStatus;
  planningPriority: 'Immediate' | 'Planned' | 'Monitor';
  topRisks: string[];
  recommendedAction: string;
  roles: WorkforcePlanningRole[];
};

type WorkforcePlanningRequestRecord = {
  id: string;
  planId: string;
  businessUnit: string;
  department: string;
  location: string;
  requestType: 'Add Headcount' | 'Backfill Gap' | 'Temporary Coverage' | 'Structure Review';
  requestedFte: number;
  targetQuarter: string;
  requestedBy: string;
  justification: string;
  impactSummary: string;
  projectedApprovedFte: number;
  projectedFilledFte: number;
  projectedGapFte: number;
  incrementalBudgetUsd: number;
  status: 'Submitted' | 'Under Review' | 'Approved' | 'Declined';
  createdAt: string;
};

type Payload = {
  generatedAt: string;
  permissions: {
    canEdit: boolean;
    canExport: boolean;
    canViewCosts: boolean;
  };
  summary: {
    totalPlans: number;
    totalApprovedFte: number;
    totalFilledFte: number;
    totalOpenDemandFte: number;
    vacancyRatePct: number;
    criticalGapRoles: number;
    immediateBackfills: number;
    openBudgetUsd: number;
    avgSuccessionCoverage: number;
    avgAttritionRisk: number;
    pendingRequests: number;
    requestedFte: number;
  };
  filterOptions: {
    businessUnits: string[];
    locations: string[];
    planningPriorities: Array<WorkforcePlanRecord['planningPriority']>;
    healthStatuses: HealthStatus[];
  };
  plans: WorkforcePlanRecord[];
  requests: WorkforcePlanningRequestRecord[];
  insights: StructureInsight[];
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const healthTone = (status: HealthStatus) => {
  if (status === 'Critical') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Needs Attention') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const priorityTone = (priority: WorkforcePlanRecord['planningPriority']) => {
  if (priority === 'Immediate') return 'bg-red-50 text-red-700 border-red-200';
  if (priority === 'Planned') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const statusTone = (status: WorkforcePlanningRole['positionStatus']) => {
  if (status === 'Vacant') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Under Review') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Frozen') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const insightTone = (severity: StructureInsight['severity']) => {
  if (severity === 'high') return 'border-red-200 bg-red-50';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50';
  return 'border-emerald-200 bg-emerald-50';
};

const requestStatusTone = (status: WorkforcePlanningRequestRecord['status']) => {
  if (status === 'Declined') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Under Review') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

export default function WorkforcePlanningClient() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestActionError, setRequestActionError] = useState<string | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState<'All' | string>('All');
  const [locationFilter, setLocationFilter] = useState<'All' | string>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | WorkforcePlanRecord['planningPriority']>('All');
  const [healthFilter, setHealthFilter] = useState<'All' | HealthStatus>('All');
  const [sortBy, setSortBy] = useState<'openDemandFte' | 'vacancyRatePct' | 'openBudgetUsd' | 'successionCoveragePct'>('openDemandFte');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState({
    requestType: 'Add Headcount' as WorkforcePlanningRequestRecord['requestType'],
    requestedFte: '1',
    targetQuarter: 'Q3 2026',
    requestedBy: 'HR Manager',
    justification: '',
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/organization/workforce-planning', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load workforce planning');
      const data = json.data as Payload;
      setPayload(data);
      setSelectedId((prev) => prev || data.plans[0]?.id || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load workforce planning');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const plans = payload?.plans || [];

  const visiblePlans = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = plans.filter((plan) => {
      if (businessUnitFilter !== 'All' && plan.businessUnit !== businessUnitFilter) return false;
      if (locationFilter !== 'All' && plan.location !== locationFilter) return false;
      if (priorityFilter !== 'All' && plan.planningPriority !== priorityFilter) return false;
      if (healthFilter !== 'All' && plan.healthStatus !== healthFilter) return false;
      if (!q) return true;

      return [
        plan.businessUnit,
        plan.department,
        plan.location,
        plan.recommendedAction,
        plan.topRisks.join(' '),
        plan.roles.map((role) => `${role.title} ${role.code} ${role.incumbentName || ''}`).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'vacancyRatePct') return b.vacancyRatePct - a.vacancyRatePct;
      if (sortBy === 'openBudgetUsd') return b.openBudgetUsd - a.openBudgetUsd;
      if (sortBy === 'successionCoveragePct') return a.successionCoveragePct - b.successionCoveragePct;
      return b.openDemandFte - a.openDemandFte;
    });
  }, [plans, query, businessUnitFilter, locationFilter, priorityFilter, healthFilter, sortBy]);

  const selectedPlan = useMemo(() => visiblePlans.find((plan) => plan.id === selectedId) || visiblePlans[0] || null, [visiblePlans, selectedId]);

  const selectedPlanRequests = useMemo(
    () => (payload?.requests || []).filter((request) => request.planId === selectedPlan?.id),
    [payload?.requests, selectedPlan?.id],
  );

  const selectedRequest = useMemo(
    () => selectedPlanRequests.find((request) => request.id === selectedRequestId) || selectedPlanRequests[0] || null,
    [selectedPlanRequests, selectedRequestId],
  );

  const comparison = useMemo(() => {
    if (!selectedPlan) return null;
    const requestedFte = Number(requestForm.requestedFte) || 0;
    const averageRoleCost = selectedPlan.filledFte > 0 ? selectedPlan.payrollRunRateUsd / selectedPlan.filledFte : 0;

    if (requestForm.requestType === 'Add Headcount') {
      return {
        proposedApprovedFte: selectedPlan.approvedFte + requestedFte,
        proposedFilledFte: selectedPlan.filledFte + requestedFte,
        proposedGapFte: Math.max(selectedPlan.openDemandFte, 0),
        incrementalBudgetUsd: Math.round(averageRoleCost * requestedFte),
      };
    }

    if (requestForm.requestType === 'Backfill Gap') {
      return {
        proposedApprovedFte: selectedPlan.approvedFte,
        proposedFilledFte: Math.min(selectedPlan.approvedFte, selectedPlan.filledFte + requestedFte),
        proposedGapFte: Math.max(selectedPlan.openDemandFte - requestedFte, 0),
        incrementalBudgetUsd: Math.round(averageRoleCost * requestedFte),
      };
    }

    if (requestForm.requestType === 'Temporary Coverage') {
      return {
        proposedApprovedFte: selectedPlan.approvedFte,
        proposedFilledFte: Math.min(selectedPlan.approvedFte, selectedPlan.filledFte + requestedFte),
        proposedGapFte: Math.max(selectedPlan.openDemandFte - requestedFte, 0),
        incrementalBudgetUsd: Math.round(averageRoleCost * requestedFte * 0.6),
      };
    }

    return {
      proposedApprovedFte: selectedPlan.approvedFte,
      proposedFilledFte: selectedPlan.filledFte,
      proposedGapFte: selectedPlan.openDemandFte,
      incrementalBudgetUsd: 0,
    };
  }, [requestForm.requestType, requestForm.requestedFte, selectedPlan]);

  useEffect(() => {
    if (!selectedPlan && visiblePlans.length) setSelectedId(visiblePlans[0].id);
  }, [selectedPlan, visiblePlans]);

  useEffect(() => {
    setSubmitError(null);
  }, [selectedPlan?.id]);

  useEffect(() => {
    setRequestActionError(null);
    setSelectedRequestId((prev) => {
      if (!selectedPlanRequests.length) return null;
      if (prev && selectedPlanRequests.some((request) => request.id === prev)) return prev;
      return selectedPlanRequests[0].id;
    });
  }, [selectedPlanRequests]);

  const exportCsv = () => {
    if (!payload?.permissions.canExport) return;
    const rows = [
      ['Business Unit', 'Department', 'Location', 'Approved FTE', 'Filled FTE', 'Open Demand FTE', 'Vacancy Rate %', 'Critical Gap Roles', 'Immediate Backfills', 'Succession Coverage %', 'Attrition Risk %', 'Open Budget USD', 'Planning Priority', 'Health'],
      ...visiblePlans.map((plan) => [
        plan.businessUnit,
        plan.department,
        plan.location,
        String(plan.approvedFte),
        String(plan.filledFte),
        String(plan.openDemandFte),
        String(plan.vacancyRatePct),
        String(plan.criticalGapRoles),
        String(plan.immediateBackfills),
        String(plan.successionCoveragePct),
        String(plan.attritionRiskPct),
        String(plan.openBudgetUsd),
        plan.planningPriority,
        plan.healthStatus,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workforce-planning.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const submitRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/hris/organization/workforce-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          requestType: requestForm.requestType,
          requestedFte: Number(requestForm.requestedFte),
          targetQuarter: requestForm.targetQuarter,
          requestedBy: requestForm.requestedBy,
          justification: requestForm.justification,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to submit workforce request');

      setShowRequestForm(false);
      setRequestForm({
        requestType: 'Add Headcount',
        requestedFte: '1',
        targetQuarter: 'Q3 2026',
        requestedBy: 'HR Manager',
        justification: '',
      });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit workforce request');
    } finally {
      setSubmitting(false);
    }
  };

  const updateRequestStatus = async (requestId: string, status: WorkforcePlanningRequestRecord['status']) => {
    setUpdatingRequestId(requestId);
    setRequestActionError(null);

    try {
      const res = await fetch('/api/hris/organization/workforce-planning', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to update workforce request');
      await load();
      setSelectedRequestId(requestId);
    } catch (err) {
      setRequestActionError(err instanceof Error ? err.message : 'Unable to update workforce request');
    } finally {
      setUpdatingRequestId(null);
    }
  };

  return (
    <PageTemplate
      title="Workforce Planning"
      description="Plan approved capacity, vacancy exposure, succession depth, and workforce budget demand across business units and departments."
      breadcrumbs={[
        { label: 'HRIS', href: '/hris' },
        { label: 'Organization', href: '/hris/organization' },
        { label: 'Workforce Planning' },
      ]}
      primaryAction={{ label: showRequestForm ? 'Close Request' : 'Submit Request', onClick: () => setShowRequestForm((value) => !value), icon: Plus }}
      secondaryAction={{ label: 'Export CSV', onClick: exportCsv, icon: Download }}
    >
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Planning Action Mode</div>
          <div className="text-xs text-slate-500 mt-1">Submit workforce requests against the selected segment and compare the projected staffing impact before approval.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            Pending requests: <span className="font-semibold text-slate-700">{payload ? formatNumber(payload.summary.pendingRequests) : '—'}</span>
            {' '}<span className="mx-2">•</span>
            Requested FTE: <span className="font-semibold text-slate-700">{payload ? formatNumber(payload.summary.requestedFte) : '—'}</span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Reload Data
          </button>
        </div>
      </div>

      {showRequestForm ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Submit Workforce Request</div>
              <div className="text-xs text-slate-500 mt-1">Raise a staffing request against the selected workforce segment and preview the target capacity impact.</div>
            </div>
            <button
              type="button"
              onClick={() => setShowRequestForm(false)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>

          {selectedPlan ? (
            <form onSubmit={submitRequest} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <ReadOnlyField label="Business Unit" value={selectedPlan.businessUnit} />
                <ReadOnlyField label="Department" value={selectedPlan.department} />
                <ReadOnlyField label="Location" value={selectedPlan.location} />
                <SelectField
                  label="Request Type"
                  value={requestForm.requestType}
                  onChange={(value) => setRequestForm((prev) => ({ ...prev, requestType: value as WorkforcePlanningRequestRecord['requestType'] }))}
                  options={['Add Headcount', 'Backfill Gap', 'Temporary Coverage', 'Structure Review']}
                />
                <Field
                  label="Requested FTE"
                  type="number"
                  value={requestForm.requestedFte}
                  onChange={(value) => setRequestForm((prev) => ({ ...prev, requestedFte: value }))}
                />
                <Field label="Target Quarter" value={requestForm.targetQuarter} onChange={(value) => setRequestForm((prev) => ({ ...prev, targetQuarter: value }))} placeholder="Q3 2026" />
                <Field label="Requested By" value={requestForm.requestedBy} onChange={(value) => setRequestForm((prev) => ({ ...prev, requestedBy: value }))} placeholder="HR Manager" />
              </div>

              <TextAreaField
                label="Justification"
                value={requestForm.justification}
                onChange={(value) => setRequestForm((prev) => ({ ...prev, justification: value }))}
                placeholder="Explain the delivery risk, timing, and why this request should be approved."
              />

              {comparison ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Current vs Proposed</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <DetailStat label="Current Approved FTE" value={formatNumber(selectedPlan.approvedFte)} />
                    <DetailStat label="Proposed Approved FTE" value={formatNumber(comparison.proposedApprovedFte)} />
                    <DetailStat label="Projected Filled FTE" value={formatNumber(comparison.proposedFilledFte)} />
                    <DetailStat label="Projected Gap FTE" value={formatNumber(comparison.proposedGapFte)} />
                  </div>
                  <div className="mt-3 text-sm text-slate-600">
                    Incremental budget impact: <span className="font-semibold text-slate-900">{formatCurrency(comparison.incrementalBudgetUsd)}</span>
                  </div>
                </div>
              ) : null}

              {submitError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{submitError}</div> : null}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-dle-blue text-white rounded-lg text-sm font-medium hover:bg-dle-blue-deep transition-colors shadow-sm disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <span className="text-xs text-slate-500">The request is saved to the local planning queue and immediately reflected in the request tracker.</span>
              </div>
            </form>
          ) : (
            <div className="mt-4 text-sm text-slate-600">Select a workforce segment before submitting a request.</div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard icon={BriefcaseBusiness} label="Plan Segments" value={payload ? formatNumber(payload.summary.totalPlans) : '—'} detail="Department planning views" />
        <MetricCard icon={Users} label="Approved FTE" value={payload ? formatNumber(payload.summary.totalApprovedFte) : '—'} detail="Budgeted workforce capacity" />
        <MetricCard icon={Users} label="Filled FTE" value={payload ? formatNumber(payload.summary.totalFilledFte) : '—'} detail="Covered workforce capacity" />
        <MetricCard icon={ArrowUpRight} label="Open Demand" value={payload ? formatNumber(payload.summary.totalOpenDemandFte) : '—'} detail="Vacant or review FTE" />
        <MetricCard icon={AlertTriangle} label="Critical Gaps" value={payload ? formatNumber(payload.summary.criticalGapRoles) : '—'} detail="Unfilled critical roles" />
        <MetricCard icon={ShieldCheck} label="Succession" value={payload ? `${payload.summary.avgSuccessionCoverage}%` : '—'} detail="Average coverage readiness" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
        <label className="relative xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search segment, risk, role, or action..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
          />
        </label>
        <Select value={businessUnitFilter} onChange={(value) => setBusinessUnitFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.businessUnits || [])]} labels={{ All: 'All Business Units' }} />
        <Select value={locationFilter} onChange={(value) => setLocationFilter(value as 'All' | string)} options={['All', ...(payload?.filterOptions.locations || [])]} labels={{ All: 'All Locations' }} />
        <Select value={priorityFilter} onChange={(value) => setPriorityFilter(value as 'All' | WorkforcePlanRecord['planningPriority'])} options={['All', ...(payload?.filterOptions.planningPriorities || [])]} labels={{ All: 'All Priorities' }} />
        <Select value={healthFilter} onChange={(value) => setHealthFilter(value as 'All' | HealthStatus)} options={['All', ...(payload?.filterOptions.healthStatuses || [])]} labels={{ All: 'All Health States' }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-[220px_220px] gap-3">
          <Select
            value={sortBy}
            onChange={(value) => setSortBy(value as typeof sortBy)}
            options={['openDemandFte', 'vacancyRatePct', 'openBudgetUsd', 'successionCoveragePct']}
            labels={{
              openDemandFte: 'Sort: Open Demand',
              vacancyRatePct: 'Sort: Vacancy Rate',
              openBudgetUsd: 'Sort: Open Budget',
              successionCoveragePct: 'Sort: Succession Risk',
            }}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            Vacancy rate: <span className="font-semibold text-slate-700">{payload ? `${payload.summary.vacancyRatePct}%` : '—'}</span>
            {' '}<span className="mx-2">•</span>
            Open budget: <span className="font-semibold text-slate-700">{payload ? formatCurrency(payload.summary.openBudgetUsd) : '—'}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setBusinessUnitFilter('All');
              setLocationFilter('All');
              setPriorityFilter('All');
              setHealthFilter('All');
              setSortBy('openDemandFte');
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">Planning Explorer</div>
              <div className="text-xs text-slate-500 mt-1">Review workforce demand by department, including approved capacity, gaps, readiness, and planning posture.</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">Showing: {formatNumber(visiblePlans.length)}</span>
          </div>
          <div className="p-4 space-y-3 min-h-[520px]">
            {loading ? (
              <div className="text-sm text-slate-600 font-medium">Loading workforce planning...</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>
            ) : visiblePlans.length ? (
              visiblePlans.map((plan) => {
                const active = selectedPlan?.id === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedId(plan.id)}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors ${active ? 'border-dle-blue/30 bg-dle-blue/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{plan.department}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {plan.businessUnit} <span className="mx-2">•</span> {plan.location}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${priorityTone(plan.planningPriority)}`}>{plan.planningPriority}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600">
                      <span>Gap FTE: {formatNumber(plan.openDemandFte)}</span>
                      <span>Vacancy: {plan.vacancyRatePct}%</span>
                      <span>Critical Gaps: {formatNumber(plan.criticalGapRoles)}</span>
                      <span>Open Budget: {formatCurrency(plan.openBudgetUsd)}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-slate-600 font-medium">No workforce planning segments match the current filters.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Segment Detail</div>
              <div className="text-xs text-slate-500 mt-1">Inspect the selected workforce segment for capacity, budget demand, readiness exposure, and role-level planning actions.</div>
            </div>
            <div className="p-5">
              {selectedPlan ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${priorityTone(selectedPlan.planningPriority)}`}>{selectedPlan.planningPriority}</span>
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(selectedPlan.healthStatus)}`}>{selectedPlan.healthStatus}</span>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">{selectedPlan.location}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mt-3">{selectedPlan.department}</h3>
                    <p className="text-sm text-slate-500 mt-1">{selectedPlan.businessUnit}</p>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{selectedPlan.recommendedAction}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <DetailStat label="Approved Positions" value={formatNumber(selectedPlan.approvedPositions)} />
                    <DetailStat label="Approved FTE" value={formatNumber(selectedPlan.approvedFte)} />
                    <DetailStat label="Filled FTE" value={formatNumber(selectedPlan.filledFte)} />
                    <DetailStat label="Open Demand FTE" value={formatNumber(selectedPlan.openDemandFte)} />
                    <DetailStat label="Vacant FTE" value={formatNumber(selectedPlan.vacantFte)} />
                    <DetailStat label="Under Review FTE" value={formatNumber(selectedPlan.reviewFte)} />
                    <DetailStat label="Frozen FTE" value={formatNumber(selectedPlan.frozenFte)} />
                    <DetailStat label="Vacancy Rate" value={`${selectedPlan.vacancyRatePct}%`} />
                    <DetailStat label="Critical Gaps" value={formatNumber(selectedPlan.criticalGapRoles)} />
                    <DetailStat label="Immediate Backfills" value={formatNumber(selectedPlan.immediateBackfills)} />
                    <DetailStat label="Open Budget" value={formatCurrency(selectedPlan.openBudgetUsd)} />
                    <DetailStat label="Payroll Run Rate" value={formatCurrency(selectedPlan.payrollRunRateUsd)} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <ProgressCard label="Succession Coverage" value={selectedPlan.successionCoveragePct} tone="emerald" />
                    <ProgressCard label="Attrition Risk" value={selectedPlan.attritionRiskPct} tone="amber" />
                    <ProgressCard label="Approval Coverage" value={selectedPlan.approvalCoveragePct} tone="blue" />
                    <ProgressCard label="Standardization" value={selectedPlan.standardizationPct} tone="slate" />
                  </div>

                  {comparison ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">Live Plan Comparison</div>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <DetailStat label="Current Open Demand" value={formatNumber(selectedPlan.openDemandFte)} />
                        <DetailStat label="Projected Open Demand" value={formatNumber(comparison.proposedGapFte)} />
                        <DetailStat label="Current Approved FTE" value={formatNumber(selectedPlan.approvedFte)} />
                        <DetailStat label="Proposed Approved FTE" value={formatNumber(comparison.proposedApprovedFte)} />
                      </div>
                    </div>
                  ) : null}

                  <InfoListCard title="Top Risks" items={selectedPlan.topRisks.length ? selectedPlan.topRisks : ['No major planning risks flagged for this segment.']} />

                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-sm font-semibold text-slate-900">Role Demand</div>
                      <div className="text-xs text-slate-500 mt-1">Role-level view of staffing status, criticality, and cost exposure in the selected segment.</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {selectedPlan.roles.map((role) => (
                        <div key={role.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{role.title}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {role.code} <span className="mx-2">•</span> {role.gradeCode} <span className="mx-2">•</span> {role.positionType}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className={`px-2 py-1 rounded-full border font-semibold ${statusTone(role.positionStatus)}`}>{role.positionStatus}</span>
                            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">{role.criticality}</span>
                            <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">{role.replacementPriority}</span>
                            <span className="text-slate-600">{role.incumbentName || 'Unassigned'}</span>
                            <span className="text-slate-600">Open: {formatNumber(role.openDays)}d</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-sm font-semibold text-slate-900">Request Queue</div>
                      <div className="text-xs text-slate-500 mt-1">Submitted workforce requests linked to this planning segment.</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {selectedPlanRequests.length ? (
                        selectedPlanRequests.slice(0, 5).map((request) => (
                          <button
                            key={request.id}
                            type="button"
                            onClick={() => setSelectedRequestId(request.id)}
                            className={`w-full px-4 py-3 text-left flex flex-col gap-2 transition-colors ${selectedRequest?.id === request.id ? 'bg-dle-blue/5' : 'hover:bg-slate-50'}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-slate-900">{request.requestType}</div>
                              <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${requestStatusTone(request.status)}`}>{request.status}</span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {request.requestedBy} <span className="mx-2">•</span> {request.targetQuarter} <span className="mx-2">•</span> Requested FTE: {formatNumber(request.requestedFte)}
                            </div>
                            <div className="text-sm text-slate-600">{request.impactSummary}</div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-4 text-sm text-slate-600">No workforce requests have been submitted for this segment yet.</div>
                      )}
                    </div>
                  </div>

                  {selectedRequest ? (
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <div className="text-sm font-semibold text-slate-900">Request Review</div>
                        <div className="text-xs text-slate-500 mt-1">Review the selected request and move it through the approval flow.</div>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{selectedRequest.requestType}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {selectedRequest.requestedBy} <span className="mx-2">•</span> {selectedRequest.targetQuarter}
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${requestStatusTone(selectedRequest.status)}`}>{selectedRequest.status}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <DetailStat label="Requested FTE" value={formatNumber(selectedRequest.requestedFte)} />
                          <DetailStat label="Incremental Budget" value={formatCurrency(selectedRequest.incrementalBudgetUsd)} />
                          <DetailStat label="Projected Approved FTE" value={formatNumber(selectedRequest.projectedApprovedFte)} />
                          <DetailStat label="Projected Filled FTE" value={formatNumber(selectedRequest.projectedFilledFte)} />
                          <DetailStat label="Projected Gap FTE" value={formatNumber(selectedRequest.projectedGapFte)} />
                          <DetailStat label="Submitted On" value={new Date(selectedRequest.createdAt).toLocaleDateString('en-US')} />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{selectedRequest.justification}</div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="text-sm font-semibold text-slate-900">Approved Scenario Comparison</div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <DetailStat label="Current Approved FTE" value={formatNumber(selectedPlan.approvedFte)} />
                            <DetailStat label="Approved Scenario FTE" value={formatNumber(selectedRequest.projectedApprovedFte)} />
                            <DetailStat label="Current Open Demand" value={formatNumber(selectedPlan.openDemandFte)} />
                            <DetailStat label="Approved Scenario Gap" value={formatNumber(selectedRequest.projectedGapFte)} />
                          </div>
                        </div>

                        {requestActionError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{requestActionError}</div> : null}

                        <div className="flex items-center gap-2 flex-wrap">
                          {selectedRequest.status === 'Submitted' ? (
                            <button
                              type="button"
                              disabled={updatingRequestId === selectedRequest.id}
                              onClick={() => void updateRequestStatus(selectedRequest.id, 'Under Review')}
                              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Mark Under Review
                            </button>
                          ) : null}
                          {selectedRequest.status !== 'Approved' && selectedRequest.status !== 'Declined' ? (
                            <>
                              <button
                                type="button"
                                disabled={updatingRequestId === selectedRequest.id}
                                onClick={() => void updateRequestStatus(selectedRequest.id, 'Approved')}
                                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                              >
                                Approve Request
                              </button>
                              <button
                                type="button"
                                disabled={updatingRequestId === selectedRequest.id}
                                onClick={() => void updateRequestStatus(selectedRequest.id, 'Declined')}
                                className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60"
                              >
                                Decline Request
                              </button>
                            </>
                          ) : null}
                          {selectedRequest.status === 'Declined' ? (
                            <button
                              type="button"
                              disabled={updatingRequestId === selectedRequest.id}
                              onClick={() => void updateRequestStatus(selectedRequest.id, 'Under Review')}
                              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Reopen Review
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a workforce segment to inspect planning detail.</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Planning Insights</div>
              <div className="text-xs text-slate-500 mt-1">Priority observations for capacity gaps, succession weakness, and planning pressure.</div>
            </div>
            <div className="p-4 space-y-3">
              {(payload?.insights || []).map((insight) => (
                <div key={insight.id} className={`rounded-2xl border p-4 ${insightTone(insight.severity)}`}>
                  <div className="text-sm font-semibold text-slate-900">{insight.title}</div>
                  <div className="text-xs text-slate-600 mt-1">{insight.recommendation}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="text-sm font-bold text-slate-900">Recent Requests</div>
              <div className="text-xs text-slate-500 mt-1">Latest workforce requests submitted across all planning segments.</div>
            </div>
            <div className="p-4 space-y-3">
              {(payload?.requests || []).slice(0, 5).map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(request.planId);
                    setSelectedRequestId(request.id);
                  }}
                  className="w-full rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">{request.department}</div>
                    <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${requestStatusTone(request.status)}`}>{request.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {request.requestType} <span className="mx-2">•</span> {request.targetQuarter} <span className="mx-2">•</span> {request.businessUnit}
                  </div>
                  <div className="text-sm text-slate-600 mt-2">{request.impactSummary}</div>
                </button>
              ))}
              {payload && payload.requests.length === 0 ? <div className="text-sm text-slate-600">No workforce requests have been submitted yet.</div> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-bold text-slate-900">Planning Registry</div>
          <div className="text-xs text-slate-500 mt-1">Searchable table of workforce segments, approved capacity, gaps, readiness, and budget exposure.</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                {['Business Unit', 'Department', 'Location', 'Approved FTE', 'Filled FTE', 'Open Demand', 'Vacancy %', 'Critical Gaps', 'Open Budget', 'Priority', 'Health'].map((header) => (
                  <th key={header} className="px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiblePlans.map((plan) => (
                <tr key={plan.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(plan.id)}>
                  <td className="px-4 py-3 text-sm text-slate-700">{plan.businessUnit}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{plan.department}</div>
                    <div className="text-xs text-slate-500">{formatNumber(plan.approvedPositions)} positions</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{plan.location}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(plan.approvedFte)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(plan.filledFte)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(plan.openDemandFte)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{plan.vacancyRatePct}%</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatNumber(plan.criticalGapRoles)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{formatCurrency(plan.openBudgetUsd)}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${priorityTone(plan.planningPriority)}`}>{plan.planningPriority}</span></td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${healthTone(plan.healthStatus)}`}>{plan.healthStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageTemplate>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
          <div className="text-xs text-slate-500 mt-2">{detail}</div>
        </div>
        <span className="w-10 h-10 rounded-2xl bg-dle-blue/10 text-dle-blue flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </span>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function ProgressCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'blue' | 'slate';
}) {
  const styles = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'slate' ? 'bg-slate-500' : 'bg-blue-500';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-1">{value}%</div>
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${styles}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function InfoListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">{item}</span>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <div className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-slate-50">{value}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20 resize-y"
      />
    </label>
  );
}

function Select({ value, onChange, options, labels }: { value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-dle-blue/20"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] || option}
        </option>
      ))}
    </select>
  );
}
