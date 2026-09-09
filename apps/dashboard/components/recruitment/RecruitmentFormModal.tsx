'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ManpowerRequestRecord, RecruitmentEmployeeOption, RecruitmentLookups, RecruitmentPayload } from '@/lib/recruitment-shared';

export type RecruitmentFormKind =
  | 'manpower'
  | 'requisition'
  | 'posting'
  | 'candidate'
  | 'application'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'background_check'
  | 'talent_pool';

export const formKindForRegister = (register: string): RecruitmentFormKind => {
  const map: Record<string, RecruitmentFormKind> = {
    'job-requisition': 'requisition',
    'job-posting': 'posting',
    'candidate-database': 'candidate',
    'application-screening': 'application',
    'interview-scheduling': 'interview',
    'interview-evaluation': 'interview',
    'offer-management': 'offer',
    'background-checks': 'background_check',
    'recruitment-approval': 'manpower',
    'talent-pool': 'talent_pool',
    'manpower-request': 'manpower',
  };
  return map[register] || 'manpower';
};

type Props = {
  open: boolean;
  kind: RecruitmentFormKind;
  editId?: string | null;
  payload: RecruitmentPayload | null;
  onClose: () => void;
  onSaved: (payload: RecruitmentPayload, message: string) => void;
};

const emptyLookups = (): RecruitmentLookups => ({
  departments: [],
  locations: [],
  costCentres: [],
  projects: [],
  jobTitles: [],
  grades: [],
  employmentTypes: ['Permanent', 'Contract', 'Lumpsum', 'NYSC', 'IT', 'Intern'],
});

function ModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modalPanel" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="note">{subtitle}</div> : null}
          </div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="modalBody">{children}</div>
        <div className="modalFoot">{footer}</div>
      </div>
    </div>
  );
}

