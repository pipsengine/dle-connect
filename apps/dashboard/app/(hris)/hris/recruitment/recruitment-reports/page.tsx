'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecruitmentPayload } from '@/lib/recruitment-shared';
import { AppShell, KPI, PageHeader } from '@/components/recruitment/AppShell';

export default function RecruitmentReportsPage() {
  const [payload, setPayload] = useState<RecruitmentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  return (
    <AppShell active="recruitment-reports">
      <PageHeader
        title="Recruitment Reports"
        subtitle="Operational totals derived from transactional [hris] recruitment tables — no manual KPI entry."
        onRefresh={() => void load()}
      />
      {error ? <div className="card panel" style={{ color: '#c92735' }}>{error}</div> : null}
      <div className="grid kpiGrid">
        <KPI label="Manpower Active" value={k?.activeManpower ?? 0} meta="Requests" tone="blue" />
        <KPI label="Pending" value={k?.pendingAction ?? 0} meta="Awaiting action" tone="amber" />
        <KPI label="Requisitions" value={k?.openRequisitions ?? 0} meta="Open" tone="purple" />
        <KPI label="Candidates" value={k?.activeCandidates ?? 0} meta="Active" tone="cyan" />
        <KPI label="Screening" value={k?.applicationsInScreening ?? 0} meta="Applications" tone="green" />
        <KPI label="Talent Pool" value={k?.talentPoolSize ?? 0} meta="Members" tone="red" />
      </div>
      <div className="card panel">
        <div className="title">Source</div>
        <div className="note">{payload?.source || '—'} · DB {payload?.dbConnected ? 'connected' : 'offline'}</div>
        <p className="help" style={{ marginTop: 12 }}>
          Export and scheduled packs can be layered on this payload. All figures above are computed from live table counts.
        </p>
      </div>
    </AppShell>
  );
}
