'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Clock3,
  CornerDownLeft,
  Download,
  FileSignature,
  FileText,
  Filter,
  Info,
  ListChecks,
  MessageSquare,
  Plus,
  RotateCcw,
  Route,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  INTERNSHIP_HR_ACTIONS,
  INTERNSHIP_RATING_LABELS,
  INTERNSHIP_REVIEW_CRITERIA,
  internshipReviewHref,
  parseInternshipReviewRoute,
} from '@/lib/internship-performance-review-constants';
import type {
  InternshipEligibleIntern,
  InternshipRating,
  InternshipRecommendation,
  InternshipReview,
  InternshipReviewSettings,
} from '@/lib/internship-performance-review-types';
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

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const formatDay = (value?: string) => {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

export default function InternshipPerformanceReviewView({ route }: { route: string }) {
  const parsed = parseInternshipReviewRoute(route);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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

  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/hris/performance-management/internship-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: reviewId, payload }),
      });
      const json = await readJson<{ workspace?: Workspace }>(res);
      if (json.status !== 'success') throw new Error(json.error || 'Action failed.');
      if (json.data?.workspace) setWorkspace(json.data.workspace);
      else await load();
      return json.data;
    } finally {
      setBusy(false);
    }
  };

  if (!workspace && !error) {
    return <div className="dle-ipr"><p style={{ padding: 24 }}>Loading internship performance review…</p></div>;
  }

  const review = reviewId
    ? workspace?.reviews.find((item) => item.id === reviewId) || workspace?.review || null
    : null;

  return (
    <div className="dle-ipr">
      {error ? <div className="notice" style={{ margin: '0 0 16px' }}><AlertTriangle /><div><b>Unable to complete action</b><span>{error}</span></div></div> : null}
      {parsed.kind === 'new' ? <InitiateScreen workspace={workspace} busy={busy} onInitiate={run} /> : null}
      {parsed.kind === 'tasks' ? <TasksScreen workspace={workspace} /> : null}
      {parsed.kind === 'reports' ? <ReportsScreen workspace={workspace} /> : null}
      {parsed.kind === 'settings' ? <SettingsScreen workspace={workspace} busy={busy} onSave={run} /> : null}
      {parsed.kind === 'evaluate' ? (review ? <EvaluateScreen review={review} busy={busy} onSave={run} /> : <MissingReview />) : null}
      {parsed.kind === 'approve' ? (review ? <ApproveScreen review={review} busy={busy} onDecide={run} /> : <MissingReview />) : null}
      {parsed.kind === 'hr-action' ? (review ? <HrActionScreen review={review} busy={busy} onSave={run} /> : <MissingReview />) : null}
      {parsed.kind === 'detail' ? (review ? <DetailScreen review={review} /> : <MissingReview />) : null}
      {parsed.kind === 'dashboard' || parsed.kind === 'none' ? <DashboardScreen workspace={workspace} /> : null}
    </div>
  );
}

function MissingReview() {
  return (
    <InternshipReviewShell title="Review Detail">
      <div className="page narrow">
        <Link className="back" href={internshipReviewHref()}><ArrowLeft size={15} />Back to review register</Link>
        <div className="empty"><FileText /><b>Review not found</b><p>The internship review record is not available.</p></div>
      </div>
    </InternshipReviewShell>
  );
}

