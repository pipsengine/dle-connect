'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
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
  MoreHorizontal,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  Upload,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import type {
  PaymentRequestType,
  PaymentRequestsWorkspace,
} from '@/lib/finance-intelligence/payment-requests-service';
import type { PaymentRequestLookups } from '@/lib/finance-intelligence/payment-request-lookups';

type Props = {
  initialWorkspace: PaymentRequestsWorkspace;
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
  submit: boolean;
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
  submit: true,
});


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

const moneyFull = (value: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

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
  if (/pending|submitted|finance review/i.test(status)) return 'bg-blue-50 text-[#1D4ED8]';
  if (/returned|clarification/i.test(status)) return 'bg-violet-50 text-violet-700';
  if (/ready for treasury|payment scheduled|payment processing/i.test(status)) return 'bg-teal-50 text-teal-700';
  if (/rejected|cancelled/i.test(status)) return 'bg-rose-50 text-rose-700';
  if (/draft/i.test(status)) return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-600';
};

const typeIcon = (paymentType: string) => {
  if (/cash advance/i.test(paymentType)) return CreditCard;
  if (/supplier/i.test(paymentType)) return Building2;
  return FileText;
};

type TabId = 'all' | 'mine' | 'drafts' | 'pending' | 'returned' | 'approved' | 'ready' | 'paid' | 'rejected';

