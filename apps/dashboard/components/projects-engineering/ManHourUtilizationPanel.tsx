'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button, Card, DataTable, KpiCard, MiniBar, Progress, Status, Toolbar } from '@/components/projects-engineering/UI';
import type { ProjectManHourUtilization, UtilizationGate } from '@/lib/projects-engineering/man-hour-types';
import type { Project } from '@/lib/projects-engineering/types';

type Props = {
  project: Project;
  mode?: 'resources' | 'labour' | 'forecast';
  canEditBudget?: boolean;
};

const gateLabels: Record<UtilizationGate, string> = {
  all: 'All non-rejected',
  pmApproved: 'PM approved+',
  costValidated: 'Cost validated+',
  payrollReady: 'Payroll ready',
};

export function ManHourUtilizationPanel({ project, mode = 'resources', canEditBudget = false }: Props) {
  const [gate, setGate] = useState<UtilizationGate>('pmApproved');
  const [data, setData] = useState<ProjectManHourUtilization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [etcInput, setEtcInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/projects-engineering/projects/${encodeURIComponent(project.id)}/utilization?gate=${gate}`,
        { cache: 'no-store', credentials: 'same-origin' },
      );
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to load utilization');
      const utilization = json.data.utilization as ProjectManHourUtilization;
      setData(utilization);
      setBudgetInput(String(utilization.summary.budgetedHours || 0));
      setEtcInput(String(utilization.summary.etcHours || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load man-hour utilization');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [project.id, gate]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const onSaveBudget = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEditBudget) return;
    setSavingBudget(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(`/api/projects-engineering/projects/${encodeURIComponent(project.id)}/utilization`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          budgetedHours: Number(budgetInput || 0),
          etcHours: Number(etcInput || 0),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Save failed');
      setData(json.data.utilization);
      setMessage('Man-hour budget / ETC saved to DLE_Enterprise.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save budget');
    } finally {
      setSavingBudget(false);
    }
  };

  const summary = data?.summary;
  const maxWeek = Math.max(1, ...(data?.byWeek.map((w) => w.hours) || [1]));

  return (
    <>
      {error ? <div className="audit-strip">⚠ {error}</div> : null}
      {message ? <div className="audit-strip">ⓘ {message}</div> : null}
      {loading && !data ? <div className="audit-strip">Loading live man-hour utilization…</div> : null}

      <div className="kpi-grid six">
        <KpiCard label="Productive MH" value={String(summary?.productiveHours ?? 0)} delta={`${summary?.employeeCount || 0} people`} />
        <KpiCard label="PM Approved+" value={String(summary?.pmApprovedHours ?? 0)} delta={gateLabels.pmApproved} tone="indigo" />
        <KpiCard label="Cost Validated+" value={String(summary?.costValidatedHours ?? 0)} delta={gateLabels.costValidated} tone="cyan" />
        <KpiCard label="Budgeted MH" value={String(summary?.budgetedHours ?? 0)} delta={`${summary?.consumedPct || 0}% consumed`} tone="purple" />
        <KpiCard label="Remaining / ETC" value={String(summary?.etcHours ?? 0)} delta={`EAC ${summary?.eacHours ?? 0} MH`} tone="amber" />
        <KpiCard label="Utilization" value={`${summary?.utilizationPct ?? 0}%`} delta={`${summary?.dayCount || 0} work days`} tone="rose" />
      </div>

      <Card
        title={mode === 'labour' ? 'Labour Validation Gate' : mode === 'forecast' ? 'Man-Hour Forecast Position' : 'Man-Hour Utilization'}
        subtitle={`Live from HRIS timesheet allocations · project ${project.code} · refresh 30s`}
        action={
          <div className="toolbar">
            <select className="select" value={gate} onChange={(e) => setGate(e.target.value as UtilizationGate)}>
              <option value="all">All (excl. rejected)</option>
              <option value="pmApproved">PM approved+</option>
              <option value="costValidated">Cost validated+</option>
              <option value="payrollReady">Payroll ready</option>
            </select>
            <Toolbar placeholder="Hours by gate…" />
          </div>
        }
      >
        <div className="grid two">
          <div>
            <MiniBar label="PM approved hours" value={summary ? Math.min(100, (summary.pmApprovedHours / Math.max(summary.totalHours, 1)) * 100) : 0} />
            <MiniBar label="Cost validated hours" value={summary ? Math.min(100, (summary.costValidatedHours / Math.max(summary.totalHours, 1)) * 100) : 0} />
            <MiniBar label="Payroll-ready hours" value={summary ? Math.min(100, (summary.payrollReadyHours / Math.max(summary.totalHours, 1)) * 100) : 0} />
            <MiniBar label="Budget consumed" value={Math.min(100, summary?.consumedPct || 0)} />
          </div>
          <div>
            <div style={{ marginBottom: 10 }}>
              <small style={{ color: '#8492a5', fontSize: 10 }}>Progress vs man-hour budget</small>
              <Progress value={Math.min(100, summary?.consumedPct || 0)} />
            </div>
            {(data?.byWeek || []).slice(-6).map((week) => (
              <MiniBar key={week.weekEnding} label={`W/E ${week.weekEnding}`} value={(week.hours / maxWeek) * 100} />
            ))}
            {!data?.byWeek.length ? <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>No weekly burn data for this gate yet.</p> : null}
          </div>
        </div>
      </Card>

      {(mode === 'resources' || mode === 'forecast') && canEditBudget ? (
        <Card title="Phase 3/4 — Budgeted & ETC Man-Hours" subtitle="Plan vs actual and remaining forecast hours">
          <form className="form-grid" onSubmit={onSaveBudget}>
            <label className="field">
              <span>Budgeted Man-Hours</span>
              <input type="number" min={0} step="0.1" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
            </label>
            <label className="field">
              <span>ETC Man-Hours (remaining)</span>
              <input type="number" min={0} step="0.1" value={etcInput} onChange={(e) => setEtcInput(e.target.value)} />
            </label>
            <div className="field full">
              <Button type="submit" disabled={savingBudget}>
                {savingBudget ? 'Saving…' : 'Save MH Budget / ETC'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {mode === 'labour' ? (
        <Card title="Phase 2 — Cost Controller Labour Queue" subtitle="PM-approved timesheet lines awaiting cost validation">
          {!data?.labourQueue.length ? (
            <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>
              No pending labour lines for {project.code}. Queue fills when timesheets reach Project Manager review.
            </p>
          ) : (
            <DataTable
              headers={['Date', 'Employee', 'Task', 'Hours', 'Header Status', 'Cost Check']}
              rows={data.labourQueue.map((row) => [
                row.workDate,
                `${row.employeeNo} · ${row.employeeName}`,
                row.taskName,
                row.hours,
                <Status key={`${row.lineId}-h`}>{row.headerStatus}</Status>,
                <Status key={`${row.lineId}-c`}>{row.costValidationStatus}</Status>,
              ])}
            />
          )}
          <div className="page-actions" style={{ marginTop: 12 }}>
            <Button variant="secondary" href="/hris/time-and-logs/timesheet-entry">
              Open Timesheet Capture
            </Button>
            <Button href={`/projects-engineering/projects/${project.id}/cost-control/labour-timesheets`}>
              Refresh Labour Workspace
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid two">
        <Card title="By Employee" subtitle="Productive hours in selected gate">
          {!data?.byEmployee.length ? (
            <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>No employee hours for this project/gate.</p>
          ) : (
            <DataTable
              headers={['Employee', 'Days', 'Hours']}
              rows={data.byEmployee.slice(0, 25).map((row) => [
                `${row.employeeNo} · ${row.employeeName}`,
                row.days,
                row.hours,
              ])}
            />
          )}
        </Card>
        <Card title="Man-Hour Register" subtitle="Allocation lines from DLE_Enterprise timesheets">
          {!data?.register.length ? (
            <p style={{ margin: 0, color: '#6f7f95', fontSize: 12 }}>No register rows for this gate.</p>
          ) : (
            <DataTable
              headers={['Date', 'Employee', 'Task', 'Hours', 'Status']}
              rows={data.register.slice(0, 30).map((row) => [
                row.workDate,
                row.employeeName,
                row.taskName,
                row.hours,
                <Status key={`${row.lineId}-s`}>{row.headerStatus}</Status>,
              ])}
            />
          )}
        </Card>
      </div>
    </>
  );
}
