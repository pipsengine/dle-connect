'use client';

import { Download, ExternalLink, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Attachment } from '@/lib/corporate-office/front-desk-types';

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const FileIcon = ({ type, className = 'h-4 w-4' }: { type: string; className?: string }) =>
  type.startsWith('image/') ? <ImageIcon className={className} /> : <FileText className={className} />;

type Preview = { id: string; status: 'loading' } | { id: string; status: 'ready'; url: string } | { id: string; status: 'missing' };

export function AttachmentViewer({ attachments }: { attachments: Attachment[] }) {
  const [selectedId, setSelectedId] = useState(attachments[0]?.id);
  const [preview, setPreview] = useState<Preview | null>(null);
  const selected = attachments.find((attachment) => attachment.id === selectedId) ?? attachments[0];

  useEffect(() => {
    if (!selected) return;
    let url: string | undefined;
    let cancelled = false;
    setPreview({ id: selected.id, status: 'loading' });
    fetch(`/api/corporate-office/front-desk?resource=attachment&id=${encodeURIComponent(selected.id)}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setPreview({ id: selected.id, status: 'missing' });
          return;
        }
        url = URL.createObjectURL(blob);
        setPreview({ id: selected.id, status: 'ready', url });
      })
      .catch(() => {
        if (!cancelled) setPreview({ id: selected.id, status: 'missing' });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected]);

  if (!attachments.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-400">
        <Paperclip className="h-4 w-4" />
        No documents uploaded.
      </div>
    );
  }

  const ready = preview?.id === selected.id && preview.status === 'ready' ? preview.url : undefined;
  return (
    <div className="space-y-3">
      {attachments.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setSelectedId(attachment.id)}
              className={`flex max-w-[16rem] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${attachment.id === selected.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <FileIcon type={attachment.type} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{attachment.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FileIcon type={selected.type} className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate font-medium text-slate-800">{selected.name}</span>
          <span className="shrink-0 text-xs text-slate-400">{formatBytes(selected.size)}</span>
        </div>
        {ready ? (
          <div className="flex shrink-0 items-center gap-1">
            <a href={ready} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Open in new tab"><ExternalLink className="h-4 w-4" /></a>
            <a href={ready} download={selected.name} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Download"><Download className="h-4 w-4" /></a>
          </div>
        ) : null}
      </div>
      <div className="flex h-[28rem] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {preview?.id === selected.id && preview.status === 'missing' ? (
          <p className="px-6 text-center text-sm text-slate-500">This file is not available in the correspondence store.</p>
        ) : !ready ? (
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
        ) : selected.type.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ready} alt={selected.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <iframe src={ready} title={selected.name} className="h-full w-full bg-white" />
        )}
      </div>
    </div>
  );
}
