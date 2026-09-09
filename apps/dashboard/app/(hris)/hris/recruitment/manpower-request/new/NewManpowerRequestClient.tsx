'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { recruitmentRoutes } from '@/lib/recruitment-shared';
import { AppShell, PageHeader, Tabs } from '@/components/recruitment/AppShell';

const blank = {
  department: '',
  positionTitle: '',
  employmentType: 'Permanent',
  headcount: 1,
  needDate: '',
  requestType: 'New Position',
  priority: 'High',
  workLocation: '',
  grade: '',
  project: '',
  costCentre: '',
  budgeted: true,
  estimatedAnnualCost: '',
  replacementEmployee: '',
  businessJustification: '',
  budgetStatus: 'Pending',
};

export default function NewManpowerRequestClient() {
  const router = useRouter();
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (workflowStatus: 'Draft' | 'Submitted') => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/recruitment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create_manpower',
          ...form,
          estimatedAnnualCost: form.estimatedAnnualCost === '' ? null : Number(String(form.estimatedAnnualCost).replace(/[^\d.]/g, '')),
          workflowStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Save failed');
      const id = json.data?.payload?.manpowerRequests?.[0]?.id;
      router.push(id ? `${recruitmentRoutes.manpower}/${id}` : recruitmentRoutes.manpower);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell active="manpower-request">
      <PageHeader
        title="New Manpower Request"
        subtitle="Create a controlled workforce request. Required fields and approvals vary by employment type, department, project and budget."
        primary="Save Draft"
        onPrimary={() => void save('Draft')}
      />
      {error ? <div className="card panel" style={{ color: '#c92735', marginBottom: 13 }}>{error}</div> : null}
      <div className="card">
        <Tabs items={['1 Request Details', '2 Position & Headcount', '3 Project / Cost Centre', '4 Budget', '5 Justification', '6 Approval & Review']} />
        <div className="formSection">
          <h3>Request Details</h3>
          <div className="help">Basic workforce demand and requester information.</div>
          <div className="formGrid">
            <div className="field"><label>Requesting Department *</label><input className="input" value={form.department} onChange={(e) => set('department', e.target.value)} /></div>
            <div className="field"><label>Request Type *</label>
              <select className="select" value={form.requestType} onChange={(e) => set('requestType', e.target.value)}>
                <option>New Position</option><option>Replacement</option><option>Project Mobilization</option><option>Critical Vacancy</option><option>Succession</option>
              </select>
            </div>
            <div className="field"><label>Employment Type *</label>
              <select className="select" value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
                <option>Permanent</option><option>Contract</option><option>Lumpsum</option><option>NYSC</option><option>IT</option>
              </select>
            </div>
            <div className="field"><label>Required Date *</label><input className="input" type="date" value={form.needDate} onChange={(e) => set('needDate', e.target.value)} /></div>
            <div className="field"><label>Priority *</label>
              <select className="select" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
              </select>
            </div>
            <div className="field"><label>Budget Status</label>
              <select className="select" value={form.budgetStatus} onChange={(e) => set('budgetStatus', e.target.value)}>
                <option>Pending</option><option>Approved</option><option>Cleared</option><option>Blocked</option><option>Not Required</option>
              </select>
            </div>
          </div>
        </div>
        <div className="formSection">
          <h3>Position & Headcount</h3>
          <div className="help">Define the exact workforce requirement and replacement link where applicable.</div>
          <div className="formGrid">
            <div className="field"><label>Position Title *</label><input className="input" value={form.positionTitle} onChange={(e) => set('positionTitle', e.target.value)} /></div>
            <div className="field"><label>Headcount *</label><input className="input" type="number" min={1} value={form.headcount} onChange={(e) => set('headcount', Number(e.target.value) || 1)} /></div>
            <div className="field"><label>Grade / Level</label><input className="input" value={form.grade} onChange={(e) => set('grade', e.target.value)} /></div>
            <div className="field"><label>Work Location *</label><input className="input" value={form.workLocation} onChange={(e) => set('workLocation', e.target.value)} /></div>
            <div className="field full"><label>Replacement Employee (if replacement)</label><input className="input" placeholder="Search employee code or name..." value={form.replacementEmployee} onChange={(e) => set('replacementEmployee', e.target.value)} /></div>
          </div>
        </div>
        <div className="formSection">
          <h3>Project, Cost Centre & Budget</h3>
          <div className="formGrid">
            <div className="field"><label>Project</label><input className="input" value={form.project} onChange={(e) => set('project', e.target.value)} /></div>
            <div className="field"><label>Cost Centre *</label><input className="input" value={form.costCentre} onChange={(e) => set('costCentre', e.target.value)} /></div>
            <div className="field"><label>Budgeted Position?</label>
              <select className="select" value={form.budgeted ? 'Yes' : 'No'} onChange={(e) => set('budgeted', e.target.value === 'Yes')}>
                <option>Yes</option><option>No</option>
              </select>
            </div>
            <div className="field"><label>Estimated Annual Cost</label><input className="input" value={form.estimatedAnnualCost} onChange={(e) => set('estimatedAnnualCost', e.target.value)} placeholder="18600000" /></div>
          </div>
        </div>
        <div className="formSection">
          <h3>Business Justification</h3>
          <textarea className="textarea" value={form.businessJustification} onChange={(e) => set('businessJustification', e.target.value)} />
        </div>
        <div className="formSection">
          <h3>Approval Route Preview</h3>
          <div className="detailGrid">
            {[['1', 'Department Manager'], ['2', 'HR Manager'], ['3', 'Finance / Budget'], ['4', 'MD/CEO']].map((x) => (
              <div className="detail" key={x[0]}><label>Stage {x[0]}</label><strong>{x[1]}</strong></div>
            ))}
          </div>
        </div>
        <div className="stickyFooter">
          <button type="button" className="btn" onClick={() => router.push(recruitmentRoutes.manpower)}>Cancel</button>
          <button type="button" className="btn" disabled={saving} onClick={() => void save('Draft')}>Save Draft</button>
          <button type="button" className="btn primary" disabled={saving} onClick={() => void save('Submitted')}>Submit for Approval →</button>
        </div>
      </div>
    </AppShell>
  );
}