export default function PaymentRequestsClient({ initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [tab, setTab] = useState<TabId>('all');
  const [query, setQuery] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'All' | PaymentRequestType>('All');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerType, setComposerType] = useState<PaymentRequestType>('Cash Advance Payment');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookups, setLookups] = useState<PaymentRequestLookups | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [form, setForm] = useState<ComposerForm>(emptyForm());

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
        if (userRes.ok && userJson.status === 'success' && composerType === 'Cash Advance Payment') {
          const user = userJson.data as {
            name?: string;
            employeeCode?: string;
            department?: string;
            location?: string;
          };
          setForm((prev) => ({
            ...prev,
            employeeName: prev.employeeName || user.name || '',
            employeeCode: prev.employeeCode || user.employeeCode || '',
            department: prev.department || user.department || '',
            location: prev.location || user.location || '',
            beneficiaryName: prev.beneficiaryName || user.name || '',
            beneficiaryCode: prev.beneficiaryCode || user.employeeCode || '',
          }));
          setEmployeeSearch(user.name || '');
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
      const res = await fetch('/api/finance/payment-requests', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Refresh failed');
      setWorkspace(json.data as PaymentRequestsWorkspace);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.rows.filter((row) => {
      if (paymentTypeFilter !== 'All' && row.paymentType !== paymentTypeFilter) return false;
      if (tab === 'drafts' && !/draft/i.test(row.status)) return false;
      if (tab === 'pending' && !/pending|submitted|finance review/i.test(row.status)) return false;
      if (tab === 'returned' && !/returned/i.test(row.status)) return false;
      if (tab === 'approved' && !/^approved$/i.test(row.status)) return false;
      if (tab === 'ready' && !/ready for treasury/i.test(row.status)) return false;
      if (tab === 'paid' && !/paid|completed|retired|closed/i.test(row.status)) return false;
      if (tab === 'rejected' && !/rejected|cancelled/i.test(row.status)) return false;
      if (!q) return true;
      return (
        row.requestNumber.toLowerCase().includes(q)
        || row.beneficiaryName.toLowerCase().includes(q)
        || row.description.toLowerCase().includes(q)
        || row.paymentType.toLowerCase().includes(q)
        || row.projectCode.toLowerCase().includes(q)
        || row.department.toLowerCase().includes(q)
        || row.title.toLowerCase().includes(q)
      );
    });
  }, [workspace.rows, tab, query, paymentTypeFilter]);

  const openComposer = (type: PaymentRequestType) => {
    setComposerType(type);
    setTypeMenuOpen(false);
    setForm(emptyForm());
    setEmployeeSearch('');
    setEmployeePickerOpen(false);
    setComposerOpen(true);
  };

  const selectEmployee = (employee: PaymentRequestLookups['employees'][number]) => {
    setForm((prev) => ({
      ...prev,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.department || prev.department,
      location: employee.location || prev.location,
      projectCode: employee.projectCode || prev.projectCode,
      beneficiaryCode: employee.employeeCode,
      beneficiaryName: employee.fullName,
    }));
    setEmployeeSearch(employee.fullName);
    setEmployeePickerOpen(false);
  };

  const submitRequest = async () => {
    setBusy(true);
    setToast('');
    try {
      const selectedExpense = lookups?.expenseCodes.find((item) => item.expenseCode === form.expenseCode);
      const selectedSite = lookups?.paymentSites.find((item) => item.siteCode === form.paymentSiteCode);
      const res = await fetch('/api/finance/payment-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
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
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          vatAmount: Number(form.vatAmount || 0),
          whtAmount: Number(form.whtAmount || 0),
          retentionAmount: Number(form.retentionAmount || 0),
          purchaseOrderNo: form.purchaseOrderNo,
          deliveryNoteNo: form.deliveryNoteNo,
          submit: form.submit,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to create request.');
      setWorkspace(json.data.workspace as PaymentRequestsWorkspace);
      setComposerOpen(false);
      setToast(json.data.message || 'Payment request saved.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to create request.');
    } finally {
      setBusy(false);
    }
  };

  const transitionSelected = async (transition: string) => {
    if (!selected.length) {
      setToast('Select at least one request.');
      return;
    }
    const reasonRequired = ['reject', 'return', 'delegate', 'escalate', 'clarify'].includes(transition);
    const reason = reasonRequired ? window.prompt('Reason is required for this action:') : undefined;
    if (reasonRequired && !reason?.trim()) {
      setToast('Action cancelled — reason is required.');
      return;
    }
    setBusy(true);
    setToast('');
    try {
      for (const requestId of selected) {
        const res = await fetch('/api/finance/payment-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'transition', requestId, transition, reason, comment: reason }),
        });
        const json = await res.json();
        if (!res.ok || json.status !== 'success') throw new Error(json.error || 'Unable to update request.');
        setWorkspace(json.data.workspace as PaymentRequestsWorkspace);
      }
      setSelected([]);
      setToast('Selected requests updated.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to update request.');
    } finally {
      setBusy(false);
    }
  };

  const kpis = [
    { id: 'total', label: 'Total Requests', count: workspace.summary.totalRequests, value: workspace.summary.totalValue, icon: FileText, wrap: 'bg-slate-100', color: 'text-slate-600' },
    { id: 'pending', label: 'Pending Approval', count: workspace.summary.pendingApproval, value: workspace.summary.pendingValue, icon: Clock3, wrap: 'bg-orange-50', color: 'text-orange-500' },
    { id: 'returned', label: 'Returned', count: workspace.summary.returned, value: workspace.summary.returnedValue, icon: RotateCcw, wrap: 'bg-violet-50', color: 'text-violet-600' },
    { id: 'approved', label: 'Approved', count: workspace.summary.approved, value: workspace.summary.approvedValue, icon: CheckCircle2, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { id: 'ready', label: 'Ready for Treasury', count: workspace.summary.readyForTreasury, value: workspace.summary.readyValue, icon: Building2, wrap: 'bg-teal-50', color: 'text-teal-600' },
    { id: 'progress', label: 'Payment in Progress', count: workspace.summary.inProgress, value: workspace.summary.inProgressValue, icon: CreditCard, wrap: 'bg-blue-50', color: 'text-[#008FD5]' },
    { id: 'paid', label: 'Paid This Month', count: workspace.summary.paidThisMonth, value: workspace.summary.paidValue, icon: CalendarDays, wrap: 'bg-emerald-50', color: 'text-emerald-600' },
    { id: 'rejected', label: 'Rejected', count: workspace.summary.rejected, value: workspace.summary.rejectedValue, icon: XCircle, wrap: 'bg-rose-50', color: 'text-rose-600' },
  ];

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'all', label: 'All Requests', count: workspace.tabCounts.all },
    { id: 'mine', label: 'My Requests', count: workspace.tabCounts.mine },
    { id: 'drafts', label: 'Drafts', count: workspace.tabCounts.drafts },
    { id: 'pending', label: 'Pending Approval', count: workspace.tabCounts.pending },
    { id: 'returned', label: 'Returned', count: workspace.tabCounts.returned },
    { id: 'approved', label: 'Approved', count: workspace.tabCounts.approved },
    { id: 'ready', label: 'Ready for Treasury', count: workspace.tabCounts.ready },
    { id: 'paid', label: 'Paid', count: workspace.tabCounts.paid },
    { id: 'rejected', label: 'Rejected', count: workspace.tabCounts.rejected },
  ];

  const toggleSelected = (requestId: string) => {
    setSelected((current) => (current.includes(requestId) ? current.filter((id) => id !== requestId) : [...current, requestId]));
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Payment Requests</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Create, submit, track and manage payment requests through the full approval lifecycle.
          </p>
          <p className="mt-2 text-xs font-medium text-slate-400">
            Enabled types: Cash Advance Payment · Supplier Invoice Payment
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setTypeMenuOpen((open) => !open)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#007bb8]"
            >
              <Plus className="h-4 w-4" />
              New Payment Request
              <ChevronDown className="h-4 w-4" />
            </button>
            {typeMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
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
                    <span className="block text-xs text-slate-500">Pay supplier against invoice / PO</span>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Import from Sage X3
          </button>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {toast ? <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">{toast}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article key={kpi.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{kpi.label}</p>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${kpi.wrap}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{kpi.count}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{moneyCompact(kpi.value)}</p>
          </article>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-3">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-xs font-semibold ${
                tab === item.id ? 'bg-[#EAF6FF] text-[#008FD5]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}
              {item.count ? <span className="ml-1 text-[10px] opacity-80">({item.count})</span> : null}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center">
          <select
            value={paymentTypeFilter}
            onChange={(event) => setPaymentTypeFilter(event.target.value as 'All' | PaymentRequestType)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
          >
            <option value="All">Payment Type</option>
            <option value="Cash Advance Payment">Cash Advance Payment</option>
            <option value="Supplier Invoice Payment">Supplier Invoice Payment</option>
          </select>
          <select className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
            <option>Status</option>
          </select>
          <select className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
            <option>Department</option>
          </select>
          <select className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs">
            <option>Project</option>
          </select>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600">
            <Filter className="h-3.5 w-3.5" />
            More Filters
          </button>
          <div className="relative ml-auto min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search requests..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-[#DBEAFE]"
            />
          </div>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50/90 text-slate-500">
              <tr>
                <th className="px-3 py-2.5"><span className="sr-only">Select</span></th>
                {['Request No.', 'Payment Type', 'Beneficiary', 'Description', 'Gross Amount', 'Net Amount', 'Currency', 'Department', 'Project', 'Submitted', 'Current Stage', 'Approver', 'Status', ''].map((column) => (
                  <th key={column || 'actions'} className="whitespace-nowrap px-3 py-2.5 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? filteredRows.map((row) => {
                const TypeIcon = typeIcon(row.paymentType);
                return (
                  <tr key={row.requestId} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.requestId)}
                        onChange={() => toggleSelected(row.requestId)}
                        className="rounded border-slate-300 text-[#008FD5]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/finance/approvals/request/${row.requestId}`} className="font-semibold text-[#008FD5] hover:underline">
                        {row.requestNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <TypeIcon className="h-3.5 w-3.5 text-slate-400" />
                        {row.paymentType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{row.beneficiaryName || '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-600">{row.description || row.title}</td>
                    <td className="px-3 py-2.5 tabular-nums">{moneyFull(row.grossAmount)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{moneyFull(row.netAmount)}</td>
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
                      <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={14} className="px-3 py-16 text-center">
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
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <p className="mb-3 text-[11px] text-slate-500">All amounts are in NGN unless otherwise stated. Net Amount includes VAT less WHT and retention.</p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'return', label: 'Return for Correction' },
            { id: 'clarify', label: 'Request Clarification' },
            { id: 'delegate', label: 'Delegate' },
            { id: 'reject', label: 'Reject' },
            { id: 'approve', label: 'Approve' },
            { id: 'mark-ready-treasury', label: 'Ready for Treasury' },
            { id: 'mark-paid', label: 'Mark Paid' },
          ].map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={busy}
              onClick={() => void transitionSelected(action.id)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                action.id === 'approve'
                  ? 'border-emerald-200 bg-emerald-600 text-white'
                  : action.id === 'reject'
                    ? 'border-rose-200 bg-rose-600 text-white'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Rejection, return, delegation and escalation require a mandatory reason. High-value approvals require authentication confirmation.
        </p>
      </section>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/finance/approvals/payments?view=cash-advance" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
          Cash Advance Requests
        </Link>
        <Link href="/finance/approvals/payments?view=supplier" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
          Supplier Invoice Requests
        </Link>
        <Link href="/finance/approvals/my-requests" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
          My Requests
        </Link>
        <Link href="/finance/approvals/treasury" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-[#008FD5]/40">
          <Wallet className="h-3.5 w-3.5" /> Treasury Operations
        </Link>
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#008FD5]">New payment request</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{composerType}</h2>
              </div>
              <button type="button" onClick={() => setComposerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {composerType === 'Cash Advance Payment' ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="relative block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Employee *</span>
                      <input
                        value={employeeSearch}
                        onChange={(e) => {
                          setEmployeeSearch(e.target.value);
                          setEmployeePickerOpen(true);
                          setForm((prev) => ({ ...prev, employeeName: e.target.value }));
                        }}
                        onFocus={() => setEmployeePickerOpen(true)}
                        placeholder="Search employee name or code"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]"
                      />
                      {employeePickerOpen ? (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {filteredEmployees.length ? filteredEmployees.map((employee) => (
                            <button
                              key={employee.employeeCode}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectEmployee(employee)}
                              className="block w-full px-3 py-2 text-left hover:bg-slate-50"
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
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Department *</span>
                      <select value={form.department} onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <option value="">Select department</option>
                        {(lookups?.departments || []).map((item) => <option key={item} value={item}>{item}</option>)}
                        {form.department && !(lookups?.departments || []).includes(form.department) ? <option value={form.department}>{form.department}</option> : null}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Location</span>
                      <select value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <option value="">Select location</option>
                        {(lookups?.locations || []).map((item) => <option key={item} value={item}>{item}</option>)}
                        {form.location && !(lookups?.locations || []).includes(form.location) ? <option value={form.location}>{form.location}</option> : null}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Project</span>
                      <select value={form.projectCode} onChange={(e) => setForm((prev) => ({ ...prev, projectCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <option value="">Select project</option>
                        {(lookups?.projects || []).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Payment site *</span>
                    <select value={form.paymentSiteCode} onChange={(e) => setForm((prev) => ({ ...prev, paymentSiteCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                      <option value="">Select payment site</option>
                      {(lookups?.paymentSites || []).map((site) => (
                        <option key={site.siteCode} value={site.siteCode}>{site.siteCode} – {site.siteName}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Amount *</span>
                      <input type="number" min="0" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Currency</span>
                      <select value={form.currencyCode} onChange={(e) => setForm((prev) => ({ ...prev, currencyCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <option>NGN</option>
                        <option>USD</option>
                        <option>EUR</option>
                        <option>GBP</option>
                      </select>
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Request title *</span>
                    <select
                      value={form.expenseCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        const match = lookups?.expenseCodes.find((item) => item.expenseCode === code);
                        setForm((prev) => ({
                          ...prev,
                          expenseCode: code,
                          title: match?.label || '',
                        }));
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    >
                      <option value="">Select expense / request title</option>
                      {(lookups?.expenseCodes || []).map((item) => (
                        <option key={item.expenseCode} value={item.expenseCode}>{item.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Business justification *</span>
                    <textarea value={form.businessJustification} onChange={(e) => setForm((prev) => ({ ...prev, businessJustification: e.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#DBEAFE]" />
                  </label>
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
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Currency</span>
                      <select value={form.currencyCode} onChange={(e) => setForm((prev) => ({ ...prev, currencyCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <option>NGN</option>
                        <option>USD</option>
                        <option>EUR</option>
                        <option>GBP</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Supplier code</span>
                      <input value={form.beneficiaryCode} onChange={(e) => setForm((prev) => ({ ...prev, beneficiaryCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Supplier name *</span>
                      <input value={form.beneficiaryName} onChange={(e) => setForm((prev) => ({ ...prev, beneficiaryName: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Invoice number *</span>
                      <input value={form.invoiceNumber} onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Purchase order</span>
                      <input value={form.purchaseOrderNo} onChange={(e) => setForm((prev) => ({ ...prev, purchaseOrderNo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">VAT</span>
                      <input type="number" value={form.vatAmount} onChange={(e) => setForm((prev) => ({ ...prev, vatAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">WHT</span>
                      <input type="number" value={form.whtAmount} onChange={(e) => setForm((prev) => ({ ...prev, whtAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Retention</span>
                      <input type="number" value={form.retentionAmount} onChange={(e) => setForm((prev) => ({ ...prev, retentionAmount: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Department</span>
                      <select value={form.department} onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <option value="">Select department</option>
                        {(lookups?.departments || []).map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">Project</span>
                      <select value={form.projectCode} onChange={(e) => setForm((prev) => ({ ...prev, projectCode: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                        <option value="">Select project</option>
                        {(lookups?.projects || []).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={form.submit} onChange={(e) => setForm((prev) => ({ ...prev, submit: e.target.checked }))} className="rounded border-slate-300 text-[#008FD5]" />
                Submit for approval now
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setComposerOpen(false)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700">Cancel</button>
                <button type="button" disabled={busy} onClick={() => void submitRequest()} className="rounded-xl bg-[#008FD5] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? 'Saving…' : form.submit ? 'Submit request' : 'Save draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
