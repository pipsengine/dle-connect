'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecruitmentPayload } from '@/lib/recruitment-shared';
import { AppShell, Badge, KPI, PageHeader, Pipeline, Tabs, statusTone } from '@/components/recruitment/AppShell';
import RecruitmentFormModal, { type RecruitmentFormKind } from '@/components/recruitment/RecruitmentFormModal';

type Col = { key: string; label: string };
type Row = Record<string, string | number | null | undefined>;

export type RecruitmentRegisterKey =
  | 'job-requisition'
  | 'job-posting'
  | 'candidate-database'
  | 'application-screening'
  | 'interview-scheduling'
  | 'interview-evaluation'
  | 'offer-management'
  | 'background-checks'
  | 'recruitment-approval'
  | 'talent-pool';

const registers: Record<RecruitmentRegisterKey, {
  title: string;
  subtitle: string;
  primary?: string;
  formKind: RecruitmentFormKind;
  editKind?: RecruitmentFormKind;
  columns: Col[];
  rowsOf: (payload: RecruitmentPayload) => Row[];
}> = {
  'job-requisition': {
    title: 'Job Requisition',
    subtitle: 'Create and control hiring requisitions linked to approved manpower demand, grade bands and hiring managers.',
    primary: 'New Requisition',
    formKind: 'requisition',
    columns: [
      { key: 'requisitionNo', label: 'Requisition' },
      { key: 'jobTitle', label: 'Position' },
      { key: 'department', label: 'Department' },
      { key: 'openings', label: 'Openings' },
      { key: 'hiringManager', label: 'Hiring Manager' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
    ],
    rowsOf: (p) => p.requisitions.map((r) => ({
      id: r.id,
      requisitionNo: r.requisitionNo,
      jobTitle: r.jobTitle,
      department: r.department,
      openings: r.openings,
      hiringManager: r.hiringManager,
      priority: r.priority,
      status: r.status,
    })),
  },
  'job-posting': {
    title: 'Job Posting',
    subtitle: 'Publish approved requisitions across internal and external channels with closing dates and applicant tracking.',
    primary: 'Create Job Posting',
    formKind: 'posting',
    columns: [
      { key: 'postingNo', label: 'Posting ID' },
      { key: 'jobTitle', label: 'Vacancy' },
      { key: 'channels', label: 'Channels' },
      { key: 'publishedAt', label: 'Published' },
      { key: 'closingDate', label: 'Closing Date' },
      { key: 'applicants', label: 'Applicants' },
      { key: 'views', label: 'Views' },
      { key: 'status', label: 'Status' },
    ],
    rowsOf: (p) => p.postings.map((r) => ({
      id: r.id,
      postingNo: r.postingNo,
      jobTitle: r.jobTitle,
      channels: r.channels,
      publishedAt: r.publishedAt?.slice(0, 10),
      closingDate: r.closingDate,
      applicants: r.applicants,
      views: r.views,
      status: r.status,
    })),
  },
  'candidate-database': {
    title: 'Candidate Database',
    subtitle: 'Central candidate register with consent, source tracking, experience and qualification controls.',
    primary: 'Add Candidate',
    formKind: 'candidate',
    columns: [
      { key: 'candidateNo', label: 'Candidate' },
      { key: 'name', label: 'Name' },
      { key: 'currentTitle', label: 'Role Interest' },
      { key: 'yearsExperience', label: 'Experience' },
      { key: 'highestQualification', label: 'Qualification' },
      { key: 'source', label: 'Source' },
      { key: 'status', label: 'Status' },
    ],
    rowsOf: (p) => p.candidates.map((c) => ({
      id: c.id,
      candidateNo: c.candidateNo,
      name: `${c.firstName} ${c.lastName}`,
      currentTitle: c.currentTitle,
      yearsExperience: c.yearsExperience,
      highestQualification: c.highestQualification,
      source: c.source,
      status: c.status,
    })),
  },
  'application-screening': {
    title: 'Application Screening',
    subtitle: 'Score applications against requisition criteria with recruiter decisions and explainable AI assistance.',
    primary: 'Start Screening',
    formKind: 'application',
    editKind: 'screening',
    columns: [
      { key: 'candidateName', label: 'Candidate' },
      { key: 'requisitionTitle', label: 'Vacancy' },
      { key: 'stage', label: 'Stage' },
      { key: 'screeningScore', label: 'Score' },
      { key: 'recruiterDecision', label: 'Decision' },
      { key: 'appliedAt', label: 'Applied' },
    ],
    rowsOf: (p) => p.applications.map((a) => ({
      id: a.id,
      candidateName: a.candidateName,
      requisitionTitle: a.requisitionTitle,
      stage: a.stage,
      screeningScore: a.screeningScore,
      recruiterDecision: a.recruiterDecision,
      appliedAt: a.appliedAt.slice(0, 10),
    })),
  },
  'interview-scheduling': {
    title: 'Interview Scheduling',
    subtitle: 'Schedule interview rounds, panels, venues and candidate confirmation across the hiring funnel.',
    primary: 'Schedule Interview',
    formKind: 'interview',
    columns: [
      { key: 'candidateName', label: 'Candidate' },
      { key: 'requisitionTitle', label: 'Vacancy' },
      { key: 'roundNo', label: 'Round' },
      { key: 'scheduledAt', label: 'Date / Time' },
      { key: 'mode', label: 'Mode' },
      { key: 'venueOrMeeting', label: 'Venue / Teams' },
      { key: 'status', label: 'Status' },
    ],
    rowsOf: (p) => p.interviews.map((i) => ({
      id: i.id,
      candidateName: i.candidateName,
      requisitionTitle: i.requisitionTitle,
      roundNo: i.roundNo,
      scheduledAt: i.scheduledAt?.replace('T', ' ').slice(0, 16),
      mode: i.mode,
      venueOrMeeting: i.venueOrMeeting,
      status: i.status,
    })),
  },
  'interview-evaluation': {
    title: 'Interview Evaluation',
    subtitle: 'Capture structured panel scores for technical, behavioural and values criteria with recommendations.',
    primary: 'New Evaluation',
    formKind: 'interview',
    columns: [
      { key: 'candidateName', label: 'Candidate' },
      { key: 'requisitionTitle', label: 'Vacancy' },
      { key: 'roundNo', label: 'Round' },
      { key: 'scheduledAt', label: 'Scheduled' },
      { key: 'status', label: 'Status' },
    ],
    rowsOf: (p) => p.interviews.map((i) => ({
      id: i.id,
      candidateName: i.candidateName,
      requisitionTitle: i.requisitionTitle,
      roundNo: i.roundNo,
      scheduledAt: i.scheduledAt?.replace('T', ' ').slice(0, 16),
      status: i.status,
    })),
  },
  'offer-management': {
    title: 'Offer Management',
    subtitle: 'Draft, approve and issue employment offers with salary-band controls and version history.',
    primary: 'Create Offer',
    formKind: 'offer',
    columns: [
      { key: 'candidateName', label: 'Candidate' },
      { key: 'positionTitle', label: 'Position' },
      { key: 'grade', label: 'Grade' },
      { key: 'totalPackage', label: 'Proposed Package' },
      { key: 'issuedAt', label: 'Issued' },
      { key: 'expiresAt', label: 'Expiry' },
      { key: 'status', label: 'Status' },
    ],
    rowsOf: (p) => p.offers.map((o) => ({
      id: o.id,
      candidateName: o.candidateName,
      positionTitle: o.positionTitle,
      grade: o.grade,
      totalPackage: o.totalPackage == null ? null : `${o.currency} ${o.totalPackage.toLocaleString()}`,
      issuedAt: o.issuedAt?.slice(0, 10),
      expiresAt: o.expiresAt?.slice(0, 10),
      status: o.status,
    })),
  },
  'background-checks': {
    title: 'Background Checks',
    subtitle: 'Authorize and track employment screening, risk ratings and exception/waiver outcomes.',
    primary: 'Start Check',
    formKind: 'background_check',
    columns: [
      { key: 'candidateName', label: 'Candidate' },
      { key: 'checkType', label: 'Check Type' },
      { key: 'provider', label: 'Provider / Owner' },
      { key: 'startedAt', label: 'Started' },
      { key: 'completedAt', label: 'Completed' },
      { key: 'riskRating', label: 'Risk' },
      { key: 'status', label: 'Status' },
    ],
    rowsOf: (p) => p.backgroundChecks.map((b) => ({
      id: b.id,
      candidateName: b.candidateName,
      checkType: b.checkType,
      provider: b.provider,
      startedAt: b.startedAt?.slice(0, 10),
      completedAt: b.completedAt?.slice(0, 10),
      riskRating: b.riskRating,
      status: b.status,
    })),
  },
  'recruitment-approval': {
    title: 'Recruitment Approval',
    subtitle: 'Immutable approval events across manpower, requisitions, offers and final hire authorization.',
    primary: 'New Manpower Request',
    formKind: 'manpower',
    columns: [
      { key: 'entityType', label: 'Type' },
      { key: 'entityId', label: 'Entity' },
      { key: 'stage', label: 'Stage' },
      { key: 'action', label: 'Action' },
      { key: 'actor', label: 'Actor' },
      { key: 'comment', label: 'Comment' },
      { key: 'actionAt', label: 'When' },
    ],
    rowsOf: (p) => p.approvalEvents.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      entityId: e.entityId,
      stage: e.stage,
      action: e.action,
      actor: e.actor,
      comment: e.comment,
      actionAt: e.actionAt.replace('T', ' ').slice(0, 16),
    })),
  },
  'talent-pool': {
    title: 'Talent Pool',
    subtitle: 'Maintain warm talent by skill, discipline, availability and talent score for future requisitions.',
    primary: 'Add to Talent Pool',
    formKind: 'talent_pool',
    columns: [
      { key: 'candidateName', label: 'Candidate' },
      { key: 'poolName', label: 'Pool' },
      { key: 'primarySkill', label: 'Primary Skill' },
      { key: 'availability', label: 'Availability' },
      { key: 'talentScore', label: 'Talent Score' },
      { key: 'addedAt', label: 'Added' },
    ],
    rowsOf: (p) => p.talentPool.map((t) => ({
      id: t.id,
      candidateName: t.candidateName,
      poolName: t.poolName,
      primarySkill: t.primarySkill,
      availability: t.availability,
      talentScore: t.talentScore,
      addedAt: t.addedAt.slice(0, 10),
    })),
  },
};

