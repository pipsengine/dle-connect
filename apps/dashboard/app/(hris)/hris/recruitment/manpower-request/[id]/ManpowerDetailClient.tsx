'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { ManpowerRequestRecord, RecruitmentPayload } from '@/lib/recruitment-shared';
import { recruitmentRoutes } from '@/lib/recruitment-shared';
import { AppShell, PageHeader, Tabs } from '@/components/recruitment/AppShell';

export default function ManpowerDetailClient() {
  const params = useParams();
  const id = String(params?.id || '');
  const router = useRouter();
  const [row, setRow] = useState<ManpowerRequestRecord | null>(null);
  const [events, setEvents] = useState<RecruitmentPayload['approvalEvents']>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ManpowerRequestRecord>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hris/recruitment', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Unable to load');
      const payload = json.data as RecruitmentPayload;
      const found = payload.manpowerRequests.find((m) => m.id === id) || null;
      setRow(found);
      setForm(found || {});
      setEvents(payload.approvalEvents.filter((e) => e.entityId === id || e.entityType === 'ManpowerRequest'));
      setError(found ? null : 'Manpower request not found.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const post = async (action: string) => {
    if (!row) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/hris/recruitment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id: row.id, ...form }),
      });
      const json = await res.json();
      if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Action failed');
      setMessage(json.data.message);
      const payload = json.data.payload as RecruitmentPayload;
      const found = payload.manpowerRequests.find((m) => m.id === id) || null;
      setRow(found);
      setForm(found || {});
      setEvents(payload.approvalEvents.filter((e) => e.entityId === id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell active="manpower-request">
      <PageHeader
        title={`Manpower Request — ${row?.requestNo || id}`}
        subtitle="Detailed record workspace with complete controls, evidence, approvals and audit history."
        primary="Save Changes"
        onPrimary={() => void post('update_manpower')}
        onRefresh={() => void load()}
      />
      {error ? <div className="card panel" style={{ color: '#c92735', marginBottom: 13 }}>{error}</div> : null}
      {message ? <div className="card panel" style={{ color: '#087a52', marginBottom: 13 }}>{message}</div> : null}
      {!row ? <div className="card empty">Loading or not found…</div> : (
        <div className="card">
          <Tabs items={['Overview', 'Details', 'Documents', 'Approval', 'Comments', 'Audit Trail']} />
          <div className="formSection">
            <h3>Request Overview</h3>
            <div className="help">Workforce demand, replacement/new position context and required date.</div>
            <div className="detailGrid">
              {[
                ['Status', row.workflowStatus],
                ['Owner', row.createdBy],
                ['Created', row.createdAt.slice(0, 10)],
                ['Last Updated', row.updatedAt.slice(0, 16).replace('T', ' ')],
              ].map((x) => (
                <div className="detail" key={x[0]}><label>{x[0]}</label><strong>{x[1]}</strong></div>
              ))}
            </div>
          </div>
          <div className="formSection">
            <h3>Editable Details</h3>
            <div className="formGrid">
              <div className="field"><label>Department</label><input className="input" value={form.department || ''} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></div>
              <div className="field"><label>Position Title</label><input className="input" value={form.positionTitle || ''} onChange={(e) => setForm((f) => ({ ...f, positionTitle: e.target.value }))} /></div>
              <div className="field"><label>Employment Type</label><input className="input" value={form.employmentType || ''} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))} /></div>
              <div className="field"><label>Headcount</label><input className="input" type="number" value={form.headcount ?? 1} onChange={(e) => setForm((f) => ({ ...f, headcount: Number(e.target.value) || 1 }))} /></div>
              <div className="field"><label>Need Date</label><input className="input" type="date" value={form.needDate || ''} onChange={(e) => setForm((f) => ({ ...f, needDate: e.target.value }))} /></div>
              <div className="field"><label>Cost Centre</label><input className="input" value={form.costCentre || ''} onChange={(e) => setForm((f) => ({ ...f, costCentre: e.target.value }))} /></div>
              <div className="field full"><label>Business Justification</label><textarea className="textarea" value={form.businessJustification || ''} onChange={(e) => setForm((f) => ({ ...f, businessJustification: e.target.value }))} /></div>
            </div>
          </div>
          <div className="formSection">
            <h3>Budget & Cost</h3>
            <div className="detailGrid">
              {[
                ['Budget Status', row.budgetStatus],
                ['Budgeted', row.budgeted ? 'Yes' : 'No'],
                ['Estimated Cost', row.estimatedAnnualCost == null ? '—' : `${row.currency} ${row.estimatedAnnualCost.toLocaleString()}`],
                ['Project', row.project || '—'],
              ].map((x) => (
                <div className="detail" key={x[0]}><label>{x[0]}</label><strong>{x[1]}</strong></div>
              ))}
            </div>
          </div>
          <div className="formSection">
            <h3>Approval History</h3>
            <div className="help">Immutable events from RecruitmentApprovalEvent.</div>
            {events.slice(0, 12).map((e) => (
              <div className="activity" key={e.id}>
                <div className="ico">{e.action.slice(0, 1)}</div>
                <div>
                  <b>{e.action}</b> · {e.stage}
                  <div className="subtext">{e.actor} · {e.actionAt.replace('T', ' ').slice(0, 16)}</div>
                  {e.comment ? <div className="subtext">{e.comment}</div> : null}
                </div>
              </div>
            ))}
            {!events.length ? <div className="subtext">No events yet.</div> : null}
          </div>
          <div className="stickyFooter">
            <button type="button" className="btn" onClick={() => router.push(recruitmentRoutes.manpower)}>Cancel</button>
            <button type="button" className="btn" disabled={saving} onClick={() => void post('update_manpower')}>Save Changes</button>
            <button type="button" className="btn amber" disabled={saving} onClick={() => void post('submit_manpower')}>Submit</button>
            <button type="button" className="btn green" disabled={saving} onClick={() => void post('approve_manpower')}>Approve</button>
            <button type="button" className="btn danger" disabled={saving} onClick={() => void post('reject_manpower')}>Reject</button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
