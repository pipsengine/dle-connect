'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BadgeCheck,
  Check,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FileText,
  FileUp,
  Pencil,
  RefreshCcw,
  Search,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react';

type Role =
  | 'Super Admin'
  | 'HR Director'
  | 'HR Manager'
  | 'HR Officer'
  | 'Admin Officer'
  | 'Legal Officer'
  | 'Compliance Officer'
  | 'HSE Officer'
  | 'Payroll Officer'
  | 'Auditor'
  | 'Employee'
  | 'Line Manager'
  | 'Executive Management'
  | 'IT Administrator';

type Severity = 'high' | 'medium' | 'low';
type DocumentStatus = 'Not Required' | 'Pending Verification' | 'Verified' | 'Rejected' | 'Expired' | 'Update Required' | 'Archived' | 'Uploaded';
type ComplianceStatus = 'Compliant' | 'At Risk' | 'Non-Compliant' | 'Unknown';
type ConfidentialityLevel = 'Public' | 'Internal' | 'Confidential' | 'Restricted';

type DocumentItem = {
  id: string;
  category: string;
  documentTitle?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  issueDate?: string | null;
  expiresAt?: string | null;
  status: DocumentStatus;
  complianceStatus?: ComplianceStatus;
  confidentialityLevel?: ConfidentialityLevel;
  versionNumber?: number;
  uploadedBy?: string | null;
  uploadedAt: string;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  archivedAt?: string | null;
  archiveReason?: string | null;
  notes?: string | null;
};

type EmployeeOption = {
  employeeId: string;
  employeeCode?: string;
  fullName: string;
  department?: string;
  jobTitle?: string;
  status?: string;
  managerName?: string;
  currentManager?: string;
  location?: string;
  workLocation?: string;
  businessUnit?: string;
  employmentType?: string;
};

type EmployeeDirectoryPayload = {
  source: string;
  syncedAt: string;
  employees: EmployeeOption[];
};

type AIInsight = {
  id: string;
  severity: Severity;
  confidence: number;
  title: string;
  recommendation: string;
  actionLabel: string;
  action: string;
};

type ExpiringRow = {
  documentId: string;
  employeeId: string;
  employeeName: string;
  category: string;
  fileName: string;
  expiresAt: string;
  daysToExpiry: number;
  status: 'Valid' | 'Expiring Soon' | 'Expired';
};

type AuditEntry = {
  id: string;
  at: string;
  action: string;
  performedBy: string;
  employeeId?: string;
  documentId?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
};

type DocumentDetailsResponse = { document: DocumentItem; audit: AuditEntry[] };

type ApiState<T> = {
  loading: boolean;
  data: T;
  error: string | null;
};

type Draft = {
  category: string;
  documentTitle: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  issueDate: string;
  expiryDate: string;
  confidentialityLevel: ConfidentialityLevel;
  verificationRequired: boolean;
  notes: string;
};

type MetadataDraft = {
  id: string;
  category: string;
  documentTitle: string;
  issueDate: string;
  expiryDate: string;
  confidentialityLevel: ConfidentialityLevel;
  notes: string;
  reason: string;
};

type ReplaceDraft = {
  target: DocumentItem;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  reason: string;
};

const ROLES: Role[] = ['HR Manager', 'HR Officer', 'HR Director', 'Compliance Officer', 'Legal Officer', 'Payroll Officer', 'Auditor', 'Employee', 'Super Admin'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const DOCUMENT_CATEGORIES = [
  'Employment Letter',
  'Offer Letter',
  'Signed Employment Contract',
  'CV / Resume',
  'Academic Certificate',
  'Professional Certificate',
  'Government ID',
  'NIN',
  'BVN',
  'International Passport',
  'Tax Document',
  'Pension Document',
  'Medical Certificate',
  'Guarantor Form',
  'Reference Letter',
  'Promotion Letter',
  'Transfer Letter',
  'Warning Letter',
  'Disciplinary Letter',
  'Training Certificate',
  'HSE Certificate',
  'Contract Renewal Letter',
  'Exit Document',
  'Clearance Form',
  'Other Document',
];
const MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
];
const CONFIDENTIALITY: ConfidentialityLevel[] = ['Public', 'Internal', 'Confidential', 'Restricted'];

