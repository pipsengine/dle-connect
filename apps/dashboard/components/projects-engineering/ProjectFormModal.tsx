'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/projects-engineering/UI';
import {
  EmployeeSearchSelect,
  LookupSearchSelect,
  type PmEmployeeOption,
} from '@/components/projects-engineering/ProjectFormPickers';
import {
  PROJECT_HEALTH_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type Project,
} from '@/lib/projects-engineering/types';

export type ProjectFormValues = {
  code: string;
  name: string;
  projectType: string;
  businessUnit: string;
  clientName: string;
  location: string;
  description: string;
  contractValue: number;
  currency: string;
  plannedStart: string;
  plannedFinish: string;
  projectManagerEmployeeCode: string;
  projectManagerEmployeeId: string;
  projectManagerUsername: string;
  projectManagerName: string;
  status: string;
  health: string;
  phase: string;
  plannedProgress: number;
  actualProgress: number;
  schedulePerformance: number;
  costPerformance: number;
};

const emptyForm = (): ProjectFormValues => ({
  code: '',
  name: '',
  projectType: 'EPC',
  businessUnit: 'Projects & Engineering',
  clientName: '',
  location: '',
  description: '',
  contractValue: 0,
  currency: 'NGN',
  plannedStart: '',
  plannedFinish: '',
  projectManagerEmployeeCode: '',
  projectManagerEmployeeId: '',
  projectManagerUsername: '',
  projectManagerName: '',
  status: 'Draft',
  health: 'Healthy',
  phase: 'Initiation',
  plannedProgress: 0,
  actualProgress: 0,
  schedulePerformance: 1,
  costPerformance: 1,
});

export const projectToFormValues = (project: Project): ProjectFormValues => ({
  code: project.code || '',
  name: project.name || '',
  projectType: project.projectType || 'ENGINEERING',
  businessUnit: project.businessUnit || 'Projects & Engineering',
  clientName: project.client || '',
  location: project.location || '',
  description: project.description || '',
  contractValue: Number(project.contractValue || 0),
  currency: project.currency || 'NGN',
  plannedStart: (project.start || '').slice(0, 10),
  plannedFinish: (project.finish || '').slice(0, 10),
  projectManagerEmployeeCode: project.managerEmployeeCode || '',
  projectManagerEmployeeId: project.managerEmployeeId || '',
  projectManagerUsername: project.managerUsername || '',
  projectManagerName: project.manager || '',
  status: project.status || 'Active',
  health: project.health || 'Healthy',
  phase: project.phase || 'Execution',
  plannedProgress: Number(project.planned || 0),
  actualProgress: Number(project.actual || 0),
  schedulePerformance: Number(project.schedulePerformance || 1),
  costPerformance: Number(project.costPerformance || 1),
});

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  project?: Project | null;
  onClose: () => void;
  onSaved: (project: Project) => void;
};

