'use client';

import { useMemo, useState } from 'react';
import {
  Banknote,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Loader2,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EssEmployeeReport, EssReportDownloadTile } from '@/lib/ess-portal-derived-data';
import { EssCard, EssEmptyState, EssSectionHeader } from './ess-portal-ui';

export type EssReportsPayload = {
  generatedAt?: string;
  reports?: EssEmployeeReport[];
  reportDownloads?: EssReportDownloadTile[];
  employee?: {
    fullName?: string;
    department?: string;
    employeeCode?: string;
  };
};

const tileIcon = (id: string): LucideIcon => {
  if (id.includes('leave')) return FileText;
  if (id.includes('payroll')) return Banknote;
  if (id.includes('training')) return GraduationCap;
  return WalletCards;
};

const statusTone = (status: string) => {
  if (status === 'Ready') return 'text-[#16A34A]';
  return 'text-[#94A3B8]';
};

const defaultFormatForReport = (report: Pick<EssEmployeeReport, 'format' | 'id'>) => {
  if (/excel/i.test(report.format) && !/pdf/i.test(report.format)) return 'excel';
  if (/pdf/i.test(report.format) && !/excel/i.test(report.format)) return 'pdf';
  return 'excel';
};

export function EssReportsView({ payload, locale = 'en-NG' }: { payload: EssReportsPayload | null; locale?: string }) {
  const reports = payload?.reports || [];
  const downloads = payload?.reportDownloads || [];
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const readyCount = useMemo(() => reports.filter((item) => item.status === 'Ready').length, [reports]);

  const handleDownload = async (reportId: string, format: string) => {
    setDownloadingId(reportId);
    setDownloadError('');
    try {
      const params = new URLSearchParams({ report: reportId, format });
      const res = await fetch(`/api/workforce-portal?${params.toString()}`, {
        headers: { 'x-ess-locale': locale },
        cache: 'no-store',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match?.[1] || `ess-report-${reportId}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download report.');
    } finally {
      setDownloadingId('');
    }
  };

  if (!payload) {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <EssCard key={index} className="p-6">
            <div className="h-6 w-40 animate-pulse rounded-lg bg-[#E2E8F0]" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-[14px] bg-[#F1F5F9]" />
              ))}
            </div>
          </EssCard>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {downloadError ? (
        <div className="rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#B91C1C]">
          {downloadError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="My Reports"
              action={
                <span className="rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1 text-[11px] font-bold text-[#047857]">
                  {readyCount} ready
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">
              Personal HRIS statements generated from your live leave, payroll, training, and claim records.
            </p>
          </div>
          <div className="space-y-3 p-5">
            {reports.length ? (
              reports.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.status !== 'Ready' || downloadingId === item.id}
                  onClick={() => void handleDownload(item.id, defaultFormatForReport(item))}
                  className="flex w-full items-center justify-between gap-4 rounded-[14px] border border-[#BBF7D0] bg-[#ECFDF5] px-4 py-4 text-left transition hover:border-[#86EFAC] hover:bg-[#D1FAE5] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold text-[#0F172A]">{item.title}</p>
                    <p className="mt-1 text-[12px] font-medium text-[#64748B]">{item.format}</p>
                    {item.recordCount > 0 ? (
                      <p className="mt-1 text-[11px] font-semibold text-[#94A3B8]">
                        {item.recordCount} record{item.recordCount === 1 ? '' : 's'}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {downloadingId === item.id ? <Loader2 className="h-4 w-4 animate-spin text-[#16A34A]" /> : null}
                    <span className={`text-[13px] font-bold ${statusTone(item.status)}`}>{item.status}</span>
                  </div>
                </button>
              ))
            ) : (
              <EssEmptyState
                icon={FileSpreadsheet}
                title="No reports available"
                description="Your personal reports will appear here once HRIS records are available for export."
              />
            )}
          </div>
        </EssCard>

        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader title="Report Downloads" />
            <p className="mt-1 text-[12px] text-[#64748B]">
              Quick export tiles for the most common employee statements and registers.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {downloads.length ? (
              downloads.map((item) => {
                const Icon = tileIcon(item.id);
                const busy = downloadingId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.status !== 'Ready' || busy}
                    onClick={() => void handleDownload(item.id, defaultFormatForReport({ id: item.id, format: item.format }))}
                    className="group flex min-h-[132px] flex-col justify-between rounded-[16px] border border-transparent p-4 text-left shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: item.bg }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/80 shadow-sm"
                        style={{ color: item.accent }}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.2} />
                      </span>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: item.accent }} /> : <Download className="h-4 w-4 opacity-0 transition group-hover:opacity-100" style={{ color: item.accent }} />}
                    </div>
                    <div>
                      <p className="text-[15px] font-bold capitalize text-[#0F172A]">{item.title}</p>
                      <p className="mt-1 text-[12px] font-semibold" style={{ color: item.accent }}>
                        {item.format}
                      </p>
                      <p className={`mt-2 text-[11px] font-bold ${statusTone(item.status)}`}>{item.status}</p>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="sm:col-span-2">
                <EssEmptyState
                  icon={Download}
                  title="No download tiles"
                  description="Report downloads become available when your HRIS profile has exportable records."
                />
              </div>
            )}
          </div>
        </EssCard>
      </div>
    </div>
  );
}
