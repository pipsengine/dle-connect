'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { RecruitmentPayload } from '@/lib/recruitment-shared';
import { recruitmentRoutes } from '@/lib/recruitment-shared';
import { AppShell, Badge, KPI, PageHeader, Pipeline, statusTone } from '@/components/recruitment/AppShell';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';

export default function RecruitmentDashboardClient() {
  const [payload, setPayload] = useState<RecruitmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/hris/recruitment', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load');
      setPayload(json.data as RecruitmentPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const k = payload?.kpis;
  const deptBars = (() => {
    const map = new Map<string, number>();
    (payload?.requisitions || []).forEach((r) => map.set(r.department, (map.get(r.department) || 0) + r.openings));
    const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = Math.max(1, ...rows.map(([, n]) => n));
    return rows.map(([name, n]) => [name, Math.round((n / max) * 100)] as [string, number]);
  })();

  return (
    <AppShell active="recruitment-dashboard">
      <PageHeader
        title="Recruitment Dashboard"
        subtitle="Executive recruitment command centre — workforce demand, requisitions, candidates, interviews, offers, approvals and hiring performance."
        primary="New Manpower Request"
        onPrimary={() => setModalOpen(true)}
        onRefresh={() => void load()}
      />
      {error ? <div className="card panel" style={{ color: '#c92735', marginBottom: 13 }}>{error}</div> : null}
      {message ? <div className="card panel" style={{ color: '#087a52', marginBottom: 13 }}>{message}</div> : null}
      {!payload?.dbConnected ? (
        <div className="card panel" style={{ marginBottom: 13 }}>Database offline — configure DLE_Enterprise for live MSSQL read/write.</div>
      ) : null}

      <div className="grid kpiGrid">
        <KPI label="Open Requisitions" value={k?.openRequisitions ?? 0} meta={`${k?.approvedManpower ?? 0} approved manpower`} tone="blue" />
        <KPI label="Total Applicants" value={k?.totalApplicants ?? 0} meta="Across applications / postings" tone="green" />
        <KPI label="Shortlisted" value={k?.shortlisted ?? 0} meta="Screening / interview pipeline" tone="purple" />
        <KPI label="Interviews" value={k?.interviewsScheduled ?? 0} meta="Scheduled / confirmed" tone="amber" />
        <KPI label="Offers Pending" value={k?.openOffers ?? 0} meta="Open offer records" tone="cyan" />
        <KPI label="Avg Time-to-Hire" value={k?.avgTimeToHireDays != null ? `${k.avgTimeToHireDays}d` : '—'} meta="Target ≤ 30 days" tone="green" />
      </div>

      <div className="card panel" style={{ marginBottom: 13 }}>
        <div className="title">Recruitment Lifecycle</div>
        <div className="note">Live position across the complete manpower-to-hire workflow.</div>
        <Pipeline stages={payload?.pipeline} />
      </div>

      <div className="grid two" style={{ marginBottom: 13 }}>
        <div className="card">
          <div className="toolbar">
            <div>
              <div className="title">Priority Requisitions</div>
              <div className="note">Open roles requiring management attention.</div>
            </div>
            <Link className="btn" href={recruitmentRoutes.requisition}>View all →</Link>
          </div>
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr><th>Requisition</th><th>Openings</th><th>Priority</th><th>Stage</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(payload?.requisitions || []).slice(0, 5).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="strong">{r.jobTitle}</div>
                      <div className="subtext">{r.requisitionNo} · {r.department}</div>
                    </td>
                    <td>{r.openings}</td>
                    <td>{r.priority}</td>
                    <td><Badge>{r.status}</Badge></td>
                    <td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  </tr>
                ))}
                {!payload?.requisitions.length ? <tr><td colSpan={5}>No requisitions yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card panel">
          <h3>Hiring Demand by Department</h3>
          {(deptBars.length ? deptBars : [['—', 0] as [string, number]]).map((x) => (
            <div className="barrow" key={x[0]}>
              <span>{x[0]}</span>
              <div className="bar"><span style={{ width: `${x[1]}%` }} /></div>
              <b>{x[1]}%</b>
            </div>
          ))}
          <h3 style={{ marginTop: 18 }}>Executive Attention</h3>
          {[
            `${k?.pendingAction ?? 0} manpower requests awaiting action`,
            `${k?.interviewsScheduled ?? 0} interviews scheduled`,
            `${k?.openOffers ?? 0} open offers`,
            `${k?.checksInProgress ?? 0} background checks in progress`,
          ].map((x, i) => (
            <div className="activity" key={x}>
              <div className="ico">{i + 1}</div>
              <div><b>{x}</b><div className="subtext">Derived from [hris] recruitment tables.</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid three" style={{ marginBottom: 13 }}>
        <div className="card panel">
          <h3>Recruitment Funnel</h3>
          {[
            ['Applicants', k?.totalApplicants ?? 0],
            ['Screening', k?.applicationsInScreening ?? 0],
            ['Shortlisted', k?.shortlisted ?? 0],
            ['Interviewed', k?.interviewsScheduled ?? 0],
            ['Offers', k?.openOffers ?? 0],
            ['Approved manpower', k?.approvedManpower ?? 0],
          ].map((x) => (
            <div className="metricLine" key={String(x[0])}><span>{x[0]}</span><b>{x[1]}</b></div>
          ))}
        </div>
        <div className="card panel">
          <h3>Pipeline Counts</h3>
          <div className="chart">
            {(payload?.pipeline || []).map((p) => (
              <div className="col" key={p.stage}>
                <i style={{ height: `${Math.max(6, p.count * 8)}px` }} />
                {p.stage.slice(0, 4)}
              </div>
            ))}
          </div>
        </div>
        <div className="card panel">
          <h3>Recruitment Performance</h3>
          {[
            ['Active manpower', String(k?.activeManpower ?? 0)],
            ['Active candidates', String(k?.activeCandidates ?? 0)],
            ['Talent pool', String(k?.talentPoolSize ?? 0)],
            ['Budget exceptions', String(k?.budgetExceptions ?? 0)],
            ['DB source', payload?.source || '—'],
            ['Connection', payload?.dbConnected ? 'Online' : 'Offline'],
          ].map((x) => (
            <div className="metricLine" key={x[0]}><span>{x[0]}</span><b>{x[1]}</b></div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div>
            <div className="title">Candidate Pipeline</div>
            <div className="note">Highest-priority candidates across the database.</div>
          </div>
          <Link className="btn" href={recruitmentRoutes.candidates}>View all →</Link>
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr><th>Candidate</th><th>Role</th><th>Source</th><th>Experience</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {(payload?.candidates || []).slice(0, 8).map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="strong">{c.firstName} {c.lastName}</div>
                    <div className="subtext">{c.candidateNo}</div>
                  </td>
                  <td>{c.currentTitle || '—'}<div className="subtext">{c.email || ''}</div></td>
                  <td>{c.source || '—'}</td>
                  <td>{c.yearsExperience != null ? `${c.yearsExperience} yrs` : '—'}</td>
                  <td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td><Link href={recruitmentRoutes.candidates}>Open</Link></td>
                </tr>
              ))}
              {!payload?.candidates.length ? <tr><td colSpan={6}>No candidates yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <RecruitmentFormModal
        open={modalOpen}
        kind="manpower"
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
