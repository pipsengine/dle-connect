'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeading, Button, Card } from '@/components/projects-engineering/UI';

export default function NewProjectPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [department, setDepartment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/projects-engineering/access', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        const canCreate = Boolean(json?.data?.identity?.canCreateProjects);
        setAllowed(canCreate);
        setDepartment(String(json?.data?.identity?.department || ''));
        if (!canCreate) {
          setError('Only IT Department employees can create projects at this time.');
        }
      })
      .catch(() => {
        if (active) {
          setAllowed(false);
          setError('Unable to verify create-project authorization.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!allowed) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = {
      code: String(form.get('code') || ''),
      name: String(form.get('name') || ''),
      projectType: String(form.get('projectType') || 'EPC'),
      businessUnit: String(form.get('businessUnit') || ''),
      clientName: String(form.get('clientName') || ''),
      location: String(form.get('location') || ''),
      description: String(form.get('description') || ''),
      contractValue: Number(form.get('contractValue') || 0),
      currency: String(form.get('currency') || 'NGN'),
      plannedStart: String(form.get('plannedStart') || ''),
      plannedFinish: String(form.get('plannedFinish') || ''),
      projectManagerName: String(form.get('projectManagerName') || ''),
      projectManagerEmployeeCode: String(form.get('projectManagerEmployeeCode') || ''),
      projectManagerId: String(form.get('projectManagerEmployeeCode') || form.get('projectManagerName') || ''),
    };

    try {
      const res = await fetch('/api/projects-engineering/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Create failed');
      setMessage(`Created ${json.data.project.code}. Opening project workspace…`);
      router.push(`/projects-engineering/projects/${json.data.project.id}/overview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project');
    } finally {
      setSubmitting(false);
    }
  };

  if (allowed === false) {
    return (
      <>
        <PageHeading
          eyebrow="Projects / New Project"
          title="Create Project restricted"
          description="Project creation is limited to IT Department employees while the controlled rollout is in progress."
          actions={
            <Button variant="secondary" href="/projects-engineering">
              Back to dashboard
            </Button>
          }
        />
        <Card title="Access denied">
          <p style={{ margin: 0, color: '#6f7f95', fontSize: 12, lineHeight: 1.5 }}>
            {error || 'Your account is not authorized to create projects.'}
            {department ? ` Detected department: ${department}.` : ' No IT department was detected on your session.'}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Projects / New Project"
        title="Create Project"
        description="IT-controlled project registration. Assign a Project Manager employee code so that manager receives their own dashboard and project workspace."
        actions={
          <>
            <Button variant="secondary" href="/projects-engineering">
              Cancel
            </Button>
            <Button type="submit" form="pm-create-project" disabled={submitting || allowed !== true}>
              {submitting ? 'Saving…' : 'Save Draft Project'}
            </Button>
          </>
        }
      />

      {error ? <div className="audit-strip">⚠ {error}</div> : null}
      {message ? <div className="audit-strip">ⓘ {message}</div> : null}

      <div className="stepper">
        <span className="active">
          1 <b>Project Identity</b>
        </span>
        <span>
          2 <b>Commercial</b>
        </span>
        <span>
          3 <b>Schedule</b>
        </span>
        <span>
          4 <b>PM Assignment</b>
        </span>
        <span>
          5 <b>Review</b>
        </span>
      </div>

      <form id="pm-create-project" onSubmit={onSubmit}>
        <div className="form-layout">
          <div>
            <Card title="Project Identity" subtitle="Core master-data record">
              <div className="form-grid">
                <label className="field">
                  <span>
                    Project Code<b>*</b>
                  </span>
                  <input name="code" required placeholder="e.g. HDJK-002" />
                </label>
                <label className="field">
                  <span>
                    Project Name<b>*</b>
                  </span>
                  <input name="name" required placeholder="Enter official project name" />
                </label>
                <label className="field">
                  <span>Project Type*</span>
                  <select name="projectType" defaultValue="EPC">
                    <option value="EPC">EPC</option>
                    <option value="ENGINEERING">Engineering Services</option>
                    <option value="FABRICATION">Fabrication</option>
                    <option value="CONSTRUCTION">Construction</option>
                    <option value="MAINTENANCE">Maintenance</option>
                  </select>
                </label>
                <label className="field">
                  <span>Business Unit*</span>
                  <select name="businessUnit" defaultValue="Projects & Engineering">
                    <option>Projects & Engineering</option>
                    <option>Operations</option>
                  </select>
                </label>
                <label className="field">
                  <span>
                    Client<b>*</b>
                  </span>
                  <input name="clientName" required placeholder="Select or enter client" />
                </label>
                <label className="field">
                  <span>Project Location</span>
                  <input name="location" placeholder="City / site / region" />
                </label>
                <label className="field full">
                  <span>
                    Project Description<b>*</b>
                  </span>
                  <textarea name="description" required rows={4} placeholder="Scope summary, contract context and principal deliverables..." />
                </label>
              </div>
            </Card>

            <Card title="Commercial & Schedule">
              <div className="form-grid">
                <label className="field">
                  <span>Contract Value</span>
                  <input name="contractValue" type="number" min={0} step="0.01" defaultValue={0} />
                </label>
                <label className="field">
                  <span>Currency</span>
                  <select name="currency" defaultValue="NGN">
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
                  <input name="plannedStart" type="date" required />
                </label>
                <label className="field">
                  <span>
                    Planned Finish<b>*</b>
                  </span>
                  <input name="plannedFinish" type="date" required />
                </label>
              </div>
            </Card>

            <Card title="Project Manager Assignment" subtitle="This unlocks the manager’s personal dashboard">
              <div className="form-grid">
                <label className="field">
                  <span>
                    PM Employee Code<b>*</b>
                  </span>
                  <input name="projectManagerEmployeeCode" required placeholder="e.g. P0146" />
                </label>
                <label className="field">
                  <span>
                    Project Manager Name<b>*</b>
                  </span>
                  <input name="projectManagerName" required placeholder="Engr. Full Name" />
                </label>
              </div>
            </Card>
          </div>

          <aside>
            <Card title="IT controls">
              <div className="control-check">
                <b>Required before activation</b>
                <label>✓ Created by IT Department only</label>
                <label>✓ Project Manager employee code assigned</label>
                <label>✓ Server-side authorization enforced</label>
                <label>✓ Duplicate project codes blocked</label>
              </div>
            </Card>
            <Card title="Workflow">
              <div className="workflow-mini">
                <span className="done">1</span>
                <div>
                  <b>IT Creates Project</b>
                  <small>Projects & Engineering portal</small>
                </div>
                <span>2</span>
                <div>
                  <b>PM Dashboard Enabled</b>
                  <small>Matched by employee code</small>
                </div>
                <span>3</span>
                <div>
                  <b>Commercial Review</b>
                  <small>Finance / Commercial</small>
                </div>
                <span>4</span>
                <div>
                  <b>Activation</b>
                  <small>Status → Active</small>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </form>
    </>
  );
}
