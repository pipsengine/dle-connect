'use client';

import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BookOpen,
  Clock3,
  FileArchive,
  FileBadge,
  FileText,
  Filter,
  Fingerprint,
  GraduationCap,
  IdCard,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EssDocumentGovernanceRow, EssEmployeeDocument } from '@/lib/ess-portal-derived-data';
import { EssCard, EssEmptyState, EssKpiCard, EssSectionHeader } from './ess-portal-ui';

export type EssDocumentsPayload = {
  generatedAt?: string;
  documents?: EssEmployeeDocument[];
  documentGovernance?: EssDocumentGovernanceRow[];
  employee?: {
    fullName?: string;
    department?: string;
    employeeCode?: string;
  };
};

const formatDate = (value?: string | null) => {
  if (!value || value === '—') return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const formatFileSize = (bytes?: number) => {
  const size = Number(bytes || 0);
  if (size <= 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const categoryIcon = (category: string, title: string): { icon: LucideIcon; bg: string; color: string } => {
  const text = `${category} ${title}`.toLowerCase();
  if (/passport|national id|nin|identity/.test(text)) return { icon: IdCard, bg: '#EFF6FF', color: '#2563EB' };
  if (/license|licence|driver|driving/.test(text)) return { icon: Fingerprint, bg: '#F5F3FF', color: '#7C3AED' };
  if (/certificate|certification|training|course|hse/.test(text)) return { icon: GraduationCap, bg: '#ECFEFF', color: '#0891B2' };
  if (/policy|handbook|hr/.test(text)) return { icon: BookOpen, bg: '#FFF7ED', color: '#EA580C' };
  if (/contract|letter|employment/.test(text)) return { icon: FileBadge, bg: '#ECFDF5', color: '#047857' };
  return { icon: FileText, bg: '#F1F5F9', color: '#475569' };
};

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (/current|verified|acknowledged/.test(value)) return 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]';
  if (/pending|uploaded|review/.test(value)) return 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]';
  if (/expired|rejected/.test(value)) return 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]';
  return 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]';
};

const acknowledgementTone = (value: string) => {
  const text = value.toLowerCase();
  if (/acknowledged|on record/.test(text)) return 'text-[#047857]';
  if (/pending/.test(text)) return 'text-[#B45309]';
  if (/expired|rejected/.test(text)) return 'text-[#B91C1C]';
  return 'text-[#64748B]';
};

