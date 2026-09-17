'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { DepartmentLookup, EmployeeLookup, LocationLookup, ProjectLookup } from './proc-lookups';
import { LineItemsEditor } from './LineItemsEditor';
import {
  PROCUREMENT_CURRENCIES,
  PROCUREMENT_PRIORITIES,
  PROCUREMENT_REQUEST_TYPES,
  PROCUREMENT_SITES,
  linesTotal,
  type ProcLineItem,
} from '@/lib/procurement/catalog';
import type { PrAttachment } from '@/lib/procurement/pr-attachment-storage';
import type { PrImportResult } from '@/lib/procurement/pr-line-import';
import {
  FilterBar,
  KpiCard,
  PaginationFooter,
  PersonCell,
  ProcModal,
  RegisterTable,
  StatusBadge,
  exportCsv,
  formatDate,
  formatWhen,
  inputClass,
  labelClass,
  moneyPlain,
  primaryBtnClass,
  secondaryBtnClass,
  selectClass,
  toDateInput,
} from './proc-ui';

export type PurchaseRequisitionRow = {
  prId: string;
  title: string;
  description: string | null;
  department: string | null;
  project: string | null;
  requesterName: string | null;
  status: string;
  currency: string | null;
  estimatedAmount: number | null;
  requiredDate: string | null;
  currentWith: string | null;
  requestType?: string | null;
  costCentre?: string | null;
  budgetLine?: string | null;
  businessJustification?: string | null;
  deliveryLocation?: string | null;
  location?: string | null;
  site?: string | null;
  priority?: string | null;
  attachments?: PrAttachment[];
  updatedAt: string;
  lines?: Array<{
    lineId?: string;
    description: string;
    specification?: string | null;
    itemCode?: string | null;
    qty?: number;
    quantity?: number;
    uom?: string | null;
    unitEstimate?: number | null;
    unitPrice?: number;
    taxRate?: number;
    requiredDate?: string | null;
  }>;
};

const PR_STATUSES = ['Draft', 'Submitted', 'Under Approval', 'Returned', 'Approved', 'Rejected', 'Processing', 'Closed', 'Cancelled'] as const;

type PrForm = {
  prId?: string;
  title: string;
  department: string;
  project: string;
  requesterName: string;
  status: string;
  currency: string;
  estimatedAmount: string;
  requiredDate: string;
  currentWith: string;
  requestType: string;
  costCentre: string;
  budgetLine: string;
  businessJustification: string;
  location: string;
  site: string;
  priority: string;
};

const emptyForm = (): PrForm => ({
  title: '',
  department: '',
  project: '',
  requesterName: '',
  status: 'Draft',
  currency: 'NGN',
  estimatedAmount: '',
  requiredDate: '',
  currentWith: '',
  requestType: 'Goods',
  costCentre: '',
  budgetLine: '',
  businessJustification: '',
  location: '',
  site: '',
  priority: 'Medium',
});

const emptyLine = (): ProcLineItem => ({
  id: crypto.randomUUID(),
  description: '',
  quantity: 1,
  uom: 'EA',
  unitPrice: 0,
  taxRate: 0,
});

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Unable to read that file.'));
    reader.readAsDataURL(file);
  });

function statusNorm(s: string) {
  return s.trim().toLowerCase();
}

