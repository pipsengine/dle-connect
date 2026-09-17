'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Filter,
  Info,
  ListChecks,
  MessageSquare,
  Plus,
  RotateCcw,
  Route,
  Send,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  INTERNSHIP_HR_ACTIONS,
  internshipEssHref,
  internshipReviewHref,
  parseInternshipReviewRoute,
} from '@/lib/internship-performance-review-constants';
import type {
  InternshipEligibleIntern,
  InternshipReview,
  InternshipReviewSettings,
} from '@/lib/internship-performance-review-types';
import { formatInternshipOverallScore } from '@/lib/internship-performance-review-workflow';
import './internship-review.css';
import InternshipKpiCard from './KpiCard';
import InternshipReviewShell from './Shell';
import InternshipStatusBadge from './StatusBadge';
import InternshipWorkflowStepper from './WorkflowStepper';

type Workspace = {
  reviews: InternshipReview[];
  settings: InternshipReviewSettings;
  eligibleInterns: InternshipEligibleIntern[];
  kpis: { open: number; awaiting: number; approvedMonth: number; recommendedPct: number; returned: number };
  analytics: {
    ytd: number;
    completed: number;
    recommendedPct: number;
    averageScore: number;
    recommendations: { placement: number; extend: number; notRecommended: number };
    departments: Array<{ name: string; count: number; pct: number }>;
    turnaround: Array<{ stage: string; days: string }>;
  };
  tasks: InternshipReview[];
  review: InternshipReview | null;
  actor: { fullName: string; role: string };
};

type ApiResponse<T> = { status: 'success' | 'error'; data?: T; error?: string };
type ModalKind = 'initiate' | 'detail' | 'hr-action' | 'settings' | null;

