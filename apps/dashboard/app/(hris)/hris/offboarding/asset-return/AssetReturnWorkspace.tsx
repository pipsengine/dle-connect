'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  Filter,
  Package,
  Search,
  Users,
} from 'lucide-react';
import type {
  AssetReturnCaseStatus,
  AssetReturnLine,
  AssetReturnPayload,
  OffboardingModuleKpi,
} from '@/lib/asset-return-shared';
import {
  assetReturnClearanceHref,
  assetReturnResignationHref,
  formatAssetReturnDate,
} from '@/lib/asset-return-shared';
import styles from '@/styles/resignation-management.module.css';

const KPI_ICONS = {
  total: Users,
  pending: Clock3,
  progress: Package,
  done: CheckCircle2,
  out: Package,
  avg: CheckCircle2,
} as const;

const STATUS_TABS = ['All', 'Not Started', 'In Progress', 'Completed', 'Blocked'] as const;

const statusClass = (value: string) => {
  const key = value.replace(/\s+/g, '');
  const map: Record<string, string> = {
    NotStarted: styles.statusNotStarted,
    InProgress: styles.statusInProgress,
    Completed: styles.statusCompleted,
    Outstanding: styles.statusPending,
    Returned: styles.statusCompleted,
    Waived: styles.statusAccepted,
    Recovered: styles.statusClearance,
    Blocked: styles.statusException,
  };
  return `${styles.status} ${map[key] || ''}`.trim();
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '—';

const cycleAssetStatus = (status: AssetReturnLine['status']): AssetReturnLine['status'] => {
  if (status === 'Outstanding') return 'Returned';
  if (status === 'Returned') return 'Waived';
  if (status === 'Waived') return 'Recovered';
  return 'Outstanding';
};

export default function AssetReturnWorkspace({
  initialPeriod,
  initialId,
  initialEmployeeCode,
  initialEmployeeId,
}: {
  initialPeriod?: string;
  initialId?: string;
  initialEmployeeCode?: string;
  initialEmployeeId?: string;
}) {
  const [payload, setPayload] = useState<AssetReturnPayload | null>(null);
  const [period, setPeriod] = useState(initialPeriod || '');
  const [selectedId, setSelectedId] = useState<string | null>(initialId || null);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>('All');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPeriod?: string, nextId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextPeriod || period) params.set('period', nextPeriod || period);
      if (nextId || selectedId) params.set('id', String(nextId || selectedId));
      if (initialEmployeeCode) params.set('employeeCode', initialEmployeeCode);
      if (initialEmployeeId) params.set('employeeId', initialEmployeeId);
      const res = await fetch(`/api/hris/offboarding/asset-return?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load asset return.');
      setPayload(data);
      setPeriod(data.period);
      setSelectedId(data.selectedId);
    } catch (err: any) {
      setError(err?.message || 'Unable to load asset return.');
    } finally {
      setLoading(false);
    }
  }, [period, selectedId, initialEmployeeCode, initialEmployeeId]);

  useEffect(() => {
    void load(initialPeriod || undefined, initialId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const list = payload?.cases || [];
    return list.filter((row) => {
      if (tab !== 'All' && row.status !== tab) return false;
      if (department !== 'all' && row.department !== department) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${row.employeeName} ${row.employeeCode} ${row.department}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [payload?.cases, tab, department, statusFilter, search]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || payload?.selected || rows[0] || null,
    [rows, selectedId, payload?.selected],
  );

  const runAction = async (body: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/offboarding/asset-return', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Action failed.');
      setPayload(data);
      setSelectedId(data.selectedId);
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const p = period || payload?.period;
    if (!p) return;
    window.location.href = `/api/hris/offboarding/asset-return?period=${encodeURIComponent(p)}&format=csv`;
  };

  return (
    <div className={styles.root}>
      <div className={styles.crumb}>
        Offboarding <ChevronRight /> <b>Asset Return</b>
      </div>

      <div className={styles.titleRow}>
        <div>
          <h1>Asset Return</h1>
          <p>Track company property returns during clearance before Final Payroll.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => void load(period || undefined, selectedId)}>
            {payload?.periodLabel || period || 'Period'}
          </button>
          <button type="button" onClick={exportCsv}>
            <Download /> Export
          </button>
          <Link className={`${styles.btn} ${styles.primary}`} href="/hris/offboarding/resignation-management">
            Resignation Register
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.kpis}>
        {(payload?.kpis || []).map((kpi: OffboardingModuleKpi) => {
          const Icon = KPI_ICONS[kpi.id as keyof typeof KPI_ICONS] || Users;
          return (
            <div className={`${styles.kpi} ${styles[kpi.tone]}`} key={kpi.id}>
              <Icon />
              <div>
                <small>{kpi.label}</small>
                <strong>{kpi.display}</strong>
                <em>{kpi.deltaLabel}</em>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.pills}>
        {STATUS_TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? styles.on : undefined}
            onClick={() => setTab(item)}
          >
            {item} {payload?.tabCounts?.[item] || 0}
          </button>
        ))}
        <button type="button" className={styles.filter}>
          <Filter /> Filters
        </button>
      </div>

      <section className={`${styles.card} ${styles.register}`}>
        <div className={styles.sectionHead}>
          <h2>Asset Return Register</h2>
          <div className={styles.filters}>
            <label>
              <Search />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, employee ID, or department..."
              />
            </label>
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="all">Department</option>
              {(payload?.filterOptions.departments || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Status</option>
              {(payload?.filterOptions.statuses || []).map((item: AssetReturnCaseStatus) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading asset return register…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            No asset return cases for this period. Cases appear when a resignation reaches{' '}
            <b>Handover</b> or <b>Clearance</b>. Start from the{' '}
            <Link href="/hris/offboarding/resignation-management">Resignation Register</Link>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {['Employee', 'Employee ID', 'Department', 'Outstanding', 'Returned %', 'Resignation Stage', 'Status'].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={selected?.id === row.id ? styles.sel : undefined}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td>
                    <div className={styles.personCell}>
                      <span className={styles.avatar}>{initials(row.employeeName)}</span>
                      {row.employeeName}
                    </div>
                  </td>
                  <td>{row.employeeCode}</td>
                  <td>{row.department}</td>
                  <td>{row.outstandingCount}</td>
                  <td><span className={statusClass(row.completionPct >= 100 ? 'Completed' : 'In Progress')}>{row.completionPct}%</span></td>
                  <td>{row.resignationStatus}</td>
                  <td><span className={statusClass(row.status)}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected ? (
        <section className={`${styles.card} ${styles.workspace}`}>
          <aside className={styles.profilePanel}>
            <div className={styles.bigAvatar}>{initials(selected.employeeName)}</div>
            <h2>{selected.employeeName}</h2>
            <b>{selected.employeeCode}</b>
            <p><span className={statusClass(selected.status)}>{selected.status}</span></p>
            <div className={styles.detailGrid}>
              <span>Department</span><b>{selected.department}</b>
              <span>Position</span><b>{selected.position}</b>
              <span>Manager</span><b>{selected.managerName}</b>
              <span>Resignation</span><b>{selected.resignationReference}</b>
              <span>Last Working Day</span><b>{formatAssetReturnDate(selected.lastWorkingDay)}</b>
              <span>Outstanding</span><b>{selected.outstandingCount}</b>
            </div>
            <Link className={styles.btn} href={assetReturnResignationHref(selected)}>
              <ExternalLink /> Open Resignation
            </Link>
          </aside>

          <div className={styles.workspaceMain}>
            <div style={{ padding: '14px 16px 0' }}>
              <h3 style={{ margin: '0 0 4px' }}>Company Assets</h3>
              <p className={styles.sub}>Click status to cycle Outstanding → Returned → Waived → Recovered.</p>
            </div>
            <div className={styles.three} style={{ gridTemplateColumns: '1fr', padding: '10px 16px' }}>
              <div className={`${styles.card} ${styles.box}`}>
                {selected.assets.map((asset) => (
                  <div className={styles.line} key={asset.id}>
                    <span>
                      {asset.assetType}
                      <em style={{ display: 'block', color: '#456d9d', fontStyle: 'normal', fontWeight: 600 }}>
                        {asset.tagOrSerial} · {asset.condition}
                        {asset.returnedBy ? ` · ${asset.returnedBy}` : ''}
                      </em>
                    </span>
                    <button
                      type="button"
                      className={statusClass(asset.status)}
                      disabled={busy}
                      onClick={() => void runAction({ assetId: asset.id, assetStatus: cycleAssetStatus(asset.status) })}
                    >
                      {asset.status}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.footerActions}>
              <Link className={styles.btn} href={assetReturnClearanceHref(selected)}>Exit Clearance</Link>
              <Link className={styles.btn} href={assetReturnResignationHref(selected)}>Back to Resignation</Link>
              {selected.status !== 'Completed' ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void runAction({ action: 'complete' })}
                >
                  Mark All Returned →
                </button>
              ) : (
                <Link
                  className={`${styles.btn} ${styles.primary}`}
                  href={`/hris/offboarding/final-payroll-processing/new-settlement?employeeCode=${encodeURIComponent(selected.employeeCode)}&resignationId=${encodeURIComponent(selected.resignationId)}&fromResignation=1`}
                >
                  Proceed to Final Payroll →
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
