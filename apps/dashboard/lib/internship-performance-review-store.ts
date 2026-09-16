import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { isStipendPayrollEmployeeCode } from '@/lib/payroll-employee-classification';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import type { SessionPayload } from '@/lib/auth/session';
import {
  INTERNSHIP_REVIEW_CRITERIA,
  INTERNSHIP_REVIEW_CYCLE,
  internshipReviewHref,
} from '@/lib/internship-performance-review-constants';
import {
  internshipAverage,
  internshipCurrentApprovalStep,
  internshipEvaluationLocked,
  internshipNextStatus,
} from '@/lib/internship-performance-review-workflow';
import type {
  InternshipApproval,
  InternshipAuditEvent,
  InternshipEligibleIntern,
  InternshipRating,
  InternshipRecommendation,
  InternshipReview,
  InternshipReviewSettings,
  InternshipScore,
} from '@/lib/internship-performance-review-types';

type StoreFile = {
  reviews: InternshipReview[];
  settings: InternshipReviewSettings;
};

const resolveDataFile = async () => {
  const candidates = [
    path.join(process.cwd(), 'apps', 'dashboard', 'data', 'hris', 'internship-reviews.json'),
    path.join(process.cwd(), 'data', 'hris', 'internship-reviews.json'),
  ];
  for (const candidate of candidates) {
    try {
      await mkdir(path.dirname(candidate), { recursive: true });
      return candidate;
    } catch {
      /* try next */
    }
  }
  return candidates[0];
};

