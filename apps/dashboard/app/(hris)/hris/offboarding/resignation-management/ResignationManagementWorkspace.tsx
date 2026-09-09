'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Download,
  ExternalLink,
  Filter,
  FileCheck2,
  MoreHorizontal,
  Plus,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type {
  ResignationKpi,
  ResignationPayload,
  ResignationRecord,
  ResignationStatus,
} from '@/lib/resignation-management-shared';
import {
  formatNoticeMonths,
  formatResignationDate,
  noticeBalanceDays,
  noticeStatusLabel,
  resignationAssetReturnHref,
  resignationExitClearanceHref,
  resignationFinalPayrollHref,
  resignationHandoverHref,
  resignationProfileHref,
  resignationReadyForFinalPayroll,
} from '@/lib/resignation-management-shared';
import styles from '@/styles/resignation-management.module.css';

const KPI_ICONS = {
  new: Users,
  review: Clock3,
  notice: ClipboardCheck,
  clearance: FileCheck2,
  payroll: Wallet,
  completed: CheckCircle2,
} as const;

const STATUS_TABS = [
  'All',
  'Submitted',
  'HR Review',
  'Notice Period',
  'Handover',
  'Clearance',
  'Final Payroll',
  'Completed',
  'Exceptions',
] as const;

const DETAIL_TABS = [
  'Overview',
  'Resignation Details',
  'Notice Period',
  'Handover',
  'Clearance',
  'Final Payroll',
  'Exit Interview',
  'Documents',
  'Approval',
  'Audit Trail',
] as const;