function DashboardScreen({ workspace }: { workspace: Workspace | null }) {
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
    const rows = [['Review ID', 'Intern', 'Code', 'Department', 'Line manager', 'Due date', 'Status', 'Score'], ...filtered.map((review) => [review.id, review.employee.name, review.employee.code, review.employee.department, review.supervisor, review.dueDate, review.status, review.overall || ''])];
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
    <InternshipReviewShell title="Internship Performance" activeHref="">
      <div className="page">
        <div className="pageHead">
          <div>
            <span className="eyebrow">INTERNSHIP PERFORMANCE REVIEW</span>
            <h1>Performance review dashboard</h1>
            <p>Initiate, evaluate, approve and track one-year internship transition assessments.</p>
          </div>
          <Link href={internshipReviewHref('new')} className="primary"><Plus size={17} />Initiate review</Link>
        </div>
        <div className="kpis">
          <InternshipKpiCard label="Open reviews" value={workspace?.kpis.open ?? 0} sub="Across all departments" Icon={ClipboardCheck} />
          <InternshipKpiCard label="Awaiting approval" value={workspace?.kpis.awaiting ?? 0} sub="Require HR or MD attention" Icon={Clock3} />
          <InternshipKpiCard label="Approved this month" value={workspace?.kpis.approvedMonth ?? 0} sub={`${workspace?.kpis.recommendedPct ?? 0}% recommended`} Icon={CheckCircle2} />
          <InternshipKpiCard label="Returned / action" value={workspace?.kpis.returned ?? 0} sub="Needs follow-up" Icon={RotateCcw} />
        </div>
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Review register</h2>
              <p>All internship assessments and current workflow position.</p>
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
                          <small>{review.employee.code}</small>
                        </div>
                      </div>
                    </td>
                    <td>{review.employee.department}</td>
                    <td>{review.supervisor}</td>
                    <td>{formatDay(review.dueDate)}</td>
                    <td><InternshipStatusBadge status={review.status} /></td>
                    <td><b>{review.overall ? review.overall.toFixed(1) : '—'}</b></td>
                    <td><Link className="view" href={internshipReviewHref(review.id)}>Open <ArrowUpRight size={14} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </InternshipReviewShell>
  );
}

