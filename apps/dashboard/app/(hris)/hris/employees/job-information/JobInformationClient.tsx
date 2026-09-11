'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Calendar,
  ChevronRight,
  Download,
  Filter,
  Fingerprint,
  GitCompare,
  History,
  Lock,
  Pencil,
  Printer,
  Send,
  ShieldAlert,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Department Head'
  | 'Line Manager'
  | 'Payroll Officer'
  | 'Auditor'
  | 'Employee'
  | 'Executive Management';

type EmploymentHistoryItem = {
  id: string;
  referenceNo: string;
  employeeId: string;
  employeeName: string;
  eventType: string;
  eventDate: string;
  effectiveDate: string;
  previousDepartment?: string | null;
  newDepartment?: string | null;
  previousJobTitle?: string | null;
  newJobTitle?: string | null;
  previousGrade?: string | null;
  newGrade?: string | null;
  previousManager?: string | null;
  newManager?: string | null;
  previousLocation?: string | null;
  newLocation?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason: string;
  approvalStatus: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
};

type EmployeeJob = Record<string, string | null>;
type EmployeeEmployment = Record<string, string | null>;

type EmployeeOverview = {
  profileCompletionPct: number;
  leaveBalanceDays: number;
  attendanceScore: number;
  trainingCompliancePct: number;
  performanceRating: 'A' | 'B' | 'C' | 'D' | '—';
  payrollStatus: 'Verified' | 'Pending Validation' | 'Masked';
  documentStatus: 'Compliant' | 'Missing' | 'Expiring';
  assetStatus: 'Assigned' | 'None';
};

type AIInsight = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  confidence: number;
  recommendation: string;
  actionLabel: string;
};

type JobChangeStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending HR Review'
  | 'Pending Department Head Approval'
  | 'Pending HR Director Approval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';

type JobChangeType =
  | 'Job Title Change'
  | 'Department Change'
  | 'Grade Change'
  | 'Reporting Manager Change'
  | 'Functional Manager Change'
  | 'Location Change'
  | 'Project Assignment Change'
  | 'Cost Center Change'
  | 'Role Profile Update';

type JobSupportingDoc = { id: string; name: string };

type JobChangeApproval = {
  id: string;
  at: string;
  stage: JobChangeStatus;
  decision: 'Approved' | 'Rejected';
  by: string;
  reason?: string | null;
};

type JobChangeRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  changeType: JobChangeType;
  status: JobChangeStatus;
  effectiveDate: string;
  reason: string;
  notes?: string | null;
  previousValues: Record<string, string | null>;
  newValues: Record<string, string | null>;
  supportingDocuments: JobSupportingDoc[];
  approvals: JobChangeApproval[];
  audit: { id: string; at: string; action: string; performedBy: string; oldValue?: string; newValue?: string; reason?: string }[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type JobInformationPayload = {
  employeeId: string;
  employeeName: string;
  approvalStatus: JobChangeStatus;
  approvalRef?: string | null;
  lastUpdatedAt: string;
  job: EmployeeJob;
  employment: EmployeeEmployment;
  roleProfile: Record<string, string | null>;
  projectAssignment: Record<string, string | null>;
  requests: JobChangeRequest[];
};

type FormOptions = {
  departments: string[];
  businessUnits: string[];
  divisions: string[];
  locations: string[];
  jobTitles: string[];
  designations: string[];
  jobGrades: string[];
  jobLevels: string[];
  costCenters: string[];
  workModes: string[];
  shiftPatterns: string[];
  staffCategories: string[];
  employeeCategories: string[];
  projectStatuses: string[];
  projects: { name: string; code: string; location: string; client: string }[];
  employees: { employeeId: string; fullName: string; department: string; jobTitle: string; manager: string; location: string }[];
};

type ApiState<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data?: T; error?: string };

const formatNumber = (n: number) => new Intl.NumberFormat('en-GB').format(n);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDateUtc = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const formatDateTimeUtc = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
};

const severityStyle = (s: 'high' | 'medium' | 'low') => {
  if (s === 'high') return { border: 'border-red-200', bg: 'bg-red-50', fg: 'text-red-800' };
  if (s === 'medium') return { border: 'border-amber-200', bg: 'bg-amber-50', fg: 'text-amber-800' };
  return { border: 'border-emerald-200', bg: 'bg-emerald-50', fg: 'text-emerald-800' };
};

async function apiFetch<T>(employeeId: string, resource: string, init: RequestInit & { role: Role; viewerEmployeeId?: string }) {
  const res = await fetch(`/api/hris/employees/${encodeURIComponent(employeeId)}/${resource}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'x-hris-role': init.role,
      ...(init.viewerEmployeeId ? { 'x-hris-employee-id': init.viewerEmployeeId } : {}),
    },
  });
  const json = (await res.json().catch(() => null)) as { status?: string; data?: T; error?: string } | null;
  if (!res.ok || !json || json.status !== 'success') throw new Error(json?.error || 'Request failed');
  return json.data as T;
}

async function apiFetchGlobal<T>(path: string, init: RequestInit & { role: Role; viewerEmployeeId?: string }) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'x-hris-role': init.role,
      ...(init.viewerEmployeeId ? { 'x-hris-employee-id': init.viewerEmployeeId } : {}),
    },
  });
  const json = (await res.json().catch(() => null)) as { status?: string; data?: T; error?: string } | null;
  if (!res.ok || !json || json.status !== 'success') throw new Error(json?.error || 'Request failed');
  return json.data as T;
}

async function apiPostGlobal<T>(path: string, body: any, init: { role: Role; viewerEmployeeId?: string }) {
  return apiFetchGlobal<T>(path, {
    method: 'POST',
    role: init.role,
    viewerEmployeeId: init.viewerEmployeeId,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-slate-200/60 rounded-2xl shadow-sm ${className || ''}`}>{children}</div>
);

const Pill = ({ label }: { label: string }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-extrabold">{label}</span>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
    <div className="text-sm font-extrabold text-slate-900 mt-1">{value || '—'}</div>
  </div>
);

const Modal = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => (
  <AnimatePresence>
    {open ? (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.16 }}
          className="mx-auto mt-10 w-[96%] max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      </motion.div>
    ) : null}
  </AnimatePresence>
);

