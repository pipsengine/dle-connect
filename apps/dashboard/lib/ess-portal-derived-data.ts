type EssRequestLike = {
  id: string;
  category: string;
  title: string;
  status: string;
  submittedAt: string;
  updatedAt?: string;
  attachmentNames?: string[];
  comments?: Array<{ at: string; actor: string; comment: string }>;
};

type EssDocumentLike = {
  id: string;
  title: string;
  category: string;
  version: string;
  status: string;
};

type LoanLike = {
  id: string;
  productId: string;
  principal: number;
  outstandingBalance: number;
  tenorMonths: number;
  installmentsPaid: number;
  approvalStatus: string;
  purpose: string;
  requestedAt: string;
  updatedAt: string;
};

const compact = (value: unknown) => String(value || '').trim();
const matches = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase());

export const deriveEssClaims = (requests: EssRequestLike[]) =>
  requests
    .filter((item) => matches(`${item.category} ${item.title}`, /claim|reimbursement|expense|advance|medical/) && !matches(`${item.category} ${item.title}`, /travel/))
    .map((item) => ({
      id: item.id,
      type: item.title || item.category,
      amount: 0,
      status: item.status,
      submittedAt: item.submittedAt,
      attachmentStatus: item.attachmentNames?.length ? 'Uploaded' : 'Not attached',
    }));

export const deriveEssTravel = (requests: EssRequestLike[]) =>
  requests
    .filter((item) => matches(`${item.category} ${item.title}`, /travel/))
    .map((item) => ({
      id: item.id,
      destination: item.title.replace(/travel\s*(request|to)?/i, '').trim() || item.title,
      purpose: item.title,
      advance: 0,
      status: item.status,
      tripReport: /approved|closed|complete/i.test(item.status) ? 'Due' : 'Not Due',
      submittedAt: item.submittedAt,
    }));

export const deriveEssAssets = (requests: EssRequestLike[], documents: EssDocumentLike[]) => {
  const fromRequests = requests
    .filter((item) => matches(`${item.category} ${item.title}`, /asset|ppe|equipment|laptop|mobile|device/))
    .map((item) => ({
      id: item.id,
      tag: item.id.slice(0, 12).toUpperCase(),
      name: item.title || item.category,
      status: /approved|active|assigned/i.test(item.status) ? 'Assigned' : item.status,
      acknowledgement: item.attachmentNames?.length ? 'Acknowledged' : 'Pending',
      condition: 'On file',
    }));

  const fromDocuments = documents
    .filter((doc) => matches(`${doc.title} ${doc.category}`, /asset|ppe|equipment|laptop|mobile|device|toolkit/))
    .map((doc) => ({
      id: doc.id,
      tag: doc.id.replace('doc-', 'DOC-'),
      name: doc.title,
      status: /current|active|verified/i.test(doc.status) ? 'Assigned' : doc.status,
      acknowledgement: 'On record',
      condition: doc.status || 'Current',
    }));

  return [...fromRequests, ...fromDocuments];
};

export const deriveEssPerformance = (input: {
  attendanceRate: number;
  requests: EssRequestLike[];
  documents: EssDocumentLike[];
}) => {
  const { attendanceRate, requests, documents } = input;
  const terminal = (status: string) => /approved|rejected|closed|terminated|complete/i.test(status);
  const approved = requests.filter((item) => /approved|closed|complete/i.test(item.status)).length;
  const taskCompletion = requests.length ? Math.round((approved / requests.length) * 100) : 0;

  const goals = documents
    .filter((doc) => matches(`${doc.title} ${doc.category}`, /goal|objective|target|appraisal|performance plan/))
    .map((doc, index) => ({
      id: doc.id,
      title: doc.title,
      progress: /complete|closed|verified/i.test(doc.status) ? 100 : 50,
      dueDate: '',
      status: doc.status,
    }));

  const reviews = documents
    .filter((doc) => matches(`${doc.title} ${doc.category}`, /review|appraisal|rating|scorecard/))
    .map((doc) => ({
      id: doc.id,
      cycle: doc.category || 'Performance Review',
      form: doc.title,
      status: doc.status,
      score: null as number | null,
    }));

  return {
    goals,
    kpis: [
      { label: 'Attendance reliability', value: Math.round(attendanceRate), target: 95 },
      { label: 'Request completion', value: taskCompletion, target: 85 },
      { label: 'Documents on file', value: documents.length, target: 1 },
    ],
    reviews,
    developmentPlans: [] as Array<{ id: string; title: string; owner: string; status: string }>,
  };
};