const emptyDraft = (): Draft => ({
  category: 'Government ID',
  documentTitle: '',
  fileName: '',
  mimeType: 'application/pdf',
  sizeBytes: '250000',
  issueDate: '',
  expiryDate: '',
  confidentialityLevel: 'Internal',
  verificationRequired: true,
  notes: '',
});

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatNumber = (n: number) => new Intl.NumberFormat('en-GB').format(n);
const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const s = value.includes('T') ? value : `${value}T00:00:00.000Z`;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '--';
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '--';
  return `${formatDate(value)}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
};

const apiHeaders = (role: Role, viewerEmployeeId?: string) => ({
  'content-type': 'application/json',
  'x-hris-role': role,
  ...(viewerEmployeeId ? { 'x-hris-employee-id': viewerEmployeeId } : {}),
});

async function apiJson<T>(url: string, init: RequestInit & { role: Role; viewerEmployeeId?: string }) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...apiHeaders(init.role, init.viewerEmployeeId),
      ...(init.headers || {}),
    },
  });
  const json = (await res.json().catch(() => null)) as { status?: string; data?: T; error?: string } | null;
  if (!res.ok || json?.status !== 'success') throw new Error(json?.error || 'Request failed');
  return json.data as T;
}

const employeeApi = <T,>(employeeId: string, resource: string, init: RequestInit & { role: Role; viewerEmployeeId?: string }) =>
  apiJson<T>(`/api/hris/employees/${encodeURIComponent(employeeId)}/${resource}`, init);

const moduleApi = <T,>(resource: string, init: RequestInit & { role: Role; viewerEmployeeId?: string }) => apiJson<T>(resource, init);

const mapDirectoryEmployee = (employee: EmployeeOption): EmployeeOption => ({
  employeeId: employee.employeeId || employee.employeeCode || '',
  employeeCode: employee.employeeCode,
  fullName: employee.fullName || employee.employeeId || employee.employeeCode || 'Unnamed employee',
  department: employee.department || '',
  jobTitle: employee.jobTitle || '',
  status: employee.status || '',
  currentManager: employee.currentManager || employee.managerName || '',
  managerName: employee.managerName || employee.currentManager || '',
  location: employee.location || employee.workLocation || '',
  workLocation: employee.workLocation || employee.location || '',
  businessUnit: employee.businessUnit || '',
  employmentType: employee.employmentType || '',
});

const styleForStatus = (status: string) => {
  const v = status.toLowerCase();
  if (v.includes('verified') || v.includes('compliant') || v.includes('valid')) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (v.includes('pending') || v.includes('uploaded') || v.includes('expiring') || v.includes('risk')) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (v.includes('rejected') || v.includes('expired') || v.includes('non') || v.includes('missing')) return 'border-red-200 bg-red-50 text-red-800';
  if (v.includes('archived')) return 'border-slate-200 bg-slate-100 text-slate-700';
  return 'border-slate-200 bg-white text-slate-700';
};

const styleForSeverity = (severity: Severity) => {
  if (severity === 'high') return 'border-red-200 bg-red-50 text-red-800';
  if (severity === 'medium') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
};

const categoryFromFileName = (fileName: string) => {
  const value = fileName.toLowerCase();
  if (value.includes('nin')) return 'NIN';
  if (value.includes('bvn')) return 'BVN';
  if (value.includes('passport')) return 'International Passport';
  if (value.includes('tax')) return 'Tax Document';
  if (value.includes('pension')) return 'Pension Document';
  if (value.includes('medical')) return 'Medical Certificate';
  if (value.includes('hse')) return 'HSE Certificate';
  if (value.includes('cv') || value.includes('resume')) return 'CV / Resume';
  if (value.includes('offer')) return 'Offer Letter';
  if (value.includes('contract')) return 'Signed Employment Contract';
  return 'Other Document';
};

const readinessFor = (docs: DocumentItem[]) => {
  const verified = docs.filter((doc) => doc.status === 'Verified').length;
  const required = ['Government ID', 'NIN', 'Signed Employment Contract'];
  const checks = [
    { label: 'At least one document uploaded', done: docs.length > 0 },
    { label: 'Government ID available', done: docs.some((doc) => doc.category === 'Government ID') },
    { label: 'NIN available', done: docs.some((doc) => doc.category === 'NIN') },
    { label: 'Signed contract available', done: docs.some((doc) => doc.category === 'Signed Employment Contract') },
    { label: 'No rejected documents', done: !docs.some((doc) => doc.status === 'Rejected') },
    { label: 'Verified document coverage', done: docs.length > 0 && verified / docs.length >= 0.6 },
  ];
  const score = Math.round((checks.filter((check) => check.done).length / checks.length) * 100);
  const state = score >= 85 ? 'Compliant' : score >= 60 ? 'At Risk' : score >= 35 ? 'Needs Attention' : 'Non-Compliant';
  return { checks, score, state, missing: required.filter((category) => !docs.some((doc) => doc.category === category)) };
};

const StatusPill = ({ value }: { value: string }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${styleForStatus(value)}`}>{value}</span>
);

