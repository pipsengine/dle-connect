'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, Plus, Upload } from 'lucide-react';
import type { ItAssetDashboardPayload } from '@/lib/it-asset-management-store';
import {
  fetchAssetSection,
  importBundledSoftwareRegister,
  importSoftwareRegisterFile,
  postAssetManagementAction,
} from '../lib/asset-management-api';
import { AssetManagementShell } from '../AssetManagementShell';
import { ErrorBanner, exportAssetSection, PaginationBar, SectionToolbar } from '../components/AssetManagementShared';
import { SoftwareRecordModal, type SoftwareRecordKind } from '../components/SoftwareRecordModal';

type SoftwareSection =
  | 'software'
  | 'licenses'
  | 'software-catalog'
  | 'installed-software'
  | 'license-compliance'
  | 'software-requests';

type Props = {
  title: string;
  section: SoftwareSection;
};

type SectionPayload = ItAssetDashboardPayload & {
  pagination?: { page: number; pageSize: number; total: number };
  filterOptions?: {
    vendors?: string[];
    statuses?: string[];
    categories?: string[];
  };
};

const currency = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);

const number = (value: number) => new Intl.NumberFormat('en-NG').format(value || 0);

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (value.includes('compliance') || value.includes('approved') || value.includes('valid') || value.includes('active')) return 'bg-emerald-50 text-emerald-700';
  if (value.includes('expir')) return 'bg-amber-50 text-amber-700';
  if (value.includes('expired') || value.includes('non-compliant') || value.includes('rejected')) return 'bg-rose-50 text-rose-700';
  if (value.includes('review') || value.includes('open')) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-700';
};

const kindForSection = (section: SoftwareSection): SoftwareRecordKind | null => {
  if (section === 'software-catalog') return 'catalog';
  if (section === 'licenses' || section === 'software' || section === 'license-compliance') return 'license';
  if (section === 'installed-software') return 'installed';
  if (section === 'software-requests') return 'request';
  return null;
};

const apiSectionFor = (section: SoftwareSection) => {
  if (section === 'software') return 'licenses';
  return section;
};

