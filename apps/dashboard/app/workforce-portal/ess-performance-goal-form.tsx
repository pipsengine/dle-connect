'use client';

import { useMemo, useState } from 'react';
import { Loader2, Save, Send } from 'lucide-react';
import type { EssPerformanceWorkspace } from '@/lib/ess-performance-workspace';
import { EssCard } from './ess-portal-ui';

type EssPerformanceGoalFormProps = {
  workspace: EssPerformanceWorkspace;
  selectedEmployeeId: string;
  onSelectEmployee: (employeeId: string) => void;
  saving?: boolean;
  onAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
};

const GOAL_TYPES = ['Annual', 'Project', 'Developmental', 'Operational', 'Strategic'];
const PRIORITIES = ['High', 'Medium', 'Low'];

export function EssPerformanceGoalForm({
  workspace,
  selectedEmployeeId,
  onSelectEmployee,
  saving,
  onAction,
}: EssPerformanceGoalFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Annual');
  const [priority, setPriority] = useState('Medium');
  const [weight, setWeight] = useState('25');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(workspace.activeCycle?.endDate || '');
  const [parentObjectiveId, setParentObjectiveId] = useState('');
  const [kpiTitle, setKpiTitle] = useState('');
  const [baseline, setBaseline] = useState('0');
  const [target, setTarget] = useState('100');
  const [unit, setUnit] = useState('%');
  const [evidenceRequired, setEvidenceRequired] = useState(true);
  const [clientError, setClientError] = useState('');
  const [asDraft, setAsDraft] = useState(false);

  const employeeGoals = useMemo(
    () => workspace.team.goals.filter((goal) => goal.employeeId === selectedEmployeeId),
    [workspace.team.goals, selectedEmployeeId],
  );
  const existingWeight = employeeGoals.reduce((sum, goal) => sum + Number(goal.weight || 0), 0);
  const nextWeight = Number(weight || 0);
  const projectedTotal = existingWeight + (Number.isFinite(nextWeight) ? nextWeight : 0);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setType('Annual');
    setPriority('Medium');
    setWeight('25');
    setKpiTitle('');
    setBaseline('0');
    setTarget('100');
    setUnit('%');
    setParentObjectiveId('');
    setEvidenceRequired(true);
    setClientError('');
  };

  const validate = () => {
    if (!selectedEmployeeId) return 'Select a direct report.';
    if (!title.trim()) return 'Goal title is required.';
    if (!description.trim()) return 'Goal description is required.';
    if (!kpiTitle.trim()) return 'KPI / success measure is required.';
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0 || w > 100) return 'Weight must be between 1 and 100.';
    if (projectedTotal > 100.01) {
      return `Employee goal weights would total ${projectedTotal.toFixed(1)}% (max 100%). Current assigned: ${existingWeight}%.`;
    }
    if (!startDate || !dueDate) return 'Start and due dates are required.';
    if (dueDate < startDate) return 'Due date must be on or after the start date.';
    const b = Number(baseline);
    const t = Number(target);
    if (!Number.isFinite(b) || !Number.isFinite(t)) return 'Baseline and target must be numbers.';
    return null;
  };

  const submit = async (draft: boolean) => {
    setAsDraft(draft);
    const error = validate();
    if (error) {
      setClientError(error);
      return;
    }
    const employee = workspace.team.directReports.find((row) => row.employeeId === selectedEmployeeId);
    if (!employee) return;
    const objective = workspace.companyObjectives.find((row) => row.id === parentObjectiveId);
    await onAction('goal.upsert', {
      cycleId: workspace.activeCycle?.id,
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department,
      title: title.trim(),
      description: description.trim(),
      type,
      priority,
      weight: Number(weight),
      startDate,
      dueDate,
      parentObjectiveId: parentObjectiveId || undefined,
      strategicPillar: objective?.strategicPillar || undefined,
      evidenceRequired,
      statusHint: draft ? 'Draft' : 'Assigned',
      keyResults: [{
        title: kpiTitle.trim(),
        baseline: Number(baseline),
        target: Number(target),
        unit: unit.trim() || '%',
        weight: 100,
      }],
    });
    resetForm();
  };

  return (
    <EssCard className="p-5">
      <h3 className="text-sm font-bold text-[#0F172A]">Assign team goal</h3>
      <p className="mt-1 text-xs text-[#64748B]">
        Capture category, KPI, weighting, dates, and company objective alignment. Employee goal weights must not exceed 100%.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Employee</label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => onSelectEmployee(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold"
          >
            <option value="">Select direct report</option>
            {workspace.team.directReports.map((row) => (
              <option key={row.employeeId} value={row.employeeId}>{row.fullName} · {row.employeeCode}</option>
            ))}
          </select>
          {selectedEmployeeId ? (
            <p className="mt-1 text-xs font-medium text-[#64748B]">
              Current weight assigned: {existingWeight}% · After save: {projectedTotal}%
            </p>
          ) : null}
        </div>

        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Goal title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Category / type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
            {GOAL_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
            {PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Outcome, scope, and success context" />
        </div>

        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Company / department objective alignment</label>
          <select value={parentObjectiveId} onChange={(e) => setParentObjectiveId(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold">
            <option value="">None / not linked</option>
            {workspace.companyObjectives.map((row) => (
              <option key={row.id} value={row.id}>{row.code ? `${row.code} · ` : ''}{row.title}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">KPI / success measure</label>
          <input value={kpiTitle} onChange={(e) => setKpiTitle(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" placeholder="e.g. Reduce P1 incidents" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Baseline</label>
          <input value={baseline} onChange={(e) => setBaseline(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Target</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Unit of measure</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Weight %</label>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm font-semibold" />
        </div>

        <label className="md:col-span-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-[#475569]">
          <input type="checkbox" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} className="h-4 w-4" />
          Evidence required for acknowledgement / review
        </label>
      </div>

      {clientError ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{clientError}</div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
        >
          {saving && asDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save draft
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit(false)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-sm font-bold text-white hover:bg-[#1D4ED8] disabled:opacity-60"
        >
          {saving && !asDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Assign &amp; notify employee
        </button>
      </div>

      {employeeGoals.length ? (
        <div className="mt-4 space-y-2 border-t border-[#E2E8F0] pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Goals for selected employee</p>
          {employeeGoals.map((goal) => (
            <div key={goal.id} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-xs">
              <p className="font-semibold text-[#0F172A]">{goal.title}</p>
              <p className="text-[#64748B]">{goal.status} · weight {goal.weight}% · due {goal.dueDate}</p>
            </div>
          ))}
        </div>
      ) : null}
    </EssCard>
  );
}
