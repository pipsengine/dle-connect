'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Filter,
  Fingerprint,
  GitCompare,
  Layers,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
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

type Severity = 'high' | 'medium' | 'low';

type ApprovalStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pending HR Review'
  | 'Pending Department Head Approval'
  | 'Pending HR Director Approval'
  | 'Approved'
  | 'Rejected'
  | 'Reversed'
  | 'Cancelled';

type EmploymentEventType =
  | 'Onboarding'
  | 'Confirmation'
  | 'Probation Change'
  | 'Promotion'
  | 'Transfer'
  | 'Department Change'
  | 'Manager Change'
  | 'Job Title Change'
  | 'Grade Change'
  | 'Salary Grade Change'
  | 'Secondment'
  | 'Project Assignment'
  | 'Suspension'
  | 'Contract Renewal'
  | 'Reactivation'
  | 'Resignation'
  | 'Termination'
  | 'Retirement'
  | 'Exit Clearance';

type HistoryRow = {
  id: string;
  referenceNo: string;
  employeeId: string;
  employeeName: string;
  eventType: EmploymentEventType;
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
  previousStatus?: string | null;
  newStatus?: string | null;
  reason: string;
  notes?: string | null;
  approvalStatus: ApprovalStatus;
  approvalId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdBy: string;
  createdAt: string;
};

type DetailItem = HistoryRow & {
  previousLocation?: string | null;
  newLocation?: string | null;
  supportingDocument?: { id: string; name: string } | null;
  updatedAt?: string | null;
  audit?: { id: string; at: string; action: string; performedBy: string; reason?: string | null; oldValue?: string | null; newValue?: string | null }[];
};

type Summary = {
  total: number;
  promotions: number;
  transfers: number;
  confirmations: number;
  contractRenewals: number;
  suspensions: number;
  exits: number;
  reactivations: number;
  pendingApprovals: number;
  currentMonthChanges: number;
};

type Analytics = {
  byEventType: Record<string, number>;
  byDepartment: Record<string, number>;
  lastUpdatedAt: string;
};

type AIInsight = { id: string; severity: Severity; confidence: number; title: string; recommendation: string; actionLabel: string; action: string };

type ListResponse = { items: HistoryRow[]; total: number; permissions: { canCreate: boolean; canApprove: boolean; canExport: boolean } };

type ApiState<T> = { status: 'idle' | 'loading' | 'ready' | 'error'; data?: T; error?: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDateUtc = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const formatDateTimeUtc = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} UTC`;
};
const numberFmt = new Intl.NumberFormat('en-GB');
const formatNumber = (n: number) => numberFmt.format(n);

const severityStyle = (s: Severity) => {
  if (s === 'high') return { bg: 'bg-red-600/10', border: 'border-red-200/70', fg: 'text-red-700', icon: AlertTriangle };
  if (s === 'medium') return { bg: 'bg-amber-600/10', border: 'border-amber-200/70', fg: 'text-amber-700', icon: AlertTriangle };
  return { bg: 'bg-blue-600/10', border: 'border-blue-200/70', fg: 'text-blue-700', icon: Sparkles };
};

const eventTone = (t: EmploymentEventType) => {
  if (t === 'Onboarding') return { bg: 'bg-blue-600/10', fg: 'text-blue-700', dot: 'bg-blue-600' };
  if (t === 'Confirmation') return { bg: 'bg-emerald-600/10', fg: 'text-emerald-700', dot: 'bg-emerald-600' };
  if (t === 'Promotion' || t === 'Grade Change') return { bg: 'bg-violet-600/10', fg: 'text-violet-700', dot: 'bg-violet-600' };
  if (t === 'Transfer' || t === 'Department Change') return { bg: 'bg-orange-600/10', fg: 'text-orange-700', dot: 'bg-orange-600' };
  if (t === 'Suspension') return { bg: 'bg-red-600/10', fg: 'text-red-700', dot: 'bg-red-600' };
  if (t === 'Contract Renewal') return { bg: 'bg-teal-600/10', fg: 'text-teal-700', dot: 'bg-teal-600' };
  if (t === 'Exit Clearance' || t === 'Termination' || t === 'Resignation' || t === 'Retirement') return { bg: 'bg-slate-700/10', fg: 'text-slate-700', dot: 'bg-slate-500' };
  if (t === 'Reactivation') return { bg: 'bg-emerald-600/10', fg: 'text-emerald-700', dot: 'bg-emerald-600' };
  return { bg: 'bg-slate-600/10', fg: 'text-slate-700', dot: 'bg-slate-400' };
};

const approvalTone = (s: ApprovalStatus) => {
  if (s === 'Approved') return { bg: 'bg-emerald-600/10', fg: 'text-emerald-700' };
  if (s === 'Rejected') return { bg: 'bg-red-600/10', fg: 'text-red-700' };
  if (s === 'Submitted' || s.startsWith('Pending')) return { bg: 'bg-amber-600/10', fg: 'text-amber-700' };
  if (s === 'Reversed') return { bg: 'bg-slate-700/10', fg: 'text-slate-700' };
  return { bg: 'bg-slate-100', fg: 'text-slate-700' };
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-slate-200/60 rounded-2xl shadow-sm ${className || ''}`}>{children}</div>
);