export function SoftwareSectionClient({ title, section }: Props) {
  const [payload, setPayload] = useState<SectionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  const apiSection = apiSectionFor(section);
  const recordKind = kindForSection(section);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAssetSection<SectionPayload>(apiSection, {
        page,
        pageSize: 25,
        search,
        status: status || undefined,
        vendor: vendor || undefined,
      });
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load software records.');
    } finally {
      setLoading(false);
    }
  }, [apiSection, page, search, status, vendor]);

  useEffect(() => { void load(); }, [load]);

  const pagination = payload?.pagination || { page, pageSize: 25, total: 0 };
  const filterOptions = payload?.filterOptions || { vendors: [], statuses: [], categories: [] };

  const licenses = payload?.licenses || [];
  const catalog = payload?.softwareCatalog || [];

  const summary = useMemo(() => {
    if (section === 'software-catalog') {
      return [
        { label: 'Catalog items', value: number(pagination.total || catalog.length) },
        { label: 'Vendors', value: number(new Set(catalog.map((row) => row.vendorName).filter(Boolean)).size) },
        { label: 'Approved', value: number(catalog.filter((row) => row.status === 'Approved').length) },
        { label: 'Annual cost', value: currency(catalog.reduce((sum, row) => sum + (row.annualCost || 0), 0)) },
      ];
    }
    if (section === 'installed-software') {
      const rows = payload?.installedSoftware || [];
      return [
        { label: 'Installations', value: number(pagination.total || rows.length) },
        { label: 'Active', value: number(rows.filter((row) => row.status === 'Active').length) },
        { label: 'Products', value: number(new Set(rows.map((row) => row.productName)).size) },
        { label: 'Linked assets', value: number(rows.filter((row) => row.assetTag).length) },
      ];
    }
    if (section === 'software-requests') {
      const rows = payload?.softwareRequests || [];
      return [
        { label: 'Requests', value: number(pagination.total || rows.length) },
        { label: 'Open', value: number(rows.filter((row) => row.status === 'Open').length) },
        { label: 'High priority', value: number(rows.filter((row) => row.priority === 'High' || row.priority === 'Critical').length) },
        { label: 'Departments', value: number(new Set(rows.map((row) => row.department).filter(Boolean)).size) },
      ];
    }
    const rows = licenses;
    return [
      { label: 'Licenses', value: number(pagination.total || rows.length) },
      { label: 'Seats total', value: number(rows.reduce((sum, row) => sum + (row.seatsTotal || 0), 0)) },
      { label: 'Expiring / alerts', value: number(rows.filter((row) => /expir|non-compliant/i.test(row.complianceStatus || '')).length) },
      { label: 'Annual cost', value: currency(rows.reduce((sum, row) => sum + (row.annualCost || 0), 0)) },
    ];
  }, [section, payload, catalog, licenses, pagination.total]);

  const handleImportBundled = async () => {
    setImporting(true);
    setError('');
    setImportMessage('');
    try {
      const data = await importBundledSoftwareRegister();
      setPayload(data.payload);
      setImportMessage(
        `Imported ${data.result.licensesImported} licenses (${data.result.licensesUpdated} updated) and ${data.result.catalogImported} catalog items (${data.result.catalogUpdated} updated).`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import software register.');
    } finally {
      setImporting(false);
    }
  };

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setError('');
    setImportMessage('');
    try {
      const data = await importSoftwareRegisterFile(file);
      setPayload(data.payload);
      setImportMessage(
        `Uploaded ${data.result.licensesImported + data.result.licensesUpdated} license rows and ${data.result.catalogImported + data.result.catalogUpdated} catalog rows.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload software register.');
    } finally {
      setImporting(false);
    }
  };

  const handleCreate = async (form: Record<string, unknown>) => {
    if (recordKind === 'catalog') await postAssetManagementAction({ action: 'create-software-catalog', catalog: form });
    else if (recordKind === 'license') await postAssetManagementAction({ action: 'create-license', license: form });
    else if (recordKind === 'installed') await postAssetManagementAction({ action: 'create-installed-software', installed: form });
    else if (recordKind === 'request') await postAssetManagementAction({ action: 'create-software-request', request: form });
    await load();
  };

  const empty = !loading && pagination.total === 0 && !licenses.length && !catalog.length
    && !(payload?.installedSoftware?.length || payload?.softwareRequests?.length);

  return (
    <AssetManagementShell title={title} description="Manage enterprise software licenses, catalog, installations, compliance, and requests.">
      <ErrorBanner message={error} />
      {importMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{importMessage}</div> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{loading ? '—' : card.value}</p>
          </div>
        ))}
      </section>

      <SectionToolbar
        title={`${pagination.total || licenses.length || catalog.length || payload?.installedSoftware?.length || payload?.softwareRequests?.length || 0} records`}
        loading={loading}
        onRefresh={() => void load()}
        onExport={() => exportAssetSection(section === 'software' ? 'licenses' : section)}
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${showFilters ? 'border-dle-blue bg-blue-50 text-dle-blue' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
            {(section === 'software-catalog' || section === 'licenses' || section === 'software' || section === 'license-compliance') ? (
              <>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void handleImportBundled()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {importing ? 'Importing...' : 'Import DLE software list'}
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4" />
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => void handleUpload(event.target.files?.[0] || null)}
                  />
                </label>
              </>
            ) : null}
            {recordKind && section !== 'license-compliance' ? (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-dle-blue px-3 py-2 text-xs font-semibold text-white hover:bg-dle-blue-deep"
              >
                <Plus className="h-4 w-4" />
                Add record
              </button>
            ) : null}
          </div>
        )}
      />

      {showFilters ? (
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex min-w-[160px] flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Vendor
            <select value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium normal-case text-slate-800">
              <option value="">All</option>
              {(filterOptions.vendors || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="flex min-w-[160px] flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium normal-case text-slate-800">
              <option value="">All</option>
              {(filterOptions.statuses || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {recordKind ? (
        <SoftwareRecordModal
          open={showModal}
          kind={recordKind}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
        />
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {(section === 'licenses' || section === 'software' || section === 'license-compliance') ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Seats</th>
                  <th className="px-3 py-2">Compliance</th>
                  <th className="px-3 py-2">Expiry</th>
                  <th className="px-3 py-2">Annual Cost</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((row) => (
                  <tr key={row.licenseId} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.productName}</td>
                    <td className="px-3 py-2">{row.vendorName || '—'}</td>
                    <td className="px-3 py-2">{row.licenseType}</td>
                    <td className="px-3 py-2">{row.seatsUsed}/{row.seatsTotal}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(row.complianceStatus)}`}>
                        {row.complianceStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.expiryDate || 'Permanent'}</td>
                    <td className="px-3 py-2">{currency(row.annualCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {section === 'software-catalog' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Edition</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Annual Cost</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((row) => (
                  <tr key={row.catalogId} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.productName}</td>
                    <td className="px-3 py-2">{row.vendorName || '—'}</td>
                    <td className="px-3 py-2">{row.category || '—'}</td>
                    <td className="px-3 py-2">{row.edition || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{currency(row.annualCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {section === 'installed-software' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Asset Tag</th>
                  <th className="px-3 py-2">Installed On</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.installedSoftware || []).map((row) => (
                  <tr key={row.installId} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium">{row.productName}</td>
                    <td className="px-3 py-2">{row.version || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.assetTag || '—'}</td>
                    <td className="px-3 py-2">{row.installedOn || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {section === 'software-requests' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Requester</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Requested</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.softwareRequests || []).map((row) => (
                  <tr key={row.requestId} className="border-b border-slate-50">
                    <td className="px-3 py-2 font-medium">{row.title}</td>
                    <td className="px-3 py-2">{row.requesterName}</td>
                    <td className="px-3 py-2">{row.department || '—'}</td>
                    <td className="px-3 py-2">{row.priority}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.requestedOn || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {empty ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-500">No software records found.</p>
            {(section === 'software-catalog' || section === 'licenses' || section === 'software') ? (
              <button
                type="button"
                disabled={importing}
                onClick={() => void handleImportBundled()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-dle-blue px-4 py-2 text-sm font-semibold text-white hover:bg-dle-blue-deep disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                Import DLE software license list
              </button>
            ) : null}
          </div>
        ) : null}

        <PaginationBar pagination={pagination} onPageChange={setPage} />
      </div>
    </AssetManagementShell>
  );
}