export function EssDocumentsView({
  payload,
  onNavigate,
}: {
  payload: EssDocumentsPayload | null;
  onNavigate?: (tab: string) => void;
}) {
  const documents = payload?.documents || [];
  const governance = payload?.documentGovernance || [];
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(documents.map((doc) => doc.category).filter(Boolean)));
    return ['All', ...unique.sort((a, b) => a.localeCompare(b))];
  }, [documents]);

  const metrics = useMemo(() => {
    const current = documents.filter((doc) => /current|verified/i.test(doc.status)).length;
    const pending = documents.filter((doc) => /pending|uploaded/i.test(doc.status)).length;
    const expiring = documents.filter((doc) => {
      if (!doc.expiresAt) return false;
      const days = (new Date(doc.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 60;
    }).length;
    const pendingAck = governance.filter((row) => /pending/i.test(row.acknowledgement)).length;
    return { total: documents.length, current, pending, expiring, pendingAck };
  }, [documents, governance]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (categoryFilter !== 'All' && doc.category !== categoryFilter) return false;
      if (!needle) return true;
      return [doc.title, doc.category, doc.status, doc.version].join(' ').toLowerCase().includes(needle);
    });
  }, [categoryFilter, documents, query]);

  const selected = filtered.find((doc) => doc.id === selectedId) || documents.find((doc) => doc.id === selectedId) || null;
  const selectedGovernance = governance.find((row) => row.documentId === selected?.id) || null;
  const loadedLabel = payload?.generatedAt
    ? new Date(payload.generatedAt).toLocaleString('en-GB', { timeZone: 'UTC', hour12: false }) + ' UTC'
    : '—';

  if (!payload) {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
        <EssCard className="p-6">
          <div className="h-6 w-48 animate-pulse rounded-lg bg-[#E2E8F0]" />
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-[16px] bg-[#F1F5F9]" />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-[16px] bg-[#F1F5F9]" />
            ))}
          </div>
        </EssCard>
        <EssCard className="p-6">
          <div className="h-6 w-56 animate-pulse rounded-lg bg-[#E2E8F0]" />
          <div className="mt-6 space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-[14px] bg-[#F1F5F9]" />
            ))}
          </div>
        </EssCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[#64748B]">Employee document workspace</p>
          <p className="mt-0.5 text-[12px] text-[#94A3B8]">HRIS-sourced files for {payload.employee?.fullName || 'signed-in employee'} · Last synced {loadedLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate?.('services')}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[12px] font-bold text-[#2563EB] shadow-sm transition hover:border-[#BFDBFE] hover:bg-[#EFF6FF]"
        >
          <Upload className="h-4 w-4" />
          Request document upload
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EssKpiCard label="Documents on file" value={String(metrics.total)} subtitle="Live HRIS records" icon={FileArchive} accent="#2563EB" iconBg="#EFF6FF" />
        <EssKpiCard label="Current / verified" value={String(metrics.current)} subtitle="Ready for compliance" icon={BadgeCheck} accent="#047857" iconBg="#ECFDF5" />
        <EssKpiCard label="Pending review" value={String(metrics.pending)} subtitle="Awaiting HR verification" icon={Clock3} accent="#B45309" iconBg="#FFFBEB" />
        <EssKpiCard label="Acknowledgement queue" value={String(metrics.pendingAck)} subtitle={metrics.expiring > 0 ? `${metrics.expiring} expiring within 60 days` : 'Governance tracking'} icon={ShieldCheck} accent="#7C3AED" iconBg="#F5F3FF" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader
              title="Document Management"
              action={
                <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1 text-[11px] font-bold text-[#2563EB]">
                  {filtered.length} shown
                </span>
              }
            />
            <p className="mt-1 text-[12px] text-[#64748B]">
              Personal HR documents, certificates, and compliance files stored against your employee record.
            </p>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search documents, categories, status..."
                  className="h-11 w-full rounded-[12px] border border-[#E2E8F0] bg-white pl-10 pr-10 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
                  aria-label="Search documents"
                />
                {query ? (
                  <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]" aria-label="Clear search">
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Filter className="hidden h-4 w-4 text-[#94A3B8] sm:block" />
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="h-11 min-w-[160px] rounded-[12px] border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB]"
                  aria-label="Filter by category"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.slice(0, 6).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                    categoryFilter === category
                      ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]'
                      : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1]'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {filtered.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((doc) => {
                  const visual = categoryIcon(doc.category, doc.title);
                  const Icon = visual.icon;
                  const active = selectedId === doc.id;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setSelectedId(doc.id)}
                      className={`group rounded-[16px] border p-4 text-left transition duration-200 hover:-translate-y-px hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${
                        active ? 'border-[#2563EB] bg-[#F8FBFF] shadow-[0_0_0_3px_rgba(37,99,235,0.12)]' : 'border-[#E9EEF5] bg-[#FCFDFF]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: visual.bg, color: visual.color }}>
                          <Icon className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusTone(doc.status)}`}>
                          {doc.status}
                        </span>
                      </div>
                      <p className="mt-4 line-clamp-2 text-[14px] font-bold leading-snug text-[#0F172A]">{doc.title}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#64748B]">
                        {doc.category} · {doc.version}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-[#94A3B8]">
                        <span>{formatDate(doc.uploadedAt)}</span>
                        <span>{formatFileSize(doc.sizeBytes)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EssEmptyState
                icon={FileArchive}
                title={documents.length ? 'No documents match your filters' : 'No documents on file'}
                description={
                  documents.length
                    ? 'Try a different search term or category filter to locate the document you need.'
                    : 'Your HR documents will appear here once they are uploaded and linked to your employee record in the HRIS.'
                }
              />
            )}
          </div>
        </EssCard>

        <EssCard className="overflow-hidden">
          <div className="border-b border-[#E9EEF5] px-6 py-5">
            <EssSectionHeader title="Versioning, Access & Acknowledgement" />
            <p className="mt-1 text-[12px] text-[#64748B]">
              Governance trail for document versions, access scope, and acknowledgement status.
            </p>
          </div>

          <div className="max-h-[720px] space-y-3 overflow-auto p-5">
            {selected ? (
              <div className="rounded-[14px] border border-[#BFDBFE] bg-[#EFF6FF] p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#2563EB]">Selected document</p>
                <p className="mt-2 text-[14px] font-bold text-[#0F172A]">{selected.title}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-[10px] bg-white/80 px-3 py-2">
                    <p className="text-[#94A3B8]">Version</p>
                    <p className="mt-0.5 font-semibold text-[#0F172A]">{selected.version}</p>
                  </div>
                  <div className="rounded-[10px] bg-white/80 px-3 py-2">
                    <p className="text-[#94A3B8]">Access</p>
                    <p className="mt-0.5 font-semibold text-[#0F172A]">{selected.accessScope || 'Employee (self-service)'}</p>
                  </div>
                  <div className="rounded-[10px] bg-white/80 px-3 py-2">
                    <p className="text-[#94A3B8]">Acknowledgement</p>
                    <p className={`mt-0.5 font-semibold ${acknowledgementTone(selectedGovernance?.acknowledgement || selected.acknowledgement || 'Pending')}`}>
                      {selectedGovernance?.acknowledgement || selected.acknowledgement || 'Pending'}
                    </p>
                  </div>
                  <div className="rounded-[10px] bg-white/80 px-3 py-2">
                    <p className="text-[#94A3B8]">Expires</p>
                    <p className="mt-0.5 font-semibold text-[#0F172A]">{formatDate(selected.expiresAt)}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {governance.length ? (
              governance.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.documentId)}
                  className={`w-full rounded-[14px] border px-4 py-3 text-left transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC] ${
                    selectedId === row.documentId ? 'border-[#2563EB] bg-[#F8FBFF]' : 'border-[#E9EEF5] bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#0F172A]">{row.title}</p>
                      <p className="mt-1 text-[11px] text-[#64748B]">{row.category} · {row.version}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone(row.status)}`}>
                      {row.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <p className="text-[#94A3B8]">Access scope</p>
                      <p className="mt-0.5 font-semibold text-[#475569]">{row.accessScope}</p>
                    </div>
                    <div>
                      <p className="text-[#94A3B8]">Acknowledgement</p>
                      <p className={`mt-0.5 font-semibold ${acknowledgementTone(row.acknowledgement)}`}>{row.acknowledgement}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] font-medium text-[#94A3B8]">Last updated {formatDate(row.lastUpdated)}</p>
                </button>
              ))
            ) : (
              <EssEmptyState
                icon={ShieldCheck}
                title="No governance records"
                description="Versioning, access, and acknowledgement details will appear here once documents are available in the HRIS."
              />
            )}
          </div>
        </EssCard>
      </div>
    </div>
  );
}