export default function EnterpriseRegisterClient({ register }: { register: RecruitmentRegisterKey }) {
  const config = registers[register];
  const [payload, setPayload] = useState<RecruitmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<RecruitmentFormKind>(config.formKind);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hris/recruitment', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load');
      setPayload(json.data as RecruitmentPayload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const all = payload ? config.rowsOf(payload) : [];
    if (!q) return all;
    const needle = q.toLowerCase();
    return all.filter((r) => Object.values(r).some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [payload, q, config]);

  const kpis = [
    { label: 'Records', value: rows.length, meta: 'Current register', tone: 'blue' },
    { label: 'DB', value: payload?.dbConnected ? 'On' : 'Off', meta: payload?.source || '—', tone: 'green' },
    { label: 'Pipeline', value: payload?.pipeline?.[0]?.count ?? 0, meta: 'Manpower stage', tone: 'purple' },
    { label: 'Candidates', value: payload?.kpis.activeCandidates ?? 0, meta: 'Active', tone: 'cyan' },
    { label: 'Offers', value: payload?.kpis.openOffers ?? 0, meta: 'Open', tone: 'amber' },
    { label: 'Checks', value: payload?.kpis.checksInProgress ?? 0, meta: 'In progress', tone: 'red' },
  ];

  const openCreate = () => {
    setEditId(null);
    setModalKind(config.formKind);
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    if (register === 'recruitment-approval') {
      openCreate();
      return;
    }
    if (config.editKind) {
      setEditId(id);
      setModalKind(config.editKind);
      setModalOpen(true);
      return;
    }
    openCreate();
  };

  return (
    <AppShell active={register}>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        primary={config.primary}
        onPrimary={config.primary ? openCreate : undefined}
        onRefresh={() => void load()}
      />
      {error ? <div className="card panel" style={{ color: '#c92735', marginBottom: 13 }}>{error}</div> : null}
      {message ? <div className="card panel" style={{ color: '#087a52', marginBottom: 13 }}>{message}</div> : null}
      <div className="grid kpiGrid">
        {kpis.map((k) => (
          <KPI key={k.label} label={k.label} value={k.value} meta={k.meta} tone={k.tone} />
        ))}
      </div>
      <div className="card panel" style={{ marginBottom: 13 }}>
        <div className="title">Recruitment Workflow Position</div>
        <div className="note">Connected to the complete recruitment lifecycle and approval matrix</div>
        <Pipeline stages={payload?.pipeline} />
      </div>
      <div className="card">
        <div className="toolbar">
          <div>
            <div className="title">{config.title} Register</div>
            <div className="note">Operational records with role-based actions, audit history and export — live MSSQL.</div>
          </div>
          <div className="filters">
            <input className="input" placeholder="Search records..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <Tabs items={['All', 'Active', 'Pending', 'Completed']} />
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>{config.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={String(r.id || i)}
                  style={{ cursor: config.editKind || register === 'recruitment-approval' ? 'pointer' : undefined }}
                  onClick={() => {
                    if (config.editKind || register === 'recruitment-approval') openEdit(String(r.id));
                  }}
                >
                  {config.columns.map((c) => {
                    const value = r[c.key];
                    const isStatus = /status|decision|stage|priority|budget|action/i.test(c.key);
                    return (
                      <td key={c.key}>
                        {isStatus && value != null && value !== '' ? (
                          <Badge tone={statusTone(String(value))}>{String(value)}</Badge>
                        ) : (value == null || value === '' ? '—' : String(value))}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={config.columns.length}>No records yet. Use the primary action to create one.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <RecruitmentFormModal
        open={modalOpen}
        kind={modalKind}
        editId={editId}
        payload={payload}
        onClose={() => setModalOpen(false)}
        onSaved={(next, msg) => {
          setPayload(next);
          setMessage(msg);
          setModalOpen(false);
        }}
      />
    </AppShell>
  );
}