function DbSelect({
  label,
  value,
  onChange,
  options,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}{required ? ' *' : ''}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">{placeholder || `Select ${label.toLowerCase()}`}</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function EmployeePicker({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (name: string, employee?: RecruitmentEmployeeOption) => void;
  required?: boolean;
}) {
  const [q, setQ] = useState(value);
  const [hits, setHits] = useState<RecruitmentEmployeeOption[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value); }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hris/recruitment?section=employees&q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        const json = await res.json();
        if (res.ok && json?.status === 'success') setHits(json.data.employees || []);
      } catch {
        setHits([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="field picker" ref={boxRef}>
      <label>{label}{required ? ' *' : ''}</label>
      <input
        className="input"
        value={q}
        placeholder="Search employee name or code…"
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && hits.length ? (
        <div className="pickerList">
          {hits.map((h) => (
            <div
              key={`${h.employeeCode}-${h.employeeId}`}
              className="pickerItem"
              onClick={() => {
                onChange(h.employeeName, h);
                setQ(h.employeeName);
                setOpen(false);
              }}
            >
              <div className="strong">{h.employeeName}</div>
              <div className="subtext">{h.employeeCode} · {h.department} · {h.jobTitle}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function RecruitmentFormModal({ open, kind, editId, payload, onClose, onSaved }: Props) {
  const [lookups, setLookups] = useState<RecruitmentLookups>(emptyLookups());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | number | boolean>>({});

  const set = (key: string, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch('/api/hris/recruitment?section=lookups', { cache: 'no-store' });
        const json = await res.json();
        if (res.ok && json?.status === 'success') setLookups(json.data as RecruitmentLookups);
      } catch {
        /* keep defaults */
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (kind === 'manpower') {
      const existing = (payload?.manpowerRequests || []).find((m) => m.id === editId) as ManpowerRequestRecord | undefined;
      setForm(existing ? {
        department: existing.department,
        positionTitle: existing.positionTitle,
        employmentType: existing.employmentType,
        headcount: existing.headcount,
        needDate: existing.needDate || '',
        requestType: existing.requestType,
        priority: existing.priority,
        workLocation: existing.workLocation || '',
        grade: existing.grade || '',
        project: existing.project || '',
        costCentre: existing.costCentre || '',
        budgeted: existing.budgeted,
        estimatedAnnualCost: existing.estimatedAnnualCost ?? '',
        replacementEmployee: existing.replacementEmployee || '',
        businessJustification: existing.businessJustification || '',
        budgetStatus: existing.budgetStatus,
        workflowStatus: existing.workflowStatus,
      } : {
        department: '',
        positionTitle: '',
        employmentType: 'Permanent',
        headcount: 1,
        needDate: '',
        requestType: 'New Position',
        priority: 'Medium',
        workLocation: '',
        grade: '',
        project: '',
        costCentre: '',
        budgeted: true,
        estimatedAnnualCost: '',
        replacementEmployee: '',
        businessJustification: '',
        budgetStatus: 'Pending',
        workflowStatus: 'Draft',
      });
      return;
    }
    if (kind === 'requisition') {
      setForm({
        jobTitle: '',
        department: '',
        openings: 1,
        hiringManager: '',
        priority: 'Medium',
        manpowerRequestId: '',
        jobDescription: '',
        requirements: '',
      });
      return;
    }
    if (kind === 'posting') {
      setForm({ requisitionId: '', jobTitle: '', channels: 'Career Portal', closingDate: '', status: 'Draft' });
      return;
    }
    if (kind === 'candidate') {
      setForm({ firstName: '', lastName: '', email: '', phone: '', currentTitle: '', yearsExperience: '', highestQualification: '', source: 'Careers Portal' });
      return;
    }
    if (kind === 'application' || kind === 'screening') {
      const existing = (payload?.applications || []).find((a) => a.id === editId);
      setForm(existing ? {
        id: existing.id,
        candidateId: existing.candidateId,
        requisitionId: existing.requisitionId,
        stage: existing.stage || 'Screening',
        screeningScore: existing.screeningScore ?? '',
        recruiterDecision: existing.recruiterDecision || '',
      } : {
        candidateId: '',
        requisitionId: '',
        stage: 'Applied',
        screeningScore: '',
        recruiterDecision: '',
        id: editId || '',
      });
      return;
    }
    if (kind === 'interview') {
      setForm({ applicationId: '', roundNo: 1, scheduledAt: '', mode: 'Teams', venueOrMeeting: '', status: 'Scheduled' });
      return;
    }
    if (kind === 'offer') {
      setForm({ applicationId: '', grade: '', currency: 'NGN', basePay: '', totalPackage: '', status: 'Draft', expiresAt: '' });
      return;
    }
    if (kind === 'background_check') {
      setForm({ applicationId: '', checkType: 'Employment Verification', provider: '', status: 'Not Started', notes: '' });
      return;
    }
    if (kind === 'talent_pool') {
      setForm({ candidateId: '', poolName: 'General Talent', primarySkill: '', availability: 'Available', talentScore: '' });
    }
  }, [open, kind, editId, payload]);

  const post = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/recruitment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...form, ...extra }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Save failed');
      onSaved(json.data.payload as RecruitmentPayload, json.data.message || 'Saved');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [form, onClose, onSaved]);

  const titles: Record<RecruitmentFormKind, string> = {
    manpower: editId ? 'Edit Manpower Request' : 'New Manpower Request',
    requisition: 'New Job Requisition',
    posting: 'New Job Posting',
    candidate: 'Add Candidate',
    application: 'Record Application / Screening',
    screening: 'Update Screening',
    interview: 'Schedule Interview',
    offer: 'Create Offer',
    background_check: 'Start Background Check',
    talent_pool: 'Add to Talent Pool',
  };

  const approvedManpower = (payload?.manpowerRequests || []).filter((m) => m.workflowStatus === 'Approved');
  const applications = payload?.applications || [];
  const candidates = payload?.candidates || [];
  const requisitions = payload?.requisitions || [];

  return (
    <ModalShell
      open={open}
      title={titles[kind]}
      subtitle="Directory fields load from employees, departments and locations in MSSQL. Saves write to [hris] recruitment tables."
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          {kind === 'manpower' && !editId ? (
            <>
              <button type="button" className="btn" disabled={saving} onClick={() => void post('create_manpower', { workflowStatus: 'Draft' })}>Save Draft</button>
              <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_manpower', { workflowStatus: 'Submitted' })}>Submit</button>
            </>
          ) : null}
          {kind === 'manpower' && editId ? (
            <>
              <button type="button" className="btn" disabled={saving} onClick={() => void post('update_manpower', { id: editId })}>Save Changes</button>
              <button type="button" className="btn amber" disabled={saving} onClick={() => void post('submit_manpower', { id: editId })}>Submit</button>
              <button type="button" className="btn green" disabled={saving} onClick={() => void post('approve_manpower', { id: editId })}>Approve</button>
            </>
          ) : null}
          {kind === 'requisition' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_requisition')}>Save Requisition</button> : null}
          {kind === 'posting' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_posting')}>Save Posting</button> : null}
          {kind === 'candidate' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_candidate')}>Save Candidate</button> : null}
          {kind === 'application' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_application')}>Save Application</button> : null}
          {kind === 'screening' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('update_screening', { id: editId || form.id })}>Update Screening</button> : null}
          {kind === 'interview' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_interview')}>Schedule</button> : null}
          {kind === 'offer' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_offer')}>Save Offer</button> : null}
          {kind === 'background_check' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_background_check')}>Start Check</button> : null}
          {kind === 'talent_pool' ? <button type="button" className="btn primary" disabled={saving} onClick={() => void post('create_talent_pool')}>Add to Pool</button> : null}
        </>
      )}
    >
      {error ? <div className="formSection" style={{ color: '#c92735' }}>{error}</div> : null}

      {kind === 'manpower' ? (
        <>
          <div className="formSection">
            <h3>Request Details</h3>
            <div className="formGrid">
              <DbSelect label="Department" required value={String(form.department || '')} onChange={(v) => set('department', v)} options={lookups.departments} />
              <DbSelect label="Request Type" value={String(form.requestType || '')} onChange={(v) => set('requestType', v)} options={['New Position', 'Replacement', 'Project Mobilization', 'Critical Vacancy', 'Succession']} />
              <DbSelect label="Employment Type" required value={String(form.employmentType || '')} onChange={(v) => set('employmentType', v)} options={lookups.employmentTypes} />
              <div className="field"><label>Need Date *</label><input className="input" type="date" value={String(form.needDate || '')} onChange={(e) => set('needDate', e.target.value)} /></div>
              <DbSelect label="Priority" value={String(form.priority || '')} onChange={(v) => set('priority', v)} options={['Low', 'Medium', 'High', 'Critical']} />
              <DbSelect label="Budget Status" value={String(form.budgetStatus || '')} onChange={(v) => set('budgetStatus', v)} options={['Pending', 'Approved', 'Cleared', 'Blocked', 'Not Required']} />
            </div>
          </div>
          <div className="formSection">
            <h3>Position & Location</h3>
            <div className="formGrid">
              <div className="field"><label>Position Title *</label>
                <input className="input" list="rec-job-titles" value={String(form.positionTitle || '')} onChange={(e) => set('positionTitle', e.target.value)} />
                <datalist id="rec-job-titles">{lookups.jobTitles.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
              <div className="field"><label>Headcount *</label><input className="input" type="number" min={1} value={Number(form.headcount || 1)} onChange={(e) => set('headcount', Number(e.target.value) || 1)} /></div>
              <DbSelect label="Grade" value={String(form.grade || '')} onChange={(v) => set('grade', v)} options={lookups.grades} placeholder="Select grade" />
              <DbSelect label="Work Location" required value={String(form.workLocation || '')} onChange={(v) => set('workLocation', v)} options={lookups.locations} />
              <EmployeePicker label="Replacement Employee" value={String(form.replacementEmployee || '')} onChange={(name) => set('replacementEmployee', name)} />
            </div>
          </div>
          <div className="formSection">
            <h3>Project & Budget</h3>
            <div className="formGrid">
              <DbSelect label="Project" value={String(form.project || '')} onChange={(v) => set('project', v)} options={lookups.projects} placeholder="Select project" />
              <DbSelect label="Cost Centre" value={String(form.costCentre || '')} onChange={(v) => set('costCentre', v)} options={lookups.costCentres} placeholder="Select cost centre" />
              <DbSelect label="Budgeted?" value={form.budgeted ? 'Yes' : 'No'} onChange={(v) => set('budgeted', v === 'Yes')} options={['Yes', 'No']} />
              <div className="field"><label>Estimated Annual Cost</label><input className="input" value={String(form.estimatedAnnualCost ?? '')} onChange={(e) => set('estimatedAnnualCost', e.target.value)} /></div>
              <div className="field full"><label>Business Justification</label><textarea className="textarea" value={String(form.businessJustification || '')} onChange={(e) => set('businessJustification', e.target.value)} /></div>
            </div>
          </div>
        </>
      ) : null}

      {kind === 'requisition' ? (
        <div className="formSection">
          <h3>Requisition</h3>
          <div className="formGrid">
            <div className="field"><label>Linked Approved Manpower</label>
              <select className="select" value={String(form.manpowerRequestId || '')} onChange={(e) => {
                const m = approvedManpower.find((x) => x.id === e.target.value);
                set('manpowerRequestId', e.target.value);
                if (m) {
                  set('jobTitle', m.positionTitle);
                  set('department', m.department);
                }
              }}>
                <option value="">Optional</option>
                {approvedManpower.map((m) => <option key={m.id} value={m.id}>{m.requestNo} · {m.positionTitle}</option>)}
              </select>
            </div>
            <div className="field"><label>Job Title *</label><input className="input" list="rec-job-titles" value={String(form.jobTitle || '')} onChange={(e) => set('jobTitle', e.target.value)} /></div>
            <DbSelect label="Department" required value={String(form.department || '')} onChange={(v) => set('department', v)} options={lookups.departments} />
            <div className="field"><label>Openings *</label><input className="input" type="number" min={1} value={Number(form.openings || 1)} onChange={(e) => set('openings', Number(e.target.value) || 1)} /></div>
            <EmployeePicker label="Hiring Manager" value={String(form.hiringManager || '')} onChange={(name) => set('hiringManager', name)} />
            <DbSelect label="Priority" value={String(form.priority || '')} onChange={(v) => set('priority', v)} options={['Low', 'Medium', 'High', 'Critical']} />
            <div className="field full"><label>Job Description</label><textarea className="textarea" value={String(form.jobDescription || '')} onChange={(e) => set('jobDescription', e.target.value)} /></div>
            <div className="field full"><label>Requirements</label><textarea className="textarea" value={String(form.requirements || '')} onChange={(e) => set('requirements', e.target.value)} /></div>
          </div>
        </div>
      ) : null}

      {kind === 'posting' ? (
        <div className="formSection">
          <h3>Posting</h3>
          <div className="formGrid">
            <div className="field"><label>Requisition *</label>
              <select className="select" value={String(form.requisitionId || '')} onChange={(e) => {
                const r = requisitions.find((x) => x.id === e.target.value);
                set('requisitionId', e.target.value);
                if (r) set('jobTitle', r.jobTitle);
              }}>
                <option value="">Select requisition</option>
                {requisitions.map((r) => <option key={r.id} value={r.id}>{r.requisitionNo} · {r.jobTitle}</option>)}
              </select>
            </div>
            <div className="field"><label>Job Title *</label><input className="input" value={String(form.jobTitle || '')} onChange={(e) => set('jobTitle', e.target.value)} /></div>
            <div className="field"><label>Channels *</label><input className="input" value={String(form.channels || '')} onChange={(e) => set('channels', e.target.value)} /></div>
            <div className="field"><label>Closing Date</label><input className="input" type="date" value={String(form.closingDate || '')} onChange={(e) => set('closingDate', e.target.value)} /></div>
            <DbSelect label="Status" value={String(form.status || '')} onChange={(v) => set('status', v)} options={['Draft', 'Live', 'Closed']} />
          </div>
        </div>
      ) : null}

      {kind === 'candidate' ? (
        <div className="formSection">
          <h3>Candidate</h3>
          <div className="formGrid">
            <div className="field"><label>First Name *</label><input className="input" value={String(form.firstName || '')} onChange={(e) => set('firstName', e.target.value)} /></div>
            <div className="field"><label>Last Name *</label><input className="input" value={String(form.lastName || '')} onChange={(e) => set('lastName', e.target.value)} /></div>
            <div className="field"><label>Email</label><input className="input" value={String(form.email || '')} onChange={(e) => set('email', e.target.value)} /></div>
            <div className="field"><label>Phone</label><input className="input" value={String(form.phone || '')} onChange={(e) => set('phone', e.target.value)} /></div>
            <div className="field"><label>Current / Target Title</label><input className="input" list="rec-job-titles" value={String(form.currentTitle || '')} onChange={(e) => set('currentTitle', e.target.value)} /></div>
            <div className="field"><label>Years Experience</label><input className="input" type="number" step="0.1" value={String(form.yearsExperience ?? '')} onChange={(e) => set('yearsExperience', e.target.value)} /></div>
            <div className="field"><label>Highest Qualification</label><input className="input" value={String(form.highestQualification || '')} onChange={(e) => set('highestQualification', e.target.value)} /></div>
            <DbSelect label="Source" value={String(form.source || '')} onChange={(v) => set('source', v)} options={['Careers Portal', 'LinkedIn', 'Referral', 'Job Board', 'Talent Pool', 'Agency']} />
          </div>
          <datalist id="rec-job-titles">{lookups.jobTitles.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      ) : null}

      {(kind === 'application' || kind === 'screening') ? (
        <div className="formSection">
          <h3>{kind === 'screening' ? 'Screening' : 'Application'}</h3>
          <div className="formGrid">
            {kind === 'application' ? (
              <>
                <div className="field"><label>Candidate *</label>
                  <select className="select" value={String(form.candidateId || '')} onChange={(e) => set('candidateId', e.target.value)}>
                    <option value="">Select candidate</option>
                    {candidates.map((c) => <option key={c.id} value={c.id}>{c.candidateNo} · {c.firstName} {c.lastName}</option>)}
                  </select>
                </div>
                <div className="field"><label>Requisition *</label>
                  <select className="select" value={String(form.requisitionId || '')} onChange={(e) => set('requisitionId', e.target.value)}>
                    <option value="">Select requisition</option>
                    {requisitions.map((r) => <option key={r.id} value={r.id}>{r.requisitionNo} · {r.jobTitle}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div className="field"><label>Application *</label>
                <select className="select" value={String(form.id || '')} onChange={(e) => set('id', e.target.value)}>
                  <option value="">Select application</option>
                  {applications.map((a) => <option key={a.id} value={a.id}>{a.candidateName} · {a.requisitionTitle}</option>)}
                </select>
              </div>
            )}
            <DbSelect label="Stage" value={String(form.stage || '')} onChange={(v) => set('stage', v)} options={['Applied', 'Screening', 'Shortlisted', 'Assessment', 'Interview', 'Rejected']} />
            <div className="field"><label>Screening Score</label><input className="input" type="number" value={String(form.screeningScore ?? '')} onChange={(e) => set('screeningScore', e.target.value)} /></div>
            <DbSelect label="Decision" value={String(form.recruiterDecision || '')} onChange={(v) => set('recruiterDecision', v)} options={['', 'Qualified', 'Shortlisted', 'Hold', 'Rejected']} />
          </div>
        </div>
      ) : null}

      {kind === 'interview' ? (
        <div className="formSection">
          <h3>Interview</h3>
          <div className="formGrid">
            <div className="field"><label>Application *</label>
              <select className="select" value={String(form.applicationId || '')} onChange={(e) => set('applicationId', e.target.value)}>
                <option value="">Select application</option>
                {applications.map((a) => <option key={a.id} value={a.id}>{a.candidateName} · {a.requisitionTitle}</option>)}
              </select>
            </div>
            <div className="field"><label>Round</label><input className="input" type="number" min={1} value={Number(form.roundNo || 1)} onChange={(e) => set('roundNo', Number(e.target.value) || 1)} /></div>
            <div className="field"><label>Scheduled At</label><input className="input" type="datetime-local" value={String(form.scheduledAt || '')} onChange={(e) => set('scheduledAt', e.target.value)} /></div>
            <DbSelect label="Mode" value={String(form.mode || '')} onChange={(v) => set('mode', v)} options={['Teams', 'In Person', 'Phone']} />
            <DbSelect label="Venue / Location" value={String(form.venueOrMeeting || '')} onChange={(v) => set('venueOrMeeting', v)} options={lookups.locations} placeholder="Select location or type Teams link below" />
            <div className="field full"><label>Venue / Meeting Link</label><input className="input" value={String(form.venueOrMeeting || '')} onChange={(e) => set('venueOrMeeting', e.target.value)} /></div>
          </div>
        </div>
      ) : null}

      {kind === 'offer' ? (
        <div className="formSection">
          <h3>Offer</h3>
          <div className="formGrid">
            <div className="field"><label>Application *</label>
              <select className="select" value={String(form.applicationId || '')} onChange={(e) => set('applicationId', e.target.value)}>
                <option value="">Select application</option>
                {applications.map((a) => <option key={a.id} value={a.id}>{a.candidateName} · {a.requisitionTitle}</option>)}
              </select>
            </div>
            <DbSelect label="Grade" value={String(form.grade || '')} onChange={(v) => set('grade', v)} options={lookups.grades} />
            <div className="field"><label>Basic Pay</label><input className="input" value={String(form.basePay ?? '')} onChange={(e) => set('basePay', e.target.value)} /></div>
            <div className="field"><label>Total Package</label><input className="input" value={String(form.totalPackage ?? '')} onChange={(e) => set('totalPackage', e.target.value)} /></div>
            <div className="field"><label>Expires</label><input className="input" type="date" value={String(form.expiresAt || '')} onChange={(e) => set('expiresAt', e.target.value)} /></div>
          </div>
        </div>
      ) : null}

      {kind === 'background_check' ? (
        <div className="formSection">
          <h3>Background Check</h3>
          <div className="formGrid">
            <div className="field"><label>Application *</label>
              <select className="select" value={String(form.applicationId || '')} onChange={(e) => set('applicationId', e.target.value)}>
                <option value="">Select application</option>
                {applications.map((a) => <option key={a.id} value={a.id}>{a.candidateName} · {a.requisitionTitle}</option>)}
              </select>
            </div>
            <DbSelect label="Check Type" required value={String(form.checkType || '')} onChange={(v) => set('checkType', v)} options={['Employment Verification', 'Education', 'Criminal', 'Reference', 'Credit']} />
            <div className="field"><label>Provider</label><input className="input" value={String(form.provider || '')} onChange={(e) => set('provider', e.target.value)} /></div>
            <div className="field full"><label>Notes</label><textarea className="textarea" value={String(form.notes || '')} onChange={(e) => set('notes', e.target.value)} /></div>
          </div>
        </div>
      ) : null}

      {kind === 'talent_pool' ? (
        <div className="formSection">
          <h3>Talent Pool</h3>
          <div className="formGrid">
            <div className="field"><label>Candidate *</label>
              <select className="select" value={String(form.candidateId || '')} onChange={(e) => set('candidateId', e.target.value)}>
                <option value="">Select candidate</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.candidateNo} · {c.firstName} {c.lastName}</option>)}
              </select>
            </div>
            <div className="field"><label>Pool Name *</label><input className="input" value={String(form.poolName || '')} onChange={(e) => set('poolName', e.target.value)} /></div>
            <div className="field"><label>Primary Skill</label><input className="input" value={String(form.primarySkill || '')} onChange={(e) => set('primarySkill', e.target.value)} /></div>
            <DbSelect label="Availability" value={String(form.availability || '')} onChange={(v) => set('availability', v)} options={['Available', 'Passive', 'Not Available']} />
            <div className="field"><label>Talent Score</label><input className="input" type="number" value={String(form.talentScore ?? '')} onChange={(e) => set('talentScore', e.target.value)} /></div>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}
