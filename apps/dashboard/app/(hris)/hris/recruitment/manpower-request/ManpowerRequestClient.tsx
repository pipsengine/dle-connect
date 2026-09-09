'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecruitmentPayload } from '@/lib/recruitment-shared';
import { AppShell, Badge, KPI, PageHeader, Pipeline, Tabs, statusTone } from '@/components/recruitment/AppShell';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';

export default function ManpowerRequestClient() {
  const [payload, setPayload] = useState<RecruitmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const edit = params.get('edit');
    if (edit) {
      setEditId(edit);
      setModalOpen(true);
    }
  }, []);

  const rows = useMemo(() => {
    const list = payload?.manpowerRequests || [];
    return list.filter((m) => {
      if (statusFilter !== 'All' && m.workflowStatus !== statusFilter) return false;
      if (!q) return true;
      const hay = `${m.requestNo} ${m.department} ${m.positionTitle} ${m.employmentType}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [payload, q, statusFilter]);

  const k = payload?.kpis;
  const tabItems = ['All', 'Draft', 'Submitted', 'HR Review', 'Finance Review', 'MD/CEO Review', 'Approved', 'Returned'];
  const activeTab = Math.max(0, tabItems.indexOf(statusFilter === 'All' ? 'All' : statusFilter));

  const openCreate = () => {
    setEditId(null);
    setModalOpen(true);
  };

  return (
    <AppShell active="manpower-request">
      <PageHeader
        title="Manpower Request"
        subtitle="Initiate and control workforce demand with budget, project/cost-centre, replacement/new-position logic and approval routing."
        primary="New Manpower Request"
        onPrimary={openCreate}
        onRefresh={() => void load()}
      />
      {error ? <div className="card panel" style={{ color: '#c92735', marginBottom: 13 }}>{error}</div> : null}
      {message ? <div className="card panel" style={{ color: '#087a52', marginBottom: 13 }}>{message}</div> : null}

      <div className="grid kpiGrid">
        <KPI label="Open Requests" value={k?.activeManpower ?? 0} meta="Current manpower requests" tone="blue" />
        <KPI label="Awaiting HR" value={k?.awaitingHr ?? 0} meta="HR workforce validation" tone="amber" />
        <KPI label="Finance Review" value={k?.financeReview ?? 0} meta="Budget confirmation" tone="purple" />
        <KPI label="Approved" value={k?.approvedManpower ?? 0} meta="Ready for requisition" tone="green" />
        <KPI label="Requested HC" value={k?.requestedHeadcount ?? 0} meta="Total requested headcount" tone="cyan" />
        <KPI label="Budget Exceptions" value={k?.budgetExceptions ?? 0} meta="Funding requires review" tone="red" />
      </div>

      <div className="card" style={{ marginBottom: 13 }}>
        <div className="toolbar">
          <div>
            <div className="title">Manpower Request Register</div>
            <div className="note">Role-based operational register with filters, workflow and audit history — live from MSSQL.</div>
          </div>
          <div className="filters">
            <input className="input" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {tabItems.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div onClick={(e) => {
          const t = e.target as HTMLElement;
          const tab = t.closest('.tab');
          if (!tab) return;
          setStatusFilter(tab.textContent || 'All');
        }}>
          <Tabs items={tabItems} active={activeTab} />
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Department / Position</th>
                <th>Employment Type</th>
                <th>Headcount</th>
                <th>Need Date</th>
                <th>Budget</th>
                <th>Approval Stage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setEditId(m.id);
                    setModalOpen(true);
                  }}
                >
                  <td>
                    <div className="strong">{m.requestNo}</div>
                    <div className="subtext">{m.createdAt.slice(0, 10)} · {m.requestType}</div>
                  </td>
                  <td>{m.department} · {m.positionTitle}</td>
                  <td>{m.employmentType}</td>
                  <td>{m.headcount}</td>
                  <td>{m.needDate || '—'}</td>
                  <td><Badge tone={statusTone(m.budgetStatus)}>{m.budgetStatus}</Badge></td>
                  <td>{m.workflowStatus}</td>
                  <td><Badge tone={statusTone(m.workflowStatus)}>{m.workflowStatus}</Badge></td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={8}>No manpower requests match the current filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid two">
        <div className="card panel">
          <h3>Demand Analytics</h3>
          {(['New Position', 'Replacement', 'Project Mobilization', 'Critical Vacancy', 'Succession'] as const).map((label) => {
            const total = Math.max(1, (payload?.manpowerRequests || []).length);
            const count = (payload?.manpowerRequests || []).filter((m) =>
              m.requestType.toLowerCase().includes(label.split(' ')[0].toLowerCase())
              || (label === 'New Position' && /new/i.test(m.requestType)),
            ).length;
            const pct = Math.round((count / total) * 100);
            return (
              <div className="barrow" key={label}>
                <span>{label}</span>
                <div className="bar"><span style={{ width: `${pct}%` }} /></div>
                <b>{pct}%</b>
              </div>
            );
          })}
        </div>
        <div className="card panel">
          <h3>Workflow & Controls</h3>
          <Pipeline stages={payload?.pipeline} />
          <div className="activity"><div className="ico">1</div><div><b>Validation and completeness check</b><div className="subtext">Required data, attachments and policy conditions.</div></div></div>
          <div className="activity"><div className="ico">2</div><div><b>Approval matrix</b><div className="subtext">Role and threshold-driven approvals.</div></div></div>
          <div className="activity"><div className="ico">3</div><div><b>Notifications & SLA</b><div className="subtext">Email/in-app reminders and escalations.</div></div></div>
          <div className="activity"><div className="ico">4</div><div><b>Audit trail</b><div className="subtext">Immutable action history in RecruitmentApprovalEvent.</div></div></div>
        </div>
      </div>

      <RecruitmentFormModal
        open={modalOpen}
        kind="manpower"
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
