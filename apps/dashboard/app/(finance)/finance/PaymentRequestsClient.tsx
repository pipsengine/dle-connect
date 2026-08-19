'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Download,
  FileText,
  Filter,
  Inbox,
  Paperclip,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  Send,
  Trash2,
  Upload,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  ActionToolbar,
  DesktopOnlyTable,
  FilterToolbar,
  MobileCardList,
  PageFrame,
  ScrollTable,
} from '@/components/ui/responsive';
import {
  FINANCE_PAGE_SIZE,
  FinanceListPagination,
  matchesPaymentSearch,
  paginateRows,
} from './finance-list-controls';
import type {
  CashAdvanceEligibility,
  PaymentRequestAttachment,
  PaymentRequestRow,
  PaymentRequestType,
  PaymentRequestsWorkspace,
} from '@/lib/finance-intelligence/payment-requests-service';
import {
  EXPENSE_NATURE_OPTIONS,
  isExpenseNoPoPayment,
  supplierInvoiceCategoryLabel,
  type SupplierInvoiceCategory,
} from '@/lib/finance-intelligence/payment-invoice-category';
import type { PaymentRequestLookups } from '@/lib/finance-intelligence/payment-request-lookups';
import { preferredPaymentDepartment } from '@/lib/finance-intelligence/payment-request-departments';
import { downloadExcelWorkbook } from '@/lib/excel-export';

type Props = {
  initialWorkspace: PaymentRequestsWorkspace;
  /** Hide finance-ops shortcuts for employee self-service users. */
  selfServiceMode?: boolean;
  /**
   * inbox — pending approvals only (My Approval Inbox)
   * approved — approved / post-approval lifecycle (Payment Requests)
   * mine — requester-owned items (My Requests)
   * default — full list (legacy type deep-links)
   */
  listMode?: 'default' | 'inbox' | 'mine' | 'approved';
  /** Prefill Payment Type filter (from ?type= or legacy redirects). */
  initialPaymentType?: 'All' | PaymentRequestType;
};

type ComposerForm = {
  employeeCode: string;
  employeeName: string;
  department: string;
  location: string;
  projectCode: string;
  paymentSiteCode: string;
  expenseCode: string;
  title: string;
  businessJustification: string;
  beneficiaryName: string;
  beneficiaryCode: string;
  amount: string;
  currencyCode: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  vatAmount: string;
  whtAmount: string;
  retentionAmount: string;
  purchaseOrderNo: string;
  deliveryNoteNo: string;
  invoiceCategory: SupplierInvoiceCategory;
  expenseNature: string;
  submit: boolean;
};

type SignedInRequester = {
  name: string;
  employeeCode: string;
  department: string;
  jobTitle: string;
};

const emptyForm = (): ComposerForm => ({
  employeeCode: '',
  employeeName: '',
  department: '',
  location: '',
  projectCode: '',
  paymentSiteCode: '',
  expenseCode: '',
  title: '',
  businessJustification: '',
  beneficiaryName: '',
  beneficiaryCode: '',
  amount: '',
  currencyCode: 'NGN',
  invoiceNumber: '',
  invoiceDate: '',
  dueDate: '',
  vatAmount: '',
  whtAmount: '',
  retentionAmount: '',
  purchaseOrderNo: '',
  deliveryNoteNo: '',
  invoiceCategory: 'po-backed',
  expenseNature: '',
  submit: true,
});

type SearchableOption = {
  value: string;
  label: string;
};

function SearchableSelect({
  label,
  required,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: SearchableOption[];
  placeholder: string;
  onChange: (value: string, option?: SearchableOption) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!open) setQuery(selected?.label || '');
  }, [open, selected?.label, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && query === selected.label)) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(q)
      || option.value.toLowerCase().includes(q));
  }, [options, query, selected]);

  return (
    <label className="relative block text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {label}{required ? ' *' : ''}
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={open ? query : (selected?.label || '')}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE] disabled:bg-slate-50"
          autoComplete="off"
          inputMode="search"
        />
        <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </div>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length ? filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(option.value, option);
                setQuery(option.label);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                option.value === value ? 'bg-[#F0F9FF] font-semibold text-[#008FD5]' : 'text-slate-700'
              }`}
            >
              {option.label}
            </button>
          )) : (
            <p className="px-3 py-3 text-xs text-slate-500">No matches. Try another search.</p>
          )}
        </div>
      ) : null}
    </label>
  );
}

function ProjectManagerConfirmation({
  projectCode,
  projects,
}: {
  projectCode: string;
  projects?: Array<{ code: string; name: string; label: string; projectManager: string }>;
}) {
  if (!projectCode) return null;
  const selected = (projects || []).find((item) => item.code === projectCode);
  const manager = String(selected?.projectManager || '').trim();
  if (manager && !/^unassigned$/i.test(manager)) {
    return (
      <p className="mt-1.5 text-xs text-slate-600">
        Project Manager: <span className="font-semibold text-slate-900">{manager}</span>
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-xs font-medium text-amber-700">
      No Project Manager is assigned on this project. Update the project master before routing for PM approval.
    </p>
  );
}


const moneyCompact = (value: number) => {
  if (!value) return '₦0.00';
  if (Math.abs(value) >= 1_000_000) {
    return `₦${(value / 1_000_000).toFixed(2)}M`;
  }
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const moneyFull = (value: number, currency = 'NGN') => {
  const code = String(currency || 'NGN').trim().toUpperCase() || 'NGN';
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `${code} ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

const moneyNgn = (value: number) => moneyFull(value, 'NGN');

const rowAmountNgn = (row: { netAmount: number; currencyCode?: string; payload?: Record<string, unknown> | null }) => {
  const fromPayload = Number(row.payload?.amountNgn);
  if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload;
  return Number(row.netAmount || 0);
};