const initials = (name: string) =>
  name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const formatDay = (value?: string) => {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const plusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

async function readJson<T>(res: Response): Promise<ApiResponse<T>> {
  const text = await res.text();
  if (!text.trim()) return { status: 'error', error: `Empty response (${res.status})` };
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return { status: 'error', error: text.slice(0, 200) };
  }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modalScrim" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modalCard" onClick={(event) => event.stopPropagation()}>
        <div className="pageHead" style={{ padding: '18px 22px 0', marginBottom: 0 }}>
          <div>
            <span className="eyebrow">HRIS FORM</span>
            <h1 style={{ fontSize: 22 }}>{title}</h1>
          </div>
          <button type="button" className="secondary" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InternSearchSelect({
  interns,
  value,
  onChange,
}: {
  interns: InternshipEligibleIntern[];
  value: string;
  onChange: (code: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = interns.find((item) => item.code === value) || null;
  const needle = query.trim().toLowerCase();
  const filtered = interns.filter((item) => {
    if (!needle) return true;
    const haystack = `${item.code} ${item.name} ${item.department} ${item.jobTitle}`.toLowerCase();
    return haystack.includes(needle);
  });

  const place = useCallback(() => {
    const node = inputRef.current;
    if (!node) return;
    const next = node.getBoundingClientRect();
    setRect({ top: next.bottom + 4, left: next.left, width: Math.max(next.width, 320) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (wrapRef.current?.contains(target)) return;
      if ((event.target as HTMLElement | null)?.closest('[data-ipr-combo-list]')) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  const list = open && rect && typeof document !== 'undefined'
    ? createPortal(
      <div
        data-ipr-combo-list="true"
        className="ipr-combo-portal"
        style={{ top: rect.top, left: rect.left, width: rect.width }}
      >
        {filtered.map((item) => (
          <button
            type="button"
            key={item.code}
            data-active={item.code === value ? 'true' : 'false'}
            onClick={() => {
              onChange(item.code);
              setQuery('');
              setOpen(false);
            }}
          >
            <b>{item.code}</b> — {item.name}
            <small>{item.department} · {item.eligible ? 'Eligible' : `Below eligibility (${item.monthsCompleted} months) — bypass available`}</small>
          </button>
        ))}
        {!filtered.length ? <p>No matching interns in the live directory.</p> : null}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="combo" ref={wrapRef}>
      <input
        ref={inputRef}
        value={open ? query : (selected ? `${selected.code} — ${selected.name}` : query)}
        placeholder="Search intern by employee code or name..."
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setQuery('');
          place();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          place();
        }}
      />
      {list}
    </div>
  );
}

export default function InternshipPerformanceReviewView({ route }: { route: string }) {
  const parsed = parseInternshipReviewRoute(route);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [activeId, setActiveId] = useState('');
  const reviewId = 'id' in parsed ? parsed.id : '';

  const load = useCallback(async () => {
    setError('');
    const res = await fetch(`/api/hris/performance-management/internship-reviews${reviewId ? `?id=${encodeURIComponent(reviewId)}` : ''}`, { cache: 'no-store' });
    const json = await readJson<Workspace>(res);
    if (json.status !== 'success' || !json.data) throw new Error(json.error || 'Unable to load internship reviews.');
    setWorkspace(json.data);
  }, [reviewId]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load internship reviews.'));
  }, [load]);

  useEffect(() => {
    if (parsed.kind === 'new') setModal('initiate');
    else if (parsed.kind === 'settings') setModal('settings');
    else if (parsed.kind === 'hr-action' && reviewId) {
      setActiveId(reviewId);
      setModal('hr-action');
    } else if ((parsed.kind === 'detail' || parsed.kind === 'evaluate' || parsed.kind === 'approve') && reviewId) {
      setActiveId(reviewId);
      setModal('detail');
    }
  }, [parsed.kind, reviewId]);

  const closeModal = () => {
    setModal(null);
    setActiveId('');
    if (!['dashboard', 'register', 'reports', 'none'].includes(parsed.kind)) {
      router.replace(internshipReviewHref());
    }
  };

  const run = async (action: string, payload: Record<string, unknown> = {}, id = activeId || reviewId) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/hris/performance-management/internship-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, payload }),
      });
      const json = await readJson<{ workspace?: Workspace; review?: InternshipReview }>(res);
      if (json.status !== 'success') throw new Error(json.error || 'Action failed.');
      if (json.data?.workspace) setWorkspace(json.data.workspace);
      else await load();
      return json.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete this action.';
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  if (!workspace && !error) {
    return <div className="dle-ipr"><p style={{ padding: 24 }}>Loading internship performance review…</p></div>;
  }

  const review = (activeId || reviewId)
    ? workspace?.reviews.find((item) => item.id === (activeId || reviewId)) || workspace?.review || null
    : null;

  const tabHref = parsed.kind === 'reports' ? 'reports' : parsed.kind === 'register' ? 'register' : '';

  return (
    <div className="dle-ipr">
      {error ? <div className="notice" style={{ margin: '0 0 16px' }}><AlertTriangle /><div><b>Unable to complete action</b><span>{error}</span></div></div> : null}
      <InternshipReviewShell
        activeHref={tabHref}
        onInitiate={() => setModal('initiate')}
        onSettings={() => setModal('settings')}
      >
        {parsed.kind === 'reports' ? (
          <ReportsScreen workspace={workspace} />
        ) : (
          <DashboardScreen
            workspace={workspace}
            mode={parsed.kind === 'register' ? 'register' : 'overview'}
            essNotice={parsed.kind === 'evaluate' || parsed.kind === 'approve' || parsed.kind === 'tasks'}
            onInitiate={() => setModal('initiate')}
            onOpen={(item) => {
              setActiveId(item.id);
              setModal(item.status === 'Approved' ? 'hr-action' : 'detail');
            }}
          />
        )}
      </InternshipReviewShell>
      {modal === 'initiate' ? (
        <Modal title="Initiate internship review" onClose={closeModal}>
          <InitiateForm workspace={workspace} busy={busy} onInitiate={run} onDone={closeModal} />
        </Modal>
      ) : null}
      {modal === 'settings' ? (
        <Modal title="Internship review configuration" onClose={closeModal}>
          <SettingsForm workspace={workspace} busy={busy} onSave={run} onDone={closeModal} />
        </Modal>
      ) : null}
      {modal === 'detail' && review ? (
        <Modal title={review.employee.name} onClose={closeModal}>
          <DetailBody
            review={review}
            onHrAction={() => setModal('hr-action')}
          />
        </Modal>
      ) : null}
      {modal === 'hr-action' && review ? (
        <Modal title="HR next action" onClose={closeModal}>
          <HrActionForm review={review} busy={busy} onSave={run} onDone={closeModal} />
        </Modal>
      ) : null}
    </div>
  );
}

