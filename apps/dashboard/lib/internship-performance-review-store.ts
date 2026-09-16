import sql from 'mssql';
import { readPayrollEmployees } from '@/lib/payroll-employee-source';
import { isStipendPayrollEmployeeCode } from '@/lib/payroll-employee-classification';
import { readUsers } from '@/lib/auth/auth-store';
import { createEnterpriseNotification } from '@/lib/enterprise-notifications-store';
import type { SessionPayload } from '@/lib/auth/session';
import type { DleEmployeeDirectoryRow } from '@/lib/dle-enterprise-db';
import { employeeCodeFromReference } from '@/lib/reporting-manager-match';
import { resolveEmployeeMailbox, sendInternshipReviewTaskEmail, type MailSendResult } from '@/lib/mail-service';
import { toAbsoluteWorkflowHref } from '@/lib/public-app-url';
import {
  INTERNSHIP_REVIEW_CRITERIA,
  INTERNSHIP_REVIEW_CYCLE,
  compareEmployeeCodesSerial,
  internshipEssHref,
  internshipReviewHref,
} from '@/lib/internship-performance-review-constants';
import { getInternshipReviewSqlPool } from '@/lib/internship-performance-review-sql';
import {
  internshipActorInvolved,
  internshipAverage,
  internshipCanApprove,
  internshipCanEvaluate,
  internshipCurrentApprovalStep,
  internshipEvaluationLocked,
  internshipNextStatus,
  internshipTasksForSession,
} from '@/lib/internship-performance-review-workflow';
import type {
  InternshipApproval,
  InternshipAuditEvent,
  InternshipEligibleIntern,
  InternshipRecommendation,
  InternshipReview,
  InternshipReviewSettings,
  InternshipScore,
} from '@/lib/internship-performance-review-types';

const compact = (value: unknown) => String(value || '').trim();
const nowIsoDate = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const SETTINGS_KEY = 'default';

const defaultSettings = (): InternshipReviewSettings => ({
  eligibilityMonths: 12,
  workflow: 'Line Manager → HOD (if present) → HR Manager → MD',
  reminderSchedule: '3 days and 1 day before due date',
  lockAfterSubmission: true,
});

const audit = (actor: string, action: string, detail: string): InternshipAuditEvent => ({
  id: newId('AUD'),
  at: nowStamp(),
  actor,
  action,
  detail,
});

