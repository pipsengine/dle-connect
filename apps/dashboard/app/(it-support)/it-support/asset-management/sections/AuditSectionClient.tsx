'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ItAuditLogRecord } from '@/lib/it-asset-management-store';
import { fetchAssetSection } from '../lib/asset-management-api';
import { AssetManagementShell } from '../AssetManagementShell';
import { ErrorBanner, PaginationBar, SectionToolbar } from '../components/AssetManagementShared';

type AuditPayload = { auditLog: ItAuditLogRecord[]; pagination: { page: number; pageSize: number; total: number } };

export function AuditSectionClient() {
  const [rows, setRows] = useState<ItAuditLogRecord[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAssetSection<AuditPayload>('audit', { page, pageSize: 25 });
      setRows(data.auditLog || []);
      setPagination(data.pagination || { page, pageSize: 25, total: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load audit log.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AssetManagementShell title="Audit Log" description="Immutable activity log for IT asset management operations.">
      <ErrorBanner message={error} />
      <SectionToolbar loading={loading} onRefresh={() => void load()} />
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.auditId} className="border-b border-slate-50">
                <td className="px-3 py-2 text-slate-500">{row.createdAt}</td>
                <td className="px-3 py-2">{row.actor || '—'}</td>
                <td className="px-3 py-2">{row.entityType} / {row.entityId}</td>
                <td className="px-3 py-2 font-medium">{row.action}</td>
                <td className="px-3 py-2 text-slate-600">{row.details || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar pagination={pagination} onPageChange={setPage} />
      </div>
    </AssetManagementShell>
  );
}