const nowIsoDate = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const monthsBetween = (start: string) => {
  const from = new Date(`${start.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(from.getTime())) return 0;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth()));
};

const audit = (actor: string, action: string, detail: string): InternshipAuditEvent => ({
  id: newId('AUD'),
  at: nowStamp(),
  actor,
  action,
  detail,
});

const defaultApprovals = (lineManager: string, hod?: string): InternshipApproval[] => [
  { step: 'Line Manager Evaluation', approver: lineManager, role: 'LINE_MANAGER', status: 'Pending' },
  hod
    ? { step: 'HOD / Functional Manager', approver: hod, role: 'HOD', status: 'Pending' }
    : { step: 'HOD / Functional Manager', approver: '', role: 'HOD', status: 'Skipped', comment: 'No HOD configured' },
  { step: 'HR Manager Review', approver: 'HR Manager', role: 'HR_MANAGER', status: 'Pending' },
  { step: 'MD Final Approval', approver: 'Managing Director', role: 'MD', status: 'Pending' },
];

const seedReviews = (): InternshipReview[] => [
  {
    id: 'IPR-2026-0041',
    employee: {
      code: 'NYSC0021',
      name: 'OTAIGBE ANETOR',
      department: 'INFORMATION TECHNOLOGY',
      jobTitle: 'IT Intern',
      email: 'anetor@dormanlongeng.com',
      internshipStart: '2025-09-01',
      lineManager: 'Chris Ogbaisi',
      hod: 'Functional Manager, IT',
    },
    cycle: INTERNSHIP_REVIEW_CYCLE,
    dueDate: '2026-09-20',
    status: 'In Evaluation',
    supervisor: 'Chris Ogbaisi',
    scores: [],
    strength: '',
    improvement: '',
    impression: '',
    recommendation: '',
    overall: 0,
    approvals: defaultApprovals('Chris Ogbaisi', 'Functional Manager, IT'),
    createdAt: '2026-09-16',
    updatedAt: '2026-09-16',
    createdBy: 'HR Officer',
    audit: [
      audit('HR Officer', 'Review initiated by HR', 'Employee and reporting line validated'),
      audit('System', 'Line manager notified', 'Email and in-app task generated'),
    ],
  },
  {
    id: 'IPR-2026-0038',
    employee: {
      code: 'INT0148',
      name: 'AMINA BELLO',
      department: 'PROCUREMENT',
      jobTitle: 'Procurement Intern',
      email: 'amina@dormanlongeng.com',
      internshipStart: '2025-08-11',
      lineManager: 'Procurement Manager',
    },
    cycle: INTERNSHIP_REVIEW_CYCLE,
    dueDate: '2026-09-12',
    status: 'Pending MD',
    supervisor: 'Procurement Manager',
    scores: INTERNSHIP_REVIEW_CRITERIA.map((criterion, index) => ({
      criterion,
      rating: ([4, 5, 4, 4, 5, 4, 5, 4, 4, 4, 4][index] || 4) as InternshipRating,
    })),
    strength: 'Strong analytical ability',
    improvement: 'Vendor negotiation',
    impression: 'Reliable and ready for more responsibility',
    recommendation: 'Yes',
    overall: 4.3,
    approvals: [
      { step: 'Line Manager Evaluation', approver: 'Procurement Manager', role: 'LINE_MANAGER', status: 'Approved', at: '2026-09-10' },
      { step: 'HOD / Functional Manager', approver: '', role: 'HOD', status: 'Skipped', comment: 'No HOD configured' },
      { step: 'HR Manager Review', approver: 'HR Manager', role: 'HR_MANAGER', status: 'Approved', at: '2026-09-11' },
      { step: 'MD Final Approval', approver: 'Managing Director', role: 'MD', status: 'Pending' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-11',
    createdBy: 'HR Officer',
    audit: [
      audit('HR Officer', 'Review initiated by HR', 'Employee and reporting line validated'),
      audit('Procurement Manager', 'Evaluation submitted', 'Recommended for trainee placement'),
      audit('System', 'HOD stage skipped', 'No HOD configured'),
      audit('HR Manager', 'HR Manager approved', 'Routed to MD final approval'),
    ],
  },
];

const defaultSettings = (): InternshipReviewSettings => ({
  eligibilityMonths: 12,
  workflow: 'Line Manager → HOD (if present) → HR Manager → MD',
  reminderSchedule: '3 days and 1 day before due date',
  lockAfterSubmission: true,
});

const emptyStore = (): StoreFile => ({ reviews: seedReviews(), settings: defaultSettings() });

let writeChain: Promise<void> = Promise.resolve();

const readStore = async (): Promise<StoreFile> => {
  try {
    const file = await resolveDataFile();
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.reviews)) return emptyStore();
    return {
      reviews: parsed.reviews,
      settings: { ...defaultSettings(), ...(parsed.settings || {}) },
    };
  } catch {
    const seeded = emptyStore();
    await persistStore(seeded);
    return seeded;
  }
};

const persistStore = async (store: StoreFile) => {
  const file = await resolveDataFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store, null, 2), 'utf8');
};

const withStore = async <T,>(fn: (store: StoreFile) => Promise<T> | T) => {
  let result!: T;
  writeChain = writeChain.then(async () => {
    const store = await readStore();
    result = await fn(store);
    await persistStore(store);
  });
  await writeChain;
  return result;
};

const nextReviewId = (reviews: InternshipReview[]) => {
  const year = new Date().getFullYear();
  const seq = reviews.reduce((max, review) => {
    const match = review.id.match(/^IPR-(\d{4})-(\d+)$/);
    if (!match || Number(match[1]) !== year) return max;
    return Math.max(max, Number(match[2]));
  }, 0);
  return `IPR-${year}-${String(seq + 1).padStart(4, '0')}`;
};

const notify = async (session: SessionPayload | null, title: string, body: string, href: string, recipientEmployeeCode?: string) => {
  if (!session) return;
  try {
    await createEnterpriseNotification(session, {
      title,
      body,
      module: 'Performance Management',
      kind: 'Task',
      href,
      recipientEmployeeCode,
      actor: session.fullName,
      channels: ['In-App'],
    });
  } catch {
    // Notifications are best-effort; the review record still persists.
  }
};

export const listInternshipReviews = async () => (await readStore()).reviews;

export const getInternshipReview = async (id: string) =>
  (await readStore()).reviews.find((review) => review.id === id) || null;

export const getInternshipReviewSettings = async () => (await readStore()).settings;

export const saveInternshipReviewSettings = async (patch: Partial<InternshipReviewSettings>) =>
  withStore((store) => {
    store.settings = { ...store.settings, ...patch };
    return store.settings;
  });

export const listEligibleInternshipInterns = async (): Promise<InternshipEligibleIntern[]> => {
  const settings = await getInternshipReviewSettings();
  const { employees } = await readPayrollEmployees().catch(() => ({ employees: [] as Awaited<ReturnType<typeof readPayrollEmployees>>['employees'] }));
  const active = employees.filter((employee) => {
    const status = String(employee.status || '').toLowerCase();
    return !['resigned', 'terminated', 'retired', 'inactive'].includes(status);
  });
  const interns = active.filter(isStipendPayrollEmployeeCode);
  const mapped = (interns.length ? interns : active.filter((employee) => /intern|nysc|industrial train/i.test(`${employee.jobTitle} ${employee.employeeCategory} ${employee.staffCategory}`))).map((employee) => {
    const start = String(employee.dateJoined || employee.contractStartDate || '').slice(0, 10);
    const monthsCompleted = monthsBetween(start || nowIsoDate());
    return {
      code: employee.employeeCode || employee.employeeId,
      name: employee.fullName,
      department: employee.department || 'Unassigned',
      jobTitle: employee.jobTitle || 'Intern',
      email: employee.officialEmail || employee.email || '',
      internshipStart: start || nowIsoDate(),
      lineManager: String(employee.managerName || '').trim(),
      monthsCompleted,
      eligible: monthsCompleted >= settings.eligibilityMonths,
    } satisfies InternshipEligibleIntern;
  });
  if (mapped.length) return mapped.sort((a, b) => a.name.localeCompare(b.name));
  return [
    {
      code: 'NYSC0021',
      name: 'OTAIGBE ANETOR',
      department: 'INFORMATION TECHNOLOGY',
      jobTitle: 'IT Intern',
      email: 'anetor@dormanlongeng.com',
      internshipStart: '2025-09-01',
      lineManager: 'Chris Ogbaisi',
      hod: 'Functional Manager, IT',
      monthsCompleted: 12,
      eligible: true,
    },
    {
      code: 'INT0148',
      name: 'AMINA BELLO',
      department: 'PROCUREMENT',
      jobTitle: 'Procurement Intern',
      email: 'amina@dormanlongeng.com',
      internshipStart: '2025-08-11',
      lineManager: 'Procurement Manager',
      monthsCompleted: 13,
      eligible: true,
    },
  ];
};

export const internshipReviewKpis = (reviews: InternshipReview[]) => {
  const open = reviews.filter((review) => !['Approved', 'HR Action', 'Closed'].includes(review.status)).length;
  const awaiting = reviews.filter((review) => ['Pending HOD', 'Pending HR Manager', 'Pending MD'].includes(review.status)).length;
  const month = nowIsoDate().slice(0, 7);
  const approvedMonth = reviews.filter((review) => (review.status === 'Approved' || review.status === 'HR Action' || review.status === 'Closed') && review.updatedAt.slice(0, 7) === month).length;
  const recommended = reviews.filter((review) => review.recommendation === 'Yes' && ['Approved', 'HR Action', 'Closed'].includes(review.status)).length;
  const returned = reviews.filter((review) => review.status === 'Returned' || review.status === 'HR Action').length;
  return {
    open,
    awaiting,
    approvedMonth,
    recommendedPct: approvedMonth ? Math.round((recommended / Math.max(approvedMonth, 1)) * 100) : 0,
    returned,
  };
};

export const internshipReviewAnalytics = (reviews: InternshipReview[]) => {
  const completed = reviews.filter((review) => ['Approved', 'HR Action', 'Closed'].includes(review.status));
  const recommended = completed.filter((review) => review.recommendation === 'Yes').length;
  const extend = completed.filter((review) => review.recommendation === 'Extend internship').length;
  const notRecommended = completed.filter((review) => review.recommendation === 'No').length;
  const scores = completed.map((review) => review.overall).filter((value) => value > 0);
  const byDept = new Map<string, number>();
  for (const review of reviews) {
    const dept = review.employee.department || 'Unassigned';
    byDept.set(dept, (byDept.get(dept) || 0) + 1);
  }
  const maxDept = Math.max(1, ...byDept.values());
  return {
    ytd: reviews.length,
    completed: completed.length,
    recommendedPct: completed.length ? Math.round((recommended / completed.length) * 100) : 0,
    averageScore: scores.length ? internshipAverage(scores) : 0,
    recommendations: { placement: recommended, extend, notRecommended },
    departments: [...byDept.entries()].map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / maxDept) * 100),
    })),
    turnaround: [
      { stage: 'Line Manager', days: '2.4 days' },
      { stage: 'HOD / Functional Manager', days: '1.2 days' },
      { stage: 'HR Manager', days: '0.9 days' },
      { stage: 'MD Final Approval', days: '1.5 days' },
    ],
  };
};

const requireReview = (store: StoreFile, id: string) => {
  const review = store.reviews.find((item) => item.id === id);
  if (!review) throw new Error('Internship review not found.');
  return review;
};

export const initiateInternshipReview = async (
  input: {
    employeeCode: string;
    dueDate?: string;
    cycle?: string;
    instructions?: string;
    notifyManager?: boolean;
    reminders?: boolean;
    hod?: string;
    hrManager?: string;
  },
  actor: string,
  session: SessionPayload | null,
) => {
  const interns = await listEligibleInternshipInterns();
  const intern = interns.find((item) => item.code === input.employeeCode);
  if (!intern) throw new Error('Select an intern from the Employee Directory.');
  const settings = await getInternshipReviewSettings();
  if (!intern.eligible) throw new Error(`This intern has completed ${intern.monthsCompleted} month(s). Eligibility requires ${settings.eligibilityMonths} months.`);
  if (!intern.lineManager) throw new Error('Reporting line is missing. Resolve the line manager from organization hierarchy before initiation.');

  return withStore(async (store) => {
    if (store.reviews.some((review) => review.employee.code === intern.code && !['Closed'].includes(review.status))) {
      throw new Error('An open internship review already exists for this intern.');
    }
    const hod = intern.hod || input.hod || '';
    const review: InternshipReview = {
      id: nextReviewId(store.reviews),
      employee: intern,
      cycle: input.cycle || INTERNSHIP_REVIEW_CYCLE,
      dueDate: input.dueDate || nowIsoDate(),
      status: 'In Evaluation',
      supervisor: intern.lineManager,
      scores: [],
      strength: '',
      improvement: '',
      impression: '',
      recommendation: '',
      overall: 0,
      approvals: defaultApprovals(intern.lineManager, hod),
      instructions: input.instructions || '',
      notifyManager: input.notifyManager !== false,
      reminders: input.reminders !== false,
      createdAt: nowIsoDate(),
      updatedAt: nowIsoDate(),
      createdBy: actor,
      audit: [
        audit(actor, 'Review initiated by HR', 'Employee and reporting line validated'),
        audit('System', 'Line manager notified', input.notifyManager === false ? 'Notification suppressed' : 'Email and in-app task generated'),
      ],
    };
    if (!hod) {
      review.audit.push(audit('System', 'HOD stage skipped', 'No HOD / Functional Manager resolved from organization hierarchy'));
    }
    store.reviews.unshift(review);
    if (input.notifyManager !== false) {
      await notify(
        session,
        `Internship review assigned: ${review.employee.name}`,
        `Complete the one-year internship evaluation for ${review.employee.name} (${review.id}). Due ${review.dueDate}.`,
        internshipReviewHref(`${review.id}/evaluate`),
      );
    }
    return review;
  });
};

export const saveInternshipEvaluation = async (
  id: string,
  payload: {
    scores?: InternshipScore[];
    strength?: string;
    improvement?: string;
    impression?: string;
    recommendation?: InternshipRecommendation;
  },
  actor: string,
) =>
  withStore((store) => {
    const review = requireReview(store, id);
    if (internshipEvaluationLocked(review.status) && store.settings.lockAfterSubmission) {
      throw new Error('Submitted evaluation is locked. Corrections are only allowed after a formal return.');
    }
    if (payload.scores) review.scores = payload.scores;
    if (payload.strength != null) review.strength = payload.strength;
    if (payload.improvement != null) review.improvement = payload.improvement;
    if (payload.impression != null) review.impression = payload.impression;
    if (payload.recommendation != null) review.recommendation = payload.recommendation;
    review.overall = internshipAverage(review.scores.map((score) => score.rating));
    review.updatedAt = nowIsoDate();
    review.audit.push(audit(actor, 'Evaluation draft saved', `${review.scores.length} criteria captured`));
    return review;
  });

export const submitInternshipEvaluation = async (
  id: string,
  payload: {
    scores: InternshipScore[];
    strength: string;
    improvement: string;
    impression: string;
    recommendation: InternshipRecommendation;
  },
  actor: string,
  session: SessionPayload | null,
) =>
  withStore(async (store) => {
    const review = requireReview(store, id);
    if (internshipEvaluationLocked(review.status) && store.settings.lockAfterSubmission) {
      throw new Error('Submitted evaluation is locked. Corrections are only allowed after a formal return.');
    }
    if (!payload.scores || payload.scores.length !== INTERNSHIP_REVIEW_CRITERIA.length || payload.scores.some((score) => !score.rating)) {
      throw new Error('All 11 performance criteria must be rated before submission.');
    }
    if (!payload.strength?.trim() || !payload.improvement?.trim() || !payload.impression?.trim() || !payload.recommendation) {
      throw new Error('Complete all recommendation narratives before submission.');
    }
    review.scores = payload.scores;
    review.strength = payload.strength.trim();
    review.improvement = payload.improvement.trim();
    review.impression = payload.impression.trim();
    review.recommendation = payload.recommendation;
    review.overall = internshipAverage(review.scores.map((score) => score.rating));
    const line = review.approvals.find((item) => item.role === 'LINE_MANAGER');
    if (line) {
      line.status = 'Approved';
      line.approver = actor;
      line.at = nowIsoDate();
    }
    const next = internshipNextStatus(review, 'LINE_MANAGER', 'approve');
    review.status = next;
    review.updatedAt = nowIsoDate();
    review.audit.push(audit(actor, 'Evaluation submitted', `Overall ${review.overall.toFixed(1)} · ${review.recommendation}`));
    await notify(
      session,
      `Internship evaluation submitted: ${review.employee.name}`,
      `${actor} submitted ${review.id}. Next stage: ${next}.`,
      internshipReviewHref(`${review.id}/approve`),
    );
    return review;
  });

export const decideInternshipApproval = async (
  id: string,
  decision: 'approve' | 'return',
  comment: string,
  actor: string,
  session: SessionPayload | null,
) =>
  withStore(async (store) => {
    const review = requireReview(store, id);
    const step = internshipCurrentApprovalStep(review);
    if (!step || step.role === 'LINE_MANAGER') {
      throw new Error('This review is not waiting on an approval decision.');
    }
    if (decision === 'return' && !comment.trim()) {
      throw new Error('Returning a review requires a comment for the audit trail.');
    }
    step.status = decision === 'return' ? 'Returned' : 'Approved';
    step.comment = comment.trim() || undefined;
    step.approver = actor;
    step.at = nowIsoDate();
    const next = internshipNextStatus(review, step.role, decision);
    review.status = next;
    review.updatedAt = nowIsoDate();
    if (decision === 'return') {
      const line = review.approvals.find((item) => item.role === 'LINE_MANAGER');
      if (line) {
        line.status = 'Pending';
        line.at = undefined;
      }
      review.audit.push(audit(actor, 'Returned for correction', comment.trim()));
      await notify(
        session,
        `Internship review returned: ${review.employee.name}`,
        `${actor} returned ${review.id}. ${comment.trim()}`,
        internshipReviewHref(`${review.id}/evaluate`),
      );
    } else {
      review.audit.push(audit(actor, `${step.step} approved`, comment.trim() || 'Approved and routed onward'));
      if (next === 'Approved') {
        review.audit.push(audit('System', 'Final approval completed', 'HR and the line manager have been notified. Evaluation is locked.'));
        await notify(
          session,
          `MD approved internship review: ${review.employee.name}`,
          `${review.id} is approved. Record the HR next action.`,
          internshipReviewHref(`${review.id}/hr-action`),
        );
      } else {
        await notify(
          session,
          `Internship review approved onward: ${review.employee.name}`,
          `${actor} approved ${review.id}. Next stage: ${next}.`,
          internshipReviewHref(`${review.id}/approve`),
        );
      }
    }
    return review;
  });

export const recordInternshipHrAction = async (
  id: string,
  payload: {
    hrAction: string;
    hrActionNotes?: string;
    hrActionDate?: string;
    proposedRole?: string;
    notifyOnHrAction?: boolean;
  },
  actor: string,
  session: SessionPayload | null,
) =>
  withStore(async (store) => {
    const review = requireReview(store, id);
    if (review.status !== 'Approved' && review.status !== 'HR Action') {
      throw new Error('HR action can only be recorded after MD final approval.');
    }
    if (!payload.hrAction) throw new Error('Select the next HR action.');
    review.hrAction = payload.hrAction;
    review.hrActionNotes = payload.hrActionNotes || '';
    review.hrActionDate = payload.hrActionDate || nowIsoDate();
    review.proposedRole = payload.proposedRole || '';
    review.notifyOnHrAction = payload.notifyOnHrAction !== false;
    review.status = 'Closed';
    review.updatedAt = nowIsoDate();
    review.audit.push(audit(actor, 'HR action confirmed', payload.hrAction));
    if (payload.notifyOnHrAction !== false) {
      await notify(
        session,
        `HR action recorded: ${review.employee.name}`,
        `${payload.hrAction} for ${review.id}.`,
        internshipReviewHref(review.id),
      );
    }
    return review;
  });

export const internshipTasksForActor = (reviews: InternshipReview[], actorName: string, roleHint = '') => {
  const name = actorName.toLowerCase();
  const role = roleHint.toLowerCase();
  return reviews.filter((review) => {
    if (review.status === 'In Evaluation' || review.status === 'Returned' || review.status === 'Assigned') {
      return review.supervisor.toLowerCase().includes(name) || role.includes('supervisor') || role.includes('manager') || role.includes('hr');
    }
    if (review.status === 'Pending HOD') return role.includes('hod') || role.includes('head') || role.includes('hr') || role.includes('admin');
    if (review.status === 'Pending HR Manager') return role.includes('hr');
    if (review.status === 'Pending MD') return role.includes('md') || role.includes('director') || role.includes('executive') || role.includes('admin') || role.includes('hr');
    if (review.status === 'Approved') return role.includes('hr');
    return false;
  });
};