export function ProjectFormModal({ open, mode, project, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProjectFormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(mode === 'edit' && project ? projectToFormValues(project) : emptyForm());
  }, [open, mode, project]);

  const selectedEmployee = useMemo<PmEmployeeOption | null>(() => {
    if (!form.projectManagerName && !form.projectManagerEmployeeCode) return null;
    return {
      employeeCode: form.projectManagerEmployeeCode,
      employeeId: form.projectManagerEmployeeId,
      fullName: form.projectManagerName,
      username: form.projectManagerUsername,
    };
  }, [
    form.projectManagerEmployeeCode,
    form.projectManagerEmployeeId,
    form.projectManagerName,
    form.projectManagerUsername,
  ]);

  if (!open) return null;

  const setField = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onSelectEmployee = (employee: PmEmployeeOption | null) => {
    setForm((current) => ({
      ...current,
      projectManagerEmployeeCode: employee?.employeeCode || '',
      projectManagerEmployeeId: employee?.employeeId || employee?.employeeCode || '',
      projectManagerUsername: employee?.username || '',
      projectManagerName: employee?.fullName || '',
    }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.projectManagerName.trim()) {
      setError('Select a Project Manager from the employee directory.');
      return;
    }
    if (!form.location.trim()) {
      setError('Select or enter a Location / Site.');
      return;
    }
    if (!form.clientName.trim()) {
      setError('Select or enter a Client.');
      return;
    }

    setSubmitting(true);
    setError('');
    const payload = {
      ...form,
      projectManagerId: form.projectManagerEmployeeId || form.projectManagerEmployeeCode,
      projectManagerEmployeeCode: form.projectManagerEmployeeCode,
      projectManagerName: form.projectManagerName,
      projectManagerUsername: form.projectManagerUsername || undefined,
      clientName: form.clientName,
      location: form.location,
    };

    try {
      const res = await fetch(
        mode === 'edit' && project
          ? `/api/projects-engineering/projects/${encodeURIComponent(project.id)}`
          : '/api/projects-engineering/projects',
        {
          method: mode === 'edit' ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Save failed');
      onSaved(json.data.project as Project);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pm-modal-root" role="dialog" aria-modal="true" aria-label={mode === 'edit' ? 'Edit project' : 'Create project'}>
      <button type="button" className="pm-modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="pm-modal-panel">
        <header className="pm-modal-head">
          <div>
            <div className="eyebrow">{mode === 'edit' ? 'Edit Project' : 'Create Project'}</div>
            <h2>{mode === 'edit' ? project?.name || 'Update project' : 'Register a project'}</h2>
            <p>Writes to DLE_Enterprise — enterprise registry and project management profile.</p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>

        {error ? <div className="audit-strip">⚠ {error}</div> : null}

        <form className="pm-modal-body" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>
                Project Code<b>*</b>
              </span>
              <input
                required
                value={form.code}
                onChange={(e) => setField('code', e.target.value.toUpperCase())}
                placeholder="e.g. DL26001"
                disabled={mode === 'edit'}
              />
            </label>
            <label className="field">
              <span>
                Project Name<b>*</b>
              </span>
              <input required value={form.name} onChange={(e) => setField('name', e.target.value)} />
            </label>
            <label className="field">
              <span>Project Type*</span>
              <select value={form.projectType} onChange={(e) => setField('projectType', e.target.value)}>
                <option value="EPC">EPC</option>
                <option value="ENGINEERING">Engineering Services</option>
                <option value="FABRICATION">Fabrication</option>
                <option value="CONSTRUCTION">Construction</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </label>
            <label className="field">
              <span>Business Unit*</span>
              <select value={form.businessUnit} onChange={(e) => setField('businessUnit', e.target.value)}>
                <option>Projects & Engineering</option>
                <option>Operations</option>
              </select>
            </label>
            <label className="field">
              <span>
                Client<b>*</b>
              </span>
              <LookupSearchSelect
                section="clients"
                value={form.clientName}
                required
                placeholder="Search existing clients or type new…"
                onChange={(value) => setField('clientName', value)}
              />
            </label>
            <label className="field">
              <span>
                Location / Site<b>*</b>
              </span>
              <LookupSearchSelect
                section="locations"
                value={form.location}
                required
                placeholder="Search sites/locations…"
                onChange={(value) => setField('location', value)}
              />
            </label>
            <label className="field">
              <span>Status*</span>
              <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
                {PROJECT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Health*</span>
              <select value={form.health} onChange={(e) => setField('health', e.target.value)}>
                {PROJECT_HEALTH_OPTIONS.map((health) => (
                  <option key={health} value={health}>
                    {health}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Phase</span>
              <input value={form.phase} onChange={(e) => setField('phase', e.target.value)} />
            </label>
            <label className="field">
              <span>Contract Value</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.contractValue}
                onChange={(e) => setField('contractValue', Number(e.target.value || 0))}
              />
            </label>
            <label className="field">
              <span>Currency</span>
              <select value={form.currency} onChange={(e) => setField('currency', e.target.value)}>
                <option>NGN</option>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </label>
            <label className="field">
              <span>
                Planned Start<b>*</b>
              </span>
              <input
                type="date"
                required
                value={form.plannedStart}
                onChange={(e) => setField('plannedStart', e.target.value)}
              />
            </label>
            <label className="field">
              <span>
                Planned Finish<b>*</b>
              </span>
              <input
                type="date"
                required
                value={form.plannedFinish}
                onChange={(e) => setField('plannedFinish', e.target.value)}
              />
            </label>
            <label className="field full">
              <span>
                Project Manager<b>*</b>
              </span>
              <EmployeeSearchSelect value={selectedEmployee} required onSelect={onSelectEmployee} />
              <small className="field-hint">Search and select from the live HRIS employee directory in DLE_Enterprise.</small>
            </label>
            <label className="field">
              <span>PM Employee Code</span>
              <input value={form.projectManagerEmployeeCode} readOnly placeholder="Filled from employee selection" />
            </label>
            <label className="field">
              <span>Project Manager Name</span>
              <input value={form.projectManagerName} readOnly placeholder="Filled from employee selection" />
            </label>
            <label className="field">
              <span>Planned Progress %</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={form.plannedProgress}
                onChange={(e) => setField('plannedProgress', Number(e.target.value || 0))}
              />
            </label>
            <label className="field">
              <span>Actual Progress %</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={form.actualProgress}
                onChange={(e) => setField('actualProgress', Number(e.target.value || 0))}
              />
            </label>
            <label className="field">
              <span>SPI</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.schedulePerformance}
                onChange={(e) => setField('schedulePerformance', Number(e.target.value || 0))}
              />
            </label>
            <label className="field">
              <span>CPI</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.costPerformance}
                onChange={(e) => setField('costPerformance', Number(e.target.value || 0))}
              />
            </label>
            <label className="field full">
              <span>
                Description<b>*</b>
              </span>
              <textarea
                required
                rows={4}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Scope summary, contract context and principal deliverables..."
              />
            </label>
          </div>

          <footer className="pm-modal-foot">
            <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Project'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
