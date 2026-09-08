'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Coins,
  Download,
  ExternalLink,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  FinalPayrollKpi,
  FinalPayrollPayload,
  FinalPayrollSettlement,
} from '@/lib/final-payroll-settlement-shared';
import {
  formatFinalPayrollDate,
  formatFinalPayrollMoney,
  settlementTotals,
} from '@/lib/final-payroll-settlement-shared';
import styles from '@/styles/final-payroll-processing.module.css';

const KPI_ICONS = {
  pending: Users,
  clearance: ClipboardCheck,
  ready: Calculator,
  approval: Clock3,
  approved: CircleCheck,
  value: Coins,
} as const;

const DETAIL_TABS = [
  'Summary',
  'Earnings',
  'Deductions & Recoveries',
  'Clearance',
  'Calculation',
  'Approval',
  'Documents',
  'Audit Trail',
] as const;

const STATUS_PILLS = [
  'All',
  'Awaiting Clearance',
  'Ready for Calculation',
  'In Review',
  'Awaiting Approval',
  'Approved',
  'Paid',
  'Exceptions',
] as const;

const statusClass = (value: string) => {
  const key = value.replace(/\s+/g, '');
  const map: Record<string, string> = {
    Cleared: styles.statusCleared,
    Approved: styles.statusApproved,
    Ready: styles.statusReady,
    Completed: styles.statusCompleted,
    Paid: styles.statusPaid,
    'In Review': styles.statusInReview,
    Pending: styles.statusPending,
    'Awaiting Clearance': styles.statusAwaitingClearance,
    Draft: styles.statusDraft,
    Exception: styles.statusException,
    'Ready for Calculation': styles.statusReadyForCalculation,
    'Awaiting Approval': styles.statusAwaitingApproval,
    Excluded: styles.statusExcluded,
  };
  return `${styles.status} ${map[value] || map[key] || ''}`.trim();
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '—';

const clearanceLabel = (row: FinalPayrollSettlement) =>
  (row.clearance || []).every((item) => item.status === 'Completed') ? 'Cleared' : 'Pending';

const approvalLabel = (row: FinalPayrollSettlement) => {
  const active = (row.approvalStages || []).find((stage) => stage.status === 'In Review');
  if (active) return 'In Review';
  if (row.status === 'Approved' || row.status === 'Paid') return 'Approved';
  return 'Pending';
};

export default function FinalPayrollProcessingWorkspace({
  initialPeriod,
  initialSettlementId,
  initialEmployeeCode,
  initialEmployeeId,
}: {
  initialPeriod?: string;
  initialSettlementId?: string;
  initialEmployeeCode?: string;
  initialEmployeeId?: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<FinalPayrollPayload | null>(null);
  const [period, setPeriod] = useState(initialPeriod || '');
  const [selectedId, setSelectedId] = useState<string | null>(initialSettlementId || null);
  const [tab, setTab] = useState<(typeof STATUS_PILLS)[number]>('All');
  const [detailTab, setDetailTab] = useState<(typeof DETAIL_TABS)[number]>('Summary');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [exitType, setExitType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [comment, setComment] = useState('');
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
      const res = await fetch(`/api/hris/offboarding/final-payroll?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load final payroll.');
      setPayload(data);
      setPeriod(data.period);
      setSelectedId(data.selectedId);
    } catch (err: any) {
      setError(err?.message || 'Unable to load final payroll.');
    } finally {
      setLoading(false);
    }
  }, [period, selectedId, initialEmployeeCode, initialEmployeeId]);

  useEffect(() => {
    void load(initialPeriod || undefined, initialSettlementId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProfile = (row: FinalPayrollSettlement) => {
    const id = row.employeeId || row.employeeCode;
    if (!id) return;
    router.push(`/hris/employees/employee-profile/${encodeURIComponent(id)}`);
  };

  const rows = useMemo(() => {
    const list = payload?.settlements || [];
    return list.filter((row) => {
      if (tab === 'Exceptions' && row.status !== 'Exception') return false;
      if (tab !== 'All' && tab !== 'Exceptions' && row.status !== tab) return false;
      if (department !== 'all' && row.department !== department) return false;
      if (exitType !== 'all' && row.exitType !== exitType) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${row.employeeName} ${row.employeeCode} ${row.department}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [payload?.settlements, tab, department, exitType, statusFilter, search]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || payload?.selected || rows[0] || null,
    [rows, selectedId, payload?.selected],
  );

  const runAction = async (action: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/offboarding/final-payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, action, comment }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Action failed.');
      setPayload(data);
      setSelectedId(data.selectedId);
      setComment('');
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const p = period || payload?.period;
    if (!p) return;
    window.location.href = `/api/hris/offboarding/final-payroll?period=${encodeURIComponent(p)}&format=csv`;
  };

  const totals = selected ? settlementTotals(selected) : null;
  const calcRows = selected
    ? [
        ...selected.earnings.filter((line) => line.included).map((line) => ({ label: line.label, amount: line.amount, kind: 'line' as const })),
        { label: 'Total Earnings', amount: totals?.gross || 0, kind: 'total' as const },
        ...selected.deductions.filter((line) => line.included).map((line) => ({ label: line.label, amount: line.amount, kind: 'line' as const })),
        { label: 'Total Deductions', amount: totals?.deductions || 0, kind: 'total' as const },
        ...selected.statutory.filter((line) => line.included && line.amount > 0).map((line) => ({ label: line.label, amount: line.amount, kind: 'line' as const })),
        { label: 'Final Net Settlement', amount: totals?.net || 0, kind: 'net' as const },
      ]
    : [];

  return (
    <div className={styles.root}>
      <div className={styles.crumb}>
        Offboarding <ChevronRight /> <b>Final Payroll Processing</b>
      </div>

      <div className={styles.titleRow}>
        <div>
          <h1>Final Payroll Processing</h1>
          <p>Calculate, review and approve employee final settlements.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => void load(period || undefined, selectedId)}>
            {payload?.periodLabel || period || 'Period'}
          </button>
          <button type="button" onClick={exportCsv}>
            <Download /> Export
          </button>
          <Link className={`${styles.btn} ${styles.primary}`} href="/hris/offboarding/final-payroll-processing/new-settlement">
            <Plus /> New Settlement
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.kpis}>
        {(payload?.kpis || []).map((kpi: FinalPayrollKpi) => {
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
        {STATUS_PILLS.map((item) => {
          const count = item === 'Exceptions'
            ? payload?.tabCounts?.Exceptions || 0
            : item === 'All'
              ? payload?.tabCounts?.All || 0
              : payload?.tabCounts?.[item] || 0;
          return (
            <button
              key={item}
              type="button"
              className={tab === item ? styles.on : undefined}
              onClick={() => setTab(item)}
            >
              {item} {count}
            </button>
          );
        })}
        <button type="button" className={styles.filter}>
          <Filter /> Filters
        </button>
      </div>

      <section className={`${styles.card} ${styles.register}`}>
        <div className={styles.sectionHead}>
          <h2>Final Payroll Register</h2>
          <div className={styles.filters}>
            <label>
              <Search />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, employee ID..."
              />
            </label>
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="all">Department</option>
              {(payload?.filterOptions.departments || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select value={exitType} onChange={(event) => setExitType(event.target.value)}>
              <option value="all">Exit Type</option>
              {(payload?.filterOptions.exitTypes || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Status</option>
              {(payload?.filterOptions.statuses || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading final payroll register…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            No settlements for this period. Create one with <b>New Settlement</b>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {['', 'Employee', 'Employee ID', 'Department', 'Exit Type', 'Last Working Day', 'Currency', 'Gross Entitlement', 'Deductions / Recoveries', 'Final Net Pay', 'Clearance', 'Approval', 'Status', 'Actions'].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const money = settlementTotals(row);
                const selectedRow = selected?.id === row.id;
                return (
                  <tr
                    key={row.id}
                    className={selectedRow ? styles.sel : undefined}
                    onClick={() => {
                      setSelectedId(row.id);
                      setDetailTab('Summary');
                    }}
                    onDoubleClick={() => openProfile(row)}
                  >
                    <td>□</td>
                    <td>{row.employeeName}</td>
                    <td>{row.employeeCode}</td>
                    <td>{row.department}</td>
                    <td>{row.exitType}</td>
                    <td>{formatFinalPayrollDate(row.lastWorkingDay)}</td>
                    <td>{row.currency}</td>
                    <td>{formatFinalPayrollMoney(money.gross, row.currency)}</td>
                    <td>{formatFinalPayrollMoney(money.deductions + money.statutory, row.currency)}</td>
                    <td>{formatFinalPayrollMoney(money.net, row.currency)}</td>
                    <td><span className={statusClass(clearanceLabel(row))}>{clearanceLabel(row)}</span></td>
                    <td><span className={statusClass(approvalLabel(row))}>{approvalLabel(row)}</span></td>
                    <td><span className={statusClass(row.status)}>{row.status}</span></td>
                    <td><MoreHorizontal size={16} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selected ? (
        <section className={`${styles.card} ${styles.detail}`}>
          <div className={styles.tabs}>
            {DETAIL_TABS.map((item) => (
              <button
                key={item}
                type="button"
                className={detailTab === item ? styles.activeTab : undefined}
                onClick={() => setDetailTab(item)}
              >
                {item}
              </button>
            ))}
            <Link
              className={styles.rightBtn}
              href={`/hris/offboarding/final-payroll-processing/new-settlement?id=${encodeURIComponent(selected.id)}`}
            >
              View Full Details
            </Link>
          </div>

          <div className={styles.detailGrid}>
            <div className={styles.person}>
              <div className={styles.personTop}>
                <div className={styles.bigAvatar}>{initials(selected.employeeName)}</div>
                <div>
                  <h2>{selected.employeeName}</h2>
                  <p>{selected.employeeCode}</p>
                  <span className={statusClass(selected.status)}>{selected.status}</span>
                </div>
              </div>
              <div className={styles.footerActions} style={{ marginBottom: 10 }}>
                <button type="button" onClick={() => openProfile(selected)}>
                  <ExternalLink size={14} /> Open Profile
                </button>
                <Link
                  className={styles.btn}
                  href={`/hris/employees/employee-exit-status?employeeId=${encodeURIComponent(selected.employeeId || selected.employeeCode)}`}
                >
                  Exit Status
                </Link>
              </div>
              {[
                ['Department', selected.department],
                ['Employment Type', selected.employmentType],
                ['Exit Type', selected.exitType],
                ['Resignation Date', formatFinalPayrollDate(selected.resignationDate)],
                ['Last Working Day', formatFinalPayrollDate(selected.lastWorkingDay)],
                ['Service Length', selected.serviceLength],
                ['Payroll Currency', selected.currency],
                ['Current Basic Salary', formatFinalPayrollMoney(selected.basicSalary, selected.currency)],
                ['Last Regular Payroll', selected.lastRegularPayroll],
                ['Next Payroll', selected.nextPayrollExcluded ? 'Excluded' : 'Included'],
              ].map(([label, value]) => (
                <div className={styles.kv} key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>

            <div className={styles.settlement}>
              <div className={styles.miniKpis}>
                <div>
                  <small>Gross Final Entitlement</small>
                  <b>{formatFinalPayrollMoney(totals?.gross || 0, selected.currency)}</b>
                </div>
                <div>
                  <small>Total Deductions & Recoveries</small>
                  <b>{formatFinalPayrollMoney(totals?.deductions || 0, selected.currency)}</b>
                </div>
                <div>
                  <small>Statutory Deductions</small>
                  <b>{formatFinalPayrollMoney(totals?.statutory || 0, selected.currency)}</b>
                </div>
                <div>
                  <small>Final Net Settlement</small>
                  <b>{formatFinalPayrollMoney(totals?.net || 0, selected.currency)}</b>
                </div>
              </div>

              {(detailTab === 'Summary' || detailTab === 'Calculation' || detailTab === 'Earnings' || detailTab === 'Deductions & Recoveries') ? (
                <>
                  <h3>Settlement Calculation Summary</h3>
                  <table className={styles.calc}>
                    <tbody>
                      {calcRows.map((row) => (
                        <tr
                          key={`${row.label}-${row.kind}`}
                          className={row.kind === 'total' ? styles.total : row.kind === 'net' ? styles.net : undefined}
                        >
                          <td>{row.label}</td>
                          <td>{formatFinalPayrollMoney(row.amount, selected.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}

              {detailTab === 'Clearance' ? (
                <>
                  <h3>Clearance Status</h3>
                  {(selected.clearance || []).map((item) => (
                    <div className={styles.check} key={item.id}>
                      <CheckCircle2 />
                      <span>{item.label}{item.note ? ` — ${item.note}` : ''}</span>
                      <span className={statusClass(item.status)}>{item.status}</span>
                    </div>
                  ))}
                </>
              ) : null}

              {detailTab === 'Approval' ? (
                <>
                  <h3>Approval Workflow</h3>
                  {(selected.approvalStages || []).map((stage, index) => (
                    <div className={`${styles.flow} ${stage.status !== 'Pending' ? styles.flowActive : ''}`} key={stage.id}>
                      <i>{index + 1}</i>
                      {stage.label} — {stage.status}
                    </div>
                  ))}
                </>
              ) : null}

              {(detailTab === 'Documents' || detailTab === 'Audit Trail') ? (
                <div className={styles.empty}>
                  {detailTab === 'Documents'
                    ? 'Attach exit documents from Employee Documents when available.'
                    : `Updated ${formatFinalPayrollDate(selected.updatedAt)} by ${selected.updatedBy}.`}
                </div>
              ) : null}
            </div>

            <div className={styles.sideDetail}>
              <h3>Clearance Status</h3>
              {(selected.clearance || []).map((item) => (
                <div className={styles.check} key={item.id}>
                  <CheckCircle2 />
                  <span>{item.label}</span>
                  <span className={statusClass(item.status)}>{item.status}</span>
                </div>
              ))}

              <h3>Approval Workflow</h3>
              {(selected.approvalStages || []).map((stage, index) => (
                <div className={`${styles.flow} ${stage.status !== 'Pending' ? styles.flowActive : ''}`} key={stage.id}>
                  <i>{index + 1}</i>
                  {stage.label} — {stage.status}
                </div>
              ))}

              <h3>Comments</h3>
              <div className={styles.commentList}>
                {(selected.comments || []).length === 0 ? <small>No comments yet.</small> : null}
                {(selected.comments || []).map((item) => (
                  <div key={item.id}>
                    <div>{item.body}</div>
                    <small>{item.actor} · {formatFinalPayrollDate(item.createdAt)}</small>
                  </div>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add a comment or note..."
              />
              <div className={styles.footerActions}>
                <button type="button" disabled={busy} onClick={() => void runAction('return')}>Return</button>
                <button type="button" disabled={busy} onClick={() => void runAction('clarify')}>Request Clarification</button>
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void runAction('approve')}>
                  Approve & Send to Finance
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
