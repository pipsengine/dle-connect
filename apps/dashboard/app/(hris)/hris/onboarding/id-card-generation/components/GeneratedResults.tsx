"use client";

import { CheckCircle2, Download } from 'lucide-react';
import { fullName } from '../lib/employees';
import { downloadBlob, type ExportFormat, type Sheet } from '../lib/export';

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export function GeneratedResults({ results, format, onDownloadAll }: { results: Sheet[]; format: ExportFormat; onDownloadAll: () => void }) {
  const bundle = results.length > 1 && format !== 'pdf' ? 'ZIP' : format.toUpperCase();
  const cards = results.reduce((n, s) => n + s.employees.length, 0);
  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-emerald-50 border-b border-emerald-100 px-6 py-4">
        <div className="flex items-center gap-3.5">
          <CheckCircle2 className="w-9 h-9 text-white fill-emerald-500 shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">ID Cards Generated Successfully!</p>
            <p className="text-sm text-emerald-800">
              {cards} ID card{cards === 1 ? '' : 's'} on {results.length} A4 page{results.length === 1 ? '' : 's'} ({format.toUpperCase()}), up to 4 per page.
            </p>
          </div>
        </div>
        <button
          onClick={onDownloadAll}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download All
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">{bundle}</span>
        </button>
      </div>

      <div className="px-6 py-5">
        <h3 className="font-semibold text-slate-900 mb-3">Generated Pages</h3>
        <ul className="space-y-3 max-h-[340px] overflow-y-auto">
          {results.map((s) => (
            <li key={s.page} className="group flex items-center gap-3.5 rounded-xl border border-slate-200 p-2.5 hover:border-slate-300 hover:shadow-sm transition">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL thumbnail */}
              <img src={s.thumbUrl} alt={`Page ${s.page} preview`} className="h-[76px] w-auto rounded-md shrink-0 ring-1 ring-slate-200" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  Page {s.page}
                  <span className="font-normal text-slate-500">
                    {' '}
                    · {s.employees.length} card{s.employees.length === 1 ? '' : 's'}
                  </span>
                </p>
                <p className="text-sm text-slate-500 truncate" title={s.employees.map(fullName).join(', ')}>
                  {s.employees.map(fullName).join(', ')}
                </p>
                <p className="text-xs text-slate-400">
                  {format.toUpperCase()} · {formatSize(s.blob.size)}
                </p>
              </div>
              <button
                onClick={() => downloadBlob(s.blob, s.filename)}
                className="p-2.5 rounded-lg border border-slate-200 text-slate-600 group-hover:text-[#1c1b46] group-hover:border-[#1c1b46]/30 hover:bg-slate-50 shrink-0 transition"
                aria-label={`Download page ${s.page}`}
                title={`Download ${s.filename}`}
              >
                <Download className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