const Pill = ({ label, tone }: { label: string; tone: { bg: string; fg: string; dot?: string } }) => (
  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-extrabold ${tone.bg} ${tone.fg}`}>
    {tone.dot ? <span className={`w-2 h-2 rounded-full ${tone.dot}`} /> : null}
    {label}
  </span>
);

const Chip = ({ label }: { label: string }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-extrabold">{label}</span>
);

async function apiFetch<T>(path: string, init: RequestInit & { role: Role; viewerEmployeeId?: string }) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'x-hris-role': init.role,
      ...(init.viewerEmployeeId ? { 'x-hris-employee-id': init.viewerEmployeeId } : {}),
    },
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv')) {
    const text = await res.text();
    return text as unknown as T;
  }
  const json = (await res.json()) as { status: string; data?: T; error?: string };
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Request failed');
  return json.data as T;
}

async function apiMutate<T>(path: string, init: RequestInit & { role: Role; viewerEmployeeId?: string }) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'content-type': 'application/json',
      'x-hris-role': init.role,
      ...(init.viewerEmployeeId ? { 'x-hris-employee-id': init.viewerEmployeeId } : {}),
    },
  });
  const json = (await res.json()) as { status: string; data?: T; error?: string };
  if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Request failed');
  return json.data as T;
}

type ProfileSnapshot = {
  employeeId: string;
  fullName: string;
  jobTitle: string;
  department: string;
  businessUnit: string;
  location: string;
  employmentStatus: string;
  employmentType: string;
  reportingManager: string;
  jobDetails?: Record<string, string | null>;
};

const Modal = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => (
  <AnimatePresence>
    {open && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.16 }}
          className="absolute left-1/2 top-1/2 w-[94vw] max-w-[980px] -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  required?: boolean;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3">
    <div className="text-[11px] font-extrabold text-slate-600">
      {label} {required ? <span className="text-red-600">*</span> : null}
    </div>
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none" />
  </div>
);

const Select = ({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  required?: boolean;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3">
    <div className="text-[11px] font-extrabold text-slate-600">
      {label} {required ? <span className="text-red-600">*</span> : null}
    </div>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full text-sm font-semibold text-slate-900 bg-white focus:outline-none">
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

export default function EmploymentHistoryClient({ initialNow, employeeId }: { initialNow: string; employeeId?: string }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('HR Manager');
  const [viewerEmployeeId, setViewerEmployeeId] = useState<string | undefined>(undefined);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({
    eventType: new Set(),
    department: new Set(),
    approvalStatus: new Set(),
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [list, setList] = useState<ApiState<ListResponse>>({ status: 'idle' });
  const [summary, setSummary] = useState<ApiState<Summary>>({ status: 'idle' });
  const [analytics, setAnalytics] = useState<ApiState<Analytics>>({ status: 'idle' });
  const [insights, setInsights] = useState<ApiState<AIInsight[]>>({ status: 'idle' });

  const [selected, setSelected] = useState<DetailItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addProfile, setAddProfile] = useState<ApiState<ProfileSnapshot>>({ status: 'idle' });
  const [addForm, setAddForm] = useState<Partial<DetailItem>>({
    eventType: 'Transfer',
    effectiveDate: new Date(initialNow).toISOString(),
    reason: '',
    notes: '',
  });
  const [toast, setToast] = useState<{ title: string; detail: string; tone: 'ok' | 'warn' | 'err' } | null>(null);

  const nowStamp = useMemo(() => formatDateTimeUtc(initialNow), [initialNow]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const serializeFilters = () => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (employeeId) params.set('employeeId', employeeId);
    const csv = (s: Set<string>) => Array.from(s).join(',');
    if (activeFilters.eventType.size) params.set('eventType', csv(activeFilters.eventType));
    if (activeFilters.department.size) params.set('department', csv(activeFilters.department));
    if (activeFilters.approvalStatus.size) params.set('approvalStatus', csv(activeFilters.approvalStatus));
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    params.set('limit', '200');
    return params.toString();
  };

  const loadAll = async () => {
    setList({ status: 'loading' });
    setSummary({ status: 'loading' });
    setInsights({ status: 'loading' });
    setAnalytics({ status: 'loading' });
    try {
      const qs = serializeFilters();
      const [l, s, i, a] = await Promise.all([
        apiFetch<ListResponse>(`/api/hris/employees/employment-history?${qs}`, { method: 'GET', role, viewerEmployeeId }),
        apiFetch<Summary>(`/api/hris/employment-history/summary`, { method: 'GET', role, viewerEmployeeId }),
        apiFetch<AIInsight[]>(`/api/hris/employment-history/ai-insights`, { method: 'GET', role, viewerEmployeeId }),
        apiFetch<Analytics>(`/api/hris/employment-history/analytics`, { method: 'GET', role, viewerEmployeeId }),
      ]);
      setList({ status: 'ready', data: l });
      setSummary({ status: 'ready', data: s });
      setInsights({ status: 'ready', data: i });
      setAnalytics({ status: 'ready', data: a });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to load employment history';
      setList({ status: 'error', error: msg });
      setSummary({ status: 'error', error: msg });
      setInsights({ status: 'error', error: msg });
      setAnalytics({ status: 'error', error: msg });
    }
  };

  useEffect(() => {
    void loadAll();
  }, [debouncedQuery, employeeId, role, viewerEmployeeId, dateFrom, dateTo, activeFilters.eventType, activeFilters.department, activeFilters.approvalStatus]);

  const openDetails = async (id: string) => {
    setDrawerOpen(true);
    setSelected(null);
    try {
      const d = await apiFetch<DetailItem>(`/api/hris/employment-history/${encodeURIComponent(id)}`, { method: 'GET', role, viewerEmployeeId });
      setSelected(d);
    } catch (e) {
      setToast({ title: 'Unable to load details', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
      setDrawerOpen(false);
    }
  };

  const openAdd = async () => {
    if (list.data?.permissions?.canCreate === false) {
      setToast({ title: 'Permission denied', detail: 'You do not have permission to create history events.', tone: 'err' });
      return;
    }
    setAddOpen(true);
    setAddForm({
      eventType: 'Transfer',
      effectiveDate: new Date(initialNow).toISOString(),
      reason: '',
      notes: '',
      employeeId: employeeId || '',
      employeeName: '',
    });
    if (employeeId) {
      setAddProfile({ status: 'loading' });
      try {
        const p = await apiFetch<any>(`/api/hris/employees/${encodeURIComponent(employeeId)}/profile`, { method: 'GET', role, viewerEmployeeId });
        const snap: ProfileSnapshot = {
          employeeId: p.employeeId,
          fullName: p.fullName,
          jobTitle: p.jobTitle,
          department: p.department,
          businessUnit: p.businessUnit,
          location: p.location,
          employmentStatus: p.employmentStatus,
          employmentType: p.employmentType,
          reportingManager: p.reportingManager,
          jobDetails: p.jobDetails,
        };
        setAddProfile({ status: 'ready', data: snap });
        setAddForm((prev) => ({
          ...prev,
          employeeId: snap.employeeId,
          employeeName: snap.fullName,
          previousDepartment: snap.department,
          previousJobTitle: snap.jobTitle,
          previousGrade: snap.jobDetails?.jobGrade || null,
          previousManager: snap.reportingManager,
          previousStatus: snap.employmentStatus,
        }));
      } catch (e) {
        setAddProfile({ status: 'error', error: e instanceof Error ? e.message : 'Unable to load profile snapshot' });
      }
    } else {
      setAddProfile({ status: 'idle' });
    }
  };

  const submitAdd = async () => {
    try {
      const body = {
        employeeId: (addForm.employeeId || '').toString().trim(),
        employeeName: (addForm.employeeName || '').toString().trim(),
        eventType: addForm.eventType,
        effectiveDate: addForm.effectiveDate,
        reason: (addForm.reason || '').toString().trim(),
        notes: (addForm.notes || '').toString().trim() || null,
        previousDepartment: addForm.previousDepartment || null,
        newDepartment: addForm.newDepartment || null,
        previousJobTitle: addForm.previousJobTitle || null,
        newJobTitle: addForm.newJobTitle || null,
        previousGrade: addForm.previousGrade || null,
        newGrade: addForm.newGrade || null,
        previousManager: addForm.previousManager || null,
        newManager: addForm.newManager || null,
        previousStatus: addForm.previousStatus || null,
        newStatus: addForm.newStatus || null,
      };
      const created = await apiMutate<DetailItem>(`/api/hris/employment-history`, { method: 'POST', role, viewerEmployeeId, body: JSON.stringify(body) });
      setToast({ title: 'Event created', detail: `${created.referenceNo} saved as Draft. Submit for approval when ready.`, tone: 'ok' });
      setAddOpen(false);
      await loadAll();
      await openDetails(created.id);
    } catch (e) {
      setToast({ title: 'Create failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
    }
  };

  const workflow = async (id: string, action: 'submit' | 'approve' | 'reject' | 'reverse') => {
    try {
      const payload = action === 'reject' ? JSON.stringify({ reason: 'Rejected via Employment History' }) : undefined;
      const res = await apiMutate<DetailItem>(`/api/hris/employment-history/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        role,
        viewerEmployeeId,
        body: payload,
      });
      setSelected(res);
      setToast({ title: `Event ${action}d`, detail: `${res.referenceNo} is now ${res.approvalStatus}.`, tone: 'ok' });
      await loadAll();
    } catch (e) {
      setToast({ title: 'Workflow failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
    }
  };

  const exportCurrent = async () => {
    try {
      if (list.data?.permissions?.canExport === false) {
        setToast({ title: 'Permission denied', detail: 'You do not have permission to export.', tone: 'err' });
        return;
      }
      const qs = serializeFilters();
      const csv = await apiFetch<string>(`/api/hris/employment-history/export?${qs}`, { method: 'GET', role, viewerEmployeeId });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = employeeId ? `employment-history_${employeeId}.csv` : 'employment-history.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ title: 'Exported', detail: 'CSV export generated.', tone: 'ok' });
    } catch (e) {
      setToast({ title: 'Export failed', detail: e instanceof Error ? e.message : 'Request failed', tone: 'err' });
    }
  };

  const breadcrumb = (
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      <span>HRIS</span>
      <ChevronRight className="w-4 h-4" />
      <span>Employees</span>
      <ChevronRight className="w-4 h-4" />
      <span className="text-slate-700 font-extrabold">Employment History</span>
      {employeeId ? (
        <>
          <ChevronRight className="w-4 h-4" />
          <span className="text-slate-700 font-extrabold">{employeeId}</span>
        </>
      ) : null}
    </div>
  );

  const header = (
    <Card className="p-6">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Employment History</h1>
            <Chip label={`Loaded: ${nowStamp}`} />
            {employeeId ? <Chip label={`Scope: ${employeeId}`} /> : <Chip label="Scope: Organization" />}
          </div>
          <div className="text-sm text-slate-600 font-semibold mt-1">
            Track every employee lifecycle event, movement, promotion, transfer, status change, and exit record across the organization.
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <Fingerprint className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-extrabold text-slate-700">Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="text-xs font-extrabold text-slate-800 bg-white focus:outline-none">
                {[
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
                ].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <span className="text-xs font-extrabold text-slate-700">Viewer EmployeeId</span>
              <input value={viewerEmployeeId || ''} onChange={(e) => setViewerEmployeeId(e.target.value.trim() ? e.target.value.trim() : undefined)} placeholder="Optional (for Employee role)" className="w-[220px] text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none" />
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" />
            Add History Event
          </button>
          <button type="button" onClick={exportCurrent} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" />
            Export History
          </button>
          <button type="button" onClick={() => setToast({ title: 'Report', detail: 'Report generation is stubbed in this build.', tone: 'warn' })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <FileText className="w-4 h-4" />
            Generate Report
          </button>
          <button type="button" onClick={() => setToast({ title: 'Compare', detail: 'Compare changes is stubbed in this build.', tone: 'warn' })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <GitCompare className="w-4 h-4" />
            Compare Changes
          </button>
          <button type="button" onClick={loadAll} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>
    </Card>
  );

  const summaryCards = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {(
        [
          { key: 'total', label: 'Total History Events', icon: Layers, tone: { bg: 'bg-blue-600/5', fg: 'text-blue-700' } },
          { key: 'promotions', label: 'Promotions', icon: BadgeCheck, tone: { bg: 'bg-violet-600/5', fg: 'text-violet-700' } },
          { key: 'transfers', label: 'Transfers', icon: ChevronRight, tone: { bg: 'bg-orange-600/5', fg: 'text-orange-700' } },
          { key: 'contractRenewals', label: 'Contract Renewals', icon: Calendar, tone: { bg: 'bg-teal-600/5', fg: 'text-teal-700' } },
          { key: 'pendingApprovals', label: 'Pending Approvals', icon: ShieldCheck, tone: { bg: 'bg-amber-600/5', fg: 'text-amber-700' } },
          { key: 'suspensions', label: 'Suspensions', icon: AlertTriangle, tone: { bg: 'bg-red-600/5', fg: 'text-red-700' } },
          { key: 'exits', label: 'Exits', icon: X, tone: { bg: 'bg-slate-200/60', fg: 'text-slate-700' } },
          { key: 'reactivations', label: 'Reactivations', icon: CheckCircle2, tone: { bg: 'bg-emerald-600/5', fg: 'text-emerald-700' } },
          { key: 'confirmations', label: 'Confirmations', icon: CheckCircle2, tone: { bg: 'bg-emerald-600/5', fg: 'text-emerald-700' } },
          { key: 'currentMonthChanges', label: 'Current Month Changes', icon: BarChart3, tone: { bg: 'bg-blue-600/5', fg: 'text-blue-700' } },
        ] as const
      ).map((c) => {
        const Icon = c.icon;
        const v = summary.status === 'ready' && summary.data ? (summary.data as any)[c.key] : null;
        return (
          <Card key={c.key} className="p-4 relative overflow-hidden">
            <div className={`absolute inset-0 ${c.tone.bg}`} />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold text-slate-600">{c.label}</div>
                <div className={`text-2xl font-extrabold mt-1 ${c.tone.fg}`}>{v === null ? '—' : formatNumber(v)}</div>
                <div className="text-[11px] text-slate-500 font-semibold mt-1">Last updated: {nowStamp}</div>
              </div>
              <span className={`w-10 h-10 rounded-2xl border border-slate-200/60 bg-white flex items-center justify-center ${c.tone.fg}`}>
                <Icon className="w-5 h-5" />
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (c.key === 'promotions') setActiveFilters((p) => ({ ...p, eventType: new Set(['Promotion']) }));
                if (c.key === 'transfers') setActiveFilters((p) => ({ ...p, eventType: new Set(['Transfer']) }));
                if (c.key === 'pendingApprovals') setActiveFilters((p) => ({ ...p, approvalStatus: new Set(['Submitted', 'Pending HR Review', 'Pending Department Head Approval', 'Pending HR Director Approval']) }));
                if (c.key === 'contractRenewals') setActiveFilters((p) => ({ ...p, eventType: new Set(['Contract Renewal']) }));
                if (c.key === 'suspensions') setActiveFilters((p) => ({ ...p, eventType: new Set(['Suspension']) }));
              }}
              className="absolute inset-0"
              aria-label={`Drill down: ${c.label}`}
            />
          </Card>
        );
      })}
    </div>
  );

  const toolbar = (
    <Card className="p-4">
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by ID, name, department, manager, event type, reference, approval…" className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-dle-blue/20 focus:border-dle-blue" />
            {query.length > 0 && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setFilterPanelOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-extrabold text-slate-700 transition-colors">
              <Filter className="w-4 h-4" />
              Filters
              <span className="text-[11px] font-extrabold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                {formatNumber(activeFilters.eventType.size + activeFilters.department.size + activeFilters.approvalStatus.size + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0))}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveFilters({ eventType: new Set(), department: new Set(), approvalStatus: new Set() });
                setDateFrom('');
                setDateTo('');
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-extrabold text-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
              Reset
            </button>
            <button type="button" onClick={() => setToast({ title: 'Saved view', detail: 'Saved filter views are stubbed in this build.', tone: 'warn' })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-extrabold text-slate-700 transition-colors">
              <ChevronDown className="w-4 h-4" />
              Save View
            </button>
            <button type="button" onClick={exportCurrent} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
              <Download className="w-4 h-4" />
              Export Current View
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-between">
          {employeeId ? (
            <Link href={`/hris/employees/employee-profile/${encodeURIComponent(employeeId)}`} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
              <Fingerprint className="w-4 h-4 text-slate-500" />
              Open Profile
            </Link>
          ) : null}
          <button type="button" onClick={() => setToast({ title: 'Compare', detail: 'Compare changes is stubbed in this build.', tone: 'warn' })} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            <GitCompare className="w-4 h-4" />
            Compare
          </button>
        </div>
      </div>
    </Card>
  );

  const timeline = (
    <Card className="overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Employment History Timeline</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Visual lifecycle events with audit-ready metadata.</div>
          </div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
          Events: {list.status === 'ready' && list.data ? formatNumber(list.data.items.length) : '—'}
        </span>
      </div>
      <div className="p-6 space-y-3">
        {list.status === 'ready' && list.data ? (
          list.data.items.slice(0, 10).map((e) => {
            const tone = eventTone(e.eventType);
            const aTone = approvalTone(e.approvalStatus);
            return (
              <button key={e.id} type="button" onClick={() => openDetails(e.id)} className="w-full text-left rounded-2xl border border-slate-200/60 bg-white p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Pill label={e.eventType} tone={tone} />
                      <Pill label={e.approvalStatus} tone={aTone} />
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{e.referenceNo}</span>
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{e.employeeId}</span>
                    </div>
                    <div className="text-sm font-extrabold text-slate-900 mt-2">{e.employeeName}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">
                      Event: {formatDateUtc(e.eventDate)} <span className="mx-2">•</span> Effective: {formatDateUtc(e.effectiveDate)} <span className="mx-2">•</span> By: {e.createdBy}
                    </div>
                    <div className="text-xs text-slate-600 font-semibold mt-2 line-clamp-2">{e.reason}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                </div>
              </button>
            );
          })
        ) : list.status === 'loading' ? (
          <div className="text-sm text-slate-600 font-semibold">Loading timeline…</div>
        ) : (
          <div className="text-sm text-slate-600 font-semibold">{list.error || 'No timeline data.'}</div>
        )}
      </div>
    </Card>
  );

  const table = (
    <Card className="overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Employment History Table</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Searchable, filterable, export-ready registry.</div>
          </div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
          Showing: {list.status === 'ready' && list.data ? formatNumber(list.data.items.length) : '—'}
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {[
                'Reference',
                'Employee ID',
                'Name',
                'Event Type',
                'Prev Dept',
                'New Dept',
                'Prev Title',
                'New Title',
                'Prev Grade',
                'New Grade',
                'Effective Date',
                'Approval',
                'Approved By',
                'Created By',
                'Created Date',
                'Actions',
              ].map((h) => (
                <th key={h} className="px-4 py-3 text-[11px] font-extrabold text-slate-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.status === 'ready' && list.data ? (
              list.data.items.slice(0, 80).map((r) => {
                const tone = approvalTone(r.approvalStatus);
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-extrabold text-slate-900 whitespace-nowrap">{r.referenceNo}</td>
                    <td className="px-4 py-3 text-xs font-extrabold text-slate-900 whitespace-nowrap">{r.employeeId}</td>
                    <td className="px-4 py-3 text-sm font-extrabold text-slate-900 whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <Pill label={r.eventType} tone={eventTone(r.eventType)} />
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.previousDepartment || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.newDepartment || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.previousJobTitle || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.newJobTitle || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.previousGrade || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.newGrade || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{formatDateUtc(r.effectiveDate)}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold ${tone.bg} ${tone.fg}`}>{r.approvalStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.approvedBy || '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.createdBy}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{formatDateUtc(r.createdAt)}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <button type="button" onClick={() => openDetails(r.id)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={16} className="px-6 py-12 text-center">
                  <div className="text-sm text-slate-600 font-semibold">{list.status === 'loading' ? 'Loading history…' : list.error || 'No history found.'}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const analyticsPanel = (
    <Card className="overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Employee Movement Analytics</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Trend-ready counters by event type and department.</div>
          </div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
          Updated: {analytics.status === 'ready' && analytics.data ? formatDateTimeUtc(analytics.data.lastUpdatedAt) : '—'}
        </span>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4">
          <div className="text-xs font-extrabold text-slate-700">By Event Type</div>
          <div className="mt-3 space-y-2">
            {analytics.status === 'ready' && analytics.data ? (
              Object.entries(analytics.data.byEventType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-600">{k}</div>
                    <div className="text-xs font-extrabold text-slate-900">{formatNumber(v)}</div>
                  </div>
                ))
            ) : (
              <div className="text-sm text-slate-600 font-semibold">{analytics.status === 'loading' ? 'Loading…' : analytics.error || 'No analytics.'}</div>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4">
          <div className="text-xs font-extrabold text-slate-700">By Department</div>
          <div className="mt-3 space-y-2">
            {analytics.status === 'ready' && analytics.data ? (
              Object.entries(analytics.data.byDepartment)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-600">{k}</div>
                    <div className="text-xs font-extrabold text-slate-900">{formatNumber(v)}</div>
                  </div>
                ))
            ) : (
              <div className="text-sm text-slate-600 font-semibold">{analytics.status === 'loading' ? 'Loading…' : analytics.error || 'No analytics.'}</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );

  const insightPanel = (
    <Card className="overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-violet-600/10 border border-slate-200/60 flex items-center justify-center text-violet-700">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">AI History Insights</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Missing updates, workflow gaps, and lifecycle anomalies.</div>
          </div>
        </div>
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Confidence-weighted</span>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {insights.status === 'ready' && insights.data ? (
          insights.data.map((i) => {
            const st = severityStyle(i.severity);
            const Icon = st.icon;
            return (
              <div key={i.id} className={`rounded-2xl border ${st.border} bg-white p-4`}>
                <div className="flex items-start gap-3">
                  <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${st.bg} ${st.fg}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900">{i.title}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">{i.recommendation}</div>
                    <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${st.bg} ${st.fg}`}>AI confidence: {Math.round(i.confidence * 100)}%</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (i.action.startsWith('filter:')) {
                            const key = i.action.slice('filter:'.length);
                            if (key === 'confirmation') setActiveFilters((p) => ({ ...p, eventType: new Set(['Probation Change', 'Confirmation']) }));
                            if (key === 'transfer-manager') setActiveFilters((p) => ({ ...p, eventType: new Set(['Transfer']), approvalStatus: new Set() }));
                            if (key === 'grade-approval') setActiveFilters((p) => ({ ...p, eventType: new Set(['Grade Change', 'Promotion']) }));
                            if (key === 'renewal-docs') setActiveFilters((p) => ({ ...p, eventType: new Set(['Contract Renewal']) }));
                            if (key === 'exit-payroll') setActiveFilters((p) => ({ ...p, eventType: new Set(['Resignation', 'Termination', 'Retirement', 'Exit Clearance']) }));
                            setToast({ title: 'AI filter applied', detail: i.title, tone: 'ok' });
                            return;
                          }
                          if (i.action === 'open:analytics') {
                            setToast({ title: 'Analytics', detail: 'Analytics are available in the Movement Analytics section.', tone: 'ok' });
                            return;
                          }
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                        {i.actionLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-sm text-slate-600 font-semibold">{insights.status === 'loading' ? 'Loading insights…' : insights.error || 'No AI insights.'}</div>
        )}
      </div>
    </Card>
  );

  const eventTypes: EmploymentEventType[] = [
    'Onboarding',
    'Confirmation',
    'Probation Change',
    'Promotion',
    'Transfer',
    'Department Change',
    'Manager Change',
    'Job Title Change',
    'Grade Change',
    'Salary Grade Change',
    'Secondment',
    'Project Assignment',
    'Suspension',
    'Contract Renewal',
    'Reactivation',
    'Resignation',
    'Termination',
    'Retirement',
    'Exit Clearance',
  ];
  const approvalStatuses: ApprovalStatus[] = ['Draft', 'Submitted', 'Pending HR Review', 'Pending Department Head Approval', 'Pending HR Director Approval', 'Approved', 'Rejected', 'Reversed', 'Cancelled'];

  const filterDrawer = (
    <AnimatePresence>
      {filterPanelOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => setFilterPanelOpen(false)}>
          <motion.div
            initial={{ x: 520 }}
            animate={{ x: 0 }}
            exit={{ x: 520 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white border-l border-slate-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-dle-blue/10 border border-slate-200/60 flex items-center justify-center text-dle-blue">
                  <Filter className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Filters</div>
                  <div className="text-xs text-slate-500 font-semibold mt-0.5">Event type, department, approval status, date range.</div>
                </div>
              </div>
              <button type="button" onClick={() => setFilterPanelOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-auto h-[calc(100%-64px)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-extrabold text-slate-600">From</div>
                  <input value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} type="date" className="mt-1 w-full text-sm font-semibold text-slate-900 bg-white focus:outline-none" />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-extrabold text-slate-600">To</div>
                  <input value={dateTo} onChange={(e) => setDateTo(e.target.value)} type="date" className="mt-1 w-full text-sm font-semibold text-slate-900 bg-white focus:outline-none" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-extrabold text-slate-700">Event Type</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {eventTypes.map((t) => {
                    const on = activeFilters.eventType.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setActiveFilters((p) => {
                            const next = new Set(p.eventType);
                            if (next.has(t)) next.delete(t);
                            else next.add(t);
                            return { ...p, eventType: next };
                          })
                        }
                        className={`px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${on ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-extrabold text-slate-700">Approval Status</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {approvalStatuses.map((s) => {
                    const on = activeFilters.approvalStatus.has(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setActiveFilters((p) => {
                            const next = new Set(p.approvalStatus);
                            if (next.has(s)) next.delete(s);
                            else next.add(s);
                            return { ...p, approvalStatus: next };
                          })
                        }
                        className={`px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors ${on ? 'border-dle-blue bg-dle-blue/5 text-dle-blue' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveFilters({ eventType: new Set(), department: new Set(), approvalStatus: new Set() });
                    setDateFrom('');
                    setDateTo('');
                    setFilterPanelOpen(false);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Reset
                </button>
                <button type="button" onClick={() => setFilterPanelOpen(false)} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const addModal = (
    <Modal open={addOpen} onClose={() => setAddOpen(false)}>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-slate-900">Add History Event</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">Controlled changes require workflow approval to update employee profile.</div>
          </div>
        </div>
        <button type="button" onClick={() => setAddOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>
      <div className="p-6 space-y-5">
        {!employeeId ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 font-semibold">
            For this build, adding events is easiest when you open the employee-scoped route: <span className="font-mono">/hris/employees/employment-history/[employeeId]</span>
          </div>
        ) : null}

        {addProfile.status === 'ready' && addProfile.data ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-extrabold text-slate-700">Previous values loaded from Employee Profile</div>
            <div className="mt-2 text-xs text-slate-500 font-semibold">
              {addProfile.data.fullName} • {addProfile.data.employeeId} • {addProfile.data.jobTitle} • {addProfile.data.department}
            </div>
          </div>
        ) : addProfile.status === 'loading' ? (
          <div className="text-sm text-slate-600 font-semibold">Loading employee snapshot…</div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Field label="Employee ID" value={(addForm.employeeId || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, employeeId: v }))} required />
          <Field label="Employee Name" value={(addForm.employeeName || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, employeeName: v }))} required />
          <Select label="Event Type" value={(addForm.eventType as string) || ''} onChange={(v) => setAddForm((p) => ({ ...p, eventType: v as EmploymentEventType }))} options={eventTypes} required />
          <Field label="Effective Date (ISO)" value={(addForm.effectiveDate as string) || ''} onChange={(v) => setAddForm((p) => ({ ...p, effectiveDate: v }))} required />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Field label="Reason" value={(addForm.reason || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, reason: v }))} required />
          <Field label="Notes" value={(addForm.notes || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, notes: v }))} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-extrabold text-slate-700">Previous → New values</div>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Field label="Previous Department" value={(addForm.previousDepartment || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, previousDepartment: v }))} />
            <Field label="New Department" value={(addForm.newDepartment || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, newDepartment: v }))} />
            <Field label="Previous Job Title" value={(addForm.previousJobTitle || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, previousJobTitle: v }))} />
            <Field label="New Job Title" value={(addForm.newJobTitle || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, newJobTitle: v }))} />
            <Field label="Previous Grade" value={(addForm.previousGrade || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, previousGrade: v }))} />
            <Field label="New Grade" value={(addForm.newGrade || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, newGrade: v }))} />
            <Field label="Previous Manager" value={(addForm.previousManager || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, previousManager: v }))} />
            <Field label="New Manager" value={(addForm.newManager || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, newManager: v }))} />
            <Field label="Previous Status" value={(addForm.previousStatus || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, previousStatus: v }))} />
            <Field label="New Status" value={(addForm.newStatus || '').toString()} onChange={(v) => setAddForm((p) => ({ ...p, newStatus: v }))} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => setAddOpen(false)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={submitAdd} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
            <CheckCircle2 className="w-4 h-4" />
            Create Draft Event
          </button>
        </div>
      </div>
    </Modal>
  );

  const drawer = (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}>
          <motion.div
            initial={{ x: 560 }}
            animate={{ x: 0 }}
            exit={{ x: 560 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="absolute right-0 top-0 h-full w-full max-w-[560px] bg-white border-l border-slate-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Event Details</div>
                  <div className="text-xs text-slate-500 font-semibold mt-0.5">Workflow + audit trail.</div>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-auto h-[calc(100%-64px)]">
              {!selected ? (
                <div className="text-sm text-slate-600 font-semibold">Loading event…</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill label={selected.eventType} tone={eventTone(selected.eventType)} />
                    <Pill label={selected.approvalStatus} tone={approvalTone(selected.approvalStatus)} />
                    <Chip label={selected.referenceNo} />
                    <Chip label={selected.employeeId} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-extrabold text-slate-900">{selected.employeeName}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">
                      Event date: {formatDateTimeUtc(selected.eventDate)} <span className="mx-2">•</span> Effective: {formatDateTimeUtc(selected.effectiveDate)}
                    </div>
                    <div className="text-xs text-slate-600 font-semibold mt-2">{selected.reason}</div>
                    {selected.notes ? <div className="text-xs text-slate-600 font-semibold mt-2">Notes: {selected.notes}</div> : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-extrabold text-slate-700">Change summary</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <div className="text-[11px] font-extrabold text-slate-600">Previous</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Dept: {selected.previousDepartment || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Title: {selected.previousJobTitle || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Grade: {selected.previousGrade || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Manager: {selected.previousManager || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Status: {selected.previousStatus || '—'}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <div className="text-[11px] font-extrabold text-slate-600">New</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Dept: {selected.newDepartment || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Title: {selected.newJobTitle || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Grade: {selected.newGrade || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Manager: {selected.newManager || '—'}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">Status: {selected.newStatus || '—'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => workflow(selected.id, 'submit')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition-colors">
                      <ShieldCheck className="w-4 h-4" />
                      Submit
                    </button>
                    <button type="button" onClick={() => workflow(selected.id, 'approve')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold hover:bg-emerald-700 transition-colors">
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                    <button type="button" onClick={() => workflow(selected.id, 'reject')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-extrabold hover:bg-red-700 transition-colors">
                      <X className="w-4 h-4" />
                      Reject
                    </button>
                    <button type="button" onClick={() => workflow(selected.id, 'reverse')} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors">
                      Reverse
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/hris/employees/employee-profile/${encodeURIComponent(selected.employeeId)}`);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Fingerprint className="w-4 h-4" />
                      Open Profile
                    </button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-extrabold text-slate-700">Audit log</div>
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{selected.audit ? formatNumber(selected.audit.length) : '—'}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(selected.audit || []).slice(0, 12).map((a) => (
                        <div key={a.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs font-extrabold text-slate-900">{a.action}</div>
                          <div className="text-[11px] text-slate-500 font-semibold mt-1">
                            {formatDateTimeUtc(a.at)} <span className="mx-2">•</span> {a.performedBy}
                          </div>
                          {a.reason ? <div className="text-xs text-slate-600 font-semibold mt-1">Reason: {a.reason}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const loading = list.status === 'loading';
  const hasError = list.status === 'error';

  return (
    <div className="bg-white space-y-6">
      {breadcrumb}
      {header}
      {summaryCards}
      {insightPanel}
      {toolbar}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {timeline}
        {analyticsPanel}
      </div>
      {table}

      {filterDrawer}
      {addModal}
      {drawer}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.16 }} className="fixed bottom-6 right-6 z-50">
            <div className={`w-[380px] rounded-2xl border shadow-lg p-4 bg-white ${toast.tone === 'err' ? 'border-red-200' : toast.tone === 'warn' ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-900">{toast.title}</div>
                  <div className="text-xs text-slate-600 font-semibold mt-1">{toast.detail}</div>
                  {loading ? <div className="text-[11px] text-slate-500 font-semibold mt-2">Loading…</div> : null}
                  {hasError ? <div className="text-[11px] text-red-700 font-extrabold mt-2">Error: {list.error}</div> : null}
                </div>
                <button type="button" onClick={() => setToast(null)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