export const deriveEssLearning = (documents: EssDocumentLike[]) => {
  const courses = documents
    .filter((doc) => matches(`${doc.title} ${doc.category}`, /course|training|workshop|enrol|hse refresher/))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      date: '',
      status: doc.status,
      type: doc.category || 'Course',
    }));

  const materials = documents
    .filter((doc) => matches(`${doc.title} ${doc.category}`, /handbook|guide|material|assessment|quiz|manual/))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      type: doc.category || 'Learning Material',
      status: doc.status,
    }));

  const certifications = documents
    .filter((doc) => matches(`${doc.title} ${doc.category}`, /certificate|certification|cert|licence|license|hse level/))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      expiresAt: '',
      status: /expir|renew|due/i.test(doc.status) ? 'Renewal Due' : doc.status || 'Valid',
    }));

  return { courses, materials, certifications };
};

export const deriveLoanRepaymentSchedules = (loans: LoanLike[]) =>
  loans
    .filter((loan) => loan.outstandingBalance > 0 && /approved|active/i.test(loan.approvalStatus))
    .flatMap((loan) => {
      const installmentAmount = Math.round(loan.outstandingBalance / Math.max(1, loan.tenorMonths - loan.installmentsPaid));
      const remaining = Math.max(0, loan.tenorMonths - loan.installmentsPaid);
      return Array.from({ length: Math.min(remaining, 6) }, (_, index) => {
        const due = new Date(loan.requestedAt || loan.updatedAt);
        due.setMonth(due.getMonth() + loan.installmentsPaid + index + 1);
        return {
          id: `${loan.id}-schedule-${index + 1}`,
          productId: loan.productId,
          installment: loan.installmentsPaid + index + 1,
          dueDate: due.toISOString().slice(0, 10),
          amount: installmentAmount,
          balance: Math.max(0, loan.outstandingBalance - installmentAmount * index),
          status: loan.approvalStatus,
        };
      });
    });

export const deriveLoanHistory = (loans: LoanLike[], productLabels: Map<string, string>) =>
  loans
    .filter((loan) => /closed|rejected/i.test(loan.approvalStatus) || loan.outstandingBalance <= 0)
    .map((loan) => ({
      id: loan.id,
      product: productLabels.get(loan.productId) || loan.productId,
      principal: loan.principal,
      status: loan.approvalStatus,
      closedAt: loan.updatedAt,
    }));

export const deriveEssAuditTrail = (input: {
  employeeName: string;
  employeeId: string;
  requests: EssRequestLike[];
}) => {
  const events = input.requests.flatMap((request) => [
    {
      at: request.submittedAt,
      actor: input.employeeName,
      action: `Submitted ${request.title || request.category}`,
      channel: 'ESS',
    },
    ...(request.comments || []).map((comment) => ({
      at: comment.at,
      actor: comment.actor,
      action: comment.comment,
      channel: 'ESS',
    })),
  ]);
  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 16);
};

export const derivePortalAnalytics = (input: {
  requests: EssRequestLike[];
  attendanceRate: number;
  leaveUtilizationPct: number;
  slaCompliancePct: number;
}) => {
  const open = input.requests.filter((item) => !/approved|rejected|closed|terminated|complete/i.test(item.status)).length;
  const approved = input.requests.filter((item) => /approved|closed|complete/i.test(item.status)).length;
  return [
    { label: 'Open requests', value: open, unit: '' },
    { label: 'Completed requests', value: approved, unit: '' },
    { label: 'Leave utilization', value: input.leaveUtilizationPct, unit: '%' },
    { label: 'Attendance rate', value: Math.round(input.attendanceRate), unit: '%' },
    { label: 'Workflow SLA compliance', value: input.slaCompliancePct, unit: '%' },
  ];
};