export function PurchaseRequisitionsClient() {
  const [rows, setRows] = useState<PurchaseRequisitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PrForm>(emptyForm());
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [lines, setLines] = useState<ProcLineItem[]>([]);
  const [attachments, setAttachments] = useState<Array<PrAttachment & { contentBase64?: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await procurementGet<PurchaseRequisitionRow[]>('purchase-requisitions'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase requisitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const count = (pred: (s: string) => boolean) => rows.filter((r) => pred(statusNorm(r.status))).length;
    return {
      total: rows.length,
      draft: count((s) => s === 'draft'),
      submitted: count((s) => s === 'submitted' || s === 'under review' || s === 'under approval'),
      approved: count((s) => s === 'approved'),
      returned: count((s) => s === 'returned'),
      rejected: count((s) => s === 'rejected'),
    };
  }, [rows]);

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const projects = useMemo(
    () => [...new Set(rows.map((r) => r.project).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (deptFilter && r.department !== deptFilter) return false;
      if (projectFilter && r.project !== projectFilter) return false;
      if (statusFilter && statusNorm(r.status) !== statusNorm(statusFilter)) return false;
      if (dateFrom && r.requiredDate && new Date(r.requiredDate) < new Date(dateFrom)) return false;
      if (dateTo && r.requiredDate && new Date(r.requiredDate) > new Date(`${dateTo}T23:59:59`)) return false;
      if (!q) return true;
      return [r.prId, r.title, r.department, r.project, r.requesterName, r.status, r.currentWith, r.site, r.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, deptFilter, projectFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, projectFilter, statusFilter, dateFrom, dateTo, pageSize]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openCreate = () => {
    setForm(emptyForm());
    setLines([emptyLine()]);
    setAttachments([]);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (row: PurchaseRequisitionRow) => {
    setForm({
      prId: row.prId,
      title: row.title,
      department: row.department || '',
      project: row.project || '',
      requesterName: row.requesterName || '',
      status: row.status || 'Draft',
      currency: row.currency || 'NGN',
      estimatedAmount: row.estimatedAmount == null ? '' : String(row.estimatedAmount),
      requiredDate: toDateInput(row.requiredDate),
      currentWith: row.currentWith || '',
      requestType: row.requestType || 'Goods',
      costCentre: row.costCentre || '',
      budgetLine: row.budgetLine || '',
      businessJustification: row.businessJustification || '',
      location: row.location || row.deliveryLocation || '',
      site: row.site || '',
      priority: row.priority || 'Medium',
    });
    setLines(
      (row.lines || []).map((line) => ({
        id: line.lineId || crypto.randomUUID(),
        lineId: line.lineId,
        description: line.description,
        specification: line.specification || undefined,
        itemCode: line.itemCode || undefined,
        quantity: Number(line.quantity ?? line.qty ?? 1),
        uom: line.uom || 'EA',
        unitPrice: Number(line.unitPrice ?? line.unitEstimate ?? 0),
        taxRate: Number(line.taxRate ?? 0),
        requiredDate: line.requiredDate ? String(line.requiredDate).slice(0, 10) : '',
      })),
    );
    setAttachments(row.attachments || []);
    setError('');
    setModalOpen(true);
  };

  const onImported = (result: PrImportResult) => {
    setForm((current) => ({
      ...current,
      title: current.title.trim() || result.meta.suggestedTitle || current.title,
      project: current.project.trim() || result.meta.suggestedProject || current.project,
    }));
  };

  const addAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: Array<PrAttachment & { contentBase64?: string }> = [];
    for (const file of Array.from(files)) {
      if (file.size > 8 * 1024 * 1024) {
        setError(`${file.name} is larger than 8 MB.`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        contentBase64: await fileToBase64(file),
      });
    }
    if (next.length) setAttachments((current) => [...current, ...next]);
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await procurementPost('upsert-pr', {
        payload: {
          prId: form.prId,
          title: form.title.trim(),
          description: null,
          department: form.department.trim() || null,
          project: form.project.trim() || null,
          requesterName: form.requesterName.trim() || null,
          status: form.status,
          currency: form.currency || 'NGN',
          requiredDate: form.requiredDate || null,
          currentWith: form.currentWith.trim() || null,
          requestType: form.requestType || null,
          costCentre: form.costCentre.trim() || null,
          budgetLine: form.budgetLine.trim() || null,
          businessJustification: form.businessJustification.trim() || null,
          location: form.location.trim() || null,
          deliveryLocation: form.location.trim() || null,
          site: form.site || null,
          priority: form.priority,
          estimatedAmount: form.estimatedAmount === '' ? (lines.length ? linesTotal(lines) : null) : Number(form.estimatedAmount),
          attachments,
          lines: lines
            .filter((line) => String(line.description || '').trim())
            .map((line, index) => ({
              lineId: line.lineId,
              description: line.description,
              specification: line.specification || null,
              itemCode: line.itemCode || null,
              qty: line.quantity,
              uom: line.uom,
              unitEstimate: line.unitPrice,
              taxRate: line.taxRate,
              requiredDate: line.requiredDate || null,
              sortOrder: index,
            })),
        },
      });
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Purchase Requisitions</h1>
          <p className="mt-1 text-sm text-slate-600">
            Raise, track and approve purchase requests with project, site, location, Excel/MTO import and line-item detail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={secondaryBtnClass}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button type="button" onClick={openCreate} className={primaryBtnClass}>
            <Plus className="h-4 w-4" /> New Purchase Requisition
          </button>
        </div>
      </div>

      {error && !modalOpen ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Total" value={kpis.total} icon={<FileText className="h-4 w-4" />} />
        <KpiCard label="Draft" value={kpis.draft} icon={<FileText className="h-4 w-4" />} tint="bg-slate-100 text-slate-700" />
        <KpiCard label="Submitted" value={kpis.submitted} icon={<Send className="h-4 w-4" />} tint="bg-amber-50 text-amber-700" />
        <KpiCard label="Approved" value={kpis.approved} icon={<CheckCircle2 className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-700" />
        <KpiCard label="Returned" value={kpis.returned} icon={<RotateCcw className="h-4 w-4" />} tint="bg-orange-50 text-orange-700" />
        <KpiCard label="Rejected" value={kpis.rejected} icon={<XCircle className="h-4 w-4" />} tint="bg-red-50 text-red-700" />
      </div>

      <FilterBar>
        <div className="min-w-[180px] flex-1">
          <label className={labelClass}>Search</label>
          <input className={inputClass} placeholder="PR no, title, requester…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-40">
          <label className={labelClass}>Department</label>
          <select className={selectClass} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className={labelClass}>Project</label>
          <select className={selectClass} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className={labelClass}>Status</label>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {PR_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <label className={labelClass}>From</label>
          <input type="date" className={inputClass} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="w-36">
          <label className={labelClass}>To</label>
          <input type="date" className={inputClass} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </FilterBar>

      <RegisterTable
        title="PR Register"
        count={filtered.length}
        onExport={() =>
          exportCsv(
            'purchase-requisitions.csv',
            ['PR No', 'Title', 'Department', 'Project', 'Site', 'Location', 'Requester', 'Estimate', 'Required', 'Status', 'Current With', 'Updated'],
            filtered.map((r) => [
              r.prId,
              r.title,
              r.department,
              r.project,
              r.site,
              r.location || r.deliveryLocation,
              r.requesterName,
              r.estimatedAmount,
              formatDate(r.requiredDate),
              r.status,
              r.currentWith,
              formatWhen(r.updatedAt),
            ]),
          )
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left">PR No</th>
                    <th className="px-3 py-3 text-left">Request</th>
                    <th className="px-3 py-3 text-left">Dept / Project</th>
                    <th className="px-3 py-3 text-left">Site / Location</th>
                    <th className="px-3 py-3 text-left">Requester</th>
                    <th className="px-3 py-3 text-left">Estimate</th>
                    <th className="px-3 py-3 text-left">Required</th>
                    <th className="px-3 py-3 text-left">Status</th>
                    <th className="px-3 py-3 text-left">Current With</th>
                    <th className="px-3 py-3 text-left">Updated</th>
                    <th className="px-3 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.prId} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <button type="button" className="font-semibold text-blue-600 hover:underline" onClick={() => openEdit(row)}>
                          {row.prId}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">{row.title}</div>
                        {row.lines?.length ? (
                          <div className="mt-0.5 text-xs text-slate-500">{row.lines.length} line item{row.lines.length === 1 ? '' : 's'}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        <div>{row.department || '—'}</div>
                        <div className="text-xs text-slate-500">{row.project || '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        <div>{row.site || '—'}</div>
                        <div className="text-xs text-slate-500">{row.location || row.deliveryLocation || '—'}</div>
                      </td>
                      <td className="px-3 py-3"><PersonCell name={row.requesterName} /></td>
                      <td className="px-3 py-3 tabular-nums text-slate-800">{moneyPlain(row.estimatedAmount, row.currency || 'NGN')}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(row.requiredDate)}</td>
                      <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                      <td className="px-3 py-3 text-slate-700">{row.currentWith || '—'}</td>
                      <td className="px-3 py-3 text-slate-600">{formatWhen(row.updatedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded-md border border-slate-200 p-1.5 hover:bg-white" onClick={() => openEdit(row)} title="View / Edit">
                            <Eye className="h-3.5 w-3.5 text-slate-600" />
                          </button>
                          <button type="button" className="rounded-md border border-slate-200 p-1.5 hover:bg-white" title="More">
                            <MoreHorizontal className="h-3.5 w-3.5 text-slate-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!pageRows.length ? <div className="py-12 text-center text-sm text-slate-500">No purchase requisitions match your filters.</div> : null}
            <PaginationFooter page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </RegisterTable>

      <ProcModal
        open={modalOpen}
        title={form.prId ? `Edit ${form.prId}` : 'New Purchase Requisition'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className={secondaryBtnClass} onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : form.prId ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        {error && modalOpen ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>Title *</label>
            <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Request type</label>
            <select className={selectClass} value={form.requestType} onChange={(e) => setForm((f) => ({ ...f, requestType: e.target.value }))}>
              {PROCUREMENT_REQUEST_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select className={selectClass} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              {PROCUREMENT_PRIORITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <DepartmentLookup value={form.department} onChange={(name) => setForm((f) => ({ ...f, department: name }))} />
          <ProjectLookup value={form.project} onChange={(value) => setForm((f) => ({ ...f, project: value }))} />
          <div>
            <label className={labelClass}>Site</label>
            <select className={selectClass} value={form.site} onChange={(e) => setForm((f) => ({ ...f, site: e.target.value }))}>
              <option value="">Select site</option>
              {PROCUREMENT_SITES.map((site) => (
                <option key={site.code} value={site.code}>
                  {site.code} — {site.name}
                </option>
              ))}
            </select>
          </div>
          <LocationLookup value={form.location} onChange={(name) => setForm((f) => ({ ...f, location: name }))} />
          <EmployeeLookup
            label="Requester"
            value={form.requesterName}
            onChange={(name) => setForm((f) => ({ ...f, requesterName: name }))}
          />
          <div>
            <label className={labelClass}>Status</label>
            <select className={selectClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {PR_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Cost centre</label>
            <input className={inputClass} value={form.costCentre} onChange={(e) => setForm((f) => ({ ...f, costCentre: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Budget line</label>
            <input className={inputClass} value={form.budgetLine} onChange={(e) => setForm((f) => ({ ...f, budgetLine: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Business justification</label>
            <textarea className={`${inputClass} min-h-[80px] py-2`} value={form.businessJustification} onChange={(e) => setForm((f) => ({ ...f, businessJustification: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select className={selectClass} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              {PROCUREMENT_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Estimated amount</label>
            <input type="number" className={inputClass} value={form.estimatedAmount} onChange={(e) => setForm((f) => ({ ...f, estimatedAmount: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Required date</label>
            <input type="date" className={inputClass} value={form.requiredDate} onChange={(e) => setForm((f) => ({ ...f, requiredDate: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Current with</label>
            <input className={inputClass} value={form.currentWith} onChange={(e) => setForm((f) => ({ ...f, currentWith: e.target.value }))} />
          </div>
        </div>
        <div className="mt-6">
          <LineItemsEditor lines={lines} onChange={setLines} onImported={onImported} />
        </div>
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-900">Supporting files</div>
              <p className="text-xs text-slate-500">Upload drawings, quotes or the source MTO. Line detail lives on each item, not a header description.</p>
            </div>
            <label className={secondaryBtnClass}>
              <Upload className="h-4 w-4" /> Upload files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addAttachments(e.target.files);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          {attachments.length ? (
            <ul className="space-y-2">
              {attachments.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs text-slate-500">{file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : ''}</span>
                  </span>
                  <button type="button" className="rounded-md p-1 hover:bg-slate-100" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))} aria-label={`Remove ${file.name}`}>
                    <Trash2 className="h-4 w-4 text-slate-500" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No files attached. Import Excel into line items above, or upload supporting documents here.
            </div>
          )}
        </div>
      </ProcModal>
    </div>
  );
}