function DashboardScreen({
  workspace,
  mode,
  essNotice,
  onInitiate,
  onOpen,
}: {
  workspace: Workspace | null;
  mode: 'overview' | 'register';
  essNotice?: boolean;
  onInitiate: () => void;
  onOpen: (review: InternshipReview) => void;
}) {
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All departments');
  const [status, setStatus] = useState('All statuses');
  const reviews = workspace?.reviews || [];
  const departments = Array.from(new Set(reviews.map((review) => review.employee.department))).sort();
  const statuses = Array.from(new Set(reviews.map((review) => review.status)));
  const filtered = reviews.filter((review) => {
    const haystack = `${review.id} ${review.employee.name} ${review.employee.code} ${review.employee.department}`.toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (department !== 'All departments' && review.employee.department !== department) return false;
    if (status !== 'All statuses' && review.status !== status) return false;
    return true;
  });
  const exportCsv = () => {
    const rows = [['Review ID', 'Intern', 'Code', 'Department', 'Line manager', 'Due date', 'Status', 'Score'], ...filtered.map((review) => [review.id, review.employee.name, review.employee.code, review.employee.department, review.supervisor, review.dueDate, review.status, review.overall ? formatInternshipOverallScore(review.overall, '') : ''])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'internship-performance-reviews.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="page">
      {mode === 'overview' ? (
        <>
          <div className="pageHead">
            <div>
              <span className="eyebrow">INTERNSHIP PERFORMANCE REVIEW</span>
              <h1>Performance review dashboard</h1>
              <p>HR initiates here. Line managers evaluate and approvers decide in the ESS portal.</p>
            </div>
            <button type="button" className="primary" onClick={onInitiate}><Plus size={17} />Initiate review</button>
          </div>
          {essNotice ? (
            <div className="notice">
              <Info />
              <div>
                <b>Evaluation and approval moved to ESS</b>
                <span>Line managers, HODs, the HR Manager and the MD complete assigned internship tasks in Workforce Portal → Performance → Internship Performance Review.</span>
              </div>
            </div>
          ) : null}
          <div className="kpis">
            <InternshipKpiCard label="Open reviews" value={workspace?.kpis.open ?? 0} sub="Across all departments" Icon={ClipboardCheck} />
            <InternshipKpiCard label="Awaiting approval" value={workspace?.kpis.awaiting ?? 0} sub="Require ESS approval" Icon={Clock3} />
            <InternshipKpiCard label="Approved this month" value={workspace?.kpis.approvedMonth ?? 0} sub={`${workspace?.kpis.recommendedPct ?? 0}% recommended`} Icon={CheckCircle2} />
            <InternshipKpiCard label="Returned / action" value={workspace?.kpis.returned ?? 0} sub="Needs follow-up" Icon={RotateCcw} />
          </div>
        </>
      ) : (
        <div className="pageHead">
          <div>
            <span className="eyebrow">REVIEW REGISTER</span>
            <h1>Internship review register</h1>
            <p>Live internship assessments. Empty until HR initiates a review.</p>
          </div>
          <button type="button" className="primary" onClick={onInitiate}><Plus size={17} />Initiate review</button>
        </div>
      )}
      {(mode === 'register' || mode === 'overview') ? (
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Review register</h2>
              <p>Live internship assessments. Empty until HR initiates a review.</p>
            </div>
            <div className="row">
              <button type="button" className="secondary"><Filter size={15} />Filter</button>
              <button type="button" className="secondary" onClick={exportCsv}><Download size={15} />Export</button>
            </div>
          </div>
          <div className="filters">
            <input placeholder="Search intern, employee code or department..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option>All departments</option>
              {departments.map((item) => <option key={item}>{item}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>All statuses</option>
              {statuses.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Review ID</th>
                  <th>Intern</th>
                  <th>Department</th>
                  <th>Line manager</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((review) => (
                  <tr key={review.id}>
                    <td><b>{review.id}</b></td>
                    <td>
                      <div className="person">
                        <span>{initials(review.employee.name)}</span>
                        <div>
                          <b>{review.employee.name}</b>
                          <small>{review.employee.code}{review.eligibilityBypassed ? ' · Eligibility bypassed' : ''}</small>
                        </div>
                      </div>
                    </td>
                    <td>{review.employee.department}</td>
                    <td>{review.supervisor}</td>
                    <td>{formatDay(review.dueDate)}</td>
                    <td><InternshipStatusBadge status={review.status} /></td>
                    <td><b>{review.overall ? formatInternshipOverallScore(review.overall, '—') : '—'}</b></td>
                    <td>
                      <button type="button" className="view" onClick={() => onOpen(review)}>
                        {review.status === 'Approved' ? 'HR action' : 'Open'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty">
                        <FileText />
                        <b>No internship reviews yet</b>
                        <p>Initiate a review from the live intern directory. Mock records are not used.</p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function InitiateForm({
  workspace,
  busy,
  onInitiate,
  onDone,
}: {
  workspace: Workspace | null;
  busy: boolean;
  onInitiate: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
  onDone: () => void;
}) {
  const [code, setCode] = useState('');
  const [dueDate, setDueDate] = useState(plusDays(7));
  const [instructions, setInstructions] = useState('');
  const [notifyManager, setNotifyManager] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [bypassEligibility, setBypassEligibility] = useState(false);
  const [formError, setFormError] = useState('');
  const intern = workspace?.eligibleInterns.find((item) => item.code === code) || null;
  const requiredMonths = workspace?.settings.eligibilityMonths ?? 12;
  const needsBypass = Boolean(intern && !intern.eligible);

  const submit = async () => {
    setFormError('');
    if (!intern) {
      setFormError('Search and select an intern from the live directory before initiating.');
      return;
    }
    if (needsBypass && !bypassEligibility) {
      setFormError(
        `This intern has completed ${intern.monthsCompleted} month(s). Standard eligibility is ${requiredMonths} months. Tick “Bypass eligibility and initiate anyway” to continue.`,
      );
      return;
    }
    try {
      await onInitiate('initiate', {
        employeeCode: code,
        dueDate,
        instructions,
        notifyManager,
        reminders,
        bypassEligibility: needsBypass && bypassEligibility,
      });
      onDone();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to initiate this internship review.');
    }
  };

  return (
    <div className="page narrow">
      <div className="notice">
        <Info />
        <div>
          <b>Eligibility validation</b>
          <span>The intern list is the live Employee Directory, sorted by employee code. HOD is resolved from organization hierarchy and skipped only when truly absent. The line manager is notified in ESS.</span>
        </div>
      </div>
      {formError ? (
        <div className="notice" style={{ background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }}>
          <AlertTriangle />
          <div>
            <b>Unable to initiate this review</b>
            <span>{formError}</span>
          </div>
        </div>
      ) : null}
      <section className="panel internPick">
        <div className="panelHead">
          <div>
            <h2>1. Search and select intern</h2>
            <p>Employee information is sourced from the live directory.</p>
          </div>
        </div>
        <div className="formStack">
          <label>Intern <i>*</i>
            <InternSearchSelect
              interns={workspace?.eligibleInterns || []}
              value={code}
              onChange={(next) => {
                setCode(next);
                setBypassEligibility(false);
                setFormError('');
              }}
            />
          </label>
          {intern ? (
            <div className="profilePreview">
              <div className="bigAvatar">{initials(intern.name)}</div>
              <div>
                <h3>{intern.name}</h3>
                <p>{intern.jobTitle} · {intern.department}</p>
                <div className="chips">
                  <span>Started {formatDay(intern.internshipStart)}</span>
                  <span>{intern.monthsCompleted}+ months completed</span>
                  <span>{intern.eligible ? 'Eligible' : `Below ${requiredMonths}-month eligibility`}</span>
                </div>
              </div>
            </div>
          ) : null}
          {needsBypass ? (
            <>
              <div className="notice" style={{ margin: 0 }}>
                <Info />
                <div>
                  <b>This intern is under {requiredMonths} months</b>
                  <span>{intern?.name} has completed {intern?.monthsCompleted} month(s). You can still start the review by ticking the bypass below. This is recorded on the audit trail.</span>
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={bypassEligibility} onChange={(event) => { setBypassEligibility(event.target.checked); setFormError(''); }} />
                Bypass eligibility and initiate anyway ({intern?.monthsCompleted} of {requiredMonths} months completed)
              </label>
            </>
          ) : null}
        </div>
      </section>
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>2. Assignment &amp; workflow</h2>
            <p>Confirm the reporting line and approval route.</p>
          </div>
        </div>
        <div className="infoGrid">
          <label>Line Manager<input value={intern?.lineManager || ''} placeholder="Auto-populated" readOnly /></label>
          <label>Department Head<input value={intern?.hod || ''} placeholder="From Job Information — bypassed if blank or same as line manager" readOnly /></label>
          <label>HR Manager<input value={intern ? 'HR Manager' : ''} readOnly /></label>
          <label>Final Approver<input value={intern ? 'Managing Director' : ''} readOnly /></label>
          <label>Review due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label>Review cycle<select><option>One-Year Internship Review</option></select></label>
        </div>
      </section>
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>3. HR instructions</h2>
            <p>Optional context visible to the line manager in ESS.</p>
          </div>
        </div>
        <div className="formStack">
          <label>Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Add any role-specific expectations or review guidance..." /></label>
          <label className="check"><input type="checkbox" checked={notifyManager} onChange={(event) => setNotifyManager(event.target.checked)} />Notify line manager immediately in the ESS portal</label>
          <label className="check"><input type="checkbox" checked={reminders} onChange={(event) => setReminders(event.target.checked)} />Send reminders 3 days and 1 day before due date</label>
        </div>
      </section>
      <div className="stickyActions">
        <div>
          <UserPlus />
          <span><b>Review assignment</b><small>Creates the record and an ESS task for the line manager.</small></span>
        </div>
        <button
          type="button"
          disabled={!code || busy}
          className="primary"
          onClick={() => void submit()}
        >
          <Send size={16} />Initiate &amp; notify manager
        </button>
      </div>
    </div>
  );
}

function DetailBody({ review, onHrAction }: { review: InternshipReview; onHrAction: () => void }) {
  return (
    <div className="page narrow">
      <div className="pageHead">
        <div>
          <span className="eyebrow">{review.id} · {review.cycle.toUpperCase()}</span>
          <h1>{review.employee.name}</h1>
          <p>{review.employee.code} · {review.employee.department} · {review.employee.jobTitle}</p>
        </div>
        <InternshipStatusBadge status={review.status} />
      </div>
      {review.eligibilityBypassed ? (
        <div className="notice">
          <Info />
          <div>
            <b>Eligibility was bypassed at initiation</b>
            <span>HR started this review before the intern reached the standard duration. The bypass is recorded in the audit trail.</span>
          </div>
        </div>
      ) : null}
      <div className="summaryGrid">
        <div><User /><span>Line manager<b>{review.supervisor}</b></span></div>
        <div><Building2 /><span>Department<b>{review.employee.department}</b></span></div>
        <div><Calendar /><span>Due date<b>{formatDay(review.dueDate)}</b></span></div>
        <div><Star /><span>Overall score<b>{review.overall ? formatInternshipOverallScore(review.overall) : 'Pending'}</b></span></div>
      </div>
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Approval journey</h2>
            <p>Evaluation and approvals continue in the ESS portal.</p>
          </div>
        </div>
        <InternshipWorkflowStepper items={review.approvals} />
      </section>
      <div className="twoCol">
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Evaluation summary</h2>
              <p>Line manager assessment record.</p>
            </div>
          </div>
          {review.scores.length ? (
            <div className="compactScores" style={{ padding: 20, display: 'grid', gap: 10 }}>
              {review.scores.map((score) => (
                <div key={score.criterion} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{score.criterion}</span>
                  <b>{score.rating}/5</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <FileText />
              <b>Evaluation not submitted yet</b>
              <p>The line manager completes this in ESS.</p>
              <a className="primary" href={internshipEssHref({ id: review.id, action: 'evaluate' })}><ExternalLink size={14} />Open ESS task</a>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Recommendation</h2>
              <p>Supervisor narrative and placement recommendation.</p>
            </div>
          </div>
          <div className="recommend">
            <label>Key strength<p>{review.strength || 'Awaiting evaluation.'}</p></label>
            <label>Areas for improvement<p>{review.improvement || 'Awaiting evaluation.'}</p></label>
            <label>Overall impression<p>{review.impression || 'Awaiting evaluation.'}</p></label>
            <label>Placement recommendation<strong>{review.recommendation || 'Pending'}</strong></label>
          </div>
        </section>
      </div>
      {review.status === 'Approved' ? (
        <div className="stickyActions">
          <div><BriefcaseBusiness /><span><b>MD approved</b><small>Record the HR next action to close the cycle.</small></span></div>
          <button type="button" className="primary" onClick={onHrAction}>Open HR action</button>
        </div>
      ) : null}
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Actions &amp; audit trail</h2>
            <p>Decision history, comments, notifications and system events.</p>
          </div>
        </div>
        <div className="timeline">
          {review.audit.map((event) => (
            <div key={event.id}>
              {event.action.toLowerCase().includes('notif') ? <MessageSquare /> : <ShieldCheck />}
              <span>
                <b>{event.action}</b>
                <small>{formatDay(event.at)} · {event.detail} · {event.actor}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HrActionForm({
  review,
  busy,
  onSave,
  onDone,
}: {
  review: InternshipReview;
  busy: boolean;
  onSave: (action: string, payload: Record<string, unknown>, id?: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [action, setAction] = useState(review.hrAction || '');
  const [date, setDate] = useState(review.hrActionDate || plusDays(0));
  const [role, setRole] = useState(review.proposedRole || '');
  const [notes, setNotes] = useState(review.hrActionNotes || '');
  const [notify, setNotify] = useState(review.notifyOnHrAction !== false);
  const [formError, setFormError] = useState('');
  return (
    <div className="page narrow">
      {formError ? (
        <div className="notice" style={{ background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }}>
          <AlertTriangle />
          <div>
            <b>Unable to save this action</b>
            <span>{formError}</span>
          </div>
        </div>
      ) : null}
      <section className="panel successPanel">
        <CheckCircle2 />
        <div>
          <h2>Final approval completed</h2>
          <p>The review record is locked against further evaluation edits.</p>
        </div>
      </section>
      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Transition action</h2>
            <p>Select the approved outcome and capture implementation details.</p>
          </div>
        </div>
        <div className="formStack">
          <label>HR action <i>*</i>
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="">Select next action</option>
              {INTERNSHIP_HR_ACTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>Effective / target date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Proposed trainee role<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Graduate Trainee — Information Technology" /></label>
          <label>HR action notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Document manpower confirmation, offer preparation, extension terms or exit instructions..." /></label>
          <label className="check"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />Notify line manager when action is confirmed</label>
        </div>
      </section>
      <div className="stickyActions">
        <div>
          <BriefcaseBusiness />
          <span><b>HR implementation record</b><small>Completes the performance review lifecycle.</small></span>
        </div>
        <button
          type="button"
          disabled={!action || busy}
          className="primary"
          onClick={() => {
            setFormError('');
            void onSave('hr-action', { hrAction: action, hrActionDate: date, proposedRole: role, hrActionNotes: notes, notifyOnHrAction: notify }, review.id)
              .then(() => onDone())
              .catch((err) => setFormError(err instanceof Error ? err.message : 'Unable to save this action.'));
          }}
        >
          <FileSignature />Confirm HR action
        </button>
      </div>
    </div>
  );
}

function SettingsForm({
  workspace,
  busy,
  onSave,
  onDone,
}: {
  workspace: Workspace | null;
  busy: boolean;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
  onDone: () => void;
}) {
  const [months, setMonths] = useState(String(workspace?.settings.eligibilityMonths ?? 12));
  const [formError, setFormError] = useState('');
  return (
    <div className="page narrow">
      {formError ? (
        <div className="notice" style={{ background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }}>
          <AlertTriangle />
          <div>
            <b>Unable to save settings</b>
            <span>{formError}</span>
          </div>
        </div>
      ) : null}
      <div className="settingsGrid">
        <section className="panel setting">
          <ListChecks />
          <div>
            <h3>Eligibility rules</h3>
            <label>Internship duration<input value={`${months} months`} onChange={(event) => setMonths(event.target.value.replace(/[^\d]/g, '') || '12')} /></label>
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 13 }}>HR can still initiate a shorter internship by ticking “Bypass eligibility and initiate anyway”.</p>
          </div>
        </section>
        <section className="panel setting">
          <Route />
          <div>
            <h3>Approval workflow</h3>
            <label>Route<input value="Line Manager → HOD (if present) → HR Manager → MD" readOnly /></label>
          </div>
        </section>
      </div>
      <div className="stickyActions">
        <div><Settings /><span><b>Save configuration</b><small>Eligibility duration is used when initiating reviews.</small></span></div>
        <button type="button" className="primary" disabled={busy} onClick={() => {
          setFormError('');
          void onSave('save-settings', { eligibilityMonths: Number(months) || 12 })
            .then(() => onDone())
            .catch((err) => setFormError(err instanceof Error ? err.message : 'Unable to save settings.'));
        }}>Save settings</button>
      </div>
    </div>
  );
}

function ReportsScreen({ workspace }: { workspace: Workspace | null }) {
  const analytics = workspace?.analytics;
  const exportReport = () => {
    const blob = new Blob([JSON.stringify(analytics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'internship-review-analytics.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="page">
        <div className="pageHead">
          <div>
            <span className="eyebrow">PERFORMANCE INTELLIGENCE</span>
            <h1>Internship review analytics</h1>
            <p>Monitor completion, recommendations, scores and approval turnaround from live records.</p>
          </div>
          <button type="button" className="secondary" onClick={exportReport}><Download />Export report</button>
        </div>
        <div className="kpis">
          <div className="miniKpi"><Users /><b>{analytics?.ytd ?? 0}</b><span>Reviews YTD</span></div>
          <div className="miniKpi"><CheckCircle2 /><b>{analytics?.completed ?? 0}</b><span>Completed</span></div>
          <div className="miniKpi"><TrendingUp /><b>{analytics?.recommendedPct ?? 0}%</b><span>Recommended</span></div>
          <div className="miniKpi"><BarChart3 /><b>{analytics?.averageScore ? formatInternshipOverallScore(analytics.averageScore) : '0% / 100'}</b><span>Average score</span></div>
        </div>
        <div className="twoCol">
          <section className="panel">
            <div className="panelHead"><div><h2>Reviews by department</h2><p>Year-to-date distribution.</p></div></div>
            <div className="bars">
              {(analytics?.departments || []).length ? (analytics?.departments || []).map((item) => (
                <div key={item.name}><span>{item.name}</span><i><em style={{ width: `${item.pct}%` }} /></i><b>{item.count}</b></div>
              )) : <p className="empty">No live reviews yet.</p>}
            </div>
          </section>
          <section className="panel">
            <div className="panelHead"><div><h2>Recommendation outcomes</h2><p>Approved review recommendations.</p></div></div>
            <div className="donutFake">
              <div><b>{analytics?.recommendedPct ?? 0}%</b><span>Trainee placement</span></div>
              <ul>
                <li>Recommend placement <b>{analytics?.recommendations.placement ?? 0}</b></li>
                <li>Extend internship <b>{analytics?.recommendations.extend ?? 0}</b></li>
                <li>Not recommended <b>{analytics?.recommendations.notRecommended ?? 0}</b></li>
              </ul>
            </div>
          </section>
        </div>
        <section className="panel">
          <div className="panelHead"><div><h2>Approval turnaround</h2><p>Average time spent at each workflow stage from live timestamps.</p></div></div>
          <div className="turnaround">
            {(analytics?.turnaround || []).map((item) => (
              <div key={item.stage}><span>{item.stage}</span><b>{item.days}</b></div>
            ))}
          </div>
        </section>
      </div>
  );
}