export type EssEmployeeReport = {
  id: string;
  title: string;
  format: string;
  status: 'Ready' | 'No Data';
  recordCount: number;
  category: 'leave' | 'payroll' | 'learning' | 'claims';
  lastUpdated: string;
};

export type EssReportDownloadTile = {
  id: string;
  title: string;
  format: string;
  accent: string;
  bg: string;
  status: 'Ready' | 'No Data';
};

type LeaveBalanceLike = { label?: string; entitlement?: number; used?: number; balance?: number; carryForward?: number };
type LeaveHistoryLike = { id?: string; type?: string; from?: string; to?: string; days?: number; status?: string };
type PayrollHistoryLike = { period?: string; periodLabel?: string; grossPay?: number; deductions?: number; netPay?: number; status?: string };
type LearningLike = { courses?: unknown[]; materials?: unknown[]; certifications?: unknown[] };
type ClaimLike = { id?: string; type?: string; status?: string; submittedAt?: string };

export const deriveEssEmployeeReports = (input: {
  leaveBalances: LeaveBalanceLike[];
  leaveHistory: LeaveHistoryLike[];
  payrollHistory: PayrollHistoryLike[];
  learning: LearningLike;
  claims: ClaimLike[];
  generatedAt: string;
}) => {
  const leaveRecords = Math.max(input.leaveHistory.length, input.leaveBalances.length);
  const payrollRecords = input.payrollHistory.length;
  const trainingRecords =
    (input.learning.courses?.length || 0) +
    (input.learning.certifications?.length || 0) +
    (input.learning.materials?.length || 0);
  const claimRecords = input.claims.length;
  const generatedAt = input.generatedAt;

  const reports: EssEmployeeReport[] = [
    {
      id: 'rpt-leave-statement',
      title: 'My Leave Statement',
      format: 'PDF / Excel',
      status: leaveRecords > 0 ? 'Ready' : 'No Data',
      recordCount: leaveRecords,
      category: 'leave',
      lastUpdated: generatedAt,
    },
    {
      id: 'rpt-payroll-history',
      title: 'Payroll History Report',
      format: 'PDF / Excel',
      status: payrollRecords > 0 ? 'Ready' : 'No Data',
      recordCount: payrollRecords,
      category: 'payroll',
      lastUpdated: generatedAt,
    },
    {
      id: 'rpt-training-transcript',
      title: 'Training Transcript',
      format: 'PDF',
      status: trainingRecords > 0 ? 'Ready' : 'No Data',
      recordCount: trainingRecords,
      category: 'learning',
      lastUpdated: generatedAt,
    },
    {
      id: 'rpt-claim-status',
      title: 'Claim Status Report',
      format: 'Excel',
      status: claimRecords > 0 ? 'Ready' : 'No Data',
      recordCount: claimRecords,
      category: 'claims',
      lastUpdated: generatedAt,
    },
  ];

  const downloads: EssReportDownloadTile[] = [
    { id: 'rpt-leave-statement', title: 'Leave statement', format: 'PDF / Excel', accent: '#16A34A', bg: '#ECFDF5', status: leaveRecords > 0 ? 'Ready' : 'No Data' },
    { id: 'rpt-payroll-history', title: 'Payroll history', format: 'PDF / Excel', accent: '#7C3AED', bg: '#F5F3FF', status: payrollRecords > 0 ? 'Ready' : 'No Data' },
    { id: 'rpt-training-transcript', title: 'Training transcript', format: 'PDF', accent: '#0891B2', bg: '#ECFEFF', status: trainingRecords > 0 ? 'Ready' : 'No Data' },
    { id: 'rpt-claim-status', title: 'Claim status', format: 'Excel', accent: '#EA580C', bg: '#FFF7ED', status: claimRecords > 0 ? 'Ready' : 'No Data' },
  ];

  return { reports, downloads };
};

export const monthlyRequestVolume = (requests: EssRequestLike[]) => {
  const buckets = new Map<string, number>();
  requests.forEach((request) => {
    const key = compact(request.submittedAt).slice(0, 7);
    if (!key) return;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.slice(-6).map(([, value]) => value);
};