const statusClass = (value: string) => {
  const key = value.replace(/\s+/g, '');
  const map: Record<string, string> = {
    ServingNotice: styles.statusServingNotice,
    Submitted: styles.statusSubmitted,
    ManagerReview: styles.statusManagerReview,
    HRReview: styles.statusHRReview,
    Draft: styles.statusDraft,
    Clearance: styles.statusClearance,
    Completed: styles.statusCompleted,
    Accepted: styles.statusAccepted,
    Handover: styles.statusHandover,
    FinalPayroll: styles.statusFinalPayroll,
    Exception: styles.statusException,
    Cancelled: styles.statusCancelled,
    Pending: styles.statusPending,
    Paid: styles.statusPaid,
    Approved: styles.statusApproved,
    NotStarted: styles.statusNotStarted,
    InProgress: styles.statusInProgress,
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

const matchesTab = (row: ResignationRecord, tab: (typeof STATUS_TABS)[number]) => {
  if (tab === 'All') return true;
  if (tab === 'Submitted') return row.status === 'Submitted' || row.status === 'Draft';
  if (tab === 'Notice Period') return row.status === 'Serving Notice';
  if (tab === 'Exceptions') return row.status === 'Exception' || row.status === 'Cancelled';
  return row.status === tab;
};

export default function ResignationManagementWorkspace({
  initialPeriod,
  initialResignationId,
  initialEmployeeCode,
  initialEmployeeId,
}: {
  initialPeriod?: string;
  initialResignationId?: string;
  initialEmployeeCode?: string;
  initialEmployeeId?: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<ResignationPayload | null>(null);
  const [period, setPeriod] = useState(initialPeriod || '');
  const [selectedId, setSelectedId] = useState<string | null>(initialResignationId || null);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>('All');
  const [detailTab, setDetailTab] = useState<(typeof DETAIL_TABS)[number]>('Overview');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [manager, setManager] = useState('all');
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
      const res = await fetch(`/api/hris/offboarding/resignation-management?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load resignations.');
      setPayload(data);
      setPeriod(data.period);
      setSelectedId(data.selectedId);
    } catch (err: any) {
      setError(err?.message || 'Unable to load resignations.');
    } finally {
      setLoading(false);
    }
  }, [period, selectedId, initialEmployeeCode, initialEmployeeId]);

  useEffect(() => {
    void load(initialPeriod || undefined, initialResignationId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProfile = (row: ResignationRecord) => {
    router.push(resignationProfileHref(row));
  };

  const rows = useMemo(() => {
    const list = payload?.resignations || [];
    return list.filter((row) => {
      if (!matchesTab(row, tab)) return false;
      if (department !== 'all' && row.department !== department) return false;
      if (manager !== 'all' && row.managerName !== manager) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob = `${row.employeeName} ${row.employeeCode} ${row.department}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [payload?.resignations, tab, department, manager, statusFilter, search]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || payload?.selected || rows[0] || null,
    [rows, selectedId, payload?.selected],
  );

  const runAction = async (action: string, patch?: Partial<ResignationRecord>) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hris/offboarding/resignation-management', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, action, comment, patch }),
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
    window.location.href = `/api/hris/offboarding/resignation-management?period=${encodeURIComponent(p)}&format=csv`;
  };

  return (
    <div className={styles.root}>
      <div className={styles.crumb}>
        Offboarding <ChevronRight /> <b>Resignation Management</b>
      </div>

      <div className={styles.titleRow}>
        <div>
          <h1>Resignation Management</h1>
          <p>Standard offboarding starts here: resignation → notice → clearance → final payroll.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => void load(period || undefined, selectedId)}>
            {payload?.periodLabel || period || 'Period'}
          </button>
          <button type="button" onClick={exportCsv}>
            <Download /> Export
          </button>
          <Link className={`${styles.btn} ${styles.primary}`} href="/hris/offboarding/resignation-management/new">
            <Plus /> New Resignation
          </Link>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.kpis}>
        {(payload?.kpis || []).map((kpi: ResignationKpi) => {
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
        {STATUS_TABS.map((item) => {
          const count = payload?.tabCounts?.[item] || 0;
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
          <h2>Resignation Register</h2>
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
            <select value={manager} onChange={(event) => setManager(event.target.value)}>
              <option value="all">Manager</option>
              {(payload?.filterOptions.managers || []).map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Status</option>
              {(payload?.filterOptions.statuses || []).map((item: ResignationStatus) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading resignation register…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            No resignations for this period. Create one with <b>New Resignation</b>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {['Employee', 'Employee ID', 'Department', 'Position', 'Resignation Date', 'Last Working Day', 'Notice Period', 'Notice Served', 'Clearance', 'Final Payroll', 'Status', 'Actions'].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selectedRow = selected?.id === row.id;
                return (
                  <tr
                    key={row.id}
                    className={selectedRow ? styles.sel : undefined}
                    onClick={() => {
                      setSelectedId(row.id);
                      setDetailTab('Overview');
                    }}
                    onDoubleClick={() => openProfile(row)}
                  >
                    <td>
                      <div className={styles.personCell}>
                        <span className={styles.avatar}>{initials(row.employeeName)}</span>
                        {row.employeeName}
                      </div>
                    </td>
                    <td>{row.employeeCode}</td>
                    <td>{row.department}</td>
                    <td>{row.position}</td>
                    <td>{formatResignationDate(row.resignationDate)}</td>
                    <td>{formatResignationDate(row.lastWorkingDay)}</td>
                    <td>{formatNoticeMonths(row.noticePeriodDays)}</td>
                    <td>{formatNoticeMonths(row.noticeServedDays)}</td>
                    <td><span className={statusClass(row.clearancePct >= 100 ? 'Completed' : row.clearancePct > 0 ? 'In Progress' : 'Not Started')}>{row.clearancePct}%</span></td>
                    <td><span className={statusClass(row.finalPayrollStatus)}>{row.finalPayrollStatus}</span></td>
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
        <section className={`${styles.card} ${styles.workspace}`}>
          <aside className={styles.profilePanel}>
            <div className={styles.bigAvatar}>{initials(selected.employeeName)}</div>
            <h2>{selected.employeeName}</h2>
            <b>{selected.employeeCode}</b>
            <p><span className={statusClass(selected.status)}>{selected.status}</span></p>
            <div className={styles.linkRow}>
              <button type="button" className={styles.btn} onClick={() => openProfile(selected)}>
                <ExternalLink size={14} /> Open Profile
              </button>
              <Link
                className={styles.btn}
                href={`/hris/employees/employee-exit-status?employeeId=${encodeURIComponent(selected.employeeId || selected.employeeCode)}`}
              >
                Exit Status
              </Link>
              {resignationReadyForFinalPayroll(selected) ? (
                <Link className={`${styles.btn} ${styles.primary}`} href={resignationFinalPayrollHref(selected)}>
                  Open Final Payroll
                </Link>
              ) : selected.status === 'Clearance' || selected.status === 'Handover' ? (
                <Link
                  className={`${styles.btn} ${styles.primary}`}
                  href={
                    selected.status === 'Handover'
                      ? resignationHandoverHref(selected)
                      : resignationExitClearanceHref(selected)
                  }
                >
                  {selected.status === 'Handover' ? 'Open Handover' : 'Open Clearance'}
                </Link>
              ) : (
                <span className={styles.status} title="Complete clearance first (standard flow)">
                  Final Payroll after Clearance
                </span>
              )}
              <Link className={styles.btn} href={resignationHandoverHref(selected)}>Handover</Link>
              <Link className={styles.btn} href={resignationExitClearanceHref(selected)}>Clearance</Link>
              <Link className={styles.btn} href={resignationAssetReturnHref(selected)}>Assets</Link>
            </div>
            <div className={styles.detailGrid}>
              {[
                ['Department', selected.department],
                ['Position', selected.position],
                ['Employment Type', selected.employmentType],
                ['Grade / Level', selected.grade || '—'],
                ['Date of Joining', formatResignationDate(selected.dateOfJoining)],
                ['Resignation Date', formatResignationDate(selected.resignationDate)],
                ['Last Working Day', formatResignationDate(selected.lastWorkingDay)],
                ['Notice Requirement', `${formatNoticeMonths(selected.noticePeriodDays)} (${selected.noticePeriodDays} days)`],
                ['Notice Served', `${formatNoticeMonths(selected.noticeServedDays)} (${selected.noticeServedDays} days)`],
                ['Manager', selected.managerName],
                ['HR Reviewer', selected.hrReviewer],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          </aside>

          <div className={styles.workspaceMain}>
            <div className={styles.innerTabs}>
              {DETAIL_TABS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={detailTab === item ? styles.active : undefined}
                  onClick={() => setDetailTab(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className={styles.summary}>
              {[
                ['Notice Requirement', `${selected.noticePeriodDays} Days`],
                ['Notice Served', `${selected.noticeServedDays} Days`],
                ['Notice Balance', `${noticeBalanceDays(selected)} Days`],
                ['Notice Status', noticeStatusLabel(selected)],
              ].map(([label, value]) => (
                <div className={styles.mini} key={label}>
                  <label>{label}</label>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            <div className={styles.three}>
              <div className={`${styles.card} ${styles.box}`}>
                <h3>Reason for Leaving</h3>
                <p>{selected.reasonForLeaving || '—'}</p>
                <h3>Additional Remarks</h3>
                <p>{selected.remarks || '—'}</p>
                <h3>HR Acceptance</h3>
                <div className={styles.line}>
                  <span className={statusClass(selected.managementAcceptance)}>{selected.managementAcceptance}</span>
                  <b>{formatResignationDate(selected.managementAcceptedAt)}</b>
                </div>
              </div>

              <div className={`${styles.card} ${styles.box}`}>
                <h3>Progress Overview</h3>
                {(selected.progress || []).map((item) => {
                  const href = item.id === 'handover'
                    ? resignationHandoverHref(selected)
                    : item.id === 'clearance'
                      ? resignationExitClearanceHref(selected)
                      : item.id === 'asset'
                        ? resignationAssetReturnHref(selected)
                        : item.id === 'payroll'
                          ? resignationFinalPayrollHref(selected)
                          : null;
                  return (
                    <div className={styles.line} key={item.id}>
                      {href ? (
                        <Link href={href}>{item.label}</Link>
                      ) : (
                        <span>{item.label}</span>
                      )}
                      <span className={statusClass(item.status)}>{item.status}</span>
                    </div>
                  );
                })}
              </div>

              <div className={`${styles.card} ${styles.box} ${styles.timeline}`}>
                <h3>Resignation Workflow</h3>
                {(selected.workflow || []).map((stage, index) => (
                  <div className={styles.line} key={stage.id}>
                    <b>{index + 1}</b>
                    <span>{stage.label}</span>
                    <span className={statusClass(stage.status)}>{stage.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {(detailTab === 'Handover' || detailTab === 'Clearance' || detailTab === 'Final Payroll') ? (
              <div className={styles.empty}>
                {detailTab === 'Handover' ? (
                  <>
                    Manage tasks in the dedicated module.{' '}
                    <Link href={resignationHandoverHref(selected)}>Open Handover Checklist →</Link>
                  </>
                ) : detailTab === 'Clearance' ? (
                  <>
                    Track department clearances and assets.{' '}
                    <Link href={resignationExitClearanceHref(selected)}>Open Exit Clearance →</Link>
                    {' · '}
                    <Link href={resignationAssetReturnHref(selected)}>Asset Return →</Link>
                  </>
                ) : (
                  <>
                    Calculate final settlement after clearance.{' '}
                    {resignationReadyForFinalPayroll(selected) ? (
                      <Link href={resignationFinalPayrollHref(selected)}>Open Final Payroll →</Link>
                    ) : (
                      <span>Complete Exit Clearance first.</span>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {(detailTab === 'Audit Trail' || detailTab === 'Documents' || detailTab === 'Exit Interview') ? (
              <div className={styles.empty}>
                {detailTab === 'Audit Trail'
                  ? `Updated ${formatResignationDate(selected.updatedAt)} by ${selected.updatedBy}. Reference ${selected.referenceNumber}.`
                  : `${detailTab} will attach from Employee Documents when available.`}
              </div>
            ) : null}

            <div className={styles.footerActions}>
              <textarea
                className={styles.textarea}
                style={{ flex: 1, minWidth: 220 }}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add a comment or note..."
              />
              <button type="button" className={styles.danger} disabled={busy} onClick={() => void runAction('cancel')}>
                Cancel Resignation
              </button>
              {selected.managementAcceptance === 'Pending' && ['HR Review', 'Submitted', 'Manager Review'].includes(selected.status) ? (
                <button type="button" disabled={busy} onClick={() => void runAction('accept')}>
                  Accept Resignation (HR)
                </button>
              ) : null}
              {resignationReadyForFinalPayroll(selected) ? (
                <Link className={`${styles.btn} ${styles.primary}`} href={resignationFinalPayrollHref(selected)}>
                  Proceed to Final Payroll →
                </Link>
              ) : selected.status === 'Handover' ? (
                <Link className={`${styles.btn} ${styles.primary}`} href={resignationHandoverHref(selected)}>
                  Open Handover Checklist →
                </Link>
              ) : selected.status === 'Clearance' ? (
                <Link className={`${styles.btn} ${styles.primary}`} href={resignationExitClearanceHref(selected)}>
                  Open Exit Clearance →
                </Link>
              ) : (
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void runAction('next')}>
                  Next Step →
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