function InitiateScreen({
  workspace,
  busy,
  onInitiate,
}: {
  workspace: Workspace | null;
  busy: boolean;
  onInitiate: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [dueDate, setDueDate] = useState('2026-09-20');
  const [instructions, setInstructions] = useState('');
  const [notifyManager, setNotifyManager] = useState(true);
  const [reminders, setReminders] = useState(true);
  const intern = workspace?.eligibleInterns.find((item) => item.code === code) || null;
  return (
    <InternshipReviewShell title="Initiate Review" activeHref="new">
      <div className="page narrow">
        <div className="pageHead">
          <div>
            <span className="eyebrow">HR WORKSPACE</span>
            <h1>Initiate internship review</h1>
            <p>Create and assign the formal one-year internship performance assessment.</p>
          </div>
        </div>
        <div className="notice">
          <Info />
          <div>
            <b>Eligibility validation</b>
            <span>The system validates one full year of internship, active employee status, reporting line and approval hierarchy before assignment. HOD is resolved from organization hierarchy and skipped only when truly absent.</span>
          </div>
        </div>
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>1. Select eligible intern</h2>
              <p>Employee information is sourced from the Employee Directory.</p>
            </div>
          </div>
          <div className="formStack">
            <label>Intern <i>*</i>
              <select value={code} onChange={(event) => setCode(event.target.value)}>
                <option value="">Select eligible intern</option>
                {(workspace?.eligibleInterns || []).map((item) => (
                  <option key={item.code} value={item.code}>{item.code} — {item.name}{item.eligible ? '' : ' (not yet eligible)'}</option>
                ))}
              </select>
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
                    <span>{intern.eligible ? 'Eligible' : 'Not eligible'}</span>
                  </div>
                </div>
              </div>
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
            <label>HOD / Functional Manager<input value={intern?.hod || ''} placeholder="Optional — bypassed if absent" readOnly /></label>
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
              <p>Optional context visible to the line manager.</p>
            </div>
          </div>
          <div className="formStack">
            <label>Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Add any role-specific expectations or review guidance..." /></label>
            <label className="check"><input type="checkbox" checked={notifyManager} onChange={(event) => setNotifyManager(event.target.checked)} />Notify line manager immediately after initiation</label>
            <label className="check"><input type="checkbox" checked={reminders} onChange={(event) => setReminders(event.target.checked)} />Send reminders 3 days and 1 day before due date</label>
          </div>
        </section>
        <div className="stickyActions">
          <div>
            <UserPlus />
            <span><b>Review assignment</b><small>Creates an auditable task and notification.</small></span>
          </div>
          <button
            type="button"
            disabled={!code || busy}
            className="primary"
            onClick={() => {
              void onInitiate('initiate', { employeeCode: code, dueDate, instructions, notifyManager, reminders }).then((result) => {
                const id = (result as { review?: { id: string } } | undefined)?.review?.id;
                router.push(internshipReviewHref(id || ''));
              });
            }}
          >
            <Send size={16} />Initiate &amp; notify manager
          </button>
        </div>
      </div>
    </InternshipReviewShell>
  );
}

function TasksScreen({ workspace }: { workspace: Workspace | null }) {
  const tasks = workspace?.tasks || [];
  return (
    <InternshipReviewShell title="My Tasks" activeHref="my-tasks">
      <div className="page">
        <div className="pageHead">
          <div>
            <span className="eyebrow">ACTION CENTRE</span>
            <h1>My performance review tasks</h1>
            <p>Evaluations, approvals and follow-up actions currently assigned to you.</p>
          </div>
        </div>
        <div className="kpis">
          <div className="miniKpi"><Clock /><b>{tasks.length}</b><span>Open tasks</span></div>
          <div className="miniKpi"><AlertCircle /><b>{tasks.filter((task) => task.dueDate <= new Date().toISOString().slice(0, 10)).length}</b><span>Due soon</span></div>
          <div className="miniKpi"><CheckCircle2 /><b>{workspace?.kpis.approvedMonth ?? 0}</b><span>Completed this month</span></div>
        </div>
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Assigned to me</h2>
              <p>Prioritized by due date and workflow stage.</p>
            </div>
          </div>
          <div className="taskList">
            {tasks.map((task) => {
              const href = ['In Evaluation', 'Returned', 'Assigned'].includes(task.status)
                ? internshipReviewHref(`${task.id}/evaluate`)
                : task.status === 'Approved'
                  ? internshipReviewHref(`${task.id}/hr-action`)
                  : internshipReviewHref(`${task.id}/approve`);
              const stage = ['In Evaluation', 'Returned', 'Assigned'].includes(task.status)
                ? 'Line Manager Evaluation'
                : task.status === 'Approved'
                  ? 'HR Next Action'
                  : task.status;
              return (
                <div className="task" key={task.id}>
                  <div className="taskIcon"><Clock /></div>
                  <div className="grow">
                    <small>{task.id}</small>
                    <h3>{task.employee.name}</h3>
                    <p>{stage}</p>
                  </div>
                  <div>
                    <small>Due</small>
                    <b>{formatDay(task.dueDate)}</b>
                  </div>
                  <InternshipStatusBadge status={task.status} />
                  <Link className="primary" href={href}>Open task <ArrowRight /></Link>
                </div>
              );
            })}
            {!tasks.length ? <p className="empty">No open internship review tasks for you.</p> : null}
          </div>
        </section>
      </div>
    </InternshipReviewShell>
  );
}

function DetailScreen({ review }: { review: InternshipReview }) {
  return (
    <InternshipReviewShell title="Review Detail">
      <div className="page narrow">
        <Link className="back" href={internshipReviewHref()}><ArrowLeft size={15} />Back to review register</Link>
        <div className="pageHead">
          <div>
            <span className="eyebrow">{review.id} · {review.cycle.toUpperCase()}</span>
            <h1>{review.employee.name}</h1>
            <p>{review.employee.code} · {review.employee.department} · {review.employee.jobTitle}</p>
          </div>
          <InternshipStatusBadge status={review.status} />
        </div>
        <div className="summaryGrid">
          <div><User /><span>Line manager<b>{review.supervisor}</b></span></div>
          <div><Building2 /><span>Department<b>{review.employee.department}</b></span></div>
          <div><Calendar /><span>Due date<b>{formatDay(review.dueDate)}</b></span></div>
          <div><Star /><span>Overall score<b>{review.overall ? `${review.overall.toFixed(1)} / 5.0` : 'Pending'}</b></span></div>
        </div>
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Approval journey</h2>
              <p>Formal workflow from evaluation through MD final approval.</p>
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
                <p>The line manager is still completing the assigned assessment.</p>
                <Link className="primary" href={internshipReviewHref(`${review.id}/evaluate`)}>Open evaluation</Link>
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
            <Link className="primary" href={internshipReviewHref(`${review.id}/hr-action`)}>Open HR action</Link>
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
    </InternshipReviewShell>
  );
}

function EvaluateScreen({
  review,
  busy,
  onSave,
}: {
  review: InternshipReview;
  busy: boolean;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<number, number>>(() => {
    const next: Record<number, number> = {};
    review.scores.forEach((score) => {
      const criterionIndex = INTERNSHIP_REVIEW_CRITERIA.findIndex((item) => item === score.criterion);
      if (criterionIndex >= 0) next[criterionIndex] = score.rating;
    });
    return next;
  });
  const [strength, setStrength] = useState(review.strength);
  const [improvement, setImprovement] = useState(review.improvement);
  const [impression, setImpression] = useState(review.impression);
  const [recommendation, setRecommendation] = useState(review.recommendation);
  const avg = useMemo(() => {
    const values = Object.values(scores);
    return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : '0.0';
  }, [scores]);
  const complete = Object.keys(scores).length === INTERNSHIP_REVIEW_CRITERIA.length && strength && improvement && impression && recommendation;
  const payload = () => ({
    scores: INTERNSHIP_REVIEW_CRITERIA.map((criterion, index) => ({ criterion, rating: scores[index] as InternshipRating })),
    strength,
    improvement,
    impression,
    recommendation: recommendation as InternshipRecommendation,
  });
  return (
    <InternshipReviewShell title="Line Manager Evaluation">
      <div className="page narrow">
        <div className="pageHead">
          <div>
            <span className="eyebrow">ASSIGNED REVIEW · {review.id}</span>
            <h1>Evaluate internship performance</h1>
            <p>Complete the assessment objectively based on demonstrated performance during the internship period.</p>
          </div>
          <div className="scoreRing"><strong>{avg}</strong><span>/ 5.0</span></div>
        </div>
        <div className="notice">
          <Info />
          <div>
            <b>Confidential performance assessment</b>
            <span>Your responses become part of the formal approval record. Complete every criterion before submission. Approvers cannot edit these ratings.</span>
          </div>
        </div>
        <section className="panel internCard">
          <div className="panelHead">
            <div>
              <h2>Intern information</h2>
              <p>Automatically populated from the Employee Directory.</p>
            </div>
            <span className={`status s-${review.status.toLowerCase().replaceAll(' ', '-')}`}>{review.status}</span>
          </div>
          <div className="infoGrid">
            <label>Intern<input value={`${review.employee.code} — ${review.employee.name}`} readOnly /></label>
            <label>Department<input value={review.employee.department} readOnly /></label>
            <label>Job title<input value={review.employee.jobTitle} readOnly /></label>
            <label>Internship start<input value={formatDay(review.employee.internshipStart)} readOnly /></label>
            <label>Supervisor<input value={review.supervisor} readOnly /></label>
            <label>Review period<input value="One full year" readOnly /></label>
          </div>
        </section>
        {review.instructions ? (
          <div className="notice"><Info /><div><b>HR instructions</b><span>{review.instructions}</span></div></div>
        ) : null}
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Performance assessment</h2>
              <p>Rate each competency from Poor (1) to Excellent (5).</p>
            </div>
            <span className="completion">{Object.keys(scores).length}/{INTERNSHIP_REVIEW_CRITERIA.length} rated</span>
          </div>
          <div className="ratingTable">
            <div className="ratingHeader">
              <b>Performance criterion</b>
              {[5, 4, 3, 2, 1].map((value) => (
                <span key={value}>{INTERNSHIP_RATING_LABELS[value]}<small>({value})</small></span>
              ))}
            </div>
            {INTERNSHIP_REVIEW_CRITERIA.map((criterion, index) => (
              <div className="ratingRow" key={criterion}>
                <div>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span>{criterion}</span>
                </div>
                {[5, 4, 3, 2, 1].map((value) => (
                  <label className={`radio ${scores[index] === value ? 'chosen' : ''}`} key={value}>
                    <input type="radio" name={`r${index}`} checked={scores[index] === value} onChange={() => setScores({ ...scores, [index]: value })} />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Supervisor’s recommendation</h2>
              <p>Summarize evidence and suitability for possible trainee transition.</p>
            </div>
          </div>
          <div className="formStack">
            <label>Key strengths <i>*</i><textarea value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="Describe demonstrated strengths, achievements and positive behaviours..." /></label>
            <label>Areas for improvement <i>*</i><textarea value={improvement} onChange={(event) => setImprovement(event.target.value)} placeholder="Identify development areas and support required..." /></label>
            <label>Overall impression of the intern <i>*</i><textarea value={impression} onChange={(event) => setImpression(event.target.value)} placeholder="Provide a balanced overall assessment..." /></label>
            <label>Do you recommend this intern for trainee placement? <i>*</i>
              <select value={recommendation} onChange={(event) => setRecommendation(event.target.value as InternshipRecommendation)}>
                <option value="">Select recommendation</option>
                <option>Yes</option>
                <option>No</option>
                <option>Extend internship</option>
              </select>
            </label>
          </div>
        </section>
        <div className="stickyActions">
          <div>
            <CheckCircle2 />
            <span>
              <b>{complete ? 'Ready to submit' : 'Assessment incomplete'}</b>
              <small>{complete ? 'All mandatory fields completed.' : 'Complete all ratings and recommendation fields.'}</small>
            </span>
          </div>
          <div className="row">
            <button type="button" className="secondary" disabled={busy} onClick={() => void onSave('save-evaluation', payload())}><Save size={16} />Save draft</button>
            <button
              type="button"
              disabled={!complete || busy}
              className="primary"
              onClick={() => {
                void onSave('submit-evaluation', payload()).then(() => router.push(internshipReviewHref(review.id)));
              }}
            >
              <Send size={16} />Submit evaluation
            </button>
          </div>
        </div>
      </div>
    </InternshipReviewShell>
  );
}

function ApproveScreen({
  review,
  busy,
  onDecide,
}: {
  review: InternshipReview;
  busy: boolean;
  onDecide: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  return (
    <InternshipReviewShell title="Approval Decision">
      <div className="page narrow">
        <div className="pageHead">
          <div>
            <span className="eyebrow">APPROVAL TASK · {review.id}</span>
            <h1>Review and approve evaluation</h1>
            <p>Validate the assessment, recommendation and supporting evidence before routing onward. The Line Manager evaluation cannot be edited here.</p>
          </div>
          <span className="status s-pending-md">Decision required</span>
        </div>
        <section className="panel"><InternshipWorkflowStepper items={review.approvals} /></section>
        <div className="twoCol">
          <section className="panel">
            <div className="panelHead">
              <div>
                <h2>Intern &amp; evaluation</h2>
                <p>Read-only submitted assessment.</p>
              </div>
            </div>
            <div className="recommend">
              <label>Intern<p><b>{review.employee.name}</b><br />{review.employee.code} · {review.employee.department}</p></label>
              <label>Overall score<strong>{(review.overall || 0).toFixed(1)} / 5.0</strong></label>
              <label>Recommendation<strong>{review.recommendation || '—'}</strong></label>
              <label>Key strength<p>{review.strength || '—'}</p></label>
              <label>Areas for improvement<p>{review.improvement || '—'}</p></label>
              <label>Overall impression<p>{review.impression || '—'}</p></label>
            </div>
          </section>
          <section className="panel decision">
            <div className="panelHead">
              <div>
                <h2>Your decision</h2>
                <p>Comments are retained in the permanent audit trail.</p>
              </div>
            </div>
            <label>Approval comment<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add decision comments, conditions or return instructions..." /></label>
            <div className="warn"><AlertTriangle />Returning sends the review to the line manager for correction and records the reason.</div>
            <div className="decisionButtons">
              <button type="button" className="danger" disabled={!comment || busy} onClick={() => void onDecide('return', { comment }).then(() => router.push(internshipReviewHref(review.id)))}><CornerDownLeft />Return for correction</button>
              <button type="button" className="success" disabled={busy} onClick={() => void onDecide('approve', { comment }).then(() => router.push(internshipReviewHref(review.id)))}><CheckCircle2 />Approve &amp; route onward</button>
            </div>
          </section>
        </div>
      </div>
    </InternshipReviewShell>
  );
}

function HrActionScreen({
  review,
  busy,
  onSave,
}: {
  review: InternshipReview;
  busy: boolean;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const router = useRouter();
  const [action, setAction] = useState(review.hrAction || '');
  const [date, setDate] = useState(review.hrActionDate || '');
  const [role, setRole] = useState(review.proposedRole || '');
  const [notes, setNotes] = useState(review.hrActionNotes || '');
  const [notify, setNotify] = useState(review.notifyOnHrAction !== false);
  return (
    <InternshipReviewShell title="HR Next Action">
      <div className="page narrow">
        <div className="pageHead">
          <div>
            <span className="eyebrow">POST-APPROVAL · HR CONTROL</span>
            <h1>Proceed with next HR action</h1>
            <p>Record the action arising from the MD-approved internship review.</p>
          </div>
          <span className="status s-approved">MD Approved</span>
        </div>
        <section className="panel successPanel">
          <CheckCircle2 />
          <div>
            <h2>Final approval completed</h2>
            <p>HR and the line manager have been notified. The review record is locked against further evaluation edits.</p>
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
            <label className="check"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />Notify line manager and employee when action is confirmed</label>
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
              void onSave('hr-action', { hrAction: action, hrActionDate: date, proposedRole: role, hrActionNotes: notes, notifyOnHrAction: notify }).then(() => router.push(internshipReviewHref(review.id)));
            }}
          >
            <FileSignature />Confirm HR action
          </button>
        </div>
      </div>
    </InternshipReviewShell>
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
    <InternshipReviewShell title="Reports & Analytics" activeHref="reports">
      <div className="page">
        <div className="pageHead">
          <div>
            <span className="eyebrow">PERFORMANCE INTELLIGENCE</span>
            <h1>Internship review analytics</h1>
            <p>Monitor completion, recommendations, scores and approval turnaround.</p>
          </div>
          <button type="button" className="secondary" onClick={exportReport}><Download />Export report</button>
        </div>
        <div className="kpis">
          <div className="miniKpi"><Users /><b>{analytics?.ytd ?? 0}</b><span>Reviews YTD</span></div>
          <div className="miniKpi"><CheckCircle2 /><b>{analytics?.completed ?? 0}</b><span>Completed</span></div>
          <div className="miniKpi"><TrendingUp /><b>{analytics?.recommendedPct ?? 0}%</b><span>Recommended</span></div>
          <div className="miniKpi"><BarChart3 /><b>{analytics?.averageScore ?? 0}</b><span>Average score</span></div>
        </div>
        <div className="twoCol">
          <section className="panel">
            <div className="panelHead"><div><h2>Reviews by department</h2><p>Year-to-date distribution.</p></div></div>
            <div className="bars">
              {(analytics?.departments || []).map((item) => (
                <div key={item.name}><span>{item.name}</span><i><em style={{ width: `${item.pct}%` }} /></i><b>{item.count}</b></div>
              ))}
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
          <div className="panelHead"><div><h2>Approval turnaround</h2><p>Average time spent at each workflow stage.</p></div></div>
          <div className="turnaround">
            {(analytics?.turnaround || []).map((item) => (
              <div key={item.stage}><span>{item.stage}</span><b>{item.days}</b></div>
            ))}
          </div>
        </section>
      </div>
    </InternshipReviewShell>
  );
}

function SettingsScreen({
  workspace,
  busy,
  onSave,
}: {
  workspace: Workspace | null;
  busy: boolean;
  onSave: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [months, setMonths] = useState(String(workspace?.settings.eligibilityMonths ?? 12));
  return (
    <InternshipReviewShell title="Configuration" activeHref="settings">
      <div className="page narrow">
        <div className="pageHead">
          <div>
            <span className="eyebrow">HR ADMINISTRATION</span>
            <h1>Internship review configuration</h1>
            <p>Manage eligibility, workflow, reminders and assessment controls.</p>
          </div>
        </div>
        <div className="settingsGrid">
          <section className="panel setting">
            <ListChecks />
            <div>
              <h3>Eligibility rules</h3>
              <label>Internship duration<input value={`${months} months`} onChange={(event) => setMonths(event.target.value.replace(/[^\d]/g, '') || '12')} /></label>
            </div>
          </section>
          <section className="panel setting">
            <Route />
            <div>
              <h3>Approval workflow</h3>
              <label>Route<input value="Line Manager → HOD (if present) → HR Manager → MD" readOnly /></label>
            </div>
          </section>
          <section className="panel setting">
            <BellRing />
            <div>
              <h3>Notifications</h3>
              <label>Reminder schedule<input value="3 days and 1 day before due date" readOnly /></label>
            </div>
          </section>
          <section className="panel setting">
            <ShieldCheck />
            <div>
              <h3>Record controls</h3>
              <label>After submission<input value="Lock evaluation; corrections only via formal return" readOnly /></label>
            </div>
          </section>
        </div>
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Assessment scale</h2>
              <p>Standard 5-point rating used across all 11 original criteria.</p>
            </div>
          </div>
          <div className="scale">
            {[['5', 'Excellent'], ['4', 'Good'], ['3', 'Average'], ['2', 'Fair'], ['1', 'Poor']].map(([value, label]) => (
              <div key={value}><b>{value}</b><span>{label}</span></div>
            ))}
          </div>
        </section>
        <div className="stickyActions">
          <div><Settings /><span><b>Save configuration</b><small>Eligibility duration is used when initiating reviews.</small></span></div>
          <button type="button" className="primary" disabled={busy} onClick={() => void onSave('save-settings', { eligibilityMonths: Number(months) || 12 })}>Save settings</button>
        </div>
      </div>
    </InternshipReviewShell>
  );
}