const buildPdf = (title: string, lines: string[]) => {
  const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const clean = (s: string) => escapePdf(s.replace(/\r?\n/g, ' ').slice(0, 170));
  const fontSize = 10;
  const lineHeight = 12;
  const startY = 760;
  const x = 40;
  const all = [title, ...lines].slice(0, 55);
  const streamParts: string[] = [];
  streamParts.push(`BT /F1 ${fontSize} Tf ${x} ${startY} Td`);
  for (let i = 0; i < all.length; i++) {
    streamParts.push(`(${clean(all[i] || '')}) Tj`);
    if (i !== all.length - 1) streamParts.push(`0 -${lineHeight} Td`);
  }
  streamParts.push('ET');
  const stream = streamParts.join('\n');

  const encoder = new TextEncoder();
  const xref: number[] = [0];
  let out = '%PDF-1.4\n';
  const pushObj = (obj: string) => {
    xref.push(out.length);
    out += obj;
  };
  pushObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  pushObj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  pushObj('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  pushObj('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  const streamBytes = encoder.encode(stream);
  pushObj(`5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`);

  const startXref = out.length;
  out += `xref\n0 ${xref.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < xref.length; i++) out += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return encoder.encode(out);
};

export default function JobInformationClient({ initialNow, employeeId }: { initialNow: string; employeeId: string }) {
  const [role, setRole] = useState<Role>('HR Manager');
  const [viewerEmployeeId, setViewerEmployeeId] = useState<string | undefined>(undefined);
  const [employeeInput, setEmployeeInput] = useState(employeeId);
  const [activeEmployeeId, setActiveEmployeeId] = useState(employeeId);
  const [refreshToken, setRefreshToken] = useState(0);

  const [jobInfo, setJobInfo] = useState<ApiState<JobInformationPayload>>({ status: 'idle' });
  const [overview, setOverview] = useState<ApiState<EmployeeOverview>>({ status: 'idle' });
  const [jobHistory, setJobHistory] = useState<ApiState<EmploymentHistoryItem[]>>({ status: 'idle' });
  const [jobAi, setJobAi] = useState<ApiState<AIInsight[]>>({ status: 'idle' });
  const [formOptions, setFormOptions] = useState<ApiState<FormOptions>>({ status: 'idle' });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<'overview' | 'job' | 'role' | 'project' | 'history' | 'workflow' | 'audit'>('overview');
  const [toast, setToast] = useState<{ title: string; detail: string; tone: 'ok' | 'warn' | 'err' } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestAudit, setRequestAudit] = useState<ApiState<{ id: string; at: string; action: string; performedBy: string; oldValue?: string; newValue?: string; reason?: string }[]>>({ status: 'idle' });
  const [draft, setDraft] = useState<{
    requestId?: string;
    changeType: JobChangeType;
    effectiveDate: string;
    reason: string;
    notes: string;
    newValues: Record<string, string | null>;
    supportingDocuments: JobSupportingDoc[];
  }>({
    changeType: 'Department Change',
    effectiveDate: initialNow,
    reason: '',
    notes: '',
    newValues: {},
    supportingDocuments: [],
  });

  const nowStamp = useMemo(() => formatDateTimeUtc(initialNow), [initialNow]);
  const nowMs = useMemo(() => new Date(initialNow).getTime(), [initialNow]);

  useEffect(() => {
    if (!changeModalOpen) return;
    if (formOptions.status === 'ready' || formOptions.status === 'loading') return;
    let cancelled = false;
    const run = async () => {
      try {
        setFormOptions({ status: 'loading' });
        const data = await apiFetchGlobal<FormOptions>('/api/hris/job-information/form-options', { method: 'GET', role, viewerEmployeeId });
        if (cancelled) return;
        setFormOptions({ status: 'ready', data });
      } catch (e) {
        if (cancelled) return;
        setFormOptions({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load form options' });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [changeModalOpen, formOptions.status, role, viewerEmployeeId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setJobInfo({ status: 'loading' });
      setOverview({ status: 'loading' });
      setJobHistory({ status: 'loading' });
      setJobAi({ status: 'loading' });
      try {
        const [ji, o, h, ai] = await Promise.all([
          apiFetch<JobInformationPayload>(activeEmployeeId, 'job-information', { method: 'GET', role, viewerEmployeeId }),
          apiFetch<EmployeeOverview>(activeEmployeeId, 'overview', { method: 'GET', role, viewerEmployeeId }),
          apiFetch<EmploymentHistoryItem[]>(activeEmployeeId, 'job-history', { method: 'GET', role, viewerEmployeeId }),
          apiFetch<AIInsight[]>(activeEmployeeId, 'job-ai-insights', { method: 'GET', role, viewerEmployeeId }),
        ]);
        if (cancelled) return;
        setJobInfo({ status: 'ready', data: ji });
        setOverview({ status: 'ready', data: o });
        setJobHistory({ status: 'ready', data: h });
        setJobAi({ status: 'ready', data: ai });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unable to load job information';
        setJobInfo({ status: 'error', error: msg });
        setOverview({ status: 'error', error: msg });
        setJobHistory({ status: 'error', error: msg });
        setJobAi({ status: 'error', error: msg });
      }
    };
    const t = setTimeout(() => void run(), 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [activeEmployeeId, refreshToken, role, viewerEmployeeId]);

  const jobData = jobInfo.data?.job;
  const empData = jobInfo.data?.employment;
  const overviewData = overview.data;
  const historyItems = jobHistory.data || [];
  const requests = jobInfo.data?.requests || [];
  const latestRequest = requests[0] || null;
  const approvalStatus = jobInfo.data?.approvalStatus || 'Approved';

  const breadcrumbs = (
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      <span className="text-slate-700 font-extrabold">HRIS</span>
      <ChevronRight className="w-4 h-4" />
      <span className="text-slate-700 font-extrabold">Employees</span>
      <ChevronRight className="w-4 h-4" />
      <span>Job Information</span>
    </div>
  );

  const header = (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-11 h-11 rounded-2xl bg-dle-blue/10 border border-slate-200/60 flex items-center justify-center text-dle-blue">
              <BriefcaseBusiness className="w-6 h-6" />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-900">Job Information</div>
              <div className="text-sm text-slate-600 font-semibold mt-1">Audit-ready job assignment, reporting line, grade, and org placement snapshot for the selected employee.</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Pill label={`Employee: ${activeEmployeeId}`} />
            <Pill label={`Loaded: ${nowStamp}`} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Link
            href={`/hris/employees/employee-profile/${encodeURIComponent(activeEmployeeId)}`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <UserCircle2 className="w-4 h-4" />
            Open Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              if (!jobInfo.data) {
                setToast({ title: 'Not ready', detail: 'Wait for job information to load.', tone: 'warn' });
                return;
              }
              const cur = jobInfo.data;
              setDraft((d) => ({
                ...d,
                requestId: undefined,
                changeType: 'Department Change',
                effectiveDate: initialNow,
                reason: '',
                notes: '',
                newValues: {
                  jobTitle: cur.job.jobTitle ?? null,
                  designation: cur.job.designation ?? null,
                  jobGrade: cur.job.jobGrade ?? null,
                  jobLevel: cur.job.jobLevel ?? null,
                  department: cur.job.department ?? null,
                  division: cur.job.division ?? null,
                  businessUnit: cur.job.businessUnit ?? null,
                  costCenter: cur.job.costCenter ?? null,
                  workLocation: cur.employment.workLocation ?? null,
                  reportingManager: cur.job.reportingManager ?? null,
                  functionalManager: cur.job.functionalManager ?? null,
                  departmentHead: cur.job.departmentHead ?? null,
                  businessUnitHead: cur.job.businessUnitHead ?? null,
                  hrBusinessPartner: cur.job.hrBusinessPartner ?? null,
                  matrixReportingManager: cur.job.matrixReportingManager ?? null,
                  actingSupervisor: cur.job.actingSupervisor ?? null,
                  delegatedApprover: cur.job.delegatedApprover ?? null,
                  officeSite: cur.job.officeSite ?? null,
                  workCenter: cur.job.workCenter ?? null,
                  projectSite: cur.job.projectSite ?? null,
                  currentProject: cur.projectAssignment.currentProject ?? null,
                  projectCode: cur.projectAssignment.projectCode ?? null,
                  projectLocation: cur.projectAssignment.projectLocation ?? null,
                  client: cur.projectAssignment.client ?? null,
                  siteSupervisor: cur.projectAssignment.siteSupervisor ?? null,
                  assignmentStartDate: cur.projectAssignment.assignmentStartDate ?? null,
                  assignmentEndDate: cur.projectAssignment.assignmentEndDate ?? null,
                  assignmentStatus: cur.projectAssignment.assignmentStatus ?? null,
                  mobilizationStatus: cur.projectAssignment.mobilizationStatus ?? null,
                  demobilizationStatus: cur.projectAssignment.demobilizationStatus ?? null,
                  roleSummary: cur.roleProfile.roleSummary ?? null,
                  jobPurpose: cur.roleProfile.jobPurpose ?? null,
                  jobDescription: cur.roleProfile.jobDescription ?? null,
                  keyResponsibilities: cur.roleProfile.keyResponsibilities ?? null,
                  technicalCompetencies: cur.roleProfile.technicalCompetencies ?? null,
                  behavioralCompetencies: cur.roleProfile.behavioralCompetencies ?? null,
                  requiredQualifications: cur.roleProfile.requiredQualifications ?? null,
                  requiredCertifications: cur.roleProfile.requiredCertifications ?? null,
                  requiredExperience: cur.roleProfile.requiredExperience ?? null,
                  kpis: cur.roleProfile.kpis ?? null,
                  performanceExpectations: cur.roleProfile.performanceExpectations ?? null,
                  hseResponsibilities: cur.roleProfile.hseResponsibilities ?? null,
                  complianceResponsibilities: cur.roleProfile.complianceResponsibilities ?? null,
                },
                supportingDocuments: [],
              }));
              setChangeModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Edit Job Information
          </button>
          <button
            type="button"
            onClick={async () => {
              const draftReq = requests.find((r) => r.status === 'Draft' || r.status === 'Rejected') || null;
              if (!draftReq) {
                setToast({ title: 'No draft request', detail: 'Create a change request first.', tone: 'warn' });
                setChangeModalOpen(true);
                return;
              }
              try {
                await apiPostGlobal(`/api/hris/job-change-request/${encodeURIComponent(draftReq.id)}/submit`, { reason: draftReq.reason }, { role, viewerEmployeeId });
                setToast({ title: 'Submitted', detail: `${draftReq.id}`, tone: 'ok' });
                setRefreshToken((n) => n + 1);
                setView('workflow');
              } catch (e) {
                setToast({ title: 'Submit failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dle-blue text-white text-xs font-extrabold hover:bg-dle-blue/90 transition-colors"
          >
            <Send className="w-4 h-4" />
            Submit Change Request
          </button>
          <Link
            href={`/hris/employees/employment-history?employeeId=${encodeURIComponent(activeEmployeeId)}`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <History className="w-4 h-4" />
            View Employment History
          </Link>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Job Record
          </button>
          <button
            type="button"
            onClick={() => {
              if (!jobInfo.data) {
                setToast({ title: 'Not ready', detail: 'Wait for job information to load.', tone: 'warn' });
                return;
              }
              const w = window.open('', '_blank', 'noopener,noreferrer');
              if (!w) return;
              const cur = jobInfo.data;
              const safe = (s: string) => s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
              const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Job Profile</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:24px}h1{font-size:18px;margin:0}h2{font-size:13px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #e5e7eb;padding:8px;font-size:12px;vertical-align:top}th{background:#f8fafc;text-align:left}</style></head><body><h1>DLE HRIS — Job Profile</h1><div style="margin-top:6px;font-size:12px;color:#475569">Employee: ${safe(cur.employeeId)} • ${safe(cur.employeeName)} • Generated: ${safe(nowStamp)}</div><h2>Job</h2><table><tbody><tr><th>Job Title</th><td>${safe(cur.job.jobTitle || '—')}</td><th>Grade</th><td>${safe(cur.job.jobGrade || '—')}</td></tr><tr><th>Department</th><td>${safe(cur.job.department || '—')}</td><th>Business Unit</th><td>${safe(cur.job.businessUnit || '—')}</td></tr><tr><th>Cost Center</th><td>${safe(cur.job.costCenter || '—')}</td><th>Work Location</th><td>${safe(cur.employment.workLocation || '—')}</td></tr></tbody></table><h2>Reporting</h2><table><tbody><tr><th>Reporting Manager</th><td>${safe(cur.job.reportingManager || '—')}</td><th>Functional Manager</th><td>${safe(cur.job.functionalManager || '—')}</td></tr><tr><th>Department Head</th><td>${safe(cur.job.departmentHead || '—')}</td><th>HRBP</th><td>${safe(cur.job.hrBusinessPartner || '—')}</td></tr></tbody></table><h2>Role Profile</h2><table><tbody><tr><th>Job Purpose</th><td>${safe(cur.roleProfile.jobPurpose || '—')}</td></tr><tr><th>Key Responsibilities</th><td>${safe(cur.roleProfile.keyResponsibilities || '—')}</td></tr></tbody></table><script>window.print();</script></body></html>`;
              w.document.open();
              w.document.write(html);
              w.document.close();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print Job Profile
          </button>
          <button
            type="button"
            onClick={() => setRefreshToken((n) => n + 1)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>
    </Card>
  );

  const toolbar = (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              value={employeeInput}
              onChange={(e) => setEmployeeInput(e.target.value)}
              placeholder="Employee ID (e.g., DLE-EMP-00001)"
              className="w-[240px] max-w-[70vw] text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const next = employeeInput.trim();
              if (!next) return;
              setActiveEmployeeId(next);
              setToast({ title: 'Employee loaded', detail: next, tone: 'ok' });
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dle-blue text-white text-xs font-extrabold hover:bg-dle-blue/90 transition-colors"
          >
            <Users className="w-4 h-4" />
            Load
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                setEmployeePickerOpen(true);
                if (formOptions.status !== 'ready') setFormOptions({ status: 'loading' });
                const data = await apiFetchGlobal<FormOptions>('/api/hris/job-information/form-options?includeEmployees=1', { method: 'GET', role, viewerEmployeeId });
                setFormOptions({ status: 'ready', data });
              } catch (e) {
                setFormOptions({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load employees' });
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Search className="w-4 h-4" />
            Employee Selector
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Controls
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-extrabold text-slate-600">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-800 focus:outline-none"
          >
            {(
              [
                'Super Admin',
                'HR Director',
                'HR Manager',
                'HR Officer',
                'Department Head',
                'Line Manager',
                'Payroll Officer',
                'Auditor',
                'Employee',
                'Executive Management',
              ] as Role[]
            ).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
            <span className="text-[11px] font-extrabold text-slate-600">Viewer Employee ID</span>
            <input
              value={viewerEmployeeId || ''}
              onChange={(e) => setViewerEmployeeId(e.target.value.trim() || undefined)}
              placeholder="Optional"
              className="w-[180px] max-w-[60vw] text-xs font-extrabold text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        {(
          [
            { key: 'overview', label: 'Overview', icon: BriefcaseBusiness },
            { key: 'job', label: 'Current Job', icon: BadgeCheck },
            { key: 'role', label: 'Role Profile', icon: Fingerprint },
            { key: 'project', label: 'Project/Site', icon: Building2 },
            { key: 'history', label: 'Job History', icon: GitCompare },
            { key: 'workflow', label: 'Approvals', icon: ShieldCheck },
            { key: 'audit', label: 'Audit Trail', icon: Lock },
          ] as const
        ).map((t) => {
          const on = view === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors ${
                on ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>
    </Card>
  );

  const summary = (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
      {(() => {
        const lastApproved = historyItems.find((h) => h.approvalStatus === 'Approved' && ['Promotion', 'Transfer', 'Department Change', 'Manager Change', 'Job Title Change', 'Grade Change'].includes(h.eventType));
        const eff = lastApproved ? new Date(lastApproved.effectiveDate).getTime() : NaN;
        const yrs = Number.isFinite(eff) ? Math.max(0, Math.floor((nowMs - eff) / (365.25 * 24 * 3600 * 1000))) : null;
        const approvalTone =
          approvalStatus === 'Approved'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : approvalStatus === 'Rejected'
              ? 'bg-red-50 text-red-800 border-red-200'
              : approvalStatus === 'Draft' || approvalStatus === 'Submitted'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-50 text-slate-800 border-slate-200';

        const cards = [
          { label: 'Current Job Title', value: jobData?.jobTitle || '—', detail: jobData?.designation || '—', icon: BriefcaseBusiness, tone: 'bg-dle-blue/10 text-dle-blue border-slate-200/60' },
          { label: 'Job Grade', value: jobData?.jobGrade || '—', detail: jobData?.jobLevel || '—', icon: BadgeCheck, tone: 'bg-slate-900 text-white border-slate-200/60' },
          { label: 'Department', value: jobData?.department || '—', detail: jobData?.division || '—', icon: Building2, tone: 'bg-emerald-600/10 text-emerald-700 border-emerald-200' },
          { label: 'Business Unit', value: jobData?.businessUnit || '—', detail: jobData?.costCenter || '—', icon: Building2, tone: 'bg-slate-50 text-slate-800 border-slate-200' },
          { label: 'Reporting Manager', value: jobData?.reportingManager || '—', detail: jobData?.functionalManager || '—', icon: Users, tone: 'bg-amber-600/10 text-amber-700 border-amber-200' },
          { label: 'Employment Type', value: empData?.employmentType || '—', detail: empData?.employmentStatus || '—', icon: Calendar, tone: 'bg-white text-slate-800 border-slate-200' },
          { label: 'Work Location', value: empData?.workLocation || '—', detail: jobData?.workCenter || jobData?.officeSite || '—', icon: Building2, tone: 'bg-white text-slate-800 border-slate-200' },
          { label: 'Years in Current Role', value: yrs === null ? '—' : String(yrs), detail: lastApproved ? `Since ${formatDateUtc(lastApproved.effectiveDate)}` : 'No approved job change found', icon: Calendar, tone: 'bg-white text-slate-800 border-slate-200' },
          { label: 'Current Project', value: jobInfo.data?.projectAssignment?.currentProject || jobData?.projectSite || '—', detail: jobInfo.data?.projectAssignment?.assignmentStatus || '—', icon: Building2, tone: 'bg-white text-slate-800 border-slate-200' },
          { label: 'Approval Status', value: approvalStatus, detail: jobInfo.data?.approvalRef || '—', icon: ShieldCheck, tone: approvalTone },
        ];

        return cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold text-slate-600">{c.label}</div>
                  <div className="text-sm font-extrabold text-slate-900 mt-1 truncate">{c.value}</div>
                </div>
                <span className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${c.tone}`}>
                  <Icon className="w-5 h-5" />
                </span>
              </div>
              <div className="mt-3 text-[11px] text-slate-500 font-semibold truncate">Updated: {formatDateUtc(jobInfo.data?.lastUpdatedAt || initialNow)} • {c.detail}</div>
            </Card>
          );
        });
      })()}
    </div>
  );

  const aiPanel = (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-purple-600/10 border border-slate-200/60 flex items-center justify-center text-purple-700">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">AI Job Insights</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Detects gaps, inconsistencies, and governance risks in job data.</div>
          </div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{formatNumber(jobAi.data?.length || 0)} checks</span>
      </div>

      <div className="mt-4 space-y-3">
        {jobAi.status === 'loading' ? (
          <div className="text-sm text-slate-600 font-semibold">Generating insights…</div>
        ) : jobAi.status === 'error' ? (
          <div className="text-sm text-slate-600 font-semibold">{jobAi.error || 'Unable to generate insights'}</div>
        ) : jobAi.data && jobAi.data.length ? (
          jobAi.data.slice(0, 6).map((i) => {
            const st = severityStyle(i.severity);
            return (
              <div key={i.id} className={`rounded-2xl border ${st.border} bg-white p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold ${st.bg} ${st.fg}`}>{i.severity.toUpperCase()}</span>
                      <span className="text-sm font-extrabold text-slate-900">{i.title}</span>
                      <span className="text-[11px] font-extrabold text-slate-500">Confidence: {formatNumber(Math.round(i.confidence * 100))}%</span>
                    </div>
                    <div className="text-xs text-slate-600 font-semibold mt-2">{i.recommendation}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setView('workflow');
                      setToast({ title: i.actionLabel, detail: 'Use Job Change Requests to submit and approve controlled updates.', tone: 'ok' });
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                    {i.actionLabel}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 font-semibold">No anomalies detected for the current job record.</div>
        )}
      </div>
    </Card>
  );

  const snapshot = (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <BriefcaseBusiness className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Current Job Assignment</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">The authoritative job snapshot should match the latest approved employment event.</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill label={jobData?.jobTitle || 'Job Title: —'} />
              <Pill label={`Grade: ${jobData?.jobGrade || '—'}`} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Job Title" value={jobData?.jobTitle || '—'} />
            <Field label="Designation" value={jobData?.designation || '—'} />
            <Field label="Job Grade" value={jobData?.jobGrade || '—'} />
            <Field label="Department" value={jobData?.department || '—'} />
            <Field label="Division" value={jobData?.division || '—'} />
            <Field label="Business Unit" value={jobData?.businessUnit || '—'} />
            <Field label="Cost Center" value={jobData?.costCenter || '—'} />
            <Field label="Work Center" value={jobData?.workCenter || '—'} />
            <Field label="Project Site" value={jobData?.projectSite || '—'} />
            <Field label="Work Location" value={empData?.workLocation || '—'} />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-200 flex items-center justify-center text-amber-700">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Reporting & Stakeholders</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Used for approval routing, access control, and workforce analytics.</div>
              </div>
            </div>
            <Link
              href={`/hris/employees/employment-history/${encodeURIComponent(activeEmployeeId)}`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
              View movement timeline
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Reporting Manager" value={jobData?.reportingManager || '—'} />
            <Field label="Functional Manager" value={jobData?.functionalManager || '—'} />
            <Field label="Department Head" value={jobData?.departmentHead || '—'} />
            <Field label="HR Business Partner" value={jobData?.hrBusinessPartner || '—'} />
            <Field label="Role Profile" value={jobData?.roleProfile || '—'} />
            <Field label="Employee Category" value={empData?.employeeCategory || '—'} />
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        {aiPanel}

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Governance Summary</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Quick indicators for audit preparation.</div>
              </div>
            </div>
            {overviewData?.payrollStatus === 'Masked' ? (
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700">
                <Lock className="w-4 h-4" />
                Payroll masked
              </span>
            ) : null}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3">
            <Field label="Document Compliance" value={overviewData?.documentStatus || '—'} />
            <Field label="Asset Status" value={overviewData?.assetStatus || '—'} />
            <Field label="Attendance Score" value={overviewData ? `${overviewData.attendanceScore}/100` : '—'} />
            <Field label="Training Compliance" value={overviewData ? `${overviewData.trainingCompliancePct}%` : '—'} />
          </div>
        </Card>
      </div>
    </div>
  );

  const changes = (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <GitCompare className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Recent Job Movements</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Latest employee lifecycle events affecting job data.</div>
          </div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{formatNumber(historyItems.length)} events</span>
      </div>

      <div className="md:hidden p-4 space-y-3">
        {jobHistory.status === 'loading' ? (
          <div className="px-2 py-8 text-center text-sm text-slate-600 font-semibold">Loading history…</div>
        ) : jobHistory.status === 'error' ? (
          <div className="px-2 py-8 text-center text-sm text-slate-600 font-semibold">{jobHistory.error || 'Unable to load history'}</div>
        ) : historyItems.length ? (
          historyItems.slice(0, 16).map((h) => (
            <div key={h.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill label={h.eventType} />
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{h.approvalStatus}</span>
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{h.referenceNo}</span>
              </div>
              <div className="text-xs text-slate-500 font-semibold mt-2">
                Effective: {formatDateUtc(h.effectiveDate)} <span className="mx-2">•</span> Approved By: {h.approvedBy || '—'}
              </div>
              <div className="text-sm text-slate-700 font-semibold mt-2">{h.reason}</div>
            </div>
          ))
        ) : (
          <div className="px-2 py-8 text-center text-sm text-slate-600 font-semibold">No history found for this employee.</div>
        )}
      </div>

      <div className="hidden md:block overflow-auto">
        <table className="min-w-[1100px] w-full text-left bg-white">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['Reference', 'Event Type', 'Effective', 'Prev → New', 'Status', 'Approved By', 'Created By'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-extrabold text-slate-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobHistory.status === 'loading' ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-600 font-semibold">
                  Loading history…
                </td>
              </tr>
            ) : jobHistory.status === 'error' ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-600 font-semibold">
                  {jobHistory.error || 'Unable to load history'}
                </td>
              </tr>
            ) : historyItems.length ? (
              historyItems.slice(0, 30).map((h) => (
                <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs font-extrabold text-slate-900 whitespace-nowrap">{h.referenceNo}</td>
                  <td className="px-4 py-3 text-xs font-extrabold text-slate-900 whitespace-nowrap">{h.eventType}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatDateUtc(h.effectiveDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 font-semibold">
                    {(h.previousDepartment || h.previousJobTitle || h.previousGrade || h.previousManager || '—') + ' → ' + (h.newDepartment || h.newJobTitle || h.newGrade || h.newManager || '—')}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{h.approvalStatus}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{h.approvedBy || '—'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{h.createdBy || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-600 font-semibold">
                  No history found for this employee.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const controls = (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <div className="text-sm font-extrabold text-slate-900">Access & Audit Controls</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">Role-based visibility and workflow routing reference.</div>
            </div>
          </div>
          <Pill label={role} />
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Viewer Employee ID" value={viewerEmployeeId || '—'} />
          <Field label="Employee Selected" value={activeEmployeeId} />
          <Field label="Approval Routing Hint" value={jobData?.departmentHead || '—'} />
          <Field label="HR Business Partner" value={jobData?.hrBusinessPartner || '—'} />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-purple-600/10 border border-slate-200/60 flex items-center justify-center text-purple-700">
              <Fingerprint className="w-5 h-5" />
            </span>
            <div>
              <div className="text-sm font-extrabold text-slate-900">Workflow Enforcement</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Changes must be executed through Job Change Requests and approvals.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setView('workflow');
              setChangeModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
            Initiate change
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-extrabold text-slate-700">Controlled changes</div>
            <div className="text-xs text-slate-500 font-semibold mt-2">
              Job title, grade, department, manager, location, cost center, project assignment, and role profile updates must be approved before updating the job record.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-extrabold text-slate-700">Audit trail</div>
            <div className="text-xs text-slate-500 font-semibold mt-2">Each request keeps a full audit trail (create/edit/submit/approve/reject) and creates a job history record on approval.</div>
          </div>
        </div>
      </Card>
    </div>
  );

  const currentJobView = (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <BriefcaseBusiness className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Current Job Information</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Read-only snapshot. Submit a controlled change request to update job fields.</div>
              </div>
            </div>
            <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-extrabold ${approvalStatus === 'Approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <ShieldCheck className="w-4 h-4" />
              {approvalStatus}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Employee ID" value={jobInfo.data?.employeeId || activeEmployeeId} />
            <Field label="Employee Name" value={jobInfo.data?.employeeName || '—'} />
            <Field label="Job Title" value={jobData?.jobTitle || '—'} />
            <Field label="Designation" value={jobData?.designation || '—'} />
            <Field label="Job Grade" value={jobData?.jobGrade || '—'} />
            <Field label="Job Level" value={jobData?.jobLevel || '—'} />
            <Field label="Department" value={jobData?.department || '—'} />
            <Field label="Division" value={jobData?.division || '—'} />
            <Field label="Business Unit" value={jobData?.businessUnit || '—'} />
            <Field label="Cost Center" value={jobData?.costCenter || '—'} />
            <Field label="Work Location" value={empData?.workLocation || '—'} />
            <Field label="Work Center" value={jobData?.workCenter || '—'} />
            <Field label="Office Site" value={jobData?.officeSite || '—'} />
            <Field label="Project Site" value={jobData?.projectSite || '—'} />
            <Field label="Employment Type" value={empData?.employmentType || '—'} />
            <Field label="Work Mode" value={empData?.workMode || '—'} />
            <Field label="Shift Pattern" value={empData?.shiftPattern || '—'} />
            <Field label="Staff Category" value={empData?.staffCategory || '—'} />
            <Field label="Employee Category" value={empData?.employeeCategory || '—'} />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-amber-600/10 border border-amber-200 flex items-center justify-center text-amber-700">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Reporting Line</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Preview used for approvals, access control, and governance.</div>
              </div>
            </div>
            <Link
              href={`/hris/employees/reporting-line?employeeId=${encodeURIComponent(activeEmployeeId)}`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
              Open Reporting Line
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Reporting Manager" value={jobData?.reportingManager || '—'} />
            <Field label="Functional Manager" value={jobData?.functionalManager || '—'} />
            <Field label="Department Head" value={jobData?.departmentHead || '—'} />
            <Field label="Business Unit Head" value={jobData?.businessUnitHead || '—'} />
            <Field label="HR Business Partner" value={jobData?.hrBusinessPartner || '—'} />
            <Field label="Matrix Reporting Manager" value={jobData?.matrixReportingManager || '—'} />
            <Field label="Acting Supervisor" value={jobData?.actingSupervisor || '—'} />
            <Field label="Delegated Approver" value={jobData?.delegatedApprover || '—'} />
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        {aiPanel}
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Approval State</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Job record updates are applied only after final approval.</div>
              </div>
            </div>
            <Pill label={approvalStatus} />
          </div>
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-extrabold text-slate-700">Latest request</div>
              <div className="text-xs text-slate-600 font-semibold mt-2">{latestRequest ? `${latestRequest.changeType} • ${latestRequest.status} • ${formatDateUtc(latestRequest.updatedAt)}` : 'No job change request found.'}</div>
            </div>
            <button
              type="button"
              onClick={() => setView('workflow')}
              className="inline-flex items-center justify-between w-full px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
            >
              View approval workflow <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </Card>
      </div>
    </div>
  );

  const roleProfileView = (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-purple-600/10 border border-slate-200/60 flex items-center justify-center text-purple-700">
                <Fingerprint className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Role Profile</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Role purpose, responsibilities, competencies, and compliance expectations.</div>
              </div>
            </div>
            <button type="button" onClick={() => setChangeModalOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dle-blue text-white text-xs font-extrabold hover:bg-dle-blue/90 transition-colors">
              <Pencil className="w-4 h-4" />
              Update via Change Request
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3">
            {(
              [
                ['Role Summary', jobInfo.data?.roleProfile.roleSummary],
                ['Job Purpose', jobInfo.data?.roleProfile.jobPurpose],
                ['Job Description', jobInfo.data?.roleProfile.jobDescription],
                ['Key Responsibilities', jobInfo.data?.roleProfile.keyResponsibilities],
                ['Technical Competencies', jobInfo.data?.roleProfile.technicalCompetencies],
                ['Behavioral Competencies', jobInfo.data?.roleProfile.behavioralCompetencies],
                ['Required Qualifications', jobInfo.data?.roleProfile.requiredQualifications],
                ['Required Certifications', jobInfo.data?.roleProfile.requiredCertifications],
                ['Required Experience', jobInfo.data?.roleProfile.requiredExperience],
                ['KPIs', jobInfo.data?.roleProfile.kpis],
                ['Performance Expectations', jobInfo.data?.roleProfile.performanceExpectations],
                ['HSE Responsibilities', jobInfo.data?.roleProfile.hseResponsibilities],
                ['Compliance Responsibilities', jobInfo.data?.roleProfile.complianceResponsibilities],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">{label}</div>
                <div className="mt-2 text-sm font-semibold text-slate-900 whitespace-pre-wrap">{(value || '—').toString()}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-6">
        {aiPanel}
      </div>
    </div>
  );

  const projectView = (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-emerald-600/10 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <Building2 className="w-5 h-5" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-slate-900">Project / Site Assignment</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">Assignment governance fields for projects, mobilization, and site controls.</div>
              </div>
            </div>
            <button type="button" onClick={() => setChangeModalOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dle-blue text-white text-xs font-extrabold hover:bg-dle-blue/90 transition-colors">
              <Pencil className="w-4 h-4" />
              Change Assignment
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Current Project" value={jobInfo.data?.projectAssignment.currentProject || '—'} />
            <Field label="Project Code" value={jobInfo.data?.projectAssignment.projectCode || '—'} />
            <Field label="Project Location" value={jobInfo.data?.projectAssignment.projectLocation || '—'} />
            <Field label="Client" value={jobInfo.data?.projectAssignment.client || '—'} />
            <Field label="Site Supervisor" value={jobInfo.data?.projectAssignment.siteSupervisor || '—'} />
            <Field label="Assignment Start Date" value={jobInfo.data?.projectAssignment.assignmentStartDate || '—'} />
            <Field label="Assignment End Date" value={jobInfo.data?.projectAssignment.assignmentEndDate || '—'} />
            <Field label="Assignment Status" value={jobInfo.data?.projectAssignment.assignmentStatus || '—'} />
            <Field label="Mobilization Status" value={jobInfo.data?.projectAssignment.mobilizationStatus || '—'} />
            <Field label="Demobilization Status" value={jobInfo.data?.projectAssignment.demobilizationStatus || '—'} />
          </div>
        </Card>
      </div>
      <div className="space-y-6">{aiPanel}</div>
    </div>
  );

  const workflowView = (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Job Change Requests</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Draft → submit → approvals → approved updates employee job record and creates job history.</div>
          </div>
        </div>
        <button type="button" onClick={() => setChangeModalOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dle-blue text-white text-xs font-extrabold hover:bg-dle-blue/90 transition-colors">
          <Pencil className="w-4 h-4" />
          New Change Request
        </button>
      </div>

      <div className="hidden md:block overflow-auto">
        <table className="min-w-[1200px] w-full text-left bg-white">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['Request ID', 'Type', 'Effective', 'Status', 'Created', 'Updated', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-extrabold text-slate-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.length ? (
              requests.slice(0, 25).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs font-extrabold text-slate-900 whitespace-nowrap">{r.id}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{r.changeType}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatDateUtc(r.effectiveDate)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{r.status}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatDateUtc(r.createdAt)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatDateUtc(r.updatedAt)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({
                            requestId: r.id,
                            changeType: r.changeType,
                            effectiveDate: r.effectiveDate,
                            reason: r.reason,
                            notes: r.notes || '',
                            newValues: { ...r.newValues },
                            supportingDocuments: r.supportingDocuments || [],
                          });
                          setChangeModalOpen(true);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="w-4 h-4" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPostGlobal(`/api/hris/job-change-request/${encodeURIComponent(r.id)}/submit`, { reason: r.reason }, { role, viewerEmployeeId });
                            setToast({ title: 'Submitted', detail: r.id, tone: 'ok' });
                            setRefreshToken((n) => n + 1);
                          } catch (e) {
                            setToast({ title: 'Submit failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
                          }
                        }}
                        disabled={!(r.status === 'Draft' || r.status === 'Rejected')}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border ${
                          r.status === 'Draft' || r.status === 'Rejected' ? 'border-dle-blue bg-dle-blue/5 text-dle-blue hover:bg-dle-blue/10' : 'border-slate-200 bg-white text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Send className="w-4 h-4" />
                        Submit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPostGlobal(`/api/hris/job-change-request/${encodeURIComponent(r.id)}/approve`, { reason: 'Approved' }, { role, viewerEmployeeId });
                            setToast({ title: 'Approved', detail: r.id, tone: 'ok' });
                            setRefreshToken((n) => n + 1);
                          } catch (e) {
                            setToast({ title: 'Approve failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
                          }
                        }}
                        disabled={!['Submitted', 'Pending HR Review', 'Pending Department Head Approval', 'Pending HR Director Approval'].includes(r.status)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border ${
                          ['Submitted', 'Pending HR Review', 'Pending Department Head Approval', 'Pending HR Director Approval'].includes(r.status)
                            ? 'border-emerald-700 bg-emerald-700/5 text-emerald-800 hover:bg-emerald-700/10'
                            : 'border-slate-200 bg-white text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPostGlobal(`/api/hris/job-change-request/${encodeURIComponent(r.id)}/reject`, { reason: 'Rejected' }, { role, viewerEmployeeId });
                            setToast({ title: 'Rejected', detail: r.id, tone: 'ok' });
                            setRefreshToken((n) => n + 1);
                          } catch (e) {
                            setToast({ title: 'Reject failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
                          }
                        }}
                        disabled={!['Submitted', 'Pending HR Review', 'Pending Department Head Approval', 'Pending HR Director Approval'].includes(r.status)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border ${
                          ['Submitted', 'Pending HR Review', 'Pending Department Head Approval', 'Pending HR Director Approval'].includes(r.status)
                            ? 'border-red-700 bg-red-700/5 text-red-800 hover:bg-red-700/10'
                            : 'border-slate-200 bg-white text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setSelectedRequestId(r.id);
                          setAuditModalOpen(true);
                          setRequestAudit({ status: 'loading' });
                          try {
                            const a = await apiFetchGlobal<{ id: string; at: string; action: string; performedBy: string; oldValue?: string; newValue?: string; reason?: string }[]>(
                              `/api/hris/job-change-request/${encodeURIComponent(r.id)}/audit`,
                              { method: 'GET', role, viewerEmployeeId },
                            );
                            setRequestAudit({ status: 'ready', data: a });
                          } catch (e) {
                            setRequestAudit({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load audit' });
                          }
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                      >
                        <Fingerprint className="w-4 h-4" />
                        Audit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-600 font-semibold">
                  No job change requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden p-4 space-y-3">
        {requests.length ? (
          requests.slice(0, 12).map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200/60 bg-white p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Pill label={r.changeType} />
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{r.status}</span>
              </div>
              <div className="text-xs text-slate-500 font-semibold mt-2">Effective: {formatDateUtc(r.effectiveDate)} • Updated: {formatDateUtc(r.updatedAt)}</div>
              <div className="text-xs text-slate-700 font-semibold mt-2 line-clamp-2">{r.reason}</div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => setChangeModalOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-dle-blue text-white text-xs font-extrabold hover:bg-dle-blue/90">
                  <Pencil className="w-4 h-4" />
                  View
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="px-2 py-8 text-center text-sm text-slate-600 font-semibold">No job change requests found.</div>
        )}
      </div>
    </Card>
  );

  const auditView = (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Fingerprint className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Job Change Audit Trail</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Open a specific request audit log for evidence and review.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            const id = selectedRequestId || latestRequest?.id;
            if (!id) {
              setToast({ title: 'No request selected', detail: 'Select a job change request first.', tone: 'warn' });
              return;
            }
            setSelectedRequestId(id);
            setAuditModalOpen(true);
            setRequestAudit({ status: 'loading' });
            try {
              const a = await apiFetchGlobal<{ id: string; at: string; action: string; performedBy: string; oldValue?: string; newValue?: string; reason?: string }[]>(
                `/api/hris/job-change-request/${encodeURIComponent(id)}/audit`,
                { method: 'GET', role, viewerEmployeeId },
              );
              setRequestAudit({ status: 'ready', data: a });
            } catch (e) {
              setRequestAudit({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load audit' });
            }
          }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
        >
          <Fingerprint className="w-4 h-4" />
          Open Audit Log
        </button>
      </div>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Selected Request" value={selectedRequestId || latestRequest?.id || '—'} />
        <Field label="Approval Status" value={approvalStatus} />
      </div>
    </Card>
  );

  const filtersDrawer = (
    <AnimatePresence>
      {filtersOpen ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => setFiltersOpen(false)}>
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-xl border-l border-slate-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                  <Filter className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Job Information Controls</div>
                  <div className="text-xs text-slate-500 font-semibold mt-1">This page is employee-scoped; use Employment History for organization-wide filtering.</div>
                </div>
              </div>
              <button type="button" onClick={() => setFiltersOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-auto">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-extrabold text-slate-700">Quick links</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href={`/hris/employees/employee-profile/${encodeURIComponent(activeEmployeeId)}`}
                    className="inline-flex items-center justify-between px-3 py-3 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Employee Profile <ChevronRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href={`/hris/employees/employment-history/${encodeURIComponent(activeEmployeeId)}`}
                    className="inline-flex items-center justify-between px-3 py-3 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Employment History <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                  <Lock className="w-4 h-4" />
                  Governance note
                </div>
                <div className="text-xs text-slate-600 font-semibold mt-2">
                  Editing job data directly is restricted; controlled movements should be created and approved via Employment History workflows to maintain audit integrity.
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const exportModal = (
    <Modal
      open={exportOpen}
      onClose={() => {
        setExportOpen(false);
      }}
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Download className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Export Job Snapshot</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Creates a PDF snapshot for audit and offline review.</div>
          </div>
        </div>
        <button type="button" onClick={() => setExportOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-extrabold text-slate-700">Included fields</div>
          <div className="text-xs text-slate-600 font-semibold mt-2">Job record + reporting line + role profile snapshot + project assignment + job history.</div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setExportOpen(false)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!jobInfo.data || !jobData || !empData) {
                setToast({ title: 'Not ready', detail: 'Wait for the job information to load before exporting.', tone: 'warn' });
                return;
              }
              const downloadText = (fileName: string, mime: string, content: string) => {
                const blob = new Blob([content], { type: mime });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              };
              const csvCell = (v: string) => {
                const s = (v ?? '').replace(/\r?\n/g, ' ').trim();
                if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
                return s;
              };
              const cur = jobInfo.data;
              const jobRows: [string, string][] = [
                ['Employee ID', cur.employeeId],
                ['Employee Name', cur.employeeName],
                ['Approval Status', cur.approvalStatus],
                ['Approval Ref', cur.approvalRef || ''],
                ['Last Updated', cur.lastUpdatedAt],
                ['Job Title', jobData.jobTitle || ''],
                ['Designation', jobData.designation || ''],
                ['Job Grade', jobData.jobGrade || ''],
                ['Job Level', jobData.jobLevel || ''],
                ['Department', jobData.department || ''],
                ['Division', jobData.division || ''],
                ['Business Unit', jobData.businessUnit || ''],
                ['Cost Center', jobData.costCenter || ''],
                ['Work Location', empData.workLocation || ''],
                ['Work Center', jobData.workCenter || ''],
                ['Office Site', jobData.officeSite || ''],
                ['Project Site', jobData.projectSite || ''],
                ['Reporting Manager', jobData.reportingManager || ''],
                ['Functional Manager', jobData.functionalManager || ''],
                ['Department Head', jobData.departmentHead || ''],
                ['Business Unit Head', jobData.businessUnitHead || ''],
                ['HR Business Partner', jobData.hrBusinessPartner || ''],
              ];
              const jobCsv = ['Field,Value', ...jobRows.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`)].join('\n');

              const hist = historyItems.slice(0, 200);
              const histHeader = [
                'Reference No',
                'Event Type',
                'Effective Date',
                'Previous Job Title',
                'New Job Title',
                'Previous Department',
                'New Department',
                'Previous Grade',
                'New Grade',
                'Previous Manager',
                'New Manager',
                'Reason',
                'Approved By',
                'Status',
              ];
              const histCsv = [
                histHeader.map(csvCell).join(','),
                ...hist.map((h) =>
                  [
                    h.referenceNo,
                    h.eventType,
                    h.effectiveDate,
                    h.previousJobTitle || '',
                    h.newJobTitle || '',
                    h.previousDepartment || '',
                    h.newDepartment || '',
                    h.previousGrade || '',
                    h.newGrade || '',
                    h.previousManager || '',
                    h.newManager || '',
                    h.reason || '',
                    h.approvedBy || '',
                    h.approvalStatus || '',
                  ]
                    .map((x) => csvCell(String(x ?? '')))
                    .join(','),
                ),
              ].join('\n');

              const combinedCsv = `${jobCsv}\n\n${histCsv}\n`;
              downloadText(`job-record_${activeEmployeeId}.csv`, 'text/csv;charset=utf-8', combinedCsv);
              setToast({ title: 'Exported', detail: 'CSV downloaded.', tone: 'ok' });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => {
              if (!jobInfo.data || !jobData || !empData) {
                setToast({ title: 'Not ready', detail: 'Wait for the job information to load before exporting.', tone: 'warn' });
                return;
              }
              const htmlEscape = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const cur = jobInfo.data;
              const rows = [
                ['Employee ID', cur.employeeId],
                ['Employee Name', cur.employeeName],
                ['Approval Status', cur.approvalStatus],
                ['Approval Ref', cur.approvalRef || ''],
                ['Last Updated', cur.lastUpdatedAt],
                ['Job Title', jobData.jobTitle || ''],
                ['Designation', jobData.designation || ''],
                ['Job Grade', jobData.jobGrade || ''],
                ['Job Level', jobData.jobLevel || ''],
                ['Department', jobData.department || ''],
                ['Division', jobData.division || ''],
                ['Business Unit', jobData.businessUnit || ''],
                ['Cost Center', jobData.costCenter || ''],
                ['Work Location', empData.workLocation || ''],
                ['Work Center', jobData.workCenter || ''],
                ['Office Site', jobData.officeSite || ''],
                ['Project Site', jobData.projectSite || ''],
                ['Reporting Manager', jobData.reportingManager || ''],
                ['Functional Manager', jobData.functionalManager || ''],
              ];
              const histRows = historyItems.slice(0, 200).map((h) => [
                h.referenceNo,
                h.eventType,
                h.effectiveDate,
                h.previousJobTitle || '',
                h.newJobTitle || '',
                h.previousDepartment || '',
                h.newDepartment || '',
                h.previousGrade || '',
                h.newGrade || '',
                h.previousManager || '',
                h.newManager || '',
                h.reason || '',
                h.approvedBy || '',
                h.approvalStatus || '',
              ]);
              const histHeader = [
                'Reference No',
                'Event Type',
                'Effective Date',
                'Previous Job Title',
                'New Job Title',
                'Previous Department',
                'New Department',
                'Previous Grade',
                'New Grade',
                'Previous Manager',
                'New Manager',
                'Reason',
                'Approved By',
                'Status',
              ];
              const sheet = `<!doctype html><html><head><meta charset="utf-8"/></head><body>
                <table border="1">
                  <tr><th colspan="2">Job Record</th></tr>
                  ${rows.map(([k, v]) => `<tr><td>${htmlEscape(k)}</td><td>${htmlEscape(v)}</td></tr>`).join('')}
                </table>
                <br/>
                <table border="1">
                  <tr>${histHeader.map((h) => `<th>${htmlEscape(h)}</th>`).join('')}</tr>
                  ${histRows.map((r) => `<tr>${r.map((c) => `<td>${htmlEscape(String(c))}</td>`).join('')}</tr>`).join('')}
                </table>
              </body></html>`;
              const blob = new Blob([sheet], { type: 'application/vnd.ms-excel;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `job-record_${activeEmployeeId}.xls`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              setToast({ title: 'Exported', detail: 'Excel downloaded.', tone: 'ok' });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!jobData || !empData) {
                setToast({ title: 'Not ready', detail: 'Wait for the job information to load before exporting.', tone: 'warn' });
                return;
              }
              const lines: string[] = [];
              lines.push(`Employee ID: ${activeEmployeeId}`);
              lines.push(`Generated: ${nowStamp}`);
              lines.push('');
              lines.push(`Job Title: ${jobData.jobTitle || '—'}`);
              lines.push(`Department: ${jobData.department || '—'}`);
              lines.push(`Business Unit: ${jobData.businessUnit || '—'}`);
              lines.push(`Job Grade: ${jobData.jobGrade || '—'}`);
              lines.push(`Reporting Manager: ${jobData.reportingManager || '—'}`);
              lines.push(`Work Location: ${empData.workLocation || '—'}`);
              lines.push(`Employment Status: ${empData.employmentStatus || '—'}`);
              lines.push(`Employment Type: ${empData.employmentType || '—'}`);
              lines.push('');
              lines.push('Recent approved movements:');
              const recent = historyItems
                .filter((h) => h.approvalStatus === 'Approved')
                .slice(0, 10)
                .map((h) => `${h.referenceNo} | ${h.eventType} | ${formatDateUtc(h.effectiveDate)} | ${h.approvedBy || '—'}`);
              for (const r of recent) lines.push(r);
              const bytes = buildPdf('DLE HRIS — Job Information Snapshot', lines);
              const blob = new Blob([bytes], { type: 'application/pdf' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `job-information_${activeEmployeeId}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              setExportOpen(false);
              setToast({ title: 'Exported', detail: 'PDF snapshot downloaded.', tone: 'ok' });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>
    </Modal>
  );

  const employeePickerModal = (
    <Modal
      open={employeePickerOpen}
      onClose={() => {
        setEmployeePickerOpen(false);
      }}
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Search className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Employee Selector</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Search by Employee ID, Name, Department, Job Title, Manager, Location.</div>
          </div>
        </div>
        <button type="button" onClick={() => setEmployeePickerOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        {formOptions.status === 'loading' ? (
          <div className="text-sm text-slate-600 font-semibold">Loading employees…</div>
        ) : formOptions.status === 'error' ? (
          <div className="text-sm text-slate-600 font-semibold">{formOptions.error || 'Unable to load employees'}</div>
        ) : formOptions.data ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-500" />
                <input
                  value={employeeInput}
                  onChange={(e) => setEmployeeInput(e.target.value)}
                  placeholder="Search… (ID, name, department, job title, manager, location)"
                  className="w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
                />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-left bg-white">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                    <tr>
                      {['Employee ID', 'Name', 'Department', 'Job Title', 'Manager', 'Location'].map((h) => (
                        <th key={h} className="px-4 py-3 text-[11px] font-extrabold text-slate-600 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {formOptions.data.employees
                      .filter((e) => {
                        const q = employeeInput.trim().toLowerCase();
                        if (!q) return true;
                        const blob = `${e.employeeId} ${e.fullName} ${e.department} ${e.jobTitle} ${e.manager} ${e.location}`.toLowerCase();
                        return blob.includes(q);
                      })
                      .slice(0, 80)
                      .map((e) => (
                        <tr
                          key={e.employeeId}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() => {
                            setEmployeePickerOpen(false);
                            setEmployeeInput(e.employeeId);
                            setActiveEmployeeId(e.employeeId);
                            setToast({ title: 'Employee loaded', detail: `${e.employeeId} • ${e.fullName}`, tone: 'ok' });
                          }}
                        >
                          <td className="px-4 py-3 text-xs font-extrabold text-slate-900 whitespace-nowrap">{e.employeeId}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{e.fullName}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{e.department}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{e.jobTitle}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{e.manager}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{e.location}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 font-semibold">Showing up to 80 matches.</div>
          </>
        ) : null}
      </div>
    </Modal>
  );

  const changeRequestModal = (
    <Modal
      open={changeModalOpen}
      onClose={() => {
        setChangeModalOpen(false);
      }}
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-dle-blue text-white flex items-center justify-center">
            <Pencil className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Job Change Request</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">Draft → Submit → Approve → Employee job record updates + job history entry.</div>
          </div>
        </div>
        <button type="button" onClick={() => setChangeModalOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        {formOptions.status === 'loading' ? <div className="text-sm text-slate-600 font-semibold">Loading form options…</div> : null}
        {formOptions.status === 'error' ? <div className="text-sm text-slate-600 font-semibold">{formOptions.error || 'Unable to load form options'}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Change Type</div>
            <select
              value={draft.changeType}
              onChange={(e) => setDraft((d) => ({ ...d, changeType: e.target.value as JobChangeType }))}
              className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
            >
              {(
                [
                  'Job Title Change',
                  'Department Change',
                  'Grade Change',
                  'Reporting Manager Change',
                  'Functional Manager Change',
                  'Location Change',
                  'Project Assignment Change',
                  'Cost Center Change',
                  'Role Profile Update',
                ] as JobChangeType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-extrabold text-slate-600">Effective Date</div>
            <input
              type="date"
              value={draft.effectiveDate ? draft.effectiveDate.slice(0, 10) : ''}
              onChange={(e) => setDraft((d) => ({ ...d, effectiveDate: `${e.target.value}T00:00:00.000Z` }))}
              className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
            />
            <div className="mt-2 text-[11px] text-slate-500 font-semibold">Backdating is controlled by policy and approvals.</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-extrabold text-slate-600">Reason</div>
          <textarea
            value={draft.reason}
            onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
            rows={3}
            className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
            placeholder="Provide a clear audit-ready reason."
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-extrabold text-slate-600">Notes</div>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            rows={2}
            className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
            placeholder="Optional notes for approvers."
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] font-extrabold text-slate-600">New Values</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">Values are validated against governance rules on save/submit.</div>
            </div>
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, newValues: { ...(jobInfo.data?.job || {}), ...(jobInfo.data?.employment || {}), ...d.newValues } }))}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw className="w-4 h-4" />
              Reload current
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {draft.changeType === 'Job Title Change' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">Job Title</div>
                <select
                  value={draft.newValues.jobTitle || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, jobTitle: e.target.value || null } }))}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                >
                  <option value="">Select…</option>
                  {(formOptions.data?.jobTitles || []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {draft.changeType === 'Grade Change' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">Job Grade</div>
                <select
                  value={draft.newValues.jobGrade || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, jobGrade: e.target.value || null } }))}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                >
                  <option value="">Select…</option>
                  {(formOptions.data?.jobGrades || []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {draft.changeType === 'Department Change' ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-extrabold text-slate-600">Department</div>
                  <select
                    value={draft.newValues.department || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, department: e.target.value || null } }))}
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    {(formOptions.data?.departments || []).map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-extrabold text-slate-600">Business Unit</div>
                  <select
                    value={draft.newValues.businessUnit || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, businessUnit: e.target.value || null } }))}
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    {(formOptions.data?.businessUnits || []).map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {draft.changeType === 'Reporting Manager Change' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">Reporting Manager</div>
                <input
                  value={draft.newValues.reportingManager || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, reportingManager: e.target.value.trim() || null } }))}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
                  placeholder="Search/enter manager name"
                />
              </div>
            ) : null}

            {draft.changeType === 'Functional Manager Change' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">Functional Manager</div>
                <input
                  value={draft.newValues.functionalManager || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, functionalManager: e.target.value.trim() || null } }))}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
                  placeholder="Search/enter manager name"
                />
              </div>
            ) : null}

            {draft.changeType === 'Location Change' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">Work Location</div>
                <select
                  value={draft.newValues.workLocation || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, workLocation: e.target.value || null } }))}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                >
                  <option value="">Select…</option>
                  {(formOptions.data?.locations || []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {draft.changeType === 'Project Assignment Change' ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-extrabold text-slate-600">Current Project</div>
                  <select
                    value={draft.newValues.currentProject || ''}
                    onChange={(e) => {
                      const proj = (formOptions.data?.projects || []).find((p) => p.name === e.target.value);
                      setDraft((d) => ({
                        ...d,
                        newValues: {
                          ...d.newValues,
                          currentProject: e.target.value || null,
                          projectCode: proj?.code || d.newValues.projectCode || null,
                          projectLocation: proj?.location || d.newValues.projectLocation || null,
                          client: proj?.client || d.newValues.client || null,
                        },
                      }));
                    }}
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    {(formOptions.data?.projects || []).map((p) => (
                      <option key={p.code} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-extrabold text-slate-600">Assignment Status</div>
                  <select
                    value={draft.newValues.assignmentStatus || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, assignmentStatus: e.target.value || null } }))}
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                  >
                    <option value="">Select…</option>
                    {(formOptions.data?.projectStatuses || []).map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {draft.changeType === 'Cost Center Change' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">Cost Center</div>
                <select
                  value={draft.newValues.costCenter || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, costCenter: e.target.value || null } }))}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900 focus:outline-none"
                >
                  <option value="">Select…</option>
                  {(formOptions.data?.costCenters || []).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {draft.changeType === 'Role Profile Update' ? (
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold text-slate-600">Job Description</div>
                <textarea
                  value={draft.newValues.jobDescription || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, jobDescription: e.target.value || null } }))}
                  rows={6}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
                  placeholder="Job description (audit-ready)."
                />
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-[11px] font-extrabold text-slate-600">Job Purpose</div>
                    <textarea
                      value={draft.newValues.jobPurpose || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, jobPurpose: e.target.value || null } }))}
                      rows={3}
                      className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-[11px] font-extrabold text-slate-600">Key Responsibilities</div>
                    <textarea
                      value={draft.newValues.keyResponsibilities || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, newValues: { ...d.newValues, keyResponsibilities: e.target.value || null } }))}
                      rows={3}
                      className="mt-2 w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] font-extrabold text-slate-600">Supporting Documents</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">Attach metadata for signed letters/policies (demo).</div>
            </div>
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, supportingDocuments: [...d.supportingDocuments, { id: `doc-${Math.random().toString(16).slice(2)}`, name: '' }] }))}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
              Add Doc
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {draft.supportingDocuments.length ? (
              draft.supportingDocuments.map((d, idx) => (
                <div key={d.id} className="flex items-center gap-2">
                  <input
                    value={d.name}
                    onChange={(e) =>
                      setDraft((cur) => ({
                        ...cur,
                        supportingDocuments: cur.supportingDocuments.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                      }))
                    }
                    placeholder="Document name"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setDraft((cur) => ({ ...cur, supportingDocuments: cur.supportingDocuments.filter((_, i) => i !== idx) }))}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500 font-semibold">No documents attached.</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setChangeModalOpen(false)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50">
            Close
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await apiFetch<JobChangeRequest>(activeEmployeeId, 'job-information', {
                  method: 'PATCH',
                  role,
                  viewerEmployeeId,
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    requestId: draft.requestId,
                    changeType: draft.changeType,
                    effectiveDate: draft.effectiveDate,
                    reason: draft.reason,
                    notes: draft.notes,
                    newValues: draft.newValues,
                    supportingDocuments: draft.supportingDocuments.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() })),
                  }),
                });
                setDraft((d) => ({ ...d, requestId: res.id }));
                setToast({ title: 'Saved', detail: res.id, tone: 'ok' });
                setChangeModalOpen(false);
                setRefreshToken((n) => n + 1);
                setView('workflow');
              } catch (e) {
                setToast({ title: 'Save failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dle-blue bg-dle-blue/5 text-dle-blue text-xs font-extrabold hover:bg-dle-blue/10"
          >
            <Pencil className="w-4 h-4" />
            Save Draft
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await apiFetch<JobChangeRequest>(activeEmployeeId, 'job-information', {
                  method: 'PATCH',
                  role,
                  viewerEmployeeId,
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    requestId: draft.requestId,
                    changeType: draft.changeType,
                    effectiveDate: draft.effectiveDate,
                    reason: draft.reason,
                    notes: draft.notes,
                    newValues: draft.newValues,
                    supportingDocuments: draft.supportingDocuments.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() })),
                  }),
                });
                await apiPostGlobal(`/api/hris/job-change-request/${encodeURIComponent(res.id)}/submit`, { reason: res.reason }, { role, viewerEmployeeId });
                setToast({ title: 'Submitted', detail: res.id, tone: 'ok' });
                setChangeModalOpen(false);
                setRefreshToken((n) => n + 1);
                setView('workflow');
              } catch (e) {
                setToast({ title: 'Submit failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
          >
            <Send className="w-4 h-4" />
            Submit
          </button>
        </div>
      </div>
    </Modal>
  );

  const auditModal = (
    <Modal
      open={auditModalOpen}
      onClose={() => {
        setAuditModalOpen(false);
      }}
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Fingerprint className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Request Audit Log</div>
            <div className="text-xs text-slate-500 font-semibold mt-1">{selectedRequestId || '—'}</div>
          </div>
        </div>
        <button type="button" onClick={() => setAuditModalOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>
      <div className="p-6">
        {requestAudit.status === 'loading' ? (
          <div className="text-sm text-slate-600 font-semibold">Loading audit log…</div>
        ) : requestAudit.status === 'error' ? (
          <div className="text-sm text-slate-600 font-semibold">{requestAudit.error || 'Unable to load audit log'}</div>
        ) : requestAudit.data && requestAudit.data.length ? (
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-left bg-white">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <tr>
                    {['Time', 'Action', 'By', 'Reason', 'Old', 'New'].map((h) => (
                      <th key={h} className="px-4 py-3 text-[11px] font-extrabold text-slate-600 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requestAudit.data.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{formatDateTimeUtc(a.at)}</td>
                      <td className="px-4 py-3 text-xs font-extrabold text-slate-900 whitespace-nowrap">{a.action}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">{a.performedBy}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{a.reason || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{a.oldValue ? String(a.oldValue).slice(0, 140) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{a.newValue ? String(a.newValue).slice(0, 140) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600 font-semibold">No audit log entries.</div>
        )}
      </div>
    </Modal>
  );

  const loading = jobInfo.status === 'loading' || overview.status === 'loading' || jobHistory.status === 'loading' || jobAi.status === 'loading';
  const hasError = jobInfo.status === 'error' || overview.status === 'error' || jobHistory.status === 'error' || jobAi.status === 'error';

  return (
    <div className="bg-white space-y-6">
      {breadcrumbs}
      {header}
      {toolbar}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[110px] rounded-2xl border border-slate-200/60 bg-slate-50 animate-pulse" />
          ))}
        </div>
      ) : hasError ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-2xl bg-red-600/10 border border-red-200 flex items-center justify-center text-red-700">
              <X className="w-5 h-5" />
            </span>
            <div>
              <div className="text-sm font-extrabold text-slate-900">Unable to load job information</div>
              <div className="text-xs text-slate-600 font-semibold mt-1">{jobInfo.error || jobHistory.error || jobAi.error || overview.error || 'Request failed'}</div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {summary}
          {view === 'overview'
            ? snapshot
            : view === 'job'
              ? currentJobView
              : view === 'role'
                ? roleProfileView
                : view === 'project'
                  ? projectView
                  : view === 'history'
                    ? changes
                    : view === 'workflow'
                      ? workflowView
                      : auditView}
        </>
      )}

      {filtersDrawer}
      {exportModal}
      {employeePickerModal}
      {changeRequestModal}
      {auditModal}

      <AnimatePresence>
        {toast ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.16 }} className="fixed bottom-6 right-6 z-50">
            <div className={`w-[380px] rounded-2xl border shadow-lg p-4 bg-white ${toast.tone === 'err' ? 'border-red-200' : toast.tone === 'warn' ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">{toast.title}</div>
                  <div className="text-xs text-slate-600 font-semibold mt-1">{toast.detail}</div>
                </div>
                <button type="button" onClick={() => setToast(null)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
