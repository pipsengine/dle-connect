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
  FileText,
  Filter,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import type {
  ClearanceItemState,
  ClearanceSection,
  ExitClearanceCase,
  ExitClearanceCaseStatus,
  ExitClearancePayload,
  OffboardingModuleKpi,
} from '@/lib/exit-clearance-shared';
import {
  CLEARANCE_DOC_NO,
  CLEARANCE_DOC_REV,
  CLEARANCE_DOC_TITLE,
  deriveSectionStatus,
  exitClearanceAssetHref,
  exitClearanceFinalPayrollHref,
  exitClearanceHandoverHref,
  exitClearanceResignationHref,
  formatExitClearanceDate,
} from '@/lib/exit-clearance-shared';
import formStyles from '@/styles/exit-clearance-form.module.css';
import styles from '@/styles/resignation-management.module.css';

const KPI_ICONS = {
  total: Users,
  pending: Clock3,
  progress: ClipboardCheck,
  done: CheckCircle2,
  blocked: Clock3,
  ready: CheckCircle2,
} as const;

const STATUS_TABS = ['All', 'Not Started', 'In Progress', 'Completed', 'Blocked'] as const;
const ITEM_STATES: ClearanceItemState[] = ['Pending', 'Done', 'N/A', 'Outstanding'];

type SearchHit = {
  employeeCode: string;
  employeeName: string;
  department: string;
  employeeId?: string;
};