const rowFxRate = (row: { currencyCode?: string; payload?: Record<string, unknown> | null }) => {
  const rate = Number(row.payload?.fxRate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  return String(row.currencyCode || 'NGN').toUpperCase() === 'NGN' ? 1 : null;
};

const rowFxRateDate = (row: { payload?: Record<string, unknown> | null }) =>
  String(row.payload?.fxRateDate || '').trim() || null;

const isForeignCurrency = (currencyCode?: string | null) =>
  String(currencyCode || 'NGN').trim().toUpperCase() !== 'NGN';

const fmtDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusTone = (status: string) => {
  if (/approved|paid|completed|retired|closed/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/awaiting retirement|retirement submitted|treasury verification/i.test(status)) return 'bg-amber-50 text-amber-800';
  if (/pending|submitted|finance review/i.test(status)) return 'bg-blue-50 text-[#1D4ED8]';
  if (/returned|clarification/i.test(status)) return 'bg-violet-50 text-violet-700';
  if (/ready for treasury|payment scheduled|payment processing/i.test(status)) return 'bg-teal-50 text-teal-700';
  if (/rejected|cancelled/i.test(status)) return 'bg-rose-50 text-rose-700';
  if (/draft/i.test(status)) return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
};

const typeIcon = (paymentType: string) => {
  if (/cash advance/i.test(paymentType)) return CreditCard;
  if (/expense payment/i.test(paymentType)) return Wallet;
  if (/supplier/i.test(paymentType)) return Building2;
  return FileText;
};

type TabId = 'all' | 'mine' | 'drafts' | 'pending' | 'returned' | 'approved' | 'ready' | 'paid' | 'rejected' | 'retirement';
type KpiId = 'total' | 'pending' | 'returned' | 'approved' | 'ready' | 'progress' | 'paid' | 'rejected';

const KPI_STATUS_MATCH: Record<Exclude<KpiId, 'total' | 'paid'>, RegExp> = {
  pending: /pending|submitted|finance review/i,
  returned: /returned/i,
  approved: /^approved$/i,
  ready: /ready for treasury/i,
  progress: /payment scheduled|payment processing|awaiting retirement|retirement submitted|treasury verification|finance verification/i,
  rejected: /rejected|cancelled/i,
};

const isPaidThisMonth = (row: PaymentRequestRow) => {
  if (!/paid|completed|retired|closed/i.test(row.status)) return false;
  const paidAt = row.paidAt ? new Date(row.paidAt) : row.updatedAt ? new Date(row.updatedAt) : null;
  if (!paidAt || Number.isNaN(paidAt.getTime())) return false;
  const now = new Date();
  return paidAt.getMonth() === now.getMonth() && paidAt.getFullYear() === now.getFullYear();
};

export default function PaymentRequestsClient({
  initialWorkspace,
  selfServiceMode = false,
  listMode = 'default',
  initialPaymentType = 'All',
}: Props) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  // Prefer server flag; fall back to selfServiceMode prop from SSR.
  const restrictedToOwnPayments = selfServiceMode || workspace.viewer?.canViewAll === false;
  const [tab, setTab] = useState<TabId>(() => {
    if (listMode === 'inbox') return 'pending';
    if (listMode === 'approved') return 'approved';
    if (listMode === 'mine') return 'mine';
    return 'all';
  });
  const [detailFocus, setDetailFocus] = useState<KpiId | null>(null);
  const [query, setQuery] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'All' | PaymentRequestType>(initialPaymentType);
  const [statusFilter, setStatusFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [projectFilter, setProjectFilter] = useState('All');
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [approverFilter, setApproverFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(FINANCE_PAGE_SIZE);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromQuery = String(new URLSearchParams(window.location.search).get('tab') || '').trim().toLowerCase();
    const allowed: TabId[] = ['all', 'mine', 'drafts', 'pending', 'returned', 'approved', 'ready', 'paid', 'rejected', 'retirement'];
    if (allowed.includes(fromQuery as TabId)) setTab(fromQuery as TabId);
  }, []);
  const [toast, setToast] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerType, setComposerType] = useState<PaymentRequestType>('Cash Advance Payment');
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editingRequestNumber, setEditingRequestNumber] = useState('');
  const [editingIsDraft, setEditingIsDraft] = useState(false);
  const [existingAttachments, setExistingAttachments] = useState<PaymentRequestAttachment[]>([]);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookups, setLookups] = useState<PaymentRequestLookups | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [form, setForm] = useState<ComposerForm>(emptyForm());
  const [signedInRequester, setSignedInRequester] = useState<SignedInRequester | null>(null);
  const [eligibility, setEligibility] = useState<CashAdvanceEligibility | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [rowAction, setRowAction] = useState<{
    requestId: string;
    requestNumber: string;
    action: 'approve' | 'reject' | 'return';
  } | null>(null);
  const [rowActionReason, setRowActionReason] = useState('');
  const [rowActionBusy, setRowActionBusy] = useState(false);

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] || '' : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const addSupportingFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const next = Array.from(fileList);
    setSupportingFiles((current) => {
      const merged = [...current];
      for (const file of next) {
        if (merged.some((item) => item.name === file.name && item.size === file.size)) continue;
        if (merged.length >= 8) break;
        merged.push(file);
      }
      return merged;
    });
  };

  const loadEligibility = async (employeeCode: string) => {
    if (!employeeCode) {
      setEligibility(null);
      return null;
    }
    try {
      const res = await fetch(`/api/finance/payment-requests?view=eligibility&employeeCode=${encodeURIComponent(employeeCode)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to check eligibility');
      const next = json.data as CashAdvanceEligibility;
      setEligibility(next);
      return next;
    } catch (error) {
      setEligibility(null);
      return null;
    }
  };

  useEffect(() => {
    if (!composerOpen) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [lookupsRes, userRes] = await Promise.all([
          fetch('/api/finance/payment-request-lookups', { cache: 'no-store' }),
          fetch('/api/current-user?context=enterprise', { cache: 'no-store' }),
        ]);
        const lookupsJson = await lookupsRes.json();
        const userJson = await userRes.json();
        if (cancelled) return;
        if (lookupsRes.ok && lookupsJson.status === 'success') {
          setLookups(lookupsJson.data as PaymentRequestLookups);
        }
        const departmentOptions = (lookupsRes.ok && lookupsJson.status === 'success'
          ? (lookupsJson.data as PaymentRequestLookups).departments
          : []) as string[];
        if (userRes.ok && userJson.status === 'success') {
          const user = userJson.data as {
            name?: string;
            employeeCode?: string;
            department?: string;
            location?: string;
            role?: string;
            jobTitle?: string;
          };
          const resolvedDepartment = preferredPaymentDepartment({
            department: user.department,
            jobTitle: user.jobTitle || user.role,
            departments: departmentOptions,
          });
          setSignedInRequester({
            name: user.name || '',
            employeeCode: user.employeeCode || '',
            department: resolvedDepartment || user.department || '',
            jobTitle: user.jobTitle || user.role || '',
          });
          if (composerType === 'Cash Advance Payment') {
            const nextCode = user.employeeCode || '';
            setForm((prev) => ({
              ...prev,
              employeeName: prev.employeeName || user.name || '',
              employeeCode: prev.employeeCode || nextCode,
              department: prev.department || resolvedDepartment || user.department || '',
              location: prev.location || user.location || '',
              beneficiaryName: prev.beneficiaryName || user.name || '',
              beneficiaryCode: prev.beneficiaryCode || nextCode,
            }));
            setEmployeeSearch(user.name || '');
            if (nextCode) void loadEligibility(nextCode);
          } else {
            setForm((prev) => ({
              ...prev,
              department: prev.department || resolvedDepartment || user.department || '',
              location: prev.location || user.location || '',
            }));
          }
        }
      } catch {
        // keep empty lookups; submit will still validate server-side
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [composerOpen, composerType]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const rows = lookups?.employees || [];
    if (!q) return rows.slice(0, 12);
    return rows
      .filter((employee) =>
        employee.fullName.toLowerCase().includes(q)
        || employee.employeeCode.toLowerCase().includes(q)
        || employee.department.toLowerCase().includes(q))
      .slice(0, 12);
  }, [lookups?.employees, employeeSearch]);

  const refresh = async () => {
    setLoading(true);
    setToast('');
    try {
      const params = new URLSearchParams();
      if (restrictedToOwnPayments) {
        // Non-finance: Payment Requests = own raised only; Inbox = assigned scope.
        if (listMode === 'inbox') params.set('inbox', '1');
        else params.set('mine', '1');
      } else if (listMode === 'inbox') {
        params.set('inbox', '1');
      } else if (listMode === 'mine') {
        params.set('mine', '1');
      }
      // Finance / Global Super Admin on Payment Requests: no mine/inbox → full queue.
      const query = params.toString();
      const res = await fetch(`/api/finance/payment-requests${query ? `?${query}` : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as PaymentRequestsWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = useMemo(() => {
    const statuses = new Set<string>();
    const departments = new Set<string>();
    const projects = new Set<string>();
    const currencies = new Set<string>();
    const approvers = new Set<string>();
    const locations = new Set<string>();
    for (const row of workspace.rows) {
      if (row.status) statuses.add(row.status);
      if (row.department) departments.add(row.department);
      if (row.projectCode) projects.add(row.projectCode);
      if (row.currencyCode) currencies.add(row.currencyCode);
      if (row.currentApproverName) approvers.add(row.currentApproverName);
      else if (row.currentApproverCode) approvers.add(row.currentApproverCode);
      if (row.location) locations.add(row.location);
    }
    const sort = (values: Set<string>) => Array.from(values).sort((a, b) => a.localeCompare(b));
    return {
      statuses: sort(statuses),
      departments: sort(departments),
      projects: sort(projects),
      currencies: sort(currencies),
      approvers: sort(approvers),
      locations: sort(locations),
    };
  }, [workspace.rows]);

  const filteredRows = useMemo(() => {
    const actor = String(workspace.viewer?.actorCode || '').trim().toLowerCase();
    return workspace.rows.filter((row) => {
      // Defense in depth: non–Finance / non–Super-Admin never see other employees' raised payments
      // (Inbox may still include items where they are current approver or beneficiary).
      if (restrictedToOwnPayments && actor && listMode !== 'inbox') {
        const requester = String(row.requesterCode || '').trim().toLowerCase();
        if (requester !== actor) return false;
      }
      if (listMode === 'inbox' && !(workspace.viewer?.approvableRequestIds || []).includes(row.requestId)) {
        return false;
      }

      if (paymentTypeFilter !== 'All' && row.paymentType !== paymentTypeFilter) return false;
      if (statusFilter !== 'All' && row.status !== statusFilter) return false;
      if (departmentFilter !== 'All' && row.department !== departmentFilter) return false;
      if (projectFilter !== 'All' && row.projectCode !== projectFilter) return false;
      if (currencyFilter !== 'All' && row.currencyCode !== currencyFilter) return false;
      if (locationFilter !== 'All' && row.location !== locationFilter) return false;
      if (approverFilter !== 'All') {
        const approver = row.currentApproverName || row.currentApproverCode || '';
        if (approver !== approverFilter) return false;
      }
      if (submittedFrom || submittedTo) {
        const stamp = row.submittedAt || row.createdAt;
        if (!stamp) return false;
        const submittedDay = new Date(stamp);
        if (Number.isNaN(submittedDay.getTime())) return false;
        const localDay = [
          submittedDay.getFullYear(),
          String(submittedDay.getMonth() + 1).padStart(2, '0'),
          String(submittedDay.getDate()).padStart(2, '0'),
        ].join('-');
        if (submittedFrom && localDay < submittedFrom) return false;
        if (submittedTo && localDay > submittedTo) return false;
      }

      if (detailFocus) {
        if (detailFocus === 'paid') {
          if (!isPaidThisMonth(row)) return false;
        } else if (detailFocus !== 'total') {
          if (!KPI_STATUS_MATCH[detailFocus].test(row.status)) return false;
        }
      } else if (listMode === 'inbox') {
        if (tab === 'returned') {
          if (!/returned/i.test(row.status)) return false;
        } else if (!/pending|submitted|finance review/i.test(row.status)) {
          return false;
        }
      } else if (listMode === 'approved' && tab === 'all') {
        // Payment Requests hub: keep drafts/returned/approved+; pending lives in Inbox.
        if (/^(pending approval|submitted|finance review)$/i.test(row.status)) return false;
      }

      if (!detailFocus) {
        if (tab === 'drafts' && !/draft/i.test(row.status)) return false;
        if (tab === 'pending' && !/pending|submitted|finance review/i.test(row.status)) return false;
        if (tab === 'returned' && !/returned/i.test(row.status)) return false;
        if (tab === 'approved') {
          if (listMode === 'approved') {
            if (!/^approved$/i.test(row.status) && !/ready for treasury/i.test(row.status)) return false;
          } else if (!/^approved$/i.test(row.status)) {
            return false;
          }
        }
        if (tab === 'ready' && !/ready for treasury/i.test(row.status)) return false;
        if (tab === 'paid' && !/paid|completed|retired|closed/i.test(row.status)) return false;
        if (tab === 'retirement' && !/awaiting retirement|retirement submitted|treasury verification|finance verification/i.test(row.status)) return false;
        if (tab === 'rejected' && !/rejected|cancelled/i.test(row.status)) return false;
        if (tab === 'mine' && listMode !== 'mine') {
          const actor = String(workspace.viewer?.actorCode || '').trim().toLowerCase();
          if (actor && String(row.requesterCode || '').trim().toLowerCase() !== actor) return false;
        }
      }
      return matchesPaymentSearch(row, query);
    });
  }, [
    workspace.rows,
    tab,
    query,
    paymentTypeFilter,
    statusFilter,
    departmentFilter,
    projectFilter,
    currencyFilter,
    approverFilter,
    locationFilter,
    submittedFrom,
    submittedTo,
    detailFocus,
    listMode,
    workspace.viewer?.actorCode,
    workspace.viewer?.approvableRequestIds,
    restrictedToOwnPayments,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    query,
    tab,
    paymentTypeFilter,
    statusFilter,
    departmentFilter,
    projectFilter,
    currencyFilter,
    approverFilter,
    locationFilter,
    submittedFrom,
    submittedTo,
    detailFocus,
    listMode,
    pageSize,
  ]);

  const { pageRows, totalPages } = useMemo(
    () => paginateRows(filteredRows, page, pageSize),
    [filteredRows, page, pageSize],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const activeFilterCount = [
    paymentTypeFilter !== 'All',
    statusFilter !== 'All',
    departmentFilter !== 'All',
    projectFilter !== 'All',
    currencyFilter !== 'All',
    approverFilter !== 'All',
    locationFilter !== 'All',
    Boolean(submittedFrom),
    Boolean(submittedTo),
    Boolean(query.trim()),
  ].filter(Boolean).length;

  const clearListFilters = () => {
    setPaymentTypeFilter('All');
    setStatusFilter('All');
    setDepartmentFilter('All');
    setProjectFilter('All');
    setCurrencyFilter('All');
    setApproverFilter('All');
    setLocationFilter('All');
    setSubmittedFrom('');
    setSubmittedTo('');
    setQuery('');
  };

  const exportFilteredRows = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const columns = [
      'Request No.',
      'Payment Type',
      'Beneficiary',
      'Description',
      'Gross Amount',
      'Net Amount',
      'Currency',
      'Department',
      'Project',
      'Location',
      'Submitted',
      'Current Stage',
      'Approver',
      'Status',
      'Requester',
    ];
    const rows = filteredRows.map((row) => [
      row.requestNumber,
      row.paymentType,
      row.beneficiaryName,
      row.description || row.title || '',
      Number(row.grossAmount || 0),
      Number(row.netAmount || 0),
      row.currencyCode || 'NGN',
      row.department || '',
      row.projectCode || '',
      row.location || '',
      row.submittedAt ? new Date(row.submittedAt).toLocaleString('en-GB') : '',
      row.currentStage || '',
      row.currentApproverName || row.currentApproverCode || '',
      row.status,
      row.requesterName || row.requesterCode || '',
    ]);
    downloadExcelWorkbook({
      fileName: `payment-requests-${stamp}.xls`,
      generatedAt: new Date().toISOString(),
      worksheets: [{
        title: 'Payment Requests',
        sheetName: 'Payment Requests',
        subtitle: activeFilterCount
          ? `Filtered export · ${filteredRows.length} row(s) · ${activeFilterCount} active filter(s)`
          : `Full current view · ${filteredRows.length} row(s)`,
        columns,
        rows,
      }],
    });
    setToast(`Exported ${filteredRows.length} payment request${filteredRows.length === 1 ? '' : 's'} to Excel.`);
  };

  const showFxColumn = useMemo(
    () => filteredRows.some((row) => isForeignCurrency(row.currencyCode)),
    [filteredRows],
  );

  const openComposer = (type: PaymentRequestType) => {
    setComposerType(type);
    setEditingRequestId(null);
    setEditingRequestNumber('');
    setEditingIsDraft(false);
    setExistingAttachments([]);
    setTypeMenuOpen(false);
    setForm({
      ...emptyForm(),
      invoiceCategory: type === 'Expense Payment' ? 'expense-no-po' : 'po-backed',
    });
    setEmployeeSearch('');
    setEmployeePickerOpen(false);
    setEligibility(null);
    setFormErrors([]);
    setSupportingFiles([]);
    setComposerOpen(true);
  };

  const openEditReturned = (row: PaymentRequestRow) => {
    const type = (/expense payment/i.test(row.paymentType) || isExpenseNoPoPayment(row)
      ? 'Expense Payment'
      : /supplier/i.test(row.paymentType)
        ? 'Supplier Invoice Payment'
        : 'Cash Advance Payment') as PaymentRequestType;
    const isDraft = /^draft$/i.test(row.status);
    setComposerType(type);
    setEditingRequestId(row.requestId);
    setEditingRequestNumber(row.requestNumber);
    setEditingIsDraft(isDraft);
    setExistingAttachments(
      (row.attachments || []).filter((file) => file.kind !== 'payment-evidence' && file.kind !== 'retirement-evidence'),
    );
    setTypeMenuOpen(false);
    setForm({
      ...emptyForm(),
      employeeCode: type === 'Cash Advance Payment' ? row.beneficiaryCode || row.requesterCode : '',
      employeeName: type === 'Cash Advance Payment' ? row.beneficiaryName || row.requesterName : '',
      department: row.department || '',
      location: row.location || '',
      projectCode: row.projectCode || '',
      paymentSiteCode: row.paymentSiteCode || row.companyCode || '',
      expenseCode: row.expenseCode || '',
      title: row.title || '',
      businessJustification: row.businessJustification || '',
      beneficiaryName: row.beneficiaryName || '',
      beneficiaryCode: row.beneficiaryCode || '',
      amount: String(row.grossAmount || row.netAmount || ''),
      currencyCode: row.currencyCode || 'NGN',
      invoiceNumber: row.invoiceNumber || '',
      invoiceDate: row.invoiceDate ? String(row.invoiceDate).slice(0, 10) : '',
      dueDate: row.dueDate ? String(row.dueDate).slice(0, 10) : '',
      vatAmount: String(row.vatAmount || ''),
      whtAmount: String(row.whtAmount || ''),
      retentionAmount: String(row.retentionAmount || ''),
      purchaseOrderNo: type === 'Expense Payment' ? '' : (row.purchaseOrderNo || ''),
      deliveryNoteNo: type === 'Expense Payment' ? '' : (row.deliveryNoteNo || ''),
      invoiceCategory: type === 'Expense Payment' ? 'expense-no-po' : 'po-backed',
      expenseNature: String(row.payload?.expenseNature || ''),
      submit: true,
    });
    setEmployeeSearch(type === 'Cash Advance Payment' ? (row.beneficiaryName || row.requesterName || '') : '');
    setEmployeePickerOpen(false);
    setEligibility(null);
    setFormErrors([]);
    setSupportingFiles([]);
    setComposerOpen(true);
    setTab(isDraft ? 'drafts' : 'returned');
    if (type === 'Cash Advance Payment' && (row.beneficiaryCode || row.requesterCode)) {
      void loadEligibility(row.beneficiaryCode || row.requesterCode);
    }
  };

  useEffect(() => {
    const editId = typeof window !== 'undefined'
      ? String(new URLSearchParams(window.location.search).get('edit') || '').trim()
      : '';
    if (!editId || composerOpen) return;
    const row = workspace.rows.find((item) => item.requestId === editId);
    if (!row) return;
    if (!/^(draft|returned)$/i.test(row.status)) {
      setToast('Only draft or returned payment requests can be edited.');
      return;
    }
    const canEdit = workspace.viewer?.editableReturnedRequestIds?.includes(row.requestId)
      || (
        workspace.viewer?.actorCode
        && workspace.viewer.actorCode.toLowerCase() === row.requesterCode.toLowerCase()
      );
    if (!canEdit) {
      setToast('You can only edit your own draft or returned payment requests.');
      return;
    }
    openEditReturned(row);
    router.replace('/finance/approvals/payments');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.rows, workspace.viewer?.editableReturnedRequestIds, workspace.viewer?.actorCode]);

  const selectEmployee = (employee: PaymentRequestLookups['employees'][number]) => {
    const resolvedDepartment = preferredPaymentDepartment({
      department: employee.department,
      jobTitle: employee.jobTitle,
      departments: lookups?.departments,
    });
    setForm((prev) => ({
      ...prev,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: resolvedDepartment || employee.department || prev.department,
      location: employee.location || prev.location,
      projectCode: employee.projectCode || prev.projectCode,
      beneficiaryCode: employee.employeeCode,
      beneficiaryName: employee.fullName,
    }));
    setEmployeeSearch(employee.fullName);
    setEmployeePickerOpen(false);
    void loadEligibility(employee.employeeCode);
  };

  const validateComposer = () => {
    const errors: string[] = [];
    if (composerType === 'Cash Advance Payment') {
      if (!form.employeeCode.trim()) errors.push('Select an employee.');
      if (!form.department.trim()) errors.push('Department is required.');
      if (!form.location.trim()) errors.push('Location is required.');
      if (!form.paymentSiteCode.trim()) errors.push('Payment site is required.');
      if (!form.expenseCode.trim()) errors.push('Request title is required.');
      if (!(Number(form.amount) >= 1)) errors.push('Amount must be at least 1.00.');
      if (form.businessJustification.trim().length < 10) errors.push('Business justification must be at least 10 characters.');
      if (!editingRequestId && eligibility?.blocked) errors.push(eligibility.message);
    } else {
      if (!form.title.trim()) errors.push('Request title is required.');
      if (!form.beneficiaryName.trim()) {
        errors.push(composerType === 'Expense Payment' ? 'Payee / supplier name is required.' : 'Supplier name is required.');
      }
      if (!form.invoiceNumber.trim()) {
        errors.push(composerType === 'Expense Payment' ? 'Bill / invoice number is required.' : 'Invoice number is required.');
      }
      if (!(Number(form.amount) >= 1)) errors.push('Amount must be at least 1.00.');
      if (!supportingFiles.length && !(editingRequestId && existingAttachments.length)) {
        errors.push('Supporting documents are required.');
      }
      if (composerType === 'Expense Payment' && !form.expenseNature.trim()) {
        errors.push('Select the expense nature (e.g. Utility, LAWMA).');
      }
    }
    setFormErrors(errors);
    return errors.length === 0;
  };

  const submitRequest = async () => {
    setFormErrors([]);
    setToast('');

    let latestEligibility = eligibility;
    if (composerType === 'Cash Advance Payment' && form.employeeCode.trim() && !editingRequestId) {
      latestEligibility = await loadEligibility(form.employeeCode.trim());
    }

    const errors: string[] = [];
    if (composerType === 'Cash Advance Payment') {
      if (!form.employeeCode.trim()) errors.push('Select an employee.');
      if (!form.department.trim()) errors.push('Department is required.');
      if (!form.location.trim()) errors.push('Location is required.');
      if (!form.paymentSiteCode.trim()) errors.push('Payment site is required.');
      if (!form.expenseCode.trim()) errors.push('Request title is required.');
      if (!(Number(form.amount) >= 1)) errors.push('Amount must be at least 1.00.');
      if (form.businessJustification.trim().length < 10) errors.push('Business justification must be at least 10 characters.');
      if (!editingRequestId && latestEligibility?.blocked) errors.push(latestEligibility.message);
    } else {
      if (!form.title.trim()) errors.push('Request title is required.');
      if (!form.beneficiaryName.trim()) {
        errors.push(composerType === 'Expense Payment' ? 'Payee / supplier name is required.' : 'Supplier name is required.');
      }
      if (!form.invoiceNumber.trim()) {
        errors.push(composerType === 'Expense Payment' ? 'Bill / invoice number is required.' : 'Invoice number is required.');
      }
      if (!(Number(form.amount) >= 1)) errors.push('Amount must be at least 1.00.');
      if (!supportingFiles.length && !(editingRequestId && existingAttachments.length)) {
        errors.push('Supporting documents are required.');
      }
      if (composerType === 'Expense Payment' && !form.expenseNature.trim()) {
        errors.push('Select the expense nature (e.g. Utility, LAWMA).');
      }
    }
    setFormErrors(errors);
    if (errors.length) return;

    setBusy(true);
    try {
      const selectedExpense = lookups?.expenseCodes.find((item) => item.expenseCode === form.expenseCode);
      const selectedSite = lookups?.paymentSites.find((item) => item.siteCode === form.paymentSiteCode);
      const isVendorComposer = composerType === 'Supplier Invoice Payment' || composerType === 'Expense Payment';
      const shouldUploadFiles = isVendorComposer || Boolean(editingRequestId);
      const attachmentUploads = shouldUploadFiles && supportingFiles.length
        ? await Promise.all(supportingFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64: await fileToBase64(file),
        })))
        : undefined;
      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingRequestId ? 'update-returned' : 'create',
          requestId: editingRequestId || undefined,
          resubmit: editingRequestId ? true : undefined,
          paymentType: composerType,
          title: composerType === 'Cash Advance Payment' ? (selectedExpense?.label || form.title) : form.title,
          expenseCode: form.expenseCode,
          purpose: selectedExpense?.description || '',
          businessJustification: form.businessJustification,
          beneficiaryCode: form.employeeCode || form.beneficiaryCode,
          beneficiaryName: form.employeeName || form.beneficiaryName,
          amount: Number(form.amount || 0),
          currencyCode: form.currencyCode,
          paymentSiteCode: form.paymentSiteCode,
          paymentSiteName: selectedSite?.siteName,
          companyCode: form.paymentSiteCode,
          department: form.department,
          location: form.location,
          projectCode: form.projectCode,
          requesterCode: signedInRequester?.employeeCode || undefined,
          requesterName: signedInRequester?.name || undefined,
          requesterJobTitle: signedInRequester?.jobTitle || undefined,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          vatAmount: Number(form.vatAmount || 0),
          whtAmount: Number(form.whtAmount || 0),
          retentionAmount: Number(form.retentionAmount || 0),
          invoiceCategory: composerType === 'Expense Payment'
            ? 'expense-no-po'
            : composerType === 'Supplier Invoice Payment'
              ? 'po-backed'
              : undefined,
          expenseNature: composerType === 'Expense Payment' ? form.expenseNature : undefined,
          purchaseOrderNo: composerType === 'Expense Payment' ? '' : form.purchaseOrderNo,
          deliveryNoteNo: composerType === 'Expense Payment' ? '' : form.deliveryNoteNo,
          submit: form.submit,
          listScope: listMode === 'inbox' ? 'inbox' : 'mine',
          attachmentUploads,
          keepAttachmentIds: editingRequestId
            ? existingAttachments.map((file) => file.id || file.fileName).filter(Boolean)
            : undefined,
        }),
      });
      const json = await res.json().catch(() => ({ status: 'error', error: 'Unable to create request.' }));
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || `Unable to create request (${res.status}).`);
      }
      setWorkspace(json.data.workspace as PaymentRequestsWorkspace);
      setComposerOpen(false);
      setEditingRequestId(null);
      setEditingRequestNumber('');
      setEditingIsDraft(false);
      setExistingAttachments([]);
      setSupportingFiles([]);
      setFormErrors([]);
      setToast(json.data.message || (editingRequestId ? 'Payment request resent for approval.' : 'Payment request saved.'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create request.';
      setFormErrors([message]);
      setToast(message);
      if (form.employeeCode) void loadEligibility(form.employeeCode);
    } finally {
      setBusy(false);
    }
  };

  const canApproveRow = (requestId: string) =>
    Boolean(workspace.viewer?.approvableRequestIds?.includes(requestId));
  const canEditReturnedRow = (requestId: string) =>
    Boolean(workspace.viewer?.editableReturnedRequestIds?.includes(requestId));
  const canRemindRow = (row: PaymentRequestRow) => {
    if (!/pending approval|submitted|finance review/i.test(row.status)) return false;
    if (!row.currentApproverCode && !row.currentApproverName) return false;
    const actorCode = String(workspace.viewer?.actorCode || '').trim().toLowerCase();
    if (!actorCode) return false;
    return actorCode === String(row.requesterCode || '').trim().toLowerCase()
      || actorCode === String(row.beneficiaryCode || '').trim().toLowerCase();
  };

  const sendReminder = async (row: PaymentRequestRow) => {
    setRowActionBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-reminder',
          requestId: row.requestId,
        }),
      });
      const json = await res.json().catch(() => ({ status: 'error', error: 'Unable to send reminder.' }));
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || 'Unable to send reminder.');
      }
      setToast(json.data?.message || `Reminder sent for ${row.requestNumber}.`);
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to send reminder.');
    } finally {
      setRowActionBusy(false);
    }
  };

  const openRowAction = (row: { requestId: string; requestNumber: string }, action: 'approve' | 'reject' | 'return') => {
    setRowAction({ requestId: row.requestId, requestNumber: row.requestNumber, action });
    setRowActionReason('');
    setToast('');
  };

  const submitRowAction = async () => {
    if (!rowAction) return;
    const needsReason = rowAction.action === 'reject' || rowAction.action === 'return';
    if (needsReason && rowActionReason.trim().length < 3) {
      setToast(`Please enter a reason for ${rowAction.action}.`);
      return;
    }
    setRowActionBusy(true);
    setToast('');
    try {
      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transition',
          requestId: rowAction.requestId,
          transition: rowAction.action,
          reason: needsReason ? rowActionReason.trim() : undefined,
          comment: rowActionReason.trim() || undefined,
          listScope: listMode === 'inbox' ? 'inbox' : 'mine',
        }),
      });
      const json = await res.json().catch(() => ({ status: 'error', error: `Unable to ${rowAction.action}.` }));
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || `Unable to ${rowAction.action} request.`);
      }
      setWorkspace(json.data.workspace as PaymentRequestsWorkspace);
      setToast(
        rowAction.action === 'approve'
          ? `${rowAction.requestNumber} approved.`
          : rowAction.action === 'reject'
            ? `${rowAction.requestNumber} rejected.`
            : `${rowAction.requestNumber} returned.`,
      );
      setRowAction(null);
      setRowActionReason('');
    } catch (error) {
      setToast(error instanceof Error ? error.message : `Unable to ${rowAction.action} request.`);
    } finally {
      setRowActionBusy(false);
    }
  };

  const kpis: Array<{
    id: KpiId;
    label: string;
    count: number;
    value: number;
    icon: typeof FileText;
    wrap: string;
    color: string;
  }> = [
    { id: 'total', label: 'Total Requests', count: workspace.summary.totalRequests, value: workspace.summary.totalValue, icon: FileText, wrap: 'bg-slate-100', color: 'text-slate-600' },
    { id: 'pending', label: listMode === 'inbox' ? 'Awaiting my approval' : 'Pending Approval', count: workspace.summary.pendingApproval, value: workspace.summary.pendingValue, icon: Clock3, wrap: 'bg-orange-50', color: 'text-orange-500' },
    { id: 'returned', label: 'Returned', count: workspace.summary.returned, value: workspace.summary.returnedValue, icon: RotateCcw, wrap: 'bg-violet-50', color: 'text-violet-600' },
    { id: 'approved', label: 'Approved', count: workspace.summary.approved, value: workspace.summary.approvedValue, icon: CheckCircle2, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { id: 'ready', label: 'Ready for Treasury', count: workspace.summary.readyForTreasury, value: workspace.summary.readyValue, icon: Building2, wrap: 'bg-teal-50', color: 'text-teal-600' },
    { id: 'progress', label: 'Payment in Progress', count: workspace.summary.inProgress, value: workspace.summary.inProgressValue, icon: CreditCard, wrap: 'bg-blue-50', color: 'text-[#008FD5]' },
    { id: 'paid', label: 'Paid This Month', count: workspace.summary.paidThisMonth, value: workspace.summary.paidValue, icon: CalendarDays, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { id: 'rejected', label: 'Rejected', count: workspace.summary.rejected, value: workspace.summary.rejectedValue, icon: XCircle, wrap: 'bg-rose-50', color: 'text-rose-600' },
  ];

  const selectKpi = (kpiId: KpiId) => {
    setDetailFocus(kpiId);
    setStatusFilter('All');
    if (kpiId === 'total') setTab('all');
    else if (kpiId === 'pending') setTab(listMode === 'approved' ? 'all' : 'pending');
    else if (kpiId === 'returned') setTab('returned');
    else if (kpiId === 'approved') setTab('approved');
    else if (kpiId === 'ready') setTab('ready');
    else if (kpiId === 'progress') setTab(listMode === 'inbox' ? 'all' : 'retirement');
    else if (kpiId === 'paid') setTab('paid');
    else if (kpiId === 'rejected') setTab('rejected');
    window.requestAnimationFrame(() => {
      document.getElementById('payment-requests-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const tabs: Array<{ id: TabId; label: string; count?: number }> = (
    [
      { id: 'all' as TabId, label: listMode === 'approved' ? 'All (excl. pending)' : 'All Requests', count: workspace.tabCounts.all },
      ...(listMode === 'inbox' ? [] : [
        { id: 'mine' as TabId, label: 'My Requests', count: workspace.tabCounts.mine },
        { id: 'drafts' as TabId, label: 'Drafts', count: workspace.tabCounts.drafts },
      ]),
      ...(listMode === 'approved' ? [] : [
        { id: 'pending' as TabId, label: 'Pending Approval', count: workspace.tabCounts.pending },
      ]),
      { id: 'returned' as TabId, label: 'Returned', count: workspace.tabCounts.returned },
      { id: 'approved' as TabId, label: 'Approved', count: workspace.tabCounts.approved },
      { id: 'ready' as TabId, label: 'Ready for Treasury', count: workspace.tabCounts.ready },
      { id: 'retirement' as TabId, label: 'Retirement', count: workspace.tabCounts.retirement },
      { id: 'paid' as TabId, label: 'Paid', count: workspace.tabCounts.paid },
      { id: 'rejected' as TabId, label: 'Rejected', count: workspace.tabCounts.rejected },
    ] as Array<{ id: TabId; label: string; count?: number }>
  ).filter((item) => {
    if (listMode === 'inbox') return item.id === 'pending';
    return true;
  });

  const visibleKpis = listMode === 'inbox' ? kpis.filter((kpi) => kpi.id === 'pending') : kpis;

  return (
    <PageFrame>
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 sm:text-[28px]">
            {listMode === 'inbox'
              ? 'My Approval Inbox'
              : listMode === 'mine'
                ? 'My Requests'
                : listMode === 'approved'
                  ? 'Payment Requests'
                  : 'Payment Requests'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {listMode === 'inbox'
              ? 'Only payments waiting for your approval. Click a card or row to open the request.'
              : listMode === 'mine'
                ? 'Payment requests you raised — drafts, pending, returned, approved and completed.'
                : listMode === 'approved'
                  ? 'Approved and in-progress payments. Use Payment Type to filter Cash Advance, Supplier Invoice, or Expense.'
                  : 'Create, submit, track and manage payment requests through the full approval lifecycle.'}
          </p>
          {listMode !== 'inbox' ? (
            <p className="mt-2 text-xs font-medium text-slate-400">
              Enabled types: Cash Advance Payment · Supplier Invoice Payment · Expense Payment
            </p>
          ) : null}
        </div>
        {listMode === 'inbox' ? (
          <ActionToolbar>
            <Link
              href="/finance/approvals/payments"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              View approved payments
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </ActionToolbar>
        ) : (
          <ActionToolbar>
          <div className="relative">
            <button
              type="button"
              onClick={() => setTypeMenuOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#007bb8]"
            >
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New Payment Request</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {typeMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <button type="button" onClick={() => openComposer('Cash Advance Payment')} className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50">
                  <CreditCard className="mt-0.5 h-4 w-4 text-[#008FD5]" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Cash Advance Payment</span>
                    <span className="block text-xs text-slate-500">Employee advance before activity</span>
                  </span>
                </button>
                <button type="button" onClick={() => openComposer('Supplier Invoice Payment')} className="flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50">
                  <Building2 className="mt-0.5 h-4 w-4 text-[#008FD5]" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Supplier Invoice Payment</span>
                    <span className="block text-xs text-slate-500">Pay supplier against a purchase order</span>
                  </span>
                </button>
                <button type="button" onClick={() => openComposer('Expense Payment')} className="flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50">
                  <Wallet className="mt-0.5 h-4 w-4 text-[#008FD5]" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Expense Payment</span>
                    <span className="block text-xs text-slate-500">Utility, LAWMA, rent and other bills without a PO</span>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex">
            <Upload className="h-4 w-4" />
            Import from Sage X3
          </button>
          <button
            type="button"
            onClick={exportFilteredRows}
            title={`Export ${filteredRows.length} row(s) to Excel`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          </ActionToolbar>
        )}
      </header>

      {toast ? <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{toast}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleKpis.map((kpi) => {
          const active = detailFocus === kpi.id;
          return (
            <button
              key={kpi.id}
              type="button"
              onClick={() => selectKpi(kpi.id)}
              className={`cursor-pointer rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-[#008FD5] hover:bg-[#EAF6FF] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008FD5]/40 ${
                active ? 'border-[#008FD5] ring-2 ring-[#008FD5]/20' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{kpi.label}</p>
                <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${kpi.wrap}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{kpi.count}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{moneyCompact(kpi.value)}</p>
            </button>
          );
        })}
      </div>

      <section id="payment-requests-list" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {detailFocus ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-[#EAF6FF] px-4 py-2.5">
            <p className="text-xs font-semibold text-[#0369A1]">
              Showing {kpis.find((item) => item.id === detailFocus)?.label || 'selected'} details
              <span className="ml-1 font-medium opacity-80">· {filteredRows.length} request{filteredRows.length === 1 ? '' : 's'}</span>
            </p>
            <button
              type="button"
              onClick={() => setDetailFocus(null)}
              className="rounded-lg border border-[#93C5FD] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0369A1] hover:bg-[#F0F9FF]"
            >
              Clear card filter
            </button>
          </div>
        ) : null}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-3">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDetailFocus(null);
                setTab(item.id);
              }}
              className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-semibold ${
                !detailFocus && tab === item.id ? 'bg-[#EAF6FF] text-[#008FD5]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}
              {item.count ? <span className="ml-1 text-[10px] opacity-80">({item.count})</span> : null}
            </button>
          ))}
        </div>

        <FilterToolbar>
          <select
            value={paymentTypeFilter}
            onChange={(event) => setPaymentTypeFilter(event.target.value as 'All' | PaymentRequestType)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs md:w-auto"
          >
            <option value="All">Payment Type</option>
            <option value="Cash Advance Payment">Cash Advance Payment</option>
            <option value="Supplier Invoice Payment">Supplier Invoice Payment</option>
            <option value="Expense Payment">Expense Payment</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs md:w-auto"
          >
            <option value="All">Status</option>
            {filterOptions.statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            className="hidden rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs sm:block md:w-auto"
          >
            <option value="All">Department</option>
            {filterOptions.departments.map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="hidden rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs lg:block md:w-auto"
          >
            <option value="All">Project</option>
            {filterOptions.projects.map((project) => (
              <option key={project} value={project}>{project}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMoreFiltersOpen((open) => !open)}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold md:w-auto ${
              moreFiltersOpen || currencyFilter !== 'All' || approverFilter !== 'All' || locationFilter !== 'All' || submittedFrom || submittedTo
                ? 'border-[#93C5FD] bg-[#EAF6FF] text-[#0369A1]'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            More Filters
          </button>
          <div className="relative w-full min-w-0 md:ml-auto md:max-w-xs md:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search request no., vendor, description…"
              className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#DBEAFE]"
            />
          </div>
          <button
            type="button"
            onClick={clearListFilters}
            title="Clear filters"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </FilterToolbar>

        {moreFiltersOpen ? (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-3">
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs sm:hidden"
            >
              <option value="All">Department</option>
              {filterOptions.departments.map((department) => (
                <option key={`m-${department}`} value={department}>{department}</option>
              ))}
            </select>
            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs lg:hidden"
            >
              <option value="All">Project</option>
              {filterOptions.projects.map((project) => (
                <option key={`m-${project}`} value={project}>{project}</option>
              ))}
            </select>
            <select
              value={currencyFilter}
              onChange={(event) => setCurrencyFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
            >
              <option value="All">Currency</option>
              {filterOptions.currencies.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
            <select
              value={approverFilter}
              onChange={(event) => setApproverFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
            >
              <option value="All">Approver</option>
              {filterOptions.approvers.map((approver) => (
                <option key={approver} value={approver}>{approver}</option>
              ))}
            </select>
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
            >
              <option value="All">Location</option>
              {filterOptions.locations.map((location) => (
                <option key={location} value={location}>{location}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
              <span className="font-semibold whitespace-nowrap">Submitted from</span>
              <input
                type="date"
                value={submittedFrom}
                max={submittedTo || undefined}
                onChange={(event) => setSubmittedFrom(event.target.value)}
                className="rounded border-0 bg-transparent py-0.5 text-xs text-slate-800 outline-none"
              />
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
              <span className="font-semibold whitespace-nowrap">Submitted to</span>
              <input
                type="date"
                value={submittedTo}
                min={submittedFrom || undefined}
                onChange={(event) => setSubmittedTo(event.target.value)}
                className="rounded border-0 bg-transparent py-0.5 text-xs text-slate-800 outline-none"
              />
            </label>
            {activeFilterCount ? (
              <button
                type="button"
                onClick={clearListFilters}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Clear filters ({activeFilterCount})
              </button>
            ) : null}
          </div>
        ) : null}

        <MobileCardList>
          {filteredRows.length ? pageRows.map((row) => {
            const showApproveActions = canApproveRow(row.requestId);
            const showEditReturned = canEditReturnedRow(row.requestId);
            const showSendReminder = canRemindRow(row);
            return (
              <article
                key={`card-${row.requestId}`}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-[#008FD5] hover:bg-[#EAF6FF]"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a, button')) return;
                  router.push(`/finance/approvals/request/${row.requestId}`);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/finance/approvals/request/${row.requestId}`} className="text-sm font-semibold text-[#008FD5] hover:underline">
                      {row.requestNumber}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{row.paymentType}</p>
                    {(row.attachments || []).filter((file) => file.kind !== 'payment-evidence' && file.kind !== 'retirement-evidence').length ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                        <Paperclip className="h-3 w-3" />
                        {(row.attachments || []).filter((file) => file.kind !== 'payment-evidence' && file.kind !== 'retirement-evidence').length} supporting doc(s)
                      </p>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.status)}`}>{row.status}</span>
                </div>
                <p className="mt-2 truncate text-sm font-medium text-slate-800">{row.beneficiaryName || '—'}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{row.description || row.title}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <div>
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{moneyFull(row.netAmount, row.currencyCode)}</p>
                    <p className="text-[10px] text-slate-400">{row.currentApproverName || row.currentStage || '—'}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {showApproveActions ? (
                      <>
                        <button type="button" disabled={busy || rowActionBusy} onClick={() => openRowAction(row, 'approve')} className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">Approve</button>
                        <button type="button" disabled={busy || rowActionBusy} onClick={() => openRowAction(row, 'return')} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 disabled:opacity-50">Return</button>
                        <button type="button" disabled={busy || rowActionBusy} onClick={() => openRowAction(row, 'reject')} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-50">Reject</button>
                      </>
                    ) : showEditReturned ? (
                      <button type="button" disabled={busy} onClick={() => openEditReturned(row)} className="rounded-lg bg-[#008FD5] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
                        {/^draft$/i.test(row.status) ? 'Edit & submit' : 'Edit & resend'}
                      </button>
                    ) : showSendReminder ? (
                      <button type="button" disabled={busy || rowActionBusy} onClick={() => void sendReminder(row)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 disabled:opacity-50">
                        <Send className="h-3 w-3" /> Remind
                      </button>
                    ) : (
                      <Link href={`/finance/approvals/request/${row.requestId}`} className="text-[11px] font-semibold text-[#008FD5] hover:underline">View</Link>
                    )}
                  </div>
                </div>
              </article>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
              <Inbox className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-800">No payment requests yet</p>
            </div>
          )}
        </MobileCardList>

        <DesktopOnlyTable>
          <ScrollTable minWidth={showFxColumn ? 1280 : 1180}>
            <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 text-slate-500">
              <tr>
                {[
                  'Request No.',
                  'Payment Type',
                  'Beneficiary',
                  'Description',
                  'Gross Amount',
                  'Net Amount',
                  ...(showFxColumn ? ['Amount (NGN)'] : []),
                  'Currency',
                  'Department',
                  'Project',
                  'Submitted',
                  'Current Stage',
                  'Approver',
                  'Status',
                  'Action',
                ].map((column) => (
                  <th key={column || 'actions'} className="whitespace-nowrap px-3 py-2.5 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? pageRows.map((row) => {
                const TypeIcon = typeIcon(row.paymentType);
                const foreign = isForeignCurrency(row.currencyCode);
                const fxRate = rowFxRate(row);
                const fxDate = rowFxRateDate(row);
                const showApproveActions = canApproveRow(row.requestId);
                const showEditReturned = canEditReturnedRow(row.requestId);
                const showSendReminder = canRemindRow(row);
                return (
                  <tr
                    key={row.requestId}
                    className="cursor-pointer border-t border-slate-100 hover:bg-[#EAF6FF]"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('a, button, input')) return;
                      router.push(`/finance/approvals/request/${row.requestId}`);
                    }}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <Link href={`/finance/approvals/request/${row.requestId}`} className="font-semibold text-[#008FD5] hover:underline">
                          {row.requestNumber}
                        </Link>
                        {(row.attachments || []).filter((file) => file.kind !== 'payment-evidence' && file.kind !== 'retirement-evidence').length ? (
                          <Link
                            href={`/finance/approvals/request/${row.requestId}`}
                            className="inline-flex w-fit items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-[#008FD5]"
                            title="View supporting documents"
                          >
                            <Paperclip className="h-3 w-3" />
                            {(row.attachments || []).filter((file) => file.kind !== 'payment-evidence' && file.kind !== 'retirement-evidence').length} doc(s)
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1.5">
                          <TypeIcon className="h-3.5 w-3.5 text-slate-400" />
                          {row.paymentType}
                        </span>
                        {supplierInvoiceCategoryLabel(row) ? (
                          <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isExpenseNoPoPayment(row)
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {supplierInvoiceCategoryLabel(row)}
                            {isExpenseNoPoPayment(row) && row.payload?.expenseNature
                              ? ` · ${String(row.payload.expenseNature)}`
                              : ''}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.beneficiaryName || '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-600">{row.description || row.title}</td>
                    <td className="px-3 py-2.5 tabular-nums">{moneyFull(row.grossAmount, row.currencyCode)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{moneyFull(row.netAmount, row.currencyCode)}</td>
                    {showFxColumn ? (
                      <td className="px-3 py-2.5">
                        {foreign ? (
                          <div>
                            <div className="tabular-nums font-semibold text-slate-800">{moneyNgn(rowAmountNgn(row))}</div>
                            {fxRate ? (
                              <div className="mt-0.5 text-[10px] font-medium text-slate-500">
                                Rate {Number(fxRate).toLocaleString('en-NG', { maximumFractionDigits: 6 })}
                                {fxDate ? ` · ${fxDate}` : ''}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5">{row.currencyCode}</td>
                    <td className="px-3 py-2.5">{row.department || '—'}</td>
                    <td className="px-3 py-2.5">{row.projectCode || '—'}</td>
                    <td className="px-3 py-2.5">{fmtDateTime(row.submittedAt || row.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{row.currentStage}</span>
                    </td>
                    <td className="px-3 py-2.5">{row.currentApproverName || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(row.status)}`}>{row.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {showApproveActions ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy || rowActionBusy}
                            onClick={() => openRowAction(row, 'approve')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy || rowActionBusy}
                            onClick={() => openRowAction(row, 'return')}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Return
                          </button>
                          <button
                            type="button"
                            disabled={busy || rowActionBusy}
                            onClick={() => openRowAction(row, 'reject')}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </button>
                        </div>
                      ) : showEditReturned ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openEditReturned(row)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#008FD5] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#007bb8] disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {/^draft$/i.test(row.status) ? 'Edit & submit' : 'Edit & resend'}
                          </button>
                          <Link
                            href={`/finance/approvals/request/${row.requestId}`}
                            className="text-[11px] font-semibold text-[#008FD5] hover:underline"
                          >
                            View
                          </Link>
                        </div>
                      ) : showSendReminder ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy || rowActionBusy}
                            onClick={() => void sendReminder(row)}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" />
                            Send reminder
                          </button>
                          <Link
                            href={`/finance/approvals/request/${row.requestId}`}
                            className="text-[11px] font-semibold text-[#008FD5] hover:underline"
                          >
                            View
                          </Link>
                        </div>
                      ) : (
                        <Link
                          href={`/finance/approvals/request/${row.requestId}`}
                          className="text-[11px] font-semibold text-[#008FD5] hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={showFxColumn ? 15 : 14} className="px-3 py-16 text-center">
                    <Inbox className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-800">No payment requests yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Create a Cash Advance or Supplier Invoice payment request to begin the approval lifecycle.
                    </p>
                    <button
                      type="button"
                      onClick={() => openComposer('Cash Advance Payment')}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#008FD5] px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      New Payment Request <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </ScrollTable>
        </DesktopOnlyTable>
        <FinanceListPagination
          page={page}
          pageSize={pageSize}
          total={filteredRows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </section>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/finance/approvals/inbox" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
          My Approval Inbox
        </Link>
        <Link href="/finance/approvals/payments" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
          Payment Requests
        </Link>
        <Link href="/finance/approvals/my-requests" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
          My Requests
        </Link>
        {!selfServiceMode ? (
          <Link href="/finance/approvals/treasury" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
            <Wallet className="h-3.5 w-3.5" /> Treasury Operations
          </Link>
        ) : null}
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
                <div className="flex max-h-[min(92vh,100dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#008FD5]">
                  {editingRequestId
                    ? (editingIsDraft ? 'Edit draft request' : 'Edit returned request')
                    : 'New payment request'}
                </p>
                <h2 className="mt-1 text-base font-semibold text-slate-900 sm:text-lg">
                  {editingRequestId ? `${editingRequestNumber} · ${composerType}` : composerType}
                </h2>
                {editingRequestId ? (
                  <p className={`mt-1 text-xs ${editingIsDraft ? 'text-slate-600' : 'text-violet-700'}`}>
                    {editingIsDraft
                      ? 'Update the details below, save as draft, or submit for approval.'
                      : 'Correct the details below and resend into the approval workflow.'}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setEditingRequestId(null);
                  setEditingRequestNumber('');
                  setExistingAttachments([]);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-w-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
              {formErrors.length ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <p className="mb-1 font-semibold">Unable to submit</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {formErrors.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              {composerType === 'Cash Advance Payment' && eligibility?.blocked ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-semibold">New cash advance blocked</p>
                      <p className="mt-1">{eligibility.message}</p>
                      {eligibility.outstanding[0] ? (
                        <p className="mt-1 text-xs text-amber-800">
                          Outstanding: {eligibility.outstanding[0].requestNumber} · {eligibility.outstanding[0].status} · {eligibility.outstanding[0].title}
                        </p>
                      ) : null}
                      {!selfServiceMode ? (
                        <Link href="/finance/approvals/advance-retirement" className="mt-2 inline-flex text-xs font-semibold text-[#008FD5] hover:underline">
                          Open Cash Advance Controls (CFO)
                        </Link>
                      ) : (
                        <p className="mt-2 text-xs text-amber-800">Contact Finance / CFO to retire, cancel, or waive the outstanding advance.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
              {composerType === 'Cash Advance Payment' && eligibility && !eligibility.blocked && eligibility.outstandingCount > 0 ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {eligibility.message}
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {composerType === 'Cash Advance Payment' ? 'Raised by' : 'Requested by'}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {signedInRequester?.name || 'Signed-in user'}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {[
                    signedInRequester?.employeeCode,
                    signedInRequester?.jobTitle,
                    signedInRequester?.department,
                  ].filter(Boolean).join(' · ') || 'Loaded from your signed-in account'}
                </p>
                {composerType === 'Cash Advance Payment' ? (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Approval routing follows the selected employee’s reporting manager.
                  </p>
                ) : null}
              </div>
              {composerType === 'Cash Advance Payment' ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="relative block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Employee *</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          value={employeeSearch}
                          onChange={(e) => {
                            setEmployeeSearch(e.target.value);
                            setEmployeePickerOpen(true);
                            setForm((prev) => ({ ...prev, employeeName: e.target.value, employeeCode: '' }));
                            setEligibility(null);
                          }}
                          onFocus={() => setEmployeePickerOpen(true)}
                          onBlur={() => window.setTimeout(() => setEmployeePickerOpen(false), 150)}
                          placeholder="Search employee name or code"
                          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]"
                          autoComplete="off"
                          inputMode="search"
                        />
                      </div>
                      {employeePickerOpen ? (
                        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {filteredEmployees.length ? filteredEmployees.map((employee) => (
                            <button
                              key={employee.employeeCode}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectEmployee(employee)}
                              className="block w-full px-3 py-2.5 text-left hover:bg-slate-50"
                            >
                              <span className="block text-sm font-semibold text-slate-900">{employee.fullName}</span>
                              <span className="block text-xs text-slate-500">{employee.employeeCode} · {employee.department || 'No department'}</span>
                            </button>
                          )) : (
                            <p className="px-3 py-3 text-xs text-slate-500">No employees match that search.</p>
                          )}
                        </div>
                      ) : null}
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Employee code</span>
                      <input value={form.employeeCode} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600" />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <SearchableSelect
                      label="Department"
                      required
                      value={form.department}
                      placeholder="Search department"
                      options={(lookups?.departments || []).concat(
                        form.department && !(lookups?.departments || []).includes(form.department) ? [form.department] : [],
                      ).map((item) => ({ value: item, label: item }))}
                      onChange={(value) => setForm((prev) => ({ ...prev, department: value }))}
                    />
                    <SearchableSelect
                      label="Location"
                      required
                      value={form.location}
                      placeholder="Search location"
                      options={(lookups?.locations || []).concat(
                        form.location && !(lookups?.locations || []).includes(form.location) ? [form.location] : [],
                      ).map((item) => ({ value: item, label: item }))}
                      onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
                    />
                    <div>
                      <SearchableSelect
                        label="Project"
                        value={form.projectCode}
                        placeholder="Search project"
                        options={(lookups?.projects || []).map((item) => ({ value: item.code, label: item.label }))}
                        onChange={(value) => setForm((prev) => ({ ...prev, projectCode: value }))}
                      />
                      <ProjectManagerConfirmation projectCode={form.projectCode} projects={lookups?.projects} />
                    </div>
                  </div>

                  <SearchableSelect
                    label="Payment site"
                    required
                    value={form.paymentSiteCode}
                    placeholder="Search payment site"
                    options={(lookups?.paymentSites || []).map((site) => ({
                      value: site.siteCode,
                      label: `${site.siteCode} – ${site.siteName}`,
                    }))}
                    onChange={(value) => setForm((prev) => ({ ...prev, paymentSiteCode: value }))}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Amount *</span>
                      <input type="number" min="0" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                    <SearchableSelect
                      label="Currency"
                      value={form.currencyCode}
                      placeholder="Search currency"
                      options={['NGN', 'USD', 'EUR', 'GBP'].map((item) => ({ value: item, label: item }))}
                      onChange={(value) => setForm((prev) => ({ ...prev, currencyCode: value || 'NGN' }))}
                    />
                  </div>

                  <SearchableSelect
                    label="Request title"
                    required
                    value={form.expenseCode}
                    placeholder="Search expense / request title"
                    options={(lookups?.expenseCodes || []).map((item) => ({
                      value: item.expenseCode,
                      label: item.label,
                    }))}
                    onChange={(value, option) => setForm((prev) => ({
                      ...prev,
                      expenseCode: value,
                      title: option?.label || '',
                    }))}
                  />

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Business justification *</span>
                    <textarea value={form.businessJustification} onChange={(e) => setForm((prev) => ({ ...prev, businessJustification: e.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                  </label>

                  {editingRequestId ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Supporting documents</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Remove or replace attachments before resending this returned request.
                          </p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          <Upload className="h-3.5 w-3.5" />
                          Add files
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              addSupportingFiles(e.target.files);
                              e.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                      {existingAttachments.length ? (
                        <ul className="mt-3 space-y-1.5">
                          {existingAttachments.map((file, index) => (
                            <li key={`${file.id || file.fileName || file.originalName}-${index}`} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-xs text-slate-700">
                              <Paperclip className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <span className="min-w-0 flex-1 truncate font-medium">{file.originalName || file.fileName}</span>
                              <button
                                type="button"
                                onClick={() => setExistingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {supportingFiles.length ? (
                        <ul className="mt-3 space-y-1.5">
                          {supportingFiles.map((file) => (
                            <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
                              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                              <button
                                type="button"
                                onClick={() => setSupportingFiles((current) => current.filter((item) => item !== file))}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                aria-label={`Remove ${file.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Request title *</span>
                    <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Amount *</span>
                      <input type="number" min="0" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                    <SearchableSelect
                      label="Currency"
                      value={form.currencyCode}
                      placeholder="Search currency"
                      options={['NGN', 'USD', 'EUR', 'GBP'].map((item) => ({ value: item, label: item }))}
                      onChange={(value) => setForm((prev) => ({ ...prev, currencyCode: value || 'NGN' }))}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">
                        {composerType === 'Expense Payment' ? 'Payee code' : 'Supplier code'}
                      </span>
                      <input value={form.beneficiaryCode} onChange={(e) => setForm((prev) => ({ ...prev, beneficiaryCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">
                        {composerType === 'Expense Payment' ? 'Payee / supplier name *' : 'Supplier name *'}
                      </span>
                      <input value={form.beneficiaryName} onChange={(e) => setForm((prev) => ({ ...prev, beneficiaryName: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" placeholder={composerType === 'Expense Payment' ? 'Enter payee name' : 'Search / enter supplier'} />
                    </label>
                  </div>
                  <SearchableSelect
                    label="Payment site"
                    value={form.paymentSiteCode}
                    placeholder="Search payment site"
                    options={(lookups?.paymentSites || []).map((site) => ({
                      value: site.siteCode,
                      label: `${site.siteCode} – ${site.siteName}`,
                    }))}
                    onChange={(value) => setForm((prev) => ({ ...prev, paymentSiteCode: value }))}
                  />
                  {composerType === 'Expense Payment' ? (
                    <SearchableSelect
                      label="Expense nature"
                      required
                      value={form.expenseNature}
                      placeholder="Search expense nature"
                      options={EXPENSE_NATURE_OPTIONS.map((item) => ({ value: item, label: item }))}
                      onChange={(value) => setForm((prev) => ({ ...prev, expenseNature: value }))}
                    />
                  ) : (
                    <div className="rounded-xl border border-[#DBEAFE] bg-[#EFF8FF] px-3 py-2.5 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">PO-backed supplier invoice</p>
                      <p className="mt-0.5 text-xs text-slate-500">Use Expense Payment for utility, LAWMA, rent and other bills without a purchase order.</p>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">
                        {composerType === 'Expense Payment' ? 'Bill / invoice number *' : 'Invoice number *'}
                      </span>
                      <input value={form.invoiceNumber} onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                    {composerType === 'Supplier Invoice Payment' ? (
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Purchase order</span>
                        <input value={form.purchaseOrderNo} onChange={(e) => setForm((prev) => ({ ...prev, purchaseOrderNo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                      </label>
                    ) : (
                      <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
                        <p className="font-medium">PO not applicable</p>
                        <p className="mt-0.5 text-xs">Expense payments do not require a purchase order.</p>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">VAT</span>
                      <input type="number" value={form.vatAmount} onChange={(e) => setForm((prev) => ({ ...prev, vatAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">WHT</span>
                      <input type="number" value={form.whtAmount} onChange={(e) => setForm((prev) => ({ ...prev, whtAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Retention</span>
                      <input type="number" value={form.retentionAmount} onChange={(e) => setForm((prev) => ({ ...prev, retentionAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SearchableSelect
                      label="Department"
                      required
                      value={form.department}
                      placeholder="Search department"
                      options={(lookups?.departments || []).concat(
                        form.department && !(lookups?.departments || []).includes(form.department) ? [form.department] : [],
                      ).map((item) => ({ value: item, label: item }))}
                      onChange={(value) => setForm((prev) => ({ ...prev, department: value }))}
                    />
                    <div>
                      <SearchableSelect
                        label="Project"
                        value={form.projectCode}
                        placeholder="Search project"
                        options={(lookups?.projects || []).map((item) => ({ value: item.code, label: item.label }))}
                        onChange={(value) => setForm((prev) => ({ ...prev, projectCode: value }))}
                      />
                      <ProjectManagerConfirmation projectCode={form.projectCode} projects={lookups?.projects} />
                    </div>
                  </div>
                  <SearchableSelect
                    label="Location"
                    value={form.location}
                    placeholder="Search location"
                    options={(lookups?.locations || []).concat(
                      form.location && !(lookups?.locations || []).includes(form.location) ? [form.location] : [],
                    ).map((item) => ({ value: item, label: item }))}
                    onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
                  />
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                          <p className="text-sm font-medium text-slate-700">
                          Supporting documents <span className="text-rose-600">*</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {editingRequestId
                            ? 'Remove any documents that should not be resent, then add replacements if needed (PDF, image, Word, Excel · max 8 files, 8 MB each).'
                            : composerType === 'Expense Payment'
                              ? 'Upload the bill / invoice and any supporting evidence (PDF, image, Word, Excel · max 8 files, 8 MB each).'
                              : 'Upload invoice, PO, delivery note or other evidence (PDF, image, Word, Excel · max 8 files, 8 MB each).'}
                        </p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" />
                        Add files
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf,image/*"
                          className="hidden"
                          onChange={(e) => {
                            addSupportingFiles(e.target.files);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {existingAttachments.length ? (
                      <ul className="mt-3 space-y-1.5">
                        {existingAttachments.map((file, index) => (
                          <li key={`${file.id || file.fileName || file.originalName}-${index}`} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-xs text-slate-700">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span className="min-w-0 flex-1 truncate font-medium">{file.originalName || file.fileName}</span>
                            <button
                              type="button"
                              onClick={() => setExistingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {supportingFiles.length ? (
                      <ul className="mt-3 space-y-1.5">
                        {supportingFiles.map((file) => (
                          <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                            <span className="shrink-0 text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
                            <button
                              type="button"
                              onClick={() => setSupportingFiles((current) => current.filter((item) => item !== file))}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Remove ${file.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {!supportingFiles.length && !existingAttachments.length ? (
                      <p className="mt-3 text-xs font-medium text-rose-600">At least one supporting document is required.</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              {editingRequestId && !editingIsDraft ? (
                <p className="text-xs text-slate-600">Changes will restart approval from the first stage.</p>
              ) : (
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={form.submit} onChange={(e) => setForm((prev) => ({ ...prev, submit: e.target.checked }))} className="rounded border-slate-300 text-[#008FD5]" />
                  Submit for approval now
                </label>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setEditingRequestId(null);
                    setEditingRequestNumber('');
                    setEditingIsDraft(false);
                    setExistingAttachments([]);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || (!editingRequestId && composerType === 'Cash Advance Payment' && Boolean(eligibility?.blocked))}
                  onClick={() => void submitRequest()}
                  className="rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy
                    ? 'Saving…'
                    : editingRequestId
                      ? (editingIsDraft
                        ? (form.submit ? 'Submit for approval' : 'Save draft')
                        : 'Resend for approval')
                      : form.submit
                        ? 'Submit request'
                        : 'Save draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {rowAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {rowAction.action === 'approve'
                    ? 'Approve payment'
                    : rowAction.action === 'return'
                      ? 'Return payment'
                      : 'Reject payment'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{rowAction.requestNumber}</p>
              </div>
              <button
                type="button"
                disabled={rowActionBusy}
                onClick={() => { setRowAction(null); setRowActionReason(''); }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {rowAction.action === 'approve' ? (
                <p className="text-sm text-slate-600">
                  Confirm approval for this stage. You can add an optional comment below.
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  A reason is required to {rowAction.action} this payment request.
                </p>
              )}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  {rowAction.action === 'approve' ? 'Comment (optional)' : 'Reason *'}
                </span>
                <textarea
                  value={rowActionReason}
                  onChange={(e) => setRowActionReason(e.target.value)}
                  rows={4}
                  placeholder={
                    rowAction.action === 'approve'
                      ? 'Optional note for the requester / next stage'
                      : `Enter reason for ${rowAction.action}`
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                disabled={rowActionBusy}
                onClick={() => { setRowAction(null); setRowActionReason(''); }}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rowActionBusy}
                onClick={() => void submitRowAction()}
                className={`rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  rowAction.action === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : rowAction.action === 'return'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {rowActionBusy
                  ? 'Saving…'
                  : rowAction.action === 'approve'
                    ? 'Confirm approve'
                    : rowAction.action === 'return'
                      ? 'Confirm return'
                      : 'Confirm reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageFrame>
  );
}