const monthsBetween = (start: string) => {
  const from = new Date(`${start.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(from.getTime())) return 0;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth()));
};

const plusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const directoryEmployees = async () => {
  const { employees } = await readPayrollEmployees().catch(() => ({ employees: [] as DleEmployeeDirectoryRow[] }));
  return employees;
};

const findPerson = (employees: DleEmployeeDirectoryRow[], reference: string) => {
  const value = compact(reference);
  if (!value) return null;
  const code = compact(employeeCodeFromReference(value) || value).toUpperCase();
  const byCode = employees.find((item) => compact(item.employeeCode || item.employeeId).toUpperCase() === code);
  if (byCode) return byCode;
  const needle = value.toLowerCase();
  return employees.find((item) => {
    const name = compact(item.fullName).toLowerCase();
    return name === needle || name.includes(needle) || needle.includes(name);
  }) || null;
};

const findRoleHolders = (employees: DleEmployeeDirectoryRow[], pattern: RegExp) =>
  employees.filter((item) => {
    const status = compact(item.status).toLowerCase();
    if (['resigned', 'terminated', 'retired', 'inactive'].includes(status)) return false;
    return pattern.test(`${item.jobTitle} ${item.designation} ${item.employeeCategory} ${item.staffCategory}`);
  });

const personLabel = (employee: DleEmployeeDirectoryRow | null, fallback: string) =>
  employee ? compact(employee.fullName) || fallback : fallback;

const personCode = (employee: DleEmployeeDirectoryRow | null) =>
  employee ? compact(employee.employeeCode || employee.employeeId) : '';

const defaultApprovals = (input: {
  lineManager: string;
  lineManagerCode?: string;
  hod?: string;
  hodCode?: string;
  hrManager: string;
  hrManagerCode?: string;
  md: string;
  mdCode?: string;
}): InternshipApproval[] => [
  { step: 'Line Manager Evaluation', approver: input.lineManager, approverCode: input.lineManagerCode || '', role: 'LINE_MANAGER', status: 'Pending' },
  input.hod
    ? { step: 'HOD / Functional Manager', approver: input.hod, approverCode: input.hodCode || '', role: 'HOD', status: 'Pending' }
    : { step: 'HOD / Functional Manager', approver: '', approverCode: '', role: 'HOD', status: 'Skipped', comment: 'No HOD configured' },
  { step: 'HR Manager Review', approver: input.hrManager, approverCode: input.hrManagerCode || '', role: 'HR_MANAGER', status: 'Pending' },
  { step: 'MD Final Approval', approver: input.md, approverCode: input.mdCode || '', role: 'MD', status: 'Pending' },
];

type NotifyTarget = { employeeCode?: string; name?: string; roles?: string[] };

type NotifyDelivery = { sent: boolean; to?: string; reason?: string };

const resolveNotifyRecipients = async (target?: NotifyTarget) => {
  const employees = await directoryEmployees();
  const users = await readUsers().catch(() => []);
  const recipients: Array<{ code: string; name: string; email: string }> = [];
  const push = async (code: string, name: string, employee?: DleEmployeeDirectoryRow | null) => {
    const mailbox = employee
      ? await resolveEmployeeMailbox(employee)
      : '';
    const user = users.find((item) =>
      [item.employeeCode, item.employeeId, item.username]
        .map((value) => compact(value).toUpperCase())
        .includes(compact(code).toUpperCase())
      || (name && compact(item.fullName).toLowerCase() === compact(name).toLowerCase()),
    );
    const email = mailbox || compact(user?.email).toLowerCase();
    if (!email) return;
    if (recipients.some((item) => item.email === email)) return;
    recipients.push({
      code: compact(code) || compact(user?.employeeCode),
      name: compact(name) || compact(user?.fullName) || compact(employee?.fullName) || 'Colleague',
      email,
    });
  };

  const person = findPerson(employees, compact(target?.employeeCode)) || findPerson(employees, compact(target?.name));
  if (person) {
    await push(personCode(person) || compact(target?.employeeCode), personLabel(person, compact(target?.name)), person);
  } else if (compact(target?.employeeCode) || compact(target?.name)) {
    await push(compact(target?.employeeCode), compact(target?.name), null);
  }

  if (!recipients.length && target?.roles?.length) {
    const needed = target.roles.map((role) => role.toLowerCase());
    for (const user of users) {
      const haystack = (user.roles || []).map((role) => String(role).toLowerCase());
      if (!needed.some((role) => haystack.includes(role) || haystack.some((item) => item.includes(role)))) continue;
      await push(compact(user.employeeCode || user.employeeId || user.username), compact(user.fullName), findPerson(employees, compact(user.employeeCode)));
    }
  }
  return recipients;
};

const notify = async (
  session: SessionPayload | null,
  title: string,
  body: string,
  href: string,
  target?: NotifyTarget,
  review?: InternshipReview | null,
): Promise<NotifyDelivery> => {
  if (!session) return { sent: false, reason: 'No session.' };
  const recipients = await resolveNotifyRecipients(target);
  const workspaceLink = toAbsoluteWorkflowHref(href);
  let last: NotifyDelivery = { sent: false, reason: recipients.length ? undefined : 'No recipient mailbox resolved for the line manager.' };

  for (const recipient of recipients.length ? recipients : [{
    code: compact(target?.employeeCode) || 'ROLE-INTERNSHIP-REVIEW',
    name: compact(target?.name) || 'Assigned approver',
    email: '',
  }]) {
    try {
      await createEnterpriseNotification(session, {
        title,
        body,
        module: 'Performance Management',
        kind: 'Workflow',
        href,
        recipientEmployeeCode: recipient.code || 'ROLE-INTERNSHIP-REVIEW',
        recipientRoles: target?.roles || [],
        actor: session.fullName,
        channels: recipient.email ? ['In-App', 'Email'] : ['In-App'],
      });
    } catch {
      // Notifications are best-effort; the review record still persists.
    }
    if (!recipient.email) continue;
    try {
      const result = await sendInternshipReviewTaskEmail({
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        internName: review?.employee.name || title,
        internCode: review?.employee.code || '',
        internDepartment: review?.employee.department,
        reviewId: review?.id || '',
        dueDate: review?.dueDate,
        stage: review?.status,
        intro: body,
        workspaceLink,
        actionLabel: /evaluat/i.test(href) ? 'Open ESS evaluation' : /approve/i.test(href) ? 'Open ESS approval' : 'Open ESS Internship Review',
      });
      last = result.sent
        ? { sent: true, to: recipient.email }
        : { sent: false, to: recipient.email, reason: result.reason || 'Email provider did not accept the message.' };
    } catch (error) {
      last = { sent: false, to: recipient.email, reason: error instanceof Error ? error.message : 'Email send failed.' };
    }
  }
  return last;
};

const notifyPeople = async (
  session: SessionPayload | null,
  title: string,
  body: string,
  href: string,
  people: Array<{ code?: string; name?: string }>,
  fallbackRoles: string[],
  review?: InternshipReview | null,
) => {
  const named = people.filter((item) => compact(item.code) || compact(item.name));
  if (named.length) {
    let last: NotifyDelivery = { sent: false, reason: 'No recipient mailbox resolved for the line manager.' };
    for (const person of named) {
      last = await notify(session, title, body, href, { employeeCode: person.code, name: person.name, roles: fallbackRoles }, review);
    }
    return last;
  }
  return notify(session, title, body, href, { roles: fallbackRoles }, review);
};

let writeChain: Promise<void> = Promise.resolve();

const withLock = async <T,>(fn: () => Promise<T>) => {
  let result!: T;
  writeChain = writeChain.then(async () => {
    result = await fn();
  });
  await writeChain;
  return result;
};

const parseReview = (raw: unknown): InternshipReview | null => {
  if (!raw) return null;
  try {
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as InternshipReview;
    if (!parsed?.id || !parsed.employee?.code) return null;
    return parsed;
  } catch {
    return null;
  }
};

const persistReview = async (review: InternshipReview) => {
  const pool = await getInternshipReviewSqlPool();
  await pool.request()
    .input('ReviewId', sql.NVarChar(80), review.id)
    .input('EmployeeCode', sql.NVarChar(80), review.employee.code)
    .input('EmployeeName', sql.NVarChar(220), review.employee.name)
    .input('Department', sql.NVarChar(180), review.employee.department || null)
    .input('Status', sql.NVarChar(60), review.status)
    .input('Supervisor', sql.NVarChar(220), review.supervisor || null)
    .input('SupervisorCode', sql.NVarChar(80), review.supervisorCode || review.employee.lineManagerCode || null)
    .input('DueDate', sql.Date, review.dueDate || null)
    .input('Overall', sql.Decimal(9, 4), Number(review.overall || 0))
    .input('CreatedBy', sql.NVarChar(160), review.createdBy)
    .input('CreatedAt', sql.DateTime2(3), new Date(review.createdAt || Date.now()))
    .input('UpdatedAt', sql.DateTime2(3), new Date())
    .input('ReviewJson', sql.NVarChar(sql.MAX), JSON.stringify(review))
    .query(`
      MERGE [hris].[InternshipReviews] AS target
      USING (SELECT @ReviewId AS ReviewId) AS source
      ON target.ReviewId = source.ReviewId
      WHEN MATCHED THEN UPDATE SET
        EmployeeCode = @EmployeeCode,
        EmployeeName = @EmployeeName,
        Department = @Department,
        Status = @Status,
        Supervisor = @Supervisor,
        SupervisorCode = @SupervisorCode,
        DueDate = @DueDate,
        Overall = @Overall,
        UpdatedAt = @UpdatedAt,
        ReviewJson = @ReviewJson
      WHEN NOT MATCHED THEN INSERT
        (ReviewId, EmployeeCode, EmployeeName, Department, Status, Supervisor, SupervisorCode, DueDate, Overall, CreatedBy, CreatedAt, UpdatedAt, ReviewJson)
      VALUES
        (@ReviewId, @EmployeeCode, @EmployeeName, @Department, @Status, @Supervisor, @SupervisorCode, @DueDate, @Overall, @CreatedBy, @CreatedAt, @UpdatedAt, @ReviewJson);
    `);
};

export const listInternshipReviews = async (): Promise<InternshipReview[]> => {
  const pool = await getInternshipReviewSqlPool();
  const result = await pool.request().query(`
    SELECT ReviewJson
    FROM [hris].[InternshipReviews]
    ORDER BY CreatedAt DESC
  `);
  return (result.recordset || [])
    .map((row: { ReviewJson?: string }) => parseReview(row.ReviewJson))
    .filter((item): item is InternshipReview => Boolean(item));
};

export const getInternshipReview = async (id: string) =>
  (await listInternshipReviews()).find((review) => review.id === id) || null;

export const getInternshipReviewSettings = async (): Promise<InternshipReviewSettings> => {
  const pool = await getInternshipReviewSqlPool();
  const result = await pool.request()
    .input('SettingsKey', sql.NVarChar(80), SETTINGS_KEY)
    .query(`
      SELECT TOP 1 EligibilityMonths, Workflow, ReminderSchedule, LockAfterSubmission
      FROM [hris].[InternshipReviewSettings]
      WHERE SettingsKey = @SettingsKey
    `);
  const row = result.recordset[0] as {
    EligibilityMonths?: number;
    Workflow?: string;
    ReminderSchedule?: string;
    LockAfterSubmission?: boolean;
  } | undefined;
  if (!row) return defaultSettings();
  return {
    eligibilityMonths: Number(row.EligibilityMonths || 12),
    workflow: compact(row.Workflow) || defaultSettings().workflow,
    reminderSchedule: compact(row.ReminderSchedule) || defaultSettings().reminderSchedule,
    lockAfterSubmission: row.LockAfterSubmission !== false,
  };
};

export const saveInternshipReviewSettings = async (patch: Partial<InternshipReviewSettings>, actor = 'HR') => {
  const next = { ...defaultSettings(), ...(await getInternshipReviewSettings()), ...patch };
  const pool = await getInternshipReviewSqlPool();
  await pool.request()
    .input('SettingsKey', sql.NVarChar(80), SETTINGS_KEY)
    .input('EligibilityMonths', sql.Int, next.eligibilityMonths)
    .input('Workflow', sql.NVarChar(200), next.workflow)
    .input('ReminderSchedule', sql.NVarChar(200), next.reminderSchedule)
    .input('LockAfterSubmission', sql.Bit, next.lockAfterSubmission ? 1 : 0)
    .input('UpdatedBy', sql.NVarChar(160), actor)
    .query(`
      MERGE [hris].[InternshipReviewSettings] AS target
      USING (SELECT @SettingsKey AS SettingsKey) AS source
      ON target.SettingsKey = source.SettingsKey
      WHEN MATCHED THEN UPDATE SET
        EligibilityMonths = @EligibilityMonths,
        Workflow = @Workflow,
        ReminderSchedule = @ReminderSchedule,
        LockAfterSubmission = @LockAfterSubmission,
        UpdatedAt = SYSUTCDATETIME(),
        UpdatedBy = @UpdatedBy
      WHEN NOT MATCHED THEN INSERT
        (SettingsKey, EligibilityMonths, Workflow, ReminderSchedule, LockAfterSubmission, UpdatedBy)
      VALUES
        (@SettingsKey, @EligibilityMonths, @Workflow, @ReminderSchedule, @LockAfterSubmission, @UpdatedBy);
    `);
  return next;
};

export const listEligibleInternshipInterns = async (): Promise<InternshipEligibleIntern[]> => {
  const settings = await getInternshipReviewSettings();
  const employees = await directoryEmployees();
  const active = employees.filter((employee) => {
    const status = compact(employee.status).toLowerCase();
    return !['resigned', 'terminated', 'retired', 'inactive'].includes(status);
  });
  const interns = active.filter(isStipendPayrollEmployeeCode);
  const mapped = interns.map((employee) => {
    const start = compact(employee.dateJoined || employee.contractStartDate).slice(0, 10);
    const monthsCompleted = monthsBetween(start || nowIsoDate());
    const manager = findPerson(employees, compact(employee.managerName));
    const hodRef = compact(
      compact(employee.departmentHead) && compact(employee.departmentHead) !== compact(employee.managerName)
        ? employee.departmentHead
        : compact(employee.functionalManager) && compact(employee.functionalManager) !== compact(employee.managerName)
          ? employee.functionalManager
          : '',
    );
    const hod = findPerson(employees, hodRef);
    return {
      code: compact(employee.employeeCode || employee.employeeId),
      name: employee.fullName,
      department: employee.department || 'Unassigned',
      jobTitle: employee.jobTitle || employee.designation || 'Intern',
      email: compact(employee.officialEmail || employee.email),
      internshipStart: start || nowIsoDate(),
      lineManager: personLabel(manager, compact(employee.managerName)),
      lineManagerCode: personCode(manager) || compact(employeeCodeFromReference(compact(employee.managerName))),
      hod: personLabel(hod, compact(hodRef)) || undefined,
      hodCode: personCode(hod) || compact(employeeCodeFromReference(hodRef)) || undefined,
      monthsCompleted,
      eligible: monthsCompleted >= settings.eligibilityMonths,
    } satisfies InternshipEligibleIntern;
  });
  return mapped.sort((a, b) => compareEmployeeCodesSerial(a.code, b.code) || a.name.localeCompare(b.name));
};

export const internshipReviewKpis = (reviews: InternshipReview[]) => {
  const open = reviews.filter((review) => !['Approved', 'HR Action', 'Closed'].includes(review.status)).length;
  const awaiting = reviews.filter((review) => ['Pending HOD', 'Pending HR Manager', 'Pending MD'].includes(review.status)).length;
  const month = nowIsoDate().slice(0, 7);
  const approvedMonth = reviews.filter((review) => (review.status === 'Approved' || review.status === 'HR Action' || review.status === 'Closed') && String(review.updatedAt || '').slice(0, 7) === month).length;
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

const averageStageDays = (reviews: InternshipReview[], role: InternshipApproval['role']) => {
  const values: number[] = [];
  for (const review of reviews) {
    const step = review.approvals.find((item) => item.role === role && item.at);
    if (!step?.at) continue;
    const index = review.approvals.findIndex((item) => item.role === role);
    const previous = review.approvals.slice(0, index).reverse().find((item) => item.at);
    const start = previous?.at || review.createdAt;
    const from = Date.parse(start);
    const to = Date.parse(step.at);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      values.push((to - from) / 86400000);
    }
  }
  if (!values.length) return '—';
  return `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)} days`;
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
      { stage: 'Line Manager', days: averageStageDays(reviews, 'LINE_MANAGER') },
      { stage: 'HOD / Functional Manager', days: averageStageDays(reviews, 'HOD') },
      { stage: 'HR Manager', days: averageStageDays(reviews, 'HR_MANAGER') },
      { stage: 'MD Final Approval', days: averageStageDays(reviews, 'MD') },
    ],
  };
};

const nextReviewId = async (reviews: InternshipReview[]) => {
  const year = new Date().getFullYear();
  const seq = reviews.reduce((max, review) => {
    const match = review.id.match(/^IPR-(\d{4})-(\d+)$/);
    if (!match || Number(match[1]) !== year) return max;
    return Math.max(max, Number(match[2]));
  }, 0);
  return `IPR-${year}-${String(seq + 1).padStart(4, '0')}`;
};

const requireReview = async (id: string) => {
  const review = await getInternshipReview(id);
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
    bypassEligibility?: boolean;
  },
  actor: string,
  session: SessionPayload | null,
) => {
  const interns = await listEligibleInternshipInterns();
  const intern = interns.find((item) => item.code === input.employeeCode);
  if (!intern) throw new Error('Select an intern from the Employee Directory.');
  const settings = await getInternshipReviewSettings();
  if (!intern.eligible && !input.bypassEligibility) {
    throw new Error(
      `This intern has completed ${intern.monthsCompleted} month(s). Standard eligibility is ${settings.eligibilityMonths} months. Tick “Bypass eligibility and initiate anyway” if HR still wants to start this review.`,
    );
  }
  if (!intern.lineManager) throw new Error('Reporting line is missing. Resolve the line manager from organization hierarchy before initiation.');

  return withLock(async () => {
    const reviews = await listInternshipReviews();
    if (reviews.some((review) => review.employee.code === intern.code && !['Closed'].includes(review.status))) {
      throw new Error('An open internship review already exists for this intern.');
    }
    const employees = await directoryEmployees();
    const hrManagers = findRoleHolders(employees, /\bHR Manager\b|\bHead of HR\b|\bHR Director\b|\bHuman Resource(s)? Manager\b/i);
    const managingDirectors = findRoleHolders(employees, /\bManaging Director\b|\bChief Executive\b|\bMD\b|\bCEO\b/i);
    const hrManager = hrManagers[0] || null;
    const md = managingDirectors[0] || null;
    const hod = intern.hod || input.hod || '';
    const review: InternshipReview = {
      id: await nextReviewId(reviews),
      employee: intern,
      cycle: input.cycle || INTERNSHIP_REVIEW_CYCLE,
      dueDate: input.dueDate || plusDays(7),
      status: 'In Evaluation',
      supervisor: intern.lineManager,
      supervisorCode: intern.lineManagerCode || '',
      scores: [],
      strength: '',
      improvement: '',
      impression: '',
      recommendation: '',
      overall: 0,
      approvals: defaultApprovals({
        lineManager: intern.lineManager,
        lineManagerCode: intern.lineManagerCode,
        hod,
        hodCode: intern.hodCode,
        hrManager: personLabel(hrManager, 'HR Manager'),
        hrManagerCode: personCode(hrManager),
        md: personLabel(md, 'Managing Director'),
        mdCode: personCode(md),
      }),
      instructions: input.instructions || '',
      notifyManager: input.notifyManager !== false,
      reminders: input.reminders !== false,
      eligibilityBypassed: Boolean(!intern.eligible && input.bypassEligibility),
      createdAt: nowIsoDate(),
      updatedAt: nowIsoDate(),
      createdBy: actor,
      audit: [
        audit(actor, 'Review initiated by HR', intern.eligible
          ? 'Employee and reporting line validated'
          : `Eligibility bypassed: intern completed ${intern.monthsCompleted} of ${settings.eligibilityMonths} required months`),
        audit('System', 'Line manager notified', input.notifyManager === false ? 'Notification suppressed' : 'ESS task generated for the line manager'),
      ],
    };
    if (!hod) {
      review.audit.push(audit('System', 'HOD stage skipped', 'No HOD / Functional Manager resolved from organization hierarchy'));
    }
    await persistReview(review);
    if (input.notifyManager !== false) {
      const delivery = await notifyPeople(
        session,
        `Internship review assigned: ${review.employee.name}`,
        `Complete the one-year internship evaluation for ${review.employee.name} (${review.id}) in the ESS portal. Due ${review.dueDate}.`,
        internshipEssHref({ id: review.id, action: 'evaluate' }),
        [{ code: intern.lineManagerCode || review.supervisorCode, name: intern.lineManager || review.supervisor }],
        [],
        review,
      );
      review.audit.push(audit(
        'System',
        delivery.sent ? 'Line manager email sent' : 'Line manager email not sent',
        delivery.sent
          ? `Email delivered to ${delivery.to}`
          : delivery.reason || 'No mailbox resolved for the assigned line manager',
      ));
      await persistReview(review);
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
  session?: SessionPayload | null,
) =>
  withLock(async () => {
    const review = await requireReview(id);
    if (session && !internshipCanEvaluate(review, session)) {
      throw new Error('Only the assigned line manager can save this evaluation in the ESS portal.');
    }
    const settings = await getInternshipReviewSettings();
    if (internshipEvaluationLocked(review.status) && settings.lockAfterSubmission) {
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
    await persistReview(review);
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
  withLock(async () => {
    const review = await requireReview(id);
    if (session && !internshipCanEvaluate(review, session)) {
      throw new Error('Only the assigned line manager can submit this evaluation in the ESS portal.');
    }
    const settings = await getInternshipReviewSettings();
    if (internshipEvaluationLocked(review.status) && settings.lockAfterSubmission) {
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
      line.approverCode = compact(session?.employeeCode || session?.employeeId || line.approverCode);
      line.at = nowIsoDate();
    }
    const next = internshipNextStatus(review, 'LINE_MANAGER', 'approve');
    review.status = next;
    review.updatedAt = nowIsoDate();
    review.audit.push(audit(actor, 'Evaluation submitted', `Overall ${review.overall.toFixed(1)} · ${review.recommendation}`));
    await persistReview(review);
    const nextStep = internshipCurrentApprovalStep(review);
    await notifyPeople(
      session,
      `Internship evaluation submitted: ${review.employee.name}`,
      `${actor} submitted ${review.id}. Next stage: ${next}. Complete this in the ESS portal.`,
      internshipEssHref({ id: review.id, action: 'approve' }),
      [{ code: nextStep?.approverCode, name: nextStep?.approver }],
      next === 'Pending HR Manager' ? ['HR Manager'] : next === 'Pending MD' ? ['Managing Director'] : [],
      review,
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
  withLock(async () => {
    const review = await requireReview(id);
    if (session && !internshipCanApprove(review, session)) {
      throw new Error('This approval can only be completed in the ESS portal by the assigned approver.');
    }
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
    step.approverCode = compact(session?.employeeCode || session?.employeeId || step.approverCode);
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
      await persistReview(review);
      await notifyPeople(
        session,
        `Internship review returned: ${review.employee.name}`,
        `${actor} returned ${review.id}. ${comment.trim()}`,
        internshipEssHref({ id: review.id, action: 'evaluate' }),
        [{ code: review.supervisorCode || review.employee.lineManagerCode, name: review.supervisor }],
        [],
        review,
      );
    } else {
      review.audit.push(audit(actor, `${step.step} approved`, comment.trim() || 'Approved and routed onward'));
      await persistReview(review);
      if (next === 'Approved') {
        review.audit.push(audit('System', 'Final approval completed', 'HR and the line manager have been notified. Evaluation is locked.'));
        await persistReview(review);
        await notify(
          session,
          `MD approved internship review: ${review.employee.name}`,
          `${review.id} is approved. Record the HR next action in HRIS.`,
          internshipReviewHref(review.id),
          { roles: ['HR Manager', 'HR Officer', 'HR Director'] },
          review,
        );
        await notifyPeople(
          session,
          `Internship review approved: ${review.employee.name}`,
          `${review.id} received MD approval.`,
          internshipEssHref({ id: review.id }),
          [{ code: review.supervisorCode || review.employee.lineManagerCode, name: review.supervisor }],
          [],
          review,
        );
      } else {
        const nextStep = internshipCurrentApprovalStep(review);
        await notifyPeople(
          session,
          `Internship review approved onward: ${review.employee.name}`,
          `${actor} approved ${review.id}. Next stage: ${next}. Complete this in the ESS portal.`,
          internshipEssHref({ id: review.id, action: 'approve' }),
          [{ code: nextStep?.approverCode, name: nextStep?.approver }],
          next === 'Pending HR Manager' ? ['HR Manager'] : next === 'Pending MD' ? ['Managing Director'] : [],
          review,
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
  withLock(async () => {
    const review = await requireReview(id);
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
    await persistReview(review);
    if (payload.notifyOnHrAction !== false) {
      await notifyPeople(
        session,
        `HR action recorded: ${review.employee.name}`,
        `${payload.hrAction} for ${review.id}.`,
        internshipEssHref({ id: review.id }),
        [{ code: review.supervisorCode || review.employee.lineManagerCode, name: review.supervisor }],
        [],
        review,
      );
    }
    return review;
  });

export const internshipTasksForActor = (reviews: InternshipReview[], actorName: string, roleHint = '') =>
  internshipTasksForSession(reviews, { fullName: actorName, roles: roleHint ? [roleHint] : [] });

export const resendInternshipInitiationNotice = async (
  id: string,
  session: SessionPayload | null,
  actor = 'System',
) => {
  const review = await requireReview(id);
  const href = internshipEssHref({
    id: review.id,
    action: review.status === 'In Evaluation' ? 'evaluate' : 'approve',
  });
  const delivery = await notifyPeople(
    session,
    `Internship review assigned: ${review.employee.name}`,
    `Complete the internship evaluation for ${review.employee.name} (${review.id}) in the ESS portal. Due ${review.dueDate}.`,
    href,
    [{
      code: review.supervisorCode || review.employee.lineManagerCode,
      name: review.supervisor || review.employee.lineManager,
    }],
    [],
    review,
  );
  review.audit.push(audit(
    actor,
    delivery.sent ? 'Line manager email sent' : 'Line manager email not sent',
    delivery.sent
      ? `Email delivered to ${delivery.to}`
      : delivery.reason || 'No mailbox resolved for the assigned line manager',
  ));
  review.updatedAt = nowIsoDate();
  await persistReview(review);
  if (!delivery.sent) {
    throw new Error(delivery.reason || 'Unable to email the assigned line manager.');
  }
  return { review, delivery };
};

export const buildEssInternshipWorkspace = async (session: SessionPayload) => {
  const reviews = await listInternshipReviews();
  return {
    tasks: internshipTasksForSession(reviews, session),
    reviews: reviews.filter((review) => internshipActorInvolved(review, session)),
  };
};

export type EssInternshipWorkspace = Awaited<ReturnType<typeof buildEssInternshipWorkspace>>;