const statusClass = (value: string) => {
  const key = value.replace(/\s+/g, '').replace(/\//g, '');
  const map: Record<string, string> = {
    NotStarted: styles.statusNotStarted,
    InProgress: styles.statusInProgress,
    Completed: styles.statusCompleted,
    Cleared: styles.statusCompleted,
    Blocked: styles.statusException,
    Pending: styles.statusPending,
    Done: styles.statusCompleted,
    Outstanding: styles.statusException,
    NA: styles.statusAccepted,
    NotRequested: styles.statusNotStarted,
    AwaitingApproval: styles.statusPending,
    Approved: styles.statusCompleted,
    Rejected: styles.statusException,
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

export default function ExitClearanceWorkspace({
  initialPeriod,
  initialId,
  initialEmployeeCode,
  initialEmployeeId,
  initialOpenForm = false,
  initialSectionId,
}: {
  initialPeriod?: string;
  initialId?: string;
  initialEmployeeCode?: string;
  initialEmployeeId?: string;
  initialOpenForm?: boolean;
  initialSectionId?: string;
}) {
  const [payload, setPayload] = useState<ExitClearancePayload | null>(null);
  const [period, setPeriod] = useState(initialPeriod || '');
  const [selectedId, setSelectedId] = useState<string | null>(initialId || null);
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>('All');
  const [search, setSearch] = useState('');
  const [openQuery, setOpenQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [department, setDepartment] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExitClearanceCase | null>(null);

  const [rejectReason, setRejectReason] = useState('');
  const [focusSectionId, setFocusSectionId] = useState<string | null>(initialSectionId || null);

  const load = useCallback(async (nextPeriod?: string, nextId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextPeriod || period) params.set('period', nextPeriod || period);
      if (nextId || selectedId) params.set('id', String(nextId || selectedId));
      if (initialEmployeeCode) params.set('employeeCode', initialEmployeeCode);
      if (initialEmployeeId) params.set('employeeId', initialEmployeeId);
      const res = await fetch(`/api/hris/offboarding/exit-clearance?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to load exit clearance.');
      setPayload(data);
      setPeriod(data.period);
      setSelectedId(data.selectedId);
      if (data.selected) setDraft(structuredClone(data.selected));
    } catch (err: any) {
      setError(err?.message || 'Unable to load exit clearance.');
    } finally {
      setLoading(false);
    }
  }, [period, selectedId, initialEmployeeCode, initialEmployeeId]);

  useEffect(() => {
    void load(initialPeriod || undefined, initialId || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pickerOpen || openQuery.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hris/offboarding/exit-clearance?q=${encodeURIComponent(openQuery.trim())}`, { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && data.ok) setHits(data.results || []);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [openQuery, pickerOpen]);

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

  const isHrMode = payload?.accessMode !== 'line-manager';
  const viewerName = (payload?.viewerName || '').trim().toLowerCase();
  const isMySection = (section: ClearanceSection) => {
    if (isHrMode) return true;
    const assignee = (section.assigneeName || '').trim().toLowerCase();
    return Boolean(viewerName && assignee && viewerName === assignee);
  };

  const openForm = (row: ExitClearanceCase, options?: { resolveAssignees?: boolean }) => {
    setDraft(structuredClone(row));
    setSelectedId(row.id);
    setModalOpen(true);
    setPickerOpen(false);
    setError(null);
    setRejectReason('');
    const shouldResolve = isHrMode && options?.resolveAssignees !== false;
    if (shouldResolve) {
      void (async () => {
        setBusy(true);
        try {
          const res = await fetch('/api/hris/offboarding/exit-clearance', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: row.id, action: 'resolve_assignees' }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to resolve department line managers.');
          setPayload(data);
          setSelectedId(data.selectedId);
          setDraft(data.selected || data.case || null);
        } catch (err: any) {
          setError(err?.message || 'Unable to resolve department line managers from HRIS.');
        } finally {
          setBusy(false);
        }
      })();
    }
  };

  useEffect(() => {
    if (!initialOpenForm || loading || !payload) return;
    const hit = (payload.cases || []).find((row) => row.id === initialId)
      || payload.selected
      || (initialEmployeeCode
        ? payload.cases.find((row) => row.employeeCode.toUpperCase() === initialEmployeeCode.toUpperCase())
        : null);
    if (hit) {
      openForm(hit);
      if (initialSectionId) setFocusSectionId(initialSectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, payload?.selectedId, initialOpenForm]);

  const closeModal = () => {
    setModalOpen(false);
  };

  const openForEmployee = async (employeeCode: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hris/offboarding/exit-clearance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeCode, period: period || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to open clearance form.');
      setPayload(data);
      setPeriod(data.period);
      const row = data.selected || data.case;
      setSelectedId(data.selectedId || row?.id);
      if (row) openForm(row, { resolveAssignees: false });
      setHits([]);
      setOpenQuery('');
      setMessage(`Clearance form opened for ${row?.employeeName || employeeCode}.`);
    } catch (err: any) {
      setError(err?.message || 'Unable to open clearance form.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!initialEmployeeCode || loading) return;
    const existing = payload?.cases?.find((row) =>
      row.employeeCode.toUpperCase() === initialEmployeeCode.toUpperCase(),
    );
    if (existing) {
      openForm(existing);
      return;
    }
    void openForEmployee(initialEmployeeCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialEmployeeCode]);

  const patchServer = async (body: Record<string, unknown>) => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/hris/offboarding/exit-clearance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to save clearance form.');
      setPayload(data);
      setSelectedId(data.selectedId);
      setDraft(data.selected || data.case || null);
      setMessage('Clearance form saved.');
    } catch (err: any) {
      setError(err?.message || 'Unable to save clearance form.');
    } finally {
      setBusy(false);
    }
  };

  const updateItem = (sectionId: string, itemId: string, patch: Partial<ClearanceSection['items'][number]>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) => {
          if (section.id !== sectionId) return section;
          const items = section.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
          const next = { ...section, items };
          return { ...next, status: deriveSectionStatus(next) };
        }),
      };
    });
  };

  const updateSectionSign = (sectionId: string, field: 'signedBy' | 'signedAt', value: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) => {
          if (section.id !== sectionId) return section;
          const next = { ...section, [field]: value || null };
          return { ...next, status: deriveSectionStatus(next) };
        }),
      };
    });
  };

  const saveForm = async () => {
    if (!draft) return;
    await patchServer({
      action: 'save',
      dateOfExit: draft.dateOfExit,
      sections: draft.sections,
      hrFinal: draft.hrFinal,
      financeFinal: draft.financeFinal,
    });
  };

  const exportCsv = () => {
    const p = period || payload?.period;
    if (!p) return;
    window.location.href = `/api/hris/offboarding/exit-clearance?period=${encodeURIComponent(p)}&format=csv`;
  };

  useEffect(() => {
    if (!modalOpen || !focusSectionId) return;
    const handle = window.setTimeout(() => {
      document.getElementById(`clearance-section-${focusSectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(handle);
  }, [modalOpen, focusSectionId, draft?.id]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  return (
    <div className={styles.root}>
      <div className={styles.crumb}>
        Offboarding <ChevronRight /> <b>Exit Clearance</b>
      </div>

      <div className={styles.titleRow}>
        <div>
          <h1>{isHrMode ? 'Exit Clearance' : 'Exit Clearance Approvals'}</h1>
          <p>
            {isHrMode
              ? 'Official departmental clearance form (DL-HRD-F-030) — required before Final Payroll.'
              : 'Approve or reject clearance sections assigned to you as line manager.'}
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => void load(period || undefined, selectedId)}>
            {payload?.periodLabel || period || 'Period'}
          </button>
          {isHrMode ? (
            <>
              <button type="button" onClick={exportCsv}>
                <Download /> Export
              </button>
              <button type="button" className={styles.primary} onClick={() => { setPickerOpen(true); setOpenQuery(''); setHits([]); }}>
                <Plus /> Open Clearance Form
              </button>
              <Link className={styles.btn} href="/hris/offboarding/resignation-management">
                Resignation Register
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p style={{ color: '#0f7a3c', fontWeight: 600 }}>{message}</p> : null}

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
          <h2>Clearance Register</h2>
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
              {(payload?.filterOptions.statuses || []).map((item: ExitClearanceCaseStatus) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading clearance register…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>
            {isHrMode ? (
              <>
                No clearance forms for this period.{' '}
                <button type="button" className={styles.btn} onClick={() => setPickerOpen(true)}>
                  <FileText size={14} /> Open Clearance Form
                </button>
                {' '}or progress a resignation via the{' '}
                <Link href="/hris/offboarding/resignation-management">Resignation Register</Link>.
              </>
            ) : (
              <>No clearance sections are currently assigned to you for approval.</>
            )}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {['Employee', 'Employee ID', 'Department', 'Date of Exit', 'Form %', 'Ready for Payroll', 'Status', 'Actions'].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={selectedId === row.id ? styles.sel : undefined}
                  onClick={() => setSelectedId(row.id)}
                  onDoubleClick={() => openForm(row)}
                >
                  <td>
                    <div className={styles.personCell}>
                      <span className={styles.avatar}>{initials(row.employeeName)}</span>
                      {row.employeeName}
                    </div>
                  </td>
                  <td>{row.employeeCode}</td>
                  <td>{row.department}</td>
                  <td>{formatExitClearanceDate(row.dateOfExit || row.lastWorkingDay)}</td>
                  <td><span className={statusClass(row.completionPct >= 100 ? 'Completed' : 'In Progress')}>{row.completionPct}%</span></td>
                  <td><span className={statusClass(row.readyForFinalPayroll ? 'Completed' : 'Pending')}>{row.readyForFinalPayroll ? 'Yes' : 'No'}</span></td>
                  <td><span className={statusClass(row.status)}>{row.status}</span></td>
                  <td>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.primary}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openForm(row);
                      }}
                    >
                      <FileText size={14} /> Open Form
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Employee picker modal */}
      {pickerOpen ? (
        <div
          className={formStyles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Open clearance form"
          onClick={() => setPickerOpen(false)}
        >
          <div className={formStyles.modalPanel} style={{ width: 'min(560px, 100%)', maxHeight: '70vh' }} onClick={(event) => event.stopPropagation()}>
            <div className={formStyles.modalHeader}>
              <div>
                <h2>Open Clearance Form</h2>
                <p>Search an employee with an active resignation to open DL-HRD-F-030.</p>
              </div>
              <button type="button" className={formStyles.modalClose} onClick={() => setPickerOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className={formStyles.modalBody} style={{ padding: 16 }}>
              <label className={styles.filters} style={{ display: 'block' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #cfe0f2', borderRadius: 8, padding: '0 10px', height: 40 }}>
                  <Search size={16} />
                  <input
                    style={{ border: 0, outline: 'none', flex: 1, height: '100%' }}
                    value={openQuery}
                    onChange={(event) => setOpenQuery(event.target.value)}
                    placeholder="Search by name, employee ID, or department..."
                    autoFocus
                    disabled={busy}
                  />
                </span>
              </label>
              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                {hits.map((hit) => (
                  <button
                    key={hit.employeeCode}
                    type="button"
                    className={styles.btn}
                    style={{ justifyContent: 'flex-start' }}
                    disabled={busy}
                    onClick={() => void openForEmployee(hit.employeeCode)}
                  >
                    <b>{hit.employeeName}</b> · {hit.employeeCode} · {hit.department}
                  </button>
                ))}
                {openQuery.trim().length >= 2 && hits.length === 0 ? (
                  <p className={styles.sub}>No employees found. Ensure a resignation exists for the employee.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* DL-HRD-F-030 clearance form modal */}
      {modalOpen && draft ? (
        <div
          className={formStyles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={CLEARANCE_DOC_TITLE}
          onClick={closeModal}
        >
          <div className={formStyles.modalPanel} onClick={(event) => event.stopPropagation()}>
            <div className={formStyles.modalHeader}>
              <div>
                <h2>{CLEARANCE_DOC_TITLE}</h2>
                <p>
                  {draft.employeeName} · {draft.employeeCode} · Doc. No. {draft.documentNumber || CLEARANCE_DOC_NO} Rev. {draft.documentRev || CLEARANCE_DOC_REV}
                </p>
              </div>
              <button type="button" className={formStyles.modalClose} onClick={closeModal} aria-label="Close form">
                <X size={18} />
              </button>
            </div>

            <div className={formStyles.modalBody}>
              <div className={formStyles.formShell}>
                <div className={formStyles.formBanner}>
                  <div>
                    <h2>{CLEARANCE_DOC_TITLE}</h2>
                    <p>
                      Staff to return the following items while the designated authorities take other appropriate actions.
                      (Tick / mark where applicable.)
                    </p>
                  </div>
                  <div className={formStyles.docMeta}>
                    <strong>Dorman Long Engineering Limited</strong>
                    Doc. No.: {draft.documentNumber || CLEARANCE_DOC_NO}<br />
                    Rev.: {draft.documentRev || CLEARANCE_DOC_REV}<br />
                    Reference: {draft.resignationReference || '—'}
                  </div>
                </div>

                <p className={formStyles.instruction}>
                  Supporting workbenches:{' '}
                  <Link href={exitClearanceHandoverHref(draft)}>Handover Checklist</Link>
                  {' · '}
                  <Link href={exitClearanceAssetHref(draft)}>Asset Return</Link>
                  {' · '}
                  <Link href={exitClearanceResignationHref(draft)}>Resignation Case</Link>
                </p>

                <div className={formStyles.headerGrid}>
                  <label>
                    Name of Staff
                    <span className={formStyles.readonly}>{draft.employeeName}</span>
                  </label>
                  <label>
                    Department
                    <span className={formStyles.readonly}>{draft.department}</span>
                  </label>
                  <label>
                    Date of Exit
                    <input
                      type="date"
                      value={(draft.dateOfExit || draft.lastWorkingDay || '').slice(0, 10)}
                      onChange={(event) => setDraft({ ...draft, dateOfExit: event.target.value || null })}
                    />
                  </label>
                  <label>
                    Employee ID
                    <span className={formStyles.readonly}>{draft.employeeCode}</span>
                  </label>
                  <label>
                    Position
                    <span className={formStyles.readonly}>{draft.position}</span>
                  </label>
                  <label>
                    Manager
                    <span className={formStyles.readonly}>{draft.managerName}</span>
                  </label>
                </div>

                <div className={formStyles.sections}>
                  {draft.sections.map((section) => {
                    const sectionStatus = deriveSectionStatus(section);
                    const focused = focusSectionId === section.id;
                    const mine = isMySection(section);
                    const sectionLocked = busy || section.approvalStatus === 'Approved' || (!isHrMode && !mine);
                    return (
                      <article
                        className={formStyles.sectionCard}
                        key={section.id}
                        style={focused ? { outline: '2px solid #0878ef', outlineOffset: 2 } : undefined}
                        id={`clearance-section-${section.id}`}
                      >
                        <div className={formStyles.sectionHead}>
                          <div>
                            <h3>{section.title}</h3>
                            <small>
                              {section.assigneeRole}
                              {section.subtitle ? ` · ${section.subtitle}` : ''}
                            </small>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <span className={statusClass(section.approvalStatus || 'Not Requested')}>
                              {section.approvalStatus || 'Not Requested'}
                            </span>
                            <span className={statusClass(sectionStatus)}>{sectionStatus}</span>
                          </div>
                        </div>
                        <div className={formStyles.signRow} style={{ borderTop: 0, background: '#fff' }}>
                          <label>
                            Line manager (auto from HRIS)
                            <input
                              readOnly
                              value={section.assigneeName || (busy ? 'Resolving from HRIS…' : 'Not found in HRIS')}
                              title="Automatically set from the department line manager in HRIS"
                            />
                          </label>
                          <label>
                            Approver email (auto)
                            <input
                              type="email"
                              readOnly
                              value={section.assigneeEmail || ''}
                              placeholder={busy ? 'Resolving…' : 'Not found in HRIS'}
                              title="Automatically set from the department line manager mailbox"
                            />
                          </label>
                        </div>
                        <ul className={formStyles.itemList}>
                          {section.items.map((item) => (
                            <li className={formStyles.itemRow} key={item.id}>
                              <div className={formStyles.itemLabel}>{item.label}</div>
                              <div className={formStyles.itemControls}>
                                <select
                                  value={item.state}
                                  disabled={sectionLocked}
                                  onChange={(event) =>
                                    updateItem(section.id, item.id, { state: event.target.value as ClearanceItemState })
                                  }
                                >
                                  {ITEM_STATES.map((state) => (
                                    <option key={state} value={state}>{state}</option>
                                  ))}
                                </select>
                                {item.input === 'detail' || item.state === 'Outstanding' ? (
                                  <input
                                    type="text"
                                    disabled={sectionLocked}
                                    placeholder={item.id.includes('loan') || item.id.includes('coop') ? 'State action to be taken' : 'Please specify'}
                                    value={item.detail || ''}
                                    onChange={(event) => updateItem(section.id, item.id, { detail: event.target.value })}
                                  />
                                ) : null}
                                {item.input === 'amount' ? (
                                  <input
                                    type="number"
                                    disabled={sectionLocked}
                                    placeholder="Amount"
                                    value={item.amount ?? ''}
                                    onChange={(event) =>
                                      updateItem(section.id, item.id, {
                                        amount: event.target.value === '' ? null : Number(event.target.value),
                                      })
                                    }
                                  />
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                        <div className={formStyles.signRow}>
                          <label>
                            Authorized signature
                            <input
                              disabled={sectionLocked}
                              value={section.signedBy || ''}
                              onChange={(event) => updateSectionSign(section.id, 'signedBy', event.target.value)}
                              placeholder="Full name of authorizing officer"
                            />
                          </label>
                          <label>
                            Date
                            <input
                              type="date"
                              disabled={sectionLocked}
                              value={(section.signedAt || '').slice(0, 10)}
                              onChange={(event) => updateSectionSign(section.id, 'signedAt', event.target.value)}
                            />
                          </label>
                          {mine ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className={`${styles.btn} ${styles.primary}`}
                              disabled={busy || section.approvalStatus === 'Approved'}
                              onClick={() =>
                                void patchServer({
                                  action: 'approve_section',
                                  sectionId: section.id,
                                  signedBy: section.signedBy,
                                  signedAt: section.signedAt,
                                  sections: draft.sections,
                                  dateOfExit: draft.dateOfExit,
                                })
                              }
                            >
                              Approve section
                            </button>
                            <button
                              type="button"
                              className={`${styles.btn} ${styles.danger}`}
                              disabled={busy || section.approvalStatus === 'Approved'}
                              onClick={() => {
                                const reason = rejectReason.trim() || window.prompt('Rejection reason') || '';
                                if (!reason.trim()) return;
                                void patchServer({
                                  action: 'reject_section',
                                  sectionId: section.id,
                                  rejectionReason: reason.trim(),
                                  signedBy: section.signedBy,
                                  signedAt: section.signedAt,
                                  sections: draft.sections,
                                  dateOfExit: draft.dateOfExit,
                                });
                              }}
                            >
                              Reject
                            </button>
                          </div>
                          ) : (
                            <p className={styles.sub} style={{ margin: 0, alignSelf: 'end' }}>
                              {isHrMode ? null : 'Assigned to another approver'}
                            </p>
                          )}
                        </div>
                        {section.rejectionReason ? (
                          <p className={styles.error} style={{ margin: '0 14px 12px' }}>
                            Rejected: {section.rejectionReason}
                          </p>
                        ) : null}
                        {section.lastNotifiedAt ? (
                          <p className={styles.sub} style={{ margin: '0 14px 12px' }}>
                            Last notified: {formatExitClearanceDate(section.lastNotifiedAt)}
                            {section.assigneeEmail ? ` → ${section.assigneeEmail}` : ''}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                <div className={formStyles.finalBlock}>
                  <h3>Final authorization</h3>
                  <div className={formStyles.finalGrid}>
                    <div className={formStyles.finalCard}>
                      <h4>HR Signature / Date</h4>
                      <label>
                        Signed by
                        <input
                          disabled={busy}
                          value={draft.hrFinal?.signedBy || ''}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              hrFinal: { signedBy: event.target.value || null, signedAt: draft.hrFinal?.signedAt || null },
                            })
                          }
                          placeholder="HR authorizing officer"
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          disabled={busy}
                          value={(draft.hrFinal?.signedAt || '').slice(0, 10)}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              hrFinal: { signedBy: draft.hrFinal?.signedBy || null, signedAt: event.target.value || null },
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className={formStyles.finalCard}>
                      <h4>Finance Signature / Date</h4>
                      <label>
                        Signed by
                        <input
                          disabled={busy}
                          value={draft.financeFinal?.signedBy || ''}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              financeFinal: {
                                signedBy: event.target.value || null,
                                signedAt: draft.financeFinal?.signedAt || null,
                              },
                            })
                          }
                          placeholder="Finance authorizing officer"
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          disabled={busy}
                          value={(draft.financeFinal?.signedAt || '').slice(0, 10)}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              financeFinal: {
                                signedBy: draft.financeFinal?.signedBy || null,
                                signedAt: event.target.value || null,
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className={`${formStyles.readyBanner} ${draft.readyForFinalPayroll ? formStyles.readyYes : formStyles.readyNo}`}>
                  {draft.readyForFinalPayroll
                    ? 'Clearance form complete — ready for Final Payroll.'
                    : 'Final Payroll locked until all sections are Cleared and HR + Finance have signed.'}
                </div>
              </div>
            </div>

            <div className={formStyles.modalFooter}>
              {isHrMode ? (
                <Link className={styles.btn} href={exitClearanceResignationHref(draft)}>
                  <ExternalLink size={14} /> Resignation
                </Link>
              ) : null}
              <button type="button" className={styles.btn} onClick={closeModal}>Close</button>
              {isHrMode ? (
                <>
                  <button type="button" disabled={busy} onClick={() => void saveForm()}>
                    Save Clearance Form
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() =>
                      void patchServer({
                        action: 'request_approvals',
                        sections: draft.sections,
                        dateOfExit: draft.dateOfExit,
                        hrFinal: draft.hrFinal,
                        financeFinal: draft.financeFinal,
                      }).then(() => {
                        setMessage('Approval requests sent to each department line manager.');
                      })
                    }
                  >
                    Request Department Approvals
                  </button>
                  {draft.readyForFinalPayroll ? (
                    <Link className={`${styles.btn} ${styles.primary}`} href={exitClearanceFinalPayrollHref(draft)}>
                      Proceed to Final Payroll →
                    </Link>
                  ) : (
                    <button type="button" className={styles.btn} disabled>
                      Final Payroll locked
                    </button>
                  )}
                </>
              ) : (
                <p className={styles.sub} style={{ margin: 0 }}>
                  Use Approve / Reject on your assigned section above.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