const IconButton = ({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone = 'secondary',
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'dark' | 'danger';
}) => {
  const cls =
    tone === 'primary'
      ? 'border-dle-blue bg-dle-blue text-white hover:bg-dle-blue/90'
      : tone === 'dark'
        ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800'
        : tone === 'danger'
          ? 'border-red-200 bg-white text-red-700 hover:bg-red-50'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-extrabold transition disabled:pointer-events-none disabled:opacity-50 ${cls}`}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
};

const Modal = ({ title, children, onClose, width = 'max-w-3xl' }: { title: string; children: React.ReactNode; onClose: () => void; width?: string }) => (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8">
    <div className={`w-full ${width} overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl`}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="text-sm font-extrabold text-slate-900">{title}</div>
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

export default function EmployeeDocumentsClient({ employeeId }: { employeeId: string; initialNow: string }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>('HR Manager');
  const [viewerEmployeeId, setViewerEmployeeId] = useState('');
  const [activeEmployeeId, setActiveEmployeeId] = useState(employeeId);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [documentQuery, setDocumentQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);

  const [employeesState, setEmployeesState] = useState<ApiState<EmployeeOption[]>>({ loading: false, data: [], error: null });
  const [documentsState, setDocumentsState] = useState<ApiState<DocumentItem[]>>({ loading: true, data: [], error: null });
  const [insightsState, setInsightsState] = useState<ApiState<AIInsight[]>>({ loading: false, data: [], error: null });
  const [expiringState, setExpiringState] = useState<ApiState<ExpiringRow[]>>({ loading: false, data: [], error: null });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft | null>(null);
  const [replaceDraft, setReplaceDraft] = useState<ReplaceDraft | null>(null);
  const [details, setDetails] = useState<DocumentDetailsResponse | null>(null);

  const canManage = !['Employee', 'Line Manager', 'Executive Management', 'Auditor'].includes(role);
  const canVerify = ['Super Admin', 'HR Director', 'HR Manager', 'HR Officer', 'Compliance Officer', 'Legal Officer'].includes(role);
  const effectiveViewerEmployeeId = role === 'Employee' ? viewerEmployeeId || activeEmployeeId : viewerEmployeeId || undefined;

  useEffect(() => {
    setActiveEmployeeId(employeeId);
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    const loadEmployees = async () => {
      if (role === 'Employee') {
        setEmployeesState({ loading: false, data: [], error: null });
        return;
      }
      setEmployeesState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await moduleApi<EmployeeDirectoryPayload>('/api/hris/employees', { method: 'GET', role, viewerEmployeeId: effectiveViewerEmployeeId });
        const employees = (data.employees || []).map(mapDirectoryEmployee).filter((employee) => employee.employeeId);
        if (!cancelled) setEmployeesState({ loading: false, data: employees, error: null });
      } catch (error) {
        if (!cancelled) setEmployeesState({ loading: false, data: [], error: error instanceof Error ? error.message : 'Unable to load employees from DLE_Enterprise HRIS' });
      }
    };
    void loadEmployees();
    return () => {
      cancelled = true;
    };
  }, [role, effectiveViewerEmployeeId]);

  useEffect(() => {
    let cancelled = false;
    const loadDocuments = async () => {
      setDocumentsState((prev) => ({ ...prev, loading: true, error: null }));
      setInsightsState((prev) => ({ ...prev, loading: true, error: null }));
      setExpiringState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [docs, insights, expiring] = await Promise.all([
          employeeApi<DocumentItem[]>(activeEmployeeId, 'documents', { method: 'GET', role, viewerEmployeeId: effectiveViewerEmployeeId }),
          moduleApi<AIInsight[]>(`/api/hris/documents/ai-insights?employeeId=${encodeURIComponent(activeEmployeeId)}`, { method: 'GET', role, viewerEmployeeId: effectiveViewerEmployeeId }).catch(() => []),
          role === 'Employee'
            ? Promise.resolve([] as ExpiringRow[])
            : moduleApi<ExpiringRow[]>(`/api/hris/documents/expiring?employeeId=${encodeURIComponent(activeEmployeeId)}`, { method: 'GET', role, viewerEmployeeId: effectiveViewerEmployeeId }).catch(() => []),
        ]);
        if (!cancelled) {
          setDocumentsState({ loading: false, data: docs || [], error: null });
          setInsightsState({ loading: false, data: insights || [], error: null });
          setExpiringState({ loading: false, data: expiring || [], error: null });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load employee documents';
        if (!cancelled) {
          setDocumentsState({ loading: false, data: [], error: message });
          setInsightsState({ loading: false, data: [], error: message });
          setExpiringState({ loading: false, data: [], error: null });
        }
      }
    };
    void loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [activeEmployeeId, refreshKey, role, effectiveViewerEmployeeId]);

  const employees = employeesState.data;
  const docs = documentsState.data;
  const [renderedAt] = useState(() => Date.now());
  const activeEmployee = employees.find((employee) => employee.employeeId === activeEmployeeId);
  const readiness = useMemo(() => readinessFor(docs), [docs]);
  const verifiedCount = docs.filter((doc) => doc.status === 'Verified').length;
  const pendingCount = docs.filter((doc) => doc.status === 'Pending Verification' || doc.status === 'Uploaded').length;
  const rejectedCount = docs.filter((doc) => doc.status === 'Rejected').length;
  const expiredCount = docs.filter((doc) => doc.status === 'Expired' || (doc.expiresAt && new Date(doc.expiresAt).getTime() < renderedAt)).length;
  const confidentialCount = docs.filter((doc) => doc.confidentialityLevel === 'Confidential' || doc.confidentialityLevel === 'Restricted').length;
  const lastUpdated = docs
    .map((doc) => doc.uploadedAt || doc.verifiedAt || doc.archivedAt)
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];

  useEffect(() => {
    if (role === 'Employee') return;
    if (employeesState.loading || employeesState.error || employees.length === 0) return;
    const activeExists = employees.some((employee) => employee.employeeId === activeEmployeeId);
    if (!activeExists && activeEmployeeId === 'DLE-EMP-00001') {
      const firstEmployeeId = employees[0].employeeId;
      setActiveEmployeeId(firstEmployeeId);
      router.replace(`/hris/employees/employee-documents?employeeId=${encodeURIComponent(firstEmployeeId)}`);
    }
  }, [activeEmployeeId, employees, employeesState.error, employeesState.loading, role, router]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 60);
    return employees
      .filter((employee) => [employee.employeeId, employee.employeeCode, employee.fullName, employee.department, employee.jobTitle, employee.status, employee.location, employee.businessUnit].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))
      .slice(0, 80);
  }, [employeeQuery, employees]);

  const filteredDocs = useMemo(() => {
    const q = documentQuery.trim().toLowerCase();
    return docs.filter((doc) => {
      const matchesSearch = !q || [doc.category, doc.documentTitle, doc.fileName, doc.status, doc.complianceStatus, doc.confidentialityLevel].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
      const matchesCategory = categoryFilter === 'All' || doc.category === categoryFilter;
      const matchesStatus = statusFilter === 'All' || doc.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, documentQuery, docs, statusFilter]);

  const showToast = (message: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  };

  const refresh = () => setRefreshKey((value) => value + 1);
  const selectEmployee = (id: string) => {
    setActiveEmployeeId(id);
    router.replace(`/hris/employees/employee-documents?employeeId=${encodeURIComponent(id)}`);
  };

  const openUpload = () => {
    setDraft(emptyDraft());
    setUploadOpen(true);
  };

  const uploadDocument = async () => {
    const sizeBytes = Number(draft.sizeBytes);
    if (!draft.category) return showToast('Document category is required', 'error');
    if (!draft.fileName.trim()) return showToast('File name is required', 'error');
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return showToast('File size is required', 'error');
    if (sizeBytes > 15 * 1024 * 1024) return showToast('File size exceeds 15 MB policy limit', 'error');

    setBusy(true);
    try {
      await employeeApi<DocumentItem>(activeEmployeeId, 'documents', {
        method: 'POST',
        role,
        viewerEmployeeId: effectiveViewerEmployeeId,
        body: JSON.stringify({
          category: draft.category,
          documentTitle: draft.documentTitle.trim() || draft.category,
          fileName: draft.fileName.trim(),
          mimeType: draft.mimeType,
          sizeBytes,
          issueDate: draft.issueDate || null,
          expiryDate: draft.expiryDate || null,
          confidentialityLevel: draft.confidentialityLevel,
          verificationRequired: draft.verificationRequired,
          notes: draft.notes.trim() || null,
        }),
      });
      setUploadOpen(false);
      showToast('Document uploaded and queued for compliance review');
      refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Upload failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openMetadata = (doc: DocumentItem) => {
    setMetadataDraft({
      id: doc.id,
      category: doc.category,
      documentTitle: doc.documentTitle || doc.category,
      issueDate: doc.issueDate || '',
      expiryDate: doc.expiresAt || '',
      confidentialityLevel: doc.confidentialityLevel || 'Internal',
      notes: doc.notes || '',
      reason: 'Metadata correction',
    });
  };

  const saveMetadata = async () => {
    if (!metadataDraft) return;
    setBusy(true);
    try {
      await moduleApi<DocumentItem>(`/api/hris/documents/${encodeURIComponent(metadataDraft.id)}`, {
        method: 'PATCH',
        role,
        viewerEmployeeId: effectiveViewerEmployeeId,
        body: JSON.stringify(metadataDraft),
      });
      setMetadataDraft(null);
      showToast('Document metadata updated');
      refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Metadata update failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const actionDocument = async (doc: DocumentItem, action: 'verify' | 'reject' | 'archive') => {
    const body =
      action === 'verify'
        ? { method: 'Original sighted / HR review' }
        : action === 'reject'
          ? { rejectionReason: 'Rejected during compliance review' }
          : { archiveReason: 'Superseded or no longer required' };
    setBusy(true);
    try {
      await moduleApi<DocumentItem>(`/api/hris/documents/${encodeURIComponent(doc.id)}/${action}`, {
        method: 'POST',
        role,
        viewerEmployeeId: effectiveViewerEmployeeId,
        body: JSON.stringify(body),
      });
      showToast(action === 'verify' ? 'Document verified' : action === 'reject' ? 'Document rejected' : 'Document archived');
      refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveReplacement = async () => {
    if (!replaceDraft) return;
    const sizeBytes = Number(replaceDraft.sizeBytes);
    if (!replaceDraft.fileName.trim()) return showToast('Replacement file name is required', 'error');
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return showToast('Replacement file size is required', 'error');
    setBusy(true);
    try {
      await moduleApi<DocumentItem>(`/api/hris/documents/${encodeURIComponent(replaceDraft.target.id)}/replace`, {
        method: 'POST',
        role,
        viewerEmployeeId: effectiveViewerEmployeeId,
        body: JSON.stringify({
          fileName: replaceDraft.fileName.trim(),
          mimeType: replaceDraft.mimeType,
          sizeBytes,
          reason: replaceDraft.reason.trim() || 'Replacement',
        }),
      });
      setReplaceDraft(null);
      showToast('Document replaced and verification reset');
      refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Replacement failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openDetails = async (doc: DocumentItem) => {
    setBusy(true);
    try {
      const data = await moduleApi<DocumentDetailsResponse>(`/api/hris/documents/${encodeURIComponent(doc.id)}`, { method: 'GET', role, viewerEmployeeId: effectiveViewerEmployeeId });
      setDetails(data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load document details', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 bg-white pb-8">
      <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-500">
        <span>HRIS</span>
        <span>/</span>
        <span>Employees</span>
        <span>/</span>
        <span className="text-slate-900">Employee Documents</span>
      </div>

      <section className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-extrabold text-blue-800">
              <FileCheck2 className="h-3.5 w-3.5" />
              Production document control
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">Employee Documents</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Manage employee document uploads, verification, expiry monitoring, confidentiality access, replacement history, and compliance audit trails from the live HRIS database.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {role === 'Employee' ? (
              <input value={viewerEmployeeId} onChange={(event) => setViewerEmployeeId(event.target.value)} placeholder="Viewer employee ID" className="h-9 w-44 rounded-lg border border-slate-200 px-3 text-xs font-extrabold text-slate-700" />
            ) : null}
            <IconButton label="Refresh" icon={RefreshCcw} onClick={refresh} disabled={busy || documentsState.loading} />
            <a href={`/api/hris/documents/export?format=csv&employeeId=${encodeURIComponent(activeEmployeeId)}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" />
              Export CSV
            </a>
            <IconButton label="Upload" icon={Upload} onClick={openUpload} disabled={!canManage || busy} tone="primary" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold uppercase text-slate-500">Employee</div>
                <div className="mt-1 text-sm font-extrabold text-slate-950">{activeEmployee?.fullName || activeEmployeeId}</div>
              </div>
              <Users className="h-5 w-5 text-slate-400" />
            </div>
            {role !== 'Employee' ? (
              <>
                <div className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search live employees" className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400" />
                </div>
                <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {employeesState.loading ? <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-500">Loading employees from DLE_Enterprise...</div> : null}
                  {employeesState.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{employeesState.error}</div> : null}
                  {filteredEmployees.map((employee) => (
                    <button key={employee.employeeId} type="button" onClick={() => selectEmployee(employee.employeeId)} className={`w-full rounded-lg border p-3 text-left transition ${employee.employeeId === activeEmployeeId ? 'border-dle-blue bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <div className="text-xs font-extrabold text-slate-950">{employee.fullName}</div>
                      <div className="mt-1 truncate text-[11px] font-bold text-slate-500">
                        {employee.employeeId} · {employee.department || 'Unassigned'} · {employee.jobTitle || 'No job title'}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs font-bold leading-5 text-slate-600">Employee role is restricted to the viewer employee record.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-extrabold uppercase text-slate-500">Document Readiness</div>
                <div className="mt-1 text-3xl font-extrabold text-slate-950">{readiness.score}%</div>
              </div>
              <StatusPill value={readiness.state} />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${readiness.score}%` }} />
            </div>
            <div className="mt-4 space-y-2">
              {readiness.checks.map((check) => (
                <div key={check.label} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${check.done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{check.done ? <Check className="h-3.5 w-3.5" /> : null}</span>
                  {check.label}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              ['Documents', formatNumber(docs.length)],
              ['Verified', formatNumber(verifiedCount)],
              ['Pending', formatNumber(pendingCount)],
              ['Rejected', formatNumber(rejectedCount)],
              ['Expired', formatNumber(expiredCount)],
              ['Sensitive', formatNumber(confidentialCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-extrabold uppercase text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-extrabold text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          {documentsState.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{documentsState.error}</div> : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase text-slate-500">Compliance Intelligence</div>
                  <div className="mt-1 text-sm font-bold text-slate-600">Document risks generated from required records, expiry, verification and category rules.</div>
                </div>
                <ShieldCheck className="h-5 w-5 text-slate-400" />
              </div>
              <div className="mt-4 space-y-3">
                {insightsState.loading ? <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-500">Loading insights...</div> : null}
                {!insightsState.loading && insightsState.data.length === 0 ? <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-500">No active document risks detected.</div> : null}
                {insightsState.data.slice(0, 4).map((insight) => (
                  <div key={insight.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-950">{insight.title}</div>
                        <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">{insight.recommendation}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase ${styleForSeverity(insight.severity)}`}>{insight.severity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-extrabold uppercase text-slate-500">Expiry Watch</div>
                  <div className="mt-1 text-sm font-bold text-slate-600">Documents expired or expiring within the active monitoring window.</div>
                </div>
                <FileClock className="h-5 w-5 text-slate-400" />
              </div>
              <div className="mt-4 space-y-3">
                {expiringState.loading ? <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-500">Loading expiry watch...</div> : null}
                {!expiringState.loading && expiringState.data.length === 0 ? <div className="rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-500">No document expiries in scope.</div> : null}
                {expiringState.data.slice(0, 5).map((row) => (
                  <div key={row.documentId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-extrabold text-slate-950">{row.category}</div>
                      <div className="mt-1 text-[11px] font-bold text-slate-500">{formatDate(row.expiresAt)} · {row.daysToExpiry} days</div>
                    </div>
                    <StatusPill value={row.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-extrabold text-slate-950">Document Register</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {activeEmployeeId} · Last activity {lastUpdated ? formatDateTime(new Date(lastUpdated).toISOString()) : '--'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} placeholder="Search documents" className="w-44 bg-transparent text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400" />
                </div>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">
                  {['All', ...DOCUMENT_CATEGORIES].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">
                  {['All', 'Pending Verification', 'Uploaded', 'Verified', 'Rejected', 'Expired', 'Archived', 'Not Required'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            {documentsState.loading ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-lg bg-slate-50" />
                ))}
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="mt-4 text-sm font-extrabold text-slate-950">No documents found</div>
                <div className="mt-2 text-xs font-semibold text-slate-500">Upload verified HR documents for this live employee record.</div>
                <button type="button" onClick={openUpload} disabled={!canManage} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-dle-blue px-3 text-xs font-extrabold text-white disabled:opacity-50">
                  <Upload className="h-4 w-4" />
                  Upload Document
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full text-left">
                  <thead className="bg-slate-50 text-[11px] font-extrabold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Document</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Compliance</th>
                      <th className="px-4 py-3">Confidentiality</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">File</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDocs.map((doc) => (
                      <tr key={doc.id} className="align-top">
                        <td className="px-4 py-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                              <FileText className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="font-extrabold text-slate-950">{doc.documentTitle || doc.category}</div>
                              <div className="mt-1 text-xs font-bold text-slate-500">{doc.category} · v{doc.versionNumber || 1}</div>
                              <div className="mt-1 max-w-[320px] truncate text-xs font-semibold text-slate-500">{doc.notes || 'No notes'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill value={doc.status} />
                          <div className="mt-2 text-[11px] font-bold text-slate-500">{doc.verifiedBy ? `By ${doc.verifiedBy}` : 'Not verified'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill value={doc.complianceStatus || 'Unknown'} />
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill value={doc.confidentialityLevel || 'Internal'} />
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-slate-600">
                          <div>Issue: {formatDate(doc.issueDate)}</div>
                          <div className="mt-1">Expiry: {formatDate(doc.expiresAt)}</div>
                          <div className="mt-1">Uploaded: {formatDate(doc.uploadedAt)}</div>
                        </td>
                        <td className="px-4 py-4 text-xs font-bold text-slate-600">
                          <div className="max-w-[220px] truncate">{doc.fileName}</div>
                          <div className="mt-1 text-slate-500">{formatBytes(doc.sizeBytes)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            <IconButton label="Details" icon={Eye} onClick={() => void openDetails(doc)} disabled={busy} />
                            <a href={`/api/hris/documents/${encodeURIComponent(doc.id)}/download`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
                              <Download className="h-4 w-4" />
                              Download
                            </a>
                            <IconButton label="Edit" icon={Pencil} onClick={() => openMetadata(doc)} disabled={!canManage || busy} />
                            <IconButton label="Verify" icon={BadgeCheck} onClick={() => void actionDocument(doc, 'verify')} disabled={!canVerify || busy || doc.status === 'Verified'} />
                            <IconButton label="Replace" icon={FileUp} onClick={() => setReplaceDraft({ target: doc, fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: String(doc.sizeBytes), reason: 'Replacement upload' })} disabled={!canManage || busy} />
                            <IconButton label="Archive" icon={Archive} onClick={() => void actionDocument(doc, 'archive')} disabled={!canManage || busy || doc.status === 'Archived'} tone="danger" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </section>

      {uploadOpen ? (
        <Modal title="Upload Employee Document" onClose={() => setUploadOpen(false)} width="max-w-5xl">
          <div className="grid gap-4 p-5 lg:grid-cols-3">
            <SelectField label="Category" value={draft.category} values={DOCUMENT_CATEGORIES} onChange={(value) => setDraft((prev) => ({ ...prev, category: value }))} />
            <Field label="Document Title" value={draft.documentTitle} onChange={(value) => setDraft((prev) => ({ ...prev, documentTitle: value }))} />
            <Field
              label="File Name"
              value={draft.fileName}
              onChange={(value) => setDraft((prev) => ({ ...prev, fileName: value, category: prev.category === 'Other Document' || !prev.category ? categoryFromFileName(value) : prev.category }))}
              required
            />
            <SelectField label="MIME Type" value={draft.mimeType} values={MIME_TYPES} onChange={(value) => setDraft((prev) => ({ ...prev, mimeType: value }))} />
            <Field label="Size (bytes)" value={draft.sizeBytes} onChange={(value) => setDraft((prev) => ({ ...prev, sizeBytes: value }))} required />
            <SelectField label="Confidentiality" value={draft.confidentialityLevel} values={CONFIDENTIALITY} onChange={(value) => setDraft((prev) => ({ ...prev, confidentialityLevel: value as ConfidentialityLevel }))} />
            <Field label="Issue Date" type="date" value={draft.issueDate} onChange={(value) => setDraft((prev) => ({ ...prev, issueDate: value }))} />
            <Field label="Expiry Date" type="date" value={draft.expiryDate} onChange={(value) => setDraft((prev) => ({ ...prev, expiryDate: value }))} />
            <Toggle label="Verification Required" checked={draft.verificationRequired} onChange={(checked) => setDraft((prev) => ({ ...prev, verificationRequired: checked }))} />
            <Field label="Notes" value={draft.notes} onChange={(value) => setDraft((prev) => ({ ...prev, notes: value }))} wide />
          </div>
          <ModalActions onCancel={() => setUploadOpen(false)} onSave={uploadDocument} busy={busy} label="Upload Document" />
        </Modal>
      ) : null}

      {metadataDraft ? (
        <Modal title="Edit Document Metadata" onClose={() => setMetadataDraft(null)} width="max-w-4xl">
          <div className="grid gap-4 p-5 lg:grid-cols-3">
            <SelectField label="Category" value={metadataDraft.category} values={DOCUMENT_CATEGORIES} onChange={(value) => setMetadataDraft((prev) => (prev ? { ...prev, category: value } : prev))} />
            <Field label="Document Title" value={metadataDraft.documentTitle} onChange={(value) => setMetadataDraft((prev) => (prev ? { ...prev, documentTitle: value } : prev))} />
            <SelectField label="Confidentiality" value={metadataDraft.confidentialityLevel} values={CONFIDENTIALITY} onChange={(value) => setMetadataDraft((prev) => (prev ? { ...prev, confidentialityLevel: value as ConfidentialityLevel } : prev))} />
            <Field label="Issue Date" type="date" value={metadataDraft.issueDate} onChange={(value) => setMetadataDraft((prev) => (prev ? { ...prev, issueDate: value } : prev))} />
            <Field label="Expiry Date" type="date" value={metadataDraft.expiryDate} onChange={(value) => setMetadataDraft((prev) => (prev ? { ...prev, expiryDate: value } : prev))} />
            <Field label="Reason" value={metadataDraft.reason} onChange={(value) => setMetadataDraft((prev) => (prev ? { ...prev, reason: value } : prev))} />
            <Field label="Notes" value={metadataDraft.notes} onChange={(value) => setMetadataDraft((prev) => (prev ? { ...prev, notes: value } : prev))} wide />
          </div>
          <ModalActions onCancel={() => setMetadataDraft(null)} onSave={saveMetadata} busy={busy} label="Save Metadata" />
        </Modal>
      ) : null}

      {replaceDraft ? (
        <Modal title={`Replace Document: ${replaceDraft.target.documentTitle || replaceDraft.target.category}`} onClose={() => setReplaceDraft(null)}>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="New File Name" value={replaceDraft.fileName} onChange={(value) => setReplaceDraft((prev) => (prev ? { ...prev, fileName: value } : prev))} required />
            <SelectField label="MIME Type" value={replaceDraft.mimeType} values={MIME_TYPES} onChange={(value) => setReplaceDraft((prev) => (prev ? { ...prev, mimeType: value } : prev))} />
            <Field label="Size (bytes)" value={replaceDraft.sizeBytes} onChange={(value) => setReplaceDraft((prev) => (prev ? { ...prev, sizeBytes: value } : prev))} required />
            <Field label="Reason" value={replaceDraft.reason} onChange={(value) => setReplaceDraft((prev) => (prev ? { ...prev, reason: value } : prev))} />
          </div>
          <ModalActions onCancel={() => setReplaceDraft(null)} onSave={saveReplacement} busy={busy} label="Replace Document" />
        </Modal>
      ) : null}

      {details ? (
        <Modal title="Document Details and Audit" onClose={() => setDetails(null)} width="max-w-4xl">
          <div className="max-h-[70vh] overflow-y-auto p-5">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="text-sm font-extrabold text-slate-950">{details.document.documentTitle || details.document.category}</div>
              <div className="mt-2 grid gap-3 text-xs font-bold text-slate-600 sm:grid-cols-3">
                <div>File: {details.document.fileName}</div>
                <div>Status: {details.document.status}</div>
                <div>Version: {details.document.versionNumber || 1}</div>
                <div>Uploaded: {formatDateTime(details.document.uploadedAt)}</div>
                <div>Verified: {formatDateTime(details.document.verifiedAt)}</div>
                <div>Confidentiality: {details.document.confidentialityLevel || 'Internal'}</div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {details.audit.length === 0 ? <div className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-600">No document audit rows found.</div> : null}
              {details.audit.slice(0, 80).map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">{row.action}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{row.reason ? `${row.reason} · ` : ''}By {row.performedBy}</div>
                    </div>
                    <div className="text-xs font-extrabold text-slate-500">{formatDateTime(row.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border bg-white p-4 shadow-lg">
          <div className={`text-sm font-extrabold ${toast.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{toast.message}</div>
        </div>
      ) : null}
    </div>
  );
}

const Field = ({
  label,
  value,
  onChange,
  type = 'text',
  required,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  wide?: boolean;
}) => (
  <label className={`block ${wide ? 'lg:col-span-3' : ''}`}>
    <span className="text-[11px] font-extrabold uppercase text-slate-500">
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
    </span>
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-dle-blue" />
  </label>
);

const SelectField = ({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) => (
  <label className="block">
    <span className="text-[11px] font-extrabold uppercase text-slate-500">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-dle-blue">
      {values.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  </label>
);

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) => (
  <label className="flex h-10 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-extrabold text-slate-800">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
    {label}
  </label>
);

const ModalActions = ({ onCancel, onSave, busy, label }: { onCancel: () => void; onSave: () => void | Promise<void>; busy: boolean; label: string }) => (
  <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
    <button type="button" onClick={onCancel} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50">
      Cancel
    </button>
    <button type="button" onClick={() => void onSave()} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-extrabold text-white hover:bg-slate-800 disabled:opacity-50">
      <BadgeCheck className="h-4 w-4" />
      {busy ? 'Saving...' : label}
    </button>
  </div>
);
